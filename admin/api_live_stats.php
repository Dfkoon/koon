<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/sync_frontend_live.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'غير مصرح'], JSON_UNESCAPED_UNICODE);
    exit;
}

$db = get_db();

// Throttle live Firestore pull to max once every 12 seconds per session unless explicitly forced
$forceSync = !empty($_GET['force']);
$lastSync = $_SESSION['last_stats_fs_sync'] ?? 0;
$syncResult = null;

if ($forceSync || (time() - $lastSync) >= 12) {
    try {
        $syncResult = pull_live_analytics_from_firestore($db, 250);
        pull_question_reports_from_firestore($db);
        $_SESSION['last_stats_fs_sync'] = time();
    } catch (Throwable $e) {
        // Fall back to local SQLite smoothly
    }
}

// 1. Calculate Active Users Now (last 15 minutes)
$activeWindow = date('Y-m-d H:i:s', time() - 900);
$activeStmt = $db->prepare("SELECT COUNT(DISTINCT visitor_key) FROM analytics_events WHERE occurred_at >= ?");
$activeStmt->execute([$activeWindow]);
$activeUsersNow = (int) $activeStmt->fetchColumn();
if ($activeUsersNow === 0) {
    $activeCoord = (int) $db->query("SELECT COUNT(*) FROM users WHERE last_active_at >= datetime('now', '-15 minutes')")->fetchColumn();
    $activeUsersNow = max(1, $activeCoord);
}

