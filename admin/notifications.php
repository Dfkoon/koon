<?php
/**
 * admin/notifications.php - الإشعارات الواردة من الموقع
 */
$page_key = 'notifications';
$page_title = 'الإشعارات';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../sync_official_live.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();
$flash = null;
$currentUserStmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1');
$currentUserStmt->execute([(int) ($_SESSION['user_id'] ?? 0)]);
$currentUser = $currentUserStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$isAdminUser = in_array($currentUser['role'] ?? '', ['admin', 'super_admin'], true)
    || (int) ($currentUser['id'] ?? 0) === 1
    || strtoupper((string) ($currentUser['username'] ?? '')) === 'HUSSIEN';
$normalizePortalUsername = static function ($value): string {
    $value = trim((string) $value);
    $value = preg_replace('/\s+/', '', $value);
    return strtolower($value);
};

$firestoreVolunteers = liveSyncCollection('volunteers');
$firestoreVolunteers = array_values(array_filter($firestoreVolunteers, static fn($volunteer) => !empty($volunteer['username']) && ($volunteer['active'] ?? true) !== false));
$firestoreByUsername = [];
foreach ($firestoreVolunteers as $volunteer) {
    $normalized = $normalizePortalUsername($volunteer['username'] ?? '');
    if ($normalized === '') {
        continue;
    }
    $firestoreByUsername[$normalized] = $volunteer;
}
$coordinatorRows = $db->query('SELECT c.id, c.name, c.is_active, u.username FROM coordinators c LEFT JOIN users u ON u.id = c.user_id WHERE c.is_active = 1 ORDER BY c.name')->fetchAll(PDO::FETCH_ASSOC);
$volunteers = [];
foreach ($coordinatorRows as $coordinator) {
    $username = trim((string) ($coordinator['username'] ?? ''));
    $normalizedUsername = $normalizePortalUsername($username);
    $portalAvailable = $normalizedUsername !== '' && isset($firestoreByUsername[$normalizedUsername]);

    $volunteers[] = array_merge(
        $coordinator,
        $portalAvailable ? $firestoreByUsername[$normalizedUsername] : [],
        ['portal_available' => $portalAvailable, 'username' => $username]
    );
}
foreach ($firestoreVolunteers as $volunteer) {
    $username = trim((string) $volunteer['username']);
    if ($username === '') {
        continue;
    }

    $alreadyListed = false;
    foreach ($volunteers as $listed) {
        if (($listed['username'] ?? '') === $username) {
            $alreadyListed = true;
            break;
        }
    }

    if (!$alreadyListed) {
        $volunteers[] = array_merge($volunteer, ['portal_available' => true, 'username' => $username]);
    }
}
usort($volunteers, static fn($a, $b) => strcasecmp((string) ($a['nameAr'] ?? $a['name'] ?? $a['username'] ?? ''), (string) ($b['nameAr'] ?? $b['name'] ?? $b['username'] ?? '')));

if ($isAdminUser && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'send_coordinator_notification') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'message' => 'تعذر تنفيذ الطلب الأمني.'];
    } else {
        $targetUsername = trim($_POST['target_username'] ?? '');
        $target = null;
        foreach ($volunteers as $volunteer) {
            if (($volunteer['portal_available'] ?? false) && (string) $volunteer['username'] === $targetUsername) {
                $target = $volunteer;
                break;
            }
        }
        $title = trim($_POST['notification_title'] ?? '');
        $message = trim($_POST['notification_message'] ?? '');
        if (!$target || $title === '' || $message === '') {
            $flash = ['type' => 'error', 'message' => 'اختر منسقًا واكتب عنوان الرسالة ومحتواها.'];
        } elseif (
            !liveFirestoreCreate('coordinatorNotifications', [
                'recipientUsername' => $targetUsername,
                'title' => $title,
                'message' => $message,
                'createdAt' => date('c'),
                'isRead' => false,
                'senderName' => $_SESSION['username'] ?? 'مدير النظام',
            ])
        ) {
            $flash = ['type' => 'error', 'message' => 'تعذر إرسال الرسالة إلى بوابة المنسق.'];
        } else {
            create_admin_notification('coordinator_message', 'رسالة إلى منسق', 'تم إرسال رسالة إلى ' . ($target['nameAr'] ?? $targetUsername), 'notifications.php', null);
            log_activity('إرسال رسالة موجهة إلى المنسق ' . $targetUsername, 'notifications');
            $flash = ['type' => 'success', 'message' => 'تم إرسال الرسالة إلى بوابة المنسق بنجاح.'];
        }
    }
}

