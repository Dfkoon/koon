<?php
/**
 * admin/_header.php
 * يُضمَّن في بداية كل صفحة داخل admin/.
 */
require_once __DIR__ . '/../config.php';
if (!function_exists('liveSyncCollection')) {
    require_once __DIR__ . '/../sync_official_live.php';
}

// Allow read-only access with dev_key for testing/demo purposes
$isReadOnlyMode = false;
if (!empty($_GET['dev_key'])) {
    $devKeyHash = hash('sha256', 'dev_makanak_2026_readonly');
    if (hash_equals($devKeyHash, $_GET['dev_key'])) {
        $isReadOnlyMode = true;
    }
}

if (empty($_SESSION['authenticated']) && !$isReadOnlyMode) {
    redirect('../login.php');
}

// محدد معدل طلبات لوحة التحكم (DDoS Protection)
enforce_rate_limit('admin_panel_req', 180, 60, 'تم تجاوز الحد الأقصى لمعدل الطلبات في لوحة التحكم.');

// تحديث نشاط المستخدم والجهاز
touch_user_activity();

$db = get_db();
$userId = $_SESSION['user_id'] ?? 0;
$userStmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$userStmt->execute([$userId]);
$currentUserData = $userStmt->fetch(PDO::FETCH_ASSOC);
$isAdminHeaderUser = in_array($currentUserData['role'] ?? '', ['admin', 'super_admin'], true)
    || (int) ($currentUserData['id'] ?? 0) === 1
    || strtoupper((string) ($currentUserData['username'] ?? '')) === 'HUSSIEN';
if ($isAdminHeaderUser) {
    $unreadNotificationCount = (int) $db->query("SELECT COUNT(*) FROM admin_notifications WHERE is_read = 0")->fetchColumn();
    $menuNotificationCounts = $db->query("SELECT target_url, COUNT(*) AS total FROM admin_notifications WHERE is_read = 0 GROUP BY target_url")->fetchAll(PDO::FETCH_KEY_PAIR);
    $latestNotifications = $db->query("SELECT id, title, message, target_url, is_read, created_at FROM admin_notifications ORDER BY created_at DESC, id DESC LIMIT 5")->fetchAll(PDO::FETCH_ASSOC);
} else {
    $headerUsername = (string) ($currentUserData['username'] ?? '');
    $headerPersonalNotifications = array_values(array_filter(liveSyncCollection('coordinatorNotifications'), static fn($notification) => (string) ($notification['recipientUsername'] ?? '') === $headerUsername));
    $unreadNotificationCount = count(array_filter($headerPersonalNotifications, static fn($notification) => empty($notification['isRead'])));
    $menuNotificationCounts = [];
    $latestNotifications = array_map(static fn($notification) => [
        'id' => $notification['_id'] ?? '',
        'title' => $notification['title'] ?? 'إشعار من الإدارة',
        'message' => $notification['message'] ?? '',
        'target_url' => 'notifications.php',
        'is_read' => !empty($notification['isRead']) ? 1 : 0,
        'created_at' => $notification['createdAt'] ?? '',
    ], array_slice($headerPersonalNotifications, 0, 5));
}

$currentUsername = $currentUserData['username'] ?? ($_SESSION['username'] ?? 'مستخدم');
$currentFullName = trim((string) ($currentUserData['full_name'] ?? '')) ?: $currentUsername;
$currentAvatar = $currentUserData['avatar_path'] ?? '';
$currentEmail = $currentUserData['email'] ?? 'لم يُحدد البريد';
$roleLabels = [
    'super_admin' => 'مدير عام',
    'admin' => 'مشرف عام',
    'observer' => 'زائر / مراقب (قراءة فقط)',
    'coordinator' => 'منسق معتمد',
    'team_lead' => 'مسؤول فريق',
    'campaign_coordinator' => 'منسق حملة',
    'field_officer' => 'مسؤول ميداني',
];
$currentRole = $roleLabels[$currentUserData['role'] ?? ''] ?? 'مستخدم النظام';
$isReadOnlyHeaderUser = ($currentUserData['role'] ?? '') === 'observer';

// نقاط ورتبة المنسق الحالي (لعرضها في شريط التطبيق)
$headerCoordPoints = null;
try {
    $hcStmt = $db->prepare('SELECT points, lifetime_points, badge_level FROM coordinators WHERE user_id = ? LIMIT 1');
    $hcStmt->execute([$userId]);
    $headerCoordPoints = $hcStmt->fetch(PDO::FETCH_ASSOC) ?: null;
} catch (Exception $e) {
}