// 2. Metrics
$metricRows = $db->query('SELECT metric_key, metric_value FROM dashboard_metrics')->fetchAll(PDO::FETCH_KEY_PAIR);
$totalVisitsLocal = (int) $db->query("SELECT COALESCE(SUM(views_count), 0) FROM page_views")->fetchColumn();
$materialOpensLocal = (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'material_view'")->fetchColumn();
$quizCompsLocal = (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'quiz_completed'")->fetchColumn();
$suggestionsLocal = (int) $db->query("SELECT COUNT(*) FROM feedback_reviews WHERE feedback_type IN ('suggestion', 'collaboration')")->fetchColumn();
$pendingReportsLocal = (int) $db->query("SELECT COUNT(*) FROM question_reports WHERE status IN ('pending', 'new', '') OR status IS NULL")->fetchColumn();
$serviceRequestsLocal = (int) $db->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('new', 'in_progress', 'pending')")->fetchColumn();

$metrics = [
    'total_visits' => max((int) ($metricRows['total_visits'] ?? 0), $totalVisitsLocal),
    'material_opens' => max((int) ($metricRows['material_opens'] ?? 0), $materialOpensLocal),
    'quiz_completions' => max((int) ($metricRows['quiz_completions'] ?? 0), $quizCompsLocal),
    'suggestions' => max((int) ($metricRows['suggestions'] ?? 0), $suggestionsLocal),
    'pending_reports' => max((int) ($metricRows['pending_reports'] ?? 0), $pendingReportsLocal),
    'service_requests' => max((int) ($metricRows['service_requests'] ?? 0), $serviceRequestsLocal),
];

// 3. Section Traffic
$sectionTraffic = [
    'exchange' => ['title' => 'تبادل المواد والكتب', 'views' => 0, 'uniques' => 0, 'color' => '#16a34a'],
    'quiz' => ['title' => 'بنك الاختبارات والكويزات', 'views' => 0, 'uniques' => 0, 'color' => '#2563eb'],
    'materials' => ['title' => 'المواد الدراسية والمكتبة', 'views' => 0, 'uniques' => 0, 'color' => '#7c3aed'],
    'plans' => ['title' => 'الخطط الأكاديمية والشجرية', 'views' => 0, 'uniques' => 0, 'color' => '#0891b2'],
    'calendar' => ['title' => 'التقويم الدراسي والمواعيد', 'views' => 0, 'uniques' => 0, 'color' => '#ea580c'],
    'other' => ['title' => 'الرئيسية والصفحات العامة', 'views' => 0, 'uniques' => 0, 'color' => '#64748b'],
];

$allPageViews = $db->query('SELECT slug, views_count, unique_visitors FROM page_views')->fetchAll(PDO::FETCH_ASSOC);
$totalTrafficViews = 0;
foreach ($allPageViews as $pv) {
    $slug = (string) ($pv['slug'] ?? '');
    $vc = (int) ($pv['views_count'] ?? 0);
    $uv = (int) ($pv['unique_visitors'] ?? 0);
    $totalTrafficViews += $vc;
    if (str_contains($slug, '/exchange')) {
        $sectionTraffic['exchange']['views'] += $vc;
        $sectionTraffic['exchange']['uniques'] += $uv;
    } elseif (str_contains($slug, '/quiz')) {
        $sectionTraffic['quiz']['views'] += $vc;
        $sectionTraffic['quiz']['uniques'] += $uv;
    } elseif (str_contains($slug, '/materials')) {
        $sectionTraffic['materials']['views'] += $vc;
        $sectionTraffic['materials']['uniques'] += $uv;
    } elseif (str_contains($slug, '/plans')) {
        $sectionTraffic['plans']['views'] += $vc;
        $sectionTraffic['plans']['uniques'] += $uv;
    } elseif (str_contains($slug, '/calendar')) {
        $sectionTraffic['calendar']['views'] += $vc;
        $sectionTraffic['calendar']['uniques'] += $uv;
    } else {
        $sectionTraffic['other']['views'] += $vc;
        $sectionTraffic['other']['uniques'] += $uv;
    }
}
$totalTrafficViews = max($totalTrafficViews, 1);
foreach ($sectionTraffic as $k => &$st) {
    $st['pct'] = round(($st['views'] / $totalTrafficViews) * 100, 1);
}
unset($st);

// 4. Latest Live Activity Stream (last 10 events)
$latestEventsRaw = $db->query("SELECT source_id, path, event_type, visitor_key, user_agent, occurred_at FROM analytics_events ORDER BY occurred_at DESC, id DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
$latestEvents = [];
foreach ($latestEventsRaw as $ev) {
    $ua = (string) ($ev['user_agent'] ?? '');
    $device = 'كمبيوتر';
    if (preg_match('/tablet|ipad|android(?!.*mobile)/i', $ua)) {
        $device = 'جهاز لوحي';
    } elseif (preg_match('/mobile|iphone|ipod|android/i', $ua)) {
        $device = 'هاتف ذكي';
    }

    $eventLabels = [
        'visit' => 'تصفح صفحة',
        'material_view' => 'فتح ملف دراسي',
        'quiz_completed' => 'إكمال اختبار',
    ];

    $latestEvents[] = [
        'id' => $ev['source_id'],
        'path' => $ev['path'],
        'type' => $ev['event_type'],
        'type_label' => $eventLabels[$ev['event_type']] ?? 'نشاط',
        'visitor' => $ev['visitor_key'] ?: 'طالب',
        'device' => $device,
        'occurred_at' => $ev['occurred_at'],
        'time_human' => date('H:i:s', strtotime($ev['occurred_at'])),
        'date_human' => date('m/d', strtotime($ev['occurred_at'])),
    ];
}

// 5. Pending Question Reports count and recent 3
$recentReports = $db->query("SELECT id, question_title, course_name, reason, created_at, status FROM question_reports WHERE status = 'pending' ORDER BY id DESC LIMIT 3")->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    'success' => true,
    'server_time' => date('Y-m-d H:i:s'),
    'active_users_now' => $activeUsersNow,
    'metrics' => $metrics,
    'total_traffic_views' => $totalTrafficViews,
    'section_traffic' => $sectionTraffic,
    'latest_events' => $latestEvents,
    'recent_pending_reports' => $recentReports,
], JSON_UNESCAPED_UNICODE);
