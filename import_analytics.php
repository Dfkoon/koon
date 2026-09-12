<?php
declare(strict_types=1);

if (php_sapi_name() !== 'cli') {
    require_once __DIR__ . '/config.php';
    if (empty($_SESSION['authenticated'])) {
        http_response_code(403);
        die('Access denied.');
    }
}

const FIRESTORE_ANALYTICS_URL = 'https://firestore.googleapis.com/v1/projects/koon-609da/databases/(default)/documents/page_views?pageSize=1000';
const FIREBASE_API_KEY = 'AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';
const ANALYTICS_DB = __DIR__ . '/database.sqlite';
if (!defined('SITE_WEB_APP_URL')) {
    define('SITE_WEB_APP_URL', 'https://koon-609da.web.app/');
}

if (!function_exists('normalize_page_analytics')) {
    function normalize_page_analytics(string $path): array
    {
        $path = trim($path);
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
        if (str_starts_with($route, '/quiz/'))
            $name = 'الاختبارات';
        if (str_starts_with($route, '/materials/'))
            $name = 'المواد الدراسية';
        if (str_starts_with($route, '/exchange/'))
            $name = 'تبادل المواد';

        return ['page_name' => $name, 'slug' => rtrim(SITE_WEB_APP_URL, '/') . '/#' . $route];
    }
}

function decodeFirestoreValue(array $value): mixed
{
    if (isset($value['stringValue']))
        return $value['stringValue'];
    if (isset($value['integerValue']))
        return (int) $value['integerValue'];
    if (isset($value['timestampValue']))
        return $value['timestampValue'];
    if (isset($value['arrayValue']))
        return array_map('decodeFirestoreValue', $value['arrayValue']['values'] ?? []);
    if (isset($value['mapValue'])) {
        $result = [];
        foreach ($value['mapValue']['fields'] ?? [] as $key => $item)
            $result[$key] = decodeFirestoreValue($item);
        return $result;
    }
    return null;
}

$payload = json_decode(file_get_contents(FIRESTORE_ANALYTICS_URL . '&key=' . urlencode(FIREBASE_API_KEY)), true, 512, JSON_THROW_ON_ERROR);
$db = new PDO('sqlite:' . ANALYTICS_DB);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$db->exec('CREATE TABLE IF NOT EXISTS analytics_events (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT UNIQUE NOT NULL, path TEXT NOT NULL, event_type TEXT NOT NULL DEFAULT "visit", visitor_key TEXT, user_agent TEXT, occurred_at TEXT NOT NULL)');
$db->beginTransaction();
$db->exec('DELETE FROM analytics_events');
$db->exec('DELETE FROM page_views');
$events = [];
$pages = [];

foreach ($payload['documents'] ?? [] as $document) {
    $fields = [];
    foreach ($document['fields'] ?? [] as $key => $value)
        $fields[$key] = decodeFirestoreValue($value);
    $sourceId = basename($document['name']);
    $path = (string) ($fields['path'] ?? '/');
    $visitor = trim((string) ($fields['studentPhone'] ?? ''));
    if ($visitor === '')
        $visitor = trim((string) ($fields['studentName'] ?? ''));
    $occurredAt = date('Y-m-d H:i:s');
    try {
        $occurredAt = (new DateTimeImmutable((string) ($fields['timestamp'] ?? '')))->format('Y-m-d H:i:s');
    } catch (Throwable) {
    }
    $events[] = [$sourceId, $path, (string) ($fields['type'] ?? 'visit'), $visitor, (string) ($fields['userAgent'] ?? ''), $occurredAt];
    $pages[$path] ??= ['views' => 0, 'visitors' => []];
    $pages[$path]['views']++;
    $pages[$path]['visitors'][$visitor !== '' ? $visitor : $sourceId] = true;
}

$eventInsert = $db->prepare('INSERT INTO analytics_events (source_id, path, event_type, visitor_key, user_agent, occurred_at) VALUES (?, ?, ?, ?, ?, ?)');
foreach ($events as $event)
    $eventInsert->execute($event);
$pageInsert = $db->prepare('INSERT INTO page_views (page_name, slug, views_count, unique_visitors, category) VALUES (?, ?, ?, ?, ?)');
foreach ($pages as $path => $page) {
    $meta = normalize_page_analytics((string) $path);
    $pageInsert->execute([$meta['page_name'], $meta['slug'], $page['views'], count($page['visitors']), str_starts_with((string) $path, '/admin') ? 'لوحة التحكم' : 'الموقع الرسمي']);
}
$db->commit();
echo 'events=' . count($events) . ' pages=' . count($pages) . PHP_EOL;