$menu = require __DIR__ . '/_menu.php';
$page_key = $page_key ?? '';
$page_title = $page_title ?? 'لوحة التحكم';

if (!empty($_SESSION['redirect_to_deleted_archive'])) {
    unset($_SESSION['redirect_to_deleted_archive']);
    header('Location: deleted.php');
    exit;
}

// فلترة القائمة الجانبية بحسب صلاحيات المستخدم
if (!$isReadOnlyMode && is_array($currentUserData)) {
    $allowedMenu = array_filter($menu, function ($item) use ($currentUserData) {
        return user_has_permission($item['key'], $currentUserData);
    });

    // التحقق من صلاحية الصفحة الحالية
    $isPageAllowed = empty($page_key) || user_has_permission($page_key, $currentUserData);
} else {
    // In read-only mode, allow all menu items and pages
    $allowedMenu = $menu;
    $isPageAllowed = true;
}

// إعدادات درع الحماية الأمني
$watermarkActive = true;
$antiCaptureActive = true;
try {
    $secRows = $db->query("SELECT setting_key, setting_value FROM site_settings WHERE setting_key IN ('enable_anti_capture', 'enable_watermark')")->fetchAll(PDO::FETCH_KEY_PAIR);
    if (isset($secRows['enable_anti_capture']))
        $antiCaptureActive = ($secRows['enable_anti_capture'] === '1');
    if (isset($secRows['enable_watermark']))
        $watermarkActive = ($secRows['enable_watermark'] === '1');
} catch (Exception $e) {
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($page_title) ?> — لوحة التحكم</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700;800&family=Noto+Kufi+Arabic:wght@500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        rel="stylesheet">
    <link rel="stylesheet" href="../assets/style.css">
    <link rel="stylesheet" href="../assets/admin.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

    <!-- درع الحماية ومنع تصوير الشاشة والعلامة المائية الجنائية -->
    <script>
        window.__SECURITY_SHIELD_CONFIG = {
            username: <?= json_encode($currentUsername) ?>,
            fullName: <?= json_encode($currentFullName) ?>,
            ip: <?= json_encode($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1') ?>,
            time: <?= json_encode(date('Y-m-d H:i')) ?>,
            watermarkEnabled: <?= $watermarkActive ? 'true' : 'false' ?>,
            antiCaptureEnabled: <?= $antiCaptureActive ? 'true' : 'false' ?>
        };
    </script>
    <script src="../assets/security_shield.js" defer></script>
</head>

<body class="admin-body<?= $isReadOnlyHeaderUser ? ' admin-read-only' : '' ?>">
    <div class="admin-shell">

        <aside class="admin-sidebar">
            <div class="sidebar-brand">
                <div class="sidebar-logo">
                    <img src="../uploads/avatars/user_5_d5d5d87a315769a7.png" alt="شعار المنصة">
                </div>
                <div class="sidebar-brand-text">لوحة التحكم</div>
                <button type="button" class="sidebar-close-btn"
                    onclick="const shell=document.querySelector('.admin-shell'); shell.classList.remove('sidebar-open'); shell.classList.add('sidebar-collapsed')"
                    aria-label="إغلاق القائمة" title="إغلاق القائمة">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"
                        stroke-linecap="round">
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="18" y1="6" x2="6" y2="18" />
                    </svg>
                </button>
            </div>

            <nav class="sidebar-nav">
                <?php 
                $sidebarPendingReportsCount = 0;
                try {
                    $sidebarPendingReportsCount = (int) $db->query("SELECT COUNT(*) FROM question_reports WHERE status IN ('pending', 'new', '') OR status IS NULL")->fetchColumn();
                } catch (Exception $e) {}
                foreach ($allowedMenu as $item): 
                    $badgeCount = 0;
                    if ($item['key'] === 'reports') {
                        $badgeCount = $sidebarPendingReportsCount;
                    } elseif (isset($menuNotificationCounts[$item['file']])) {
                        $badgeCount = (int) $menuNotificationCounts[$item['file']];
                    }
                ?>
                    <a href="<?= htmlspecialchars($item['file']) ?>"
                        class="sidebar-link <?= $item['key'] === $page_key ? 'active' : '' ?> <?= $item['ready'] ? '' : 'is-stub' ?>">
                        <span class="sidebar-icon">
                            <?= get_menu_svg_icon($item['icon_key'] ?? $item['key']) ?>
                        </span>
                        <span><?= htmlspecialchars($item['label']) ?></span>
                        <?php if ($badgeCount > 0): ?>
                            <span style="margin-right:auto; background:#ef4444; color:#fff; font-size:11px; font-weight:800; padding:1px 7px; border-radius:12px; box-shadow:0 0 8px rgba(239,68,68,0.4);"><?= $badgeCount ?></span>
                        <?php endif; ?>
                        <?php if (!$item['ready']): ?><span class="stub-dot" title="قيد الإنشاء"></span><?php endif; ?>
                    </a>
                <?php endforeach; ?>
            </nav>

            <a href="../logout.php" class="sidebar-logout">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px; vertical-align: middle;">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                تسجيل الخروج
            </a>
        </aside>

        <div class="admin-main">
            <header class="admin-topbar">
                <div class="topbar-right-box">
                    <button class="mobile-menu-btn"
                        onclick="const shell=document.querySelector('.admin-shell'); if (window.innerWidth <= 860) { shell.classList.remove('sidebar-collapsed'); shell.classList.toggle('sidebar-open'); } else { shell.classList.toggle('sidebar-collapsed'); }">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                            stroke-width="2">
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>
                    <h1><?= htmlspecialchars($page_title) ?></h1>
                </div>

                <!-- شارة نقاط المنسق في الشريط العلوي -->
                <?php
                $badgeColors = ['bronze' => ['bg' => '#fff7ed', 'color' => '#c2410c'], 'silver' => ['bg' => '#f8fafc', 'color' => '#475569'], 'gold' => ['bg' => '#fefce8', 'color' => '#ca8a04'], 'platinum' => ['bg' => '#f5f3ff', 'color' => '#7c3aed'], 'diamond' => ['bg' => '#fdf2f8', 'color' => '#db2777']];
                if ($headerCoordPoints !== null):
                    $lvl = $headerCoordPoints['badge_level'] ?? 'bronze';
                    $bColor = $badgeColors[$lvl] ?? $badgeColors['bronze'];
                    ?>
                    <a href="rewards.php" class="topbar-badge"
                        style="display:flex;align-items:center;gap:8px;text-decoration:none;background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:5px 14px;box-shadow:0 1px 2px rgba(0,0,0,0.04);transition:box-shadow .15s;"
                        title="نقاطي ورتبتي — اضغط للذهاب إلى صفحة المكافآت">
                        <span style="font-weight:800;font-size:13px;color:#0f172a;">
                            <?= number_format((int) $headerCoordPoints['points']) ?> نقطة</span>
                        <span
                            style="background:<?= $bColor['bg'] ?>;color:<?= $bColor['color'] ?>;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:800;"><?= strtoupper($lvl) ?></span>
                    </a>
                <?php endif; ?>

                <div class="topbar-left-box">
                    <div class="topbar-actions">
                        <button type="button" id="adminNotificationsBellBtn" onclick="toggleAdminNotifications(event)"
                            aria-label="الإشعارات" title="الإشعارات الحية"
                            style="position:relative;width:42px;height:42px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#334155;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .15s;">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
                            </svg>
                        </button>

                        <!-- زر البحث السريع السحري (Command Palette - Ctrl+K) -->
                        <button type="button" class="topbar-search-trigger" onclick="openQuickSearchModal()"
                            title="بحث سريع في النظام (Ctrl + K)">
                            <div class="search-trigger-content">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <circle cx="11" cy="11" r="8" />
                                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                            </div>
                        </button>
                        <div id="adminNotificationsMenu"
                            style="display:none;position:absolute;z-index:2000;top:calc(100% + 12px);right:0;left:auto;width:340px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 14px 35px rgba(15,23,42,.18);overflow:hidden;animation:slideDown 0.2s ease;">
                            <div
                                style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                                <strong style="color:#0f172a;font-size:14px;display:flex;align-items:center;gap:6px;">
                                    <span>آخر الإشعارات</span>
                                </strong>
                                <div style="display:flex;gap:8px;align-items:center;">
                                    <button type="button" onclick="markAllNotificationsRead(event)"
                                        style="background:none;border:none;color:#0284c7;font-size:11.5px;font-weight:700;cursor:pointer;padding:0;"
                                        title="تحديد الكل كمقروء">تحديد الكل</button>
                                    <span style="color:#cbd5e1;">·</span>
                                    <a href="notifications.php"
                                        style="font-size:11.5px;color:#64748b;text-decoration:none;font-weight:600;">السجل</a>
                                </div>
                            </div>
                            <div id="adminNotificationsList" style="max-height:360px;overflow-y:auto;">
                                <?php if (!$latestNotifications): ?>
                                    <div style="padding:24px 16px;text-align:center;color:#94a3b8;font-size:13px;">لا توجد
                                        إشعارات حتى الآن</div>
                                <?php else:
                                    foreach ($latestNotifications as $notification): ?>
                                        <a href="<?= htmlspecialchars($notification['target_url']) ?>"
                                            style="display:block;padding:12px 16px;text-decoration:none;border-bottom:1px solid #f1f5f9;background:<?= $notification['is_read'] ? '#fff' : '#f0f9ff' ?>;transition:background .15s;">
                                            <div
                                                style="font-weight:700;color:#1e293b;font-size:13px;display:flex;align-items:center;justify-content:space-between;">
                                                <span><?= htmlspecialchars($notification['title']) ?></span>
                                                <?php if (!$notification['is_read']): ?><span
                                                        style="width:7px;height:7px;border-radius:50%;background:#0284c7;display:inline-block;"></span><?php endif; ?>
                                            </div>
                                            <div style="margin-top:3px;color:#64748b;font-size:12px;line-height:1.4;">
                                                <?= htmlspecialchars($notification['message']) ?>
                                            </div>
                                        </a>
                                    <?php endforeach; endif; ?>
                            </div>
                        </div>
                    </div>

                    <!-- قائمة المستخدم التفاعلية (User Dropdown) -->

                    <div class="topbar-user-dropdown" id="topbarUserDropdown">
                        <button type="button" class="topbar-user-btn" onclick="toggleUserDropdown(event)">
                            <span class="topbar-avatar">
                                <?php if ($currentAvatar): ?><img src="<?= htmlspecialchars($currentAvatar) ?>"
                                        alt="<?= htmlspecialchars($currentFullName) ?>"
                                        style="width:100%;height:100%;object-fit:cover;border-radius:50%;"><?php else: ?>
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                <?php endif; ?>
                            </span>
                            <span class="topbar-username"><?= htmlspecialchars($currentFullName) ?></span>
                            <svg class="dropdown-arrow-icon" viewBox="0 0 24 24" width="14" height="14" fill="none"
                                stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        <div class="user-dropdown-menu" id="userDropdownMenu">
                            <div class="user-dropdown-header">
                                <div class="dropdown-fullname"><?= htmlspecialchars($currentFullName) ?></div>
                                <div class="dropdown-email"><?= htmlspecialchars($currentEmail) ?></div>
                                <span class="dropdown-role-badge"><?= htmlspecialchars($currentRole) ?></span>
                            </div>
                            <div class="user-dropdown-divider"></div>
                            <a href="profile.php" class="user-dropdown-item">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path
                                        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                                </svg>
                                إعدادات الحساب وكلمة المرور
                            </a>
                            <a href="two_factor.php" class="user-dropdown-item">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                                المصادقة الثنائية (TOTP 2FA)
                            </a>
                            <a href="help.php" class="user-dropdown-item">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-2.9 2-2.9 4" />
                                    <path d="M12 17h.01" />
                                </svg>
                                مركز المساعدة
                            </a>
                            <a href="whats_new.php" class="user-dropdown-item">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
                                    <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
                                </svg>
                                آخر التحديثات
                            </a>
                            <button type="button" class="user-dropdown-item user-dropdown-theme-toggle"
                                id="adminThemeToggle" onclick="toggleAdminTheme(event)">
                                <svg id="adminThemeIcon" viewBox="0 0 24 24" width="16" height="16" fill="none"
                                    stroke="currentColor" stroke-width="2">
                                    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8Z" />
                                </svg>
                                <span id="adminThemeLabel">الوضع الليلي</span>
                                <span class="theme-toggle-track"><span class="theme-toggle-thumb"></span></span>
                            </button>
                            <div class="user-dropdown-divider"></div>
                            <a href="../logout.php" class="user-dropdown-item logout-item">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                                </svg>
                                تسجيل الخروج
                            </a>
                        </div>
                    </div>
                </div>
            </header>

            <script>
                function toggleAdminNotifications(event) {
                    event.stopPropagation();
                    const menu = document.getElementById('adminNotificationsMenu');
                    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                }
                document.addEventListener('click', function () {
                    const menu = document.getElementById('adminNotificationsMenu');
                    if (menu) menu.style.display = 'none';
                });

                // تأكيد موحد للإجراءات الحساسة التي لا تملك الصفحة رسالة خاصة لها.
                document.addEventListener('submit', function (event) {
                    const form = event.target;
                    if (!(form instanceof HTMLFormElement) || form.dataset.confirmed === '1' || form.hasAttribute('onsubmit')) {
                        return;
                    }
                    const action = form.querySelector('input[name="action"]')?.value || form.querySelector('button[name="action"]')?.value || '';
                    const messages = {
                        create: 'هل تريد بالتأكيد إضافة هذا العنصر؟',
                        add_file: 'هل تريد بالتأكيد إضافة هذا الملف؟',
                        add_course: 'هل تريد بالتأكيد إضافة هذه المادة؟',
                        edit: 'هل تريد بالتأكيد حفظ تعديلات هذا العنصر؟',
                        save_question: 'هل تريد بالتأكيد حفظ السؤال؟',
                        save_part: 'هل تريد بالتأكيد حفظ الاختبار؟',
                        save_subject: 'هل تريد بالتأكيد حفظ المادة؟',
                        delete: 'هل أنت متأكد من حذف هذا العنصر نهائياً؟ لا يمكن التراجع عن العملية.',
                        delete_question: 'هل أنت متأكد من حذف هذا السؤال نهائياً؟',
                        delete_part: 'هل أنت متأكد من حذف هذا الاختبار وأسئلته؟',
                        delete_subject: 'هل أنت متأكد من حذف هذه المادة واختباراتها؟',
                        revoke_system_account: 'هل تريد بالتأكيد إيقاف وصول هذا الحساب؟',
                        toggle_active: 'هل تريد بالتأكيد تغيير حالة هذا الحساب؟',
                        complete: 'هل تريد تأكيد إنجاز هذه المهمة؟',
                        release: 'هل تريد إعادة المهمة إلى بنك المهام المتاحة؟'
                    };
                    if (messages[action] && !window.confirm(messages[action])) {
                        event.preventDefault();
                        return;
                    }
                    form.dataset.confirmed = '1';
                }, true);
            </script>

            <main class="admin-content">
                <?php if ($isReadOnlyHeaderUser): ?>
                    <div class="read-only-banner" role="status">
                        <strong>وضع الاطلاع فقط</strong>
                        <span>تم تقييد هذا الحساب للرؤية والاطلاع فقط. لا يمكنك الإضافة أو التعديل أو الحذف.</span>
                    </div>
                <?php endif; ?>
                <?php if (!$isPageAllowed): ?>
                    <div class="panel-box" style="text-align:center; padding:60px 20px;">
                        <div
                            style="width:72px; height:72px; background:#fee2e2; color:#ef4444; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
                            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor"
                                stroke-width="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                        </div>
                        <h2
                            style="font-family:'Cairo',sans-serif; color:#0f172a; font-size:22px; font-weight:800; margin-bottom:8px;">
                            تم تقييد الوصول إلى هذا القسم</h2>
                        <p style="color:#64748b; font-size:14px; max-width:480px; margin:0 auto 20px; line-height:1.6;">
                            حسابك لا يملك الصلاحية المطلوبة للوصول إلى قسم
                            (<strong><?= htmlspecialchars($page_title) ?></strong>). يمكنك طلب الوصول من مدير النظام لتفعيل
                            القسم أو الإجراء المناسب.
                        </p>
                        <?php
                        // توجيهه لأول صفحة مصرح له بها
                        $firstAllowed = !empty($allowedMenu) ? reset($allowedMenu)['file'] : 'profile.php';
                        ?>
                        <a href="<?= htmlspecialchars($firstAllowed) ?>" class="btn btn-primary"
                            style="display:inline-flex; align-items:center; gap:6px;">
                            العودة إلى الصفحة المصرح بها
                        </a>
                    </div>
                </main>
            </div>
        </div>
    </body>

    </html>
    <?php exit; ?>
<?php endif; ?>