<?php
$page_key = 'activity';
$page_title = 'سجل النشاط والعمليات وتدقيق الأمان';
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();

// معالجة الفلاتر
$filterUser = trim((string) ($_GET['username'] ?? ''));
$filterType = trim((string) ($_GET['action_type'] ?? ''));
$filterDateFrom = trim((string) ($_GET['date_from'] ?? ''));
$filterDateTo = trim((string) ($_GET['date_to'] ?? ''));
$filterQuery = trim((string) ($_GET['q'] ?? ''));
$filterSensitive = !empty($_GET['sensitive']);

$where = [];
$params = [];

if ($filterUser !== '') {
    $where[] = 'username = ?';
    $params[] = $filterUser;
}

if ($filterType !== '' && $filterType !== 'all') {
    $where[] = 'action_type = ?';
    $params[] = $filterType;
}

if ($filterDateFrom !== '') {
    $where[] = 'created_at >= ?';
    $params[] = $filterDateFrom . ' 00:00:00';
}

if ($filterDateTo !== '') {
    $where[] = 'created_at <= ?';
    $params[] = $filterDateTo . ' 23:59:59';
}

if ($filterQuery !== '') {
    $where[] = '(action LIKE ? OR ip_address LIKE ? OR device_info LIKE ?)';
    $likeQ = '%' . $filterQuery . '%';
    $params[] = $likeQ;
    $params[] = $likeQ;
    $params[] = $likeQ;
}

if ($filterSensitive) {
    // تصفية العمليات الحساسة (حذف، أمان، صلاحيات، قفل، كلمة مرور)
    $where[] = "(action_type = 'security' OR action LIKE '%حذف%' OR action LIKE '%كلمة%' OR action LIKE '%صلاحية%' OR action LIKE '%قفل%' OR action LIKE '%تعطيل%' OR action LIKE '%إيقاف%' OR action LIKE '%delete%')";
}

$whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

// ── التصدير كـ CSV (Excel مع دعم العربية UTF-8 BOM) ───────────────────────────
if (!empty($_GET['export']) && $_GET['export'] === 'csv') {
    $exportStmt = $db->prepare("SELECT id, username, action_type, action, ip_address, device_info, created_at FROM activity_log {$whereClause} ORDER BY id DESC LIMIT 5000");
    $exportStmt->execute($params);
    $rows = $exportStmt->fetchAll(PDO::FETCH_ASSOC);

    $filename = 'activity_log_' . date('Y-m-d_His') . '.csv';
    header('Content-Type: text/csv; charset=UTF-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Pragma: no-cache');
    header('Expires: 0');

    // BOM لدعم فتح الملف في Microsoft Excel بدون تشويه الحروف العربية
    echo "\xEF\xBB\xBF";

    $output = fopen('php://output', 'w');
    fputcsv($output, ['رقم المعرف', 'المستخدم', 'نوع الإجراء', 'تفاصيل الإجراء', 'عنوان IP', 'الجهاز / المتصفح', 'التاريخ والوقت']);
    foreach ($rows as $r) {
        fputcsv($output, [
            $r['id'],
            $r['username'],
            $r['action_type'],
            $r['action'],
            $r['ip_address'],
            $r['device_info'],
            $r['created_at'],
        ]);
    }
    fclose($output);
    exit;
}

// ── الترقيم (Pagination) ───────────────────────────────────────────────────────
$countStmt = $db->prepare("SELECT COUNT(*) FROM activity_log {$whereClause}");
$countStmt->execute($params);
$totalRecords = (int) $countStmt->fetchColumn();

$perPage = 50;
$totalPages = max(1, (int) ceil($totalRecords / $perPage));
$page = max(1, min($totalPages, (int) ($_GET['page'] ?? 1)));
$offset = ($page - 1) * $perPage;

$dataStmt = $db->prepare("SELECT * FROM activity_log {$whereClause} ORDER BY id DESC LIMIT ? OFFSET ?");
$dataParams = array_merge($params, [$perPage, $offset]);
$dataStmt->execute($dataParams);
$logs = $dataStmt->fetchAll(PDO::FETCH_ASSOC);

// قائمة المستخدمين لفلتر البحث
$usersList = $db->query("SELECT DISTINCT username FROM activity_log ORDER BY username ASC")->fetchAll(PDO::FETCH_COLUMN);

// أنواع الإجراءات المتاحة
$actionTypes = [
    'all' => 'كافة الأنواع',
    'security' => '🛡️ تنبيهات الأمان',
    'auth' => '🔑 تسجيل الدخول والجلسات',
    'settings' => '⚙️ إعدادات النظام والنسخ',
    'reports' => '📢 البلاغات والشكاوى',
    'materials' => '📚 المواد الدراسية',
    'tests' => '📝 الكويزات والاختبارات',
    'general' => '📌 نشاط عام',
];

require __DIR__ . '/_header.php';
?>

