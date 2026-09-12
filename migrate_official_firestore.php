<?php
declare(strict_types=1);

if (php_sapi_name() !== 'cli') {
    require_once __DIR__ . '/config.php';
    if (empty($_SESSION['authenticated'])) {
        http_response_code(403);
        die('Access denied.');
    }
}

// One-time import from the official Firebase project into this isolated admin database.
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/koon-609da/databases/(default)/documents/';
const DESTINATION_DB = __DIR__ . '/database.sqlite';
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

function firestoreValue(array $value): mixed
{
    if (array_key_exists('stringValue', $value))
        return $value['stringValue'];
    if (array_key_exists('integerValue', $value))
        return (int) $value['integerValue'];
    if (array_key_exists('doubleValue', $value))
        return (float) $value['doubleValue'];
    if (array_key_exists('booleanValue', $value))
        return (bool) $value['booleanValue'];
    if (array_key_exists('timestampValue', $value))
        return $value['timestampValue'];
    if (array_key_exists('nullValue', $value))
        return null;
    if (isset($value['arrayValue']['values']))
        return array_map('firestoreValue', $value['arrayValue']['values']);
    if (isset($value['mapValue']['fields'])) {
        $result = [];
        foreach ($value['mapValue']['fields'] as $key => $item)
            $result[$key] = firestoreValue($item);
        return $result;
    }
    return null;
}

function getCollection(string $collection): array
{
    $documents = [];
    $token = null;
    do {
        $url = FIRESTORE_BASE . rawurlencode($collection) . '?pageSize=1000';
        if ($token)
            $url .= '&pageToken=' . rawurlencode($token);
        $response = file_get_contents($url);
        if ($response === false)
            throw new RuntimeException("Could not read Firestore collection: $collection");
        $payload = json_decode($response, true, 512, JSON_THROW_ON_ERROR);
        foreach ($payload['documents'] ?? [] as $document) {
            $row = ['_id' => basename($document['name'])];
            foreach ($document['fields'] ?? [] as $key => $value)
                $row[$key] = firestoreValue($value);
            $documents[] = $row;
        }
        $token = $payload['nextPageToken'] ?? null;
    } while ($token);
    return $documents;
}

function text(mixed $value, string $fallback = ''): string
{
    return is_scalar($value) ? trim((string) $value) : $fallback;
}

function dateValue(mixed $value): ?string
{
    if (!$value)
        return null;
    try {
        return (new DateTimeImmutable((string) $value))->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return null;
    }
}

$db = new PDO('sqlite:' . DESTINATION_DB);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$backup = DESTINATION_DB . '.before-firestore-' . date('Ymd-His');
if (!copy(DESTINATION_DB, $backup))
    throw new RuntimeException('Could not create database backup');

