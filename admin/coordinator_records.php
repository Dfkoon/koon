<?php
$page_key = 'coordinator_records';
$page_title = 'سجل المنسقين وحالة المحتوى';
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();
$userId = (int) ($_SESSION['user_id'] ?? 0);
$userStmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1');
$userStmt->execute([$userId]);
$currentUser = $userStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$isAdmin = in_array($currentUser['role'] ?? '', ['admin', 'super_admin'], true) || $userId === 1 || strtoupper((string) ($currentUser['username'] ?? '')) === 'HUSSIEN';
if (!$isAdmin) {
    http_response_code(403);
    exit('غير مصرح: هذه الصفحة متاحة للأدمن فقط.');
}

$coordId = max(0, (int) ($_GET['coordinator_id'] ?? 0));
$actionType = trim((string) ($_GET['action_type'] ?? ''));
$limit = 300;

$coordinators = $db->query('SELECT c.id, c.name, c.user_id, u.username FROM coordinators c LEFT JOIN users u ON u.id = c.user_id ORDER BY c.name')->fetchAll(PDO::FETCH_ASSOC);
$auditWhere = [];
$auditParams = [];
if ($coordId > 0) {
    $auditWhere[] = 'a.coordinator_id = ?';
    $auditParams[] = $coordId;
}
if ($actionType !== '') {
    $auditWhere[] = 'a.action_type = ?';
    $auditParams[] = $actionType;
}
$auditSql = 'SELECT a.*, c.name AS coordinator_name FROM coordinator_audit_log a LEFT JOIN coordinators c ON c.id = a.coordinator_id'
    . ($auditWhere ? ' WHERE ' . implode(' AND ', $auditWhere) : '')
    . ' ORDER BY a.id DESC LIMIT ' . $limit;
$auditStmt = $db->prepare($auditSql);
$auditStmt->execute($auditParams);
$auditRows = $auditStmt->fetchAll(PDO::FETCH_ASSOC);

