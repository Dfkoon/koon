<?php
require __DIR__ . '/config.php';

if (!empty($_SESSION['authenticated'])) {
    redirect('dashboard.php');
}

$token = trim($_GET['token'] ?? $_POST['token'] ?? '');
$error = null;
$message = null;
$db = get_db();
$user = null;
if (preg_match('/^[a-f0-9]{64}$/', $token)) {
    $stmt = $db->prepare('SELECT * FROM users WHERE password_reset_token_hash=? AND password_reset_expires_at>? LIMIT 1');
    $stmt->execute([hash('sha256', $token), time()]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$user) {
        $error = 'رابط الاستعادة غير صالح أو انتهت صلاحيته.';
    } elseif (!csrf_check($_POST['csrf'] ?? '')) {
        $error = 'انتهت صلاحية الجلسة، أعد المحاولة.';
    } else {
        $temporaryPassword = 'Makanak-' . strtoupper(bin2hex(random_bytes(4))) . '!';
        $hash = password_hash($temporaryPassword, PASSWORD_DEFAULT);
        $db->prepare('UPDATE users SET password_hash=?, must_change_password=1, totp_enabled=0, totp_secret=NULL, password_reset_token_hash=NULL, password_reset_expires_at=0 WHERE id=?')
            ->execute([$hash, $user['id']]);
        $subject = 'كلمة المرور المؤقتة للوحة التحكم';
        $body = "مرحبًا {$user['full_name']}،\n\nتم إنشاء كلمة مرور مؤقتة لحسابك: {$temporaryPassword}\n\nاسم المستخدم: {$user['username']}\n\nاستخدمها مرة واحدة فقط، وسيطلب منك النظام تغييرها مباشرة بعد الدخول.\nإذا لم تطلب هذه العملية، تواصل مع مسؤول النظام فورًا.";
        $headers = "Content-Type: text/plain; charset=UTF-8\r\nFrom: no-reply@" . ($_SERVER['HTTP_HOST'] ?? 'localhost') . "\r\n";
        @mail($user['email'], '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
        $message = 'تم إنشاء كلمة مرور مؤقتة وإرسالها إلى بريدك. ستُجبر على تغييرها بعد الدخول.';
        $user = null;
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تأكيد استعادة كلمة المرور</title>
    <link rel="stylesheet" href="assets/style.css">
</head>

<body class="simple-page">
    <div class="card">
        <div class="icon-wrap">🔑</div>
        <h1>تأكيد الاستعادة</h1><?php if ($error): ?>
            <div class="error-box"><?= htmlspecialchars($error) ?></div><?php elseif ($message): ?>
            <div class="success-box"><?= htmlspecialchars($message) ?></div><a href="login.php" class="link-btn">الانتقال
                لتسجيل الدخول</a><?php elseif ($user): ?>
            <p class="subtitle">سيتم إنشاء كلمة مرور مؤقتة وإرسالها إلى البريد المسجل. هذه العملية تلغي جلسات المصادقة
                الحالية.</p>
            <form method="post"><input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>"><input
                    type="hidden" name="token" value="<?= htmlspecialchars($token) ?>"><button type="submit"
                    class="primary">إرسال كلمة المرور المؤقتة</button></form><?php else: ?>
            <div class="error-box">رابط الاستعادة غير صالح أو انتهت صلاحيته.</div><?php endif; ?><a href="login.php"
            class="link-btn">العودة لتسجيل الدخول</a>
    </div>
</body>

</html>