$db->exec('BEGIN');
try {
    foreach (['contributions', 'feedback_reviews', 'page_views', 'service_requests', 'question_reports', 'notices'] as $table) {
        $db->exec("DELETE FROM $table");
    }
    // المنسقون بيانات أساسية: الاستيراد إضافي فقط ولا يحذف أو يستبدل السجلات المحلية.
    $insertCoordinator = $db->prepare('INSERT INTO coordinators (name, phone, gender, faculty, major, role_type, bio, is_active, joined_at, notes) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM coordinators WHERE (phone <> "" AND phone = ?) OR (phone = "" AND name = ?))');
    foreach (getCollection('volunteers') as $row) {
        $name = text($row['nameAr'] ?? null, text($row['nameEn'] ?? null, 'منسق'));
        $insertCoordinator->execute([
            $name,
            text($row['phone'] ?? null),
            text($row['gender'] ?? null, 'male'),
            text($row['faculty'] ?? null),
            text($row['major'] ?? null),
            text($row['role'] ?? null, 'coordinator'),
            text($row['bio'] ?? null),
            !array_key_exists('active', $row) || !empty($row['active']) ? 1 : 0,
            dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s'),
            text($row['email'] ?? null),
            text($row['phone'] ?? null),
            $name
        ]);
    }

    $insertContribution = $db->prepare('INSERT INTO contributions (student_name, subject_name, faculty, file_name, file_url, file_type, file_size, contribution_type, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (getCollection('quizContributions') as $row) {
        $insertContribution->execute([
            text($row['studentName'] ?? null, 'مساهم مجهول'),
            text($row['subjectName'] ?? null, 'عام'),
            'عام',
            text($row['fileName'] ?? null, 'External Link'),
            text($row['fileUrl'] ?? null),
            text($row['fileType'] ?? null, 'link'),
            (int) ($row['fileSize'] ?? 0),
            text($row['contributionType'] ?? null, 'unspecified'),
            text($row['status'] ?? null, 'pending'),
            dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s')
        ]);
    }

    $insertService = $db->prepare('INSERT INTO service_requests (student_name, student_phone, student_email, faculty, service_type, course_name, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (getCollection('service_requests') as $row) {
        $insertService->execute([
            text($row['studentName'] ?? null, 'طالب'),
            text($row['studentPhone'] ?? null, '-'),
            text($row['studentEmail'] ?? null),
            text($row['faculty'] ?? null, 'عام'),
            text($row['serviceId'] ?? null, 'summary'),
            text($row['subject'] ?? null),
            text($row['requestDetails'] ?? null, text($row['ideaDetails'] ?? null, text($row['serviceLabel'] ?? null))),
            text($row['status'] ?? null, 'new'),
            dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s')
        ]);
    }

    $insertMembership = $db->prepare('INSERT INTO membership_requests (applicant_name, phone, email, faculty, motivation, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (getCollection('coordinatorApplications') as $row) {
        $createdAt = dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s');
        $insertMembership->execute([
            text($row['name'] ?? null, 'متقدم غير معروف'),
            text($row['phoneNumber'] ?? null),
            text($row['email'] ?? null),
            'عام',
            text($row['motivation'] ?? null),
            text($row['status'] ?? null, 'pending'),
            $createdAt,
            $createdAt
        ]);
    }

    $insertReport = $db->prepare('INSERT INTO question_reports (reporter_name, reporter_contact, question_title, question_id, course_name, report_type, reason, details, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (getCollection('question_reports') as $row) {
        $insertReport->execute([
            text($row['reporterName'] ?? null, 'طالب'),
            text($row['reporterContact'] ?? null),
            text($row['questionTitle'] ?? null, 'بلاغ سؤال'),
            text($row['questionId'] ?? null),
            text($row['courseName'] ?? null),
            text($row['reportType'] ?? null, 'wrong_answer'),
            text($row['reason'] ?? null),
            text($row['details'] ?? null),
            text($row['status'] ?? null, 'pending'),
            dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s')
        ]);
    }

    $insertNotice = $db->prepare('INSERT INTO notices (title_ar, title_en, body_ar, body_en, notice_type, is_pinned, is_active, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (getCollection('notices') as $row) {
        $insertNotice->execute([
            text($row['titleAr'] ?? null, 'إعلان'),
            text($row['titleEn'] ?? null),
            text($row['bodyAr'] ?? null),
            text($row['bodyEn'] ?? null),
            text($row['type'] ?? null, 'info'),
            !empty($row['pinned']) ? 1 : 0,
            !empty($row['active']) ? 1 : 0,
            dateValue($row['expiresAt'] ?? null),
            dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s')
        ]);
    }

    $insertReview = $db->prepare('INSERT INTO feedback_reviews (student_name, student_email, faculty, rating, feedback_type, title, content, is_approved, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    foreach (getCollection('testimonials') as $row) {
        $insertReview->execute([
            text($row['author'] ?? null, 'طالب'),
            text($row['email'] ?? null),
            text($row['major'] ?? null, 'عام'),
            5,
            'review',
            text($row['role'] ?? null),
            text($row['quote'] ?? null),
            !empty($row['approved']) ? 1 : 0,
            text($row['status'] ?? null, 'new'),
            dateValue($row['createdAt'] ?? null) ?? date('Y-m-d H:i:s')
        ]);
    }
    foreach (getCollection('suggestions') as $row) {
        $insertReview->execute([
            text($row['name'] ?? null, 'طالب'),
            null,
            'عام',
            5,
            text($row['type'] ?? null, 'suggestion'),
            'اقتراح أو شكوى',
            text($row['message'] ?? null),
            0,
            text($row['status'] ?? null, 'new'),
            dateValue($row['timestamp'] ?? null) ?? date('Y-m-d H:i:s')
        ]);
    }

    $pageViews = [];
    foreach (getCollection('page_views') as $row) {
        $slug = text($row['path'] ?? null, '/');
        $pageViews[$slug] = ($pageViews[$slug] ?? 0) + 1;
    }
    $insertPage = $db->prepare('INSERT INTO page_views (page_name, slug, views_count, unique_visitors, category) VALUES (?, ?, ?, ?, ?)');
    foreach ($pageViews as $slug => $views)
        $insertPage->execute([$slug === '/' ? 'الرئيسية' : $slug, $slug, $views, $views, 'الموقع الرسمي']);

    $db->commit();
    echo "Imported successfully. Backup: $backup\n";
} catch (Throwable $error) {
    $db->rollBack();
    throw $error;
}