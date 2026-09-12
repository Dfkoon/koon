<?php
require __DIR__ . '/config.php';
require __DIR__ . '/includes/totp.php';

if (empty($_SESSION['pending_user_id'])) {
    redirect('login.php');
}

$db = get_db();
$stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$_SESSION['pending_user_id']]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user) {
    session_destroy();
    redirect('login.php');
}

$error = null;

// تحديد المرحلة الحالية: تغيير كلمة المرور أولاً، ثم ربط TOTP
$stage = ((int) $user['must_change_password'] === 1) ? 'password' : 'totp';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_check($_POST['csrf'] ?? '')) {

    if ($stage === 'password' && isset($_POST['new_password'])) {
        $new = (string) $_POST['new_password'];
        $confirm = (string) $_POST['confirm_password'];

        $minLen = 8;
        try {
            $val = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'password_min_length'")->fetchColumn();
            if ($val !== false && is_numeric($val)) $minLen = (int)$val;
        } catch (Exception $e) {}

        if (strlen($new) < $minLen) {
            $error = "كلمة المرور يجب أن تكون $minLen أحرف على الأقل.";
        } elseif ($new !== $confirm) {
            $error = 'كلمتا المرور غير متطابقتين.';
        } elseif (password_verify($new, $user['password_hash'])) {
            $error = 'يجب أن تكون كلمة المرور الجديدة مختلفة عن المؤقتة.';
        } else {
            $hash = password_hash($new, PASSWORD_DEFAULT);
            $db->prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
                ->execute([$hash, $user['id']]);
            redirect('setup_account.php'); // ينتقل تلقائياً لمرحلة TOTP
        }
    }

    if ($stage === 'totp' && isset($_POST['totp_code'])) {
        $secret = $_SESSION['pending_totp_secret'] ?? '';
        if ($secret && TOTP::verify($secret, $_POST['totp_code'])) {
            $db->prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?')
                ->execute([$secret, $user['id']]);
            unset($_SESSION['pending_totp_secret']);

            // اكتمل الإعداد بالكامل -> تسجيل دخول كامل
            $_SESSION['authenticated'] = true;
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['username'] = $user['username'];
            unset($_SESSION['pending_user_id'], $_SESSION['pending_username']);
            session_regenerate_id(true);
            redirect('dashboard.php');
        } else {
            $error = 'رمز التحقق غير صحيح، تأكد من التطبيق وحاول مجدداً.';
        }
    }
}

// توليد سر TOTP جديد عند دخول مرحلة الربط (مرة واحدة، يبقى في الجلسة لحين التأكيد)
$qrDataUri = null;
$secretForDisplay = null;
if ($stage === 'totp') {
    if (empty($_SESSION['pending_totp_secret'])) {
        $_SESSION['pending_totp_secret'] = TOTP::generateSecret();
    }
    $secretForDisplay = $_SESSION['pending_totp_secret'];
    $otpauth = TOTP::provisioningUri($secretForDisplay, $user['username'], 'لوحة التحكم');
    // توليد صورة QR عبر خدمة خارجية بسيطة (بديل: أي مكتبة QR محلية إن رغبت لاحقاً)
    $qrDataUri = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' . urlencode($otpauth);
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>إعداد الحساب</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&family=Tajawal:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="assets/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700;800&family=Noto+Kufi+Arabic:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Cairo:wght@700;800&family=Tajawal:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>

<body class="simple-page">
    <div class="card">
        <div class="icon-wrap">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#ffffff" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        </div>
        <h1>إعداد الحساب</h1>
        <p class="step-badge">
            <?= $stage === 'password' ? 'الخطوة 1 من 2 — تغيير كلمة المرور' : 'الخطوة 2 من 2 — ربط تطبيق المصادقة' ?>
        </p>

        <?php if ($error): ?>
            <div class="error-box"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <?php if ($stage === 'password'): ?>
            <p class="subtitle">هذه أول عملية دخول لك. الرجاء تعيين كلمة مرور جديدة قبل المتابعة.</p>
            <form method="post" autocomplete="off">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <label>كلمة المرور الجديدة</label>
                <div class="password-field">
                    <input type="password" name="new_password" id="new_password" placeholder="10 أحرف على الأقل" required
                        minlength="10">
                    <button type="button" class="password-toggle" onclick="togglePassword('new_password', this)"
                        aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </button>
                </div>
                <label>تأكيد كلمة المرور</label>
                <div class="password-field">
                    <input type="password" name="confirm_password" id="confirm_password" placeholder="أعد كتابة كلمة المرور"
                        required minlength="10">
                    <button type="button" class="password-toggle" onclick="togglePassword('confirm_password', this)"
                        aria-label="إظهار كلمة المرور" title="إظهار كلمة المرور">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </button>
                </div>
                <button type="submit" class="primary">حفظ ومتابعة</button>
            </form>
        <?php else: ?>
            <p class="subtitle">امسح رمز QR عبر تطبيق Google Authenticator أو ما يعادله، ثم أدخل الرمز المكوّن من 6 أرقام.
            </p>
            <div class="qr-wrap">
                <img src="<?= htmlspecialchars($qrDataUri) ?>" alt="QR Code" width="220" height="220">
            </div>
            <p class="subtitle">أو أدخل السر يدوياً في التطبيق:</p>
            <div class="secret-code"><?= htmlspecialchars($secretForDisplay) ?></div>
            <form method="post" autocomplete="off">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <label>رمز التحقق من التطبيق</label>
                <input type="text" name="totp_code" placeholder="000000" required pattern="\d{6}" maxlength="6"
                    inputmode="numeric">
                <button type="submit" class="primary">تفعيل وإنهاء الإعداد</button>
            </form>
        <?php endif; ?>
    </div>
    <style>
        .password-field {
            position: relative;
        }

        .password-field input {
            padding-left: 48px;
        }

        .password-toggle {
            position: absolute;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 6px;
            border: 0;
            border-radius: 6px;
            background: transparent;
            color: #94a3b8;
            cursor: pointer;
        }

        .password-toggle:hover {
            color: #b78327;
            background: #fff8e8;
        }
    </style>
    <script>
        function togglePassword(inputId, button) {
            const input = document.getElementById(inputId);
            const visible = input.type === 'password';
            input.type = visible ? 'text' : 'password';
            button.setAttribute('aria-label', visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
            button.setAttribute('title', visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        }
    </script>
</body>

</html>