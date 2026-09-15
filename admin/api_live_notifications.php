<?php
/**
 * api_live_notifications.php
 * نقطة نهاية لجلب الإشعارات الحية وتحديث الجرس في الوقت الفعلي
 */
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    session_write_close();
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$currentUserId = (int) ($_SESSION['user_id'] ?? 0);
session_write_close();

$db = get_db();
$userStmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1');
$userStmt->execute([$currentUserId]);
$apiUser = $userStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$isAdminApiUser = in_array($apiUser['role'] ?? '', ['admin', 'super_admin'], true)
    || (int) ($apiUser['id'] ?? 0) === 1
    || strtoupper((string) ($apiUser['username'] ?? '')) === 'HUSSIEN';

// معالجة قراءة الإشعارات
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        http_response_code(403);
        echo json_encode(['error' => 'CSRF validation failed']);
        exit;
    }
    if (!$isAdminApiUser) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
    $action = $_POST['action'] ?? '';
    if ($action === 'mark_all_read') {
        $db->exec("UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0");
        echo json_encode(['status' => 'success', 'message' => 'تم تحديد كافة الإشعارات كمقروءة']);
        exit;
    } elseif ($action === 'mark_read') {
        $id = (int) ($_POST['id'] ?? 0);
        $stmt = $db->prepare("UPDATE admin_notifications SET is_read = 1 WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode(['status' => 'success']);
        exit;
    }
}

// مزامنة التنبيهات العاجلة من الجداول الحية إلى جدول admin_notifications إذا لم تكن موجودة
try {
    $stmtCheckExists = $db->prepare("SELECT COUNT(*) FROM admin_notifications WHERE source_key = ?");

    // 1. تبرعات كتب جديدة معلقة
    $stmtDon = $db->query("SELECT id, material_name, donor_name, created_at FROM material_exchanges WHERE status = 'pending' AND archive_key IS NULL ORDER BY id DESC LIMIT 5");
    $pendingDonations = $stmtDon->fetchAll(PDO::FETCH_ASSOC);
    foreach ($pendingDonations as $pd) {
        $srcKey = 'exchange_pending_' . (int)$pd['id'];
        $stmtCheckExists->execute([$srcKey]);
        $exists = (int)$stmtCheckExists->fetchColumn();
        if (!$exists) {
            $stmtIns = $db->prepare("INSERT INTO admin_notifications (type, title, message, target_url, source_key, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)");
            $stmtIns->execute([
                'donation',
                'تبرع جديد بكتاب: ' . $pd['material_name'],
                'تبرع الطالب (' . $pd['donor_name'] . ') بكتاب دراسي جديد وبانتظار المراجعة والفرز.',
                'donations.php?tab=pending',
                $srcKey,
                $pd['created_at'] ?: date('Y-m-d H:i:s')
            ]);
        }
    }

    // 2. حجوزات كتب جديدة
    $stmtRes = $db->query("SELECT id, material_name, booker_name, booked_at FROM material_exchanges WHERE status = 'reserved' AND archive_key IS NULL ORDER BY id DESC LIMIT 5");
    $recentReservations = $stmtRes->fetchAll(PDO::FETCH_ASSOC);
    foreach ($recentReservations as $pr) {
        $srcKey = 'exchange_reserved_' . (int)$pr['id'];
        $stmtCheckExists->execute([$srcKey]);
        $exists = (int)$stmtCheckExists->fetchColumn();
        if (!$exists) {
            $stmtIns = $db->prepare("INSERT INTO admin_notifications (type, title, message, target_url, source_key, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)");
            $stmtIns->execute([
                'booking',
                'حجز كتاب: ' . $pr['material_name'],
                'حجز الطالب (' . ($pr['booker_name'] ?: 'مستلم') . ') كتاباً دراسياً ومجدول للتسليم.',
                'donations.php?tab=reserved',
                $srcKey,
                $pr['booked_at'] ?: date('Y-m-d H:i:s')
            ]);
        }
    }

    // 3. بلاغات وشكاوى أسئلة جديدة
    $stmtRep = $db->query("SELECT id, question_title, reporter_name, created_at FROM question_reports WHERE status = 'pending' ORDER BY id DESC LIMIT 5");
    $recentReports = $stmtRep->fetchAll(PDO::FETCH_ASSOC);
    foreach ($recentReports as $rep) {
        $srcKey = 'report_pending_' . (int)$rep['id'];
        $stmtCheckExists->execute([$srcKey]);
        $exists = (int)$stmtCheckExists->fetchColumn();
        if (!$exists) {
            $stmtIns = $db->prepare("INSERT INTO admin_notifications (type, title, message, target_url, source_key, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)");
            $stmtIns->execute([
                'report',
                'بلاغ جديد عن سؤال: ' . mb_substr($rep['question_title'], 0, 30),
                'سجل الطالب (' . ($rep['reporter_name'] ?: 'مجهول') . ') بلاغاً بحاجة لمراجعة في بنك الأسئلة.',
                'reports.php',
                $srcKey,
                $rep['created_at'] ?: date('Y-m-d H:i:s')
            ]);
        }
    }
} catch (Exception $e) {
}

// جلب الإشعارات
$unreadCount = $isAdminApiUser ? (int) $db->query("SELECT COUNT(*) FROM admin_notifications WHERE is_read = 0")->fetchColumn() : 0;
$stmtList = $isAdminApiUser
    ? $db->query("SELECT * FROM admin_notifications ORDER BY id DESC LIMIT 10")
    : $db->query("SELECT id, type, title, message, target_url, is_read, created_at FROM admin_notifications WHERE 1 = 0");
$notifications = $stmtList->fetchAll(PDO::FETCH_ASSOC);

$latestId = !empty($notifications) ? (int) $notifications[0]['id'] : 0;

echo json_encode([
    'status' => 'success',
    'unread_count' => $unreadCount,
    'latest_id' => $latestId,
    'notifications' => $notifications
], JSON_UNESCAPED_UNICODE);
