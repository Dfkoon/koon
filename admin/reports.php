<?php
/**
 * admin/reports.php — إدارة البلاغات وتصحيح الأسئلة والمحتوى
 */
$page_key = 'reports';
$page_title = 'إدارة البلاغات والأخطاء';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/sync_frontend_live.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();

// مزامنة حية تلقائية من Firestore عند فتح الصفحة أو عند طلب التحديث
$syncCount = 0;
$doManualSync = isset($_GET['sync']) && $_GET['sync'] === '1';
$lastReportsSync = $_SESSION['last_reports_fs_sync'] ?? 0;

if ($doManualSync || (time() - $lastReportsSync) >= 10) {
    try {
        $syncCount = pull_question_reports_from_firestore($db);
        $_SESSION['last_reports_fs_sync'] = time();
    } catch (Throwable $syncError) {
        // Continue smoothly if network glitch
    }
}

$reportTypes = [
    'wrong_answer' => ['label' => '❌ إجابة نموذجية خاطئة', 'badge' => 'badge-cancelled'],
    'typo' => ['label' => '✏️ خطأ إملائي أو صياغة', 'badge' => 'badge-warning'],
    'broken_image' => ['label' => '🖼️ صورة أو رسم مفقود', 'badge' => 'badge-role'],
    'broken_link' => ['label' => '🔗 رابط معطل أو لا يعمل', 'badge' => 'badge-subtle'],
    'outdated' => ['label' => '⌛ محتوى قديم أو ملغى', 'badge' => 'badge-code'],
    'other' => ['label' => '⚠️ بلاغ عام / آخر', 'badge' => 'badge-pending'],
];

$statusLabels = [
    'pending' => ['label' => 'قيد المتابعة', 'class' => 'badge-pending'],
    'resolved' => ['label' => 'تم الحل والتصحيح', 'class' => 'badge-success'],
    'dismissed' => ['label' => 'مستبعد / غير دقيق', 'class' => 'badge-warning'],
];

$flash = null;
if ($doManualSync) {
    $flash = ['type' => 'success', 'msg' => 'تمت المزامنة الحية مع السحابة وتحديث البلاغات بنجاح ⚡'];
}

// معالجة الإجراءات
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        // 1. تسجيل بلاغ جديد
        if ($action === 'create') {
            $repName = trim($_POST['reporter_name'] ?? '') ?: 'طالب';
            $repCont = trim($_POST['reporter_contact'] ?? '');
            $qTitle = trim($_POST['question_title'] ?? '');
            $qId = trim($_POST['question_id'] ?? '');
            $course = trim($_POST['course_name'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $repType = $_POST['report_type'] ?? 'wrong_answer';
            $reason = trim($_POST['reason'] ?? '');
            $details = trim($_POST['details'] ?? '');
            $status = $_POST['status'] ?? 'pending';

            if ($qTitle === '' || $reason === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال عنوان السؤال أو المشكلة وسبب البلاغ.'];
            } else {
                $stmt = $db->prepare("INSERT INTO question_reports 
                    (reporter_name, reporter_contact, question_title, question_id, course_name, faculty, report_type, reason, details, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$repName, $repCont, $qTitle, $qId, $course, $faculty, $repType, $reason, $details, $status]);
                $newId = $db->lastInsertId();

                log_activity("تسجيل بلاغ جديد حول \"$qTitle\" (#$newId)", 'reports');
                $flash = ['type' => 'success', 'msg' => 'تم تسجيل البلاغ بنجاح ✅'];
            }
        }

        // 2. معالجة وحل البلاغ
        elseif ($action === 'resolve') {
            $id = (int) ($_POST['id'] ?? 0);
            $status = $_POST['status'] ?? 'resolved';
            $resNotes = trim($_POST['resolution_notes'] ?? '');
            $adminUser = $_SESSION['username'] ?? 'المدير العام';

            $getFs = $db->prepare("SELECT firestore_id FROM question_reports WHERE id = ?");
            $getFs->execute([$id]);
            $fsId = (string) $getFs->fetchColumn();

            $stmt = $db->prepare("UPDATE question_reports SET status = ?, resolution_notes = ?, resolved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$status, $resNotes, $adminUser, $id]);

            // مزامنة الحالة مع السحابة في الوقت الفعلي
            if ($fsId !== '') {
                update_question_report_in_firestore($fsId, $status, $resNotes, $adminUser);
            }

            log_activity("معالجة وتحديث حالة البلاغ #$id إلى ($status)", 'reports');
            $flash = ['type' => 'success', 'msg' => 'تم تحديث حالة البلاغ ومزامنته مع السحابة بنجاح ✅'];
        }

        // 3. حذف بلاغ
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);

            $getFs = $db->prepare("SELECT firestore_id FROM question_reports WHERE id = ?");
            $getFs->execute([$id]);
            $fsId = (string) $getFs->fetchColumn();

            archive_delete('question_reports', $id, 'حذف بلاغ');

            if ($fsId !== '') {
                delete_question_report_in_firestore($fsId);
            }

            log_activity("حذف البلاغ #$id", 'reports');
            $flash = ['type' => 'success', 'msg' => 'تم حذف البلاغ نهائياً 🗑️'];
        }
    }
}