if ($isAdminUser && $_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'mark_all_read') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'message' => 'تعذر تنفيذ الطلب الأمني.'];
    } else {
        $db->exec('UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0');
        $flash = ['type' => 'success', 'message' => 'تم تعليم جميع الإشعارات كمقروءة.'];
    }
}

if ($isAdminUser) {
    $notifications = $db->query('SELECT * FROM admin_notifications ORDER BY created_at DESC, id DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);
    $unreadCount = (int) $db->query('SELECT COUNT(*) FROM admin_notifications WHERE is_read = 0')->fetchColumn();
} else {
    $targetUsername = (string) ($currentUser['username'] ?? '');
    $notifications = [];
    foreach (liveSyncCollection('coordinatorNotifications') as $notification) {
        if ((string) ($notification['recipientUsername'] ?? '') !== $targetUsername)
            continue;
        $notifications[] = [
            'title' => $notification['title'] ?? 'إشعار من الإدارة',
            'message' => $notification['message'] ?? '',
            'target_url' => '#',
            'is_read' => !empty($notification['isRead']) ? 1 : 0,
            'created_at' => $notification['createdAt'] ?? '',
        ];
    }
    usort($notifications, static fn($a, $b) => strcmp((string) $b['created_at'], (string) $a['created_at']));
    $unreadCount = count(array_filter($notifications, static fn($notification) => !$notification['is_read']));
}

require __DIR__ . '/_header.php';
?>

<style>
    .notifications-page {
        --notif-page-bg: #f3f6fb;
        --notif-hero-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(247, 240, 229, 0.96));
        --notif-hero-text: #0f172a;
        --notif-hero-muted: #475569;
        --notif-surface: rgba(255, 255, 255, 0.8);
        --notif-surface-strong: rgba(255, 255, 255, 0.96);
        --notif-border: rgba(148, 163, 184, 0.2);
        --notif-input-bg: rgba(255, 255, 255, 0.9);
        --notif-input-text: #0f172a;
        --notif-label: #334155;
        --notif-menu-bg: rgba(255, 255, 255, 0.98);
        --notif-menu-text: #1f2937;
        --notif-primary: #2563eb;
        max-width: 1220px;
        margin: 0 auto;
        padding-bottom: 20px;
    }

    body.admin-dark-mode .notifications-page {
        --notif-page-bg: #0f172a;
        --notif-hero-bg: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(27, 48, 74, 0.94));
        --notif-hero-text: #f8fafc;
        --notif-hero-muted: rgba(226, 232, 240, 0.82);
        --notif-surface: rgba(255, 255, 255, 0.06);
        --notif-surface-strong: rgba(30, 41, 59, 0.9);
        --notif-border: rgba(148, 163, 184, 0.22);
        --notif-input-bg: rgba(15, 23, 42, 0.6);
        --notif-input-text: #f8fafc;
        --notif-label: #cbd5e1;
        --notif-menu-bg: rgba(15, 23, 42, 0.96);
        --notif-menu-text: #e2e8f0;
        --notif-primary: #7dd3fc;
    }

    .notifications-shell {
        display: grid;
        gap: 18px;
    }

    .notifications-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.8fr);
        gap: 20px;
        align-items: center;
        padding: 22px 24px;
        background: var(--notif-hero-bg);
        border: 1px solid var(--notif-border);
        border-radius: 22px;
        box-shadow: 0 18px 30px rgba(15, 23, 42, 0.08);
        color: var(--notif-hero-text);
    }

    .notifications-kicker {
        color: var(--notif-primary);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .12em;
        text-transform: uppercase;
    }

    .notifications-hero h2 {
        margin: 8px 0 8px;
        color: var(--notif-hero-text);
        font-size: clamp(22px, 2.3vw, 32px);
        line-height: 1.2;
    }

    .notifications-hero p {
        margin: 0;
        color: var(--notif-hero-muted);
        font-size: 13px;
        line-height: 1.7;
    }

    .notifications-hero-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
    }

    .notify-stat {
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 96px;
        padding: 14px 16px;
        border-radius: 16px;
        background: var(--notif-surface);
        border: 1px solid var(--notif-border);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
    }

    .notify-stat .value {
        font-size: clamp(24px, 2vw, 34px);
        font-weight: 800;
        color: var(--notif-hero-text);
        letter-spacing: -0.04em;
    }

    .notify-stat .label {
        margin-top: 4px;
        color: var(--notif-hero-muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
    }

    .notifications-toolbar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 2px;
    }

    .notification-composer {
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid var(--notif-border);
        background: linear-gradient(180deg, var(--notif-surface-strong), rgba(250, 248, 245, 0.96));
        box-shadow: 0 18px 30px rgba(15, 23, 42, 0.06);
    }

    body.admin-dark-mode .notification-composer {
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(17, 24, 39, 0.96));
    }

    .notification-composer .panel-box-header {
        background: rgba(241, 245, 249, 0.9);
        border-bottom: 1px solid var(--notif-border);
    }

    body.admin-dark-mode .notification-composer .panel-box-header {
        background: rgba(148, 163, 184, 0.06);
    }

    .notification-composer .panel-box-header .panel-box-title {
        color: var(--notif-hero-text);
    }

    .notification-form {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        padding: 20px;
    }

    .notification-form .full-width {
        grid-column: 1/-1;
    }

    .notification-form label {
        display: block;
        margin-bottom: 8px;
        color: var(--notif-label);
        font-size: 12px;
        font-weight: 700;
    }

    .notification-form input,
    .notification-form textarea {
        width: 100%;
        border: 1px solid var(--notif-border);
        border-radius: 12px;
        background: var(--notif-input-bg);
        color: var(--notif-input-text);
        padding: 12px 14px;
        font-size: 13px;
        transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
    }

    .notification-form input:focus,
    .notification-form textarea:focus {
        border-color: rgba(59, 130, 246, 0.9);
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
        outline: none;
    }

    .notification-target-select-wrap {
        position: relative;
    }

    .notification-target-select {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        min-height: 48px;
        padding: 12px 46px 12px 14px;
        border: 1px solid var(--notif-border);
        border-radius: 12px;
        background: var(--notif-input-bg);
        color: var(--notif-input-text);
        font-size: 13px;
        text-align: right;
        cursor: pointer;
        transition: border-color .15s ease, box-shadow .15s ease;
    }

    .notification-target-select:focus,
    .notification-target-select.open {
        border-color: rgba(59, 130, 246, 0.9);
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
        outline: none;
    }

    .notification-target-select__label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--notif-input-text);
    }

    .notification-target-select__icon {
        position: absolute;
        left: 14px;
        top: 50%;
        width: 18px;
        height: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--notif-hero-muted);
        transform: translateY(-50%);
        pointer-events: none;
    }

    .notification-target-menu {
        position: absolute;
        right: 0;
        left: 0;
        top: calc(100% + 8px);
        z-index: 15;
        display: none;
        max-height: 260px;
        overflow-y: auto;
        padding: 8px;
        border: 1px solid var(--notif-border);
        border-radius: 14px;
        background: var(--notif-menu-bg);
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.12);
    }

    .notification-target-menu.open {
        display: block;
    }

    .notification-target-option {
        display: block;
        width: 100%;
        padding: 12px 14px;
        margin: 0;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--notif-menu-text);
        text-align: right;
        font-size: 13px;
        cursor: pointer;
        transition: background .15s ease, color .15s ease;
    }

    .notification-target-option:hover:not(:disabled),
    .notification-target-option.selected {
        background: rgba(59, 130, 246, 0.08);
        color: var(--notif-input-text);
    }

    .notification-target-option:disabled {
        color: rgba(100, 116, 139, 0.75);
        cursor: not-allowed;
        opacity: 0.7;
        background: transparent;
    }

    .notification-form textarea {
        min-height: 110px;
        resize: vertical;
    }

    .notification-form-actions {
        grid-column: 1/-1;
        display: flex;
        justify-content: flex-start;
    }

    .btn-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 18px;
        border: 0;
        border-radius: 12px;
        background: linear-gradient(135deg, #38bdf8, #2563eb);
        color: #fff;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 10px 18px rgba(37, 99, 235, 0.28);
        transition: transform .15s ease, box-shadow .15s ease;
    }

    .btn-primary:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 22px rgba(37, 99, 235, 0.32);
    }

    .notification-list {
        display: grid;
        gap: 12px;
        margin-top: 4px;
    }

    .notification-card {
        display: block;
        position: relative;
        padding: 18px 18px 16px;
        border-radius: 16px;
        border: 1px solid rgba(148, 163, 184, 0.2);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.96));
        text-decoration: none;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;
    }

    .notification-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 16px 28px rgba(15, 23, 42, 0.07);
        border-color: rgba(37, 99, 235, 0.32);
    }

    .notification-card.unread {
        background: linear-gradient(180deg, rgba(239, 246, 255, 0.98), rgba(255, 255, 255, 0.98));
        border-color: rgba(96, 165, 250, 0.42);
    }

    .notification-card.unread::before {
        content: "";
        position: absolute;
        right: 0;
        top: 14px;
        bottom: 14px;
        width: 4px;
        border-radius: 999px;
        background: linear-gradient(180deg, #60a5fa, #2563eb);
    }

    .notification-card-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: #0f172a;
        font-size: 15px;
        font-weight: 800;
    }

    .notification-card-title strong {
        color: #0f172a;
    }

    .notification-card-message {
        margin-top: 9px;
        color: #475569;
        font-size: 13px;
        line-height: 1.8;
    }

    .notification-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 12px;
    }

    .notification-card-time {
        display: inline-block;
        color: #64748b;
        font-size: 11px;
        direction: ltr;
        text-align: right;
    }

    .notification-new-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: linear-gradient(135deg, #60a5fa, #2563eb);
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 180px;
        padding: 28px 20px;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(241, 245, 249, 0.96));
        border: 1px dashed rgba(148, 163, 184, 0.5);
        color: #64748b;
        text-align: center;
        font-weight: 700;
    }

    @media (max-width: 900px) {
        .notifications-hero {
            grid-template-columns: 1fr;
        }
    }

    @media (max-width: 700px) {
        .notifications-page {
            padding: 0 6px 12px;
        }

        .notifications-toolbar {
            justify-content: flex-start;
        }

        .notification-form {
            grid-template-columns: 1fr;
        }

        .notification-form .full-width,
        .notification-form-actions {
            grid-column: auto;
        }

        .notification-card {
            padding: 16px 16px 14px;
        }
    }
