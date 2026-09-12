<?php
/**
 * admin/two_factor.php
 * إدارة المصادقة الثنائية (TOTP 2FA) والأمان المتقدم للوحة التحكم
 */

$page_key   = 'two_factor';
$page_title = 'المصادقة الثنائية (2FA)';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/totp.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();
$userId = $_SESSION['user_id'] ?? null;

// جلب بيانات المستخدم الحالية
$stmtUser = $db->prepare("SELECT * FROM users WHERE id = ?");
$stmtUser->execute([$userId]);
$user = $stmtUser->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    redirect('../logout.php');
}

$flash = null;

/* ================================================================
   معالجة POST
   ================================================================ */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني. أعد المحاولة.'];
    } else {
        $action = $_POST['action'] ?? '';

        // ───── 1. التحقق وتفعيل سر جديد ─────
        if ($action === 'verify_and_enable') {
            $secret = $_POST['secret'] ?? '';
            $code   = trim($_POST['totp_code'] ?? '');

            if (empty($secret) || empty($code)) {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال رمز التحقق المكون من 6 أرقام'];
            } elseif (TOTP::verify($secret, $code)) {
                $db->prepare("UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?")
                   ->execute([$secret, $userId]);
                unset($_SESSION['temp_2fa_secret']);
                log_activity("فعّل/حدّث المصادقة الثنائية 2FA بنجاح", 'security');
                $flash = ['type' => 'success', 'msg' => '🎉 تم تفعيل وربط المصادقة الثنائية (2FA) بحسابك بنجاح!'];
                // إعادة تحميل بيانات المستخدم
                $stmtUser->execute([$userId]);
                $user = $stmtUser->fetch(PDO::FETCH_ASSOC);
            } else {
                $flash = ['type' => 'error', 'msg' => 'رمز التحقق غير صحيح أو انتهت صلاحيته. تأكد من ضبط الوقت في هاتفك ثم أعد المحاولة.'];
            }
        }

        // ───── 2. توليد سر جديد للربط ─────
        elseif ($action === 'generate_new_secret') {
            $_SESSION['temp_2fa_secret'] = TOTP::generateSecret();
            $flash = ['type' => 'success', 'msg' => 'تم توليد مفتاح QR جديد، يرجى مسحه وإدخال الرمز لتأكيده.'];
        }

        // ───── 3. إلغاء تفعيل المصادقة الثنائية (مع التحقق من كلمة المرور) ─────
        elseif ($action === 'disable_2fa') {
            $password = $_POST['password'] ?? '';
            if (password_verify($password, $user['password_hash'])) {
                $db->prepare("UPDATE users SET totp_enabled = 0 WHERE id = ?")->execute([$userId]);
                log_activity("عطّل المصادقة الثنائية 2FA", 'security');
                $flash = ['type' => 'success', 'msg' => 'تم تعطيل المصادقة الثنائية لحسابك. ننصح بإعادة تفعيلها لضمان حماية الحساب.'];
                // إعادة تحميل البيانات
                $stmtUser->execute([$userId]);
                $user = $stmtUser->fetch(PDO::FETCH_ASSOC);
            } else {
                $flash = ['type' => 'error', 'msg' => 'كلمة المرور غير صحيحة، تعذر إيقاف المصادقة الثنائية'];
            }
        }
    }
}

// تجهيز المفتاح النشط أو المؤقت
$is2faActive = ((int)$user['totp_enabled'] === 1 && !empty($user['totp_secret']));

if (!empty($_SESSION['temp_2fa_secret'])) {
    $activeSecret = $_SESSION['temp_2fa_secret'];
} elseif ($is2faActive) {
    $activeSecret = $user['totp_secret'];
} else {
    $_SESSION['temp_2fa_secret'] = TOTP::generateSecret();
    $activeSecret = $_SESSION['temp_2fa_secret'];
}

