<?php
declare(strict_types=1);

/**
 * includes/sync_frontend_live.php
 * وحدة التنسيق الحي والمباشر — مزامنة التعديلات فوراً من قاعدة البيانات إلى ملفات الواجهة React وقاعدة بيانات Firestore السحابية
 */

const FS_API_BASE = 'https://firestore.googleapis.com/v1/projects/koon-609da/databases/(default)/documents/';
const FS_API_KEY = 'AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';

function firestoreServiceToken(): ?string
{
    static $token;
    static $expiresAt = 0;
    if ($token && $expiresAt > time() + 60) {
        return $token;
    }

    $credentialsPath = getenv('GOOGLE_APPLICATION_CREDENTIALS') ?: '';
    $credentialsJson = getenv('FIREBASE_SERVICE_ACCOUNT_JSON') ?: '';
    if ($credentialsJson === '') {
        $candidatePaths = array_filter([
            $credentialsPath,
            defined('DB_PATH') ? dirname(DB_PATH) . '/firebase-service-account.json' : '',
            '/home/makanak-admin/data/firebase-service-account.json',
            dirname(__DIR__) . '/firebase-service-account.json',
            dirname(__DIR__) . '/koon-609da-firebase-adminsdk-fbsvc-91bb8de1a6.json',
        ]);
        foreach ($candidatePaths as $path) {
            if (is_file($path)) {
                $credentialsJson = (string) file_get_contents($path);
                break;
            }
        }
    }
    $credentials = json_decode($credentialsJson, true);
    if (!is_array($credentials) || empty($credentials['client_email']) || empty($credentials['private_key'])) {
        return null;
    }

    $base64Url = static function (string $value): string {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    };
    $now = time();
    $header = $base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claims = $base64Url(json_encode([
        'iss' => $credentials['client_email'],
        'scope' => 'https://www.googleapis.com/auth/datastore',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now,
        'exp' => $now + 3600,
    ]));
    $unsigned = $header . '.' . $claims;
    if (!openssl_sign($unsigned, $signature, $credentials['private_key'], OPENSSL_ALGO_SHA256)) {
        return null;
    }

    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion' => $unsigned . '.' . $base64Url($signature),
        ]),
        CURLOPT_TIMEOUT => 5,
    ]);
    $response = curl_exec($ch);
    unset($ch);
    $payload = json_decode(is_string($response) ? $response : '', true);
    if (empty($payload['access_token'])) {
        return null;
    }

    $token = (string) $payload['access_token'];
    $expiresAt = $now + (int) ($payload['expires_in'] ?? 3600);
    return $token;
}

function firestoreRequestUrl(string $path): string
{
    $token = firestoreServiceToken();
    return FS_API_BASE . $path . ($token ? '' : '?key=' . urlencode(FS_API_KEY));
}

function firestoreRequestHeaders(): string
{
    $token = firestoreServiceToken();
    return "Content-Type: application/json\r\n" . ($token ? "Authorization: Bearer {$token}\r\n" : '');
}

function ensure_question_reports_columns(PDO $db): void
{
    $columns = $db->query('PRAGMA table_info(question_reports)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array('firestore_id', $columns, true)) {
        $db->exec('ALTER TABLE question_reports ADD COLUMN firestore_id TEXT');
        $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_firestore_id ON question_reports(firestore_id)');
    }
    if (!in_array('options_json', $columns, true)) {
        $db->exec('ALTER TABLE question_reports ADD COLUMN options_json TEXT');
    }
    if (!in_array('correct_answer', $columns, true)) {
        $db->exec('ALTER TABLE question_reports ADD COLUMN correct_answer TEXT');
    }
    if (!in_array('quiz_id', $columns, true)) {
        $db->exec('ALTER TABLE question_reports ADD COLUMN quiz_id TEXT');
    }
}