</style>

<div class="notifications-page">
    <div class="notifications-shell">
        <div class="notifications-hero">
            <div>
                <div class="notifications-kicker">Admin Notifications</div>
                <h2><?= $isAdminUser ? 'إشعارات الموقع' : 'إشعاراتي الخاصة' ?></h2>
                <p><?= $isAdminUser ? 'تابع الطلبات الواردة، وأرسل رسائل مباشرة للمنسقين بطريقة منظمة وسريعة.' : 'رسائل الإدارة الموجهة إلى حسابك فقط، مع متابعة فورية لأحدث الإشعارات.' ?>
                </p>
            </div>
            <div class="notifications-hero-stats">
                <div class="notify-stat">
                    <div class="value"><?= number_format($unreadCount) ?></div>
                    <div class="label">غير مقروء</div>
                </div>
                <div class="notify-stat">
                    <div class="value"><?= number_format(count($notifications)) ?></div>
                    <div class="label">الإجمالي</div>
                </div>
            </div>
        </div>

        <div class="notifications-toolbar">
            <?php if ($isAdminUser && $unreadCount > 0): ?>
                <form method="post">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="mark_all_read">
                    <button type="submit" class="btn btn-primary">تعليم الكل كمقروء</button>
                </form>
            <?php endif; ?>
        </div>

        <?php if ($isAdminUser): ?>
            <div class="panel-box notification-composer">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">إرسال إشعار إلى منسق محدد</h3>
                </div>
                <div class="panel-box-body">
                    <form method="post" class="notification-form">
                        <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                        <input type="hidden" name="action" value="send_coordinator_notification">
                        <div class="full-width">
                            <label>المنسق المستهدف</label>
                            <div class="notification-target-select-wrap">
                                <input type="hidden" name="target_username" id="notificationTargetUsername" required>
                                <button type="button" class="notification-target-select" id="notificationTargetSelectBtn"
                                    aria-expanded="false">
                                    <span class="notification-target-select__icon" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                                            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                        </svg>
                                    </span>
                                    <span class="notification-target-select__label">اختر المنسق</span>
                                </button>
                                <div class="notification-target-menu" id="notificationTargetMenu" role="listbox"
                                    aria-label="قائمة المنسقين">
                                    <?php foreach ($volunteers as $volunteer): ?>
                                        <?php
                                        $displayName = htmlspecialchars($volunteer['nameAr'] ?? $volunteer['name'] ?? $volunteer['username'] ?? 'منسق');
                                        $username = htmlspecialchars((string) ($volunteer['username'] ?? 'غير مربوط'));
                                        $suffix = empty($volunteer['portal_available']) ? ' — غير مربوط بالبوابة' : '';
                                        ?>
                                        <button type="button" class="notification-target-option"
                                            data-value="<?= htmlspecialchars((string) ($volunteer['username'] ?? '')) ?>"
                                            data-label="<?= $displayName ?> (@<?= $username ?><?= empty($volunteer['portal_available']) ? ' — غير مربوط بالبوابة' : '' ?>)"
                                            <?= empty($volunteer['portal_available']) ? 'disabled' : '' ?>
                                            aria-disabled="<?= empty($volunteer['portal_available']) ? 'true' : 'false' ?>">
                                            <?= $displayName ?> (@<?= $username ?><?= $suffix ?>)
                                        </button>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label>عنوان الإشعار</label>
                            <input type="text" name="notification_title" maxlength="120" required
                                placeholder="مثال: يرجى متابعة طلب جديد">
                        </div>
                        <div>
                            <label>نوع الرسالة</label>
                            <input type="text" value="إشعار إداري" readonly style="cursor:default; opacity:0.9;">
                        </div>
                        <div class="full-width">
                            <label>نص الإشعار</label>
                            <textarea name="notification_message" rows="3" maxlength="1000" required
                                placeholder="اكتب الرسالة التي ستظهر داخل بوابة المنسق..."></textarea>
                        </div>
                        <div class="notification-form-actions">
                            <button type="submit" class="btn btn-primary">إرسال إلى البوابة</button>
                        </div>
                    </form>
                </div>
            </div>
        <?php endif; ?>

        <?php if ($flash): ?>
            <div
                style="margin-bottom:4px;padding:12px 16px;border-radius:12px;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;font-weight:800;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
                <?= htmlspecialchars($flash['message']) ?>
            </div>
        <?php endif; ?>

        <div class="notification-list">
            <?php if (!$notifications): ?>
                <div class="empty-state">لا توجد إشعارات حتى الآن.</div>
            <?php else:
                foreach ($notifications as $notification): ?>
                    <a href="<?= htmlspecialchars($notification['target_url']) ?>"
                        class="notification-card <?= $notification['is_read'] ? '' : 'unread' ?>">
                        <div class="notification-card-title">
                            <strong><?= htmlspecialchars($notification['title']) ?></strong>
                            <?php if (!$notification['is_read']): ?><span class="notification-new-dot"
                                    title="غير مقروء"></span><?php endif; ?>
                        </div>
                        <div class="notification-card-message"><?= htmlspecialchars($notification['message']) ?></div>
                        <div class="notification-meta">
                            <span class="notification-card-time"
                                datetime="<?= htmlspecialchars($notification['created_at']) ?>"><?= htmlspecialchars($notification['created_at']) ?></span>
                            <?php if (!$notification['is_read']): ?><span
                                    style="color:#2563eb;font-size:11px;font-weight:800;">جديد</span><?php endif; ?>
                        </div>
                    </a>
                <?php endforeach; endif; ?>
        </div>
    </div>
