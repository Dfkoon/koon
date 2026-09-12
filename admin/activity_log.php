<?php
$page_key = 'activity';
$page_title = 'سجل النشاط والعمليات';
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();
$logs = $db->query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200')->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>
<div class="panel-box">
    <div class="panel-box-header">
        <h3 class="panel-box-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-left: 6px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            سجل العمليات والنشاطات الأخيرة
        </h3>
    </div>
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 60px;">#</th>
                    <th>المستخدم / المنسق</th>
                    <th>الإجراء المنفذ</th>
                    <th>الجهاز ونظام التشغيل</th>
                    <th>عنوان IP</th>
                    <th>التاريخ والوقت</th>
                </tr>
            </thead>
            <tbody>
                <?php if (!$logs): ?>
                    <tr><td colspan="6" style="text-align:center; color:#64748b; padding:30px;">لا يوجد نشاط مسجّل بعد.</td></tr>
                <?php endif; ?>
                <?php foreach ($logs as $l): ?>
                    <tr>
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $l['id'] ?></td>
                        <td style="font-weight: 700; color: #0284c7;"><?= htmlspecialchars($l['username']) ?></td>
                        <td style="font-weight: 600; color: #0f172a;"><?= htmlspecialchars($l['action']) ?></td>
                        <td><span style="font-size: 12px; color: #64748b;"><?= htmlspecialchars($l['device_info'] ?? 'متصفح ويب') ?></span></td>
                        <td><code style="font-size: 12px;"><?= htmlspecialchars($l['ip_address'] ?? '127.0.0.1') ?></code></td>
                        <td style="color: #64748b; font-size: 12px;"><?= htmlspecialchars($l['created_at']) ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php require __DIR__ . '/_footer.php'; ?>
