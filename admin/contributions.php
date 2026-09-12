<?php
/**
 * admin/contributions.php — إدارة مساهمات الطلاب والمحتوى الوارد
 */
$page_key = 'contributions';
$page_title = 'إدارة مساهمات الطلاب';
require_once __DIR__ . '/../config.php';
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

$typeLabels = [
    'summary' => ['label' => 'ملخص وشرح', 'badge' => 'badge-faculty'],
    'exam' => ['label' => 'أسئلة وسنوات', 'badge' => 'badge-warning'],
    'slides' => ['label' => 'سلايدات ومحاضرات', 'badge' => 'badge-role'],
    'notes' => ['label' => 'ملاحظات يدوية', 'badge' => 'badge-subtle'],
    'link' => ['label' => 'رابط خارجي', 'badge' => 'badge-code'],
    'other' => ['label' => 'أخرى', 'badge' => 'badge-pending'],
];

$statusLabels = [
    'pending' => ['label' => 'قيد المراجعة', 'class' => 'badge-pending'],
    'approved' => ['label' => 'مُعتمد ومنشور', 'class' => 'badge-success'],
    'rejected' => ['label' => 'مرفوض', 'class' => 'badge-cancelled'],
];

$flash = null;

// معالجة الإجراءات
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني، يرجى إعادة المحاولة.'];
    } else {
        $action = $_POST['action'] ?? '';

        // 1. إضافة مساهمة جديدة
        if ($action === 'create') {
            $studentName = trim($_POST['student_name'] ?? '') ?: 'مساهم مجهول';
            $subjectName = trim($_POST['subject_name'] ?? '');
            $courseCode = strtoupper(trim($_POST['course_code'] ?? ''));
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $fileName = trim($_POST['file_name'] ?? '');
            $fileUrl = trim($_POST['file_url'] ?? '');
            $fileType = trim($_POST['file_type'] ?? 'pdf');
            $contribType = $_POST['contribution_type'] ?? 'summary';
            $status = $_POST['status'] ?? 'approved';
            $notes = trim($_POST['notes'] ?? '');

            if ($subjectName === '' || $fileUrl === '') {
                $flash = ['type' => 'error', 'msg' => 'الرجاء إدخال اسم المادة ورابط الملف على الأقل.'];
            } else {
                if ($fileName === '') {
                    $fileName = 'ملف_' . preg_replace('/[^a-zA-Z0-9_\-]/', '', $subjectName) . '.' . $fileType;
                }
                $stmt = $db->prepare("INSERT INTO contributions 
                    (student_name, subject_name, course_code, faculty, file_name, file_url, file_type, contribution_type, status, notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$studentName, $subjectName, $courseCode, $faculty, $fileName, $fileUrl, $fileType, $contribType, $status, $notes]);
                $newId = $db->lastInsertId();

                log_activity("إضافة مساهمة جديدة لمادة \"$subjectName\" من \"$studentName\" (#$newId)", 'contributions');
                $flash = ['type' => 'success', 'msg' => 'تمت إضافة المساهمة بنجاح ✅'];
            }
        }

        // 2. تحديث حالة المساهمة (اعتماد / رفض / تعليق)
        elseif ($action === 'update_status') {
            $id = (int) ($_POST['id'] ?? 0);
            $newStatus = $_POST['new_status'] ?? 'pending';
            $notes = trim($_POST['notes'] ?? '');

            $stmt = $db->prepare("UPDATE contributions SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$newStatus, $notes, $id]);

            log_activity("تحديث حالة المساهمة #$id إلى ($newStatus)", 'contributions');
            $flash = ['type' => 'success', 'msg' => 'تم تحديث حالة المساهمة بنجاح'];
        }

        // 3. تعديل بيانات المساهمة
        elseif ($action === 'edit') {
            $id = (int) ($_POST['id'] ?? 0);
            $studentName = trim($_POST['student_name'] ?? '') ?: 'مساهم مجهول';
            $subjectName = trim($_POST['subject_name'] ?? '');
            $courseCode = strtoupper(trim($_POST['course_code'] ?? ''));
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $fileName = trim($_POST['file_name'] ?? '');
            $fileUrl = trim($_POST['file_url'] ?? '');
            $fileType = trim($_POST['file_type'] ?? 'pdf');
            $contribType = $_POST['contribution_type'] ?? 'summary';
            $status = $_POST['status'] ?? 'approved';
            $notes = trim($_POST['notes'] ?? '');

            if ($subjectName === '' || $fileUrl === '') {
                $flash = ['type' => 'error', 'msg' => 'الرجاء إدخال اسم المادة ورابط الملف.'];
            } else {
                $stmt = $db->prepare("UPDATE contributions SET 
                    student_name=?, subject_name=?, course_code=?, faculty=?, file_name=?, 
                    file_url=?, file_type=?, contribution_type=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP 
                    WHERE id=?");
                $stmt->execute([$studentName, $subjectName, $courseCode, $faculty, $fileName, $fileUrl, $fileType, $contribType, $status, $notes, $id]);

                log_activity("تعديل بيانات المساهمة #$id", 'contributions');
                $flash = ['type' => 'success', 'msg' => 'تم حفظ التعديلات بنجاح ✅'];
            }
        }

        // 4. حذف المساهمة
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            $t = $db->prepare("SELECT subject_name FROM contributions WHERE id = ?");
            $t->execute([$id]);
            $sName = $t->fetchColumn() ?: "#$id";

            archive_delete('contributions', $id, 'حذف مساهمة');

            log_activity("حذف مساهمة الطالب لمادة $sName (#$id)", 'contributions');
            $flash = ['type' => 'success', 'msg' => 'تم حذف المساهمة نهائياً 🗑️'];
        }
    }
}

