<?php
require __DIR__ . '/config.php';

if (!empty($_SESSION['authenticated'])) {
    redirect('dashboard.php');
}

$error = null;
$db = get_db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // محدد طلبات مشدد لمنع التخمين وهجمات Brute Force (حد أقصى 10 محاولات لكل 5 دقائق لكل IP)
    enforce_rate_limit('login_attempt', 10, 300, 'تم حظر محاولات تسجيل الدخول مؤقتاً لتكرار المحاولات غير المصرح بها من نفس العنوان.');

    $username = trim($_POST['username'] ?? '');
    $password = (string) ($_POST['password'] ?? '');
    $captcha = trim($_POST['captcha'] ?? '');
    $token = $_POST['csrf'] ?? '';

    if (!csrf_check($token)) {
        $error = 'انتهت صلاحية الجلسة، أعد المحاولة.';
    } elseif (empty($_SESSION['captcha']) || strcasecmp($captcha, $_SESSION['captcha']) !== 0) {
        $error = 'رمز التحقق (Captcha) غير صحيح.';
    } else {
        $stmt = $db->prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(full_name) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1');
        $stmt->execute([$username, $username, $username]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        // إظهار سبب واضح عند إيقاف حساب المنسق أو تعطيل سجله الإداري.
        $accountDisabled = false;
        if ($user) {
            $coordStatus = $db->prepare('SELECT is_active FROM coordinators WHERE user_id = ? LIMIT 1');
            $coordStatus->execute([(int) $user['id']]);
            $linkedActive = $coordStatus->fetchColumn();
            $accountDisabled = ($linkedActive !== false && (int) $linkedActive !== 1);
        }

        // جلب سياسات الأمان المحددة من الإدارة
        $secSettings = [];
        try {
            $secSettings = $db->query("SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('max_login_attempts', 'lockout_minutes', 'force_2fa')")->fetchAll(PDO::FETCH_KEY_PAIR);
        } catch (Exception $e) {
        }
        $maxAttempts = isset($secSettings['max_login_attempts']) ? max(1, (int) $secSettings['max_login_attempts']) : 5;
        $lockoutMinutes = isset($secSettings['lockout_minutes']) ? max(1, (int) $secSettings['lockout_minutes']) : 15;
        $force2fa = ($secSettings['force_2fa'] ?? '0') === '1';

        $now = time();
        if ($accountDisabled) {
            $error = 'تم إيقاف الوصول إلى حسابك من قبل مدير النظام. يرجى التواصل مع الإدارة لإعادة التفعيل.';
        } elseif ($user && (int) $user['locked_until'] > $now) {
            $remainMins = max(1, ceil(((int) $user['locked_until'] - $now) / 60));
            $error = "الحساب مقفل مؤقتاً بسبب تجاوز الحد الأقصى للمحاولات ($maxAttempts). يرجى الانتظار $remainMins دقيقة.";
        } elseif ($user && password_verify($password, $user['password_hash'])) {
            $db->prepare('UPDATE users SET failed_attempts = 0, locked_until = 0 WHERE id = ?')
                ->execute([$user['id']]);

            session_regenerate_id(true);
            unset($_SESSION['captcha']);
            $_SESSION['pending_user_id'] = (int) $user['id'];
            $_SESSION['pending_username'] = $user['username'];
            $_SESSION['last_activity_time'] = time();

            if ((int) $user['must_change_password'] === 1) {
                redirect('setup_account.php');
            } elseif ((int) $user['totp_enabled'] === 1 || $force2fa) {
                if ((int) $user['totp_enabled'] === 1) {
                    redirect('verify_totp.php');
                } else {
                    redirect('setup_account.php');
                }
            } else {
                $_SESSION['authenticated'] = true;
                $_SESSION['user_id'] = (int) $user['id'];
                $_SESSION['username'] = $user['username'];
                $_SESSION['role'] = $user['role'];
                $_SESSION['last_activity_time'] = time();
                touch_user_activity();
                log_activity('سجّل دخولاً للنظام', 'auth');
                redirect('dashboard.php');
            }
        } else {
            if ($user) {
                $attempts = (int) $user['failed_attempts'] + 1;
                $lock = $attempts >= $maxAttempts ? (time() + ($lockoutMinutes * 60)) : 0;
                $db->prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?')
                    ->execute([$attempts, $lock, $user['id']]);

                if ($lock > 0) {
                    $error = "تم قفل الحساب مؤقتاً لمدة $lockoutMinutes دقيقة لتكرار المحاولات الفاشلة ($maxAttempts مرات).";
                } else {
                    $remaining = $maxAttempts - $attempts;
                    $error = "بيانات الاعتماد غير صحيحة. المحاولات المتبقية قبل القفل: $remaining.";
                }
            } else {
                $error = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
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
    <title>لوحة التحكم - تسجيل الدخول</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800&family=Tajawal:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="assets/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700;800&family=Noto+Kufi+Arabic:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&family=Cairo:wght@700;800&family=Tajawal:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        rel="stylesheet">
</head>

<body>
    <div class="auth-shell">

        <div class="brand-pane">
            <div class="radar">
                <div class="radar-sweep"></div>
                <div class="radar-core">
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#ffffff" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                </div>
            </div>
            <h1>بوابة الدخول الآمنة</h1>
            <p>نظام دخول آمن من مرحلتين: بيانات الاعتماد أولاً، ثم رمز تطبيق المصادقة. لا يُمنح الوصول إلا بعد اجتياز
                البوابتين.</p>
            <div class="gate-tags">
                <span class="gate-tag active">GATE 01 · CREDENTIALS</span>
                <span class="gate-tag">GATE 02 · TOTP</span>
            </div>
        </div>

        <div class="form-pane">
            <div class="auth-card">
                <div class="eyebrow"><?= date('d / m / Y') ?></div>
                <h2>تسجيل الدخول</h2>
                <p class="lead">أدخل اسم المستخدم وكود الوصول ورمز التحقق للمتابعة إلى بوابة المصادقة الثانية.</p>

                <?php if ($error): ?>
                    <div class="error-box"><?= htmlspecialchars($error) ?></div>
                <?php endif; ?>

                <form method="post" autocomplete="off">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">

                    <label>اسم المستخدم أو البريد الإلكتروني</label>
                    <input type="text" name="username" placeholder="أدخل اسم المستخدم أو البريد" required
                        value="<?= htmlspecialchars($_POST['username'] ?? '') ?>">

                    <label>كود الوصول</label>
                    <div class="password-input-wrap" style="position:relative; display:flex; align-items:center;">
                        <input type="password" name="password" id="login_password_input" placeholder="أدخل كود الوصول"
                            required style="padding-left:42px;">
                        <button type="button" onclick="togglePass('login_password_input', this)"
                            style="position:absolute; left:8px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer; padding:6px; display:flex; align-items:center; justify-content:center; border-radius:6px;"
                            title="إظهار / إخفاء كلمة المرور">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>

                    <label>رمز التحقق (Captcha)</label>
                    <div class="captcha-row">
                        <button type="button" class="captcha-refresh" title="تحديث الرمز"
                            onclick="document.getElementById('captchaImg').src='captcha_image.php?t='+Date.now()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path
                                    d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                            </svg>
                        </button>
                        <img id="captchaImg" src="captcha_image.php" alt="captcha" width="160" height="60">
                    </div>
                    <input type="text" name="captcha" placeholder="أدخل الرمز أعلاه" required>

                    <button type="submit" class="primary">متابعة إلى البوابة الثانية</button>
                </form>
                <button type="button" class="support-contact-btn" onclick="openSupportModal()">تواصل مع مدير
                    الإدارة</button>
                <a href="/" class="link-btn">الذهاب إلى الموقع الرئيسي</a>
            </div>
        </div>

    </div>
    <script>
        function togglePass(id, btn) {
            const input = document.getElementById(id);
            if (!input) return;
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            btn.innerHTML = isPass ?
                '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' :
                '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
        }
        function openSupportModal() {
            document.getElementById('supportModal').classList.add('show');
            updateSupportMessage();
        }
        function closeSupportModal() { document.getElementById('supportModal').classList.remove('show'); }
        function updateSupportMessage() {
            const subject = document.getElementById('supportSubject').value;
            const name = document.getElementById('supportName').value.trim() || 'غير مذكور';
            const notes = document.getElementById('supportNotes').value.trim() || 'لا توجد ملاحظات إضافية';
            const labels = { password: 'نسيت كلمة المرور', username: 'نسيت اسم المستخدم', email: 'مشكلة في البريد الإلكتروني' };
            const text = `مرحبًا الإدارة العامة،%0A%0Aموضوع الطلب: ${labels[subject]}%0Aالاسم: ${name}%0Aملاحظات الطالب: ${notes}%0A%0Aأرجو مراجعة الطلب وإرشادي عبر القناة الرسمية.`;
            document.getElementById('supportWhatsapp').href = 'https://wa.me/962782934685?text=' + text;
        }
        function markSupportRequestOpened() {
            const status = document.getElementById('supportRequestStatus');
            status.hidden = false;
            status.textContent = 'تم تجهيز الطلب وفتح واتساب بنجاح. اضغط إرسال داخل واتساب لإكمال الطلب.';
        }
        window.addEventListener('DOMContentLoaded', function () {
            document.getElementById('supportModal').addEventListener('click', function (event) { if (event.target === this) closeSupportModal(); });
        });
    </script>

    <div class="support-modal" id="supportModal" role="dialog" aria-modal="true" aria-labelledby="supportTitle">
        <div class="support-modal-card">
            <button type="button" class="support-close" onclick="closeSupportModal()" aria-label="إغلاق">×</button>
            <div class="support-icon">✦</div>
            <h2 id="supportTitle">تواصل مع مدير الإدارة</h2>
            <p>اختر موضوع الطلب، وسنجهّز لك رسالة رسمية للإدارة العامة عبر واتساب.</p>
            <label for="supportSubject">موضوع الطلب</label>
            <select id="supportSubject" onchange="updateSupportMessage()">
                <option value="password">نسيت كلمة المرور</option>
                <option value="username">نسيت اسم المستخدم</option>
                <option value="email">مشكلة في البريد الإلكتروني</option>
            </select>
            <label for="supportName">الاسم الكامل</label>
            <input id="supportName" type="text" placeholder="اكتب اسمك" oninput="updateSupportMessage()">
            <label for="supportNotes">ملاحظات الطالب</label>
            <textarea id="supportNotes" rows="4"
                placeholder="اكتب تفاصيل المشكلة أو أي معلومات تساعد الإدارة على التحقق من طلبك"
                oninput="updateSupportMessage()"></textarea>
            <div id="supportRequestStatus" class="support-request-status" hidden role="status"></div>
            <a id="supportWhatsapp" class="support-whatsapp-btn" href="https://wa.me/962782934685" target="_blank"
                rel="noopener noreferrer" onclick="markSupportRequestOpened()">فتح واتساب وإرسال الطلب</a>
            <button type="button" class="support-cancel-btn" onclick="closeSupportModal()">إلغاء</button>
        </div>
    </div>
</body>

</html>