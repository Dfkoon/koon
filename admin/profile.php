<?php
$page_key = '';
$page_title = 'إعدادات الحساب وكلمة المرور';
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();
$userId = $_SESSION['user_id'] ?? 0;
$message = null;
$messageType = 'success';

// جلب بيانات المستخدم الحالية
$stmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    redirect('../login.php');
}

// معالجة تحديث البيانات
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $message = 'انتهت صلاحية الجلسة، الرجاء المحاولة مجدداً.';
        $messageType = 'error';
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'update_profile') {
            $newUsername = trim($_POST['username'] ?? $user['username']);
            $fullName = trim($_POST['full_name'] ?? '');
            $email = trim($_POST['email'] ?? '');

            $avatarPath = $user['avatar_path'] ?? '';
            $avatarError = false;
            if (!empty($_POST['remove_avatar']) && $avatarPath) {
                $oldAvatar = __DIR__ . '/../' . ltrim(str_replace('../', '', $avatarPath), '/');
                if (is_file($oldAvatar))
                    unlink($oldAvatar);
                $avatarPath = '';
            }
            if (!empty($_FILES['avatar']['tmp_name']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
                $allowedMime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
                $mime = mime_content_type($_FILES['avatar']['tmp_name']);
                if (!isset($allowedMime[$mime]) || (int) $_FILES['avatar']['size'] > 2 * 1024 * 1024) {
                    $message = 'الصورة يجب أن تكون JPG أو PNG أو WEBP وحجمها أقل من 2MB.';
                    $messageType = 'error';
                    $avatarError = true;
                } else {
                    $avatarDir = __DIR__ . '/../uploads/avatars';
                    if (!is_dir($avatarDir))
                        mkdir($avatarDir, 0755, true);
                    $filename = 'user_' . $userId . '_' . bin2hex(random_bytes(8)) . '.' . $allowedMime[$mime];
                    move_uploaded_file($_FILES['avatar']['tmp_name'], $avatarDir . '/' . $filename);
                    if ($user['avatar_path'] && $user['avatar_path'] !== $avatarPath) {
                        $oldAvatar = __DIR__ . '/../' . ltrim(str_replace('../', '', $user['avatar_path']), '/');
                        if (is_file($oldAvatar))
                            unlink($oldAvatar);
                    }
                    $avatarPath = '../uploads/avatars/' . $filename;
                }
            }

            if ($avatarError) {
                $stmt->execute([$userId]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
            } elseif ($newUsername === '') {
                $newUsername = $user['username'];
            }

            $checkStmt = $db->prepare('SELECT id FROM users WHERE username = ? AND id != ?');
            $checkStmt->execute([$newUsername, $userId]);
            if ($checkStmt->fetch()) {
                $message = 'اسم المستخدم مأخوذ مسبقاً، الرجاء اختيار اسم آخر.';
                $messageType = 'error';
            } else {
                $db->prepare('UPDATE users SET username = ?, full_name = ?, email = ?, avatar_path = ? WHERE id = ?')
                    ->execute([$newUsername, $fullName, $email, $avatarPath, $userId]);

                $_SESSION['username'] = $newUsername;
                log_activity("تحديث بيانات الملف الشخصي ({$newUsername})", 'account_update');
                $message = 'تم حفظ البيانات الشخصية واسم المستخدم بنجاح.';
                $messageType = 'success';

                // إعادة جلب البيانات
                $stmt->execute([$userId]);
                $user = $stmt->fetch(PDO::FETCH_ASSOC);
            }
        } elseif ($action === 'change_password') {
            $currentPassword = (string) ($_POST['current_password'] ?? '');
            $newPassword = (string) ($_POST['new_password'] ?? '');
            $confirmPassword = (string) ($_POST['confirm_password'] ?? '');

            $minLen = 8;
            try {
                $val = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'password_min_length'")->fetchColumn();
                if ($val !== false && is_numeric($val)) $minLen = (int)$val;
            } catch (Exception $e) {}

            if (!password_verify($currentPassword, $user['password_hash'])) {
                $message = 'كلمة المرور الحالية غير صحيحة.';
                $messageType = 'error';
            } elseif (strlen($newPassword) < $minLen) {
                $message = "كلمة المرور الجديدة يجب أن تكون $minLen أحرف أو أكثر.";
                $messageType = 'error';
            } elseif ($newPassword !== $confirmPassword) {
                $message = 'كلمتا المرور الجديدتان غير متطابقتين.';
                $messageType = 'error';
            } else {
                $newHash = password_hash($newPassword, PASSWORD_DEFAULT);
                $db->prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
                    ->execute([$newHash, $userId]);

                log_activity("تغيير كلمة مرور الحساب بنجاح ({$user['username']})", 'security_update');
                $message = 'تم تغيير كلمة المرور بنجاح!';
                $messageType = 'success';
            }
        } elseif ($action === 'remove_device') {
            $deviceId = (int) ($_POST['device_id'] ?? 0);
            $delStmt = $db->prepare('DELETE FROM user_known_devices WHERE id = ? AND user_id = ?');
            $delStmt->execute([$deviceId, $userId]);
            log_activity('إزالة جهاز موثوق من الحساب', 'security');
            $message = 'تم حذف الجهاز الموثوق بنجاح.';
            $messageType = 'success';
        }
    }
}

