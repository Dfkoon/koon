<?php
declare(strict_types=1);

const LIVE_SYNC_BASE = 'https://firestore.googleapis.com/v1/projects/koon-609da/databases/(default)/documents/';
const LIVE_SYNC_KEY = 'AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';
const LIVE_SYNC_MAX_SECONDS = 5.0;
const LIVE_SYNC_MAX_PAGES = 4;
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

function liveSyncValue(array $value): mixed
{
    foreach (['stringValue', 'integerValue', 'doubleValue', 'booleanValue', 'timestampValue'] as $type) {
        if (array_key_exists($type, $value))
            return $value[$type];
    }
    if (isset($value['arrayValue']))
        return array_map('liveSyncValue', $value['arrayValue']['values'] ?? []);
    if (isset($value['mapValue'])) {
        $result = [];
        foreach ($value['mapValue']['fields'] ?? [] as $key => $item)
            $result[$key] = liveSyncValue($item);
        return $result;
    }
    return null;
}

function liveSyncHttpGet(string $url, float $timeoutSeconds = 1.5): ?string
{
    $timeoutSeconds = min($timeoutSeconds, 0.7);
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT_MS => 800,
            CURLOPT_TIMEOUT_MS => (int) round($timeoutSeconds * 1000),
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $response = curl_exec($handle);
        return is_string($response) ? $response : null;
    }

    $context = stream_context_create(['http' => ['timeout' => $timeoutSeconds, 'ignore_errors' => true]]);
    $response = @file_get_contents($url, false, $context);
    return $response === false ? null : $response;
}

function liveSyncCollection(string $collection): array
{
    static $deadline = null;
    if ($deadline === null)
        $deadline = microtime(true) + LIVE_SYNC_MAX_SECONDS;

    $documents = [];
    $token = null;
    $page = 0;
    do {
        if (microtime(true) >= $deadline || $page >= LIVE_SYNC_MAX_PAGES)
            break;

        $url = LIVE_SYNC_BASE . rawurlencode($collection) . '?pageSize=250&key=' . urlencode(LIVE_SYNC_KEY);
        if ($token)
            $url .= '&pageToken=' . urlencode($token);
        $response = liveSyncHttpGet($url);
        if ($response === null)
            break;
        $payload = json_decode($response, true);
        if (!is_array($payload))
            break;
        foreach ($payload['documents'] ?? [] as $document) {
            $row = ['_id' => basename($document['name'])];
            foreach ($document['fields'] ?? [] as $key => $value)
                $row[$key] = liveSyncValue($value);
            $documents[] = $row;
        }
        $token = $payload['nextPageToken'] ?? null;
        $page++;
    } while ($token);
    return $documents;
}

function archivedRemoteRecordExists(PDO $db, string $table, string $key, string $created): bool
{
    if ($key === '' || $created === '') {
        return false;
    }
    $stmt = $db->prepare("SELECT 1 FROM deleted_records WHERE source_table = ? AND record_json LIKE ? AND record_json LIKE ? LIMIT 1");
    $stmt->execute([$table, '%' . $key . '%', '%' . $created . '%']);
    return (bool) $stmt->fetchColumn();
}

function liveSyncText(mixed $value, string $fallback = ''): string
{
    return is_scalar($value) ? trim((string) $value) : $fallback;
}

function liveSyncDate(mixed $value): string
{
    try {
        return (new DateTimeImmutable((string) $value))->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return date('Y-m-d H:i:s');
    }
}

function liveFirestoreCreate(string $collection, array $fields): bool
{
    $url = LIVE_SYNC_BASE . rawurlencode($collection) . '?documentId=' . rawurlencode(uniqid('admin_', true)) . '&key=' . urlencode(LIVE_SYNC_KEY);
    $payload = ['fields' => []];
    foreach ($fields as $key => $value) {
        if (is_bool($value))
            $payload['fields'][$key] = ['booleanValue' => $value];
        elseif (is_int($value))
            $payload['fields'][$key] = ['integerValue' => (string) $value];
        else
            $payload['fields'][$key] = ['stringValue' => (string) $value];
    }
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => json_encode($payload, JSON_UNESCAPED_UNICODE),
            'timeout' => 2,
            'ignore_errors' => true,
        ]
    ]);
    $response = @file_get_contents($url, false, $context);
    return $response !== false && isset($http_response_header) && str_contains($http_response_header[0] ?? '', ' 200 ');
}