</div>

<script>
    (function () {
        const trigger = document.getElementById('notificationTargetSelectBtn');
        const hiddenInput = document.getElementById('notificationTargetUsername');
        const menu = document.getElementById('notificationTargetMenu');
        const label = trigger ? trigger.querySelector('.notification-target-select__label') : null;

        if (!trigger || !hiddenInput || !menu || !label) {
            return;
        }

        const setSelected = function (button) {
            if (!button) {
                hiddenInput.value = '';
                label.textContent = 'اختر المنسق';
                trigger.setAttribute('aria-expanded', 'false');
                trigger.classList.remove('open');
                menu.classList.remove('open');
                return;
            }

            const value = button.dataset.value || '';
            const text = button.dataset.label || button.textContent.trim();
            hiddenInput.value = value;
            label.textContent = text;
            trigger.setAttribute('aria-expanded', 'false');
            trigger.classList.remove('open');
            menu.classList.remove('open');

            document.querySelectorAll('.notification-target-option').forEach((item) => {
                item.classList.toggle('selected', item === button);
            });
        };

        trigger.addEventListener('click', function (event) {
            event.stopPropagation();
            const isOpen = menu.classList.contains('open');
            menu.classList.toggle('open', !isOpen);
            trigger.classList.toggle('open', !isOpen);
            trigger.setAttribute('aria-expanded', String(!isOpen));
        });

        document.querySelectorAll('.notification-target-option').forEach((button) => {
            button.addEventListener('click', function () {
                if (button.disabled) {
                    return;
                }
                setSelected(button);
            });
        });

        document.addEventListener('click', function (event) {
            if (!trigger.contains(event.target) && !menu.contains(event.target)) {
                trigger.classList.remove('open');
                menu.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
            }
        });

        hiddenInput.value = '';
        label.textContent = 'اختر المنسق';
        trigger.classList.remove('open');
        menu.classList.remove('open');
    })();
</script>

<?php require __DIR__ . '/_footer.php'; ?>