// الفلاتر والاستعلام
$statusFilter = $_GET['status'] ?? 'all';
$facultyFilter = $_GET['faculty'] ?? '';
$typeFilter = $_GET['type'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($statusFilter !== 'all') {
    $where[] = "status = ?";
    $params[] = $statusFilter;
}
if ($facultyFilter !== '') {
    $where[] = "faculty = ?";
    $params[] = $facultyFilter;
}
if ($typeFilter !== '') {
    $where[] = "contribution_type = ?";
    $params[] = $typeFilter;
}
if ($search !== '') {
    $where[] = "(student_name LIKE ? OR subject_name LIKE ? OR course_code LIKE ? OR file_name LIKE ? OR notes LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM contributions" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY created_at DESC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$contributions = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات سريعة
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
    SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved_count,
    SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected_count
FROM contributions")->fetch(PDO::FETCH_ASSOC);

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
            <span class="stats-card-title">إجمالي المساهمات الواردة</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path
                        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">ملفات وروابط</span>
            <span>مقدمة من الطلاب</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">قيد المراجعة والتدقيق</span>
            <div class="stats-icon-box icon-yellow">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b45309;"><?= number_format($stats['pending_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span style="color: #b45309; font-weight:700;">بحاجة للاعتماد</span>
            <span>لم تنشر بعد</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">مساهمات معتمدة ومنشورة</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['approved_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">متاحة في الموقع</span>
            <span>للتحميل المباشر</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">مساهمات مرفوضة</span>
            <div class="stats-icon-box icon-red">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b91c1c;"><?= number_format($stats['rejected_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>مرفوضة لعدم المطابقة</span>
        </div>
    </div>
</div>

<!-- صندوق جدول المساهمات الرئيسي -->
<div class="panel-box">
    <div class="panel-box-header"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="sidebar-logo" style="width: 32px; height: 32px; font-size: 16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path
                        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                </svg>
            </div>
            <h3 class="panel-box-title" style="margin:0;">قائمة مساهمات الطلاب والمحتوى الوارد</h3>
        </div>
        <button type="button" class="btn-primary" onclick="openAddModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إضافة مساهمة جديدة
        </button>
    </div>

    <!-- شريط الفلاتر والبحث -->
    <div class="panel-box-body" style="border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 16px 20px;">
        <form method="GET" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث باسم الطالب، المادة، الرمز، أو اسم الملف..." class="form-input"
                    style="width: 100%;">
            </div>
            <div style="min-width: 150px;">
                <select name="status" class="form-select" onchange="this.form.submit()">
                    <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>كل الحالات</option>
                    <option value="pending" <?= $statusFilter === 'pending' ? 'selected' : '' ?>>قيد المراجعة</option>
                    <option value="approved" <?= $statusFilter === 'approved' ? 'selected' : '' ?>>مُعتمد ومنشور</option>
                    <option value="rejected" <?= $statusFilter === 'rejected' ? 'selected' : '' ?>>مرفوض</option>
                </select>
            </div>
            <div style="min-width: 160px;">
                <select name="faculty" class="form-select" onchange="this.form.submit()">
                    <option value="">كل الكليات</option>
                    <?php foreach ($facultiesList as $fac): ?>
                        <option value="<?= htmlspecialchars($fac) ?>" <?= $facultyFilter === $fac ? 'selected' : '' ?>>
                            <?= htmlspecialchars($fac) ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div style="min-width: 140px;">
                <select name="type" class="form-select" onchange="this.form.submit()">
                    <option value="">كل الأنواع</option>
                    <?php foreach ($typeLabels as $tKey => $tData): ?>
                        <option value="<?= $tKey ?>" <?= $typeFilter === $tKey ? 'selected' : '' ?>><?= $tData['label'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <button type="submit" class="btn-secondary">بحث وتصفية</button>
            <?php if ($search !== '' || $statusFilter !== 'all' || $facultyFilter !== '' || $typeFilter !== ''): ?>
                <a href="contributions.php" class="btn-outline" style="text-decoration:none;">إلغاء الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 50px;">#</th>
                    <th>اسم المساهم</th>
                    <th>المادة والكود</th>
                    <th>الكلية</th>
                    <th>نوع المساهمة</th>
                    <th>الملف المرفوع</th>
                    <th>الحالة</th>
                    <th>تاريخ الرفع</th>
                    <th style="text-align: center; width: 140px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($contributions)): ?>
                    <tr>
                        <td colspan="9" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد مساهمات مطابقة للشروط المحددة.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($contributions as $c):
                    $tBadge = $typeLabels[$c['contribution_type']] ?? $typeLabels['other'];
                    $sBadge = $statusLabels[$c['status']] ?? $statusLabels['pending'];
                    ?>
                    <tr>
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $c['id'] ?></td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;"><?= htmlspecialchars($c['student_name']) ?></div>
                            <?php if (!empty($c['notes'])): ?>
                                <div style="font-size: 11px; color: #64748b;" title="<?= htmlspecialchars($c['notes']) ?>">
                                    📝 <?= htmlspecialchars(mb_strimwidth($c['notes'], 0, 30, '...')) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <div style="font-weight: 600; color: #0284c7;"><?= htmlspecialchars($c['subject_name']) ?></div>
                            <?php if (!empty($c['course_code'])): ?>
                                <span class="badge-code"><?= htmlspecialchars($c['course_code']) ?></span>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="badge-faculty"><?= htmlspecialchars($c['faculty'] ?: 'عام') ?></span>
                        </td>
                        <td>
                            <span class="<?= $tBadge['badge'] ?>"><?= $tBadge['label'] ?></span>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#64748b"
                                    stroke-width="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <a href="<?= htmlspecialchars($c['file_url']) ?>" target="_blank" rel="noopener noreferrer"
                                    style="color: #2563eb; text-decoration: none; font-weight: 600; font-size: 12px;">
                                    <?= htmlspecialchars(mb_strimwidth($c['file_name'], 0, 25, '...')) ?>
                                </a>
                            </div>
                            <span
                                style="font-size: 10px; color: #94a3b8; text-transform: uppercase;"><?= htmlspecialchars($c['file_type']) ?></span>
                        </td>
                        <td>
                            <span class="<?= $sBadge['class'] ?>"><?= $sBadge['label'] ?></span>
                        </td>
                        <td style="color: #64748b; font-size: 12px;">
                            <?= date('Y/m/d H:i', strtotime($c['created_at'])) ?>
                        </td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                                <!-- زر تغيير الحالة السريع -->
                                <?php if ($c['status'] !== 'approved'): ?>
                                    <form method="POST" style="display:inline;">
                                        <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                        <input type="hidden" name="action" value="update_status">
                                        <input type="hidden" name="id" value="<?= $c['id'] ?>">
                                        <input type="hidden" name="new_status" value="approved">
                                        <button type="submit" class="btn-outline"
                                            style="color:#15803d; border-color:#bbf7d0; padding: 4px 8px; font-size:11px;"
                                            title="اعتماد ونشر">
                                            ✓ اعتماد
                                        </button>
                                    </form>
                                <?php endif; ?>

                                <!-- زر التعديل -->
                                <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openEditModal(<?= json_encode($c, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="تعديل">
                                    ✏️
                                </button>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل أنت متأكد من رغبتك بحذف هذه المساهمة نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $c['id'] ?>">
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

<!-- Modal: إضافة مساهمة جديدة -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>إضافة مساهمة طالب جديدة</h3>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الطالب المساهم</label>
                        <input type="text" name="student_name" class="form-input"
                            placeholder="مثال: يزن القضاة أو مساهم مجهول">
                    </div>
                    <div>
                        <label class="form-label">اسم المادة الدراسية *</label>
                        <input type="text" name="subject_name" class="form-input" required
                            placeholder="مثال: تفاضل وتكامل 1">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">رمز المادة (الكود)</label>
                        <input type="text" name="course_code" class="form-input" placeholder="مثال: MATH101">
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

                <div>
                    <label class="form-label">رابط الملف المرفوع (Cloudinary / Drive / مباشر) *</label>
                    <input type="url" name="file_url" class="form-input" required
                        placeholder="https://res.cloudinary.com/...">
                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الملف التوضيحي</label>
                        <input type="text" name="file_name" class="form-input" placeholder="ملخص_الفصل_الأول.pdf">
                    </div>
                    <div>
                        <label class="form-label">نوع الملف</label>
                        <select name="file_type" class="form-select">
                            <option value="pdf">PDF</option>
                            <option value="doc">Word / Doc</option>
                            <option value="image">صورة (Image)</option>
                            <option value="zip">أرشيف (ZIP)</option>
                            <option value="link">رابط خارجي</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع المساهمة</label>
                        <select name="contribution_type" class="form-select">
                            <?php foreach ($typeLabels as $tk => $tv): ?>
                                <option value="<?= $tk ?>"><?= $tv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">حالة النشر</label>
                        <select name="status" class="form-select">
                            <option value="approved">مُعتمد ومنشور مباشرة</option>
                            <option value="pending">قيد المراجعة</option>
                            <option value="rejected">مرفوض</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">ملاحظات داخلية للإدارة</label>
                    <textarea name="notes" class="form-input" rows="2"
                        placeholder="ملاحظات حول جودة الملف أو مصدره..."></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ ونشر المساهمة</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: تعديل مساهمة -->
<div id="editModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 600px;">
        <div class="modal-header">
            <h3>تعديل بيانات المساهمة</h3>
            <button type="button" class="modal-close" onclick="closeEditModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="id" id="edit_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الطالب المساهم</label>
                        <input type="text" name="student_name" id="edit_student_name" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">اسم المادة الدراسية *</label>
                        <input type="text" name="subject_name" id="edit_subject_name" class="form-input" required>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">رمز المادة (الكود)</label>
                        <input type="text" name="course_code" id="edit_course_code" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">الكلية</label>
                        <select name="faculty" id="edit_faculty" class="form-select">
                            <?php foreach ($facultiesList as $fac): ?>
                                <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">رابط الملف المرفوع *</label>
                    <input type="url" name="file_url" id="edit_file_url" class="form-input" required>
                </div>

                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">اسم الملف</label>
                        <input type="text" name="file_name" id="edit_file_name" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">نوع الملف</label>
                        <select name="file_type" id="edit_file_type" class="form-select">
                            <option value="pdf">PDF</option>
                            <option value="doc">Word / Doc</option>
                            <option value="image">صورة (Image)</option>
                            <option value="zip">أرشيف (ZIP)</option>
                            <option value="link">رابط خارجي</option>
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع المساهمة</label>
                        <select name="contribution_type" id="edit_contribution_type" class="form-select">
                            <?php foreach ($typeLabels as $tk => $tv): ?>
                                <option value="<?= $tk ?>"><?= $tv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">حالة النشر</label>
                        <select name="status" id="edit_status" class="form-select">
                            <option value="approved">مُعتمد ومنشور</option>
                            <option value="pending">قيد المراجعة</option>
                            <option value="rejected">مرفوض</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">ملاحظات داخلية</label>
                    <textarea name="notes" id="edit_notes" class="form-input" rows="2"></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeEditModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ التعديلات</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() {
        document.getElementById('addModal').style.display = 'flex';
    }
    function closeAddModal() {
        document.getElementById('addModal').style.display = 'none';
    }
    function openEditModal(c) {
        document.getElementById('edit_id').value = c.id;
        document.getElementById('edit_student_name').value = c.student_name || '';
        document.getElementById('edit_subject_name').value = c.subject_name || '';
        document.getElementById('edit_course_code').value = c.course_code || '';
        document.getElementById('edit_faculty').value = c.faculty || 'عام';
        document.getElementById('edit_file_url').value = c.file_url || '';
        document.getElementById('edit_file_name').value = c.file_name || '';
        document.getElementById('edit_file_type').value = c.file_type || 'pdf';
        document.getElementById('edit_contribution_type').value = c.contribution_type || 'summary';
        document.getElementById('edit_status').value = c.status || 'approved';
        document.getElementById('edit_notes').value = c.notes || '';
        document.getElementById('editModal').style.display = 'flex';
    }
    function closeEditModal() {
        document.getElementById('editModal').style.display = 'none';
    }
    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
        if (event.target == document.getElementById('editModal')) closeEditModal();
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>