function pull_question_reports_from_firestore(?PDO $db = null): int
{
    $db ??= get_db();
    ensure_question_reports_columns($db);

    $url = firestoreRequestUrl('question_reports?pageSize=300');
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => firestoreRequestHeaders(),
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $response = @file_get_contents($url, false, $context);
    $payload = json_decode(is_string($response) ? $response : '', true);
    if (!is_array($payload) || empty($payload['documents'])) {
        return 0;
    }

    $decodeFsValue = static function ($field) use (&$decodeFsValue): mixed {
        if (!is_array($field)) return $field;
        foreach (['stringValue', 'integerValue', 'doubleValue', 'booleanValue', 'timestampValue'] as $type) {
            if (array_key_exists($type, $field)) return $field[$type];
        }
        if (isset($field['arrayValue']['values'])) {
            $arr = [];
            foreach ($field['arrayValue']['values'] as $v) $arr[] = $decodeFsValue($v);
            return $arr;
        }
        if (isset($field['mapValue']['fields'])) {
            $m = [];
            foreach ($field['mapValue']['fields'] as $k => $v) $m[$k] = $decodeFsValue($v);
            return $m;
        }
        return null;
    };

    $synced = 0;
    foreach ($payload['documents'] as $document) {
        $firestoreId = basename((string) ($document['name'] ?? ''));
        if ($firestoreId === '') continue;

        $rawFields = $document['fields'] ?? [];
        $fields = [];
        foreach ($rawFields as $key => $val) {
            $fields[$key] = $decodeFsValue($val);
        }

        // Title and question text
        $qTitle = trim((string) ($fields['questionAr'] ?? '')) ?: trim((string) ($fields['questionEn'] ?? '')) ?: trim((string) ($fields['text'] ?? '')) ?: 'بلاغ سؤال';
        $qTitle = preg_replace('/^Report:\s*(\[[^\]]+\]\s*)?/u', '', $qTitle);

        $courseName = trim((string) ($fields['subjectName'] ?? '')) ?: trim((string) ($fields['quizTitle'] ?? '')) ?: trim((string) ($fields['courseName'] ?? '')) ?: 'عام';
        $qId = trim((string) ($fields['questionId'] ?? ''));
        $quizId = trim((string) ($fields['quizId'] ?? ''));
        $reporterName = trim((string) ($fields['reporterName'] ?? '')) ?: 'طالب';
        $reporterContact = trim((string) ($fields['reporterContact'] ?? ''));
        
        $reportType = trim((string) ($fields['reportType'] ?? 'wrong_answer'));
        if ($reportType === 'incorrect_answer') $reportType = 'wrong_answer';

        $reason = trim((string) ($fields['reason'] ?? '')) ?: trim((string) ($fields['studentNote'] ?? '')) ?: 'ملاحظة حول السؤال';
        $details = trim((string) ($fields['studentNote'] ?? '')) ?: trim((string) ($fields['details'] ?? ''));
        $status = trim((string) ($fields['status'] ?? 'pending')) ?: 'pending';
        $correctAnswer = trim((string) ($fields['correctAnswer'] ?? ''));
        $optionsJson = !empty($fields['options']) ? json_encode($fields['options'], JSON_UNESCAPED_UNICODE) : null;

        $createdAt = date('Y-m-d H:i:s');
        if (!empty($fields['createdAt'])) {
            try {
                $createdAt = (new DateTimeImmutable((string) $fields['createdAt']))->format('Y-m-d H:i:s');
            } catch (Throwable) {}
        } elseif (!empty($document['createTime'])) {
            try {
                $createdAt = (new DateTimeImmutable((string) $document['createTime']))->format('Y-m-d H:i:s');
            } catch (Throwable) {}
        }

        $stmt = $db->prepare('SELECT id, status FROM question_reports WHERE firestore_id = ? LIMIT 1');
        $stmt->execute([$firestoreId]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($existing) {
            $update = $db->prepare('UPDATE question_reports SET question_title = ?, question_id = ?, course_name = ?, report_type = ?, reason = ?, details = ?, status = COALESCE(?, status), options_json = ?, correct_answer = ?, quiz_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $update->execute([$qTitle, $qId, $courseName, $reportType, $reason, $details, $status, $optionsJson, $correctAnswer, $quizId, $existing['id']]);
        } else {
            $insert = $db->prepare('INSERT INTO question_reports (reporter_name, reporter_contact, question_title, question_id, course_name, report_type, reason, details, status, created_at, updated_at, firestore_id, options_json, correct_answer, quiz_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)');
            $insert->execute([$reporterName, $reporterContact, $qTitle, $qId, $courseName, $reportType, $reason, $details, $status, $createdAt, $firestoreId, $optionsJson, $correctAnswer, $quizId]);
            $synced++;

            // Create admin notification
            if (function_exists('create_admin_notification')) {
                create_admin_notification('question_report', 'بلاغ جديد عن سؤال', "وصل بلاغ جديد في مساق $courseName حول: $qTitle", 'reports.php', 'question_reports:' . $firestoreId);
            }
        }
    }
    return $synced;
}

/**
 * تحديث حالة البلاغ في Firestore السحابية فور تعديلها من لوحة التحكم
 */
function update_question_report_in_firestore(string $firestoreId, string $status, string $notes = '', string $resolvedBy = ''): bool
{
    if ($firestoreId === '') {
        return false;
    }

    $url = firestoreRequestUrl('question_reports/' . rawurlencode($firestoreId) . '?updateMask.fieldPaths=status&updateMask.fieldPaths=resolutionNotes&updateMask.fieldPaths=resolvedBy&updateMask.fieldPaths=updatedAt');
    $headers = firestoreRequestHeaders();

    $fields = [
        'status' => ['stringValue' => $status],
        'resolutionNotes' => ['stringValue' => $notes],
        'resolvedBy' => ['stringValue' => $resolvedBy],
        'updatedAt' => ['stringValue' => date('c')],
    ];

    $context = stream_context_create([
        'http' => [
            'method' => 'PATCH',
            'header' => $headers,
            'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);

    $res = @file_get_contents($url, false, $context);
    return $res !== false;
}

/**
 * حذف بلاغ من Firestore السحابية عند حذفه من لوحة التحكم
 */
function delete_question_report_in_firestore(string $firestoreId): bool
{
    if ($firestoreId === '') return false;
    $url = firestoreRequestUrl('question_reports/' . rawurlencode($firestoreId));
    $context = stream_context_create([
        'http' => [
            'method' => 'DELETE',
            'header' => firestoreRequestHeaders(),
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    return $res !== false;
}

/**
 * جلب وتحديث تحليلات الزيارات والمشاهدات الحية من Firestore إلى SQLite
 */
function pull_live_analytics_from_firestore(?PDO $db = null, int $pageSize = 300): array
{
    $db ??= get_db();
    $db->exec('CREATE TABLE IF NOT EXISTS analytics_events (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT UNIQUE NOT NULL, path TEXT NOT NULL, event_type TEXT NOT NULL DEFAULT "visit", visitor_key TEXT, user_agent TEXT, occurred_at TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS page_views (id INTEGER PRIMARY KEY AUTOINCREMENT, page_name TEXT, slug TEXT UNIQUE, views_count INTEGER DEFAULT 0, unique_visitors INTEGER DEFAULT 0, category TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    $db->exec('CREATE TABLE IF NOT EXISTS dashboard_metrics (metric_key TEXT PRIMARY KEY, metric_value INTEGER NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');

    $url = firestoreRequestUrl('page_views?pageSize=' . $pageSize);
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => firestoreRequestHeaders(),
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);

    $response = @file_get_contents($url, false, $context);
    $payload = json_decode(is_string($response) ? $response : '', true);
    if (!is_array($payload) || empty($payload['documents'])) {
        return ['new_events' => 0, 'total_events' => (int) $db->query('SELECT COUNT(*) FROM analytics_events')->fetchColumn()];
    }

    $decodeFsVal = static function (array $value): mixed {
        foreach (['stringValue', 'integerValue', 'doubleValue', 'booleanValue', 'timestampValue'] as $type) {
            if (array_key_exists($type, $value)) return $value[$type];
        }
        return null;
    };

    $newCount = 0;
    $eventInsert = $db->prepare('INSERT OR IGNORE INTO analytics_events (source_id, path, event_type, visitor_key, user_agent, occurred_at) VALUES (?, ?, ?, ?, ?, ?)');

    foreach ($payload['documents'] as $document) {
        $sourceId = basename((string) ($document['name'] ?? ''));
        if ($sourceId === '') continue;

        $rawFields = $document['fields'] ?? [];
        $fields = [];
        foreach ($rawFields as $k => $v) {
            $fields[$k] = $decodeFsVal($v);
        }

        $path = (string) ($fields['path'] ?? '/');
        $visitor = trim((string) ($fields['studentPhone'] ?? ''));
        if ($visitor === '') {
            $visitor = trim((string) ($fields['studentName'] ?? ''));
        }
        if ($visitor === '') {
            $visitor = 'Guest';
        }

        $occurredAt = date('Y-m-d H:i:s');
        if (!empty($fields['timestamp'])) {
            try {
                $occurredAt = (new DateTimeImmutable((string) $fields['timestamp']))->format('Y-m-d H:i:s');
            } catch (Throwable) {}
        } elseif (!empty($document['createTime'])) {
            try {
                $occurredAt = (new DateTimeImmutable((string) $document['createTime']))->format('Y-m-d H:i:s');
            } catch (Throwable) {}
        }

        $eventType = (string) ($fields['type'] ?? 'visit');
        $userAgent = (string) ($fields['userAgent'] ?? '');

        $eventInsert->execute([$sourceId, $path, $eventType, $visitor, $userAgent, $occurredAt]);
        if ($eventInsert->rowCount() > 0) {
            $newCount++;
        }
    }

    // Recalculate page_views table if new events arrived
    if ($newCount > 0 || (int) $db->query('SELECT COUNT(*) FROM page_views')->fetchColumn() === 0) {
        $allEvents = $db->query('SELECT path, visitor_key, source_id FROM analytics_events')->fetchAll(PDO::FETCH_ASSOC);
        $pages = [];
        foreach ($allEvents as $ev) {
            $p = $ev['path'] ?: '/';
            $v = $ev['visitor_key'] ?: $ev['source_id'];
            $pages[$p] ??= ['views' => 0, 'visitors' => []];
            $pages[$p]['views']++;
            $pages[$p]['visitors'][$v] = true;
        }

        $pageInsert = $db->prepare('INSERT INTO page_views (page_name, slug, views_count, unique_visitors, category, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(slug) DO UPDATE SET views_count = excluded.views_count, unique_visitors = excluded.unique_visitors, updated_at = CURRENT_TIMESTAMP');
        foreach ($pages as $p => $pData) {
            $meta = function_exists('normalize_page_analytics') ? normalize_page_analytics((string) $p) : ['page_name' => 'صفحة', 'slug' => $p];
            $category = str_starts_with((string) $p, '/admin') ? 'لوحة التحكم' : 'الموقع الرسمي';
            $pageInsert->execute([$meta['page_name'], $meta['slug'], $pData['views'], count($pData['visitors']), $category]);
        }
    }

    // Update dashboard_metrics cache
    $totalVisits = (int) $db->query("SELECT COALESCE(SUM(views_count), 0) FROM page_views")->fetchColumn();
    $matOpens = (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'material_view'")->fetchColumn();
    $quizComps = (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'quiz_completed'")->fetchColumn();

    $saveMetric = $db->prepare("INSERT INTO dashboard_metrics (metric_key, metric_value, source, updated_at) VALUES (?, ?, 'firestore_live', CURRENT_TIMESTAMP) ON CONFLICT(metric_key) DO UPDATE SET metric_value = excluded.metric_value, updated_at = CURRENT_TIMESTAMP");
    $saveMetric->execute(['total_visits', $totalVisits]);
    $saveMetric->execute(['material_opens', $matOpens]);
    $saveMetric->execute(['quiz_completions', $quizComps]);

    return [
        'new_events' => $newCount,
        'total_events' => (int) $db->query('SELECT COUNT(*) FROM analytics_events')->fetchColumn(),
        'total_visits' => $totalVisits,
        'material_opens' => $matOpens,
        'quiz_completions' => $quizComps,
    ];
}

function firestoreEncodeValue(mixed $val): array
{
    if (is_null($val)) {
        return ['nullValue' => null];
    }
    if (is_bool($val)) {
        return ['booleanValue' => $val];
    }
    if (is_int($val)) {
        return ['integerValue' => (string) $val];
    }
    if (is_float($val)) {
        return ['doubleValue' => (float) $val];
    }
    if (is_array($val)) {
        if (array_is_list($val)) {
            $values = [];
            foreach ($val as $item) {
                $values[] = firestoreEncodeValue($item);
            }
            return ['arrayValue' => ['values' => $values]];
        } else {
            $fields = [];
            foreach ($val as $k => $v) {
                $fields[$k] = firestoreEncodeValue($v);
            }
            return ['mapValue' => ['fields' => $fields]];
        }
    }
    return ['stringValue' => (string) $val];
}

function firestoreUpsertDoc(string $collection, string $docId, array $data): bool
{
    $url = firestoreRequestUrl(rawurlencode($collection) . '/' . rawurlencode($docId));
    $fields = [];
    foreach ($data as $k => $v) {
        $fields[$k] = firestoreEncodeValue($v);
    }
    $payload = ['fields' => $fields];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);

    $response = false;
    $statusCode = 0;
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'PATCH',
            CURLOPT_HTTPHEADER => array_filter(array_map('trim', explode("\r\n", firestoreRequestHeaders()))),
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ]);
        $response = curl_exec($handle);
        $statusCode = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        unset($handle);
    } else {
        $context = stream_context_create(['http' => ['method' => 'PATCH', 'header' => firestoreRequestHeaders(), 'content' => $json, 'timeout' => 15, 'ignore_errors' => true]]);
        $response = @file_get_contents($url, false, $context);
        $statusCode = (int) preg_replace('/[^0-9]/', '', $http_response_header[0] ?? '0');
    }

    $ok = $response !== false && $statusCode >= 200 && $statusCode < 300;
    if (!$ok) {
        $GLOBALS['firestore_sync_failed'] = true;
        $GLOBALS['firestore_sync_error'] = substr((string) $response, 0, 1000);
    }
    return $ok;
}

function firestoreDeleteDoc(string $collection, string $docId): bool
{
    $url = firestoreRequestUrl(rawurlencode($collection) . '/' . rawurlencode($docId));
    $response = false;
    $statusCode = 0;
    if (function_exists('curl_init')) {
        $handle = curl_init($url);
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => 'DELETE',
            CURLOPT_HTTPHEADER => array_filter(array_map('trim', explode("\r\n", firestoreRequestHeaders()))),
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 10,
        ]);
        $response = curl_exec($handle);
        $statusCode = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        unset($handle);
    } else {
        $context = stream_context_create(['http' => ['method' => 'DELETE', 'header' => firestoreRequestHeaders(), 'timeout' => 5, 'ignore_errors' => true]]);
        $response = @file_get_contents($url, false, $context);
        $statusCode = (int) preg_replace('/[^0-9]/', '', $http_response_header[0] ?? '0');
    }
    // DELETE is idempotent for archive cleanup: an already absent document is complete.
    $ok = $response !== false && (($statusCode >= 200 && $statusCode < 300) || $statusCode === 404);
    if (!$ok) {
        $GLOBALS['firestore_sync_failed'] = true;
    }
    return $ok;
}

function courseFirestoreDocId(string $courseName): string
{
    return 'course_' . substr(md5(trim($courseName)), 0, 16);
}

function firestoreDeleteQuizQuestion(PDO $db, int $questionId): bool
{
    $stmt = $db->prepare('SELECT part_slug, source_part_id, part_id FROM quiz_questions WHERE id = ? LIMIT 1');
    $stmt->execute([$questionId]);
    $question = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$question) {
        return false;
    }

    $partId = trim((string) ($question['part_slug'] ?: ($question['source_part_id'] ?: ($question['part_id'] ?? ''))));
    if ($partId === '') {
        return false;
    }

    return firestoreDeleteDoc('quiz_questions', $partId . '_' . $questionId);
}

function firestoreDeleteQuizQuestionFromRecord(array $question): bool
{
    $questionId = (int) ($question['id'] ?? 0);
    $partId = trim((string) ($question['part_slug'] ?: ($question['source_part_id'] ?: ($question['part_id'] ?? ''))));
    if ($questionId <= 0 || $partId === '') {
        return false;
    }
    return firestoreDeleteDoc('quiz_questions', $partId . '_' . $questionId);
}

/**
 * تحويل تصنيف المتطلب العربي إلى مفتاح الفئة البرمجي المطابق لـ coursesData
 */
function normalizeCategoryKey(string $cat, string $courseName = ''): string
{
    $cat = trim($cat);
    if (str_contains($courseName, 'مختبر') || str_contains($courseName, 'Lab') || str_contains($cat, 'المختبرات') || str_contains($cat, 'مختبر')) {
        return 'labs';
    }
    if (str_contains($cat, 'الجامعة الإجبارية') || $cat === 'mandatoryUniversity') {
        return 'mandatoryUniversity';
    }
    if (str_contains($cat, 'الجامعة الاختيارية') || $cat === 'optionalUniversity') {
        return 'optionalUniversity';
    }
    if (str_contains($cat, 'الكلية الإجبارية') || $cat === 'mandatoryFaculty') {
        return 'mandatoryFaculty';
    }
    if (str_contains($cat, 'الكلية الاختيارية') || $cat === 'optionalFaculty') {
        return 'optionalFaculty';
    }
    if (str_contains($cat, 'التخصص الإجبارية') || $cat === 'mandatoryMajor') {
        return 'mandatoryMajor';
    }
    if (str_contains($cat, 'التخصص الاختيارية') || $cat === 'optionalMajor') {
        return 'optionalMajor';
    }
    if (str_contains($cat, 'استدراكية') || $cat === 'remedial') {
        return 'remedial';
    }
    if (str_contains($cat, 'قديمة') || $cat === 'oldPlan') {
        return 'oldPlan';
    }
    return $cat ?: 'mandatoryUniversity';
}

/**
 * مزامنة مادة دراسية واحدة بكافة مصادرها إلى Firestore
 */
function sync_course_to_firestore(string $courseName, ?PDO $db = null, bool $isDeleted = false): bool
{
    if ($db === null) {
        $db = get_db();
    }
    $courseName = trim($courseName);
    if ($courseName === '') {
        return false;
    }

    $docId = courseFirestoreDocId($courseName);

    if ($isDeleted) {
        return firestoreUpsertDoc('academic_courses', $docId, [
            'id' => $docId,
            'name' => $courseName,
            'deleted' => true,
            'updatedAt' => date('c')
        ]);
    }

    $stmt = $db->prepare("SELECT * FROM study_materials WHERE course_name = ? AND (status IS NULL OR status = 'active') ORDER BY id ASC");
    $stmt->execute([$courseName]);
    $materials = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($materials)) {
        return firestoreUpsertDoc('academic_courses', $docId, [
            'id' => $docId,
            'name' => $courseName,
            'deleted' => true,
            'updatedAt' => date('c')
        ]);
    }

    $first = $materials[0];
    $catKey = normalizeCategoryKey((string) ($first['requirement_category'] ?? ''), $courseName);
    $faculty = (string) ($first['faculty'] ?? 'كلية الذكاء الاصطناعي');
    $major = (string) ($first['major'] ?? '');
    $courseCode = (string) ($first['course_code'] ?? '');

    $filesMap = [];
    $typeCounters = [];

    foreach ($materials as $m) {
        $type = (string) ($m['material_type'] ?: 'summary');
        $typeCounters[$type] = ($typeCounters[$type] ?? 0) + 1;
        $fileKey = ($typeCounters[$type] === 1) ? $type : ($type . $typeCounters[$type]);

        $filesMap[$fileKey] = [
            'type' => $type,
            'title' => (string) ($m['title'] ?? ''),
            'url' => (string) ($m['file_url'] ?? ''),
            'instructor' => (string) ($m['instructor'] ?? ''),
            'description' => (string) ($m['description'] ?? '')
        ];
    }

    $payload = [
        'id' => $docId,
        'name' => $courseName,
        'nameEn' => $courseName,
        'course_code' => $courseCode,
        'category' => $catKey,
        'faculty' => $faculty,
        'specialization' => $major ?: null,
        'icon' => str_contains($courseName, 'مختبر') ? '⚙️' : '📚',
        'custom' => true,
        'deleted' => false,
        'files' => $filesMap,
        'updatedAt' => date('c')
    ];

    return firestoreUpsertDoc('academic_courses', $docId, $payload);
}

/**
 * مزامنة جميع المواد الدراسية إلى Firestore
 */
function sync_all_courses_to_firestore(?PDO $db = null): int
{
    if ($db === null) {
        $db = get_db();
    }
    $coursesStmt = $db->query("SELECT DISTINCT course_name FROM study_materials WHERE course_name IS NOT NULL AND course_name != ''");
    $courses = $coursesStmt->fetchAll(PDO::FETCH_COLUMN);

    $count = 0;
    foreach ($courses as $cName) {
        if (sync_course_to_firestore((string) $cName, $db)) {
            $count++;
        }
    }
    return $count;
}

function sync_courses_to_frontend(?PDO $db = null): array
{
    if ($db === null) {
        $db = get_db();
    }

    $rows = $db->query("SELECT * FROM study_materials WHERE status IS NULL OR status != 'deleted' ORDER BY course_name ASC, id DESC")->fetchAll(PDO::FETCH_ASSOC);

    $categories = [
        'mandatoryUniversity' => [],
        'optionalUniversity' => [],
        'mandatoryFaculty' => [],
        'optionalFaculty' => [],
        'mandatoryMajor' => [],
        'optionalMajor' => [],
        'labs' => [],
        'remedial' => [],
        'oldPlan' => [],
    ];

    foreach ($rows as $row) {
        $courseName = trim((string) ($row['course_name'] ?? ''));
        if ($courseName === '') {
            continue;
        }
        $categoryKey = normalizeCategoryKey((string) ($row['requirement_category'] ?? ''), $courseName);
        if (!isset($categories[$categoryKey])) {
            $categories[$categoryKey] = [];
        }

        $categories[$categoryKey][] = [
            'id' => (int) $row['id'],
            'name' => (string) ($row['title'] ?? $courseName),
            'course_name' => $courseName,
            'course_code' => (string) ($row['course_code'] ?? ''),
            'faculty' => (string) ($row['faculty'] ?? ''),
            'major' => (string) ($row['major'] ?? ''),
            'requirement_category' => (string) ($row['requirement_category'] ?? $categoryKey),
            'material_type' => (string) ($row['material_type'] ?? 'summary'),
            'file_url' => (string) ($row['file_url'] ?? ''),
            'instructor' => (string) ($row['instructor'] ?? ''),
            'description' => (string) ($row['description'] ?? ''),
            'status' => (string) ($row['status'] ?? 'active'),
        ];
    }

    $jsContent = "export const coursesData = " . json_encode($categories, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . ";\n";
    $targetFiles = [
        dirname(__DIR__) . '/Makanak Al-Jami\'i/src/data/coursesData.js',
        dirname(__DIR__) . '/../Makanak Al-Jami\'i/src/data/coursesData.js',
    ];
    $updatedFiles = [];
    foreach ($targetFiles as $targetFile) {
        if (is_dir(dirname($targetFile))) {
            @file_put_contents($targetFile, $jsContent);
            $updatedFiles[] = $targetFile;
        }
    }

    foreach (array_keys($categories) as $categoryKey) {
        $courseNames = array_unique(array_map(static fn($item) => (string) $item['course_name'], $categories[$categoryKey] ?? []));
        foreach ($courseNames as $courseName) {
            sync_course_to_firestore($courseName, $db);
        }
    }

    return ['success' => true, 'updated_files' => $updatedFiles, 'groups' => count($categories), 'rows' => count($rows)];
}

function sync_material_exchanges_to_frontend(?PDO $db = null): array
{
    if ($db === null) {
        $db = get_db();
    }

    $rows = $db->query("SELECT * FROM material_exchanges ORDER BY id DESC LIMIT 200")->fetchAll(PDO::FETCH_ASSOC);
    $items = [];
    foreach ($rows as $row) {
        $items[] = [
            'id' => (int) $row['id'],
            'donor_name' => (string) ($row['donor_name'] ?? ''),
            'donor_phone' => (string) ($row['donor_phone'] ?? ''),
            'material_name' => (string) ($row['material_name'] ?? ''),
            'course_code' => (string) ($row['course_code'] ?? ''),
            'faculty' => (string) ($row['faculty'] ?? 'عام'),
            'status' => (string) ($row['status'] ?? 'approved'),
            'booker_name' => (string) ($row['booker_name'] ?? ''),
            'pickup_date' => (string) ($row['pickup_date'] ?? ''),
            'pickup_time' => (string) ($row['pickup_time'] ?? ''),
            'notes' => (string) ($row['notes'] ?? ''),
            'updated_at' => (string) ($row['updated_at'] ?? date('c')),
        ];

        $docId = 'donation_' . (int) $row['id'];
        firestoreUpsertDoc('materialDonations', $docId, [
            'id' => $docId,
            'donorName' => (string) ($row['donor_name'] ?? ''),
            'materialName' => (string) ($row['material_name'] ?? ''),
            'courseCode' => (string) ($row['course_code'] ?? ''),
            'faculty' => (string) ($row['faculty'] ?? 'عام'),
            'status' => (string) ($row['status'] ?? 'approved'),
            'bookerName' => (string) ($row['booker_name'] ?? ''),
            'pickupDate' => (string) ($row['pickup_date'] ?? ''),
            'pickupTime' => (string) ($row['pickup_time'] ?? ''),
            'notes' => (string) ($row['notes'] ?? ''),
            'updatedAt' => date('c'),
        ]);
    }

    $jsContent = "export const exchangeData = " . json_encode(['items' => $items], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . ";\n";
    $targetFiles = [
        dirname(__DIR__) . '/Makanak Al-Jami\'i/src/data/exchangeData.js',
        dirname(__DIR__) . '/../Makanak Al-Jami\'i/src/data/exchangeData.js',
    ];
    $updatedFiles = [];
    foreach ($targetFiles as $targetFile) {
        if (is_dir(dirname($targetFile))) {
            @file_put_contents($targetFile, $jsContent);
            $updatedFiles[] = $targetFile;
        }
    }

    return ['success' => true, 'updated_files' => $updatedFiles, 'count' => count($items)];
}

function sync_quiz_part_to_firestore(PDO $db, string $partSlug): bool
{
    $stmt = $db->prepare('SELECT * FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
    $stmt->execute([$partSlug, $partSlug]);
    $part = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$part) {
        return false;
    }

    $slug = (string) ($part['slug'] ?: $part['id']);
    $subjectId = canonicalQuizSubjectSlug((string) ($part['subject_id'] ?: ($part['source_subject_id'] ?? '')));
    $titleEn = $part['title_en'] ?? ($part['name_en'] ?? ($part['title'] ?? ($part['name'] ?? '')));
    $titleAr = $part['name'] ?? ($part['title'] ?? ($part['title_en'] ?? ''));

    return firestoreUpsertDoc('quiz_parts', $slug, [
        'id' => $slug,
        'subjectId' => $subjectId,
        'title' => $titleEn,
        'titleAr' => $titleAr,
        'durationMinutes' => (int) ($part['duration_minutes'] ?: 30),
        'passMark' => (float) ($part['pass_mark'] ?: 60),
        'forceEnglish' => !empty($part['force_english']),
        'status' => $part['status'] ?? 'active',
        'updatedAt' => date('c'),
    ]);
}

function sync_quiz_subject_to_firestore(PDO $db, string $subjectId): bool
{
    $stmt = $db->prepare('SELECT * FROM quiz_subjects WHERE id = ? LIMIT 1');
    $stmt->execute([$subjectId]);
    $subject = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$subject) {
        return false;
    }

    return firestoreUpsertDoc('quiz_subjects', (string) $subject['id'], [
        'id' => (string) $subject['id'],
        'name' => (string) ($subject['name_en'] ?? $subject['name'] ?? ''),
        'nameAr' => (string) ($subject['name'] ?? $subject['name_en'] ?? ''),
        'icon' => (string) ($subject['icon'] ?? 'book'),
        'updatedAt' => date('c'),
    ]);
}

function canonicalQuizSubjectSlug(string $subjectSlug): string
{
    return match (trim($subjectSlug)) {
        'organism-oriented_programming_laboratory' => 'oop_lab',
        default => trim($subjectSlug),
    };
}

function sync_quiz_question_to_firestore(PDO $db, int $questionId): bool
{
    $stmt = $db->prepare('SELECT * FROM quiz_questions WHERE id = ? LIMIT 1');
    $stmt->execute([$questionId]);
    $question = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$question) {
        return false;
    }

    $partSlug = trim((string) ($question['part_slug'] ?: ($question['source_part_id'] ?: ($question['part_id'] ?? ''))));
    $subjectSlug = canonicalQuizSubjectSlug((string) ($question['subject_slug'] ?: ($question['source_subject_id'] ?? '')));
    if ($partSlug === '') {
        return false;
    }

    // Questions imported from older exports can retain a legacy subject slug.
    // The part's current subject is the authoritative relationship used by the site.
    $partSubjectStmt = $db->prepare('SELECT subject_id, source_subject_id FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
    $partSubjectStmt->execute([$partSlug, $question['part_id'] ?? $partSlug]);
    $partSubject = $partSubjectStmt->fetch(PDO::FETCH_ASSOC);
    $subjectSlug = canonicalQuizSubjectSlug((string) (($partSubject['subject_id'] ?? '') ?: ($partSubject['source_subject_id'] ?? $subjectSlug)));

    $options = normalizeQuizOptions(json_decode((string) ($question['options_json'] ?? ''), true));
    return firestoreUpsertDoc('quiz_questions', $partSlug . '_' . $questionId, [
        'id' => (string) $questionId,
        'partId' => $partSlug,
        'subjectId' => $subjectSlug,
        'type' => $question['type'] ?: ($question['question_type'] ?: 'mcq'),
        'questionAr' => $question['text_ar'] ?: ($question['question_text'] ?: ''),
        'questionEn' => $question['text_en'] ?: ($question['question_text_en'] ?: ''),
        'options' => is_array($options) ? $options : [],
        'correctAnswer' => $question['correct_answer'] ?? '',
        'marks' => (float) ($question['points'] ?: ($question['marks'] ?: 1)),
        'codeBlock' => $question['code'] ?: ($question['code_block'] ?: null),
        'image' => $question['image_url'] ?: null,
        'updatedAt' => date('c'),
    ]);
}

function firestoreSyncQuestionToFirestore(PDO $db, ?array $question): bool
{
    if (!$question) {
        return false;
    }
    return sync_quiz_question_to_firestore($db, (int) $question['id']);
}

function delete_quiz_part_from_firestore(PDO $db, string $partSlug): bool
{
    $partSlug = trim($partSlug);
    if ($partSlug === '') {
        return true;
    }

    $partStmt = $db->prepare('SELECT id, slug FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
    $partStmt->execute([$partSlug, $partSlug]);
    $part = $partStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $numericPartId = (string) ($part['id'] ?? '');
    $resolvedSlug = (string) (($part['slug'] ?? '') ?: ($part['id'] ?? $partSlug));

    $questionStmt = $db->prepare('SELECT id, part_id, part_slug, source_part_id FROM quiz_questions WHERE part_slug = ? OR source_part_id = ? OR part_id = ?');
    $questionStmt->execute([$resolvedSlug, $resolvedSlug, $numericPartId !== '' ? $numericPartId : $partSlug]);
    $questions = $questionStmt->fetchAll(PDO::FETCH_ASSOC);

    $ok = firestoreDeleteDoc('quiz_parts', $resolvedSlug);
    foreach ($questions as $question) {
        $questionPartSlug = trim((string) ($question['part_slug'] ?: ($question['source_part_id'] ?: $resolvedSlug)));
        $questionDocId = $questionPartSlug . '_' . (string) $question['id'];
        $ok = firestoreDeleteDoc('quiz_questions', $questionDocId) && $ok;
    }

    return $ok;
}

function normalizeQuizOptions(mixed $options): array
{
    if (!is_array($options)) {
        return [];
    }

    $normalized = [];
    foreach (array_values($options) as $index => $option) {
        if (!is_array($option)) {
            continue;
        }
        $text = (string) ($option['text'] ?? '');
        $normalized[] = [
            'id' => (string) ($option['id'] ?? chr(65 + $index)),
            'text' => $text,
            'textAr' => (string) ($option['textAr'] ?? $text),
            'textEn' => (string) ($option['textEn'] ?? $text),
            'correct' => !empty($option['correct']),
        ];
    }
    return $normalized;
}

function sync_quizzes_to_frontend(?PDO $db = null, bool $syncFirestore = false): array
{
    if ($db === null) {
        $db = get_db();
    }
    $GLOBALS['firestore_sync_failed'] = false;

    $baseDir = dirname(__DIR__);
    $targetFiles = [
        $baseDir . '/../Makanak Al-Jami\'i/src/data/quizData.js',
        $baseDir . '/Makanak Al-Jami\'i/src/data/quizData.js',
        $baseDir . '/mt-bau-full/src/data/quizData.js',
        $baseDir . '/koon.quiz/src/data/quizData.js',
    ];

    // 1. جلب المواد (Subjects)
    $subjectsStmt = $db->query("SELECT * FROM quiz_subjects ORDER BY sort_order ASC, id ASC");
    $dbSubjects = $subjectsStmt->fetchAll(PDO::FETCH_ASSOC);

    // 2. جلب الأجزاء (Parts)
    $partsStmt = $db->query("SELECT * FROM quiz_parts ORDER BY sort_order ASC, id ASC");
    $dbParts = $partsStmt->fetchAll(PDO::FETCH_ASSOC);
    $partSlugMap = [];
    foreach ($dbParts as $p) {
        $partSlugMap[(string) ($p['id'] ?? '')] = (string) ($p['slug'] ?: (string) ($p['id'] ?? ''));
    }

    // 3. جلب الأسئلة (Questions)
    $questionsStmt = $db->query("SELECT * FROM quiz_questions ORDER BY sort_order ASC, id ASC");
    $dbQuestions = $questionsStmt->fetchAll(PDO::FETCH_ASSOC);

    // تنظيم الأسئلة حسب الـ part_slug
    $questionsByPart = [];
    foreach ($dbQuestions as $q) {
        $partKey = trim((string) ($q['part_slug'] ?: ($q['source_part_id'] ?: ($partSlugMap[(string) ($q['part_id'] ?? '')] ?? (string) ($q['part_id'] ?? '')))));
        if ($partKey === '') {
            continue;
        }
        if (!isset($questionsByPart[$partKey])) {
            $questionsByPart[$partKey] = [];
        }

        $options = [];
        if (!empty($q['options_json'])) {
            $decoded = json_decode($q['options_json'], true);
            if (is_array($decoded)) {
                $options = $decoded;
            }
        }

        $item = [
            'id' => (int) $q['id'],
            'type' => $q['type'] ?: ($q['question_type'] ?: 'mcq'),
            'questionAr' => $q['text_ar'] ?: ($q['question_text'] ?: ''),
            'questionEn' => $q['text_en'] ?: ($q['question_text_en'] ?: ''),
            'options' => $options,
            'correctAnswer' => $q['correct_answer'] ?? '',
            'marks' => (float) ($q['points'] ?: ($q['marks'] ?: 1)),
        ];

        if (!empty($q['code']) || !empty($q['code_block'])) {
            $item['code'] = $q['code'] ?: $q['code_block'];
        }
        if (!empty($q['explanation_ar']) || !empty($q['explanation'])) {
            $item['explanationAr'] = $q['explanation_ar'] ?: $q['explanation'];
        }
        if (!empty($q['model_answer'])) {
            $item['modelAnswer'] = $q['model_answer'];
        }
        if (!empty($q['image_url'])) {
            $item['imageUrl'] = $q['image_url'];
        }

        $questionsByPart[$partKey][] = $item;
    }

    // بناء كائن quizData
    $quizDataObj = [];
    $partsBySubject = [];

    foreach ($dbParts as $p) {
        $partSlug = $p['slug'] ?: (string) $p['id'];
        $subId = $p['subject_id'] ?: ($p['source_subject_id'] ?? '');

        $titleEn = $p['title_en'] ?? ($p['name_en'] ?? ($p['title'] ?? ($p['name'] ?? '')));
        $titleAr = $p['name'] ?? ($p['title'] ?? ($p['title_en'] ?? ''));

        if (!isset($partsBySubject[$subId])) {
            $partsBySubject[$subId] = [];
        }
        $partsBySubject[$subId][] = [
            'id' => $partSlug,
            'title' => $titleEn,
            'titleAr' => $titleAr,
        ];

        $quizDataObj[$partSlug] = [
            'id' => $partSlug,
            'title' => $titleEn,
            'titleAr' => $titleAr,
            'icon' => $p['icon'] ?? '📝',
            'color' => $p['color'] ?? '#2196F3',
            'forceEnglish' => !empty($p['force_english']),
            'questions' => $questionsByPart[$partSlug] ?? [],
        ];
    }

    // بناء مصفوفة quizCategories
    $quizCategoriesArr = [];
    foreach ($dbSubjects as $s) {
        $subId = $s['id'];
        $nameEn = $s['name_en'] ?? ($s['name'] ?? '');
        $nameAr = $s['name'] ?? ($s['name_en'] ?? '');

        $quizCategoriesArr[] = [
            'id' => $subId,
            'name' => $nameEn,
            'nameAr' => $nameAr,
            'icon' => $s['icon'] ?? '📚',
            'parts' => $partsBySubject[$subId] ?? [],
        ];
    }

    // توليد ملف JavaScript
    $jsContent = "// =============================================================================\n";
    $jsContent .= "// Auto-generated by Makanak Live Sync System\n";
    $jsContent .= "// Generated at: " . date('Y-m-d H:i:s') . "\n";
    $jsContent .= "// =============================================================================\n\n";

    $jsContent .= "export const quizData = " . json_encode($quizDataObj, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . ";\n\n";
    $jsContent .= "export const quizCategories = " . json_encode($quizCategoriesArr, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . ";\n";

    $updatedFiles = [];
    foreach ($targetFiles as $targetFile) {
        if (is_dir(dirname($targetFile))) {
            @file_put_contents($targetFile, $jsContent);
            $updatedFiles[] = $targetFile;
        }
    }

    if ($syncFirestore) {
        // مزامنة سحابية مع Firebase Firestore — اختيارية فقط لأن هذه الطلبات قد تبطئ واجهة الإدارة
        try {
            foreach ($dbSubjects as $s) {
                $subId = (string) $s['id'];
                firestoreUpsertDoc('quiz_subjects', $subId, [
                    'id' => $subId,
                    'name' => $s['name_en'] ?? ($s['name'] ?? ''),
                    'nameAr' => $s['name'] ?? ($s['name_en'] ?? ''),
                    'icon' => $s['icon'] ?? '💻',
                    'color' => '#2196F3',
                    'updatedAt' => date('c'),
                ]);
            }

            foreach ($dbParts as $p) {
                $partSlug = (string) ($p['slug'] ?: (string) $p['id']);
                $subId = (string) ($p['subject_id'] ?: ($p['source_subject_id'] ?? ''));
                $titleEn = $p['title_en'] ?? ($p['name_en'] ?? ($p['title'] ?? ($p['name'] ?? '')));
                $titleAr = $p['name'] ?? ($p['title'] ?? ($p['title_en'] ?? ''));

                firestoreUpsertDoc('quiz_parts', $partSlug, [
                    'id' => $partSlug,
                    'subjectId' => $subId,
                    'title' => $titleEn,
                    'titleAr' => $titleAr,
                    'durationMinutes' => (int) ($p['duration_minutes'] ?: 30),
                    'passMark' => (float) ($p['pass_mark'] ?: 60),
                    'forceEnglish' => !empty($p['force_english']),
                    'status' => $p['status'] ?? 'active',
                    'updatedAt' => date('c'),
                ]);
            }

            foreach ($dbQuestions as $q) {
                $partKey = trim((string) ($q['part_slug'] ?: ($q['source_part_id'] ?: ($partSlugMap[(string) ($q['part_id'] ?? '')] ?? (string) ($q['part_id'] ?? '')))));
                $subKey = trim((string) ($q['subject_slug'] ?: ($q['source_subject_id'] ?? '')));
                if ($partKey === '') {
                    continue;
                }
                $qId = (string) $q['id'];
                $docId = "{$partKey}_{$qId}";

                $options = normalizeQuizOptions(json_decode((string) ($q['options_json'] ?? ''), true));

                $qDoc = [
                    'id' => $qId,
                    'partId' => $partKey,
                    'subjectId' => $subKey,
                    'type' => $q['type'] ?: ($q['question_type'] ?: 'mcq'),
                    'questionAr' => $q['text_ar'] ?: ($q['question_text'] ?: ''),
                    'questionEn' => $q['text_en'] ?: ($q['question_text_en'] ?: ''),
                    'options' => $options,
                    'correctAnswer' => $q['correct_answer'] ?? '',
                    'marks' => (float) ($q['points'] ?: ($q['marks'] ?: 1)),
                    'codeBlock' => $q['code'] ?: ($q['code_block'] ?: null),
                    'image' => $q['image_url'] ?: null,
                    'updatedAt' => date('c'),
                ];

                firestoreUpsertDoc('quiz_questions', $docId, $qDoc);
            }
        } catch (\Throwable $e) {
            // Silent error — local file updates remain authoritative for admin page
        }
    }

    return [
        'success' => true,
        'updated_files' => $updatedFiles,
        'subjects_count' => count($dbSubjects),
        'parts_count' => count($dbParts),
        'questions_count' => count($dbQuestions),
        'firestore_synced' => $syncFirestore && empty($GLOBALS['firestore_sync_failed']),
    ];
}

/**
 * مزامنة التقييمات والآراء مع Firestore
 */
function sync_reviews_to_firestore(?PDO $db = null): array
{
    if ($db === null) {
        $db = get_db();
    }
    $stmt = $db->query("SELECT * FROM feedback_reviews WHERE is_approved = 1 ORDER BY id DESC LIMIT 50");
    $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $synced = 0;
    foreach ($reviews as $r) {
        $docId = 'rev_' . (int) $r['id'];
        $ok = firestoreUpsertDoc('testimonials', $docId, [
            'id' => $docId,
            'author' => (string) ($r['student_name'] ?? 'طالب'),
            'name' => (string) ($r['student_name'] ?? 'طالب'),
            'quote' => (string) ($r['content'] ?? ''),
            'message' => (string) ($r['content'] ?? ''),
            'major' => (string) ($r['faculty'] ?? 'عام'),
            'role' => (string) ($r['title'] ?? 'تقييم'),
            'rating' => (int) ($r['rating'] ?? 5),
            'approved' => true,
            'status' => 'approved',
            'pinned' => !empty($r['is_pinned']),
            'createdAt' => (string) ($r['created_at'] ?? date('c')),
            'updatedAt' => date('c')
        ]);
        if ($ok)
            $synced++;
    }

    return ['success' => true, 'count' => $synced];
}

/**
 * مزامنة المنسقين مع Firestore
 */
function sync_coordinators_to_firestore(?PDO $db = null): array
{
    if ($db === null) {
        $db = get_db();
    }
    $stmt = $db->query("SELECT * FROM coordinators ORDER BY id ASC");
    $coords = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $synced = 0;
    foreach ($coords as $c) {
        $docId = 'coord_' . (int) $c['id'];
        $ok = firestoreUpsertDoc('coordinators', $docId, [
            'id' => $docId,
            'local_id' => (int) $c['id'],
            'name' => (string) ($c['name'] ?? ''),
            'nameAr' => (string) ($c['name'] ?? ''),
            'phone' => (string) ($c['phone'] ?? ''),
            'gender' => (string) ($c['gender'] ?? 'male'),
            'faculty' => (string) ($c['faculty'] ?? ''),
            'major' => (string) ($c['major'] ?? ''),
            'role' => (string) ($c['role_type'] ?? 'coordinator'),
            'bio' => (string) ($c['bio'] ?? ''),
            'active' => true,
            'is_active' => 1,
            'tasks_completed' => (int) ($c['tasks_completed'] ?? 0),
            'updatedAt' => date('c')
        ]);
        if ($ok)
            $synced++;
    }

    return ['success' => true, 'count' => $synced];
}

/**
 * مزامنة جميع الأسئلة والاختبارات إلى Firestore السحابية (الموقع الرسمي)
 */
function sync_all_quizzes_to_firestore(?PDO $db = null, ?string $partSlugFilter = null): array
{
    if ($db === null) {
        $db = get_db();
    }
    $syncedSubjects = 0;
    $syncedParts = 0;
    $syncedQuestions = 0;

    // 1. مزامنة المواد
    try {
        $subjects = $db->query("SELECT id FROM quiz_subjects")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($subjects as $sId) {
            if (sync_quiz_subject_to_firestore($db, (string) $sId)) {
                $syncedSubjects++;
            }
        }
    } catch (Throwable $e) {
    }

    // 2. مزامنة أجزاء الاختبارات
    try {
        if ($partSlugFilter !== null && $partSlugFilter !== '') {
            $partsStmt = $db->prepare("SELECT slug, id FROM quiz_parts WHERE slug = ? OR id = ?");
            $partsStmt->execute([$partSlugFilter, $partSlugFilter]);
        } else {
            $partsStmt = $db->query("SELECT slug, id FROM quiz_parts");
        }
        $parts = $partsStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($parts as $p) {
            $pSlug = (string) ($p['slug'] ?: $p['id']);
            if (sync_quiz_part_to_firestore($db, $pSlug)) {
                $syncedParts++;
            }
        }
    } catch (Throwable $e) {
    }

    // 3. مزامنة الأسئلة
    try {
        if ($partSlugFilter !== null && $partSlugFilter !== '') {
            $qStmt = $db->prepare("SELECT id FROM quiz_questions WHERE part_slug = ? OR part_id = ? OR source_part_id = ?");
            $qStmt->execute([$partSlugFilter, $partSlugFilter, $partSlugFilter]);
        } else {
            $qStmt = $db->query("SELECT id FROM quiz_questions");
        }
        $qIds = $qStmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($qIds as $qId) {
            if (sync_quiz_question_to_firestore($db, (int) $qId)) {
                $syncedQuestions++;
            }
        }
    } catch (Throwable $e) {
    }

    return [
        'success' => true,
        'subjects' => $syncedSubjects,
        'parts' => $syncedParts,
        'questions' => $syncedQuestions,
    ];
}

/**
 * جلب طلبات التبرع بالمواد من Firestore إلى SQLite
 * تُحفظ بحالة 'pending' لتظهر في جدول الطلبات المنتظرة بانتظار موافقة الإدارة
 */
function pull_pending_donations_from_firestore(?PDO $db = null): int
{
    if ($db === null) {
        $db = get_db();
    }

    $token = firestoreServiceToken();
    $url = FS_API_BASE . 'materialDonations?pageSize=300' . ($token ? '' : '?key=' . urlencode(FS_API_KEY));
    $headers = firestoreRequestHeaders();

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);

    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return 0;
    }

    $payload = json_decode($response, true);
    if (!is_array($payload) || empty($payload['documents'])) {
        return 0;
    }

    foreach ([
        'donor_phone_alt' => 'TEXT',
        'donor_email' => 'TEXT',
        'delivery_week' => 'TEXT',
        'firestore_id' => 'TEXT',
        'data_sharing_consent' => 'INTEGER'
    ] as $col => $type) {
        $cols = $db->query('PRAGMA table_info(material_exchanges)')->fetchAll(PDO::FETCH_COLUMN, 1);
        if (!in_array($col, $cols, true)) {
            $db->exec("ALTER TABLE material_exchanges ADD COLUMN $col $type");
        }
    }

    $stmtCheck = $db->prepare('SELECT id, status FROM material_exchanges WHERE firestore_id = ? AND material_name = ? LIMIT 1');
    $stmtCheckFallback = $db->prepare('SELECT id, status FROM material_exchanges WHERE donor_phone = ? AND material_name = ? AND created_at = ? LIMIT 1');

    $stmtInsert = $db->prepare('INSERT INTO material_exchanges (
        donor_name, donor_phone, donor_phone_alt, donor_email, donor_gender,
        material_name, description, delivery_week, status,
        assigned_coordinator, delivery_status, firestore_id, data_sharing_consent, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

    $stmtUpdate = $db->prepare('UPDATE material_exchanges SET 
        donor_name = ?, donor_phone_alt = ?, donor_email = ?, delivery_week = ?, description = ?,
        status = ?, booker_name = ?, booker_phone = ?, booker_gender = ?, booked_at = ?,
        data_sharing_consent = ?,
        delivery_status = CASE WHEN ? = \'completed\' THEN \'completed\' WHEN ? = \'reserved\' THEN \'scheduled\' ELSE delivery_status END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = ?');

    $importedCount = 0;

    foreach ($payload['documents'] as $doc) {
        $docId = basename($doc['name']);
        // تجاهل المواد المعكوسة من لوحة التحكم التي تبدأ بـ donation_
        if (str_starts_with($docId, 'donation_')) {
            continue;
        }

        $fields = $doc['fields'] ?? [];
        // تجاهل المحذوفة
        if (!empty($fields['deleted']['booleanValue'])) {
            continue;
        }

        $studentName = trim((string) ($fields['studentName']['stringValue'] ?? 'طالب'));
        $phoneNumber = trim((string) ($fields['phoneNumber']['stringValue'] ?? ''));
        $confirmPhone = trim((string) ($fields['confirmPhoneNumber']['stringValue'] ?? ($fields['alternatePhone']['stringValue'] ?? '')));
        $email = trim((string) ($fields['email']['stringValue'] ?? ''));
        $gender = trim((string) ($fields['studentGender']['stringValue'] ?? 'male'));
        $gender = in_array($gender, ['male', 'female'], true) ? $gender : 'male';

        $deliveryWeek = trim((string) ($fields['deliveryWeek']['stringValue'] ?? ''));
        $deliveryWeekCustom = trim((string) ($fields['deliveryWeekCustom']['stringValue'] ?? ''));
        if ($deliveryWeekCustom !== '' && $deliveryWeek !== $deliveryWeekCustom) {
            $deliveryWeek = $deliveryWeek !== '' ? $deliveryWeek . ' (' . $deliveryWeekCustom . ')' : $deliveryWeekCustom;
        }

        $docStatus = trim((string) ($fields['status']['stringValue'] ?? 'pending'));
        if (!in_array($docStatus, ['pending', 'approved', 'reserved', 'completed'], true)) {
            $docStatus = 'pending';
        }

        $createdAtRaw = $fields['createdAt']['timestampValue'] ?? ($doc['createTime'] ?? date('c'));
        try {
            $createdAt = (new DateTimeImmutable((string) $createdAtRaw))->format('Y-m-d H:i:s');
        } catch (Throwable) {
            $createdAt = date('Y-m-d H:i:s');
        }

        $materialsList = $fields['materials']['arrayValue']['values'] ?? [];
        if (empty($materialsList)) {
            continue;
        }

        foreach ($materialsList as $mItem) {
            $mFields = $mItem['mapValue']['fields'] ?? [];
            $matName = trim((string) ($mFields['name']['stringValue'] ?? ''));
            if ($matName === '') {
                continue;
            }
            $matDesc = trim((string) ($mFields['description']['stringValue'] ?? ''));
            $matStatus = trim((string) ($mFields['status']['stringValue'] ?? ''));
            $finalStatus = in_array($matStatus, ['pending', 'approved', 'reserved', 'completed'], true) ? $matStatus : $docStatus;
            $consentValue = null;
            if (isset($mFields['takerInfo']['mapValue']['fields']['dataSharingConsent']['booleanValue'])) {
                $consentValue = $mFields['takerInfo']['mapValue']['fields']['dataSharingConsent']['booleanValue'] ? 1 : 0;
            } elseif (isset($fields['dataSharingConsent']['booleanValue'])) {
                $consentValue = $fields['dataSharingConsent']['booleanValue'] ? 1 : 0;
            }

            // التحقق من وجود السجل مسبقاً
            $stmtCheck->execute([$docId, $matName]);
            $existing = $stmtCheck->fetch(PDO::FETCH_ASSOC);

            if (!$existing && $phoneNumber !== '') {
                $stmtCheckFallback->execute([$phoneNumber, $matName, $createdAt]);
                $existing = $stmtCheckFallback->fetch(PDO::FETCH_ASSOC);
            }

            if ($existing) {
                // تحديث الحالة وبيانات الحاجز أيضاً، لأن الحجز قد يتم من الموقع مباشرة.
                $takerFields = $mFields['takerInfo']['mapValue']['fields'] ?? [];
                $takerValue = static function (string $key) use ($takerFields): string {
                    return trim((string) ($takerFields[$key]['stringValue'] ?? ''));
                };
                $bookerName = $takerValue('name') ?: $takerValue('studentName');
                $bookerPhone = $takerValue('phone') ?: $takerValue('studentPhone');
                $bookerGender = $takerValue('gender') ?: $gender;
                $bookedAt = $takerValue('bookedAt');
                $stmtUpdate->execute([
                    $studentName,
                    $confirmPhone,
                    $email,
                    $deliveryWeek,
                    $matDesc,
                    $finalStatus,
                    $bookerName !== '' ? $bookerName : null,
                    $bookerPhone !== '' ? $bookerPhone : null,
                    $bookerGender,
                    $bookedAt !== '' ? $bookedAt : null,
                    $consentValue,
                    $finalStatus,
                    $finalStatus,
                    (int) $existing['id']
                ]);
            } else {
                // إدراج طلب جديد بحالة pending
                $stmtInsert->execute([
                    $studentName,
                    $phoneNumber,
                    $confirmPhone,
                    $email,
                    $gender,
                    $matName,
                    $matDesc,
                    $deliveryWeek,
                    $finalStatus,
                    'shared', // افتراضياً في المشترك لحين موافقة وتوجيه الأدمن
                    'pending_contact',
                    $docId,
                    $consentValue,
                    $createdAt,
                    $createdAt
                ]);
                $importedCount++;
            }
        }
    }

    return $importedCount;
}

/**
 * تحديث حالة المادة المتبرع بها إلى approved في Firestore عند موافقة الأدمن
 */
function mark_donation_approved_in_firestore(string $firestoreId, string $materialName): bool
{
    if ($firestoreId === '' || str_starts_with($firestoreId, 'donation_')) {
        return false;
    }
    $url = FS_API_BASE . 'materialDonations/' . rawurlencode($firestoreId);
    $headers = firestoreRequestHeaders();

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    if (!$res)
        return false;
    $doc = json_decode($res, true);
    if (!is_array($doc) || empty($doc['fields']))
        return false;

    $fields = $doc['fields'];
    $fields['status'] = ['stringValue' => 'approved'];
    if (!empty($fields['materials']['arrayValue']['values'])) {
        foreach ($fields['materials']['arrayValue']['values'] as &$mVal) {
            $mFields = &$mVal['mapValue']['fields'];
            if (trim((string) ($mFields['name']['stringValue'] ?? '')) === $materialName) {
                $mFields['status'] = ['stringValue' => 'approved'];
            }
        }
        unset($mVal);
    }

    $patchContext = stream_context_create([
        'http' => [
            'method' => 'PATCH',
            'header' => $headers,
            'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);
    $patchRes = @file_get_contents($url, false, $patchContext);
    return $patchRes !== false;
}

/**
 * تحديث حالة المادة المتبرع بها إلى reserved في Firestore عند حجزها داخلياً من لوحة التحكم
 * هذا يحل مشكلة ظهور المادة كمتاحة على الموقع بعد حجزها من الأدمن
 */
function mark_donation_reserved_in_firestore(string $firestoreId, string $materialName, array $bookerInfo = []): bool
{
    if ($firestoreId === '' || str_starts_with($firestoreId, 'donation_')) {
        return false;
    }

    $url = FS_API_BASE . 'materialDonations/' . rawurlencode($firestoreId);
    $headers = firestoreRequestHeaders();

    // جلب المستند الأصلي أولاً
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    if (!$res)
        return false;
    $doc = json_decode($res, true);
    if (!is_array($doc) || empty($doc['fields']))
        return false;

    $fields = $doc['fields'];
    $foundMaterial = false;

    // تحديث حالة المادة المحددة داخل مصفوفة materials
    if (!empty($fields['materials']['arrayValue']['values'])) {
        foreach ($fields['materials']['arrayValue']['values'] as &$mVal) {
            $mFields = &$mVal['mapValue']['fields'];
            $mName = trim((string) ($mFields['name']['stringValue'] ?? ''));
            if ($mName === $materialName) {
                $mFields['status'] = ['stringValue' => 'reserved'];
                // إضافة بيانات الحاجز إلى takerInfo
                if (!empty($bookerInfo)) {
                    $takerFields = [];
                    foreach ($bookerInfo as $k => $v) {
                        $takerFields[$k] = ['stringValue' => (string) $v];
                    }
                    $mFields['takerInfo'] = ['mapValue' => ['fields' => $takerFields]];
                }
                $foundMaterial = true;
            }
        }
        unset($mVal);
    }

    if (!$foundMaterial) {
        return false; // لم نجد المادة في المصفوفة
    }

    // التحقق إذا كانت كل المواد محجوزة أو مكتملة → تحديث حالة المستند الكلي
    $allReserved = true;
    foreach ($fields['materials']['arrayValue']['values'] as $mVal) {
        $mStatus = $mVal['mapValue']['fields']['status']['stringValue'] ?? 'pending';
        if (!in_array($mStatus, ['reserved', 'completed'], true)) {
            $allReserved = false;
            break;
        }
    }
    if ($allReserved) {
        $fields['status'] = ['stringValue' => 'reserved'];
    }

    $fields['lastUpdated'] = ['timestampValue' => date('c')];

    // إرسال التحديث إلى Firestore
    $patchContext = stream_context_create([
        'http' => [
            'method' => 'PATCH',
            'header' => $headers,
            'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $patchRes = @file_get_contents($url, false, $patchContext);
    return $patchRes !== false;
}

/**
 * إلغاء حجز المادة وإعادتها كمتاحة (approved) في Firestore
 * يحذف takerInfo ويعيد حالة المادة إلى approved
 */
function mark_donation_unreserved_in_firestore(string $firestoreId, string $materialName): bool
{
    if ($firestoreId === '' || str_starts_with($firestoreId, 'donation_')) {
        return false;
    }

    $url = FS_API_BASE . 'materialDonations/' . rawurlencode($firestoreId);
    $headers = firestoreRequestHeaders();

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 4,
            'ignore_errors' => true,
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    if (!$res)
        return false;
    $doc = json_decode($res, true);
    if (!is_array($doc) || empty($doc['fields']))
        return false;

    $fields = $doc['fields'];
    $foundMaterial = false;

    if (!empty($fields['materials']['arrayValue']['values'])) {
        foreach ($fields['materials']['arrayValue']['values'] as &$mVal) {
            $mFields = &$mVal['mapValue']['fields'];
            $mName = trim((string) ($mFields['name']['stringValue'] ?? ''));
            if ($mName === $materialName) {
                $mFields['status'] = ['stringValue' => 'approved'];
                unset($mFields['takerInfo']); // حذف معلومات الحاجز
                $foundMaterial = true;
            }
        }
        unset($mVal);
    }

    if (!$foundMaterial) {
        return false;
    }

    // إعادة حالة المستند الرئيسي إلى approved
    $fields['status'] = ['stringValue' => 'approved'];
    $fields['lastUpdated'] = ['timestampValue' => date('c')];

    $patchContext = stream_context_create([
        'http' => [
            'method' => 'PATCH',
            'header' => $headers,
            'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $patchRes = @file_get_contents($url, false, $patchContext);
    return $patchRes !== false;
}



/**
 * حذف مادة من Firestore فوراً وإخفائها من الموقع
 * إذا كانت المادة هي الوحيدة في مستند التبرع، يتم حذف المستند كاملاً
 * وإذا كان المستند يحتوي مواد أخرى، يتم إزالة المادة المحددة منه
 */
function delete_material_from_firestore(?string $firestoreId, string $materialName, int $localId, ?PDO $db = null): bool
{
    // حذف المستند المنعكس donation_{id} إن وجد
    if ($localId > 0) {
        firestoreDeleteDoc('materialDonations', 'donation_' . $localId);
    }

    if (empty($firestoreId) || str_starts_with($firestoreId, 'donation_')) {
        return true;
    }

    // فحص ما إذا كانت هناك مواد أخرى تشارك نفس مستند Firestore في قاعدة البيانات
    $hasOtherMaterials = false;
    if ($db instanceof PDO) {
        $stmtCheck = $db->prepare('SELECT COUNT(*) FROM material_exchanges WHERE firestore_id = ? AND id != ?');
        $stmtCheck->execute([$firestoreId, $localId]);
        $hasOtherMaterials = ((int) $stmtCheck->fetchColumn()) > 0;
    }

    // إذا لم تكن هناك مواد أخرى، نحذف المستند كاملاً من Firestore فوراً
    if (!$hasOtherMaterials) {
        return firestoreDeleteDoc('materialDonations', $firestoreId);
    }

    // إذا كانت هناك مواد أخرى في نفس التبرع، نفتح المستند ونحذف المادة من مصفوفة materials
    $url = firestoreRequestUrl('materialDonations/' . rawurlencode($firestoreId));
    $headers = firestoreRequestHeaders();
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    if (!$res)
        return false;
    $doc = json_decode($res, true);
    if (!is_array($doc) || empty($doc['fields']))
        return false;

    $fields = $doc['fields'];
    if (!empty($fields['materials']['arrayValue']['values'])) {
        $newVals = [];
        foreach ($fields['materials']['arrayValue']['values'] as $mVal) {
            $mFields = $mVal['mapValue']['fields'] ?? [];
            $mName = trim((string) ($mFields['name']['stringValue'] ?? ''));
            if ($mName !== $materialName) {
                $newVals[] = $mVal;
            }
        }
        $fields['materials']['arrayValue']['values'] = $newVals;
    }

    $fields['lastUpdated'] = ['timestampValue' => date('c')];
    $patchContext = stream_context_create([
        'http' => [
            'method' => 'PATCH',
            'header' => $headers,
            'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $patchRes = @file_get_contents($url, false, $patchContext);
    return $patchRes !== false;
}


/**
 * مزامنة تعديل بيانات وحالة المادة مع Firestore فوراً
 * يعكس أي تغيير في الحالة (approved, reserved, completed, cancelled) على الموقع مباشرة
 */
function sync_material_update_to_firestore(int $exchangeId, array $data, ?PDO $db = null): bool
{
    $firestoreId = trim((string) ($data['firestore_id'] ?? ''));
    $materialName = trim((string) ($data['material_name'] ?? ''));
    $oldMaterialName = trim((string) ($data['old_material_name'] ?? $materialName));
    $status = trim((string) ($data['status'] ?? 'approved'));

    // 1. تحديث المستند المنعكس donation_{id}
    if ($exchangeId > 0) {
        $docId = 'donation_' . $exchangeId;
        if ($status === 'cancelled' || $status === 'deleted') {
            firestoreDeleteDoc('materialDonations', $docId);
        } else {
            firestoreUpsertDoc('materialDonations', $docId, [
                'id' => $docId,
                'donorName' => (string) ($data['donor_name'] ?? ''),
                'materialName' => $materialName,
                'courseCode' => (string) ($data['course_code'] ?? ''),
                'faculty' => (string) ($data['faculty'] ?? 'عام'),
                'status' => $status,
                'bookerName' => (string) ($data['booker_name'] ?? ''),
                'bookerPhone' => (string) ($data['booker_phone'] ?? ''),
                'pickupDate' => (string) ($data['pickup_date'] ?? ''),
                'pickupTime' => (string) ($data['pickup_time'] ?? ''),
                'notes' => (string) ($data['notes'] ?? ''),
                'updatedAt' => date('c'),
            ]);
        }
    }

    // 2. تحديث المستند الأصلي في Firestore إن وجد
    if ($firestoreId === '' || str_starts_with($firestoreId, 'donation_')) {
        return true;
    }

    // إذا كانت الحالة ملغية، نحذف أو نخفي المادة من المستند الأصلي
    if ($status === 'cancelled' || $status === 'deleted') {
        return delete_material_from_firestore($firestoreId, $materialName, $exchangeId, $db);
    }

    $url = firestoreRequestUrl('materialDonations/' . rawurlencode($firestoreId));
    $headers = firestoreRequestHeaders();
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => $headers,
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    if (!$res)
        return false;
    $doc = json_decode($res, true);
    if (!is_array($doc) || empty($doc['fields']))
        return false;

    $fields = $doc['fields'];

    $foundMaterial = false;
    if (!empty($fields['materials']['arrayValue']['values'])) {
        foreach ($fields['materials']['arrayValue']['values'] as &$mVal) {
            $mFields = &$mVal['mapValue']['fields'];
            $mName = trim((string) ($mFields['name']['stringValue'] ?? ''));
            if ($mName === $oldMaterialName || ($oldMaterialName === '' && $mName === $materialName)) {
                $mFields['name'] = ['stringValue' => $materialName];
                $mFields['status'] = ['stringValue' => $status];
                $foundMaterial = true;
                if ($status === 'reserved') {
                    $mFields['takerInfo'] = [
                        'mapValue' => [
                            'fields' => [
                                'name' => ['stringValue' => (string) ($data['booker_name'] ?? '')],
                                'phone' => ['stringValue' => (string) ($data['booker_phone'] ?? '')],
                                'gender' => ['stringValue' => (string) ($data['booker_gender'] ?? 'male')],
                                'bookedAt' => ['timestampValue' => date('c')],
                                'source' => ['stringValue' => 'admin_panel'],
                            ]
                        ]
                    ];
                } elseif ($status === 'approved') {
                    unset($mFields['takerInfo']);
                }
            }
        }
        unset($mVal);
    }

    if (!$foundMaterial) {
        return false;
    }

    // تحديث حالة المستند الرئيسي
    $fields['status'] = ['stringValue' => $status];
    $fields['lastUpdated'] = ['timestampValue' => date('c')];

    $patchContext = stream_context_create([
        'http' => [
            'method' => 'PATCH',
            'header' => $headers,
            'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
            'timeout' => 5,
            'ignore_errors' => true,
        ]
    ]);
    $patchRes = @file_get_contents($url, false, $patchContext);
    return $patchRes !== false;
}