// جلب قائمة الأجهزة الموثوقة للمستخدم الحالي
$devicesStmt = $db->prepare('SELECT * FROM user_known_devices WHERE user_id = ? ORDER BY last_seen_at DESC');
$devicesStmt->execute([$userId]);
$knownDevices = $devicesStmt->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<?php if ($message): ?>
    <div class="alert-msg <?= $messageType === 'success' ? 'alert-success' : 'alert-error' ?>" style="margin-bottom: 20px;">
        <?= htmlspecialchars($message) ?>
    </div>
<?php endif; ?>

<div class="profile-grid">
    <!-- بطاقة المعلومات الشخصية -->
    <div class="panel-box">
        <div class="panel-box-header">
            <h3 class="panel-box-title">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
                    style="vertical-align: middle; margin-left: 8px;">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
                البيانات الشخصية
            </h3>
        </div>
        <div class="panel-box-body">
            <form method="post" autocomplete="off" enctype="multipart/form-data">
                <input type="hidden" name="action" value="update_profile">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">

                <div class="form-group">
                    <label>اسم المستخدم (الدخول)</label>
                    <input type="text" name="username" class="form-control"
                        value="<?= htmlspecialchars($user['username']) ?>" required>
                    <small style="color: #64748b; font-size: 12px; margin-top: 4px; display: block;">اسم المستخدم
                        يُستخدم لتسجيل الدخول إلى لوحة التحكم.</small>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <label>الاسم الكامل / الاسم الظاهر</label>
                    <input type="text" name="full_name" class="form-control"
                        value="<?= htmlspecialchars($user['full_name'] ?? $user['username']) ?>"
                        placeholder="أدخل اسمك الكامل" required>
                </div>

                <div class="form-group" style="margin-top:14px;">
                    <label>الصورة الشخصية</label>
                    <?php if (!empty($user['avatar_path'])): ?>
                        <img src="<?= htmlspecialchars($user['avatar_path']) ?>" alt="الصورة الشخصية"
                            style="width:72px;height:72px;object-fit:cover;border-radius:50%;border:2px solid #e2e8f0;display:block;margin-bottom:8px;">
                    <?php endif; ?>
                    <input type="file" name="avatar" class="form-control" accept="image/jpeg,image/png,image/webp">
                    <small style="color:#64748b;font-size:12px;display:block;margin-top:4px;">JPG أو PNG أو WEBP، بحد
                        أقصى 2MB.</small>
                    <?php if (!empty($user['avatar_path'])): ?>
                        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:#b91c1c;">
                            <input type="checkbox" name="remove_avatar" value="1"> إعادة تعيين الصورة وحذفها
                        </label>
                    <?php endif; ?>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <label>البريد الإلكتروني الرسمي</label>
                    <input type="email" name="email" class="form-control"
                        value="<?= htmlspecialchars($user['email'] ?? '') ?>" placeholder="name@example.com" required>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <label>الرتبة في النظام</label>
                    <input type="text" class="form-control"
                        value="<?= ($user['role'] ?? '') === 'super_admin' ? 'مدير عام (Super Admin)' : 'منسق معتمد (Coordinator)' ?>"
                        disabled>
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top: 20px;">حفظ البيانات الشخصية</button>
            </form>
        </div>
    </div>

    <!-- بطاقة تغيير كلمة المرور والأمان -->
    <div class="panel-box">
        <div class="panel-box-header">
            <h3 class="panel-box-title">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
                    style="vertical-align: middle; margin-left: 8px;">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                تغيير كلمة المرور
            </h3>
        </div>
        <div class="panel-box-body">
            <form method="post" autocomplete="off">
                <input type="hidden" name="action" value="change_password">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">

                <div class="form-group">
                    <label>كلمة المرور الحالية</label>
                    <div class="password-input-wrap">
                        <input type="password" name="current_password" id="current_pass_input" class="form-control"
                            placeholder="أدخل كلمة المرور الحالية" required>
                        <button type="button" class="toggle-password-btn"
                            onclick="togglePasswordVisibility(this, 'current_pass_input')"
                            title="إظهار / إخفاء كلمة المرور">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <label>كلمة المرور الجديدة (10 أحرف على الأقل)</label>
                    <div class="password-input-wrap">
                        <input type="password" name="new_password" id="new_pass_input" class="form-control"
                            placeholder="كلمة المرور الجديدة" required minlength="10">
                        <button type="button" class="toggle-password-btn"
                            onclick="togglePasswordVisibility(this, 'new_pass_input')"
                            title="إظهار / إخفاء كلمة المرور">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 14px;">
                    <label>تأكيد كلمة المرور الجديدة</label>
                    <div class="password-input-wrap">
                        <input type="password" name="confirm_password" id="confirm_pass_input" class="form-control"
                            placeholder="أعد كتابة كلمة المرور" required minlength="10">
                        <button type="button" class="toggle-password-btn"
                            onclick="togglePasswordVisibility(this, 'confirm_pass_input')"
                            title="إظهار / إخفاء كلمة المرور">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                            </svg>
                        </button>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top: 20px;">تحديث كلمة المرور</button>
            </form>

            <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
                <h4 style="font-size: 14px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">حالة الأمان والمصادقة
                </h4>
                <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">المصادقة الثنائية (TOTP) نشطة لحماية
                    حسابك عبر تطبيق Authenticator.</p>
                <a href="two_factor.php" class="btn btn-secondary"
                    style="font-size: 12.5px; text-decoration: none; display: inline-block;">
                    إدارة وإعادة ضبط تطبيق Authenticator
                </a>
            </div>

            <!-- قائمة الأجهزة الموثوقة وتتبع الجلسات -->
            <div style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
                <h4 style="font-size: 14px; font-weight: 800; color: #1e293b; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0284c7" stroke-width="2"><rect width="18" height="12" x="3" y="4" rx="2"/><line x1="2" x2="22" y1="20" y2="20"/></svg>
                    الأجهزة المعتمدة وسجل الدخول
                </h4>
                <p style="font-size: 12.5px; color: #64748b; margin-bottom: 12px;">
                    الأجهزة والمتصفحات التي تم تسجيل الدخول منها لهذا الحساب. يتم تنبيه المشرفين تلقائياً عند الدخول من أي جهاز جديد.
                </p>

                <?php if (empty($knownDevices)): ?>
                    <p style="font-size: 12px; color: #94a3b8; margin: 0;">لا توجد أجهزة مسجلة بعد.</p>
                <?php else: ?>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <?php foreach ($knownDevices as $kd): ?>
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
                                        <?= htmlspecialchars($kd['device_info'] ?: 'متصفح ويب') ?>
                                    </div>
                                    <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                                        عنوان IP: <code><?= htmlspecialchars($kd['ip_address']) ?></code> &bull; آخر ظهور: <?= htmlspecialchars($kd['last_seen_at']) ?>
                                    </div>
                                </div>
                                <form method="POST" action="" style="margin: 0;" onsubmit="return confirm('إزالة هذا الجهاز من الأجهزة الموثوقة؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="remove_device">
                                    <input type="hidden" name="device_id" value="<?= $kd['id'] ?>">
                                    <button type="submit" title="حذف هذا الجهاز" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px;">
                                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                    </button>
                                </form>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<script>
    function togglePasswordVisibility(btn, inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';

        if (isPass) {
            // أيقونة إخفاء كلمة المرور (عين مشطوبة)
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
            btn.setAttribute('title', 'إخفاء كلمة المرور');
        } else {
            // أيقونة إظهار كلمة المرور (عين مفتوحة)
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
            btn.setAttribute('title', 'إظهار كلمة المرور');
        }
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>