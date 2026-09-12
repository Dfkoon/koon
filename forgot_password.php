<?php
require __DIR__ . '/config.php';

if (!empty($_SESSION['authenticated'])) {
    redirect('dashboard.php');
}

$message = null;
$error = null;
$whatsappNumber = '962782934685';
$whatsappLink = null;
$db = get_db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    enforce_rate_limit('password_reset_request', 5, 900, 'تم تجاوز عدد طلبات الاستعادة. حاول لاحقاً.');
    $email = strtolower(trim($_POST['email'] ?? ''));
    $username = strtolower(trim($_POST['username'] ?? ''));
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $error = 'انتهت صلاحية الجلسة، أعد المحاولة.';
    } elseif ($email === '' && $username === '') {
        $error = 'أدخل البريد الإلكتروني أو اسم المستخدم للمتابعة.';
    } elseif ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $error = 'صيغة البريد الإلكتروني غير صحيحة. يمكنك استخدام اسم المستخدم بدلًا منه.';
    } else {
        $stmt = $db->prepare('SELECT id, username, email, full_name FROM users WHERE (? <> \'\' AND LOWER(email) = ?) OR (? <> \'\' AND LOWER(username) = ?) LIMIT 1');
        $stmt->execute([$email, $email, $username, $username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            $error = 'لم نعثر على حساب مرتبط بهذه البيانات. تحقق من البريد أو اسم المستخدم، ثم أعد المحاولة. إذا استمرت المشكلة، تواصل مع الإدارة العامة.';
            $whatsappText = "مرحبًا الإدارة العامة، أنا منسق في نظام مكانك الجامعي ونسيت كلمة المرور. اسم المستخدم: " . ($username ?: 'غير مذكور') . ". أرجو التحقق من الحساب وإرسال كلمة مرور مؤقتة عبر القناة الرسمية.";
            $whatsappLink = 'https://wa.me/' . $whatsappNumber . '?text=' . urlencode($whatsappText);
        } elseif (empty($user['email']) || !filter_var($user['email'], FILTER_VALIDATE_EMAIL)) {
            $error = 'حسابك موجود، لكن لا يوجد بريد إلكتروني صالح مرتبط به. تواصل مع الإدارة العامة عبر واتساب للتحقق وإرسال كلمة مرور مؤقتة.';
            $whatsappText = "مرحبًا الإدارة العامة، أنا منسق في نظام مكانك الجامعي ونسيت كلمة المرور. اسم المستخدم: {$user['username']}. لا يوجد بريد إلكتروني صالح مرتبط بالحساب، أرجو التحقق وإرسال كلمة مرور مؤقتة عبر القناة الرسمية.";
            $whatsappLink = 'https://wa.me/' . $whatsappNumber . '?text=' . urlencode($whatsappText);
        } else {
            $email = strtolower($user['email']);
            $rawToken = bin2hex(random_bytes(32));
            $hash = hash('sha256', $rawToken);
            $db->prepare('UPDATE users SET password_reset_token_hash=?, password_reset_expires_at=? WHERE id=?')
                ->execute([$hash, time() + 900, $user['id']]);
            $base = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/'), '/\\');
            $canonicalHost = getenv('MAKANAK_CANONICAL_HOST') ?: '127.0.0.1:8002';
            $canonicalScheme = getenv('MAKANAK_CANONICAL_SCHEME') ?: 'http';
            $link = $canonicalScheme . '://' . $canonicalHost . $base . '/reset_password.php?token=' . urlencode($rawToken);
            $subject = 'استعادة الوصول إلى لوحة التحكم';
            $body = "مرحبًا،\n\nتم طلب استعادة حساب لوحة التحكم المرتبط بهذا البريد. افتح الرابط التالي خلال 15 دقيقة:\n$link\n\nإذا لم تطلب ذلك، تجاهل هذه الرسالة. لا تشارك الرابط مع أي شخص.";
            $headers = "Content-Type: text/plain; charset=UTF-8\r\nFrom: no-reply@" . $canonicalHost . "\r\n";
            if (@mail($email, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers)) {
                $message = 'تم إرسال رابط استعادة آمن إلى البريد المرتبط بالحساب. الرابط صالح لمدة 15 دقيقة.';
                $whatsappText = "مرحبًا الإدارة العامة، أنا منسق في نظام مكانك الجامعي ونسيت كلمة المرور. اسم المستخدم: {$user['username']}. لم يصلني رابط الاستعادة على البريد، أرجو التحقق من الحساب وإرسال كلمة مرور مؤقتة عبر القناة الرسمية.";
                $whatsappLink = 'https://wa.me/' . $whatsappNumber . '?text=' . urlencode($whatsappText);
            } else {
                $error = 'تعذر إرسال البريد حاليًا. يمكنك التواصل مباشرة مع الإدارة العامة عبر واتساب لإتمام التحقق وإرسال كلمة مرور مؤقتة.';
                $whatsappText = "مرحبًا الإدارة العامة، أنا منسق في نظام مكانك الجامعي ونسيت كلمة المرور. اسم المستخدم: {$user['username']}. تعذر وصول رابط الاستعادة إلى بريدي، أرجو التحقق من الحساب وإرسال كلمة مرور مؤقتة عبر القناة الرسمية.";
                $whatsappLink = 'https://wa.me/' . $whatsappNumber . '?text=' . urlencode($whatsappText);
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>استعادة كلمة المرور</title>
    <link rel="stylesheet" href="assets/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700;800&family=Noto+Kufi+Arabic:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Cairo:wght@700;800&family=Tajawal:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>

<body class="simple-page">
    <div class="card">
        <div class="icon-wrap">🔐</div>
        <h1>استعادة كلمة المرور</h1>
        <p class="subtitle">أدخل البريد الإلكتروني، أو اسم المستخدم إذا لم يكن البريد متوفرًا.</p>
        <?php if ($error): ?>
            <div class="error-box">
                <?= htmlspecialchars($error) ?>
            </div>
            <?php if ($whatsappLink): ?>
                <a class="whatsapp-recovery-btn" href="<?= htmlspecialchars($whatsappLink) ?>" target="_blank"
                    rel="noopener noreferrer">تواصل مع الإدارة العامة عبر واتساب</a>
            <?php endif; ?>
        <?php endif; ?>
        <?php if ($message): ?>
            <div class="success-box">
                <?= htmlspecialchars($message) ?>
            </div>
        <?php endif; ?>
        <form method="post" autocomplete="off"><input type="hidden" name="csrf"
                value="<?= htmlspecialchars(csrf_token()) ?>"><label>البريد الإلكتروني</label><input type="email"
                name="email" autocomplete="email" placeholder="name@example.com"><label>اسم المستخدم <span
                    style="color:#8b8f9d;font-size:10px;">(بديل عند عدم توفر البريد)</span></label><input type="text"
                name="username" autocomplete="username" placeholder="مثال: ahmad_coord"><button type="submit"
                class="primary">إرسال رابط الاستعادة</button></form><a href="login.php" class="link-btn">العودة لتسجيل
            الدخول</a>
    </div>
</body>

</html>