$accountLabel = $user['username'] . ' (' . ($user['email'] ?: 'Makanak') . ')';
$otpauthUri   = TOTP::provisioningUri($activeSecret, $accountLabel, 'منصة مكانك');
$qrCodeUrl    = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' . urlencode($otpauthUri);

// تنسيق السر للقراءة
$formattedSecret = implode(' ', str_split($activeSecret, 4));

// جلب آخر عمليات الدخول والأجهزة الخاصة بالمستخدم
$recentLogs = $db->prepare("SELECT * FROM activity_log WHERE username = ? AND (action_type = 'security' OR action LIKE '%دخول%') ORDER BY id DESC LIMIT 5");
$recentLogs->execute([$user['username']]);
$logs = $recentLogs->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
<div style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type']==='success'?'#dcfce7':'#fee2e2' ?>;color:<?= $flash['type']==='success'?'#15803d':'#b91c1c' ?>;border:1px solid <?= $flash['type']==='success'?'#bbf7d0':'#fecaca' ?>;">
    <?= htmlspecialchars($flash['msg']) ?>
</div>
<?php endif; ?>

<!-- ================================================================
     بانر حالة الأمان العام
     ================================================================ -->
<div style="display:flex;align-items:center;gap:18px;margin-bottom:24px;padding:22px 24px;background:<?= $is2faActive ? 'linear-gradient(135deg, #065f46 0%, #047857 100%)' : 'linear-gradient(135deg, #991b1b 0%, #b91c1c 100%)' ?>;border-radius:16px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.06);">
    <div style="width:56px;height:56px;background:rgba(255,255,255,0.18);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <?php if ($is2faActive): ?>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#ffffff" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
        <?php else: ?>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#ffffff" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <?php endif; ?>
    </div>
    <div style="flex:1;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
            <h2 style="font-family:'Cairo',sans-serif;font-size:19px;font-weight:900;margin:0;">
                المصادقة الثنائية (Two-Factor Authentication · 2FA)
            </h2>
            <span style="background:<?= $is2faActive ? '#dcfce7' : '#fee2e2' ?>;color:<?= $is2faActive ? '#15803d' : '#b91c1c' ?>;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:800;">
                <?= $is2faActive ? '🔒 مفعّلة ونشطة' : '⚠️ غير مفعّلة' ?>
            </span>
        </div>
        <p style="margin:0;font-size:13px;opacity:.9;line-height:1.5;">
            <?= $is2faActive ? 'حسابك محمي بنظام التحقق الثنائي عبر تطبيق المصادقة في هاتفك. يتطلب تسجيل الدخول إدخال كلمة المرور ورمز OTP المتغير.' : 'حسابك غير محمي بالمصادقة الثنائية. يرجى مسح رمز QR وربط التطبيق لحماية صلاحيات الإدارة.' ?>
        </p>
    </div>
</div>

