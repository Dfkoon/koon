<?php
/**
 * create_admin.php
 * سكربت يُشغَّله الأدمن فقط من سطر الأوامر (Terminal / SSH) لإنشاء مستخدم جديد
 * بكلمة مرور مؤقتة. لا تضعه في مجلد عام يمكن الوصول له عبر المتصفح، أو احذفه بعد الاستخدام.
 *
 * الاستخدام:
 *   php create_admin.php <username> <temp_password>
 */

if (php_sapi_name() !== 'cli') {
    die('هذا السكربت يعمل فقط من سطر الأوامر (CLI) لأسباب أمنية.');
}

require __DIR__ . '/config.php';

$username = $argv[1] ?? null;
$tempPassword = $argv[2] ?? null;

if (!$username || !$tempPassword) {
    echo "الاستخدام: php create_admin.php <username> <temp_password>\n";
    exit(1);
}

if (strlen($tempPassword) < 10) {
    echo "يُفضّل أن تكون كلمة المرور المؤقتة 10 أحرف على الأقل.\n";
    exit(1);
}

$db = get_db();
$hash = password_hash($tempPassword, PASSWORD_DEFAULT);

try {
    $stmt = $db->prepare('
        INSERT INTO users (username, password_hash, full_name, role, permissions, must_change_password, totp_enabled, failed_attempts, locked_until)
        VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0)
        ON CONFLICT(username) DO UPDATE SET 
            password_hash = excluded.password_hash,
            role = excluded.role,
            permissions = excluded.permissions,
            failed_attempts = 0,
            locked_until = 0
    ');
    $stmt->execute([$username, $hash, $username, 'admin', '["*"]']);
    echo "تم إنشاء المستخدم '{$username}' بنجاح.\n";
    echo "عند أول تسجيل دخول سيُطلب منه تغيير كلمة المرور ثم ربط تطبيق Authenticator.\n";
} catch (PDOException $e) {
    if (str_contains($e->getMessage(), 'UNIQUE')) {
        echo "خطأ: اسم المستخدم '{$username}' موجود مسبقاً.\n";
    } else {
        echo "خطأ: " . $e->getMessage() . "\n";
    }
    exit(1);
}
