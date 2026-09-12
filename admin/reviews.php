<?php
/**
 * admin/reviews.php — إدارة الآراء والتقييمات والاقتراحات
 */
$page_key = 'reviews';
$page_title = 'إدارة الآراء والتقييمات';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/sync_frontend_live.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();

$facultiesList = [
    'كلية العلوم',
    'كلية الهندسة',
    'كلية الأعمال',
    'كلية تكنولوجيا المعلومات',
    'كلية الآداب',
    'كلية الطب',
    'كلية الصيدلة',
    'كلية التمريض',
    'كلية التربية',
    'كلية الحقوق',
    'عام / متطلبات جامعة'
];

$feedbackTypes = [
    'review' => ['label' => '⭐ تقييم وتجربة', 'badge' => 'badge-success'],
    'feedback' => ['label' => '⭐ تقييم وتجربة', 'badge' => 'badge-success'],
    'suggestion' => ['label' => '💡 اقتراح وتطوير', 'badge' => 'badge-role'],
    'collaboration' => ['label' => '💡 اقتراح وتطوير', 'badge' => 'badge-role'],
    'complaint' => ['label' => '⚠️ ملاحظة أو شكوى', 'badge' => 'badge-cancelled'],
    'technical' => ['label' => '⚠️ ملاحظة أو شكوى', 'badge' => 'badge-cancelled'],
    'general' => ['label' => '💬 رسالة عامة', 'badge' => 'badge-subtle'],
];

$statusLabels = [
    'new' => ['label' => 'جديد', 'class' => 'badge-pending'],
    'reviewed' => ['label' => 'تمت المراجعة', 'class' => 'badge-success'],
    'resolved' => ['label' => 'تم الحل', 'class' => 'badge-completed'],
    'archived' => ['label' => 'مؤرشف', 'class' => 'badge-warning'],
];

$flash = null;

