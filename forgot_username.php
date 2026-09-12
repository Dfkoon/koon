<?php
require __DIR__ . '/config.php';

if (!empty($_SESSION['authenticated'])) {
    redirect('dashboard.php');
}

$message = null;
$error = null;
$db = get_db();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    enforce_rate_limit('username_recovery_request', 5, 900, 'تم تجاوز عدد طلبات الاستعادة. حاول لاحقاً.');
    $email = strtolower(trim($_POST['email'] ?? ''));
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $error = 'انتهت صلاحية الجلسة، أعد المحاولة.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'أدخل بريدًا إلكترونيًا صحيحًا.';
    } else {
        $stmt = $db->prepare('SELECT username, full_name FROM users WHERE LOWER(email)=? LIMIT 1');
        $stmt->execute([$email]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $subject = 'اسم المستخدم في لوحة التحكم';
            $body = "مرحبًا {$user['full_name']}،\n\nاسم المستخدم المرتبط بحسابك هو: {$user['username']}\n\nإذا لم تطلب هذه الرسالة، تجاهلها.";
            $headers = "Content-Type: text/plain; charset=UTF-8\r\nFrom: no-reply@" . ($_SERVER['HTTP_HOST'] ?? 'localhost') . "\r\n";
            @mail($email, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
        }
        $message = 'إذا كان البريد مسجلاً، ستصلك رسالة باسم المستخدم خلال دقائق.';
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>استعادة اسم المستخدم</title>
    <link rel="stylesheet" href="assets/style.css">
</head>

<body class="simple-page">
    <div class="card">
        <div class="icon-wrap">👤</div>
        <h1>استعادة اسم المستخدم</h1>
        <p class="subtitle">أدخل البريد المرتبط بالحساب لإرسال اسم المستخدم بشكل آمن.</p><?php if ($error): ?>
            <div class="error-box"><?= htmlspecialchars($error) ?></div><?php endif; ?><?php if ($message): ?>
            <div class="success-box"><?= htmlspecialchars($message) ?></div><?php endif; ?>
        <form method="post" autocomplete="off"><input type="hidden" name="csrf"
                value="<?= htmlspecialchars(csrf_token()) ?>"><label>البريد الإلكتروني</label><input type="email"
                name="email" required autocomplete="email" placeholder="name@example.com"><button type="submit"
                class="primary">إرسال اسم المستخدم</button></form><a href="login.php" class="link-btn">العودة لتسجيل
            الدخول</a>
    </div>
</body>

</html>