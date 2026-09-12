<?php
$svcPath = '/home/makanak-admin/data/firebase-service-account.json';
if (file_exists($svcPath)) {
    putenv('GOOGLE_APPLICATION_CREDENTIALS=' . $svcPath);
    putenv('FIREBASE_SERVICE_ACCOUNT_JSON=' . file_get_contents($svcPath));
}

/**
 * config.php
 * إعداد الجلسة وقاعدة البيانات (SQLite - ملف واحد، لا يحتاج سيرفر DB منفصل)
 */

// إعدادات الجلسة الآمنة
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.use_strict_mode', 1);
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_secure', !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? '1' : '0');

// ترويسات الحماية المتقدمة (Security Headers)
if (!headers_sent()) {
    header('X-Frame-Options: SAMEORIGIN');
    header('X-Content-Type-Options: nosniff');
    header('X-XSS-Protection: 1; mode=block');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Cross-Origin-Resource-Policy: same-origin');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if (!function_exists('is_maintenance_mode_active')) {
    function is_maintenance_mode_active(): bool
    {
        try {
            $db = get_db();
            $value = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'maintenance_mode' LIMIT 1")->fetchColumn();
            return $value !== false && $value !== null && in_array((string) $value, ['1', 'true', 'on', 'yes'], true);
        } catch (Throwable $e) {
            return false;
        }
    }
}

if (!function_exists('render_maintenance_page')) {
    function render_maintenance_page(): void
    {
        try {
            $db = get_db();
            $message = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'maintenance_message' LIMIT 1")->fetchColumn();
        } catch (Throwable $e) {
            $message = false;
        }

        $message = trim((string) ($message ?: 'المنصة تحت الصيانة، نعود قريباً!'));
        http_response_code(503);
        header('Retry-After: 3600');
        if (!headers_sent()) {
            header('Content-Type: text/html; charset=UTF-8');
        }

        echo '<!doctype html>';
        echo '<html lang="ar" dir="rtl">';
        echo '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصيانة</title>';
        echo '<style>body{margin:0;font-family:Tahoma,Arial,sans-serif;background:linear-gradient(135deg,#f8fafc,#e2e8f0);color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh} .card{max-width:620px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(15,23,42,.12);padding:40px 36px;text-align:center;border:1px solid #e2e8f0} .badge{display:inline-block;padding:10px 16px;border-radius:999px;background:#fef3c7;color:#b45309;font-weight:900;margin-bottom:18px} h1{margin:0 0 14px;font-size:36px;font-weight:900} p{font-size:18px;line-height:1.8;color:#475569;margin:0}</style></head>';
        echo '<body><div class="card"><div class="badge">🚧 وضع الصيانة</div><h1>الموقع مغلق مؤقتاً</h1><p>' . htmlspecialchars($message, ENT_QUOTES, 'UTF-8') . '</p></div></body></html>';
        exit;
    }
}

if (!defined('DB_PATH')) {
    $configuredDbPath = trim((string) getenv('MAKANAK_DB_PATH'));
    define('DB_PATH', $configuredDbPath !== '' ? $configuredDbPath : __DIR__ . '/database.sqlite');
}

if (!defined('SITE_WEB_APP_URL')) {
    define('SITE_WEB_APP_URL', 'https://koon-609da.web.app/');
}

if (!function_exists('normalize_page_analytics')) {
    function normalize_page_analytics(string $path): array
    {
        $path = trim((string) $path);
        if ($path === '' || $path === '/') {
            return ['page_name' => 'الرئيسية', 'slug' => SITE_WEB_APP_URL . '#/'];
        }

        $normalized = rtrim($path, '/');
        $route = $normalized === '' ? '/' : $normalized;
        $pageNames = [
            '/materials' => 'المواد الدراسية',
            '/plans' => 'الخطط الأكاديمية',
            '/quiz' => 'الاختبارات',
            '/calendar' => 'التقويم الدراسي',
            '/grading' => 'نظام الدرجات',
            '/exchange' => 'تبادل المواد',
            '/watcher' => 'مراقبة المساقات',
            '/portal' => 'بوابة المنسقين',
            '/admin' => 'لوحة الإدارة',
            '/volunteer-portal' => 'بوابة المتطوعين',
            '/report' => 'التقرير',
            '/faq' => 'الأسئلة الشائعة',
            '/about' => 'من نحن',
            '/legal' => 'الشروط والقوانين',
            '/news' => 'آخر الأخبار',
        ];

        $name = $pageNames[$route] ?? 'صفحة';
        if (str_starts_with($route, '/quiz/')) {
            $name = 'الاختبارات';
        }
        if (str_starts_with($route, '/materials/')) {
            $name = 'المواد الدراسية';
        }
        if (str_starts_with($route, '/exchange/')) {
            $name = 'تبادل المواد';
        }

        return [
            'page_name' => $name,
            'slug' => rtrim(SITE_WEB_APP_URL, '/') . '/#' . $route,
        ];
    }
}

if (!function_exists('is_public_maintenance_exempt')) {
    function is_public_maintenance_exempt(): bool
    {
        $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
        $requestUri = $_SERVER['REQUEST_URI'] ?? '';

        if (!empty($_SESSION['authenticated'])) {
            return true;
        }

        if ($script === 'login.php' || $script === 'logout.php' || $script === 'forgot_password.php' || $script === 'forgot_username.php' || $script === 'reset_password.php' || $script === 'setup_account.php' || $script === 'verify_totp.php' || $script === 'captcha_image.php') {
            return true;
        }

        if (str_contains($requestUri, '/admin/') || str_contains($requestUri, '/includes/') || str_contains($requestUri, '/api_')) {
            return true;
        }

        if (str_contains($requestUri, '/login.php') || str_contains($requestUri, '/verify_totp.php') || str_contains($requestUri, '/reset_password.php')) {
            return true;
        }

        return false;
    }
}

