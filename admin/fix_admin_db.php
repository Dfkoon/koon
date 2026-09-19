<?php
/**
 * صفحة طوارئ لإصلاح دور المستخدم في قاعدة البيانات
 * احذف هذا الملف بعد استخدامه مباشرة!
 */
require __DIR__ . '/../config.php';

if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    die('يجب تسجيل الدخول أولاً.');
}

$db = get_db();
$users = $db->query('SELECT id, username, role, permissions FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
$message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['fix'])) {
    $uid = (int) ($_POST['user_id'] ?? 0);
    $newRole = $_POST['new_role'] ?? 'admin';
    if ($uid > 0) {
        $db->prepare('UPDATE users SET role = ?, permissions = ? WHERE id = ?')
           ->execute([$newRole, '["*"]', $uid]);
        $message = "✅ تم تحديث المستخدم ID=$uid إلى role=$newRole وpermissions=[\"*\"]";
        $users = $db->query('SELECT id, username, role, permissions FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>إصلاح قاعدة البيانات - طوارئ</title>
<style>
body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; padding: 30px; direction: rtl; }
h1 { color: #f39c12; }
.warning { background: #c0392b; padding: 15px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; }
.success { background: #27ae60; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; background: #16213e; border-radius: 8px; overflow: hidden; }
th, td { padding: 12px; border: 1px solid #333; text-align: right; }
th { background: #0f3460; }
.btn { background: #27ae60; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
</style>
</head>
<body>
<h1>🔧 صفحة إصلاح قاعدة البيانات</h1>
<div class="warning">⚠️ احذف هذا الملف فور الانتهاء من الإصلاح!</div>
<?php if ($message): ?><div class="success"><?= htmlspecialchars($message) ?></div><?php endif; ?>
<h2>المستخدمون الحاليون</h2>
<table>
<tr><th>ID</th><th>اسم المستخدم</th><th>الدور الحالي</th><th>الصلاحيات</th><th>إصلاح</th></tr>
<?php foreach ($users as $u): ?>
<tr>
    <td><?= $u['id'] ?></td>
    <td><?= htmlspecialchars($u['username']) ?></td>
    <td style="color:<?= $u['role']==='admin'?'#2ecc71':'#e74c3c' ?>"><?= htmlspecialchars($u['role']) ?></td>
    <td><?= htmlspecialchars($u['permissions'] ?? 'فارغ') ?></td>
    <td>
        <form method="POST" style="display:inline">
            <input type="hidden" name="user_id" value="<?= $u['id'] ?>">
            <input type="hidden" name="new_role" value="admin">
            <button type="submit" name="fix" class="btn">جعله admin</button>
        </form>
    </td>
</tr>
<?php endforeach; ?>
</table>
<br>
<div class="warning">بعد الإصلاح احذف الملف: <code>rm /home/makanak-admin/www/admin/fix_admin_db.php</code></div>
</body>
</html>