<style>
@media print {
    body { background: #fff !important; color: #000 !important; }
    .sidebar, .top-header, .panel-filter-bar, .pagination-box, .btn-no-print { display: none !important; }
    .panel-box { box-shadow: none !important; border: 1px solid #ccc !important; }
}
.badge-action {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 700;
}
.badge-sec { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
.badge-auth { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
.badge-set { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
.badge-gen { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
</style>

<!-- رأس الصفحة والتحكم -->
<div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:16px; margin-bottom:20px;">
    <div>
        <h2 style="font-family:'Cairo',sans-serif; font-size:22px; font-weight:900; margin:0 0 4px; color:#0f172a; display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#0284c7" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            سجل النشاط وتدقيق العمليات
        </h2>
        <p style="margin:0; font-size:13px; color:#64748b;">متابعة تفصيلية وفورية لجميع العمليات الإدارية، تسجيلات الدخول، وإجراءات المشرفين والمنسقين</p>
    </div>

    <div class="btn-no-print" style="display:flex; gap:10px; flex-wrap:wrap;">
        <!-- زر تصدير CSV -->
        <?php
        $exportQuery = $_GET;
        $exportQuery['export'] = 'csv';
        $exportUrl = '?' . http_build_query($exportQuery);
        ?>
        <a href="<?= htmlspecialchars($exportUrl) ?>" class="btn-secondary" style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; padding:9px 16px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; text-decoration:none; color:#1e293b;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            تصدير إلى Excel / CSV
        </a>

        <!-- زر طباعة التقرير -->
        <button onclick="window.print()" class="btn-secondary" style="display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:700; padding:9px 16px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; cursor:pointer; color:#1e293b;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
            طباعة تقرير التدقيق
        </button>
    </div>
</div>

<!-- صندوق الفلاتر والبحث -->
<div class="panel-box btn-no-print" style="margin-bottom:20px; padding:18px;">
    <form method="GET" action="" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:14px; align-items:end;">
        <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">المستخدم / المشرف:</label>
            <select name="username" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                <option value="">جميع المستخدمين</option>
                <?php foreach ($usersList as $u): ?>
                    <option value="<?= htmlspecialchars($u) ?>" <?= $filterUser === $u ? 'selected' : '' ?>><?= htmlspecialchars($u) ?></option>
                <?php endforeach; ?>
            </select>
        </div>

        <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">نوع الإجراء:</label>
            <select name="action_type" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                <?php foreach ($actionTypes as $typeKey => $typeLabel): ?>
                    <option value="<?= $typeKey ?>" <?= $filterType === $typeKey ? 'selected' : '' ?>><?= $typeLabel ?></option>
                <?php endforeach; ?>
            </select>
        </div>

        <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">من تاريخ:</label>
            <input type="date" name="date_from" value="<?= htmlspecialchars($filterDateFrom) ?>" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
        </div>

        <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">إلى تاريخ:</label>
            <input type="date" name="date_to" value="<?= htmlspecialchars($filterDateTo) ?>" style="width:100%; padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
        </div>

        <div>
            <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">بحث نصي أو IP:</label>
            <input type="text" name="q" placeholder="نص الإجراء أو عنوان IP..." value="<?= htmlspecialchars($filterQuery) ?>" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
        </div>

        <div style="display:flex; gap:8px; align-items:center;">
            <button type="submit" class="btn-primary" style="flex:1; padding:9px 14px; font-weight:800; font-size:13px; border-radius:8px; background:#0284c7; color:#fff; border:none; cursor:pointer;">
                تطبيق الفلترة
            </button>
            <a href="activity_log.php" style="padding:9px 12px; font-size:13px; color:#64748b; background:#f1f5f9; border-radius:8px; text-decoration:none; font-weight:700;">
                إعادة ضبط
            </a>
        </div>
    </form>

    <!-- فلتر سريع للعمليات الحساسة -->
    <div style="margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
        <span style="font-size:12px; font-weight:700; color:#64748b;">فلاتر سريعة:</span>
        <a href="?sensitive=1" style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:6px; text-decoration:none; background:<?= $filterSensitive ? '#fee2e2' : '#f8fafc' ?>; color:<?= $filterSensitive ? '#b91c1c' : '#475569' ?>; border:1px solid <?= $filterSensitive ? '#f87171' : '#e2e8f0' ?>;">
            🚨 العمليات الحساسة فقط (حذف، أمان، صلاحيات)
        </a>
        <a href="?action_type=security" style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:6px; text-decoration:none; background:<?= $filterType === 'security' ? '#fee2e2' : '#f8fafc' ?>; color:<?= $filterType === 'security' ? '#b91c1c' : '#475569' ?>; border:1px solid #e2e8f0;">
            🛡️ تنبيهات الأمان والدخول غير المعتاد
        </a>
        <a href="?action_type=auth" style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:6px; text-decoration:none; background:<?= $filterType === 'auth' ? '#e0f2fe' : '#f8fafc' ?>; color:<?= $filterType === 'auth' ? '#0369a1' : '#475569' ?>; border:1px solid #e2e8f0;">
            🔑 تسجيلات الدخول الحديثة
        </a>
        <span style="margin-right:auto; font-size:12px; color:#64748b; font-weight:600;">
            إجمالي السجلات المطابقة: <strong><?= number_format($totalRecords) ?></strong>
        </span>
    </div>
</div>

<!-- جدول السجلات -->
<div class="panel-box">
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 70px;">#</th>
                    <th>المستخدم</th>
                    <th style="width: 120px;">النوع</th>
                    <th>الإجراء المنفذ</th>
                    <th>الجهاز ونظام التشغيل</th>
                    <th>عنوان IP</th>
                    <th style="width: 150px;">التاريخ والوقت</th>
                </tr>
            </thead>
            <tbody>
                <?php if (!$logs): ?>
                    <tr>
                        <td colspan="7" style="text-align:center; color:#64748b; padding:40px;">
                            لا توجد سجلات مطابقة للخيارات المحددة.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($logs as $l): ?>
                    <?php
                    $isSecurity = ($l['action_type'] === 'security') || str_contains($l['action'], 'تسجيل دخول جديد من جهاز أو عنوان غير معتاد');
                    $isDelete = str_contains($l['action'], 'حذف') || str_contains($l['action'], 'delete');
                    ?>
                    <tr style="<?= $isSecurity ? 'background:#fff5f5;' : ($isDelete ? 'background:#fefbf2;' : '') ?>">
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $l['id'] ?></td>
                        <td>
                            <strong style="color: #0284c7;"><?= htmlspecialchars($l['username']) ?></strong>
                        </td>
                        <td>
                            <?php if ($isSecurity): ?>
                                <span class="badge-action badge-sec">🛡️ أمان</span>
                            <?php elseif ($l['action_type'] === 'auth'): ?>
                                <span class="badge-action badge-auth">🔑 دخول</span>
                            <?php elseif ($l['action_type'] === 'settings'): ?>
                                <span class="badge-action badge-set">⚙️ نظام</span>
                            <?php else: ?>
                                <span class="badge-action badge-gen"><?= htmlspecialchars($l['action_type'] ?: 'عام') ?></span>
                            <?php endif; ?>
                        </td>
                        <td style="font-weight: 600; color: <?= $isSecurity ? '#b91c1c' : ($isDelete ? '#c2410c' : '#0f172a') ?>;">
                            <?= htmlspecialchars($l['action']) ?>
                        </td>
                        <td>
                            <span style="font-size: 12px; color: #64748b;"><?= htmlspecialchars($l['device_info'] ?? 'متصفح ويب') ?></span>
                        </td>
                        <td>
                            <code style="font-size: 12px; background:#f1f5f9; padding:2px 6px; border-radius:4px;"><?= htmlspecialchars($l['ip_address'] ?? '127.0.0.1') ?></code>
                        </td>
                        <td style="color: #64748b; font-size: 12px; font-family:monospace;">
                            <?= htmlspecialchars($l['created_at']) ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <!-- شريط الترقيم (Pagination) -->
    <?php if ($totalPages > 1): ?>
        <div class="pagination-box btn-no-print" style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid #f1f5f9; background:#f8fafc;">
            <span style="font-size:13px; color:#64748b;">
                الصفحة <strong><?= $page ?></strong> من <strong><?= $totalPages ?></strong>
            </span>
            <div style="display:flex; gap:6px;">
                <?php
                $navQuery = $_GET;
                if ($page > 1) {
                    $navQuery['page'] = $page - 1;
                    echo '<a href="?' . http_build_query($navQuery) . '" class="btn-secondary" style="padding:6px 12px; border-radius:6px; font-size:12px; text-decoration:none; background:#fff; border:1px solid #cbd5e1; color:#0f172a;">« السابق</a>';
                }
                // أرقام الصفحات القريبة
                $startP = max(1, $page - 2);
                $endP = min($totalPages, $page + 2);
                for ($p = $startP; $p <= $endP; $p++) {
                    $navQuery['page'] = $p;
                    $isActive = ($p === $page);
                    echo '<a href="?' . http_build_query($navQuery) . '" style="padding:6px 12px; border-radius:6px; font-size:12px; text-decoration:none; font-weight:700; ' . ($isActive ? 'background:#0284c7; color:#fff;' : 'background:#fff; border:1px solid #cbd5e1; color:#0f172a;') . '">' . $p . '</a>';
                }
                if ($page < $totalPages) {
                    $navQuery['page'] = $page + 1;
                    echo '<a href="?' . http_build_query($navQuery) . '" class="btn-secondary" style="padding:6px 12px; border-radius:6px; font-size:12px; text-decoration:none; background:#fff; border:1px solid #cbd5e1; color:#0f172a;">التالي »</a>';
                }
                ?>
            </div>
        </div>
    <?php endif; ?>
</div>

<?php require __DIR__ . '/_footer.php'; ?>
