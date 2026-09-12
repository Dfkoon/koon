<?php
/**
 * admin/api_quick_search.php
 * API endpoint for Quick Search / Command Palette (Ctrl+K)
 */
require_once __DIR__ . '/../config.php';

header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['authenticated'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$db = get_db();
$query = trim($_GET['q'] ?? '');
$results = [];

$menu = require __DIR__ . '/_menu.php';

// 1. القائمة الافتراضية إذا كان البحث فارغاً (Quick Shortcuts)
if ($query === '') {
    $defaultPages = [
        ['title' => 'لوحة الإحصائيات العامة', 'subtitle' => 'المؤشرات والزيارات والطلبات', 'url' => 'stats.php', 'category' => 'أقسام النظام', 'badge' => 'الرئيسية'],
        ['title' => 'إدارة تبادل المواد والكتب', 'subtitle' => 'فرز الكتب ومتابعة التسليم للطلاب', 'url' => 'donations.php', 'category' => 'أقسام النظام', 'badge' => 'تبادل الكتب'],
        ['title' => 'فريق المنسقين المتطوعين', 'subtitle' => 'إدارة حسابات وصلاحيات المنسقين', 'url' => 'coordinators.php', 'category' => 'أقسام النظام', 'badge' => 'المنسقون'],
        ['title' => 'جدول مواعيد التسليم اليوم', 'subtitle' => 'عرض المواعيد المجدولة للتسليم في الحرم الجامعي', 'url' => 'donations.php?tab=schedule', 'category' => 'إجراءات سريعة', 'badge' => 'مواعيد'],
        ['title' => 'المهام والتكليفات', 'subtitle' => 'متابعة وتوزيع المهام على المنسقين', 'url' => 'tasks.php', 'category' => 'أقسام النظام', 'badge' => 'المهام'],
        ['title' => 'البلاغات والشكاوى', 'subtitle' => 'مراجعة بلاغات الأسئلة والتقييمات', 'url' => 'reports.php', 'category' => 'أقسام النظام', 'badge' => 'بلاغات'],
    ];

    echo json_encode(['status' => 'success', 'results' => $defaultPages], JSON_UNESCAPED_UNICODE);
    exit;
}

$searchTerm = '%' . $query . '%';

// 2. البحث في صفحات وأقسام لوحة التحكم
foreach ($menu as $item) {
    if (mb_stripos($item['label'], $query) !== false || mb_stripos($item['key'], $query) !== false) {
        $results[] = [
            'title' => $item['label'],
            'subtitle' => 'الانتقال المباشر إلى صفحة ' . $item['label'],
            'url' => $item['file'],
            'category' => 'صفحات وأقسام النظام',
            'badge' => 'قسم',
            'type' => 'page'
        ];
    }
}

// 3. البحث في مواد وكتب التبادل والتبرع (Material Exchanges)
try {
    $stmtEx = $db->prepare('SELECT id, material_name, course_code, donor_name, donor_phone, donor_gender, booker_name, booker_phone, status, assigned_coordinator 
        FROM material_exchanges 
        WHERE material_name LIKE ? OR course_code LIKE ? OR donor_name LIKE ? OR donor_phone LIKE ? OR booker_name LIKE ? OR booker_phone LIKE ?
        ORDER BY created_at DESC LIMIT 6');
    $stmtEx->execute([$searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm, $searchTerm]);
    $exchanges = $stmtEx->fetchAll(PDO::FETCH_ASSOC);

    $statusNames = [
        'approved' => 'متاح',
        'reserved' => 'محجوز',
        'completed' => 'تم التسليم',
        'pending' => 'قيد المراجعة',
        'cancelled' => 'ملغي'
    ];

    foreach ($exchanges as $ex) {
        $st = $statusNames[$ex['status']] ?? $ex['status'];
        $details = 'المتبرع: ' . ($ex['donor_name'] ?: 'غير محدد');
        if (!empty($ex['booker_name'])) {
            $details .= ' · المستلم: ' . $ex['booker_name'];
        }
        if (!empty($ex['course_code'])) {
            $details .= ' (' . $ex['course_code'] . ')';
        }
        $results[] = [
            'title' => $ex['material_name'],
            'subtitle' => $details,
            'url' => 'donations.php?q=' . urlencode($ex['material_name']),
            'category' => 'تبادل الكتب والتبرعات',
            'badge' => $st,
            'type' => 'exchange'
        ];
    }
} catch (Exception $e) {
}

// 4. البحث في المنسقين وفريق العمل (Coordinators)
try {
    $stmtCo = $db->prepare('SELECT id, name, phone, gender, role_type, faculty 
        FROM coordinators 
        WHERE name LIKE ? OR phone LIKE ? OR faculty LIKE ?
        ORDER BY role_type DESC LIMIT 5');
    $stmtCo->execute([$searchTerm, $searchTerm, $searchTerm]);
    $coordinators = $stmtCo->fetchAll(PDO::FETCH_ASSOC);

    foreach ($coordinators as $co) {
        $role = ($co['role_type'] === 'lead_coordinator') ? 'منسق رئيسي' : 'منسق معتمد';
        $sub = ($co['gender'] === 'female' ? 'منسقة' : 'منسق') . ' · ' . ($co['faculty'] ?: 'عام');
        if (!empty($co['phone'])) {
            $sub .= ' · ' . $co['phone'];
        }
        $results[] = [
            'title' => $co['name'],
            'subtitle' => $sub,
            'url' => 'coordinators.php?q=' . urlencode($co['name']),
            'category' => 'فريق المنسقين',
            'badge' => $role,
            'type' => 'coordinator'
        ];
    }
} catch (Exception $e) {
}

// 5. البحث في المواد الدراسية والتخصصات (Study Materials)
try {
    $stmtMat = $db->prepare('SELECT id, title, code, faculty FROM study_materials WHERE title LIKE ? OR code LIKE ? OR faculty LIKE ? LIMIT 4');
    $stmtMat->execute([$searchTerm, $searchTerm, $searchTerm]);
    $studyMats = $stmtMat->fetchAll(PDO::FETCH_ASSOC);

    foreach ($studyMats as $sm) {
        $results[] = [
            'title' => $sm['title'],
            'subtitle' => ($sm['faculty'] ?: 'متطلب') . ($sm['code'] ? ' · ' . $sm['code'] : ''),
            'url' => 'study_materials.php?q=' . urlencode($sm['title']),
            'category' => 'المواد والمناهج الدراسية',
            'badge' => 'مادة دراسية',
            'type' => 'study_material'
        ];
    }
} catch (Exception $e) {
}

// 6. البحث في البلاغات والشكاوى
try {
    $stmtRep = $db->prepare('SELECT id, reporter_name, reason, created_at FROM question_reports WHERE reporter_name LIKE ? OR reason LIKE ? LIMIT 3');
    $stmtRep->execute([$searchTerm, $searchTerm]);
    $reports = $stmtRep->fetchAll(PDO::FETCH_ASSOC);

    foreach ($reports as $rp) {
        $results[] = [
            'title' => 'بلاغ: ' . mb_substr($rp['reason'] ?: 'بلاغ جديد', 0, 45),
            'subtitle' => 'المبلّغ: ' . ($rp['reporter_name'] ?: 'طالب') . ' · ' . substr($rp['created_at'], 0, 10),
            'url' => 'reports.php',
            'category' => 'البلاغات والشكاوى',
            'badge' => 'بلاغ',
            'type' => 'report'
        ];
    }
} catch (Exception $e) {
}

echo json_encode(['status' => 'success', 'results' => $results, 'count' => count($results)], JSON_UNESCAPED_UNICODE);
