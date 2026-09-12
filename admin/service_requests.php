<?php
/**
 * admin/service_requests.php — إدارة طلبات الخدمات الطلابية والملخصات والأفكار
 */
$page_key = 'services';
$page_title = 'إدارة طلبات الخدمات';
require_once __DIR__ . '/../config.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();
require_once __DIR__ . '/../sync_official_live.php';
try {
    sync_official_service_requests($db);
} catch (Throwable $syncError) {
    error_log('Service requests live sync failed: ' . $syncError->getMessage());
}

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

$serviceTypes = [
    'summary' => ['label' => '📝 طلب تلخيص مادة', 'badge' => 'badge-faculty'],
    'quiz' => ['label' => '❓ طلب بنك أسئلة', 'badge' => 'badge-warning'],
    'idea' => ['label' => '💡 اقتراح وتطوير', 'badge' => 'badge-role'],
    'resource' => ['label' => '📚 طلب كتاب أو دوسية', 'badge' => 'badge-subtle'],
    'other' => ['label' => '🚀 خدمة أخرى', 'badge' => 'badge-pending'],
];

$statusLabels = [
    'new' => ['label' => 'جديد', 'class' => 'badge-pending'],
    'in_progress' => ['label' => 'قيد التنفيذ', 'class' => 'badge-warning'],
    'completed' => ['label' => 'مكتمل', 'class' => 'badge-success'],
    'cancelled' => ['label' => 'ملغى', 'class' => 'badge-cancelled'],
];

