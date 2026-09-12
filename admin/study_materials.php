<?php
$page_key = 'materials';
$page_title = 'السجل الأكاديمي للمواد الدراسية';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/sync_frontend_live.php';

if (empty($_SESSION['authenticated'])) {
  redirect('../login.php');
}
$db = get_db();

enforce_rate_limit('admin_materials_req', 180, 60, 'تم تجاوز الحد الأقصى لمعدل الطلبات.');
touch_user_activity();

const STUDY_FIREBASE_PROJECT = 'koon-609da';
const STUDY_FIREBASE_KEY = 'AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';

function syncStudyMaterialToFirestore(array $material, bool $deleted = false): void
{
  $id = 'admin_material_' . (int) ($material['id'] ?? 0);
  $category = 'mandatoryUniversity';
  $fields = [
    'name' => ['stringValue' => (string) ($material['course_name'] ?? $material['title'] ?? '')],
    'nameEn' => ['stringValue' => (string) ($material['course_name'] ?? $material['title'] ?? '')],
    'icon' => ['stringValue' => '📚'],
    'category' => ['stringValue' => $category],
    'faculty' => ['stringValue' => (string) ($material['faculty'] ?? '')],
    'specialization' => ['stringValue' => (string) ($material['major'] ?? '')],
    'custom' => ['booleanValue' => true],
    'deleted' => ['booleanValue' => $deleted],
    'files' => [
      'mapValue' => [
        'fields' => [
          'link' => ['stringValue' => (string) ($material['file_url'] ?? '')],
          'materialType' => ['stringValue' => (string) ($material['material_type'] ?? '')],
        ]
      ]
    ],
  ];
  $url = 'https://firestore.googleapis.com/v1/projects/' . STUDY_FIREBASE_PROJECT . '/databases/(default)/documents/academic_courses/' . rawurlencode($id) . '?key=' . urlencode(STUDY_FIREBASE_KEY);
  $options = [
    'http' => [
      'method' => 'PATCH',
      'header' => "Content-Type: application/json\r\n",
      'content' => json_encode(['fields' => $fields], JSON_UNESCAPED_UNICODE),
      'ignore_errors' => true,
      'timeout' => 5,
    ]
  ];
  @file_get_contents($url, false, stream_context_create($options));
}