<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:24px;align-items:start;">

    <!-- ─── العمود الأيمن: إعداد وربط تطبيق المصادقة ─── -->
    <div class="panel-box">
        <div class="panel-box-header">
            <h3 class="panel-box-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <?= $is2faActive ? 'إعادة مسح أو تحديث تطبيق المصادقة' : 'خطوات تفعيل وربط المصادقة الثنائية' ?>
            </h3>
        </div>
        <div class="panel-box-body" style="padding:24px;">

            <!-- الخطوة 1: مسح QR -->
            <div style="margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#0f172a;margin-bottom:12px;">
                    <span style="width:24px;height:24px;background:#0284c7;color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;">1</span>
                    امسح رمز QR في تطبيق المصادقة (Authenticator)
                </div>
                <p style="font-size:12.5px;color:#64748b;margin-bottom:14px;line-height:1.6;">
                    افتح تطبيق المصادقة مثل <strong>Google Authenticator</strong> أو <strong>Microsoft Authenticator</strong> أو <strong>Apple Passwords</strong> واضغط على إضافة حساب جديد عبر مسح الرمز:
                </p>

                <div style="display:flex;align-items:center;justify-content:center;padding:16px;background:#f8fafc;border:2px dashed #cbd5e1;border-radius:14px;margin-bottom:16px;">
                    <img src="<?= htmlspecialchars($qrCodeUrl) ?>" alt="2FA QR Code" width="200" height="200" style="border-radius:10px;background:#fff;padding:8px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                </div>
            </div>

            <!-- الخطوة 2: الإدخال اليدوي -->
            <div style="margin-bottom:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;">
                <div style="font-size:12.5px;font-weight:700;color:#475569;margin-bottom:6px;">أو أدخل المفتاح السري يدوياً في التطبيق:</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="text" readonly value="<?= htmlspecialchars($activeSecret) ?>" id="secretKeyText" class="form-control" dir="ltr" style="font-family:'IBM Plex Mono',monospace;font-weight:800;letter-spacing:1px;background:#fff;text-align:center;">
                    <button type="button" onclick="copySecretKey()" class="btn btn-secondary" style="white-space:nowrap;font-size:12.5px;">
                        📋 نسخ
                    </button>
                </div>
            </div>

            <!-- الخطوة 3: تأكيد وتفعيل الرمز -->
            <form method="post" style="border-top:1px solid #f1f5f9;padding-top:18px;">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <input type="hidden" name="action" value="verify_and_enable">
                <input type="hidden" name="secret" value="<?= htmlspecialchars($activeSecret) ?>">

                <div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:#0f172a;margin-bottom:12px;">
                    <span style="width:24px;height:24px;background:#0284c7;color:#fff;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;">2</span>
                    تأكيد الرمز المكوّن من 6 أرقام
                </div>

                <div class="form-group" style="margin-bottom:16px;">
                    <label style="font-weight:700;font-size:13px;color:#334155;">أدخل الرمز الحالي الظاهر في التطبيق:</label>
                    <input type="text" name="totp_code" required pattern="\d{6}" maxlength="6" inputmode="numeric" placeholder="000000" class="form-control" style="font-size:24px;letter-spacing:8px;text-align:center;font-weight:900;max-width:240px;margin:0 auto;display:block;" dir="ltr" autocomplete="one-time-code">
                </div>

                <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
                    <button type="submit" class="btn btn-primary" style="padding:10px 24px;font-size:13.5px;font-weight:800;">
                        ✅ تأكيد وتفعيل المصادقة
                    </button>
                </div>
            </form>

        </div>
    </div>

    <!-- ─── العمود الأيسر: خيارات الأمان وإلغاء التفعيل والتطبيقات المدعومة ─── -->
    <div style="display:flex;flex-direction:column;gap:20px;">

        <!-- التطبيقات المدعومة -->
        <div class="panel-box">
            <div class="panel-box-header">
                <h3 class="panel-box-title">📱 تطبيقات المصادقة المدعومة</h3>
            </div>
            <div class="panel-box-body" style="padding:18px 20px;">
                <p style="font-size:12.5px;color:#64748b;margin-bottom:14px;line-height:1.5;">
                    يدعم النظام جميع تطبيقات المصادقة القياسية المتوافقة مع معيار TOTP (RFC 6238):
                </p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12.5px;font-weight:700;color:#0f172a;">
                        <span style="font-size:18px;">🔴</span> Google Authenticator
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12.5px;font-weight:700;color:#0f172a;">
                        <span style="font-size:18px;">🔵</span> Microsoft Authenticator
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12.5px;font-weight:700;color:#0f172a;">
                        <span style="font-size:18px;">🍎</span> Apple Passwords / Keychain
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12.5px;font-weight:700;color:#0f172a;">
                        <span style="font-size:18px;">🛡️</span> 1Password / Bitwarden
                    </div>
                </div>
            </div>
        </div>

        <!-- نصائح أمان هامة -->
        <div class="panel-box" style="background:#f0fdf4;border-color:#bbf7d0;">
            <div class="panel-box-header" style="background:transparent;border-bottom-color:#dcfce7;">
                <h3 class="panel-box-title" style="color:#15803d;">💡 نصائح هامة للمصادقة الثنائية</h3>
            </div>
            <div class="panel-box-body" style="padding:16px 20px;font-size:12.5px;color:#166534;line-height:1.6;">
                <ul style="margin:0;padding-right:18px;">
                    <li style="margin-bottom:6px;">تأكد من تفعيل المزامنة السحابية في تطبيق المصادقة لضمان عدم فقدان الرموز عند تغيير هاتفك.</li>
                    <li style="margin-bottom:6px;">الرموز تتغير تلقائياً كل <strong>30 ثانية</strong>.</li>
                    <li>في حال مواجهة مشاكل في الرمز، تحقق من ضبط الوقت التلقائي في إعدادات هاتفك.</li>
                </ul>
            </div>
        </div>

        <!-- خيار تعطيل المصادقة الثنائية -->
        <?php if ($is2faActive): ?>
        <div class="panel-box" style="border-color:#fecaca;">
            <div class="panel-box-header" style="background:#fff5f5;border-bottom-color:#fee2e2;">
                <h3 class="panel-box-title" style="color:#b91c1c;">⚠️ تعطيل المصادقة الثنائية</h3>
            </div>
            <div class="panel-box-body" style="padding:20px;">
                <p style="font-size:12.5px;color:#64748b;margin-bottom:14px;line-height:1.5;">
                    تعطيل المصادقة الثنائية يقلل من مستوى حماية الحساب. يتطلب ذلك إدخال كلمة المرور لتأكيد الهوية.
                </p>
                <form method="post" onsubmit="return confirm('هل أنت متأكد من رغبتك في تعطيل المصادقة الثنائية؟ سيصبح الحساب أقل أماناً.');">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="disable_2fa">

                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-size:12.5px;font-weight:700;">أدخل كلمة المرور الحالية للتأكيد:</label>
                        <div class="password-input-wrap">
                            <input type="password" name="password" id="disable_pass_input" required class="form-control" placeholder="كلمة المرور الحالية">
                            <button type="button" class="toggle-password-btn" onclick="togglePasswordVisibility(this, 'disable_pass_input')" title="إظهار / إخفاء كلمة المرور">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-delete" style="width:100%;font-size:13px;font-weight:700;">
                        إيقاف وتعطيل المصادقة الثنائية
                    </button>
                </form>
            </div>
        </div>
        <?php endif; ?>

        <!-- سجل النشاط الأخير -->
        <div class="panel-box">
            <div class="panel-box-header">
                <h3 class="panel-box-title">📋 آخر نشاطات الأمان للحساب</h3>
            </div>
            <div class="panel-box-body" style="padding:14px 20px;">
                <?php if (empty($logs)): ?>
                    <div style="color:#94a3b8;font-size:12.5px;text-align:center;padding:12px;">لا توجد سجلات أمان سابقة</div>
                <?php else: ?>
                    <?php foreach ($logs as $log): ?>
                        <div style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:12px;">
                            <div style="font-weight:700;color:#0f172a;"><?= htmlspecialchars($log['action']) ?></div>
                            <div style="color:#64748b;font-size:11px;margin-top:2px;">
                                <?= htmlspecialchars($log['created_at']) ?> · <?= htmlspecialchars($log['device_info'] ?? '') ?>
                            </div>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>

    </div>

</div>

<script>
function copySecretKey() {
    const key = document.getElementById('secretKeyText').value;
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
        alert('✅ تم نسخ المفتاح السري إلى الحافظة بنجاح!');
    }).catch(() => {
        prompt('انسخ المفتاح السري:', key);
    });
}

function togglePasswordVisibility(btn, inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    
    if (isPass) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        btn.setAttribute('title', 'إخفاء كلمة المرور');
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        btn.setAttribute('title', 'إظهار كلمة المرور');
    }
}
</script>

<?php require __DIR__ . '/_footer.php'; ?>