// جلب قائمة المنسقين النشطين للإسناد
$coordsList = $db->query("SELECT id, name, faculty FROM coordinators WHERE is_active = 1 ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);

$flash = null;

// معالجة الإجراءات POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        // 1. إضافة طلب جديد
        if ($action === 'create') {
            $studentName = trim($_POST['student_name'] ?? '');
            $studentPhone = trim($_POST['student_phone'] ?? '');
            $studentEmail = trim($_POST['student_email'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $serviceType = $_POST['service_type'] ?? 'summary';
            $courseName = trim($_POST['course_name'] ?? '');
            $details = trim($_POST['details'] ?? '');
            $fileUrl = trim($_POST['file_url'] ?? '');
            $status = $_POST['status'] ?? 'new';
            $assignedTo = trim($_POST['assigned_to'] ?? '');
            $adminNotes = trim($_POST['admin_notes'] ?? '');

            if ($studentName === '' || $studentPhone === '' || $details === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال اسم الطالب، رقم الهاتف وتفاصيل الطلب.'];
            } else {
                $stmt = $db->prepare("INSERT INTO service_requests 
                    (student_name, student_phone, student_email, faculty, service_type, course_name, details, file_url, status, assigned_to, admin_notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$studentName, $studentPhone, $studentEmail, $faculty, $serviceType, $courseName, $details, $fileUrl, $status, $assignedTo, $adminNotes]);
                $newId = $db->lastInsertId();

                log_activity("إضافة طلب خدمة جديد للطالب \"$studentName\" (#$newId)", 'service_requests');
                $flash = ['type' => 'success', 'msg' => 'تمت إضافة طلب الخدمة بنجاح ✅'];
            }
        }

        // 2. تحديث حالة وإسناد الطلب
        elseif ($action === 'update_status') {
            $id = (int) ($_POST['id'] ?? 0);
            $newStatus = $_POST['status'] ?? 'new';
            $assignedTo = trim($_POST['assigned_to'] ?? '');
            $adminNotes = trim($_POST['admin_notes'] ?? '');

            $stmt = $db->prepare("UPDATE service_requests SET status = ?, assigned_to = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$newStatus, $assignedTo, $adminNotes, $id]);

            log_activity("تحديث حالة طلب الخدمة #$id إلى ($newStatus)", 'service_requests');
            $flash = ['type' => 'success', 'msg' => 'تم حفظ تحديثات الطلب بنجاح'];
        }

        // 3. حذف طلب
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            archive_delete('service_requests', $id, 'حذف طلب خدمة');

            log_activity("حذف طلب الخدمة #$id", 'service_requests');
            $flash = ['type' => 'success', 'msg' => 'تم حذف الطلب نهائياً 🗑️'];
        }
    }
}

// الفلاتر
$statusFilter = $_GET['status'] ?? 'all';
$serviceFilter = $_GET['type'] ?? 'all';
$facultyFilter = $_GET['faculty'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($statusFilter !== 'all') {
    $where[] = "status = ?";
    $params[] = $statusFilter;
}
if ($serviceFilter !== 'all') {
    $where[] = "service_type = ?";
    $params[] = $serviceFilter;
}
if ($facultyFilter !== '') {
    $where[] = "faculty = ?";
    $params[] = $facultyFilter;
}
if ($search !== '') {
    $where[] = "(student_name LIKE ? OR student_phone LIKE ? OR course_name LIKE ? OR details LIKE ? OR assigned_to LIKE ? OR admin_notes LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM service_requests" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY CASE WHEN status='new' THEN 0 WHEN status='in_progress' THEN 1 ELSE 2 END, created_at DESC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$requests = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) AS new_count,
    SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_count
FROM service_requests")->fetch(PDO::FETCH_ASSOC);

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
            <span class="stats-card-title">إجمالي طلبات الخدمات</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path
                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">طلبات طلابية</span>
            <span>ملخصات واستفسارات</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">طلبات جديدة واردة</span>
            <div class="stats-icon-box icon-red">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b91c1c;"><?= number_format($stats['new_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span style="color:#b91c1c; font-weight:700;">بحاجة لتوزيع ومتابعة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">قيد التنفيذ والمتابعة</span>
            <div class="stats-icon-box icon-yellow">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b45309;"><?= number_format($stats['in_progress_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>مسندة للمنسقين للعمل عليها</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">طلبات منجزة ومكتملة</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['completed_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">تم توفيرها ونشرها</span>
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
                    <path
                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
            </div>
            <h3 class="panel-box-title" style="margin:0;">سجل ومتابعة طلبات الخدمات الطلابية</h3>
        </div>
        <button type="button" class="btn-primary" onclick="openAddModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إضافة طلب جديد
        </button>
    </div>

    <!-- شريط الفلاتر والبحث -->
    <div class="panel-box-body" style="border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 16px 20px;">
        <form method="GET" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث باسم الطالب، الهاتف، المادة، أو تفاصيل الطلب..." class="form-input"
                    style="width: 100%;">
            </div>
            <div style="min-width: 150px;">
                <select name="status" class="form-select" onchange="this.form.submit()">
                    <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>كل الحالات</option>
                    <option value="new" <?= $statusFilter === 'new' ? 'selected' : '' ?>>جديد</option>
                    <option value="in_progress" <?= $statusFilter === 'in_progress' ? 'selected' : '' ?>>قيد التنفيذ
                    </option>
                    <option value="completed" <?= $statusFilter === 'completed' ? 'selected' : '' ?>>مكتمل</option>
                    <option value="cancelled" <?= $statusFilter === 'cancelled' ? 'selected' : '' ?>>ملغى</option>
                </select>
            </div>
            <div style="min-width: 160px;">
                <select name="type" class="form-select" onchange="this.form.submit()">
                    <option value="all">جميع أنواع الخدمات</option>
                    <?php foreach ($serviceTypes as $stKey => $stVal): ?>
                        <option value="<?= $stKey ?>" <?= $serviceFilter === $stKey ? 'selected' : '' ?>><?= $stVal['label'] ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
            <button type="submit" class="btn-secondary">تصفية</button>
            <?php if ($search !== '' || $statusFilter !== 'all' || $serviceFilter !== 'all' || $facultyFilter !== ''): ?>
                <a href="service_requests.php" class="btn-outline" style="text-decoration:none;">إلغاء الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>الطالب والتواصل</th>
                    <th>نوع الخدمة والمادة</th>
                    <th>الكلية</th>
                    <th>تفاصيل الطلب</th>
                    <th>المنسق المكلف</th>
                    <th>الحالة</th>
                    <th>تاريخ التقديم</th>
                    <th style="text-align: center; width: 130px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($requests)): ?>
                    <tr>
                        <td colspan="9" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد طلبات خدمات مطابقة للشروط.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($requests as $req):
                    $sType = $serviceTypes[$req['service_type']] ?? $serviceTypes['other'];
                    $sBadge = $statusLabels[$req['status']] ?? $statusLabels['new'];
                    ?>
                    <tr>
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $req['id'] ?></td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;"><?= htmlspecialchars($req['student_name']) ?>
                            </div>
                            <div style="font-size: 11px; color: #0284c7; font-family: monospace;">
                                📞 <?= htmlspecialchars($req['student_phone']) ?>
                            </div>
                        </td>
                        <td>
                            <span class="<?= $sType['badge'] ?>" style="font-size: 11px;"><?= $sType['label'] ?></span>
                            <?php if (!empty($req['course_name'])): ?>
                                <div style="font-size: 12px; font-weight: 600; color: #334155; margin-top: 3px;">
                                    <?= htmlspecialchars($req['course_name']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="badge-faculty"><?= htmlspecialchars($req['faculty'] ?: 'عام') ?></span>
                        </td>
                        <td style="max-width: 280px;">
                            <div style="font-size: 12px; color: #1e293b; line-height: 1.4;">
                                <?= nl2br(htmlspecialchars($req['details'])) ?>
                            </div>
                            <?php if (!empty($req['admin_notes'])): ?>
                                <div
                                    style="font-size: 11px; color: #0284c7; background: #f0f9ff; padding: 4px 8px; border-radius: 4px; margin-top: 4px;">
                                    📝 ملاحظة: <?= htmlspecialchars($req['admin_notes']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <?php if (!empty($req['assigned_to'])): ?>
                                <span style="font-weight: 600; color: #0f172a; font-size: 12px;">👔
                                    <?= htmlspecialchars($req['assigned_to']) ?></span>
                            <?php else: ?>
                                <span style="color: #94a3b8; font-size: 11px;">غير مسند</span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="<?= $sBadge['class'] ?>" style="font-size: 11px;"><?= $sBadge['label'] ?></span>
                        </td>
                        <td style="color: #64748b; font-size: 11px; white-space: nowrap;">
                            <?= date('Y/m/d H:i', strtotime($req['created_at'])) ?>
                        </td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                                <!-- زر التحديث والإسناد -->
                                <button type="button" class="btn-primary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openUpdateModal(<?= json_encode($req, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="تحديث الحالة والإسناد">
                                    ⚙️ إدارة
                                </button>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل أنت متأكد من حذف هذا الطلب نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $req['id'] ?>">
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

<!-- Modal: إضافة طلب خدمة جديد -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>إضافة طلب خدمة طلابية</h3>
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
                            placeholder="مثال: خالد الحباشنة">
                    </div>
                    <div>
                        <label class="form-label">رقم الهاتف (واتساب) *</label>
                        <input type="text" name="student_phone" class="form-input" required placeholder="0791234567">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع الخدمة المطلوبة *</label>
                        <select name="service_type" class="form-select">
                            <?php foreach ($serviceTypes as $stk => $stv): ?>
                                <option value="<?= $stk ?>"><?= $stv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
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
                        <label class="form-label">اسم المادة الدراسية (إن وجد)</label>
                        <input type="text" name="course_name" class="form-input" placeholder="مثال: تفاضل وتكامل 2">
                    </div>
                    <div>
                        <label class="form-label">إسناد لمنسق</label>
                        <select name="assigned_to" class="form-select">
                            <option value="">-- بدون إسناد حالياً --</option>
                            <?php foreach ($coordsList as $coord): ?>
                                <option value="<?= htmlspecialchars($coord['name']) ?>">
                                    <?= htmlspecialchars($coord['name']) ?> (<?= htmlspecialchars($coord['faculty']) ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">تفاصيل الطلب والاحتياجات *</label>
                    <textarea name="details" class="form-input" rows="3" required
                        placeholder="وضح ما يحتاجه الطالب بدقة..."></textarea>
                </div>

                <div>
                    <label class="form-label">ملاحظات إدارية داخلية</label>
                    <textarea name="admin_notes" class="form-input" rows="2"
                        placeholder="ملاحظات المتابعة..."></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ الطلب</button>
            </div>
        </form>
    </div>
</div>

<style>
    .request-update-panel {
        display: none;
        width: min(100%, 520px);
        margin: 34px 0 0 auto;
        animation: requestPanelIn .2s ease-out;
    }

    .request-update-panel .modal-box {
        max-width: none;
        overflow: hidden;
        background: #fff;
        border: 1px solid #dbe5ef;
        border-radius: 14px;
        box-shadow: 0 10px 28px rgba(15, 23, 42, .08);
    }

    .request-update-panel .modal-header {
        padding: 16px 20px;
        background: linear-gradient(135deg, #f8fafc, #fff);
        border-bottom: 1px solid #e2e8f0;
    }

    .request-update-panel .modal-header h3 {
        margin: 0;
        color: #0f172a;
        font-family: 'Cairo', sans-serif;
        font-size: 17px;
        font-weight: 800;
    }

    .request-update-panel .modal-body {
        padding: 20px;
    }

    .request-update-panel .request-summary {
        padding: 14px 16px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-right: 3px solid #0284c7;
        border-radius: 10px;
    }

    .request-update-panel .request-summary-main {
        color: #0f172a;
        font-size: 14px;
        font-weight: 800;
    }

    .request-update-panel .request-summary-meta {
        margin-top: 5px;
        color: #0284c7;
        font-size: 12px;
        font-weight: 600;
    }

    .request-update-panel .request-summary-details {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid #e2e8f0;
        color: #64748b;
        font-size: 12px;
        line-height: 1.6;
    }

    .request-update-panel .update-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
    }

    .request-update-panel .form-label {
        display: block;
        margin-bottom: 7px;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
    }

    .request-update-panel .form-select,
    .request-update-panel .form-input {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        background: #fff;
        color: #1e293b;
        font-family: inherit;
        font-size: 13px;
    }

    .request-update-panel .form-select {
        min-height: 40px;
        padding: 8px 10px;
    }

    .request-update-panel .form-input {
        padding: 10px 12px;
        resize: vertical;
    }

    .request-update-panel .form-select:focus,
    .request-update-panel .form-input:focus {
        outline: none;
        border-color: #0284c7;
        box-shadow: 0 0 0 3px rgba(2, 132, 199, .12);
    }

    .request-update-panel .modal-footer {
        display: flex;
        justify-content: flex-start;
        gap: 8px;
        padding: 14px 20px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
    }

    @keyframes requestPanelIn {
        from {
            opacity: 0;
            transform: translateY(8px);
        }

        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @media (max-width: 640px) {
        .request-update-panel {
            margin-top: 24px;
        }

        .request-update-panel .update-fields {
            grid-template-columns: 1fr;
        }
    }
</style>

<!-- لوحة تحديث حالة وإسناد الطلب تظهر أسفل الجدول -->
<div id="updateModal" class="request-update-panel">
    <div class="modal-box">
        <div class="modal-header">
            <h3>إدارة وتحديث طلب الخدمة</h3>
            <button type="button" class="modal-close" onclick="closeUpdateModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="update_status">
            <input type="hidden" name="id" id="up_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 18px;">
                <div class="request-summary">
                    <div class="request-summary-main" id="up_student_info"></div>
                    <div class="request-summary-meta" id="up_course_info"></div>
                    <div class="request-summary-details" id="up_details"></div>
                </div>

                <div class="update-fields">
                    <div>
                        <label class="form-label">حالة الطلب</label>
                        <select name="status" id="up_status" class="form-select">
                            <option value="new">جديد (New)</option>
                            <option value="in_progress">قيد التنفيذ (In Progress)</option>
                            <option value="completed">مكتمل ومُنجز (Completed) ✓</option>
                            <option value="cancelled">ملغى (Cancelled)</option>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">المنسق المكلف بالمتابعة</label>
                        <select name="assigned_to" id="up_assigned_to" class="form-select">
                            <option value="">-- بدون إسناد --</option>
                            <?php foreach ($coordsList as $coord): ?>
                                <option value="<?= htmlspecialchars($coord['name']) ?>">
                                    <?= htmlspecialchars($coord['name']) ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">ملاحظات الإدارة والمتابعة</label>
                    <textarea name="admin_notes" id="up_notes" class="form-input" rows="3"
                        placeholder="اكتب الملاحظات أو ما تم إنجازه..."></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeUpdateModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ التحديثات</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() { document.getElementById('addModal').style.display = 'flex'; }
    function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

    function openUpdateModal(req) {
        document.getElementById('up_id').value = req.id;
        document.getElementById('up_student_info').textContent = req.student_name + ' • ' + (req.student_phone || '');
        document.getElementById('up_course_info').textContent = (req.course_name ? 'مادة: ' + req.course_name + ' | ' : '') + 'كلية: ' + (req.faculty || 'عام');
        document.getElementById('up_details').textContent = req.details || '';
        document.getElementById('up_status').value = req.status || 'new';
        document.getElementById('up_assigned_to').value = req.assigned_to || '';
        document.getElementById('up_notes').value = req.admin_notes || '';
        const updatePanel = document.getElementById('updateModal');
        updatePanel.style.display = 'block';
        updatePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function closeUpdateModal() { document.getElementById('updateModal').style.display = 'none'; }

    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
    }

    setTimeout(function () {
        if (!document.querySelector('.modal[style*="flex"], .modal[style*="block"]')) window.location.reload();
    }, 5000);
</script>

<?php require __DIR__ . '/_footer.php'; ?>