function liveFirestoreValue(mixed $value): array
{
    if (is_bool($value))
        return ['booleanValue' => $value];
    if (is_int($value))
        return ['integerValue' => (string) $value];
    if (is_float($value))
        return ['doubleValue' => $value];
    if (is_array($value)) {
        if (array_is_list($value)) {
            return ['arrayValue' => ['values' => array_map('liveFirestoreValue', $value)]];
        }
        $fields = [];
        foreach ($value as $key => $item)
            $fields[$key] = liveFirestoreValue($item);
        return ['mapValue' => ['fields' => $fields]];
    }
    return ['stringValue' => (string) $value];
}

function liveFirestoreGet(string $collection, string $documentId): ?array
{
    $url = LIVE_SYNC_BASE . rawurlencode($collection) . '/' . rawurlencode($documentId) . '?key=' . urlencode(LIVE_SYNC_KEY);
    $response = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 2, 'ignore_errors' => true]]));
    if ($response === false)
        return null;
    $payload = json_decode($response, true);
    if (!is_array($payload) || empty($payload['fields']))
        return null;
    $result = [];
    foreach ($payload['fields'] as $key => $value)
        $result[$key] = liveSyncValue($value);
    return $result;
}

function liveFirestoreSet(string $collection, string $documentId, array $fields): bool
{
    $url = LIVE_SYNC_BASE . rawurlencode($collection) . '/' . rawurlencode($documentId) . '?key=' . urlencode(LIVE_SYNC_KEY);
    $encoded = [];
    foreach ($fields as $key => $value)
        $encoded[$key] = liveFirestoreValue($value);
    $context = stream_context_create(['http' => ['method' => 'PATCH', 'header' => "Content-Type: application/json\r\n", 'content' => json_encode(['fields' => $encoded], JSON_UNESCAPED_UNICODE), 'timeout' => 3, 'ignore_errors' => true]]);
    $response = @file_get_contents($url, false, $context);
    return $response !== false && preg_match('/\s2\d{2}\s/', $http_response_header[0] ?? '');
}

function liveFirestoreDelete(string $collection, string $documentId): bool
{
    $url = LIVE_SYNC_BASE . rawurlencode($collection) . '/' . rawurlencode($documentId) . '?key=' . urlencode(LIVE_SYNC_KEY);
    $response = @file_get_contents($url, false, stream_context_create(['http' => ['method' => 'DELETE', 'timeout' => 3, 'ignore_errors' => true]]));
    return $response !== false && preg_match('/\s2\d{2}\s/', $http_response_header[0] ?? '');
}

function pull_official_coordinators(PDO $db): int
{
    $rows = liveSyncCollection('coordinators');
    if ($rows === []) {
        return 0;
    }

    $upsert = $db->prepare(
        'INSERT INTO coordinators (id, name, phone, gender, faculty, major, role_type, bio, tasks_count, tasks_completed, is_active, joined_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name, phone = excluded.phone, gender = excluded.gender,
            faculty = excluded.faculty, major = excluded.major, role_type = excluded.role_type,
            bio = excluded.bio, tasks_count = excluded.tasks_count, tasks_completed = excluded.tasks_completed
            -- لا نكتب فوق is_active أو notes حتى لا تُعيد السحابة إلغاء تفعيل المنسقين الذين فعّلهم الأدمن محلياً'
    );
    $deletedCoordinator = $db->prepare("SELECT 1 FROM deleted_records WHERE source_table = 'coordinators' AND source_id = ? LIMIT 1");
    $synced = 0;
    foreach ($rows as $row) {
        $localId = (int) ($row['local_id'] ?? 0);
        if ($localId <= 0) {
            continue;
        }
        $deletedCoordinator->execute([(string) $localId]);
        if ($deletedCoordinator->fetchColumn()) {
            continue;
        }
        $upsert->execute([
            $localId,
            liveSyncText($row['name'] ?? ''),
            liveSyncText($row['phone'] ?? ''),
            liveSyncText($row['gender'] ?? 'male', 'male'),
            liveSyncText($row['faculty'] ?? ''),
            liveSyncText($row['major'] ?? ''),
            liveSyncText($row['role_type'] ?? $row['role'] ?? 'coordinator', 'coordinator'),
            liveSyncText($row['bio'] ?? ''),
            (int) ($row['tasks_count'] ?? 0),
            (int) ($row['tasks_completed'] ?? 0),
            (int) ($row['is_active'] ?? ($row['active'] ?? 1)),
            liveSyncText($row['joined_at'] ?? ''),
            liveSyncText($row['notes'] ?? ''),
        ]);
        $synced++;
    }

    return $synced;
}