// الفلاتر
$statusFilter = $_GET['status'] ?? 'all';
$typeFilter = $_GET['type'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($statusFilter !== 'all') {
    $where[] = "status = ?";
    $params[] = $statusFilter;
}
if ($typeFilter !== '') {
    $where[] = "report_type = ?";
    $params[] = $typeFilter;
}
if ($search !== '') {
    $where[] = "(question_title LIKE ? OR course_name LIKE ? OR reporter_name LIKE ? OR reason LIKE ? OR details LIKE ? OR resolution_notes LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM question_reports" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END, created_at DESC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$reports = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN status='resolved' THEN 1 ELSE 0 END) AS resolved_count,
    SUM(CASE WHEN status='dismissed' THEN 1 ELSE 0 END) AS dismissed_count
FROM question_reports")->fetch(PDO::FETCH_ASSOC);

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
            <span class="stats-card-title">إجمالي البلاغات الواردة</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">بلاغات مسجلة</span>
            <span>عن المحتوى والأسئلة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">قيد المتابعة والتحقق</span>
            <div class="stats-icon-box icon-red">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b91c1c;"><?= number_format($stats['pending_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span style="color:#b91c1c; font-weight:700;">بحاجة لتصحيح عاجل</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">تم التصحيح والحل</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['resolved_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">تم التعديل والتحديث</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">مستبعدة / غير دقيقة</span>
            <div class="stats-icon-box icon-yellow">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b45309;"><?= number_format($stats['dismissed_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>تم التحقق وصحة السؤال</span>
        </div>
    </div>
</div>

<!-- صندوق جدول البلاغات الرئيسي -->
<div class="panel-box">
    <div class="panel-box-header"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
            <div class="sidebar-logo" style="width: 32px; height: 32px; font-size: 16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
            </div>
            <div>
                <h3 class="panel-box-title" style="margin:0;">سجل بلاغات الأسئلة والأخطاء الأكاديمية</h3>
                <span style="font-size:11px; color:#64748b;">مربوط مباشرة مع بنك الأسئلة واختبارات الطلاب</span>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span style="display:inline-flex; align-items:center; gap:6px; font-size:11px; background:#ecfdf5; color:#047857; padding:4px 10px; border-radius:20px; font-weight:700; border:1px solid #a7f3d0;">
                <span style="width:7px; height:7px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 0 2px rgba(16,185,129,0.3);"></span>
                تزامن سحابي مباشر
            </span>
            <a href="reports.php?sync=1" class="btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:6px 12px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                مزامنة حية الآن ⚡
            </a>
            <button type="button" class="btn-primary" onclick="openAddModal()" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; padding:6px 12px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                تسجيل بلاغ يدوي
            </button>
        </div>
    </div>

    <!-- شريط الفلاتر والبحث -->
    <div class="panel-box-body" style="border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 16px 20px;">
        <form method="GET" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث بعنوان السؤال، المادة، المبلّغ، أو الملاحظات..." class="form-input"
                    style="width: 100%;">
            </div>
            <div style="min-width: 150px;">
                <select name="status" class="form-select" onchange="this.form.submit()">
                    <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>كل الحالات</option>
                    <option value="pending" <?= $statusFilter === 'pending' ? 'selected' : '' ?>>قيد المتابعة</option>
                    <option value="resolved" <?= $statusFilter === 'resolved' ? 'selected' : '' ?>>تم الحل والتصحيح
                    </option>
                    <option value="dismissed" <?= $statusFilter === 'dismissed' ? 'selected' : '' ?>>مستبعد</option>
                </select>
            </div>
            <div style="min-width: 160px;">
                <select name="type" class="form-select" onchange="this.form.submit()">
                    <option value="">كل أنواع البلاغات</option>
                    <?php foreach ($reportTypes as $rtk => $rtv): ?>
                        <option value="<?= $rtk ?>" <?= $typeFilter === $rtk ? 'selected' : '' ?>><?= $rtv['label'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <button type="submit" class="btn-secondary">تصفية</button>
            <?php if ($search !== '' || $statusFilter !== 'all' || $typeFilter !== ''): ?>
                <a href="reports.php" class="btn-outline" style="text-decoration:none;">إلغاء الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>السؤال والمادة</th>
                    <th>نوع البلاغ</th>
                    <th>سبب البلاغ وتفاصيل الطالب</th>
                    <th>المبلغ والتواصل</th>
                    <th>تقرير المعالجة</th>
                    <th>الحالة</th>
                    <th>التاريخ</th>
                    <th style="text-align: center; width: 130px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($reports)): ?>
                    <tr>
                        <td colspan="9" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد بلاغات مطابقة للشروط.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($reports as $rp):
                    $rType = $reportTypes[$rp['report_type']] ?? $reportTypes['other'];
                    $sBadge = $statusLabels[$rp['status']] ?? $statusLabels['pending'];
                    ?>
                    <tr>
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $rp['id'] ?></td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;">سؤال
                                #<?= htmlspecialchars($rp['question_id'] ?: $rp['id']) ?> ·
                                <?= htmlspecialchars($rp['question_title']) ?>
                            </div>
                            <div style="font-size: 11px; color: #0284c7; margin-top: 2px;">
                                📚 <?= htmlspecialchars($rp['course_name'] ?: 'عام') ?>
                                <?php if (!empty($rp['question_id'])): ?>
                                    <span class="badge-code" style="margin-right: 4px;">ID:
                                        <?= htmlspecialchars($rp['question_id']) ?></span>
                                <?php endif; ?>
                            </div>
                        </td>
                        <td>
                            <span class="<?= $rType['badge'] ?>" style="font-size: 11px;"><?= $rType['label'] ?></span>
                        </td>
                        <td style="max-width: 280px;">
                            <div style="font-weight: 600; font-size: 12px; color: #b91c1c;">
                                ⚠️ <?= htmlspecialchars($rp['reason']) ?>
                            </div>
                            <?php if (!empty($rp['details'])): ?>
                                <div style="font-size: 11px; color: #475569; margin-top: 3px;">
                                    <?= nl2br(htmlspecialchars($rp['details'])) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <div style="font-weight: 600; color: #334155; font-size: 12px;">
                                <?= htmlspecialchars($rp['reporter_name']) ?>
                            </div>
                            <?php if (!empty($rp['reporter_contact'])): ?>
                                <div style="font-size: 11px; color: #64748b; font-family: monospace;">
                                    <?= htmlspecialchars($rp['reporter_contact']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td style="max-width: 220px;">
                            <?php if (!empty($rp['resolution_notes'])): ?>
                                <div
                                    style="font-size: 11px; color: #15803d; background: #f0fdf4; padding: 4px 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                                    ✓ <?= htmlspecialchars($rp['resolution_notes']) ?>
                                    <div style="font-size: 10px; color: #166534; margin-top: 2px;">بواسطة:
                                        <?= htmlspecialchars($rp['resolved_by'] ?: 'الإدارة') ?>
                                    </div>
                                </div>
                            <?php else: ?>
                                <span style="color: #94a3b8; font-size: 11px;">قيد التدقيق</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="<?= $sBadge['class'] ?>" style="font-size:11px;"><?= $sBadge['label'] ?></span>
                        </td>
                        <td style="color: #64748b; font-size: 11px; white-space: nowrap;">
                            <?= date('Y/m/d H:i', strtotime($rp['created_at'])) ?>
                        </td>
                                <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                                <!-- زر المعالجة السريعة داخل الصفحة -->
                                <button type="button" class="btn-primary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openResolveModal(<?= json_encode($rp, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="معالجة وتحديث حالة البلاغ">
                                    🛠️ حل/معالجة
                                </button>

                                <?php if (!empty($rp['question_id'])): ?>
                                    <!-- رابط بنك الأسئلة -->
                                    <a href="tests.php?question_id=<?= urlencode($rp['question_id']) ?>&report_id=<?= $rp['id'] ?>"
                                        target="_blank" class="btn-secondary" style="padding: 4px 8px; font-size: 11px; text-decoration: none;"
                                        title="معاينة وتعديل في بنك الأسئلة">
                                        📝 السؤال
                                    </a>
                                <?php endif; ?>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل أنت متأكد من حذف هذا البلاغ نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $rp['id'] ?>">
                                    <button type="submit" class="btn-danger" style="padding: 4px 8px; font-size: 11px;"
                                        title="حذف البلاغ">
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

<!-- Modal: تسجيل بلاغ يدوي -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>تسجيل بلاغ أكاديمي جديد</h3>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">عنوان / نص السؤال أو المحتوى *</label>
                        <input type="text" name="question_title" class="form-input" required
                            placeholder="مثال: سؤال 14 في كويز تفاضل 1">
                    </div>
                    <div>
                        <label class="form-label">معرف السؤال (ID)</label>
                        <input type="text" name="question_id" class="form-input" placeholder="مثال: q_math_14">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم المادة</label>
                        <input type="text" name="course_name" class="form-input" placeholder="مثال: تفاضل وتكامل 1">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع البلاغ *</label>
                        <select name="report_type" class="form-select">
                            <?php foreach ($reportTypes as $rtk => $rtv): ?>
                                <option value="<?= $rtk ?>"><?= $rtv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">حالة البلاغ</label>
                        <select name="status" class="form-select">
                            <option value="pending">قيد المتابعة</option>
                            <option value="resolved">تم الحل</option>
                            <option value="dismissed">مستبعد</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">سبب البلاغ / الخلل المرصود *</label>
                    <input type="text" name="reason" class="form-input" required
                        placeholder="مثال: الإجابة النموذجية خاطئة">
                </div>

                <div>
                    <label class="form-label">تفاصيل إضافية أو مقترح التصحيح</label>
                    <textarea name="details" class="form-input" rows="2" placeholder="الخطوات أو التوضيح..."></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الطالب / المبلّغ</label>
                        <input type="text" name="reporter_name" class="form-input" placeholder="اسم الطالب">
                    </div>
                    <div>
                        <label class="form-label">رقم الهاتف / وسيلة التواصل</label>
                        <input type="text" name="reporter_contact" class="form-input" placeholder="079xxxxxxx">
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">تسجيل البلاغ</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: معالجة وتحديث البلاغ -->
<div id="resolveModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>معالجة وتصحيح البلاغ (مباشر ومزامن)</h3>
            <button type="button" class="modal-close" onclick="closeResolveModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="resolve">
            <input type="hidden" name="id" id="res_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div style="font-weight: 700; color: #0f172a; font-size: 14px; line-height: 1.5;" id="res_title"></div>
                    <div style="font-size: 11px; color: #0284c7; margin-top: 6px;" id="res_meta"></div>
                    <div style="font-size: 11px; color: #475569; margin-top: 4px;" id="res_reporter"></div>
                    <div style="font-size: 12px; color: #b91c1c; margin-top: 6px; font-weight:600;" id="res_reason"></div>
                    <div style="font-size: 12px; color: #334155; margin-top: 4px; background:#fff; padding:6px 10px; border-radius:6px; border:1px solid #e2e8f0;" id="res_details"></div>
                    <div id="res_options_box" style="display:none; margin-top:8px; font-size:11px; color:#475569;">
                        <strong style="color:#0f172a;">خيارات السؤال:</strong>
                        <div id="res_options_list" style="margin-top:4px;"></div>
                    </div>
                </div>

                <div>
                    <label class="form-label">تقرير وإجراء المعالجة *</label>
                    <textarea name="resolution_notes" id="res_notes" class="form-input" rows="3" required
                        placeholder="وضح ما تم فعله (مثال: تم مراجعة السؤال وتعديل الخيار الصحيح في بنك الأسئلة)..."></textarea>
                </div>

                <div>
                    <label class="form-label">تحديث حالة البلاغ (يتم مزامنتها مع السحابة فوراً)</label>
                    <select name="status" id="res_status" class="form-select">
                        <option value="resolved">تم الحل والتصحيح (Resolved) ✓</option>
                        <option value="dismissed">مستبعد / السؤال صحيح بعد المراجعة (Dismissed)</option>
                        <option value="pending">إبقاء قيد المتابعة (Pending)</option>
                    </select>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeResolveModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ وتحديث في السحابة ✅</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() { document.getElementById('addModal').style.display = 'flex'; }
    function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

    function openResolveModal(r) {
        document.getElementById('res_id').value = r.id;
        document.getElementById('res_title').textContent = 'سؤال #' + (r.question_id || r.id) + ' · ' + r.question_title;
        document.getElementById('res_meta').textContent = 'المادة / الكويز: ' + (r.course_name || 'عام') + ' · نوع البلاغ: ' + (r.report_type || 'عام');
        document.getElementById('res_reporter').textContent = 'المبلّغ: ' + (r.reporter_name || 'طالب') + (r.reporter_contact ? ' · التواصل: ' + r.reporter_contact : '');
        document.getElementById('res_reason').textContent = '⚠️ سبب البلاغ: ' + (r.reason || 'ملاحظة');
        
        const detailsElem = document.getElementById('res_details');
        if (r.details) {
            detailsElem.textContent = 'ملاحظة وتفاصيل الطالب: ' + r.details;
            detailsElem.style.display = 'block';
        } else {
            detailsElem.style.display = 'none';
        }

        const optBox = document.getElementById('res_options_box');
        const optList = document.getElementById('res_options_list');
        optList.innerHTML = '';
        if (r.options_json) {
            try {
                const opts = JSON.parse(r.options_json);
                if (Array.isArray(opts) && opts.length > 0) {
                    opts.forEach((o, i) => {
                        const oText = o.textAr || o.textEn || o.text || ('خيار ' + (i + 1));
                        const isCorrect = o.correct || (r.correct_answer && (r.correct_answer === o.id || r.correct_answer === String(i)));
                        const item = document.createElement('div');
                        item.style.padding = '3px 6px';
                        item.style.margin = '2px 0';
                        item.style.borderRadius = '4px';
                        item.style.background = isCorrect ? '#dcfce7' : '#f1f5f9';
                        item.style.color = isCorrect ? '#166534' : '#334155';
                        item.textContent = (isCorrect ? '✓ ' : '• ') + oText;
                        optList.appendChild(item);
                    });
                    optBox.style.display = 'block';
                } else {
                    optBox.style.display = 'none';
                }
            } catch (e) {
                optBox.style.display = 'none';
            }
        } else {
            optBox.style.display = 'none';
        }

        document.getElementById('res_notes').value = r.resolution_notes || '';
        document.getElementById('res_status').value = r.status || 'resolved';
        document.getElementById('resolveModal').style.display = 'flex';
    }

    function closeResolveModal() { document.getElementById('resolveModal').style.display = 'none'; }

    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
        if (event.target == document.getElementById('resolveModal')) closeResolveModal();
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>