$quizParts = $db->query("SELECT p.id, COALESCE(NULLIF(p.name, ''), p.title) AS title, p.slug, s.name AS subject_name,
    COUNT(q.id) AS question_count
    FROM quiz_parts p LEFT JOIN quiz_subjects s ON s.id = p.subject_id
    LEFT JOIN quiz_questions q ON q.part_id = p.id OR q.part_slug = p.slug
    GROUP BY p.id ORDER BY subject_name, title")->fetchAll(PDO::FETCH_ASSOC);

$requestedMaterials = [];
try {
    $requestedStmt = $db->query("SELECT id, student_name, student_phone, faculty, service_type, course_name, details, status, created_at,
        CASE WHEN EXISTS (SELECT 1 FROM study_materials sm WHERE sm.course_name = service_requests.course_name AND sm.status IN ('published', 'active', 'approved')) THEN 1 ELSE 0 END AS material_added
        FROM service_requests WHERE LOWER(service_type) LIKE '%quiz%' OR LOWER(service_type) LIKE '%material%' OR LOWER(service_type) LIKE '%مادة%' OR LOWER(service_type) LIKE '%سؤال%'
        ORDER BY id DESC LIMIT 300");
    $requestedMaterials = $requestedStmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    $requestedMaterials = [];
}

$actionTypes = $db->query('SELECT DISTINCT action_type FROM coordinator_audit_log ORDER BY action_type')->fetchAll(PDO::FETCH_COLUMN);
require __DIR__ . '/_header.php';
?>
<style>
    .coord-records-hero {
        background: linear-gradient(135deg, #0f2f4a 0%, #075985 58%, #0e7490 100%);
        color: #fff;
        border-radius: 16px;
        padding: 24px 26px;
        margin-bottom: 18px;
        box-shadow: 0 12px 28px rgba(7, 89, 133, .18);
    }

    .coord-records-hero h2 {
        margin: 0 0 6px;
        font-size: 21px;
    }

    .coord-records-hero p {
        margin: 0;
        color: #dbeafe;
        font-size: 13px;
    }

    .coord-records-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 20px;
    }

    .coord-records-kpi {
        background: rgba(255, 255, 255, .12);
        border: 1px solid rgba(255, 255, 255, .18);
        border-radius: 12px;
        padding: 12px 14px;
    }

    .coord-records-kpi strong {
        display: block;
        font-size: 22px;
    }

    .coord-records-kpi span {
        color: #dbeafe;
        font-size: 11px;
    }

    .coord-records-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
    }

    .coord-records-section-title small {
        color: #64748b;
        font-weight: 600;
    }

    .coord-status-summary {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 0 0 12px;
    }

    .coord-status-chip {
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 800;
    }

    .coord-status-chip.done {
        background: #dcfce7;
        color: #166534;
    }

    .coord-status-chip.waiting {
        background: #fef3c7;
        color: #92400e;
    }

    @media (max-width: 800px) {
        .coord-records-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
    }
</style>
<?php
$quizTotal = count($quizParts);
$quizDone = count(array_filter($quizParts, static fn($part) => (int) $part['question_count'] > 0));
$quizWaiting = $quizTotal - $quizDone;
$auditTotal = count($auditRows);
?>
<section class="coord-records-hero">
    <h2>سجل المنسقين ومراقبة المحتوى</h2>
    <p>كل عملية ينفذها المنسق محفوظة بالوقت والحساب والجهاز، مع متابعة جاهزية بنوك الأسئلة وطلبات الطلاب.</p>
    <div class="coord-records-kpis">
        <div class="coord-records-kpi"><strong><?= $auditTotal ?></strong><span>عملية في العرض الحالي</span></div>
        <div class="coord-records-kpi"><strong><?= $quizDone ?></strong><span>اختبارًا تمت إضافة أسئلته</span></div>
        <div class="coord-records-kpi"><strong><?= $quizWaiting ?></strong><span>اختبارًا بانتظار الأسئلة</span></div>
        <div class="coord-records-kpi">
            <strong><?= $quizTotal ? round(($quizDone / $quizTotal) * 100) : 0 ?>%</strong><span>جاهزية بنك
                الاختبارات</span></div>
    </div>
</section>
<div class="panel-box" style="margin-bottom:18px;">
    <div class="panel-box-header">
        <h2 class="panel-box-title">سجل المنسقين وحالة المحتوى</h2><span class="panel-box-count">للأدمن فقط</span>
    </div>
    <div class="panel-box-body">
        <form method="get" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
            <label style="min-width:220px;">المنسق
                <select name="coordinator_id" class="form-control">
                    <option value="0">كل المنسقين</option>
                    <?php foreach ($coordinators as $coordinator): ?>
                        <option value="<?= (int) $coordinator['id'] ?>" <?= $coordId === (int) $coordinator['id'] ? 'selected' : '' ?>>
                            <?= htmlspecialchars($coordinator['name']) ?>
                            <?= $coordinator['username'] ? ' (@' . htmlspecialchars($coordinator['username']) . ')' : '' ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </label>
            <label style="min-width:180px;">نوع العملية
                <select name="action_type" class="form-control">
                    <option value="">كل العمليات</option><?php foreach ($actionTypes as $type): ?>
                        <option value="<?= htmlspecialchars($type) ?>" <?= $actionType === $type ? 'selected' : '' ?>>
                            <?= htmlspecialchars($type) ?>
                        </option><?php endforeach; ?>
                </select>
            </label>
            <button class="btn btn-primary" type="submit">تطبيق الفلتر</button>
            <a class="btn btn-secondary" href="coordinator_records.php">مسح</a>
        </form>
    </div>
</div>

<div class="panel-box" style="margin-bottom:18px;">
    <div class="panel-box-header">
        <h3 class="panel-box-title">العمليات المنفذة بواسطة المنسقين</h3><span
            class="panel-box-count"><?= count($auditRows) ?> سجل</span>
    </div>
    <div class="table-wrapper">
        <table class="data-table">
            <thead>
                <tr>
                    <th>المنسق</th>
                    <th>الحساب</th>
                    <th>العملية</th>
                    <th>النوع</th>
                    <th>التاريخ والوقت</th>
                    <th>الجهاز / IP</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($auditRows as $row): ?>
                    <tr>
                        <td><?= htmlspecialchars($row['coordinator_name'] ?: 'غير مرتبط') ?></td>
                        <td><?= htmlspecialchars($row['username']) ?></td>
                        <td><?= htmlspecialchars($row['action']) ?></td>
                        <td><?= htmlspecialchars($row['action_type']) ?></td>
                        <td><?= htmlspecialchars($row['created_at']) ?></td>
                        <td><?= htmlspecialchars(($row['ip_address'] ?: '—') . ' / ' . ($row['device_info'] ?: '—')) ?></td>
                    </tr><?php endforeach; ?>
                <?php if (!$auditRows): ?>
                    <tr>
                        <td colspan="6" style="text-align:center;padding:28px;color:#64748b;">لا توجد عمليات مسجلة بعد.
                            ستظهر تلقائياً عند تنفيذ المنسق أي إجراء.</td>
                    </tr><?php endif; ?>
            </tbody>
        </table>
    </div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px;">
    <div class="panel-box">
        <div class="panel-box-header coord-records-section-title">
            <div>
                <h3 class="panel-box-title">حالة الاختبارات وبنوك الأسئلة</h3><small>تابع ما تم تجهيزه وما يحتاج
                    تدخلاً</small>
            </div><span class="panel-box-count"><?= count($quizParts) ?></span>
        </div>
        <div class="table-wrapper">
            <div class="coord-status-summary" style="padding:12px 14px 0;"><span class="coord-status-chip done">تمت
                    الإضافة: <?= $quizDone ?></span><span class="coord-status-chip waiting">بانتظار الإضافة:
                    <?= $quizWaiting ?></span></div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>المادة</th>
                        <th>الاختبار</th>
                        <th>عدد الأسئلة</th>
                        <th>الحالة</th>
                    </tr>
                </thead>
                <tbody><?php foreach ($quizParts as $part): ?>
                        <tr>
                            <td><?= htmlspecialchars($part['subject_name'] ?: 'غير مصنف') ?></td>
                            <td><?= htmlspecialchars($part['title'] ?: $part['slug']) ?></td>
                            <td><?= (int) $part['question_count'] ?></td>
                            <td><span
                                    class="custom-badge <?= (int) $part['question_count'] > 0 ? 'badge-success' : 'badge-warning' ?>"><?= (int) $part['question_count'] > 0 ? 'تمت الإضافة' : 'بانتظار الإضافة' ?></span>
                            </td>
                        </tr><?php endforeach; ?><?php if (!$quizParts): ?>
                        <tr>
                            <td colspan="4" style="text-align:center;padding:22px;color:#64748b;">لا توجد اختبارات مسجلة.
                            </td>
                        </tr><?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
    <div class="panel-box">
        <div class="panel-box-header">
            <h3 class="panel-box-title">طلبات الطلاب لمواد أو بنوك أسئلة</h3><span
                class="panel-box-count"><?= count($requestedMaterials) ?></span>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>الطالب</th>
                        <th>المادة / الطلب</th>
                        <th>حالة الإضافة</th>
                        <th>حالة الطلب</th>
                        <th>التاريخ</th>
                    </tr>
                </thead>
                <tbody><?php foreach ($requestedMaterials as $request): ?>
                        <tr>
                            <td><?= htmlspecialchars($request['student_name'] ?: 'طالب') ?></td>
                            <td><?= htmlspecialchars($request['course_name'] ?: $request['service_type']) ?>
                                <div style="font-size:11px;color:#64748b;">
                                    <?= htmlspecialchars($request['details'] ?: '') ?>
                                </div>
                            </td>
                            <td><span
                                    class="custom-badge <?= !empty($request['material_added']) ? 'badge-success' : 'badge-warning' ?>"><?= !empty($request['material_added']) ? 'تمت الإضافة' : 'لم تتم الإضافة بعد' ?></span>
                            </td>
                            <td><?= htmlspecialchars($request['status'] ?: 'pending') ?></td>
                            <td><?= htmlspecialchars($request['created_at']) ?></td>
                        </tr><?php endforeach; ?><?php if (!$requestedMaterials): ?>
                        <tr>
                            <td colspan="5" style="text-align:center;padding:22px;color:#64748b;">لا توجد طلبات مسجلة.</td>
                        </tr><?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>
</div>
<?php require __DIR__ . '/_footer.php'; ?>