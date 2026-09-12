<?php
/**
 * admin/membership_requests.php — إدارة طلبات الانضمام لفريق التنسيق والتطوع
 */
$page_key = 'membership';
$page_title = 'إدارة طلبات الانضمام';
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

$yearLabels = [
    'first_year' => 'سنة أولى (مستجد)',
    'second_year' => 'سنة ثانية',
    'third_year' => 'سنة ثالثة',
    'fourth_year' => 'سنة رابعة فأكثر',
    'graduate' => 'دراسات عليا / خريج',
];

$statusLabels = [
    'pending' => ['label' => 'قيد الدراسة', 'class' => 'badge-pending'],
    'approved' => ['label' => 'مقبول كمنسق', 'class' => 'badge-success'],
    'interviewed' => ['label' => 'بانتظار المقابلة', 'class' => 'badge-warning'],
    'rejected' => ['label' => 'مرفوض / مستبعد', 'class' => 'badge-cancelled'],
];

$flash = null;

// معالجة الإجراءات POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        // تشغيل أو إيقاف استقبال طلبات الانضمام الجديدة
        if ($action === 'toggle_membership_reception') {
            $receptionEnabled = ($_POST['allow_registration'] ?? '0') === '1' ? '1' : '0';
            $stmt = $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at)
                VALUES ('allow_registration', ?, 'system', CURRENT_TIMESTAMP)
                ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP");
            $stmt->execute([$receptionEnabled]);
            log_activity(($receptionEnabled === '1' ? 'فعّل' : 'أوقف') . ' استقبال طلبات الانضمام الجديدة', 'membership');
            $flash = ['type' => 'success', 'msg' => $receptionEnabled === '1' ? 'تم تشغيل استقبال طلبات الانضمام' : 'تم إيقاف استقبال طلبات الانضمام'];
        }

        // 1. إضافة طلب انضمام يدوي
        elseif ($action === 'create') {
            $name = trim($_POST['applicant_name'] ?? '');
            $phone = trim($_POST['phone'] ?? '');
            $email = trim($_POST['email'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $major = trim($_POST['major'] ?? '');
            $year = $_POST['academic_year'] ?? 'first_year';
            $motivation = trim($_POST['motivation'] ?? '');
            $skills = trim($_POST['skills_experience'] ?? '');
            $status = $_POST['status'] ?? 'pending';
            $notes = trim($_POST['admin_notes'] ?? '');

            if ($name === '' || $phone === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال اسم المتقدم ورقم هاتفه.'];
            } else {
                $stmt = $db->prepare("INSERT INTO membership_requests 
                    (applicant_name, phone, email, faculty, major, academic_year, motivation, skills_experience, status, admin_notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$name, $phone, $email, $faculty, $major, $year, $motivation, $skills, $status, $notes]);
                $newId = $db->lastInsertId();

                log_activity("إضافة طلب انضمام جديد للمتقدم \"$name\" (#$newId)", 'membership');
                $flash = ['type' => 'success', 'msg' => 'تم تسجيل طلب الانضمام بنجاح ✅'];
            }
        }

        // 2. تحديث حالة الطلب
        elseif ($action === 'update_status') {
            $id = (int) ($_POST['id'] ?? 0);
            $status = $_POST['status'] ?? 'pending';
            $notes = trim($_POST['admin_notes'] ?? '');

            $stmt = $db->prepare("UPDATE membership_requests SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$status, $notes, $id]);

            log_activity("تحديث حالة طلب الانضمام #$id إلى ($status)", 'membership');
            $flash = ['type' => 'success', 'msg' => 'تم تحديث حالة الطلب بنجاح'];
        }

        // 3. قبول وترقية فورية إلى منسق رسمي
        elseif ($action === 'promote_to_coordinator') {
            $id = (int) ($_POST['id'] ?? 0);
            $reqStmt = $db->prepare("SELECT * FROM membership_requests WHERE id = ?");
            $reqStmt->execute([$id]);
            $req = $reqStmt->fetch(PDO::FETCH_ASSOC);

            if ($req) {
                // إدراج في جدول coordinators
                $ins = $db->prepare("INSERT INTO coordinators 
                    (name, phone, faculty, major, role_type, bio, is_active, joined_at, notes) 
                    VALUES (?, ?, ?, ?, 'coordinator', ?, 1, CURRENT_DATE, ?)");
                $ins->execute([
                    $req['applicant_name'],
                    $req['phone'],
                    $req['faculty'],
                    $req['major'],
                    $req['motivation'],
                    'تمت الترقية من طلبات الانضمام #' . $id
                ]);
                sync_coordinators_to_firestore($db);

                // تحديث حالة الطلب إلى approved
                $db->prepare("UPDATE membership_requests SET status = 'approved', admin_notes = 'تمت الترقية والإضافة إلى فريق المنسقين الرسمي', updated_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);

                log_activity("قبول المتقدم \"{$req['applicant_name']}\" وترقيته إلى منسق رسمي", 'membership');
                $flash = ['type' => 'success', 'msg' => "تم قبول المتقدم \"{$req['applicant_name']}\" وإضافته لقائمة المنسقين بنجاح 🌟"];
            }
        }

        // 4. حذف طلب
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            archive_delete('membership_requests', $id, 'حذف طلب انضمام');

            log_activity("حذف طلب الانضمام #$id", 'membership');
            $flash = ['type' => 'success', 'msg' => 'تم حذف الطلب نهائياً 🗑️'];
        }
    }
}

// الفلاتر
$statusFilter = $_GET['status'] ?? 'all';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($statusFilter !== 'all') {
    $where[] = "status = ?";
    $params[] = $statusFilter;
}
if ($search !== '') {
    $where[] = "(applicant_name LIKE ? OR phone LIKE ? OR email LIKE ? OR major LIKE ? OR motivation LIKE ? OR skills_experience LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM membership_requests" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY CASE WHEN status='pending' THEN 0 WHEN status='interviewed' THEN 1 ELSE 2 END, created_at DESC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$applications = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_count,
    SUM(CASE WHEN status='interviewed' THEN 1 ELSE 0 END) AS interviewed_count
FROM membership_requests")->fetch(PDO::FETCH_ASSOC);

$registrationSetting = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'allow_registration' LIMIT 1")->fetchColumn();
$registrationEnabled = $registrationSetting === false || $registrationSetting === '1';

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<div
    style="display:flex;align-items:center;gap:16px;margin-bottom:22px;padding:16px 20px;background:<?= $registrationEnabled ? '#f0fdf4' : '#fff7ed' ?>;border:1px solid <?= $registrationEnabled ? '#bbf7d0' : '#fed7aa' ?>;border-radius:12px;">
    <div style="flex:1;">
        <div style="font-size:14px;font-weight:800;color:#0f172a;">استقبال طلبات الانضمام الجديدة</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">يمكنك تشغيل أو إيقاف استقبال الطلبات من الطلاب.</div>
    </div>
    <form method="POST" style="margin:0;">
        <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
        <input type="hidden" name="action" value="toggle_membership_reception">
        <input type="hidden" name="allow_registration" value="<?= $registrationEnabled ? '0' : '1' ?>">
        <button type="submit" class="btn <?= $registrationEnabled ? 'btn-secondary' : 'btn-primary' ?>"
            style="min-width:118px;">
            <?= $registrationEnabled ? '● مفعّل' : '○ متوقف' ?>
        </button>
    </form>
</div>

<!-- بطاقات المؤشرات (KPIs) -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي طلبات الانضمام</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">طلبات مقدمة</span>
            <span>للانضمام لفريق مكانك</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">قيد الدراسة والفرز</span>
            <div class="stats-icon-box icon-yellow">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b45309;"><?= number_format($stats['pending_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span style="color:#b45309; font-weight:700;">بحاجة لمراجعة السيرة الذاتية</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">بانتظار المقابلة</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #7e22ce;"><?= number_format($stats['interviewed_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>تم التنسيق للمقابلة الشخصية</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">مقبولون في الفريق</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['approved_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">منسقون نشطون</span>
        </div>
    </div>
</div>

<!-- صندوق جدول الطلبات الرئيسي -->
<div class="panel-box">
    <div class="panel-box-header"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="sidebar-logo" style="width: 32px; height: 32px; font-size: 16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="19" y1="8" x2="19" y2="14" />
                    <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
            </div>
            <h3 class="panel-box-title" style="margin:0;">طلبات الانضمام لفريق التنسيق الأكاديمي</h3>
        </div>
        <button type="button" class="btn-primary" onclick="openAddModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            تسجيل طلب جديد
        </button>
    </div>

    <!-- شريط الفلاتر والبحث -->
    <div class="panel-box-body" style="border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 16px 20px;">
        <form method="GET" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث باسم المتقدم، الهاتف، البريد، التخصص، أو الدافع..." class="form-input"
                    style="width: 100%;">
            </div>
            <div style="min-width: 150px;">
                <select name="status" class="form-select" onchange="this.form.submit()">
                    <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>كل الحالات</option>
                    <option value="pending" <?= $statusFilter === 'pending' ? 'selected' : '' ?>>قيد الدراسة</option>
                    <option value="interviewed" <?= $statusFilter === 'interviewed' ? 'selected' : '' ?>>بانتظار المقابلة
                    </option>
                    <option value="approved" <?= $statusFilter === 'approved' ? 'selected' : '' ?>>مقبول كمنسق</option>
                    <option value="rejected" <?= $statusFilter === 'rejected' ? 'selected' : '' ?>>مرفوض</option>
                </select>
            </div>
            <button type="submit" class="btn-secondary">تصفية</button>
            <?php if ($search !== '' || $statusFilter !== 'all'): ?>
                <a href="membership_requests.php" class="btn-outline" style="text-decoration:none;">إلغاء الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>اسم المتقدم</th>
                    <th>معلومات الاتصال</th>
                    <th>الكلية والتخصص</th>
                    <th>السنة الدراسية</th>
                    <th>دافع الانضمام والخبرات</th>
                    <th>الحالة</th>
                    <th>تاريخ التقديم</th>
                    <th style="text-align: center; width: 160px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($applications)): ?>
                    <tr>
                        <td colspan="9" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد طلبات انضمام مطابقة للشروط.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($applications as $app):
                    $sBadge = $statusLabels[$app['status']] ?? $statusLabels['pending'];
                    ?>
                    <tr>
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $app['id'] ?></td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;"><?= htmlspecialchars($app['applicant_name']) ?>
                            </div>
                            <?php if (!empty($app['admin_notes'])): ?>
                                <div style="font-size: 11px; color: #0284c7;"
                                    title="<?= htmlspecialchars($app['admin_notes']) ?>">
                                    📝 <?= htmlspecialchars(mb_strimwidth($app['admin_notes'], 0, 30, '...')) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <div style="font-size: 12px; font-weight: 600; color: #0284c7; font-family: monospace;">
                                📞 <?= htmlspecialchars($app['phone']) ?>
                            </div>
                            <?php if (!empty($app['email'])): ?>
                                <div style="font-size: 11px; color: #64748b; font-family: monospace;">
                                    ✉️ <?= htmlspecialchars($app['email']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="badge-faculty"><?= htmlspecialchars($app['faculty'] ?: 'عام') ?></span>
                            <?php if (!empty($app['major'])): ?>
                                <div style="font-size: 11px; color: #475569; margin-top: 2px;">
                                    <?= htmlspecialchars($app['major']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span
                                style="font-size: 12px; color: #334155;"><?= $yearLabels[$app['academic_year']] ?? $app['academic_year'] ?></span>
                        </td>
                        <td style="max-width: 260px;">
                            <?php if (!empty($app['motivation'])): ?>
                                <div style="font-size: 12px; color: #1e293b; line-height: 1.3;">
                                    💬 <?= htmlspecialchars(mb_strimwidth($app['motivation'], 0, 80, '...')) ?>
                                </div>
                            <?php endif; ?>
                            <?php if (!empty($app['skills_experience'])): ?>
                                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                                    🛠️ <?= htmlspecialchars(mb_strimwidth($app['skills_experience'], 0, 60, '...')) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="<?= $sBadge['class'] ?>" style="font-size:11px;"><?= $sBadge['label'] ?></span>
                        </td>
                        <td style="color: #64748b; font-size: 11px; white-space: nowrap;">
                            <?= date('Y/m/d H:i', strtotime($app['created_at'])) ?>
                        </td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                                <!-- زر الترقية إلى منسق رسمي إذا لم يكن معتمداً -->
                                <?php if ($app['status'] !== 'approved'): ?>
                                    <form method="POST" style="display:inline;"
                                        onsubmit="return confirm('هل تريد قبول هذا الطالب وترقيته إلى منسق رسمي في فريق مكانك؟');">
                                        <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                        <input type="hidden" name="action" value="promote_to_coordinator">
                                        <input type="hidden" name="id" value="<?= $app['id'] ?>">
                                        <button type="submit" class="btn-primary"
                                            style="padding: 4px 8px; font-size: 11px; background: #16a34a;" title="ترقية لمنسق">
                                            ✓ قبول
                                        </button>
                                    </form>
                                <?php endif; ?>

                                <!-- زر تعديل الحالة والملاحظات -->
                                <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openReviewModal(<?= json_encode($app, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="مراجعة وتعديل">
                                    👁️ تفاصيل
                                </button>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل تريد حذف هذا الطلب نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $app['id'] ?>">
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

<!-- Modal: تسجيل طلب انضمام يدوي -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>تسجيل طلب انضمام لفريق مكانك</h3>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الطالب الرباعي *</label>
                        <input type="text" name="applicant_name" class="form-input" required
                            placeholder="مثال: أنس عادل الطراونة">
                    </div>
                    <div>
                        <label class="form-label">رقم الهاتف (واتساب) *</label>
                        <input type="text" name="phone" class="form-input" required placeholder="0791234567">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">البريد الإلكتروني الجامعي/الشخصي</label>
                        <input type="email" name="email" class="form-input" placeholder="student@gmail.com">
                    </div>
                    <div>
                        <label class="form-label">الكلية *</label>
                        <select name="faculty" class="form-select">
                            <?php foreach ($facultiesList as $fac): ?>
                                <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">التخصص الدراسي</label>
                        <input type="text" name="major" class="form-input" placeholder="مثال: علم الحاسوب">
                    </div>
                    <div>
                        <label class="form-label">السنة الدراسية</label>
                        <select name="academic_year" class="form-select">
                            <?php foreach ($yearLabels as $yk => $yv): ?>
                                <option value="<?= $yk ?>"><?= $yv ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">دافع الانضمام ورغبة المشاركة</label>
                    <textarea name="motivation" class="form-input" rows="2"
                        placeholder="لماذا ترغب بالانضمام لفريق مكانك..."></textarea>
                </div>

                <div>
                    <label class="form-label">الخبرات والمهارات السابقة</label>
                    <textarea name="skills_experience" class="form-input" rows="2"
                        placeholder="مهارات التصميم، العمل التطوعي، إعداد الملخصات..."></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">حالة الطلب</label>
                        <select name="status" class="form-select">
                            <option value="pending">قيد الدراسة</option>
                            <option value="interviewed">بانتظار المقابلة</option>
                            <option value="approved">مقبول</option>
                            <option value="rejected">مرفوض</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">ملاحظات الإدارة</label>
                        <input type="text" name="admin_notes" class="form-input" placeholder="ملاحظات المنسق...">
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ الطلب</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: مراجعة وتحديث الطلب -->
<div id="reviewModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>تفاصيل ومراجعة طلب الانضمام</h3>
            <button type="button" class="modal-close" onclick="closeReviewModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="update_status">
            <input type="hidden" name="id" id="rev_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h4 style="margin: 0; color: #0f172a;" id="rev_name"></h4>
                        <span id="rev_faculty_badge" class="badge-faculty"></span>
                    </div>
                    <div style="font-size: 12px; color: #0284c7; margin-top: 4px;" id="rev_contact"></div>
                    <div style="font-size: 12px; color: #334155; margin-top: 2px;" id="rev_major_year"></div>

                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
                        <div style="font-size: 12px; font-weight: 700; color: #0f172a;">💬 دافع الانضمام:</div>
                        <div style="font-size: 12px; color: #475569; margin-top: 2px;" id="rev_motivation"></div>
                    </div>

                    <div style="margin-top: 8px;">
                        <div style="font-size: 12px; font-weight: 700; color: #0f172a;">🛠️ المهارات والخبرات:</div>
                        <div style="font-size: 12px; color: #475569; margin-top: 2px;" id="rev_skills"></div>
                    </div>
                </div>

                <div>
                    <label class="form-label">حالة الطلب</label>
                    <select name="status" id="rev_status" class="form-select">
                        <option value="pending">قيد الدراسة والفرز</option>
                        <option value="interviewed">تحديد موعد مقابلة شخصية</option>
                        <option value="approved">مقبول في الفريق ✓</option>
                        <option value="rejected">مرفوض / غير مطابق للشروط</option>
                    </select>
                </div>

                <div>
                    <label class="form-label">ملاحظات وقرار لجنة المقابلة</label>
                    <textarea name="admin_notes" id="rev_notes" class="form-input" rows="3"
                        placeholder="اكتب تقرير المقابلة أو سبب القبول/الرفض..."></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeReviewModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ القرار والملاحظات</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() { document.getElementById('addModal').style.display = 'flex'; }
    function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

    function openReviewModal(app) {
        document.getElementById('rev_id').value = app.id;
        document.getElementById('rev_name').textContent = app.applicant_name;
        document.getElementById('rev_faculty_badge').textContent = app.faculty || 'عام';
        document.getElementById('rev_contact').textContent = '📞 ' + app.phone + (app.email ? ' | ✉️ ' + app.email : '');
        document.getElementById('rev_major_year').textContent = 'التخصص: ' + (app.major || 'غير محدد') + ' | ' + (app.academic_year || '');
        document.getElementById('rev_motivation').textContent = app.motivation || 'لم يُذكر';
        document.getElementById('rev_skills').textContent = app.skills_experience || 'لم تُذكر';
        document.getElementById('rev_status').value = app.status || 'pending';
        document.getElementById('rev_notes').value = app.admin_notes || '';
        document.getElementById('reviewModal').style.display = 'flex';
    }
    function closeReviewModal() { document.getElementById('reviewModal').style.display = 'none'; }

    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
        if (event.target == document.getElementById('reviewModal')) closeReviewModal();
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>