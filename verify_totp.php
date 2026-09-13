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

if (!$user || (int) $user['totp_enabled'] !== 1) {
    redirect('login.php');
}

$error = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_check($_POST['csrf'] ?? '')) {
    $code = $_POST['totp_code'] ?? '';
    if (TOTP::verify($user['totp_secret'], $code)) {
        $_SESSION['authenticated'] = true;
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['last_activity_time'] = time();
        unset($_SESSION['pending_user_id'], $_SESSION['pending_username']);
        session_regenerate_id(true);
        touch_user_activity();
        check_and_register_user_device((int) $user['id'], $user['username']);
        log_activity('سجّل دخولاً للنظام (التحقق بخطوتين TOTP)', 'auth');
        redirect('dashboard.php');
    } else {
        $error = 'رمز التحقق غير صحيح أو منتهي، جرّب الرمز الحالي في التطبيق.';
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>التحقق بخطوتين</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&family=Tajawal:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="assets/style.css">
    <style>
        body.simple-page {
            min-height: 100vh;
            display: grid;
            place-items: center;
            padding: 24px;
            background: radial-gradient(circle at 50% 0%, rgba(201, 151, 62, .14), transparent 42%), linear-gradient(145deg, #070a14, #11172a 52%, #070a14);
        }

        .totp-card {
            position: relative;
            width: min(100%, 480px);
            padding: 44px 42px 38px;
            border: 1px solid rgba(201, 151, 62, .38);
            border-radius: 24px;
            background: rgba(245, 242, 234, .98);
            box-shadow: 0 24px 70px rgba(0, 0, 0, .42);
            text-align: center;
        }

        .totp-card::before,
        .totp-card::after {
            content: '';
            position: absolute;
            width: 24px;
            height: 24px;
            border-color: var(--gold);
            opacity: .75;
        }

        .totp-card::before {
            top: -9px;
            right: -9px;
            border-top: 2px solid;
            border-right: 2px solid;
        }

        .totp-card::after {
            bottom: -9px;
            left: -9px;
            border-bottom: 2px solid;
            border-left: 2px solid;
        }

        .totp-icon {
            width: 70px;
            height: 70px;
            margin: 0 auto 22px;
            display: grid;
            place-items: center;
            border-radius: 18px;
            background: var(--navy-950);
            box-shadow: 0 10px 22px rgba(7, 10, 20, .18);
        }

        .totp-card h1 {
            margin: 0 0 10px;
            color: var(--ink);
            font-size: clamp(24px, 5vw, 32px);
        }

        .totp-subtitle {
            margin: 0 auto 28px;
            max-width: 330px;
            color: var(--ink-muted);
            line-height: 1.8;
        }

        .totp-label {
            margin-bottom: 10px;
            text-align: right;
        }

        .otp-inputs {
            display: flex;
            direction: ltr;
            justify-content: center;
            gap: 9px;
            margin-bottom: 24px;
        }

        .otp-input {
            width: 48px;
            height: 58px;
            padding: 0;
            border: 1px solid #d5cdbd;
            border-radius: 12px;
            background: #fffdfa;
            color: var(--ink);
            font-family: 'JetBrains Mono', monospace !important;
            font-size: 25px;
            font-weight: 700;
            text-align: center;
            direction: ltr;
            transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }

        .otp-input:focus {
            outline: none;
            border-color: var(--teal);
            box-shadow: 0 0 0 4px rgba(47, 183, 161, .16);
            transform: translateY(-2px);
        }

        .totp-submit {
            width: 100%;
            min-height: 56px;
            border-radius: 999px;
            font-size: 17px;
        }

        .totp-back {
            width: 100%;
            margin-top: 14px;
            border-radius: 999px;
        }

        @media (max-width: 430px) {
            .totp-card {
                padding: 34px 20px 28px;
            }

            .otp-inputs {
                gap: 6px;
            }

            .otp-input {
                width: 42px;
                height: 54px;
            }
        }
    </style>
</head>

<body class="simple-page">
    <main class="totp-card">
        <div class="totp-icon">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#ffffff" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        </div>
        <h1>التحقق بخطوتين</h1>
        <p class="totp-subtitle">أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة الخاص بك</p>

        <?php if ($error): ?>
            <div class="error-box"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>

        <form method="post" autocomplete="off">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <label class="totp-label">رمز Authenticator</label>
            <div class="otp-inputs" aria-label="رمز التحقق">
                <?php for ($i = 0; $i < 6; $i++): ?>
                    <input class="otp-input" type="text" inputmode="numeric" maxlength="1" aria-label="الرقم <?= $i + 1 ?>"
                        required <?= $i === 0 ? 'autofocus' : '' ?>>
                <?php endfor; ?>
            </div>
            <input type="hidden" name="totp_code" id="totp-code">
            <button type="submit" class="primary totp-submit">دخول</button>
        </form>
        <a href="login.php" class="link-btn totp-back">رجوع لتسجيل الدخول</a>
    </main>
    <script>
        const otpInputs = [...document.querySelectorAll('.otp-input')];
        const codeInput = document.getElementById('totp-code');
        const syncCode = () => { codeInput.value = otpInputs.map(input => input.value).join(''); };
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(-1);
                syncCode();
                if (input.value && otpInputs[index + 1]) otpInputs[index + 1].focus();
            });
            input.addEventListener('keydown', event => {
                if (event.key === 'Backspace' && !input.value && otpInputs[index - 1]) otpInputs[index - 1].focus();
            });
            input.addEventListener('paste', event => {
                event.preventDefault();
                const pasted = (event.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                pasted.split('').forEach((digit, digitIndex) => { if (otpInputs[digitIndex]) otpInputs[digitIndex].value = digit; });
                syncCode();
                if (pasted.length) otpInputs[Math.min(pasted.length, 6) - 1].focus();
            });
        });
        document.querySelector('form').addEventListener('submit', event => {
            syncCode();
            if (!/^\d{6}$/.test(codeInput.value)) { event.preventDefault(); otpInputs.find(input => !input.value)?.focus(); }
        });
    </script>
</body>

</html>