// معالجة الإجراءات POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        // 1. إضافة تقييم / شهادة يدوياً
        if ($action === 'create') {
            $studentName = trim($_POST['student_name'] ?? '');
            $studentEmail = trim($_POST['student_email'] ?? '');
            $studentPhone = trim($_POST['student_phone'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $rating = max(1, min(5, (int) ($_POST['rating'] ?? 5)));
            $fbType = $_POST['feedback_type'] ?? 'review';
            $title = trim($_POST['title'] ?? '');
            $content = trim($_POST['content'] ?? '');
            $adminReply = trim($_POST['admin_reply'] ?? '');
            $isApproved = !empty($_POST['is_approved']) ? 1 : 0;
            $isPinned = !empty($_POST['is_pinned']) ? 1 : 0;

            if ($studentName === '' || $content === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال اسم الطالب ونص التقييم أو الملاحظة.'];
            } else {
                $stmt = $db->prepare("INSERT INTO feedback_reviews 
                    (student_name, student_email, student_phone, faculty, rating, feedback_type, title, content, admin_reply, is_approved, is_pinned, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reviewed')");
                $stmt->execute([$studentName, $studentEmail, $studentPhone, $faculty, $rating, $fbType, $title, $content, $adminReply, $isApproved, $isPinned]);
                $newId = $db->lastInsertId();

                if ($isApproved) {
                    sync_reviews_to_firestore($db);
                }

                log_activity("إضافة تقييم/ملاحظة جديدة للطالب \"$studentName\" (#$newId)", 'reviews');
                $flash = ['type' => 'success', 'msg' => 'تمت إضافة التقييم بنجاح ✅'];
            }
        }

        // 2. الرد على الملاحظة أو التقييم
        elseif ($action === 'reply') {
            $id = (int) ($_POST['id'] ?? 0);
            $adminReply = trim($_POST['admin_reply'] ?? '');
            $status = $_POST['status'] ?? 'reviewed';

            $stmt = $db->prepare("UPDATE feedback_reviews SET admin_reply = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$adminReply, $status, $id]);

            log_activity("الرد على تقييم/اقتراح الطالب #$id", 'reviews');
            $flash = ['type' => 'success', 'msg' => 'تم حفظ الرد وتحديث الحالة بنجاح'];
        }

        // 3. تبديل حالة الموافقة والنشر (Approve / Unapprove)
        elseif ($action === 'toggle_approval') {
            $id = (int) ($_POST['id'] ?? 0);
            $statusStmt = $db->prepare("SELECT is_approved FROM feedback_reviews WHERE id = ?");
            $statusStmt->execute([$id]);
            $wasApproved = (int) $statusStmt->fetchColumn();

            $stmt = $db->prepare("UPDATE feedback_reviews SET is_approved = CASE WHEN is_approved = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$id]);

            if ($wasApproved) {
                firestoreDeleteDoc('testimonials', 'rev_' . $id);
            } else {
                sync_reviews_to_firestore($db);
            }

            $flash = ['type' => 'success', 'msg' => 'تم تغيير حالة الظهور في الموقع'];
        }

        // 4. تبديل التثبيت (Pin / Unpin)
        elseif ($action === 'toggle_pin') {
            $id = (int) ($_POST['id'] ?? 0);
            $stmt = $db->prepare("UPDATE feedback_reviews SET is_pinned = CASE WHEN is_pinned = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$id]);

            $flash = ['type' => 'success', 'msg' => 'تم تحديث حالة التثبيت'];
        }

        // 5. حذف
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            archive_delete('feedback_reviews', $id, 'حذف تقييم');
            firestoreDeleteDoc('testimonials', 'rev_' . $id);

            log_activity("حذف التقييم/الملاحظة #$id", 'reviews');
            $flash = ['type' => 'success', 'msg' => 'تم حذف التقييم نهائياً 🗑️'];
        }
    }
}

// الفلاتر
$currentTab = $_GET['tab'] ?? 'all';
$ratingFilter = $_GET['rating'] ?? '';
$approvalFilter = $_GET['approved'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($currentTab === 'reviews') {
    $where[] = "feedback_type IN ('review', 'feedback')";
} elseif ($currentTab === 'suggestions') {
    $where[] = "feedback_type IN ('suggestion', 'collaboration')";
} elseif ($currentTab === 'complaints') {
    $where[] = "feedback_type IN ('complaint', 'technical')";
} elseif ($currentTab === 'general') {
    $where[] = "feedback_type = 'general'";
}

if ($ratingFilter !== '') {
    $where[] = "rating = ?";
    $params[] = (int) $ratingFilter;
}
if ($approvalFilter !== '') {
    $where[] = "is_approved = ?";
    $params[] = (int) $approvalFilter;
}
if ($search !== '') {
    $where[] = "(student_name LIKE ? OR student_email LIKE ? OR title LIKE ? OR content LIKE ? OR admin_reply LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM feedback_reviews" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY is_pinned DESC, created_at DESC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات عامة
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    AVG(rating) AS avg_rating,
    SUM(CASE WHEN is_approved = 1 THEN 1 ELSE 0 END) AS approved_count,
    SUM(CASE WHEN feedback_type IN ('suggestion', 'collaboration') THEN 1 ELSE 0 END) AS suggestions_count,
    SUM(CASE WHEN feedback_type IN ('complaint', 'technical') THEN 1 ELSE 0 END) AS complaints_count,
    SUM(CASE WHEN feedback_type = 'general' THEN 1 ELSE 0 END) AS general_count,
    SUM(CASE WHEN feedback_type IN ('review', 'feedback') THEN 1 ELSE 0 END) AS reviews_count,
    SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count
FROM feedback_reviews")->fetch(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<!-- بطاقات المؤشرات (KPIs) -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي الآراء والتقييمات</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon
                        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">كل أنواع السجلات</span>
            <span>مسجلة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">متوسط تقييم الطلاب</span>
            <div class="stats-icon-box icon-yellow">
                <span style="font-size:18px;">⭐</span>
            </div>
        </div>
        <div class="stats-number" style="color: #ca8a04;">
            <?= number_format((float) ($stats['avg_rating'] ?? 5.0), 1) ?> <span
                style="font-size:16px; color:#94a3b8;">/
                5.0</span>
        </div>
        <div class="stats-footer">
            <span style="color: #ca8a04; font-weight:700;">
                <?php
                $stars = round((float) ($stats['avg_rating'] ?? 5));
                echo str_repeat('★', $stars) . str_repeat('☆', 5 - $stars);
                ?>
            </span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">مفعلة وتظهر في الموقع</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['approved_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">شهادات حقيقية</span>
            <span>معروضة في الرئيسية</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">اقتراحات واردة</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #7e22ce;"><?= number_format($stats['suggestions_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>اقتراحات منفصلة عن الشكاوى</span>
        </div>
    </div>
</div>

<!-- صندوق التقييمات الرئيسي -->
<div class="panel-box">
    <div class="panel-box-header"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="sidebar-logo" style="width: 32px; height: 32px; font-size: 16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon
                        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            </div>
            <h3 class="panel-box-title" style="margin:0;">سجل الآراء والتقييمات والرسائل</h3>
        </div>
        <button type="button" class="btn-primary" onclick="openAddModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إضافة تقييم / شهادة جديدة
        </button>
    </div>

    <!-- تبويبات الفلترة السريعة -->
    <div class="panel-box-body" style="padding: 12px 20px; border-bottom: 1px solid #e2e8f0; background: #fff;">
        <div
            style="display: flex; gap: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px;">
            <a href="?tab=all" class="btn-<?= $currentTab === 'all' ? 'primary' : 'secondary' ?>"
                style="padding: 6px 14px; font-size: 12px; text-decoration:none;">
                كل السجلات (<?= $stats['total'] ?>)
            </a>
            <a href="?tab=reviews" class="btn-<?= $currentTab === 'reviews' ? 'primary' : 'secondary' ?>"
                style="padding: 6px 14px; font-size: 12px; text-decoration:none;">
                ⭐ التقييمات (<?= $stats['reviews_count'] ?>)
            </a>
            <a href="?tab=suggestions" class="btn-<?= $currentTab === 'suggestions' ? 'primary' : 'secondary' ?>"
                style="padding: 6px 14px; font-size: 12px; text-decoration:none;">
                💡 الاقتراحات (<?= $stats['suggestions_count'] ?>)
            </a>
            <a href="?tab=complaints" class="btn-<?= $currentTab === 'complaints' ? 'primary' : 'secondary' ?>"
                style="padding: 6px 14px; font-size: 12px; text-decoration:none;">
                ⚠️ الشكاوى (<?= $stats['complaints_count'] ?>)
            </a>
            <a href="?tab=general" class="btn-<?= $currentTab === 'general' ? 'primary' : 'secondary' ?>"
                style="padding: 6px 14px; font-size: 12px; text-decoration:none;">
                💬 رسائل عامة (<?= $stats['general_count'] ?>)
            </a>
        </div>

        <form method="GET" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <input type="hidden" name="tab" value="<?= htmlspecialchars($currentTab) ?>">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث بالاسم، البريد، العنوان أو النص..." class="form-input" style="width: 100%;">
            </div>
            <div style="min-width: 140px;">
                <select name="rating" class="form-select" onchange="this.form.submit()">
                    <option value="">كل التقييمات</option>
                    <option value="5" <?= $ratingFilter === '5' ? 'selected' : '' ?>>⭐⭐⭐⭐⭐ (5 نجوم)</option>
                    <option value="4" <?= $ratingFilter === '4' ? 'selected' : '' ?>>⭐⭐⭐⭐ (4 نجوم)</option>
                    <option value="3" <?= $ratingFilter === '3' ? 'selected' : '' ?>>⭐⭐⭐ (3 نجوم)</option>
                    <option value="2" <?= $ratingFilter === '2' ? 'selected' : '' ?>>⭐⭐ (نجمتان)</option>
                    <option value="1" <?= $ratingFilter === '1' ? 'selected' : '' ?>>⭐ (نجمة واحدة)</option>
                </select>
            </div>
            <div style="min-width: 140px;">
                <select name="approved" class="form-select" onchange="this.form.submit()">
                    <option value="">كل حالات الظهور</option>
                    <option value="1" <?= $approvalFilter === '1' ? 'selected' : '' ?>>ظاهر في الموقع</option>
                    <option value="0" <?= $approvalFilter === '0' ? 'selected' : '' ?>>مخفي / قيد الانتظار</option>
                </select>
            </div>
            <button type="submit" class="btn-secondary">تصفية</button>
            <?php if ($search !== '' || $ratingFilter !== '' || $approvalFilter !== ''): ?>
                <a href="?tab=<?= htmlspecialchars($currentTab) ?>" class="btn-outline" style="text-decoration:none;">إلغاء
                    الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>الطالب والكلية</th>
                    <th>النوع والتقييم</th>
                    <th>محتوى التقييم / الرسالة</th>
                    <th>رد الإدارة</th>
                    <th style="text-align:center;">الظهور بالموقع</th>
                    <th>التاريخ</th>
                    <th style="text-align: center; width: 140px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($reviews)): ?>
                    <tr>
                        <td colspan="8" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد سجلات مطابقة للشروط.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($reviews as $r):
                    $fType = $feedbackTypes[$r['feedback_type']] ?? $feedbackTypes['general'];
                    ?>
                    <tr style="<?= $r['is_pinned'] ? 'background: #fffbeb;' : '' ?>">
                        <td style="font-family: monospace; color: #94a3b8;">
                            <?php if ($r['is_pinned']): ?>
                                <span title="مثبت في البداية">📌</span>
                            <?php else: ?>
                                #<?= $r['id'] ?>
                            <?php endif; ?>
                        </td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;"><?= htmlspecialchars($r['student_name']) ?></div>
                            <div style="font-size: 11px; color: #64748b;">
                                <?= htmlspecialchars($r['faculty'] ?: 'عام') ?>
                                <?php if (!empty($r['student_phone'])): ?> •
                                    <?= htmlspecialchars($r['student_phone']) ?>     <?php endif; ?>
                            </div>
                        </td>
                        <td>
                            <span class="<?= $fType['badge'] ?>" style="font-size:11px;"><?= $fType['label'] ?></span>
                            <?php if ($r['feedback_type'] === 'review' || $r['rating'] > 0): ?>
                                <div style="color: #f59e0b; font-size: 13px; margin-top: 4px;">
                                    <?= str_repeat('★', (int) $r['rating']) . str_repeat('☆', 5 - (int) $r['rating']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td style="max-width: 320px;">
                            <?php if (!empty($r['title'])): ?>
                                <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px;">
                                    <?= htmlspecialchars($r['title']) ?>
                                </div>
                            <?php endif; ?>
                            <div style="font-size: 12px; color: #334155; line-height: 1.4;">
                                <?= nl2br(htmlspecialchars($r['content'])) ?>
                            </div>
                        </td>
                        <td style="max-width: 240px;">
                            <?php if (!empty($r['admin_reply'])): ?>
                                <div
                                    style="font-size: 12px; color: #0284c7; background: #f0f9ff; padding: 6px 10px; border-radius: 6px; border-right: 3px solid #0284c7;">
                                    💬 <?= htmlspecialchars($r['admin_reply']) ?>
                                </div>
                            <?php else: ?>
                                <span style="color: #94a3b8; font-size: 11px;">لم يتم الرد بعد</span>
                            <?php endif; ?>
                        </td>
                        <td style="text-align: center;">
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                <input type="hidden" name="action" value="toggle_approval">
                                <input type="hidden" name="id" value="<?= $r['id'] ?>">
                                <button type="submit" class="btn-outline"
                                    style="padding: 4px 8px; font-size: 11px; border-color: <?= $r['is_approved'] ? '#bbf7d0' : '#fecaca' ?>; color: <?= $r['is_approved'] ? '#15803d' : '#b91c1c' ?>;">
                                    <?= $r['is_approved'] ? '✓ ظاهر' : '✕ مخفي' ?>
                                </button>
                            </form>
                        </td>
                        <td style="color: #64748b; font-size: 11px; white-space: nowrap;">
                            <?= date('Y/m/d H:i', strtotime($r['created_at'])) ?>
                        </td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                                <!-- زر الرد -->
                                <button type="button" class="btn-primary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openReplyModal(<?= json_encode($r, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="الرد وتعديل الرد">
                                    💬 رد
                                </button>

                                <!-- زر التثبيت -->
                                <form method="POST" style="display:inline;">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="toggle_pin">
                                    <input type="hidden" name="id" value="<?= $r['id'] ?>">
                                    <button type="submit" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;"
                                        title="<?= $r['is_pinned'] ? 'إلغاء التثبيت' : 'تثبيت بالبداية' ?>">
                                        <?= $r['is_pinned'] ? '📌' : '📍' ?>
                                    </button>
                                </form>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل تريد حذف هذا التقييم نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $r['id'] ?>">
                                    <button type="submit" class="btn-danger" style="padding: 4px 8px; font-size: 11px;"
                                        title="حذف">
                                        🗑️
                                    </button>
                                </form>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- Modal: إضافة تقييم جديد -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>إضافة تقييم / شهادة جديدة</h3>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الطالب *</label>
                        <input type="text" name="student_name" class="form-input" required
                            placeholder="مثال: أحمد خليل">
                    </div>
                    <div>
                        <label class="form-label">الكلية</label>
                        <select name="faculty" class="form-select">
                            <?php foreach ($facultiesList as $fac): ?>
                                <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">البريد الإلكتروني</label>
                        <input type="email" name="student_email" class="form-input" placeholder="ahmad@gmail.com">
                    </div>
                    <div>
                        <label class="form-label">رقم الهاتف</label>
                        <input type="text" name="student_phone" class="form-input" placeholder="0791234567">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع المشاركة</label>
                        <select name="feedback_type" class="form-select">
                            <option value="review">⭐ تقييم وتجربة إيجابية</option>
                            <option value="suggestion">💡 اقتراح تحسين</option>
                            <option value="complaint">⚠️ ملاحظة أو شكوى</option>
                            <option value="general">💬 رسالة عامة</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">التقييم بالنجوم</label>
                        <select name="rating" class="form-select">
                            <option value="5">⭐⭐⭐⭐⭐ (5 نجوم - ممتاز)</option>
                            <option value="4">⭐⭐⭐⭐ (4 نجوم - جيد جداً)</option>
                            <option value="3">⭐⭐⭐ (3 نجوم - متوسط)</option>
                            <option value="2">⭐⭐ (نجمتان)</option>
                            <option value="1">⭐ (نجمة واحدة)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">عنوان التقييم</label>
                    <input type="text" name="title" class="form-input" placeholder="مثال: تجربة رائعة مع منسقي الكلية">
                </div>

                <div>
                    <label class="form-label">نص التقييم أو الرسالة *</label>
                    <textarea name="content" class="form-input" rows="3" required
                        placeholder="اكتب نص التقييم أو رسالة الطالب هنا..."></textarea>
                </div>

                <div>
                    <label class="form-label">رد الإدارة (اختياري)</label>
                    <textarea name="admin_reply" class="form-input" rows="2"
                        placeholder="رد الشكر أو الإجابة من فريق مكانك..."></textarea>
                </div>

                <div style="display: flex; gap: 20px; align-items: center;">
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" name="is_approved" value="1" checked>
                        <span>تفعيل وظهور في الموقع مباشرة</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" name="is_pinned" value="1">
                        <span>تثبيت في البداية 📌</span>
                    </label>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ التقييم</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: الرد على الملاحظة -->
<div id="replyModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 550px;">
        <div class="modal-header">
            <h3>الرد على التقييم / الملاحظة</h3>
            <button type="button" class="modal-close" onclick="closeReplyModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="reply">
            <input type="hidden" name="id" id="reply_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-weight: 700; color: #0f172a;" id="reply_student_name"></div>
                    <div style="font-size: 12px; color: #475569; margin-top: 4px;" id="reply_content"></div>
                </div>

                <div>
                    <label class="form-label">نص رد الإدارة *</label>
                    <textarea name="admin_reply" id="reply_admin_text" class="form-input" rows="4" required
                        placeholder="اكتب رد فريق مكانك على الطالب هنا..."></textarea>
                </div>

                <div>
                    <label class="form-label">تحديث حالة الرسالة</label>
                    <select name="status" id="reply_status" class="form-select">
                        <option value="reviewed">تمت المراجعة (Reviewed)</option>
                        <option value="resolved">تم حل المشكلة (Resolved)</option>
                        <option value="archived">أرشفة</option>
                    </select>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeReplyModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ الرد</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() { document.getElementById('addModal').style.display = 'flex'; }
    function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

    function openReplyModal(r) {
        document.getElementById('reply_id').value = r.id;
        document.getElementById('reply_student_name').textContent = r.student_name + (r.faculty ? ' (' + r.faculty + ')' : '');
        document.getElementById('reply_content').textContent = r.content;
        document.getElementById('reply_admin_text').value = r.admin_reply || '';
        document.getElementById('reply_status').value = r.status || 'reviewed';
        document.getElementById('replyModal').style.display = 'flex';
    }
    function closeReplyModal() { document.getElementById('replyModal').style.display = 'none'; }

    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
        if (event.target == document.getElementById('replyModal')) closeReplyModal();
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>