if (!function_exists('get_db')) {
    function get_db(): PDO
    {
        static $pdo = null;
        if ($pdo === null) {
            $pdo = new PDO('sqlite:' . DB_PATH);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $pdo->exec('PRAGMA foreign_keys = ON');
            $pdo->exec('PRAGMA busy_timeout = 5000');

            // إنشاء الجداول الأساسية
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS rate_limits (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_address TEXT NOT NULL,
                    action_key TEXT NOT NULL,
                    hits INTEGER NOT NULL DEFAULT 1,
                    first_hit INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(ip_address, action_key, expires_at);
            ");
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    full_name TEXT,
                    email TEXT,
                    role TEXT NOT NULL DEFAULT 'coordinator',
                    password_hash TEXT NOT NULL,
                    totp_secret TEXT,
                    totp_enabled INTEGER NOT NULL DEFAULT 0,
                    must_change_password INTEGER NOT NULL DEFAULT 1,
                    failed_attempts INTEGER NOT NULL DEFAULT 0,
                    locked_until INTEGER NOT NULL DEFAULT 0,
                    last_active_at TEXT,
                    last_device TEXT,
                    last_ip TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS donations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    donor_name TEXT NOT NULL,
                    phone TEXT,
                    amount REAL NOT NULL,
                    method TEXT NOT NULL DEFAULT 'cash',
                    status TEXT NOT NULL DEFAULT 'pending',
                    note TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS activity_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    action TEXT NOT NULL,
                    action_type TEXT NOT NULL DEFAULT 'general',
                    ip_address TEXT,
                    device_info TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS admin_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    type TEXT NOT NULL DEFAULT 'general',
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    target_url TEXT NOT NULL DEFAULT 'notifications.php',
                    source_key TEXT UNIQUE,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read, created_at);

                CREATE TABLE IF NOT EXISTS deleted_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_table TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    reason TEXT,
                    deleted_by INTEGER,
                    deleted_by_name TEXT,
                    deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS page_views (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    page_name TEXT NOT NULL,
                    slug TEXT UNIQUE NOT NULL,
                    views_count INTEGER NOT NULL DEFAULT 0,
                    unique_visitors INTEGER NOT NULL DEFAULT 0,
                    category TEXT NOT NULL DEFAULT 'عام',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS material_exchanges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    donor_name TEXT NOT NULL,
                    donor_phone TEXT,
                    donor_gender TEXT DEFAULT 'male',
                    material_name TEXT NOT NULL,
                    course_code TEXT,
                    faculty TEXT,
                    description TEXT,
                    status TEXT NOT NULL DEFAULT 'approved',
                    booker_name TEXT,
                    booker_phone TEXT,
                    booker_gender TEXT,
                    booked_at TEXT,
                    pickup_date TEXT,
                    pickup_time TEXT,
                    assigned_coordinator TEXT DEFAULT 'ahmad',
                    delivery_status TEXT DEFAULT 'pending_contact',
                    delivered_at TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS study_materials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    course_name TEXT NOT NULL,
                    course_code TEXT,
                    faculty TEXT NOT NULL,
                    major TEXT,
                    material_type TEXT NOT NULL DEFAULT 'summary',
                    instructor TEXT,
                    file_url TEXT,
                    file_type TEXT DEFAULT 'pdf',
                    contributor_name TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS quizzes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    course_name TEXT,
                    course_code TEXT,
                    faculty TEXT,
                    quiz_type TEXT NOT NULL DEFAULT 'quiz',
                    description TEXT,
                    form_link TEXT,
                    starts_at TEXT,
                    ends_at TEXT,
                    participants_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'draft',
                    created_by TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS quiz_parts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    title_en TEXT,
                    course_name TEXT,
                    course_code TEXT,
                    faculty TEXT,
                    duration_minutes INTEGER,
                    pass_mark REAL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS quiz_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    part_id INTEGER NOT NULL,
                    question_text TEXT NOT NULL,
                    question_text_en TEXT,
                    question_type TEXT NOT NULL DEFAULT 'mcq',
                    options_json TEXT,
                    correct_answer TEXT,
                    marks REAL NOT NULL DEFAULT 1,
                    explanation TEXT,
                    image_url TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (part_id) REFERENCES quiz_parts(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_quiz_questions_part ON quiz_questions(part_id);
                CREATE TABLE IF NOT EXISTS site_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    setting_key TEXT UNIQUE NOT NULL,
                    setting_value TEXT,
                    setting_group TEXT NOT NULL DEFAULT 'general',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS coordinators (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    phone TEXT,
                    gender TEXT DEFAULT 'male',
                    faculty TEXT,
                    major TEXT,
                    role_type TEXT NOT NULL DEFAULT 'coordinator',
                    bio TEXT,
                    tasks_count INTEGER NOT NULL DEFAULT 0,
                    tasks_completed INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    joined_at TEXT,
                    last_active_at TEXT,
                    notes TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS coordinator_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    media_type TEXT NOT NULL DEFAULT 'none',
                    media_url TEXT,
                    faculty TEXT NOT NULL DEFAULT 'all',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    points INTEGER NOT NULL DEFAULT 10,
                    due_date TEXT,
                    status TEXT NOT NULL DEFAULT 'available',
                    claimed_by_user_id INTEGER,
                    claimed_by_coord_id INTEGER,
                    claimed_at TEXT,
                    completed_at TEXT,
                    completion_notes TEXT,
                    created_by TEXT NOT NULL DEFAULT 'مدير النظام',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ");


            // هجرة تلقائية للأعمدة إذا كان الجدول منشأ مسبقاً (SQLite ALTER TABLE)
            $questionCols = $pdo->query("PRAGMA table_info(quiz_questions)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (!in_array('code_block', $questionCols, true)) {
                $pdo->exec("ALTER TABLE quiz_questions ADD COLUMN code_block TEXT;");
            }
            if (!in_array('correct_answers_json', $questionCols, true)) {
                $pdo->exec("ALTER TABLE quiz_questions ADD COLUMN correct_answers_json TEXT;");
            }
            if (!in_array('sub_questions_json', $questionCols, true)) {
                $pdo->exec("ALTER TABLE quiz_questions ADD COLUMN sub_questions_json TEXT;");
            }
            if (!in_array('image_url_2', $questionCols, true)) {
                $pdo->exec("ALTER TABLE quiz_questions ADD COLUMN image_url_2 TEXT;");
            }
            $userCols = $pdo->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (!in_array('full_name', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN full_name TEXT;");
            }
            if (!in_array('email', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN email TEXT;");
            }
            if (!in_array('password_reset_token_hash', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN password_reset_token_hash TEXT;");
            }
            if (!in_array('password_reset_expires_at', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN password_reset_expires_at INTEGER NOT NULL DEFAULT 0;");
            }
            if (!in_array('role', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'coordinator';");
            }
            if (!in_array('last_active_at', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN last_active_at TEXT;");
            }
            if (!in_array('last_device', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN last_device TEXT;");
            }
            if (!in_array('last_ip', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN last_ip TEXT;");
            }
            if (!in_array('permissions', $userCols)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN permissions TEXT;");
            }
            if (!in_array('avatar_path', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN avatar_path TEXT;");
            }
            if (!in_array('is_official', $userCols, true)) {
                $pdo->exec("ALTER TABLE users ADD COLUMN is_official INTEGER NOT NULL DEFAULT 1;");
            }

            $materialCols = $pdo->query("PRAGMA table_info(study_materials)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (!in_array('requirement_category', $materialCols)) {
                $pdo->exec("ALTER TABLE study_materials ADD COLUMN requirement_category TEXT;");
            }

            $deletedCols = $pdo->query("PRAGMA table_info(deleted_records)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (in_array('source_id', $deletedCols, true)) {
                $deletedType = $pdo->query("PRAGMA table_info(deleted_records)")->fetchAll(PDO::FETCH_ASSOC);
                $sourceIdType = null;
                foreach ($deletedType as $col) {
                    if (($col['name'] ?? '') === 'source_id') {
                        $sourceIdType = strtolower((string) ($col['type'] ?? ''));
                        break;
                    }
                }
                if ($sourceIdType === 'integer') {
                    $pdo->exec("ALTER TABLE deleted_records RENAME TO deleted_records_old;");
                    $pdo->exec("CREATE TABLE deleted_records (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        source_table TEXT NOT NULL,
                        source_id TEXT NOT NULL,
                        record_json TEXT NOT NULL,
                        reason TEXT,
                        deleted_by INTEGER,
                        deleted_by_name TEXT,
                        deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );");
                    $pdo->exec("INSERT INTO deleted_records (id, source_table, source_id, record_json, reason, deleted_by, deleted_by_name, deleted_at)
                        SELECT id, source_table, CAST(source_id AS TEXT), record_json, reason, deleted_by, deleted_by_name, deleted_at
                        FROM deleted_records_old;");
                    $pdo->exec("DROP TABLE deleted_records_old;");
                }
            }

            // هجرة جدول activity_log
            $logCols = $pdo->query("PRAGMA table_info(activity_log)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (!in_array('action_type', $logCols)) {
                $pdo->exec("ALTER TABLE activity_log ADD COLUMN action_type TEXT NOT NULL DEFAULT 'general';");
            }
            if (!in_array('ip_address', $logCols)) {
                $pdo->exec("ALTER TABLE activity_log ADD COLUMN ip_address TEXT;");
            }
            if (!in_array('device_info', $logCols)) {
                $pdo->exec("ALTER TABLE activity_log ADD COLUMN device_info TEXT;");
            }

            // هجرة جدول coordinators
            $coordCols = $pdo->query("PRAGMA table_info(coordinators)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (!in_array('user_id', $coordCols)) {
                $pdo->exec("ALTER TABLE coordinators ADD COLUMN user_id INTEGER;");
            }
            if (!in_array('points', $coordCols)) {
                $pdo->exec("ALTER TABLE coordinators ADD COLUMN points INTEGER NOT NULL DEFAULT 0;");
            }
            if (!in_array('lifetime_points', $coordCols)) {
                $pdo->exec("ALTER TABLE coordinators ADD COLUMN lifetime_points INTEGER NOT NULL DEFAULT 0;");
            }
            if (!in_array('badge_level', $coordCols)) {
                $pdo->exec("ALTER TABLE coordinators ADD COLUMN badge_level TEXT NOT NULL DEFAULT 'bronze';");
            }

            // هجرة جدول coordinator_tasks
            $taskCols = $pdo->query("PRAGMA table_info(coordinator_tasks)")->fetchAll(PDO::FETCH_COLUMN, 1);
            if (!in_array('category', $taskCols)) {
                $pdo->exec("ALTER TABLE coordinator_tasks ADD COLUMN category TEXT DEFAULT 'general';");
            }
            if (!in_array('attachment_url', $taskCols)) {
                $pdo->exec("ALTER TABLE coordinator_tasks ADD COLUMN attachment_url TEXT;");
            }
            if (!in_array('attachment_name', $taskCols)) {
                $pdo->exec("ALTER TABLE coordinator_tasks ADD COLUMN attachment_name TEXT;");
            }

            // جداول نظام النقاط والمكافآت
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS points_transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    coordinator_id INTEGER NOT NULL,
                    task_id INTEGER,
                    points_change INTEGER NOT NULL,
                    action_type TEXT NOT NULL DEFAULT 'task_completion',
                    reason TEXT NOT NULL,
                    created_by TEXT NOT NULL DEFAULT 'النظام',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS rewards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    cost_points INTEGER NOT NULL,
                    icon TEXT NOT NULL DEFAULT '🎁',
                    category TEXT NOT NULL DEFAULT 'certificate',
                    stock INTEGER NOT NULL DEFAULT -1,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS reward_redemptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    coordinator_id INTEGER NOT NULL,
                    reward_id INTEGER NOT NULL,
                    points_spent INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    admin_notes TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS contributions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_name TEXT NOT NULL DEFAULT 'مساهم مجهول',
                    subject_name TEXT NOT NULL,
                    course_code TEXT,
                    faculty TEXT DEFAULT 'عام',
                    file_name TEXT NOT NULL,
                    file_url TEXT NOT NULL,
                    file_type TEXT DEFAULT 'pdf',
                    file_size INTEGER NOT NULL DEFAULT 0,
                    contribution_type TEXT NOT NULL DEFAULT 'summary',
                    status TEXT NOT NULL DEFAULT 'pending',
                    notes TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS feedback_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_name TEXT NOT NULL,
                    student_email TEXT,
                    student_phone TEXT,
                    faculty TEXT DEFAULT 'عام',
                    rating INTEGER NOT NULL DEFAULT 5,
                    feedback_type TEXT NOT NULL DEFAULT 'review',
                    title TEXT,
                    content TEXT NOT NULL,
                    admin_reply TEXT,
                    is_approved INTEGER NOT NULL DEFAULT 1,
                    is_pinned INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'new',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS question_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reporter_name TEXT NOT NULL DEFAULT 'طالب',
                    reporter_contact TEXT,
                    question_title TEXT NOT NULL,
                    question_id TEXT,
                    course_name TEXT,
                    faculty TEXT,
                    report_type TEXT NOT NULL DEFAULT 'wrong_answer',
                    reason TEXT,
                    details TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    resolution_notes TEXT,
                    resolved_by TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS service_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_name TEXT NOT NULL,
                    student_phone TEXT NOT NULL,
                    student_email TEXT,
                    faculty TEXT DEFAULT 'عام',
                    service_type TEXT NOT NULL DEFAULT 'summary',
                    course_name TEXT,
                    details TEXT NOT NULL,
                    file_url TEXT,
                    status TEXT NOT NULL DEFAULT 'new',
                    assigned_to TEXT,
                    admin_notes TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS membership_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    applicant_name TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    email TEXT,
                    faculty TEXT NOT NULL DEFAULT 'عام',
                    major TEXT,
                    academic_year TEXT DEFAULT 'first_year',
                    motivation TEXT,
                    skills_experience TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    admin_notes TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS notices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title_ar TEXT NOT NULL,
                    title_en TEXT,
                    body_ar TEXT NOT NULL,
                    body_en TEXT,
                    notice_type TEXT NOT NULL DEFAULT 'info',
                    target_path TEXT DEFAULT '',
                    action_text_ar TEXT,
                    action_text_en TEXT,
                    action_url TEXT,
                    is_mandatory INTEGER NOT NULL DEFAULT 0,
                    is_pinned INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    expires_at TEXT,
                    created_by TEXT NOT NULL DEFAULT 'مدير النظام',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS faq_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_ar TEXT NOT NULL,
                    question_en TEXT,
                    answer_ar TEXT NOT NULL,
                    answer_en TEXT,
                    category TEXT NOT NULL DEFAULT 'general',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    views_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            ");

            // البيانات التجريبية معطّلة؛ يجب أن تبدأ صفحات الموقع فارغة.
            if (false) {
                // زرع بيانات أولية لتبادل المواد إذا كان الجدول فارغاً
                $exchangeCount = (int) $pdo->query("SELECT COUNT(*) FROM material_exchanges")->fetchColumn();
                if ($exchangeCount === 0) {
                    $sampleExchanges = [
                        [
                            'حسين الديات',
                            '0791234567',
                            'male',
                            'كتاب تفاضل وتكامل 1 (Calculus Thomas 14th)',
                            'MATH101',
                            'كلية العلوم',
                            'نسخة ورقية أصلية بحالة ممتازة مع بعض التظليلات المفيدة',
                            'completed',
                            'عبدالله العمري',
                            '0788765432',
                            'male',
                            '2026-08-18 10:30:00',
                            '2026-08-19',
                            '11:00',
                            'ahmad',
                            'completed',
                            '2026-08-19 11:15:00',
                            'تم التسليم في بهو كلية العلوم بنجاح'
                        ],
                        [
                            'سارة الخالد',
                            '0799887766',
                            'female',
                            'دوسية فيزياء عامة 1 + بنك أسئلة سنوات',
                            'PHYS101',
                            'كلية العلوم',
                            'دوسية شاملة للشرح وحلول أسئلة الكتاب والسنوات السابقة',
                            'reserved',
                            'رند القضاة',
                            '0771122334',
                            'female',
                            '2026-08-21 14:15:00',
                            '2026-08-23',
                            '12:30',
                            'sara',
                            'scheduled',
                            null,
                            'الموعد مؤكد يوم الأحد عند مدخل كلية الهندسة'
                        ],
                        [
                            'عمر النجار',
                            '0785544332',
                            'male',
                            'كتاب البرمجة الكائنية C++ (Deitel)',
                            'CS102',
                            'كلية تكنولوجيا المعلومات',
                            'كتاب مترجم وشامل مع أقراص وتطبيقات عملية',
                            'approved',
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            'ahmad',
                            'pending_contact',
                            null,
                            'متاح للاستلام الفوري'
                        ],
                        [
                            'آية المجالي',
                            '0793322114',
                            'female',
                            'كتاب مبادئ إدارة الأعمال (Management)',
                            'BUS101',
                            'كلية الأعمال',
                            'كتاب بحالة شبه جديدة طبعة حديثة مع ملخص المادة',
                            'approved',
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                            'sara',
                            'pending_contact',
                            null,
                            'متاح للاستلام'
                        ],
                        [
                            'محمد الزعبي',
                            '0789988112',
                            'male',
                            'سلايدات وملاحظات مادة الكيمياء العامة 101',
                            'CHEM101',
                            'كلية العلوم',
                            'ملف مطبوع ورقياً مرتب يشمل كافة التلخيصات لجميع الفصول',
                            'completed',
                            'طارق حداد',
                            '0796655443',
                            'male',
                            '2026-08-15 09:00:00',
                            '2026-08-16',
                            '10:00',
                            'ahmad',
                            'completed',
                            '2026-08-16 10:05:00',
                            'تم تسليمه للطالب'
                        ],
                        [
                            'دانا الشوابكة',
                            '0778899001',
                            'female',
                            'كتاب مهارات الاتصال والتواصل الجامعي',
                            'UNI101',
                            'كلية الآداب',
                            'كتاب متطلب جامعة إجباري مع ملخصات الامتحانات',
                            'reserved',
                            'نور العبداللات',
                            '0795544112',
                            'female',
                            '2026-08-22 09:45:00',
                            '2026-08-24',
                            '13:00',
                            'sara',
                            'contacted',
                            null,
                            'تم التواصل لتنسيق موعد الاستلام'
                        ],
                    ];

                    $stmtEx = $pdo->prepare("INSERT INTO material_exchanges 
                    (donor_name, donor_phone, donor_gender, material_name, course_code, faculty, description, status, booker_name, booker_phone, booker_gender, booked_at, pickup_date, pickup_time, assigned_coordinator, delivery_status, delivered_at, notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleExchanges as $se) {
                        $stmtEx->execute($se);
                    }
                }

                // زرع بيانات أولية للمواد الدراسية إذا كان الجدول فارغاً
                $studyCount = (int) $pdo->query("SELECT COUNT(*) FROM study_materials")->fetchColumn();
                if ($studyCount === 0) {
                    $sampleStudies = [
                        [
                            'ملخص تفاضل وتكامل 1 الشامل (Calculus 1)',
                            'تفاضل وتكامل 1',
                            'MATH101',
                            'كلية العلوم',
                            'الرياضيات والإحصاء',
                            'summary',
                            'first',
                            'first_year',
                            'د. يوسف الحنيطي',
                            'https://drive.google.com/file/d/sample-calc-1',
                            'pdf',
                            1420,
                            3540,
                            'فريق مكانك الأكاديمي',
                            'active',
                            'ملخص شامل للقوانين والشروحات مع حلول أمثلة سنوات سابقة.'
                        ],
                        [
                            'بنك أسئلة سنوات سابقة فيزياء 101 مع الإجابات النموذجية',
                            'فيزياء عامة 1',
                            'PHYS101',
                            'كلية العلوم',
                            'الفيزياء',
                            'exam',
                            'first',
                            'first_year',
                            'د. سامي العوران',
                            'https://drive.google.com/file/d/sample-phys-101',
                            'pdf',
                            2190,
                            4810,
                            'أحمد الرواشدة',
                            'active',
                            'تجميع لجميع امتحانات الفيرست والسكند والفاينل للسنوات السابقة.'
                        ],
                        [
                            'سلايدات تدريس مادة هياكل البيانات والخوارزميات (Data Structures)',
                            'هياكل البيانات',
                            'CS210',
                            'كلية تكنولوجيا المعلومات',
                            'علم الحاسوب',
                            'slides',
                            'second',
                            'second_year',
                            'د. رائد الشبول',
                            'https://drive.google.com/file/d/sample-ds-slides',
                            'pdf',
                            980,
                            2430,
                            'لجنة الـ IT',
                            'active',
                            'سلايدات المادة الرسمية مرتبة من الشابتر الأول حتى الأخير.'
                        ],
                        [
                            'دوسية مبادئ المحاسبة 1 وحلول المسائل (Accounting 101)',
                            'مبادئ المحاسبة 1',
                            'ACC101',
                            'كلية الأعمال',
                            'المحاسبة',
                            'book',
                            'first',
                            'first_year',
                            'د. نضال الصمادي',
                            'https://drive.google.com/file/d/sample-acc-1',
                            'pdf',
                            1670,
                            3920,
                            'سارة قاسم',
                            'active',
                            'شرح مفصل للقيود اليومية والقوائم المالية مع أمثلة عملية محلولة.'
                        ],
                        [
                            'ملخص كيمياء عامة 101 وتجارب المختبر',
                            'كيمياء عامة 1',
                            'CHEM101',
                            'كلية العلوم',
                            'الكيمياء',
                            'summary',
                            'first',
                            'first_year',
                            'د. منى الطراونة',
                            'https://drive.google.com/file/d/sample-chem-101',
                            'pdf',
                            1130,
                            2870,
                            'طارق ناصر',
                            'active',
                            'تلخيص المادة النظرية مع التركيز على المعادلات وتجارب اللاب.'
                        ],
                        [
                            'دفتر ملاحظات وشرح دوائر كهربائية 1 (Circuits 1)',
                            'تحليل الدوائر الكهربائية 1',
                            'EE201',
                            'كلية الهندسة',
                            'الهندسة الكهربائية',
                            'notebook',
                            'second',
                            'second_year',
                            'د. فادي التميمي',
                            'https://drive.google.com/file/d/sample-circuits',
                            'pdf',
                            840,
                            1950,
                            'عمر الحباشنة',
                            'active',
                            'دفتر خط يدوي عالي الجودة لجميع محاضرات وملاحظات الدكتور.'
                        ],
                        [
                            'تجميع أسئلة سنوات وامتحانات الميد لمادة اللغة الإنجليزية 99/101',
                            'لغة إنجليزية 101',
                            'LANG101',
                            'كلية اللغات',
                            'متطلب جامعة',
                            'exam',
                            'general',
                            'first_year',
                            'قسم اللغات',
                            'https://drive.google.com/file/d/sample-eng-101',
                            'pdf',
                            3150,
                            6890,
                            'فريق مكانك',
                            'active',
                            'نماذج امتحانات القواعد والقطع المعتمدة مع مفاتيح الحل.'
                        ],
                        [
                            'ملخص مادة التربية الوطنية والتاريخ الأردني',
                            'التربية الوطنية',
                            'UNI102',
                            'كلية الآداب',
                            'متطلب جامعة إجباري',
                            'summary',
                            'general',
                            'first_year',
                            'د. كمال العبادي',
                            'https://drive.google.com/file/d/sample-watanyah',
                            'pdf',
                            4210,
                            8950,
                            'نشمي الجامعة',
                            'active',
                            'تلخيص جداول التواريخ والمحطات الوطنية بأسلوب مبسط للاختبارات.'
                        ],
                    ];

                    $stmtSt = $pdo->prepare("INSERT INTO study_materials
                    (title, course_name, course_code, faculty, major, material_type, semester, academic_year, instructor, file_url, file_type, downloads_count, views_count, contributor_name, status, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleStudies as $ss) {
                        $stmtSt->execute($ss);
                    }
                }

                // زرع بيانات افتراضية لصفحات الموقع إذا كان الجدول فارغاً
                $pvCount = (int) $pdo->query("SELECT COUNT(*) FROM page_views")->fetchColumn();
                if ($pvCount === 0) {
                    $pagesSeed = [
                        ['الرئيسية (منصة مكانك)', '/', 18850, 7210, 'عام'],
                        ['إدارة تبادل المواد الدراسية', '/admin/donations.php', 12420, 4180, 'لوحة التحكم'],
                        ['المواد الدراسية والملخصات', '/admin/study_materials.php', 14830, 5940, 'تعليمي'],
                        ['الخدمات الطلابية', '/services', 7120, 2890, 'طلبات'],
                        ['الأسئلة الشائعة والدعم', '/faq', 4210, 1850, 'دعم'],
                        ['سجل النشاط ونشاط المنسقين', '/admin/activity_log.php', 3690, 1420, 'لوحة التحكم'],
                    ];
                    $stmt = $pdo->prepare("INSERT INTO page_views (page_name, slug, views_count, unique_visitors, category) VALUES (?, ?, ?, ?, ?)");
                    foreach ($pagesSeed as $ps) {
                        $stmt->execute($ps);
                    }
                }

                // زرع بيانات أولية للاختبارات إذا كان الجدول فارغاً
                $quizCount = (int) $pdo->query("SELECT COUNT(*) FROM quizzes")->fetchColumn();
                if ($quizCount === 0) {
                    $sampleQuizzes = [
                        ['كويز تفاضل وتكامل 1 — الفصل الأول 2025/2026', 'تفاضل وتكامل 1', 'MATH101', 'كلية العلوم', 'quiz', 'كويز تجريبي لقياس مستوى الطلاب في الفصل الأول — يشمل الاشتقاق والتكامل وقواعد السلسلة.', 'https://forms.gle/sample-math-quiz', '2026-08-10 08:00:00', '2026-08-17 23:59:00', 143, 'ended', 'أحمد المنسق'],
                        ['استبيان جودة المواد الدراسية المشاركة في المنصة', null, null, null, 'survey', 'استبيان لقياس رضا الطلاب عن المواد المشاركة وتقييم مدى فائدتها ووضوحها وشمولها.', 'https://forms.gle/sample-survey-materials', '2026-08-15 00:00:00', '2026-09-15 23:59:00', 87, 'active', 'فريق مكانك'],
                        ['اختبار مبادئ محاسبة 1 — بنك الأسئلة الشامل', 'مبادئ المحاسبة 1', 'ACC101', 'كلية الأعمال', 'midterm', 'نموذج اختبار ميد ترم شامل يغطي الوحدات الأولى حتى الخامسة مع الإجابات النموذجية.', 'https://forms.gle/sample-acc-mid', '2026-08-20 09:00:00', '2026-08-20 11:00:00', 62, 'ended', 'سارة المنسقة'],
                        ['كويز الكيمياء العامة 1 — المعادلات والتفاعلات', 'كيمياء عامة 1', 'CHEM101', 'كلية العلوم', 'quiz', 'كويز سريع يغطي المفاهيم الأساسية للتفاعلات الكيميائية وموازنة المعادلات.', 'https://forms.gle/sample-chem-quiz', '2026-09-01 00:00:00', '2026-09-07 23:59:00', 0, 'draft', 'أحمد المنسق'],
                        ['اختبار البرمجة الكائنية OOP — C++ الشامل', 'البرمجة الكائنية', 'CS102', 'كلية تكنولوجيا المعلومات', 'final', 'نموذج اختبار فاينل شامل يغطي الكلاسات والإرث والتعددية الشكلية والقوالب.', 'https://forms.gle/sample-oop-final', '2026-08-05 08:00:00', '2026-08-05 10:30:00', 98, 'ended', 'لجنة IT'],
                        ['استبيان تقييم خدمات فريق مكانك الجامعي 2026', null, null, null, 'survey', 'استبيان شامل لقياس رضا الطلاب عن خدمات الفريق وتحديد نقاط التحسين المستقبلية.', 'https://forms.gle/sample-team-survey', '2026-08-22 00:00:00', '2026-09-30 23:59:00', 34, 'active', 'فريق مكانك'],
                    ];
                    $stmtQ = $pdo->prepare("INSERT INTO quizzes (title, course_name, course_code, faculty, quiz_type, description, form_link, starts_at, ends_at, participants_count, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleQuizzes as $q) {
                        $stmtQ->execute($q);
                    }
                }

                // زرع إعدادات الموقع الافتراضية
                $settingsCount = (int) $pdo->query("SELECT COUNT(*) FROM site_settings")->fetchColumn();
                if ($settingsCount === 0) {
                    $defaultSettings = [
                        // المجموعة: عام
                        ['site_name', 'مكانك الجامعي', 'general'],
                        ['site_tagline', 'شريكك الأكاديمي في الجامعة', 'general'],
                        ['site_description', 'منصة طلابية متكاملة تجمع المواد الدراسية وتبادل الكتب وخدمات الطلاب في مكان واحد.', 'general'],
                        ['welcome_message', 'مرحباً بكم في منصة مكانك الجامعي — نحن هنا لنجعل رحلتك الأكاديمية أسهل وأجمل! 🎓', 'general'],
                        ['contact_email', 'makanak@university.edu.jo', 'general'],
                        // المجموعة: التواصل الاجتماعي
                        ['whatsapp_link', 'https://wa.me/962790000000', 'social'],
                        ['instagram_link', 'https://instagram.com/makanak_uni', 'social'],
                        ['telegram_link', 'https://t.me/makanak_uni', 'social'],
                        ['linkedin_link', '', 'social'],
                        ['twitter_link', '', 'social'],
                        // المجموعة: النظام
                        ['maintenance_mode', '0', 'system'],
                        ['maintenance_message', 'المنصة تحت الصيانة، نعود قريباً!', 'system'],
                        ['allow_registration', '1', 'system'],
                        ['material_status_checker_enabled', '1', 'system'],
                        ['items_per_page', '20', 'system'],
                        ['timezone', 'Asia/Amman', 'system'],
                        // المجموعة: الأمان
                        ['session_lifetime', '120', 'security'],
                        ['max_login_attempts', '5', 'security'],
                        ['lockout_minutes', '15', 'security'],
                        ['force_2fa', '0', 'security'],
                        ['password_min_length', '8', 'security'],
                        // المجموعة: الإشعارات
                        ['enable_notifications', '1', 'notifications'],
                        ['notify_new_exchange', '1', 'notifications'],
                        ['notify_new_member', '1', 'notifications'],
                        ['notify_reports', '1', 'notifications'],
                        ['admin_notify_email', 'admin@makanak.edu.jo', 'notifications'],
                        // المجموعة: المظهر
                        ['primary_color', '#0284c7', 'appearance'],
                        ['dark_mode_allowed', '0', 'appearance'],
                        ['logo_text', 'مكانك', 'appearance'],
                        ['rtl_mode', '1', 'appearance'],
                    ];
                    $stmtSet = $pdo->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group) VALUES (?, ?, ?)");
                    foreach ($defaultSettings as $s) {
                        $stmtSet->execute($s);
                    }
                }

                // زرع بيانات أولية للمنسقين إذا كان الجدول فارغاً
                $coordCount = (int) $pdo->query("SELECT COUNT(*) FROM coordinators")->fetchColumn();
                if ($coordCount === 0) {
                    $sampleCoords = [
                        ['أحمد الرواشدة', '0791234567', 'male', 'كلية العلوم', 'علم الحاسوب', 'lead_coordinator', 'منسق رئيسي متخصص في دعم طلاب العلوم والتكنولوجيا. يشرف على عمليات تبادل المواد ويتابع الحالات بدقة.', 48, 45, 1, '2025-09-01', '2026-08-22 08:30:00', 'المنسق الأكثر نشاطاً في الفريق'],
                        ['سارة القضاة', '0799887766', 'female', 'كلية الأعمال', 'إدارة الأعمال', 'coordinator', 'منسقة مسؤولة عن طلاب كلية الأعمال والمحاسبة. تتميز بالدقة في المتابعة وسرعة الاستجابة مع الطلاب.', 31, 29, 1, '2025-10-15', '2026-08-21 16:00:00', 'متخصصة في كلية الأعمال'],
                        ['عمر النجار', '0785544332', 'male', 'كلية الهندسة', 'الهندسة الكهربائية', 'coordinator', 'منسق متطوع من كلية الهندسة. يدعم طلاب الهندسة في الحصول على المواد الدراسية وتبادل الكتب التقنية.', 22, 20, 1, '2026-01-10', '2026-08-20 14:00:00', null],
                        ['آية المجالي', '0793322114', 'female', 'كلية الآداب', 'اللغة العربية والعلوم الإنسانية', 'coordinator', 'منسقة نشطة تخدم طلاب كلية الآداب واللغات. تهتم بجمع ونشر مواد متطلبات الجامعة الإجبارية.', 17, 15, 1, '2026-02-01', '2026-08-19 11:30:00', null],
                        ['محمد الزعبي', '0789988112', 'male', 'كلية تكنولوجيا المعلومات', 'نظم المعلومات', 'coordinator', 'منسق تقني يدعم طلاب IT في تبادل المواد البرمجية والتقنية. يساعد أيضاً في إدارة المحتوى الرقمي للمنصة.', 14, 12, 1, '2026-03-15', '2026-08-18 09:00:00', null],
                        ['دانا الشوابكة', '0778899001', 'female', 'كلية العلوم', 'الكيمياء والأحياء', 'coordinator', 'منسقة في كلية العلوم. حالياً في إجازة دراسية وستعود للنشاط في مطلع الفصل القادم.', 8, 7, 0, '2026-04-01', '2026-07-30 10:00:00', 'في إجازة دراسية حتى مطلع الفصل الثاني'],
                    ];
                    $stmtC = $pdo->prepare("INSERT INTO coordinators (name, phone, gender, faculty, major, role_type, bio, tasks_count, tasks_completed, is_active, joined_at, last_active_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleCoords as $c) {
                        $stmtC->execute($c);
                    }
                }

                // بذور جدول المهام والتكليفات coordinator_tasks
                $tasksCount = (int) $pdo->query("SELECT COUNT(*) FROM coordinator_tasks")->fetchColumn();
                if ($tasksCount === 0) {
                    $sampleTasks = [
                        [
                            'استلام وتدقيق كتب كلية العلوم من مستودع الجامعة',
                            'يرجى التوجه إلى المستودع الرئيسي بمبنى كلية العلوم واستلام 12 كتاب تفاضل 1 وفيزياء عامة وتدقيق حالتها والتأكد من نظافة الصفحات قبل إدراجها في منصة التبادل.',
                            'image',
                            'https://images.unsplash.com/photo-1532012164546-f432f2e37b73?w=800',
                            'كلية العلوم',
                            'urgent',
                            25,
                            '2026-08-25',
                            'available',
                            null,
                            null,
                            null,
                            null,
                            null,
                            'مدير النظام'
                        ],
                        [
                            'فرز وتصنيف دوسيات مادة البرمجة C++ ونظم التشغيل',
                            'فرز وتجهيز النسخ الورقية المطبوعة لمادتي C++ وأنظمة التشغيل وتوزيعها على صناديق الاستلام في كلية IT مع إلصاق أرقام التعريف لكل مادة.',
                            'image',
                            'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800',
                            'كلية تكنولوجيا المعلومات',
                            'medium',
                            20,
                            '2026-08-26',
                            'in_progress',
                            2,
                            1,
                            '2026-08-22 09:30:00',
                            null,
                            null,
                            'مدير النظام'
                        ],
                        [
                            'تنظيم جناح تبادل الكتب في بهو كلية الأعمال',
                            'الإشراف الميداني على تسليم واستلام الكتب المتبادلة بين طلاب إدارة الأعمال والمحاسبة خلال فترة استراحة منتصف اليوم.',
                            'none',
                            null,
                            'كلية الأعمال',
                            'normal',
                            15,
                            '2026-08-27',
                            'available',
                            null,
                            null,
                            null,
                            null,
                            null,
                            'مدير النظام'
                        ],
                        [
                            'تسجيل فيديو قصير لشرح طريقة استلام المواد للطلبة الجدد',
                            'تصوير فيديو إرشادي مدته 60 ثانية يوضح للطالب كيفية فتح تذكرة الاستلام وإبرازها لمنسق الكلية لتسليم الكتاب بسلاسة.',
                            'video',
                            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                            'all',
                            'urgent',
                            35,
                            '2026-08-24',
                            'available',
                            null,
                            null,
                            null,
                            null,
                            null,
                            'مدير النظام'
                        ],
                        [
                            'مراجعة وتدقيق بنك أسئلة مادة الكيمياء العامة 101',
                            'تم تدقيق بنك الأسئلة والمراجعات والتأكد من مطابقتها للخطة التدريسية ونشرها في قسم الاختبارات.',
                            'none',
                            null,
                            'كلية العلوم',
                            'normal',
                            30,
                            '2026-08-20',
                            'completed',
                            3,
                            2,
                            '2026-08-19 10:00:00',
                            '2026-08-20 15:45:00',
                            'تم إنجاز تدقيق كافة الفصول وإدراج 60 سؤالاً جديداً.',
                            'مدير النظام'
                        ]
                    ];

                    $stmtT = $pdo->prepare("INSERT INTO coordinator_tasks (title, description, media_type, media_url, faculty, priority, points, due_date, status, claimed_by_user_id, claimed_by_coord_id, claimed_at, completed_at, completion_notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleTasks as $st) {
                        $stmtT->execute($st);
                    }
                }

                // زرع بيانات المساهمات contributions
                $contribCount = (int) $pdo->query("SELECT COUNT(*) FROM contributions")->fetchColumn();
                if ($contribCount === 0) {
                    $sampleContribs = [
                        ['يزن القضاة', 'تفاضل وتكامل 1', 'MATH101', 'كلية العلوم', 'ملخص_قوانين_التكامل_المتقدم.pdf', 'https://res.cloudinary.com/dnlgudjtg/raw/upload/v1/koon-contributions/sample1.pdf', 'pdf', 2450000, 'summary', 'approved', 'ملخص ممتاز ومرتب تم اعتماده'],
                        ['رنيم العبداللات', 'فيزياء عامة 1', 'PHYS101', 'كلية العلوم', 'حلول_أسئلة_شابتر_3_و_4.pdf', 'https://res.cloudinary.com/dnlgudjtg/raw/upload/v1/koon-contributions/sample2.pdf', 'pdf', 1890000, 'exam', 'approved', 'حلول نموذجية للواجبات والسنوات'],
                        ['مساهم مجهول', 'هياكل البيانات', 'CS210', 'كلية تكنولوجيا المعلومات', 'تلخيص_خوارزميات_الفرز_والبحث.docx', 'https://res.cloudinary.com/dnlgudjtg/raw/upload/v1/koon-contributions/sample3.docx', 'doc', 950000, 'summary', 'pending', 'ملف بحاجة لتدقيق المحتوى العلمي'],
                        ['طارق المجالي', 'مبادئ المحاسبة 1', 'ACC101', 'كلية الأعمال', 'نماذج_قيود_اليومية_والقوائم_المالية.pdf', 'https://res.cloudinary.com/dnlgudjtg/raw/upload/v1/koon-contributions/sample4.pdf', 'pdf', 3120000, 'summary', 'approved', 'تمت الإضافة للمستودع'],
                        ['سندس الزعبي', 'كيمياء عامة 1', 'CHEM101', 'كلية العلوم', 'ملاحظات_مختبر_الكيمياء_العملي.png', 'https://res.cloudinary.com/dnlgudjtg/raw/upload/v1/koon-contributions/sample5.png', 'image', 1200000, 'notes', 'pending', 'صور واضحة للملاحظات اليدوية'],
                    ];
                    $stmtC = $pdo->prepare("INSERT INTO contributions (student_name, subject_name, course_code, faculty, file_name, file_url, file_type, file_size, contribution_type, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleContribs as $sc) {
                        $stmtC->execute($sc);
                    }
                }

                // زرع بيانات الآراء والتقييمات feedback_reviews
                $revCount = (int) $pdo->query("SELECT COUNT(*) FROM feedback_reviews")->fetchColumn();
                if ($revCount === 0) {
                    $sampleReviews = [
                        ['أحمد خليل', 'ahmad.k@gmail.com', '0791112233', 'كلية تكنولوجيا المعلومات', 5, 'review', 'منصة رائعة جداً', 'منصة مكانك وفرت علينا ساعات طويلة في البحث عن الملخصات وتنسيق استلام الكتب. شكراً للقائمين عليها!', 'نشكرك يا أحمد على دعمك الدائم وكلماتك الطيبة! 🌟', 1, 1, 'reviewed'],
                        ['دينا الصمادي', 'dina.s@yahoo.com', '0785544112', 'كلية العلوم', 5, 'review', 'خدمة تبادل الكتب ممتازة', 'استلمت كتاب الكالكولاس خلال أقل من 24 ساعة بتنسيق ممتاز مع المنسق أحمد.', 'أهلاً بك دينا دائماً، ونتمنى لك كل التوفيق والنجاح!', 1, 1, 'reviewed'],
                        ['محمد الجراح', 'm.jarrah@outlook.com', '0779988441', 'كلية الهندسة', 4, 'suggestion', 'اقتراح إضافة إشعارات واتساب', 'اقترح إرسال رسالة واتساب تلقائية عند حجز كتاب جديد أو تأكيد الاستلام.', 'اقتراح قيم وممتاز وسيتم إدراجه ضمن التحديث القادم بإذن الله.', 1, 0, 'resolved'],
                        ['سالم النعيمات', 'salem.n@gmail.com', '0793344556', 'كلية الأعمال', 5, 'review', 'بنك الأسئلة ساعدني في الميد', 'بنك أسئلة المحاسبة كان مطابقاً جداً لنمط الامتحانات الجامعية.', null, 1, 0, 'new'],
                    ];
                    $stmtR = $pdo->prepare("INSERT INTO feedback_reviews (student_name, student_email, student_phone, faculty, rating, feedback_type, title, content, admin_reply, is_approved, is_pinned, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleReviews as $sr) {
                        $stmtR->execute($sr);
                    }
                }

                // زرع بيانات البلاغات question_reports
                $repCount = (int) $pdo->query("SELECT COUNT(*) FROM question_reports")->fetchColumn();
                if ($repCount === 0) {
                    $sampleReports = [
                        ['عبدالله الشامي', '0798877665', 'سؤال رقم 14 في كويز تفاضل 1 — الاشتقاق الضمني', 'q_math_14', 'تفاضل وتكامل 1', 'كلية العلوم', 'wrong_answer', 'الإجابة النموذجية المعلمة هي (B) لكن الحل الصحيح بالخطوات هو (C).', 'تم التحقق من دكتور المادة وتعديل الخيار الصحيح.', 'resolved', 'تم تصحيح مفتاح الإجابة في بنك الأسئلة وتحديث النتيجة.', 'المدير العام'],
                        ['رغد النجار', '0782233445', 'سؤال رقم 5 في اختبار الفيزياء — معادلات الحركة', 'q_phys_05', 'فيزياء عامة 1', 'كلية العلوم', 'typo', 'يوجد خطأ إملائي في نص السؤال يغير المعنى الفيزيائي.', 'يرجى مراجعة الصياغة.', 'pending', null, null],
                        ['حمزة العمري', '0774455667', 'سؤال رقم 22 في امتحان هياكل البيانات — تعقيد QuickSort', 'q_cs_22', 'هياكل البيانات', 'كلية تكنولوجيا المعلومات', 'broken_image', 'صورة شجرة التفرع لا تظهر في بعض المتصفحات.', 'تم إعادة رفع الصورة بجودة عالية.', 'resolved', 'تم تحديث رابط الصورة في قاعدة البيانات.', 'المدير العام'],
                    ];
                    $stmtRep = $pdo->prepare("INSERT INTO question_reports (reporter_name, reporter_contact, question_title, question_id, course_name, faculty, report_type, reason, details, status, resolution_notes, resolved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleReports as $srep) {
                        $stmtRep->execute($srep);
                    }
                }

                // زرع بيانات طلبات الخدمات service_requests
                $servCount = (int) $pdo->query("SELECT COUNT(*) FROM service_requests")->fetchColumn();
                if ($servCount === 0) {
                    $sampleServices = [
                        ['خالد الحباشنة', '0791238899', 'khaled@edu.jo', 'كلية العلوم', 'summary', 'تفاضل وتكامل 2', 'نرجو توفير ملخص مفصل لوحدة المتسلسلات (Series and Sequences) مع حلول لأسئلة السنوات.', null, 'in_progress', 'أحمد الرواشدة', 'جاري إعداد الملف وتجهيزه للنشر'],
                        ['ميساء عبيدات', '0786655443', 'maysaa@edu.jo', 'كلية الأعمال', 'quiz', 'مبادئ التسويق', 'طلب إضافة بنك أسئلة اختيار من متعدد لمادة مبادئ التسويق استعداداً لامتحان الفاينل.', null, 'completed', 'سارة القضاة', 'تم رفع بنك الأسئلة المكون من 80 سؤالاً بنجاح'],
                        ['ليث الخوالدة', '0778811223', 'laith@edu.jo', 'كلية تكنولوجيا المعلومات', 'idea', 'عام', 'اقتراح تنظيم ورشة عمل تدريبية عبر Google Meet لشرح كيفية استخدام أدوات الذكاء الاصطناعي في الدراسة.', null, 'new', null, 'فكرة ممتازة سيتم مناقشتها في الاجتماع القادم'],
                    ];
                    $stmtS = $pdo->prepare("INSERT INTO service_requests (student_name, student_phone, student_email, faculty, service_type, course_name, details, file_url, status, assigned_to, admin_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleServices as $ss) {
                        $stmtS->execute($ss);
                    }
                }

                // زرع بيانات طلبات الانضمام membership_requests
                $memCount = (int) $pdo->query("SELECT COUNT(*) FROM membership_requests")->fetchColumn();
                if ($memCount === 0) {
                    $sampleMembers = [
                        ['أنس الطراونة', '0794455661', 'anas.t@gmail.com', 'كلية الهندسة', 'هندسة ميكانيكية', 'second_year', 'أرغب بالانضمام لفريق مكانك للمساهمة في تنظيم تبادل الكتب وخدمة زملائي الطلبة.', 'خبرة سابقة في العمل التطوعي الجامعي وتنظيم الفعاليات الطلابية.', 'pending', null],
                        ['فاطمة الزعبي', '0789988223', 'fatima.z@gmail.com', 'كلية الصيدلة', 'دكتور صيدلة', 'third_year', 'لدي شغف بتلخيص المواد العلمية وتنسيق الملفات الطبية للطلبة المستجدين.', 'مهارات متقدمة في التصميم والـ Word وإعداد الملخصات الاحترافية.', 'approved', 'تم التواصل وقبول انضمامها لمنسقي الكليات الطبية'],
                        ['محمود العساف', '0772233441', 'mahmoud.a@gmail.com', 'كلية الأعمال', 'تمويل ومصارف', 'first_year', 'أحب المشاركة في الأنشطة الطلابية وتقديم المساعدة في الجوانب الإدارية والتنظيمية.', 'إدارة الوقت والتواصل الفعال.', 'pending', null],
                    ];
                    $stmtM = $pdo->prepare("INSERT INTO membership_requests (applicant_name, phone, email, faculty, major, academic_year, motivation, skills_experience, status, admin_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleMembers as $sm) {
                        $stmtM->execute($sm);
                    }
                }

                // زرع بيانات الإعلانات والتنبيهات notices
                $notCount = (int) $pdo->query("SELECT COUNT(*) FROM notices")->fetchColumn();
                if ($notCount === 0) {
                    $sampleNotices = [
                        ['بدء استقبال طلبات تبادل الكتب للفصل الدراسي الجديد 📚', 'Book Exchange Open for New Semester', 'يسر فريق مكانك الجامعي الإعلان عن فتح باب استقبال الكتب والمواد الدراسية للتبرع والتبادل بين الطلبة.', 'Makanak team is pleased to announce the opening of book donations and exchanges.', 'success', '/exchange', 'تصفح الكتب المتاحة', 'Browse Books', '/exchange', 0, 1, 1, '2026-09-30', 'المدير العام'],
                        ['تحديث بنك أسئلة امتحانات منتصف الفصل (الميد ترم) 📝', 'Midterm Exam Question Bank Updated', 'تم بحمد الله إضافة أكثر من 300 سؤال تدريبي جديد لمواد متطلبات الجامعة والكليات العلمية.', 'Added over 300 new practice questions for university requirements.', 'info', '/quiz', 'ابدأ الاختبار الآن', 'Start Quiz', '/quiz', 0, 0, 1, '2026-10-15', 'المدير العام'],
                        ['تنبيه: تحديث مواعيد تسليم الكتب في كلية العلوم ⚠️', 'Notice: Book Pickup Schedule Update', 'يرجى من الطلبة الحاجزين للكتب مراجعة منسق الكلية في مبنى العلوم بين الساعة 10:00 و 12:00 ظهراً.', 'Students are requested to meet the coordinator in the Science building.', 'warning', '/exchange', 'عرض التفاصيل', 'View Details', '/exchange', 0, 0, 1, '2026-09-05', 'المدير العام'],
                    ];
                    $stmtN = $pdo->prepare("INSERT INTO notices (title_ar, title_en, body_ar, body_en, notice_type, target_path, action_text_ar, action_text_en, action_url, is_mandatory, is_pinned, is_active, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleNotices as $sn) {
                        $stmtN->execute($sn);
                    }
                }

                // زرع بيانات الأسئلة الشائعة ونشمي faq_entries
                $faqCount = (int) $pdo->query("SELECT COUNT(*) FROM faq_entries")->fetchColumn();
                if ($faqCount === 0) {
                    $sampleFaqs = [
                        ['كيف يمكنني حجز كتاب أو مادة دراسية من المنصة؟', 'How can I reserve a book or material?', 'يمكنك الدخول إلى قسم «تبادل المواد»، واختيار المادة المطلوبة ثم الضغط على زر «احجز الآن» وتعبئة اسمك ورقم هاتفك وسيتواصل معك منسق الكلية فوراً لتسليمك المادة مجاناً.', 'Go to the Material Exchange section, choose your book, and click Reserve.', 'exchange', 1, 1, 420],
                        ['هل المواد والملخصات المعروضة في المنصة مجانية بالكامل؟', 'Are all materials and summaries completely free?', 'نعم، جميع المواد الدراسية، الملخصات، بنوك الأسئلة، والكتب المتبادلة في منصة مكانك مجانية 100% وهي خدمة تطوعية من الطلاب ولأجلهم.', 'Yes, 100% of materials on Makanak are completely free.', 'general', 2, 1, 890],
                        ['كيف يمكنني المساهمة برفع ملخص أو دوسية للموقع؟', 'How can I contribute my study summaries?', 'يمكنك الضغط على زر «ساهم معنا» في صفحة المواد أو الاختبارات، واختيار الملف أو رابط Google Drive وسيقوم الفريق بمراجعته ونشره باسمك ومكافأتك بنقاط التطوع.', 'Click "Contribute" and upload your file or link.', 'academic', 3, 1, 310],
                        ['ما هو المساعد الذكي نشمي وكيف يساعدني؟', 'What is Nashmi AI and how can it help?', '«نشمي» هو المساعد الأكاديمي الذكي المطور خصيصاً لطلاب الجامعة لمساعدتك في معرفة الخطط الدراسية، احتساب المعدل التراكمي، إرشادك للملخصات المناسبة والإجابة على أي استفسار جامعي.', 'Nashmi is our smart AI assistant designed to guide you through university life.', 'nashmi', 4, 1, 1250],
                    ];
                    $stmtF = $pdo->prepare("INSERT INTO faq_entries (question_ar, question_en, answer_ar, answer_en, category, sort_order, is_active, views_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                    foreach ($sampleFaqs as $sf) {
                        $stmtF->execute($sf);
                    }
                }
            }
        }

        $exchangeColumns = $pdo->query('PRAGMA table_info(material_exchanges)')->fetchAll(PDO::FETCH_COLUMN, 1);
        if (!in_array('archive_key', $exchangeColumns, true))
            $pdo->exec('ALTER TABLE material_exchanges ADD COLUMN archive_key TEXT');
        if (!in_array('archive_label', $exchangeColumns, true))
            $pdo->exec('ALTER TABLE material_exchanges ADD COLUMN archive_label TEXT');
        $pdo->exec("UPDATE material_exchanges SET archive_key = 'second_2025_2026', archive_label = 'الفصل الدراسي الثاني 2025-2026' WHERE archive_key IS NULL AND notes LIKE '%الفصل الدراسي الثاني 2025%'");
        $pdo->exec("UPDATE material_exchanges SET archive_key = 'summer_2025_2026', archive_label = 'الفصل الدراسي الصيفي 2025-2026' WHERE archive_key IS NULL AND notes LIKE '%الفصل الدراسي الصيفي 2026%'");
        $pdo->exec("UPDATE material_exchanges SET archive_key = 'second_2025_2026', archive_label = 'الفصل الدراسي الثاني 2025-2026' WHERE archive_key IS NULL AND created_at LIKE '2026-08-22%'");

        // Do not block every page load on a full Firestore import. Run this as
        // an explicit worker with ENABLE_OFFICIAL_LIVE_SYNC=1 when needed.
        $liveSyncFile = __DIR__ . '/sync_official_live.php';
        if (getenv('ENABLE_OFFICIAL_LIVE_SYNC') === '1' && is_file($liveSyncFile)) {
            require_once $liveSyncFile;
            try {
                sync_official_live($pdo);
            } catch (Throwable $syncError) {
                error_log('Official live sync failed: ' . $syncError->getMessage());
            }
        }
        return $pdo;
    }
}

if (!function_exists('normalize_quiz_question_text')) {
    function normalize_quiz_question_text(?string $text): string
    {
        $text = trim((string) $text);
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
        return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
    }
}

if (!function_exists('find_duplicate_quiz_question_id')) {
    function find_duplicate_quiz_question_id(PDO $db, string $partSlug, ?string $textAr, ?string $textEn, int $excludeId = 0): ?int
    {
        $partSlug = trim($partSlug);
        $keys = array_values(array_unique(array_filter([
            normalize_quiz_question_text($textAr),
            normalize_quiz_question_text($textEn),
        ])));
        if ($partSlug === '' || $keys === []) {
            return null;
        }

        $stmt = $db->prepare('SELECT id, text_ar, text_en FROM quiz_questions WHERE part_slug = ? AND id != ?');
        $stmt->execute([$partSlug, $excludeId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $existingKeys = array_values(array_unique(array_filter([
                normalize_quiz_question_text($row['text_ar'] ?? ''),
                normalize_quiz_question_text($row['text_en'] ?? ''),
            ])));
            if (array_intersect($keys, $existingKeys) !== []) {
                return (int) $row['id'];
            }
        }

        return null;
    }
}

if (!function_exists('get_client_device_info')) {
    /** التعرف على اسم الجهاز والمتصفح ونظام التشغيل */
    function get_client_device_info(): string
    {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown Device';

        // نظام التشغيل
        $os = 'نظام غير معروف';
        if (preg_match('/windows nt 10/i', $userAgent))
            $os = 'Windows 10/11';
        elseif (preg_match('/windows/i', $userAgent))
            $os = 'Windows';
        elseif (preg_match('/macintosh|mac os x/i', $userAgent))
            $os = 'macOS';
        elseif (preg_match('/iphone/i', $userAgent))
            $os = 'iPhone (iOS)';
        elseif (preg_match('/ipad/i', $userAgent))
            $os = 'iPad (iPadOS)';
        elseif (preg_match('/android/i', $userAgent))
            $os = 'Android';
        elseif (preg_match('/linux/i', $userAgent))
            $os = 'Linux';

        // المتصفح
        $browser = 'متصفح ويب';
        if (preg_match('/edg/i', $userAgent))
            $browser = 'Edge';
        elseif (preg_match('/chrome/i', $userAgent))
            $browser = 'Chrome';
        elseif (preg_match('/safari/i', $userAgent))
            $browser = 'Safari';
        elseif (preg_match('/firefox/i', $userAgent))
            $browser = 'Firefox';
        elseif (preg_match('/opera|opr/i', $userAgent))
            $browser = 'Opera';

        return "{$os} — {$browser}";
    }
}

if (!function_exists('enforce_maintenance_mode')) {
    function enforce_maintenance_mode(): void
    {
        if (is_public_maintenance_exempt()) {
            return;
        }

        if (is_maintenance_mode_active()) {
            render_maintenance_page();
        }
    }
}

enforce_maintenance_mode();

if (!function_exists('touch_user_activity')) {
    /** تحديث توقيت نشاط المستخدم وفحص انتهاء الجلسة حسب الإعدادات */
    function touch_user_activity(): void
    {
        if (empty($_SESSION['user_id']))
            return;
        $db = get_db();

        // فحص مهلة الجلسة عند الخمول (Session Lifetime)
        $sessionLifetimeMins = 120;
        try {
            $sessSetting = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'session_lifetime'")->fetchColumn();
            if ($sessSetting !== false && is_numeric($sessSetting)) {
                $sessionLifetimeMins = (int) $sessSetting;
            }
        } catch (Exception $e) {
        }

        $lastActivity = $_SESSION['last_activity_time'] ?? time();
        if ((time() - $lastActivity) > ($sessionLifetimeMins * 60)) {
            $userId = $_SESSION['user_id'];
            $username = $_SESSION['username'] ?? 'مستخدم';
            $_SESSION = [];
            if (session_status() === PHP_SESSION_ACTIVE) {
                session_destroy();
            }
            $targetLogin = strpos($_SERVER['PHP_SELF'] ?? '', '/admin/') !== false ? '../login.php?expired=1' : 'login.php?expired=1';
            header('Location: ' . $targetLogin);
            exit;
        }
        $_SESSION['last_activity_time'] = time();

        $device = get_client_device_info();
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $now = date('Y-m-d H:i:s');

        $db->prepare("UPDATE users SET last_active_at = ?, last_device = ?, last_ip = ? WHERE id = ?")
            ->execute([$now, $device, $ip, $_SESSION['user_id']]);
    }
}

if (!function_exists('log_activity')) {
    /** تسجيل حدث مفصل في سجل النشاط */
    function log_activity(string $action, string $action_type = 'general'): void
    {
        $db = get_db();
        $username = $_SESSION['username'] ?? 'system';
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $device = get_client_device_info();
        $now = date('Y-m-d H:i:s');

        $db->prepare('INSERT INTO activity_log (username, action, action_type, ip_address, device_info, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$username, $action, $action_type, $ip, $device, $now]);
    }
}

if (!function_exists('create_admin_notification')) {
    /** إنشاء إشعار إداري مع منع التكرار عند إعادة المزامنة */
    function create_admin_notification(string $type, string $title, string $message, string $targetUrl, ?string $sourceKey = null): void
    {
        $db = get_db();
        $db->prepare('INSERT OR IGNORE INTO admin_notifications (type, title, message, target_url, source_key) VALUES (?, ?, ?, ?, ?)')
            ->execute([$type, $title, $message, $targetUrl, $sourceKey]);
    }
}

if (!function_exists('archive_record')) {
    function archive_record(string $table, int|string $id, string $reason = 'حذف'): bool
    {
        $db = get_db();
        $allowedTables = ['notices', 'contributions', 'users', 'coordinators', 'material_exchanges', 'faq_entries', 'membership_requests', 'question_reports', 'feedback_reviews', 'rewards', 'study_materials', 'service_requests', 'coordinator_tasks', 'quizzes', 'quiz_subjects', 'quiz_parts', 'quiz_questions'];
        if (!in_array($table, $allowedTables, true)) {
            return false;
        }
        $stmt = $db->prepare("SELECT * FROM {$table} WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$record) {
            return false;
        }
        $userId = (int) ($_SESSION['user_id'] ?? 0);
        $userName = $_SESSION['username'] ?? 'system';
        $db->prepare('INSERT INTO deleted_records (source_table, source_id, record_json, reason, deleted_by, deleted_by_name) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$table, (string) $id, json_encode($record, JSON_UNESCAPED_UNICODE), $reason, $userId, $userName]);
        return true;
    }
}

if (!function_exists('archive_delete')) {
    function archive_delete(string $table, int|string $id, string $reason = 'حذف'): bool
    {
        $db = get_db();
        if (!archive_record($table, $id, $reason)) {
            return false;
        }
        $deleted = $db->prepare("DELETE FROM {$table} WHERE id = ?")->execute([$id]);
        if ($deleted) {
            $_SESSION['redirect_to_deleted_archive'] = true;
        }
        return $deleted;
    }
}

if (!function_exists('csrf_token')) {
    /** توليد توكن CSRF وتخزينه بالجلسة */
    function csrf_token(): string
    {
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['csrf'];
    }
}

if (!function_exists('csrf_check')) {
    function csrf_check(string $token): bool
    {
        return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
    }
}

if (!function_exists('user_has_permission')) {
    function is_read_only_user(?array $user = null): bool
    {
        if (empty($user)) {
            if (empty($_SESSION['user_id']))
                return false;
            $db = get_db();
            $stmt = $db->prepare('SELECT role FROM users WHERE id = ?');
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        }
        return ($user['role'] ?? '') === 'observer';
    }

    /** التحقق هل يملك المستخدم صلاحية لفتح صفحة/قسم معين */
    function user_has_permission(string $page_key, ?array $user = null): bool
    {
        if (empty($user)) {
            if (empty($_SESSION['user_id']))
                return false;
            $db = get_db();
            $stmt = $db->prepare('SELECT role, permissions FROM users WHERE id = ?');
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user)
                return false;
        }

        $role = $user['role'] ?? 'coordinator';
        $uid = (int) ($user['id'] ?? ($_SESSION['user_id'] ?? 0));
        // المشرف العام أو المستخدم الرئيسي رقم 1 له وصول كامل لجميع الصفحات
        if ($role === 'admin' || $role === 'super_admin' || $uid === 1 || ($user['username'] ?? '') === 'HUSSIEN') {
            return true;
        }

        // الزائر/المراقب يستطيع الاطلاع على أقسام اللوحة، لكن لا ينفذ أي POST.
        if ($role === 'observer') {
            return true;
        }

        // صفحات شخصية متاحة للجميع دائماً
        if (in_array($page_key, ['profile', 'two_factor', 'notifications'], true)) {
            return true;
        }

        if (empty($user['permissions'])) {
            // الصلاحيات الافتراضية للمنسق إن لم تُحدد
            return in_array($page_key, ['donations', 'materials'], true);
        }

        $perms = json_decode($user['permissions'], true);
        if (!is_array($perms)) {
            return false;
        }

        if (in_array('*', $perms, true) || in_array('all', $perms, true)) {
            return true;
        }

        return in_array($page_key, $perms, true);
    }

    /** التحقق من صلاحية إجراء دقيق داخل صفحة، مثل tasks.create أو materials.upload. */
    function user_has_capability(string $capability, ?array $user = null): bool
    {
        if (empty($user)) {
            if (empty($_SESSION['user_id'])) {
                return false;
            }
            $db = get_db();
            $stmt = $db->prepare('SELECT id, username, role, permissions FROM users WHERE id = ?');
            $stmt->execute([$_SESSION['user_id']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$user) {
                return false;
            }
        }

        $role = $user['role'] ?? 'coordinator';
        $uid = (int) ($user['id'] ?? ($_SESSION['user_id'] ?? 0));
        if ($role === 'admin' || $role === 'super_admin' || $uid === 1 || strtoupper((string) ($user['username'] ?? '')) === 'HUSSIEN') {
            return true;
        }
        if ($role === 'observer') {
            return false;
        }

        $permissions = json_decode((string) ($user['permissions'] ?? ''), true);
        return is_array($permissions) && (in_array($capability, $permissions, true) || in_array('*', $permissions, true) || in_array('all', $permissions, true));
    }
}

// دور الزائر/المراقب للقراءة فقط: يمنع كل عمليات POST قبل أن تصل للصفحة.
if (!empty($_SESSION['authenticated']) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && is_read_only_user()) {
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    exit('<div style="font-family:Arial,sans-serif;direction:rtl;text-align:center;padding:70px"><h2>الوصول للقراءة فقط</h2><p>حساب الزائر أو المراقب لا يملك صلاحية تنفيذ التعديلات.</p><a href="javascript:history.back()">العودة</a></div>');
}

if (!function_exists('enforce_admin_page_post_permission')) {
    function enforce_admin_page_post_permission(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST' || empty($_SESSION['authenticated']))
            return;

        $pagePermissions = [
            'ads.php' => 'ads',
            'contributions.php' => 'contributions',
            'deleted.php' => 'deleted',
            'donations.php' => 'donations',
            'faq.php' => 'faq',
            'general_admin.php' => 'general',
            'membership_requests.php' => 'membership',
            'notifications.php' => 'notifications',
            'rewards.php' => 'rewards',
            'reports.php' => 'reports',
            'reviews.php' => 'reviews',
            'service_requests.php' => 'services',
            'study_materials.php' => 'materials',
            'tasks.php' => 'tasks',
            'tests.php' => 'tests',
        ];
        $script = basename((string) ($_SERVER['SCRIPT_NAME'] ?? ''));
        if (isset($pagePermissions[$script]) && !user_has_permission($pagePermissions[$script])) {
            http_response_code(403);
            exit('تم تقييد الوصول: لا تملك الصلاحية المطلوبة لتنفيذ هذا الإجراء. يرجى التواصل مع مدير النظام.');
        }
    }
    enforce_admin_page_post_permission();
}

if (!function_exists('get_coordinator_badge_level')) {
    /** إرجاع الرتبة والشارة وشريط التقدم حسب إجمالي النقاط */
    function get_coordinator_badge_level(int $points): array
    {
        if ($points >= 1000) {
            return ['key' => 'diamond', 'label' => 'ماس (Diamond)', 'icon' => '', 'bg' => '#fdf2f8', 'color' => '#db2777', 'next_points' => null, 'progress' => 100];
        } elseif ($points >= 500) {
            return ['key' => 'platinum', 'label' => 'بلاتيني (Platinum)', 'icon' => '', 'bg' => '#f5f3ff', 'color' => '#7c3aed', 'next_points' => 1000, 'progress' => round(($points - 500) / 500 * 100)];
        } elseif ($points >= 250) {
            return ['key' => 'gold', 'label' => 'ذهبي (Gold)', 'icon' => '', 'bg' => '#fefce8', 'color' => '#ca8a04', 'next_points' => 500, 'progress' => round(($points - 250) / 250 * 100)];
        } elseif ($points >= 100) {
            return ['key' => 'silver', 'label' => 'فضي (Silver)', 'icon' => '', 'bg' => '#f8fafc', 'color' => '#475569', 'next_points' => 250, 'progress' => round(($points - 100) / 150 * 100)];
        } else {
            return ['key' => 'bronze', 'label' => 'برونزي (Bronze)', 'icon' => '', 'bg' => '#fff7ed', 'color' => '#c2410c', 'next_points' => 100, 'progress' => min(100, round($points / 100 * 100))];
        }
    }
}

if (!function_exists('add_coordinator_points')) {
    /** إضافة أو خصم نقاط المنسق مع تسجيل الحركة في جدول المعاملات وتحديث الرتبة */
    function add_coordinator_points(int $coordId, int $pointsChange, string $reason, string $actionType = 'task_completion', ?int $taskId = null, string $createdBy = 'النظام'): bool
    {
        $db = get_db();
        $cStmt = $db->prepare("SELECT id, points, lifetime_points FROM coordinators WHERE id = ?");
        $cStmt->execute([$coordId]);
        $coord = $cStmt->fetch(PDO::FETCH_ASSOC);
        if (!$coord)
            return false;

        $newPoints = max(0, (int) $coord['points'] + $pointsChange);
        $newLifetime = (int) $coord['lifetime_points'];
        if ($pointsChange > 0) {
            $newLifetime += $pointsChange;
        }

        $badge = get_coordinator_badge_level($newLifetime)['key'];

        $db->prepare("UPDATE coordinators SET points = ?, lifetime_points = ?, badge_level = ? WHERE id = ?")
            ->execute([$newPoints, $newLifetime, $badge, $coordId]);

        $db->prepare("INSERT INTO points_transactions (coordinator_id, task_id, points_change, action_type, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
            ->execute([$coordId, $taskId, $pointsChange, $actionType, $reason, $createdBy]);

        return true;
    }
}

if (!function_exists('check_rate_limit')) {
    /** فحص وتطبيق محدد الطلبات Rate Limiter لمنع هجمات التخمين والـ DDoS */
    function check_rate_limit(string $actionKey, int $maxHits = 60, int $windowSeconds = 60): bool
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $now = time();
        $db = get_db();

        // تنظيف السجلات المنتهية
        $db->prepare("DELETE FROM rate_limits WHERE expires_at < ?")->execute([$now]);

        // جلب سجل الـ IP للإجراء
        $stmt = $db->prepare("SELECT id, hits, expires_at FROM rate_limits WHERE ip_address = ? AND action_key = ? AND expires_at >= ? LIMIT 1");
        $stmt->execute([$ip, $actionKey, $now]);
        $record = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($record) {
            if ((int) $record['hits'] >= $maxHits) {
                return false; // تجاوز الحد المسموح
            }
            $db->prepare("UPDATE rate_limits SET hits = hits + 1 WHERE id = ?")->execute([$record['id']]);
        } else {
            $expires = $now + $windowSeconds;
            $db->prepare("INSERT INTO rate_limits (ip_address, action_key, hits, first_hit, expires_at) VALUES (?, ?, 1, ?, ?)")
                ->execute([$ip, $actionKey, $now, $expires]);
        }
        return true;
    }
}

if (!function_exists('enforce_rate_limit')) {
    /** تطبيق حظر فوري إذا تجاوز الـ IP حد الطلبات المسموح */
    function enforce_rate_limit(string $actionKey, int $maxHits = 60, int $windowSeconds = 60, string $errorMsg = 'تم حظر الطلب مؤقتاً بسبب تجاوز معدل الطلبات المسموح (Rate Limit Exceeded)'): void
    {
        if (!check_rate_limit($actionKey, $maxHits, $windowSeconds)) {
            http_response_code(429);
            header('Retry-After: ' . $windowSeconds);
            header('Content-Type: text/html; charset=utf-8');
            die("
                <div style='font-family:sans-serif;text-align:center;padding:50px;direction:rtl;'>
                    <h2 style='color:#dc2626;'>⛔ تم تقييد الوصول مؤقتاً (429 Too Many Requests)</h2>
                    <p style='color:#4b5563;'>$errorMsg</p>
                    <p style='font-size:13px;color:#9ca3af;'>يرجى الانتظار دقيقة والمحاولة مجدداً.</p>
                </div>
            ");
        }
    }
}

if (!function_exists('redirect')) {
    function redirect(string $path): never
    {
        header('Location: ' . $path);
        exit;
    }
}