// ---------------- معالجة طلبات AJAX و POST ----------------
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
  $action = $_POST['action'] ?? '';
  header('Content-Type: application/json; charset=utf-8');

  if (!csrf_check($_POST['csrf'] ?? '')) {
    echo json_encode(['success' => false, 'error' => 'انتهت صلاحية الجلسة، يرجى التحديث']);
    exit;
  }

  if ($action === 'add_file') {
    $courseName = trim($_POST['course_name'] ?? '');
    $title = trim($_POST['title'] ?? '');
    $fileUrl = trim($_POST['file_url'] ?? '');
    $materialType = $_POST['material_type'] ?? 'summary';
    $faculty = trim($_POST['faculty'] ?? 'كلية الذكاء الاصطناعي');
    $major = trim($_POST['major'] ?? '');
    $reqCat = trim($_POST['requirement_category'] ?? '');
    $instructor = trim($_POST['instructor'] ?? '');
    $desc = trim($_POST['description'] ?? '');

    if (!$courseName || !$title || !$fileUrl) {
      echo json_encode(['success' => false, 'error' => 'يرجى إدخال اسم المادة وعنوان الملف والرابط']);
      exit;
    }

    $stmt = $db->prepare('INSERT INTO study_materials 
            (title, course_name, course_code, faculty, major, requirement_category, material_type, file_url, file_type, instructor, description, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
      $title,
      $courseName,
      trim($_POST['course_code'] ?? ''),
      $faculty,
      $major,
      $reqCat,
      $materialType,
      $fileUrl,
      $_POST['file_type'] ?? 'pdf',
      $instructor,
      $desc,
      'active'
    ]);
    $newId = (int) $db->lastInsertId();
    log_activity("إضافة مصدر جديد لمادة $courseName (#$newId)", 'study_materials');
    sync_courses_to_frontend($db);
    sync_all_courses_to_firestore($db);

    echo json_encode(['success' => true, 'id' => $newId, 'message' => 'تمت إضافة المصدر بنجاح']);
    exit;
  }

  if ($action === 'edit_file') {
    $id = (int) ($_POST['id'] ?? 0);
    $title = trim($_POST['title'] ?? '');
    $fileUrl = trim($_POST['file_url'] ?? '');
    $materialType = $_POST['material_type'] ?? 'summary';
    $instructor = trim($_POST['instructor'] ?? '');
    $desc = trim($_POST['description'] ?? '');

    if (!$id || !$title || !$fileUrl) {
      echo json_encode(['success' => false, 'error' => 'يرجى إدخال عنوان الملف والرابط']);
      exit;
    }

    $stmt = $db->prepare('UPDATE study_materials SET title=?, file_url=?, material_type=?, instructor=?, description=?, updated_at=CURRENT_TIMESTAMP WHERE id=?');
    $stmt->execute([$title, $fileUrl, $materialType, $instructor, $desc, $id]);
    log_activity("تعديل بيانات المصدر #$id ($title)", 'study_materials');
    sync_courses_to_frontend($db);
    sync_all_courses_to_firestore($db);

    echo json_encode(['success' => true, 'message' => 'تم حفظ تعديل المصدر بنجاح']);
    exit;
  }

  if ($action === 'edit_course') {
    $oldCourseName = trim($_POST['old_course_name'] ?? '');
    $newCourseName = trim($_POST['course_name'] ?? '');
    $courseCode = trim($_POST['course_code'] ?? '');
    $faculty = trim($_POST['faculty'] ?? '');
    $reqCat = trim($_POST['requirement_category'] ?? '');

    if (!$oldCourseName || !$newCourseName) {
      echo json_encode(['success' => false, 'error' => 'اسم المادة مطلوب']);
      exit;
    }

    $stmt = $db->prepare('UPDATE study_materials SET course_name=?, course_code=?, faculty=?, requirement_category=?, updated_at=CURRENT_TIMESTAMP WHERE course_name=?');
    $stmt->execute([$newCourseName, $courseCode, $faculty, $reqCat, $oldCourseName]);
    log_activity("تعديل بيانات المادة الدراسية: $newCourseName", 'study_materials');
    sync_courses_to_frontend($db);
    sync_all_courses_to_firestore($db);

    echo json_encode(['success' => true, 'message' => 'تم حفظ تعديلات المادة بنجاح']);
    exit;
  }

  if ($action === 'delete_file') {
    $id = (int) ($_POST['id'] ?? 0);
    if (!$id) {
      echo json_encode(['success' => false, 'error' => 'معرف المصدر غير صالح']);
      exit;
    }
    archive_delete('study_materials', $id, 'حذف ملف مادة دراسية');
    log_activity("حذف المصدر #$id", 'study_materials');
    sync_courses_to_frontend($db);
    sync_all_courses_to_firestore($db);
    echo json_encode(['success' => true, 'message' => 'تم نقل المصدر إلى المحذوفات']);
    exit;
  }

  if ($action === 'add_course') {
    $courseName = trim($_POST['course_name'] ?? '');
    $title = trim($_POST['title'] ?? ($courseName . ' - السلايدات والمنهاج'));
    $fileUrl = trim($_POST['file_url'] ?? 'https://drive.google.com/');
    $materialType = $_POST['material_type'] ?? 'summary';
    $faculty = trim($_POST['faculty'] ?? 'كلية الذكاء الاصطناعي');
    $major = trim($_POST['major'] ?? '');
    $reqCat = trim($_POST['requirement_category'] ?? 'متطلبات الجامعة الإجبارية');

    if (!$courseName) {
      echo json_encode(['success' => false, 'error' => 'اسم المادة مطلوب']);
      exit;
    }

    $stmt = $db->prepare('INSERT INTO study_materials 
            (title, course_name, course_code, faculty, major, requirement_category, material_type, file_url, file_type, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([$title, $courseName, trim($_POST['course_code'] ?? ''), $faculty, $major, $reqCat, $materialType, $fileUrl, 'pdf', 'active']);
    $newId = (int) $db->lastInsertId();
    log_activity("إضافة مادة دراسية جديدة: $courseName (#$newId)", 'study_materials');
    sync_courses_to_frontend($db);
    sync_all_courses_to_firestore($db);

    echo json_encode(['success' => true, 'id' => $newId, 'message' => 'تمت إضافة المادة الدراسية بنجاح']);
    exit;
  }

  if ($action === 'delete_course') {
    $courseName = trim($_POST['course_name'] ?? '');
    if (!$courseName) {
      echo json_encode(['success' => false, 'error' => 'اسم المادة مطلوب']);
      exit;
    }
    $rows = $db->prepare('SELECT id FROM study_materials WHERE course_name = ?');
    $rows->execute([$courseName]);
    foreach ($rows->fetchAll(PDO::FETCH_COLUMN) as $id) {
      archive_delete('study_materials', (int) $id, 'حذف مادة دراسية كاملة');
    }
    log_activity("حذف مادة دراسية بالكامل: $courseName", 'study_materials');
    sync_courses_to_frontend($db);
    sync_all_courses_to_firestore($db);
    echo json_encode(['success' => true, 'message' => 'تم نقل المادة وكافة ملفاتها إلى المحذوفات']);
    exit;
  }

  echo json_encode(['success' => false, 'error' => 'إجراء غير معروف']);
  exit;
}

// ---------------- استخراج كافة المواد والمصادر من قاعدة البيانات ----------------
// عرض المواد الأحدث أولاً حتى تظهر المواد المضافة حديثاً في أعلى القائمة
$rows = $db->query('SELECT id, title, course_name, course_code, faculty, major, requirement_category, material_type, file_url, file_type, status, instructor, description, downloads_count, views_count FROM study_materials ORDER BY id DESC')->fetchAll(PDO::FETCH_ASSOC);

$engNamesMap = [
  'الابتكار والريادة والإبداع' => 'Innovation & Entrepreneurship',
  'التربية الوطنية والسلوك الجامعي' => 'National Education',
  'التربية الوطنية' => 'National Education',
  'اللغة الإنجليزية التطبيقية (1)' => 'Applied English (1)',
  'اللغة الإنجليزية التطبيقية (2)' => 'Applied English (2)',
  'مهارات الحاسوب والتعليم الإلكتروني' => 'Computer Skills & E-Learning',
  'مهارات حاسوب والتعلم الإلكتروني' => 'Computer Skills & E-Learning',
  'مهارات حاسوب (2)' => 'Computer Skills (2)',
  'اللغة العربية التطبيقية' => 'Applied Arabic',
  'العلوم العسكرية' => 'Military Sciences',
  'المهارات الحياتية والعمل' => 'Life & Work Skills',
  'الريادة والابتكار (بالإنجليزية)' => 'Innovation (English Track)',
  'برمجة موجهة للكائنات' => 'Object Oriented Programming (OOP)',
  'مقدمة في الذكاء الاصطناعي' => 'Intro to Artificial Intelligence',
  'برمجة الذكاء الاصطناعي' => 'AI Programming',
  'التفاضل والتكامل (1)' => 'Calculus (1)',
  'التفاضل والتكامل (2)' => 'Calculus (2)',
  'مقدمة إلى يونكس' => 'Intro to Unix',
  'تطبيقات الذكاء الاصطناعي' => 'AI Applications',
  'مبادئ أمن سيبراني' => 'Cybersecurity Principles',
  'تحقيقات الأجهزة النقالة' => 'Mobile Device Forensics',
  'خصوصية وحماية بيانات' => 'Data Privacy & Protection',
  'استعادة بيانات' => 'Data Recovery',
  'التحقيقات الجنائية في الشبكات' => 'Network Forensics',
  'القوانين الوطنية للجرائم الإلكترونية' => 'National Cyber Laws',
  'تعلم الآلة' => 'Machine Learning',
  'أساسيات تشفير' => 'Cryptography Fundamentals',
  'أمن الحاسوب والشبكات' => 'Computer & Network Security',
  'أمن الحوسب السحابي' => 'Cloud Computing Security',
  'أمن المعلومات' => 'Information Security',
  'أمن الويب' => 'Web Security',
  'أمن شبكات' => 'Network Security',
  'تراكيب البيانات' => 'Data Structures',
  'قواعد البيانات' => 'Database Systems',
  'خوارزميات' => 'Algorithms',
  'نظم التشغيل' => 'Operating Systems',
  'شبكات الحاسوب' => 'Computer Networks',
  'الاحتمالات والإحصاء' => 'Probability & Statistics',
  'الجبر الخطي' => 'Linear Algebra',
  'الرياضيات المتقطعة' => 'Discrete Mathematics',
];

$typeMap = [
  'summary' => 'summary',
  'past_paper' => 'questions',
  'exam' => 'questions',
  'test' => 'questions',
  'quiz' => 'questions',
  'book' => 'book',
  'slides' => 'pdf',
  'pdf' => 'pdf',
  'lecture' => 'video',
  'video' => 'video',
  'solutions' => 'solutions',
  'solution' => 'solutions',
];

$coursesData = [];
$totalFilesCount = count($rows);

foreach ($rows as $r) {
  $cname = trim((string) ($r['course_name'] ?: $r['title']));
  $cname = str_replace('الاللغة', 'اللغة', $cname);

  $faculty = trim((string) ($r['faculty'] ?? ''));
  $major = trim((string) ($r['major'] ?? ''));
  $reqCat = trim((string) ($r['requirement_category'] ?? ''));
  $reqStr = $reqCat . ' ' . $major . ' ' . $faculty;

  $catId = 'mandatoryUniversity';
  $spec = 'all';
  $facultyKey = 'ai';

  if (str_contains($reqStr, 'اختياري') && (str_contains($reqStr, 'جامعة') || str_contains($reqStr, 'جامعي'))) {
    $catId = 'optionalUniversity';
  } elseif (str_contains($reqStr, 'إجبارية') && (str_contains($reqStr, 'جامعة') || str_contains($reqStr, 'جامعي') || str_contains($reqStr, 'عام'))) {
    $catId = 'mandatoryUniversity';
  } elseif (str_contains($reqStr, 'متطلبات الكلية') || str_contains($reqStr, 'إجباري كلية') || str_contains($reqStr, 'مشتركة')) {
    $catId = 'mandatoryCollege';
  } elseif (str_contains($reqStr, 'الأدلة الرقمية') || str_contains($reqStr, 'DF') || str_contains($reqStr, 'تحقيق')) {
    $catId = str_contains($reqStr, 'اختياري') ? 'ai_df_elective' : 'ai_df_mandatory';
    $spec = 'df';
  } elseif (str_contains($reqStr, 'السيبراني') || str_contains($reqStr, 'Cyber') || str_contains($reqStr, 'أمن')) {
    $catId = str_contains($reqStr, 'اختياري') ? 'ai_cyber_elective' : 'ai_cyber_mandatory';
    $spec = 'cyber';
  } elseif (str_contains($reqStr, 'الواقع الافتراضي') || str_contains($reqStr, 'VR') || str_contains($reqStr, 'معزز')) {
    $catId = 'ai_vr_mandatory';
    $spec = 'vr';
  } elseif (str_contains($reqStr, 'البيانات') || str_contains($reqStr, 'DS') || str_contains($reqStr, 'ذكاء')) {
    $catId = str_contains($reqStr, 'اختياري') ? 'ai_ds_elective' : 'ai_ds_mandatory';
    $spec = 'ds';
  } elseif (str_contains($reqStr, 'مختبر') || str_contains($reqStr, 'عملي')) {
    $catId = 'labs';
  } elseif (str_contains($reqStr, 'استدراك')) {
    $catId = 'remedial';
  } elseif (str_contains($faculty, 'تكنولوجيا المعلومات') || str_contains($reqStr, 'علم الحاسوب')) {
    $facultyKey = 'it';
    $catId = 'it_cs_mandatory';
    $spec = 'it';
  }

  if (!isset($coursesData[$cname])) {
    $diff = 'mid';
    $rating = 4;
    if (str_contains($cname, 'تفاضل') || str_contains($cname, 'خوارزميات') || str_contains($cname, 'تعلم الآلة') || str_contains($cname, 'أمن')) {
      $diff = 'hard';
      $rating = 5;
    } elseif (str_contains($cname, 'تربية') || str_contains($cname, 'مهارات') || str_contains($cname, 'ريادة') || str_contains($cname, 'عربية')) {
      $diff = 'easy';
      $rating = 5;
    }

    $coursesData[$cname] = [
      'id' => (int) $r['id'],
      'name' => $cname,
      'nameEn' => $engNamesMap[$cname] ?? $cname,
      'code' => $r['course_code'] ?: ('MAT-' . $r['id']),
      'faculty' => $faculty ?: 'كلية الذكاء الاصطناعي',
      'facultyKey' => $facultyKey,
      'category' => $catId,
      'spec' => $spec,
      'diff' => $diff,
      'rating' => $rating,
      'files' => []
    ];
  }

  $mtype = $r['material_type'] ?? 'summary';
  $mappedType = $typeMap[$mtype] ?? 'summary';

  $coursesData[$cname]['files'][] = [
    'id' => (int) $r['id'],
    'title' => (string) $r['title'],
    'type' => $mappedType,
    'url' => (string) ($r['file_url'] ?: ''),
    'fileType' => (string) ($r['file_type'] ?: 'pdf'),
    'status' => (string) ($r['status'] ?: 'active'),
    'instructor' => (string) ($r['instructor'] ?: ''),
    'description' => (string) ($r['description'] ?: ''),
  ];
}

$coursesJson = json_encode(array_values($coursesData), JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$csrfToken = csrf_token();

require __DIR__ . '/_header.php';
?>

<!-- ======================= استدعاء الخطوط والأنماط الرسمية ======================= -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link
  href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@500;700;800;900&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
  rel="stylesheet">

<style>
  :root {
    --bg: #FFFFFF;
    --panel: #F6F7F9;
    --panel-2: #EEF0F3;
    --line: #E3E6EB;
    --line-strong: #D3D7DE;
    --ink: #12141C;
    --ink-soft: #5B6172;
    --ink-faint: #9298A6;
    --navy: #1B3A8A;
    --navy-soft: #EAEEFA;
    --gold: #B98900;
    --gold-soft: #FBF3E1;
    --green: #1E7F5C;
    --green-soft: #E7F5F0;
    --red: #9C2B2B;
    --radius: 10px;
  }

  .academic-registry-app {
    background: var(--bg);
    color: var(--ink);
    font-family: 'IBM Plex Sans Arabic', sans-serif;
    border-radius: 14px;
    border: 1px solid var(--line);
    overflow: hidden;
    margin-bottom: 30px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.03);
  }

  .academic-registry-app .kufi {
    font-family: 'Noto Kufi Arabic', sans-serif;
  }

  .academic-registry-app .mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .academic-registry-app a {
    color: inherit;
    text-decoration: none;
  }

  .academic-registry-app button {
    font-family: inherit;
    cursor: pointer;
    border: none;
    background: none;
  }

  /* ============ HEADER ============ */
  .academic-registry-app .masthead {
    border-bottom: 1px solid var(--line);
    padding: 0 30px;
  }

  .academic-registry-app .masthead-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 0 16px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
    gap: 14px;
  }

  .academic-registry-app .wordmark {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .academic-registry-app .seal {
    width: 44px;
    height: 44px;
    border: 2px solid var(--ink);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    font-weight: 800;
    font-family: 'Noto Kufi Arabic', sans-serif;
    flex-shrink: 0;
    background: #fff;
  }

  .academic-registry-app .wordmark .title {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-weight: 800;
    font-size: 18px;
    letter-spacing: .2px;
    color: var(--ink);
  }

  .academic-registry-app .wordmark .sub {
    font-size: 11px;
    color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: .5px;
    margin-top: 2px;
  }

  .academic-registry-app .faculty-tabs {
    display: flex;
    gap: 26px;
  }

  .academic-registry-app .faculty-tabs button {
    padding: 8px 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-faint);
    border-bottom: 2px solid transparent;
    transition: .2s;
  }

  .academic-registry-app .faculty-tabs button.active {
    color: var(--ink);
    border-color: var(--navy);
    font-weight: 800;
  }

  .academic-registry-app .masthead-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 0;
    gap: 20px;
    flex-wrap: wrap;
  }

  .academic-registry-app .search {
    flex: 1;
    min-width: 280px;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    padding: 10px 14px;
    background: var(--panel);
  }

  .academic-registry-app .search input {
    border: none;
    background: none;
    outline: none;
    flex: 1;
    font-family: inherit;
    font-size: 13.5px;
    color: var(--ink);
  }

  .academic-registry-app .search input::placeholder {
    color: var(--ink-faint);
  }

  .academic-registry-app .meta-strip {
    display: flex;
    gap: 20px;
    align-items: center;
  }

  .academic-registry-app .meta-item {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .academic-registry-app .meta-item .v {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 15px;
    color: var(--navy);
  }

  .academic-registry-app .meta-item .l {
    font-size: 10.5px;
    color: var(--ink-faint);
    margin-top: 1px;
  }

  .academic-registry-app .divider-v {
    width: 1px;
    height: 26px;
    background: var(--line-strong);
  }

  /* ============ SPEC + CATEGORY BAR ============ */
  .academic-registry-app .filter-bar {
    padding: 14px 30px;
    border-bottom: 1px solid var(--line);
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  .academic-registry-app .filter-label {
    font-size: 11px;
    color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace;
    margin-left: 6px;
  }

  .academic-registry-app .pill {
    padding: 6px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-soft);
    transition: .18s;
    cursor: pointer;
  }

  .academic-registry-app .pill:hover {
    border-color: var(--navy);
    color: var(--navy);
  }

  .academic-registry-app .pill.active {
    background: var(--navy);
    border-color: var(--navy);
    color: #fff;
  }

  .academic-registry-app .btn-add-course {
    margin-inline-start: auto;
    background: var(--green-soft);
    color: var(--green);
    border: 1px solid #cdeadf;
    padding: 6px 16px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: .18s;
    cursor: pointer;
  }

  .academic-registry-app .btn-add-course:hover {
    background: var(--green);
    color: #fff;
  }

  .academic-registry-app .cat-row {
    padding: 10px 30px 14px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .academic-registry-app .cat-tag {
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-soft);
    background: var(--panel);
    border: 1px solid transparent;
    transition: .18s;
    cursor: pointer;
  }

  .academic-registry-app .cat-tag:hover {
    background: var(--panel-2);
  }

  .academic-registry-app .cat-tag.active {
    background: var(--navy-soft);
    color: var(--navy);
    font-weight: 700;
    border-color: #c9d4f2;
  }

  .academic-registry-app .cat-tag.soon {
    opacity: .45;
    cursor: not-allowed;
  }

  .academic-registry-app .cat-tag .cnt {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10.5px;
    margin-right: 5px;
    color: var(--ink-faint);
  }

  /* ============ BODY: MASTER / DETAIL ============ */
  .academic-registry-app .body {
    display: grid;
    grid-template-columns: 400px 1fr;
    min-height: calc(100vh - 270px);
  }

  .academic-registry-app .index {
    border-left: 1px solid var(--line);
    overflow-y: auto;
    max-height: calc(100vh - 270px);
  }

  .academic-registry-app .index-head {
    padding: 16px 24px 10px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .academic-registry-app .index-head h2 {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 14.5px;
    font-weight: 700;
  }

  .academic-registry-app .index-head .n {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-faint);
  }

  .academic-registry-app .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 24px;
    border-top: 1px solid var(--line);
    cursor: pointer;
    transition: .15s;
    position: relative;
  }

  .academic-registry-app .row:hover {
    background: var(--panel);
  }

  .academic-registry-app .row.active {
    background: var(--navy-soft);
  }

  .academic-registry-app .row.active::before {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--navy);
  }

  .academic-registry-app .monogram {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    border: 1.5px solid var(--line-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 13px;
    font-family: 'Noto Kufi Arabic', sans-serif;
    color: var(--ink-soft);
    flex-shrink: 0;
    background: #fff;
  }

  .academic-registry-app .row.active .monogram {
    border-color: var(--navy);
    color: var(--navy);
    background: #fff;
  }

  .academic-registry-app .row-text {
    flex: 1;
    min-width: 0;
  }

  .academic-registry-app .row-text .rt {
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .academic-registry-app .row-text .re {
    font-size: 10.5px;
    color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace;
    margin-top: 2px;
  }

  .academic-registry-app .row-dots {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .academic-registry-app .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--line-strong);
  }

  .academic-registry-app .dot.on {
    background: var(--navy);
  }

  /* ============ DETAIL PANEL ============ */
  .academic-registry-app .detail {
    padding: 30px 36px;
    overflow-y: auto;
    max-height: calc(100vh - 270px);
  }

  .academic-registry-app .breadcrumb {
    font-size: 11.5px;
    color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 18px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .academic-registry-app .breadcrumb .sepx {
    color: var(--line-strong);
  }

  .academic-registry-app .detail-head {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 20px;
    padding-bottom: 22px;
    border-bottom: 1px solid var(--line);
  }

  .academic-registry-app .monogram-lg {
    width: 64px;
    height: 64px;
    border-radius: 12px;
    border: 2px solid var(--ink);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 20px;
    font-family: 'Noto Kufi Arabic', sans-serif;
    flex-shrink: 0;
    background: #fff;
  }

  .academic-registry-app .detail-head h1 {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 21px;
    font-weight: 800;
    margin-bottom: 4px;
    color: var(--ink);
  }

  .academic-registry-app .detail-head .en {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--ink-faint);
  }

  .academic-registry-app .meta-row {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-top: 14px;
    flex-wrap: wrap;
  }

  .academic-registry-app .signal {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 18px;
  }

  .academic-registry-app .signal .bar {
    width: 5px;
    background: var(--line-strong);
    border-radius: 1px;
  }

  .academic-registry-app .signal .bar.on {
    background: var(--gold);
  }

  .academic-registry-app .signal .bar:nth-child(1) {
    height: 6px;
  }

  .academic-registry-app .signal .bar:nth-child(2) {
    height: 9px;
  }

  .academic-registry-app .signal .bar:nth-child(3) {
    height: 12px;
  }

  .academic-registry-app .signal .bar:nth-child(4) {
    height: 15px;
  }

  .academic-registry-app .signal .bar:nth-child(5) {
    height: 18px;
  }

  .academic-registry-app .meta-label {
    font-size: 11px;
    color: var(--ink-faint);
  }

  .academic-registry-app .tag {
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid;
  }

  .academic-registry-app .tag.easy {
    color: var(--green);
    background: var(--green-soft);
    border-color: #cdeadf;
  }

  .academic-registry-app .tag.mid {
    color: var(--gold);
    background: var(--gold-soft);
    border-color: #f2e2b8;
  }

  .academic-registry-app .tag.hard {
    color: var(--red);
    background: #f9e8e8;
    border-color: #eec9c9;
  }

  .academic-registry-app .course-actions-top {
    display: flex;
    gap: 8px;
    margin-inline-start: auto;
    align-items: center;
  }

  .academic-registry-app .btn-action-outline {
    padding: 6px 12px;
    border-radius: 7px;
    border: 1px solid var(--line-strong);
    background: #fff;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--ink-soft);
    transition: .18s;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .academic-registry-app .btn-action-outline:hover {
    border-color: var(--navy);
    color: var(--navy);
  }

  .academic-registry-app .btn-action-outline.danger:hover {
    border-color: var(--red);
    color: var(--red);
    background: #fff5f5;
  }

  .academic-registry-app .register-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .academic-registry-app .register-title h3 {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 14.5px;
    font-weight: 700;
  }

  .academic-registry-app .register-title .count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-faint);
  }

  .academic-registry-app .register {
    margin-top: 16px;
  }

  .academic-registry-app .reg-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 4px;
    border-bottom: 1px dashed var(--line-strong);
    transition: .15s;
  }

  .academic-registry-app .reg-row:hover {
    background: rgba(246, 247, 249, 0.6);
  }

  .academic-registry-app .reg-icon {
    width: 34px;
    height: 34px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--line-strong);
    flex-shrink: 0;
    color: var(--ink-soft);
    background: #fff;
  }

  .academic-registry-app .reg-label-wrap {
    display: flex;
    flex-direction: column;
  }

  .academic-registry-app .reg-label {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
  }

  .academic-registry-app .reg-sub-label {
    font-size: 10.5px;
    color: var(--ink-faint);
    margin-top: 2px;
  }

  .academic-registry-app .reg-leader {
    flex: 1;
    border-bottom: 1.5px dotted var(--line-strong);
    margin: 0 8px;
    height: 1px;
    position: relative;
    top: 4px;
  }

  .academic-registry-app .reg-actions-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .academic-registry-app .reg-action {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--navy);
    padding: 6px 14px;
    border: 1px solid var(--navy);
    border-radius: 6px;
    flex-shrink: 0;
    transition: .18s;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #fff;
  }

  .academic-registry-app .reg-action:hover {
    background: var(--navy);
    color: #fff;
  }

  .academic-registry-app .reg-btn-mini {
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: #fff;
    color: var(--ink-faint);
    cursor: pointer;
    font-size: 11px;
    transition: .15s;
  }

  .academic-registry-app .reg-btn-mini:hover {
    border-color: var(--ink-soft);
    color: var(--ink);
  }

  .academic-registry-app .reg-btn-mini.danger:hover {
    border-color: var(--red);
    color: var(--red);
    background: #fff5f5;
  }

  .academic-registry-app .reg-empty {
    color: var(--ink-faint);
    font-size: 13px;
    padding: 30px 4px;
    text-align: center;
  }

  .academic-registry-app .icon {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.6;
  }

  /* ============ MODAL SYSTEM ============ */
  .academic-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(18, 20, 28, 0.55);
    backdrop-filter: blur(4px);
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .academic-modal-overlay.open {
    display: flex;
  }

  .academic-modal {
    background: #fff;
    border-radius: 14px;
    width: 100%;
    max-width: 520px;
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    border: 1px solid var(--line);
    font-family: 'IBM Plex Sans Arabic', sans-serif;
  }

  .academic-modal-head {
    padding: 16px 22px;
    border-bottom: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--panel);
  }

  .academic-modal-head h3 {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
    margin: 0;
  }

  .academic-modal-close {
    cursor: pointer;
    border: none;
    background: none;
    font-size: 18px;
    color: var(--ink-faint);
  }

  .academic-modal-body {
    padding: 20px 22px;
    max-height: 75vh;
    overflow-y: auto;
  }

  .academic-form-group {
    margin-bottom: 14px;
  }

  .academic-form-group label {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-soft);
    margin-bottom: 6px;
  }

  .academic-form-group input,
  .academic-form-group select,
  .academic-form-group textarea {
    width: 100%;
    border: 1px solid var(--line-strong);
    background: var(--panel);
    border-radius: 8px;
    padding: 9px 12px;
    font-family: inherit;
    font-size: 13px;
    color: var(--ink);
    outline: none;
    box-sizing: border-box;
  }

  .academic-form-group input:focus,
  .academic-form-group select:focus,
  .academic-form-group textarea:focus {
    border-color: var(--navy);
    background: #fff;
  }

  .academic-modal-footer {
    padding: 14px 22px;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    background: var(--panel);
  }

  .academic-btn-primary {
    background: var(--navy);
    color: #fff;
    border: none;
    padding: 8px 18px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .academic-btn-primary:hover {
    opacity: .9;
  }

  .academic-btn-secondary {
    background: #fff;
    color: var(--ink-soft);
    border: 1px solid var(--line-strong);
    padding: 8px 16px;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  @media (max-width: 900px) {
    .academic-registry-app .body {
      grid-template-columns: 1fr;
    }

    .academic-registry-app .index {
      max-height: 300px;
    }

    .academic-registry-app .detail {
      max-height: none;
    }
  }
</style>

<div class="academic-registry-app" id="academicApp">

  <!-- ============ MASTHEAD ============ -->
  <header class="masthead">
    <div class="masthead-top">
      <div class="wordmark">
        <div class="seal">جا</div>
        <div>
          <div class="title">السجل الأكاديمي للمواد الدراسية</div>
          <div class="sub">ACADEMIC MATERIALS REGISTRY</div>
        </div>
      </div>
      <nav class="faculty-tabs" id="facultyTabs">
        <button class="active" data-fac="all">كافة الكليات</button>
        <button data-fac="ai">كلية الذكاء الاصطناعي</button>
        <button data-fac="it">كلية تكنولوجيا المعلومات</button>
      </nav>
    </div>
    <div class="masthead-bottom">
      <div class="search">
        <svg class="icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.6" y2="16.6" />
        </svg>
        <input id="searchInput" type="text" placeholder="ابحث برقم المادة أو اسمها...">
      </div>
      <div class="meta-strip">
        <div class="meta-item"><span class="v" id="statTotal">0</span><span class="l">مادة معروضة</span></div>
        <div class="divider-v"></div>
        <div class="meta-item"><span class="v" id="statFilesTotal"><?= $totalFilesCount ?></span><span class="l">ملف
            ومصدر</span></div>
        <div class="divider-v"></div>
        <div class="meta-item"><span class="v" id="statCategories">12</span><span class="l">تصنيف</span></div>
        <div class="divider-v"></div>
        <div class="meta-item"><span class="v" id="statCoursesTotal"><?= count($coursesData) ?></span><span
            class="l">إجمالي المواد</span></div>
      </div>
    </div>
  </header>

  <!-- ============ SPECIFICATION & CATEGORY BAR ============ -->
  <div class="filter-bar">
    <span class="filter-label">التخصص</span>
    <div class="pill active" data-spec="all">الكل</div>
    <div class="pill" data-spec="df">DF</div>
    <div class="pill" data-spec="cyber">Cyber</div>
    <div class="pill" data-spec="vr">VR</div>
    <div class="pill" data-spec="ds">DS</div>
    <div class="pill" data-spec="it">IT / CS</div>
    <button type="button" class="btn-add-course" id="btnAddCourse">
      <svg class="icon" viewBox="0 0 24 24" style="width:14px;height:14px;">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      مادة جديدة
    </button>
  </div>

  <div class="cat-row" id="catRow"></div>

  <!-- ============ MASTER / DETAIL BODY ============ -->
  <div class="body">
    <aside class="index">
      <div class="index-head">
        <h2 id="listTitle">متطلبات الجامعة الإجبارية</h2>
        <span class="n mono" id="listCount">00 / 00</span>
      </div>
      <div id="rowsList"></div>
    </aside>

    <section class="detail" id="detailPanel"></section>
  </div>

</div>

<!-- ======================= MODAL: إضافة مصدر جديد ======================= -->
<div class="academic-modal-overlay" id="addFileModal">
  <div class="academic-modal">
    <div class="academic-modal-head">
      <h3>إضافة مصدر أو ملف جديد للمادة</h3>
      <button class="academic-modal-close" onclick="closeModal('addFileModal')">&times;</button>
    </div>
    <form id="addFileForm" onsubmit="handleSaveFile(event)">
      <input type="hidden" name="csrf" value="<?= $csrfToken ?>">
      <input type="hidden" name="action" value="add_file">
      <input type="hidden" name="course_name" id="modalFileCourseName">
      <div class="academic-modal-body">
        <div class="academic-form-group">
          <label>اسم المادة</label>
          <input type="text" id="modalFileCourseDisplay" readonly style="opacity:.75;font-weight:700;">
        </div>
        <div class="academic-form-group">
          <label>نوع المصدر</label>
          <select name="material_type" id="modalFileType" required>
            <option value="summary">ملخص وشرح المادة (Summary)</option>
            <option value="pdf">سلايدات وملفات PDF</option>
            <option value="past_paper">أسئلة سنوات وتجميعات (Questions)</option>
            <option value="solutions">الحلول النموذجية والواجبات (Solutions)</option>
            <option value="video">محاضرة وفيديوهات مسجلة (Video)</option>
            <option value="book">الكتاب المقرر والمنهاج (Book)</option>
          </select>
        </div>
        <div class="academic-form-group">
          <label>عنوان الملف / التسمية التوضيحية</label>
          <input type="text" name="title" id="modalFileTitle" placeholder="مثال: ملخص شامل للميد - د. أحمد" required>
        </div>
        <div class="academic-form-group">
          <label>رابط الملف أو مجلد Google Drive</label>
          <input type="url" name="file_url" id="modalFileUrl" placeholder="https://drive.google.com/..." required>
        </div>
        <div class="academic-form-group">
          <label>المدرس / المساهم (اختياري)</label>
          <input type="text" name="instructor" id="modalFileInstructor" placeholder="فريق مكانك الأكاديمي">
        </div>
        <div class="academic-form-group">
          <label>ملاحظات إضافية (اختياري)</label>
          <textarea name="description" id="modalFileDesc" rows="2"
            placeholder="أية تفاصيل إضافية عن الملف..."></textarea>
        </div>
      </div>
      <div class="academic-modal-footer">
        <button type="button" class="academic-btn-secondary" onclick="closeModal('addFileModal')">إلغاء</button>
        <button type="submit" class="academic-btn-primary">حفظ وإضافة المصدر</button>
      </div>
    </form>
  </div>
</div>

<!-- ======================= MODAL: إضافة مادة دراسية جديدة ======================= -->
<div class="academic-modal-overlay" id="addCourseModal">
  <div class="academic-modal">
    <div class="academic-modal-head">
      <h3>إضافة مادة دراسية جديدة</h3>
      <button class="academic-modal-close" onclick="closeModal('addCourseModal')">&times;</button>
    </div>
    <form id="addCourseForm" onsubmit="handleSaveCourse(event)">
      <input type="hidden" name="csrf" value="<?= $csrfToken ?>">
      <input type="hidden" name="action" value="add_course">
      <div class="academic-modal-body">
        <div class="academic-form-group">
          <label>اسم المادة بالعربية</label>
          <input type="text" name="course_name" id="newCourseName" placeholder="مثال: ذكاء اصطناعي تطبيقي" required>
        </div>
        <div class="academic-form-group">
          <label>رمز المادة (اختياري)</label>
          <input type="text" name="course_code" id="newCourseCode" placeholder="مثال: AI-301">
        </div>
        <div class="academic-form-group">
          <label>الكلية</label>
          <select name="faculty" id="newCourseFaculty">
            <option value="كلية الذكاء الاصطناعي">كلية الذكاء الاصطناعي</option>
            <option value="كلية تكنولوجيا المعلومات">كلية تكنولوجيا المعلومات</option>
            <option value="متطلبات جامعة">متطلبات جامعة</option>
          </select>
        </div>
        <div class="academic-form-group">
          <label>التصنيف الأكاديمي</label>
          <select name="requirement_category" id="newCourseCategory">
            <option value="متطلبات الجامعة الإجبارية">متطلبات الجامعة الإجبارية</option>
            <option value="متطلبات الجامعة الاختيارية">متطلبات الجامعة الاختيارية</option>
            <option value="متطلبات الكلية الإجبارية">متطلبات الكلية الإجبارية</option>
            <option value="DF — إجباري">DF — الأدلة الرقمية (إجباري)</option>
            <option value="DF — اختياري">DF — الأدلة الرقمية (اختياري)</option>
            <option value="Cyber — إجباري">Cyber — الأمن السيبراني (إجباري)</option>
            <option value="Cyber — اختياري">Cyber — الأمن السيبراني (اختياري)</option>
            <option value="VR — إجباري">VR — الواقع الافتراضي (إجباري)</option>
            <option value="DS — إجباري">DS — علم البيانات (إجباري)</option>
            <option value="DS — اختياري">DS — علم البيانات (اختياري)</option>
            <option value="المختبرات">المختبرات العملية</option>
            <option value="مواد الاستدراكي">مواد الاستدراكي</option>
          </select>
        </div>
        <div class="academic-form-group">
          <label>رابط مجلد Drive أو أول ملف للمادة</label>
          <input type="url" name="file_url" id="newCourseUrl" placeholder="https://drive.google.com/..." required>
        </div>
      </div>
      <div class="academic-modal-footer">
        <button type="button" class="academic-btn-secondary" onclick="closeModal('addCourseModal')">إلغاء</button>
        <button type="submit" class="academic-btn-primary">إضافة المادة</button>
      </div>
    </form>
  </div>
</div>


<!-- ======================= MODAL: تعديل مصدر / ملف ======================= -->
<div class="academic-modal-overlay" id="editFileModal">
  <div class="academic-modal">
    <div class="academic-modal-head">
      <h3>تعديل بيانات المصدر أو الملف</h3>
      <button class="academic-modal-close" onclick="closeModal('editFileModal')">&times;</button>
    </div>
    <form id="editFileForm" onsubmit="handleUpdateFile(event)">
      <input type="hidden" name="csrf" value="<?= $csrfToken ?>">
      <input type="hidden" name="action" value="edit_file">
      <input type="hidden" name="id" id="editFileId">
      <input type="hidden" name="course_name" id="editFileCourseName">
      <div class="academic-modal-body">
        <div class="academic-form-group">
          <label>اسم المادة</label>
          <input type="text" id="editFileCourseDisplay" readonly style="opacity:.75;font-weight:700;">
        </div>
        <div class="academic-form-group">
          <label>نوع المصدر</label>
          <select name="material_type" id="editFileType" required>
            <option value="summary">ملخص وشرح المادة (Summary)</option>
            <option value="pdf">سلايدات وملفات PDF</option>
            <option value="past_paper">أسئلة سنوات وتجميعات (Questions)</option>
            <option value="solutions">الحلول النموذجية والواجبات (Solutions)</option>
            <option value="video">محاضرة وفيديوهات مسجلة (Video)</option>
            <option value="book">الكتاب المقرر والمنهاج (Book)</option>
          </select>
        </div>
        <div class="academic-form-group">
          <label>عنوان الملف / التسمية التوضيحية</label>
          <input type="text" name="title" id="editFileTitle" placeholder="مثال: ملخص شامل للميد - د. أحمد" required>
        </div>
        <div class="academic-form-group">
          <label>رابط الملف أو مجلد Google Drive</label>
          <input type="url" name="file_url" id="editFileUrl" placeholder="https://drive.google.com/..." required>
        </div>
        <div class="academic-form-group">
          <label>المدرس / المساهم (اختياري)</label>
          <input type="text" name="instructor" id="editFileInstructor" placeholder="فريق مكانك الأكاديمي">
        </div>
        <div class="academic-form-group">
          <label>ملاحظات إضافية (اختياري)</label>
          <textarea name="description" id="editFileDesc" rows="2"
            placeholder="أية تفاصيل إضافية عن الملف..."></textarea>
        </div>
      </div>
      <div class="academic-modal-footer">
        <button type="button" class="academic-btn-secondary" onclick="closeModal('editFileModal')">إلغاء</button>
        <button type="submit" class="academic-btn-primary">حفظ التعديلات</button>
      </div>
    </form>
  </div>
</div>

<!-- ======================= MODAL: تعديل بيانات المادة الدراسية ======================= -->
<div class="academic-modal-overlay" id="editCourseModal">
  <div class="academic-modal">
    <div class="academic-modal-head">
      <h3>تعديل بيانات المادة الدراسية</h3>
      <button class="academic-modal-close" onclick="closeModal('editCourseModal')">&times;</button>
    </div>
    <form id="editCourseForm" onsubmit="handleUpdateCourse(event)">
      <input type="hidden" name="csrf" value="<?= $csrfToken ?>">
      <input type="hidden" name="action" value="edit_course">
      <input type="hidden" name="old_course_name" id="editCourseOldName">
      <div class="academic-modal-body">
        <div class="academic-form-group">
          <label>اسم المادة بالعربية</label>
          <input type="text" name="course_name" id="editCourseName" required>
        </div>
        <div class="academic-form-group">
          <label>رمز المادة (Course Code)</label>
          <input type="text" name="course_code" id="editCourseCode" placeholder="مثال: AI-301">
        </div>
        <div class="academic-form-group">
          <label>الكلية</label>
          <select name="faculty" id="editCourseFaculty">
            <option value="كلية الذكاء الاصطناعي">كلية الذكاء الاصطناعي</option>
            <option value="كلية تكنولوجيا المعلومات">كلية تكنولوجيا المعلومات</option>
            <option value="متطلبات جامعة">متطلبات جامعة</option>
            <option value="كلية العلوم">كلية العلوم</option>
          </select>
        </div>
        <div class="academic-form-group">
          <label>التصنيف الأكاديمي</label>
          <select name="requirement_category" id="editCourseCategory">
            <option value="متطلبات الجامعة الإجبارية">متطلبات الجامعة الإجبارية</option>
            <option value="متطلبات الجامعة الاختيارية">متطلبات الجامعة الاختيارية</option>
            <option value="متطلبات الكلية الإجبارية">متطلبات الكلية الإجبارية</option>
            <option value="DF — إجباري">DF — الأدلة الرقمية (إجباري)</option>
            <option value="DF — اختياري">DF — الأدلة الرقمية (اختياري)</option>
            <option value="Cyber — إجباري">Cyber — الأمن السيبراني (إجباري)</option>
            <option value="Cyber — اختياري">Cyber — الأمن السيبراني (اختياري)</option>
            <option value="VR — إجباري">VR — الواقع الافتراضي (إجباري)</option>
            <option value="DS — إجباري">DS — علم البيانات (إجباري)</option>
            <option value="DS — اختياري">DS — علم البيانات (اختياري)</option>
            <option value="IT / CS — مواد التخصص">IT / CS — مواد التخصص</option>
            <option value="المختبرات">المختبرات العملية</option>
            <option value="مواد الاستدراكي">مواد الاستدراكي</option>
          </select>
        </div>
      </div>
      <div class="academic-modal-footer">
        <button type="button" class="academic-btn-secondary" onclick="closeModal('editCourseModal')">إلغاء</button>
        <button type="submit" class="academic-btn-primary">حفظ تعديلات المادة</button>
      </div>
    </form>
  </div>
</div>

<!-- ======================= JS LOGIC ======================= -->
<script>
  /* ---------------- ICONS (line SVG) ---------------- */
  const ICONS = {
    pdf: `<svg class="icon" viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M15 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>`,
    summary: `<svg class="icon" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
    questions: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.2 1-1.2 1.8"/><circle cx="12" cy="16.5" r=".6" fill="currentColor"/></svg>`,
    solutions: `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>`,
    video: `<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="1"/><path d="M17 9.5l4-2.5v10l-4-2.5"/></svg>`,
    book: `<svg class="icon" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>`,
  };

  const FILE_LABEL = {
    pdf: 'ملف PDF / سلايدات',
    summary: 'ملخص وشرح المادة',
    questions: 'أسئلة سنوات سابقة',
    solutions: 'الحلول والواجبات',
    video: 'محاضرة وفيديوهات مسجلة',
    book: 'الكتاب المقرر والمنهاج'
  };

  const categories = [
    { id: 'mandatoryUniversity', name: 'متطلبات الجامعة الإجبارية', spec: 'all' },
    { id: 'optionalUniversity', name: 'متطلبات الجامعة الاختيارية', spec: 'all' },
    { id: 'mandatoryCollege', name: 'متطلبات الكلية الإجبارية', spec: 'all' },
    { id: 'ai_df_mandatory', name: 'DF — إجباري', spec: 'df' },
    { id: 'ai_df_elective', name: 'DF — اختياري', spec: 'df' },
    { id: 'ai_cyber_mandatory', name: 'Cyber — إجباري', spec: 'cyber' },
    { id: 'ai_cyber_elective', name: 'Cyber — اختياري', spec: 'cyber' },
    { id: 'ai_vr_mandatory', name: 'VR — إجباري', spec: 'vr' },
    { id: 'ai_ds_mandatory', name: 'DS — إجباري', spec: 'ds' },
    { id: 'ai_ds_elective', name: 'DS — اختياري', spec: 'ds' },
    { id: 'it_cs_mandatory', name: 'IT / CS — مواد التخصص', spec: 'it' },
    { id: 'labs', name: 'المختبرات', spec: 'all' },
    { id: 'remedial', name: 'مواد الاستدراكي', spec: 'all' },
  ];

  // البيانات القادمة من قاعدة البيانات
  let allCourses = <?= $coursesJson ?: '[]' ?>;
  allCourses.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  let currentCat = 'mandatoryUniversity';
  let currentSpec = 'all';
  let currentFaculty = 'all';
  let currentCourseIdx = 0;

  function monogram(name) {
    if (!name) return 'جا';
    const parts = name.trim().split(' ');
    return parts[0].slice(0, 2);
  }

  function getCoursesByCat(catId) {
    return allCourses.filter(c => {
      if (c.category !== catId) return false;

      if (currentFaculty === 'it') {
        if (c.facultyKey !== 'it' && !(c.faculty || '').includes('تكنولوجيا المعلومات')) return false;
      } else if (currentFaculty === 'ai') {
        if (c.facultyKey === 'it' && !(c.faculty || '').includes('الذكاء الاصطناعي') && !(c.faculty || '').includes('متطلبات') && !(c.faculty || '').includes('عام')) return false;
      }

      if (currentSpec !== 'all') {
        if (c.spec !== 'all' && c.spec !== currentSpec) return false;
      }

      return true;
    });
  }

  function renderCatRow() {
    const row = document.getElementById('catRow');
    if (!row) return;
    row.innerHTML = '';

    categories.forEach(cat => {
      const courses = getCoursesByCat(cat.id);
      const count = courses.length;
      const visible = currentSpec === 'all' || cat.spec === 'all' || cat.spec === currentSpec;

      const el = document.createElement('div');
      el.className = 'cat-tag' + (cat.id === currentCat ? ' active' : '') + (count === 0 ? ' soon' : '');
      el.style.display = visible ? 'inline-block' : 'none';
      el.innerHTML = `<span class="cnt mono">${count > 0 ? String(count).padStart(2, '0') : '—'}</span>${cat.name}`;

      el.onclick = () => {
        currentCat = cat.id;
        currentCourseIdx = 0;
        renderAll();
      };
      row.appendChild(el);
    });
  }

  function renderList() {
    const courses = getCoursesByCat(currentCat);
    const currentCatObj = categories.find(c => c.id === currentCat) || { name: 'المواد' };

    const titleEl = document.getElementById('listTitle');
    const countEl = document.getElementById('listCount');
    const statEl = document.getElementById('statTotal');
    const list = document.getElementById('rowsList');

    if (titleEl) titleEl.textContent = currentCatObj.name;
    if (countEl) countEl.textContent = `${String(courses.length).padStart(2, '0')} مادة`;
    if (statEl) statEl.textContent = courses.length;

    if (!list) return;
    list.innerHTML = '';

    if (courses.length === 0) {
      list.innerHTML = `<div style="padding:24px;color:var(--ink-faint);text-align:center;font-size:13px;">لا توجد مواد مضافة لهذا القسم بعد</div>`;
      return;
    }

    courses.forEach((c, idx) => {
      const fileTypesPresent = (c.files || []).map(f => f.type);
      const dots = ['pdf', 'summary', 'questions', 'solutions', 'video', 'book'].map(f =>
        `<span class="dot ${fileTypesPresent.includes(f) ? 'on' : ''}" title="${FILE_LABEL[f]}"></span>`
      ).join('');

      const row = document.createElement('div');
      row.className = 'row' + (idx === currentCourseIdx ? ' active' : '');
      row.innerHTML = `
      <div class="monogram kufi">${monogram(c.name)}</div>
      <div class="row-text">
        <div class="rt">${c.name}</div>
        <div class="re">${c.nameEn || c.name} · #${c.id}</div>
      </div>
      <div class="row-dots">${dots}</div>
    `;
      row.onclick = () => {
        currentCourseIdx = idx;
        renderList();
        renderDetail();
      };
      list.appendChild(row);
    });
  }

  function renderDetail() {
    const courses = getCoursesByCat(currentCat);
    const c = courses[currentCourseIdx];
    const panel = document.getElementById('detailPanel');
    if (!panel) return;

    if (!c) {
      panel.innerHTML = `<div class="reg-empty">اختر مادة دراسية من القائمة لعرض سجل مصادرها وتحريرها</div>`;
      return;
    }

    const diffLabel = { easy: 'سهلة', mid: 'متوسطة', hard: 'صعبة' }[c.diff || 'mid'];
    const bars = [1, 2, 3, 4, 5].map(n => `<span class="bar ${n <= (c.rating || 4) ? 'on' : ''}"></span>`).join('');

    const currentCatObj = categories.find(cc => cc.id === currentCat) || { name: '' };

    let regRows = '';
    if (c.files && c.files.length > 0) {
      regRows = c.files.map(f => `
      <div class="reg-row" id="fileRow_${f.id}">
        <div class="reg-icon">${ICONS[f.type] || ICONS.pdf}</div>
        <div class="reg-label-wrap">
          <span class="reg-label">${escapeHtml(f.title)}</span>
          <span class="reg-sub-label">${FILE_LABEL[f.type] || 'ملف دراسي'} ${f.instructor ? '· ' + escapeHtml(f.instructor) : ''}</span>
        </div>
        <div class="reg-leader"></div>
        <div class="reg-actions-wrap">
          <a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" class="reg-action">
            <svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            فتح المستند
          </a>
          <button type="button" class="reg-btn-mini" title="تعديل المصدر" onclick="openEditFileModal(${f.id}, '${escapeJs(c.name)}')">
            <svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" class="reg-btn-mini danger" title="حذف الملف" onclick="handleDeleteFile(${f.id}, '${escapeJs(c.name)}')">
            <svg class="icon" viewBox="0 0 24 24" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
    } else {
      regRows = `<div class="reg-empty">لم تُرفع أي مصادر لهذه المادة بعد — اضغط "+ إضافة مصدر" في الأعلى</div>`;
    }

    panel.innerHTML = `
    <div class="breadcrumb">
      <span>${escapeHtml(c.faculty)}</span><span class="sepx">/</span>
      <span>${escapeHtml(currentCatObj.name)}</span><span class="sepx">/</span>
      <span>#${c.id}</span>
    </div>
    
    <div class="detail-head">
      <div class="monogram-lg kufi">${monogram(c.name)}</div>
      <div>
        <h1>${escapeHtml(c.name)}</h1>
        <div class="en">${escapeHtml(c.nameEn || c.name)} · كود: ${escapeHtml(c.code)}</div>
        <div class="meta-row">
          <div><div class="signal">${bars}</div></div>
          <span class="meta-label">تقييم المادة</span>
          <span class="tag ${c.diff || 'mid'}">${diffLabel}</span>
        </div>
      </div>
      <div class="course-actions-top">
        <button type="button" class="btn-action-outline" onclick="openAddFileModal('${escapeJs(c.name)}')">
          <svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          إضافة مصدر
        </button>
        <button type="button" class="btn-action-outline" onclick="openEditCourseModal('${escapeJs(c.name)}')">
          <svg class="icon" viewBox="0 0 24 24" style="width:13px;height:13px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          تعديل المادة
        </button>
        <button type="button" class="btn-action-outline danger" onclick="handleDeleteCourse('${escapeJs(c.name)}')">
          حذف المادة
        </button>
      </div>
    </div>

    <div class="register-title">
      <h3 class="kufi">سجل المصادر والملفات المعتمدة</h3>
      <span class="count">${c.files ? c.files.length : 0} مصادر متوفرة</span>
    </div>

    <div class="register">${regRows}</div>
  `;
  }

  function renderAll() {
    renderCatRow();
    renderList();
    renderDetail();
  }

  function escapeJs(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- MODALS & ACTIONS ---------------- */
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }


  function openEditFileModal(fileId, courseName) {
    const course = allCourses.find(c => c.name === courseName);
    if (!course) return;
    const file = course.files.find(f => f.id === fileId);
    if (!file) return;

    document.getElementById('editFileId').value = file.id;
    document.getElementById('editFileCourseName').value = courseName;
    document.getElementById('editFileCourseDisplay').value = courseName;
    document.getElementById('editFileType').value = file.type || 'summary';
    document.getElementById('editFileTitle').value = file.title || '';
    document.getElementById('editFileUrl').value = file.url || '';
    document.getElementById('editFileInstructor').value = file.instructor || '';
    document.getElementById('editFileDesc').value = file.description || '';

    openModal('editFileModal');
  }

  async function handleUpdateFile(e) {
    e.preventDefault();
    const form = document.getElementById('editFileForm');
    const fd = new FormData(form);

    try {
      const res = await fetch('study_materials.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        closeModal('editFileModal');
        const fileId = parseInt(fd.get('id'));
        const cname = fd.get('course_name');
        const course = allCourses.find(c => c.name === cname);
        if (course) {
          const file = course.files.find(f => f.id === fileId);
          if (file) {
            file.title = fd.get('title');
            file.type = fd.get('material_type');
            file.url = fd.get('file_url');
            file.instructor = fd.get('instructor');
            file.description = fd.get('description');
          }
        }
        renderList();
        renderDetail();
      } else {
        alert(data.error || 'حدث خطأ أثناء تعديل الملف');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم');
    }
  }

  function openEditCourseModal(courseName) {
    const course = allCourses.find(c => c.name === courseName);
    if (!course) return;

    document.getElementById('editCourseOldName').value = course.name;
    document.getElementById('editCourseName').value = course.name;
    document.getElementById('editCourseCode').value = course.code || '';
    document.getElementById('editCourseFaculty').value = course.faculty || 'كلية الذكاء الاصطناعي';

    const catMap = {
      'mandatoryUniversity': 'متطلبات الجامعة الإجبارية',
      'optionalUniversity': 'متطلبات الجامعة الاختيارية',
      'mandatoryCollege': 'متطلبات الكلية الإجبارية',
      'ai_df_mandatory': 'DF — إجباري',
      'ai_df_elective': 'DF — اختياري',
      'ai_cyber_mandatory': 'Cyber — إجباري',
      'ai_cyber_elective': 'Cyber — اختياري',
      'ai_vr_mandatory': 'VR — إجباري',
      'ai_ds_mandatory': 'DS — إجباري',
      'ai_ds_elective': 'DS — اختياري',
      'it_cs_mandatory': 'IT / CS — مواد التخصص',
      'labs': 'المختبرات',
      'remedial': 'مواد الاستدراكي'
    };

    document.getElementById('editCourseCategory').value = catMap[course.category] || 'متطلبات الجامعة الإجبارية';

    openModal('editCourseModal');
  }

  async function handleUpdateCourse(e) {
    e.preventDefault();
    const form = document.getElementById('editCourseForm');
    const fd = new FormData(form);

    try {
      const res = await fetch('study_materials.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        closeModal('editCourseModal');
        location.reload();
      } else {
        alert(data.error || 'حدث خطأ أثناء تعديل المادة');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم');
    }
  }

  function openAddFileModal(courseName) {
    document.getElementById('modalFileCourseName').value = courseName;
    document.getElementById('modalFileCourseDisplay').value = courseName;
    document.getElementById('modalFileTitle').value = '';
    document.getElementById('modalFileUrl').value = '';
    openModal('addFileModal');
  }

  document.getElementById('btnAddCourse').onclick = () => {
    openModal('addCourseModal');
  };

  async function handleSaveFile(e) {
    e.preventDefault();
    const form = document.getElementById('addFileForm');
    const fd = new FormData(form);

    try {
      const res = await fetch('study_materials.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        closeModal('addFileModal');
        const cname = fd.get('course_name');
        const course = allCourses.find(c => c.name === cname);
        if (course) {
          course.files.push({
            id: data.id,
            title: fd.get('title'),
            type: fd.get('material_type'),
            url: fd.get('file_url'),
            instructor: fd.get('instructor'),
            description: fd.get('description'),
            fileType: 'pdf'
          });
        }
        renderList();
        renderDetail();
      } else {
        alert(data.error || 'حدث خطأ أثناء حفظ الملف');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم');
    }
  }

  async function handleSaveCourse(e) {
    e.preventDefault();
    const form = document.getElementById('addCourseForm');
    const fd = new FormData(form);

    try {
      const res = await fetch('study_materials.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        closeModal('addCourseModal');
        location.reload();
      } else {
        alert(data.error || 'حدث خطأ أثناء إضافة المادة');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم');
    }
  }

  async function handleDeleteFile(fileId, courseName) {
    if (!confirm('هل أنت متأكد من حذف هذا المصدر نهائياً؟')) return;
    const fd = new FormData();
    fd.append('csrf', '<?= $csrfToken ?>');
    fd.append('action', 'delete_file');
    fd.append('id', fileId);

    try {
      const res = await fetch('study_materials.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        const course = allCourses.find(c => c.name === courseName);
        if (course) {
          course.files = course.files.filter(f => f.id !== fileId);
        }
        renderList();
        renderDetail();
      } else {
        alert(data.error || 'تعذر حذف الملف');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم');
    }
  }

  async function handleDeleteCourse(courseName) {
    if (!confirm(`هل أنت متأكد من حذف مادة "${courseName}" وكافة ملفاتها نهائياً؟`)) return;
    const fd = new FormData();
    fd.append('csrf', '<?= $csrfToken ?>');
    fd.append('action', 'delete_course');
    fd.append('course_name', courseName);

    try {
      const res = await fetch('study_materials.php', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.success) {
        allCourses = allCourses.filter(c => c.name !== courseName);
        currentCourseIdx = 0;
        renderAll();
      } else {
        alert(data.error || 'تعذر حذف المادة');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم');
    }
  }

  /* ---------------- TABS & SEARCH EVENTS ---------------- */
  document.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      currentSpec = p.dataset.spec;
      renderAll();
    });
  });

  document.querySelectorAll('.faculty-tabs button').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.faculty-tabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentFaculty = b.dataset.fac;
      renderAll();
    });
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('.row').forEach(r => {
      const t = r.querySelector('.rt').textContent.toLowerCase();
      const sub = r.querySelector('.re').textContent.toLowerCase();
      r.style.display = (t.includes(q) || sub.includes(q)) ? '' : 'none';
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    renderAll();
  });
  renderAll();
</script>

<?php require __DIR__ . '/_footer.php'; ?>