function sync_official_live(PDO $db): void
{
    $lock = __DIR__ . '/.official-live-sync';
    if (is_file($lock) && filemtime($lock) > time() - 300)
        return;
    @touch($lock);

    $pageEvents = liveSyncCollection('page_views');
    $localTotalVisits = (int) $db->query("SELECT COALESCE(SUM(views_count), 0) FROM page_views")->fetchColumn();
    $localMaterialOpens = (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'material_view'")->fetchColumn();
    $localQuizCompletions = (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'quiz_completed'")->fetchColumn();
    $localSuggestions = (int) $db->query("SELECT COUNT(*) FROM feedback_reviews WHERE feedback_type IN ('suggestion', 'collaboration')")->fetchColumn();
    $localPendingReports = (int) $db->query("SELECT COUNT(*) FROM question_reports WHERE status IN ('pending', 'new', '') OR status IS NULL")->fetchColumn();
    $localServiceRequests = (int) $db->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('new', 'in_progress', 'pending')")->fetchColumn();

    $firestoreVisitCount = count(array_filter($pageEvents, static fn($row) => ($row['type'] ?? 'visit') === 'visit'));
    $firestoreMaterialOpens = count(array_filter($pageEvents, static fn($row) => ($row['type'] ?? '') === 'material_view'));
    $firestoreQuizCompletions = count(array_filter($pageEvents, static fn($row) => ($row['type'] ?? '') === 'quiz_completed'));

    $metricValues = [
        'total_visits' => max($localTotalVisits, $firestoreVisitCount),
        'material_opens' => max($localMaterialOpens, $firestoreMaterialOpens),
        'quiz_completions' => max($localQuizCompletions, $firestoreQuizCompletions),
        'suggestions' => max($localSuggestions, (int) $db->query("SELECT COUNT(*) FROM feedback_reviews WHERE feedback_type IN ('suggestion', 'collaboration')")->fetchColumn()),
        'pending_reports' => max($localPendingReports, (int) $db->query("SELECT COUNT(*) FROM question_reports WHERE status IN ('pending', 'new', '') OR status IS NULL")->fetchColumn()),
        'service_requests' => max($localServiceRequests, (int) $db->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('new', 'in_progress', 'pending')")->fetchColumn()),
    ];
    $metricUpdate = $db->prepare('INSERT INTO dashboard_metrics (metric_key, metric_value, source, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(metric_key) DO UPDATE SET metric_value = excluded.metric_value, source = excluded.source, updated_at = CURRENT_TIMESTAMP');
    foreach ($metricValues as $key => $value)
        $metricUpdate->execute([$key, $value, 'official Firestore live']);
    $pageCounts = [];
    foreach ($pageEvents as $event) {
        $path = (string) ($event['path'] ?? '/');
        $visitor = trim((string) ($event['studentPhone'] ?? $event['studentName'] ?? ''));
        $pageCounts[$path] ??= ['views' => 0, 'visitors' => []];
        $pageCounts[$path]['views']++;
        $pageCounts[$path]['visitors'][$visitor !== '' ? $visitor : count($pageCounts[$path]['visitors'])] = true;
    }
    if ($pageCounts) {
        $db->exec('DELETE FROM page_views');
        $pageUpdate = $db->prepare('INSERT INTO page_views (page_name, slug, views_count, unique_visitors, category) VALUES (?, ?, ?, ?, ?)');
        foreach ($pageCounts as $path => $page) {
            $meta = normalize_page_analytics((string) $path);
            $pageUpdate->execute([$meta['page_name'], $meta['slug'], $page['views'], count($page['visitors']), str_starts_with((string) $path, '/admin') ? 'لوحة التحكم' : 'الموقع الرسمي']);
        }
    }

    $reports = liveSyncCollection('question_reports');
    $insertReport = $db->prepare('INSERT INTO question_reports (reporter_name, reporter_contact, question_title, question_id, course_name, report_type, reason, details, status, created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM question_reports WHERE reporter_name = ? AND question_title = ? AND created_at = ?)');
    foreach ($reports as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $reportKey = trim((string) ($row['questionId'] ?? '')) ?: trim((string) ($row['questionTitle'] ?? ''));
        if (archivedRemoteRecordExists($db, 'question_reports', $reportKey, $created)) {
            continue;
        }
        $insertReport->execute([$row['reporterName'] ?? 'طالب', $row['reporterContact'] ?? '', $row['questionTitle'] ?? 'بلاغ سؤال', $row['questionId'] ?? '', $row['courseName'] ?? '', $row['reportType'] ?? 'wrong_answer', $row['reason'] ?? '', $row['details'] ?? '', $row['status'] ?? 'pending', $created, $row['reporterName'] ?? 'طالب', $row['questionTitle'] ?? 'بلاغ سؤال', $created]);
        if ($insertReport->rowCount() > 0) {
            create_admin_notification('question_report', 'بلاغ سؤال جديد', 'وصل بلاغ جديد عن السؤال: ' . liveSyncText($row['questionTitle'] ?? 'بلاغ سؤال'), 'reports.php', 'question_reports:' . ($row['_id'] ?? $created));
        }
    }

    $requests = liveSyncCollection('service_requests');
    $insertRequest = $db->prepare('INSERT INTO service_requests (student_name, student_phone, student_email, faculty, service_type, course_name, details, status, created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM service_requests WHERE student_name = ? AND student_phone = ? AND created_at = ?)');
    foreach ($requests as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $details = $row['requestDetails'] ?? $row['ideaDetails'] ?? $row['details'] ?? $row['subject'] ?? '';
        $insertRequest->execute([$row['studentName'] ?? 'طالب', $row['studentPhone'] ?? '', $row['studentEmail'] ?? '', $row['faculty'] ?? 'عام', $row['serviceId'] ?? $row['serviceLabel'] ?? 'طلب خدمة', $row['subject'] ?? $row['courseName'] ?? '', $details, $row['status'] ?? 'new', $created, $row['studentName'] ?? 'طالب', $row['studentPhone'] ?? '', $created]);
        if ($insertRequest->rowCount() > 0) {
            create_admin_notification('service_request', 'طلب خدمة جديد', 'وصل طلب خدمة جديد من: ' . liveSyncText($row['studentName'] ?? 'طالب'), 'service_requests.php', 'service_requests:' . ($row['_id'] ?? $created));
        }
    }

    $applications = liveSyncCollection('coordinatorApplications');
    $insertApplication = $db->prepare('INSERT INTO membership_requests (applicant_name, phone, email, faculty, motivation, status, created_at, updated_at) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM membership_requests WHERE applicant_name = ? AND phone = ? AND created_at = ?)');
    foreach ($applications as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $insertApplication->execute([$row['name'] ?? 'متقدم غير معروف', $row['phoneNumber'] ?? '', $row['email'] ?? '', $row['faculty'] ?? 'عام', $row['motivation'] ?? '', $row['status'] ?? 'pending', $created, $created, $row['name'] ?? 'متقدم غير معروف', $row['phoneNumber'] ?? '', $created]);
        if ($insertApplication->rowCount() > 0) {
            create_admin_notification('membership_request', 'طلب انضمام جديد', 'تقدم ' . liveSyncText($row['name'] ?? 'متقدم جديد') . ' بطلب للانضمام إلى الفريق.', 'membership_requests.php', 'coordinatorApplications:' . ($row['_id'] ?? $created));
        }
    }

    $contributions = liveSyncCollection('quizContributions');
    $insertContribution = $db->prepare('INSERT INTO contributions (student_name, subject_name, faculty, file_name, file_url, file_type, file_size, contribution_type, status, created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM contributions WHERE student_name = ? AND file_name = ? AND created_at = ?)');
    foreach ($contributions as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $contributionKey = trim((string) ($row['fileUrl'] ?? '')) ?: trim((string) ($row['fileName'] ?? ''));
        if (archivedRemoteRecordExists($db, 'contributions', $contributionKey, $created)) {
            continue;
        }
        $insertContribution->execute([$row['studentName'] ?? 'مساهم مجهول', $row['subjectName'] ?? 'عام', $row['faculty'] ?? 'عام', $row['fileName'] ?? 'رابط خارجي', $row['fileUrl'] ?? '', $row['fileType'] ?? 'link', (int) ($row['fileSize'] ?? 0), $row['contributionType'] ?? 'unspecified', $row['status'] ?? 'pending', $created, $row['studentName'] ?? 'مساهم مجهول', $row['fileName'] ?? 'رابط خارجي', $created]);
        if ($insertContribution->rowCount() > 0) {
            create_admin_notification('contribution', 'مساهمة جديدة', 'أرسل ' . liveSyncText($row['studentName'] ?? 'طالب') . ' مساهمة جديدة.', 'contributions.php', 'quizContributions:' . ($row['_id'] ?? $created));
        }
    }

    $suggestions = liveSyncCollection('suggestions');
    $insertFeedback = $db->prepare('INSERT INTO feedback_reviews (student_name, student_email, student_phone, faculty, rating, feedback_type, title, content, is_approved, is_pinned, status, created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM feedback_reviews WHERE student_name = ? AND content = ? AND created_at = ?)');
    foreach ($suggestions as $row) {
        $created = liveSyncDate($row['timestamp'] ?? null);
        $insertFeedback->execute([$row['name'] ?? 'طالب', $row['email'] ?? '', $row['phone'] ?? '', 'عام', (int) ($row['rating'] ?? 5), $row['type'] ?? 'suggestion', 'اقتراح أو رسالة', $row['message'] ?? '', 0, 0, $row['status'] ?? 'new', $created, $row['name'] ?? 'طالب', $row['message'] ?? '', $created]);
        if ($insertFeedback->rowCount() > 0) {
            create_admin_notification('feedback', 'رسالة أو اقتراح جديد', 'وصلت رسالة جديدة من: ' . liveSyncText($row['name'] ?? 'طالب'), 'reviews.php', 'suggestions:' . ($row['_id'] ?? $created));
        }
    }

    $testimonials = liveSyncCollection('testimonials');
    foreach ($testimonials as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $content = $row['quote'] ?? $row['content'] ?? $row['message'] ?? '';
        $name = $row['author'] ?? $row['name'] ?? 'طالب';
        $insertFeedback->execute([$name, $row['email'] ?? '', $row['phone'] ?? '', $row['major'] ?? 'عام', (int) ($row['rating'] ?? 5), 'review', $row['role'] ?? 'تقييم', $content, !empty($row['approved']) ? 1 : 0, !empty($row['pinned']) ? 1 : 0, $row['status'] ?? 'new', $created, $name, $content, $created]);
        if ($insertFeedback->rowCount() > 0) {
            create_admin_notification('review', 'تقييم جديد', 'وصل تقييم جديد من: ' . liveSyncText($name), 'reviews.php', 'testimonials:' . ($row['_id'] ?? $created));
        }
    }

    $notices = liveSyncCollection('notices');
    $insertNotice = $db->prepare('INSERT INTO notices (title_ar, title_en, body_ar, body_en, notice_type, target_path, action_text_ar, action_text_en, action_url, is_mandatory, is_pinned, is_active, expires_at, created_by, created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM notices WHERE title_ar = ? AND created_at = ?)');
    foreach ($notices as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $insertNotice->execute([$row['titleAr'] ?? $row['title'] ?? 'إعلان', $row['titleEn'] ?? '', $row['bodyAr'] ?? $row['body'] ?? '', $row['bodyEn'] ?? '', $row['type'] ?? 'info', $row['targetPath'] ?? '', $row['actionTextAr'] ?? '', $row['actionTextEn'] ?? '', $row['actionUrl'] ?? '', !empty($row['isMandatory']) ? 1 : 0, !empty($row['pinned']) ? 1 : 0, array_key_exists('active', $row) ? (int) $row['active'] : 1, $row['expiresAt'] ?? null, $row['createdBy'] ?? 'الموقع الرسمي', $created, $row['titleAr'] ?? $row['title'] ?? 'إعلان', $created]);
    }

    $preRequests = liveSyncCollection('materialPreRequests');
    foreach ($preRequests as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $insertRequest->execute([$row['studentName'] ?? 'طالب', $row['phoneNumber'] ?? '', '', 'عام', 'material_pre_request', $row['materialName'] ?? '', $row['notes'] ?? '', $row['status'] ?? 'pending', $created, $row['studentName'] ?? 'طالب', $row['phoneNumber'] ?? '', $created]);
        if ($insertRequest->rowCount() > 0) {
            create_admin_notification('material_request', 'طلب مادة جديد', 'طلب ' . liveSyncText($row['studentName'] ?? 'طالب') . ' مادة: ' . liveSyncText($row['materialName'] ?? 'غير محددة'), 'service_requests.php', 'materialPreRequests:' . ($row['_id'] ?? $created));
        }
    }

    $exchanges = liveSyncCollection('materialDonations');
    $insertExchange = $db->prepare('INSERT INTO material_exchanges (donor_name, donor_phone, donor_gender, material_name, course_code, faculty, description, status, booker_name, booker_phone, booker_gender, booked_at, pickup_date, pickup_time, assigned_coordinator, delivery_status, delivered_at, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    foreach ($exchanges as $donation) {
        $created = liveSyncDate($donation['createdAt'] ?? null);
        foreach ($donation['materials'] ?? [] as $material) {
            if (!is_array($material) || trim((string) ($material['name'] ?? '')) === '')
                continue;
            $status = in_array($material['status'] ?? $donation['status'] ?? 'approved', ['pending', 'approved', 'reserved', 'completed'], true) ? ($material['status'] ?? $donation['status'] ?? 'approved') : 'approved';
            $taker = $material['takerInfo'] ?? [];
            $donorName = $donation['studentName'] ?? 'متبرع';
            $donorPhone = $donation['phoneNumber'] ?? '';
            $materialName = $material['name'];
            $exists = $db->prepare('SELECT 1 FROM material_exchanges WHERE donor_name = ? AND donor_phone = ? AND material_name = ? AND created_at = ? LIMIT 1');
            $exists->execute([$donorName, $donorPhone, $materialName, $created]);
            if ($exists->fetchColumn())
                continue;
            $insertExchange->execute([$donorName, $donorPhone, $donation['studentGender'] ?? 'male', $materialName, $donation['courseCode'] ?? '', $donation['faculty'] ?? '', $material['description'] ?? '', $status, $taker['name'] ?? null, $taker['phone'] ?? null, $taker['gender'] ?? null, $taker['bookedAt'] ?? null, $donation['pickupDate'] ?? null, $donation['pickupTime'] ?? null, ($donation['studentGender'] ?? 'male') === 'female' ? 'sara' : 'ahmad', $status === 'completed' ? 'completed' : ($status === 'reserved' ? 'scheduled' : 'pending_contact'), $donation['deliveredAt'] ?? null, $donation['notes'] ?? '', $created, liveSyncDate($donation['updatedAt'] ?? $created)]);
            create_admin_notification('material_exchange', 'طلب تبادل مواد جديد', 'تم استلام مادة جديدة من ' . liveSyncText($donorName) . ': ' . liveSyncText($materialName), 'donations.php', 'materialDonations:' . ($donation['_id'] ?? $created) . ':' . $materialName);
        }
    }

    // ── مزامنة المنسقين من Firestore → SQLite ──────────────────────────────
    $firestoreCoords = liveSyncCollection('coordinators');
    foreach ($firestoreCoords as $fc) {
        $localId = (int) ($fc['local_id'] ?? 0);
        if ($localId <= 0)
            continue;
        $db->prepare("
            INSERT INTO coordinators
                (id, name, phone, gender, faculty, major, role_type, bio,
                 tasks_count, tasks_completed, is_active, joined_at, notes, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO NOTHING
        ")->execute([
                    $localId,
                    liveSyncText($fc['name'] ?? 'منسق'),
                    liveSyncText($fc['phone'] ?? ''),
                    liveSyncText($fc['gender'] ?? 'male'),
                    liveSyncText($fc['faculty'] ?? ''),
                    liveSyncText($fc['major'] ?? ''),
                    liveSyncText($fc['role_type'] ?? 'coordinator'),
                    liveSyncText($fc['bio'] ?? ''),
                    (int) ($fc['tasks_count'] ?? 0),
                    (int) ($fc['tasks_completed'] ?? 0),
                    (int) ($fc['is_active'] ?? 1),
                    liveSyncText($fc['joined_at'] ?? ''),
                    liveSyncText($fc['notes'] ?? ''),
                ]);
    }
}


function sync_official_service_requests(PDO $db): void
{
    $requests = liveSyncCollection('service_requests');
    $insert = $db->prepare('INSERT INTO service_requests (student_name, student_phone, student_email, faculty, service_type, course_name, details, status, created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM service_requests WHERE student_name = ? AND student_phone = ? AND created_at = ?)');
    foreach ($requests as $row) {
        $created = liveSyncDate($row['createdAt'] ?? null);
        $details = $row['requestDetails'] ?? $row['ideaDetails'] ?? $row['details'] ?? $row['subject'] ?? '';
        $insert->execute([$row['studentName'] ?? 'طالب', $row['studentPhone'] ?? '', $row['studentEmail'] ?? '', $row['faculty'] ?? 'عام', $row['serviceId'] ?? $row['serviceLabel'] ?? 'طلب خدمة', $row['subject'] ?? $row['courseName'] ?? '', $details, $row['status'] ?? 'new', $created, $row['studentName'] ?? 'طالب', $row['studentPhone'] ?? '', $created]);
    }
}