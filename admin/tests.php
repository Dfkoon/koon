<?php
/**
 * admin/tests.php — السجل الرسمي لبنك الأسئلة والاختبارات
 */
$page_key = 'tests';
$page_title = 'السجل الرسمي لبنك الأسئلة والاختبارات';
require_once __DIR__ . '/../config.php';

$isAuthenticated = !empty($_SESSION['authenticated']);
$isReadOnly = false;

// Allow read-only access with dev_key for testing/demo purposes
if (!$isAuthenticated && !empty($_GET['dev_key'])) {
  if (hash_equals('dev_makanak_2026_readonly', (string) $_GET['dev_key'])) {
    $isReadOnly = true;
    $isAuthenticated = true;
  }
}

// Require authentication for API calls (write operations)
if (empty($_SESSION['authenticated'])) {
  if ($_SERVER['REQUEST_METHOD'] === 'POST' || !empty($_GET['api'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
  }
  // For GET requests, allow demo access with dev key
  if (!(!empty($_GET['dev_key']) && hash_equals('dev_makanak_2026_readonly', (string) $_GET['dev_key']))) {
    redirect('../login.php');
  }
}

$db = get_db();

// Auto-initialize tables if not exist
$db->exec("
    CREATE TABLE IF NOT EXISTS quiz_subjects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        name_en TEXT,
        icon TEXT DEFAULT 'book',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS quiz_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        title_en TEXT,
        name TEXT,
        subject_id TEXT,
        icon TEXT DEFAULT 'doc',
        color TEXT DEFAULT '#1B3A2E',
        category TEXT DEFAULT 'Quiz',
        duration_minutes INTEGER DEFAULT 30,
        pass_mark REAL DEFAULT 60,
        time_limit INTEGER DEFAULT 30,
        pass_score REAL DEFAULT 60,
        force_english INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        slug TEXT,
        source_id TEXT,
        source_subject_id TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        part_id INTEGER,
        question_text TEXT,
        question_text_en TEXT,
        question_type TEXT DEFAULT 'mcq',
        options_json TEXT,
        correct_answer TEXT,
        marks REAL DEFAULT 1,
        explanation TEXT,
        image_url TEXT,
        code_block TEXT,
        source_part_id TEXT,
        source_subject_id TEXT,
        part_slug TEXT,
        subject_slug TEXT,
        cat TEXT DEFAULT 'Db',
        points REAL DEFAULT 1,
        type TEXT DEFAULT 'mcq',
        diff TEXT DEFAULT 'med',
        text_ar TEXT,
        text_en TEXT,
        code TEXT,
        explanation_ar TEXT,
        model_answer TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS quiz_admin_guides (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        title TEXT NOT NULL DEFAULT 'ملاحظات وتعليمات بنك الأسئلة',
        content TEXT NOT NULL DEFAULT '',
        attachment_url TEXT,
        attachment_type TEXT,
        attachment_name TEXT,
        updated_by INTEGER,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
");
$userId = $_SESSION['user_id'] ?? 0;
$userStmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$userStmt->execute([$userId]);
$currentUserData = $userStmt->fetch(PDO::FETCH_ASSOC);

// Allow read-only access for dev key; require permission for authenticated users
if (!$isReadOnly && !user_has_permission('tests', $currentUserData)) {
  if ($_SERVER['REQUEST_METHOD'] === 'POST' || !empty($_GET['api'])) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
  }
  redirect('stats.php');
}

// For write operations, require authenticated user
if (($_SERVER['REQUEST_METHOD'] === 'POST' || !empty($_GET['api'])) && $isReadOnly) {
  http_response_code(403);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode(['success' => false, 'error' => 'Read-only mode: write operations are not allowed']);
  exit;
}

function normalize_csv_header(string $value): string
{
  $normalized = strtolower(trim($value));
  $normalized = preg_replace('/[\p{Zs}\t\r\n]+/u', '_', $normalized);
  $normalized = preg_replace('/[^\p{L}\p{N}_]+/u', '_', $normalized);
  $normalized = preg_replace('/_+/', '_', $normalized);
  return trim($normalized, '_');
}

function csv_first_value(array $row, array $keys): string
{
  foreach ($keys as $key) {
    if (isset($row[$key]) && trim((string) $row[$key]) !== '') {
      return trim((string) $row[$key]);
    }
  }
  return '';
}

function create_or_get_subject_id(PDO $db, string $subjectName, string $subjectId = ''): string
{
  $subjectName = trim($subjectName);
  if ($subjectName === '' && $subjectId === '') {
    return 'subject_' . bin2hex(random_bytes(4));
  }

  $finalId = trim($subjectId !== '' ? $subjectId : preg_replace('/[^a-zA-Z0-9_\-]+/', '_', $subjectName));
  $finalId = preg_replace('/_+/', '_', $finalId) ?: 'subject_' . bin2hex(random_bytes(4));
  $finalId = trim($finalId, '_');

  if ($finalId === '') {
    $finalId = 'subject_' . bin2hex(random_bytes(4));
  }

  $exists = $db->prepare('SELECT id FROM quiz_subjects WHERE id = ? LIMIT 1');
  $exists->execute([$finalId]);
  if ($exists->fetchColumn()) {
    return $finalId;
  }

  $db->prepare('INSERT INTO quiz_subjects (id, name, name_en, icon, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
    ->execute([$finalId, $subjectName, $subjectName, 'book']);

  return $finalId;
}

function create_or_get_part_id(PDO $db, string $subjectId, string $partName, string $partId = ''): string
{
  $partName = trim($partName);
  if ($partName === '' && $partId === '') {
    return 'part_' . bin2hex(random_bytes(4));
  }

  $finalId = trim($partId !== '' ? $partId : preg_replace('/[^a-zA-Z0-9_\-]+/', '_', $partName));
  $finalId = preg_replace('/_+/', '_', $finalId) ?: 'part_' . bin2hex(random_bytes(4));
  $finalId = trim($finalId, '_');

  if ($finalId === '') {
    $finalId = 'part_' . bin2hex(random_bytes(4));
  }

  $exists = $db->prepare('SELECT slug FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
  $exists->execute([$finalId, $finalId]);
  if ($exists->fetchColumn()) {
    return $finalId;
  }

  $db->prepare('INSERT INTO quiz_parts (title, title_en, name, subject_id, icon, color, category, duration_minutes, pass_mark, time_limit, pass_score, force_english, status, slug, source_id, source_subject_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, "active", ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
    ->execute([
      $partName,
      $partName,
      $partName,
      $subjectId,
      'pencil',
      '#1B3A2E',
      'Quiz',
      30,
      60,
      30,
      60,
      $finalId,
      $finalId,
      $subjectId,
    ]);

  return $finalId;
}

$testsAdmin = in_array($currentUserData['role'] ?? '', ['admin', 'super_admin'], true)
  || (int) ($currentUserData['id'] ?? 0) === 1
  || strtoupper((string) ($currentUserData['username'] ?? '')) === 'HUSSIEN';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_admin_guide') {
  if (!$testsAdmin || !csrf_check($_POST['csrf'] ?? '')) {
    http_response_code(403);
    exit('غير مصرح أو انتهت صلاحية الطلب.');
  }

  $title = trim((string) ($_POST['guide_title'] ?? 'ملاحظات وتعليمات بنك الأسئلة'));
  $content = trim((string) ($_POST['guide_content'] ?? ''));
  $existing = $db->query('SELECT attachment_url, attachment_type, attachment_name FROM quiz_admin_guides WHERE id = 1')->fetch(PDO::FETCH_ASSOC) ?: [];
  $attachmentUrl = $existing['attachment_url'] ?? null;
  $attachmentType = $existing['attachment_type'] ?? null;
  $attachmentName = $existing['attachment_name'] ?? null;

  if (!empty($_POST['remove_guide_attachment'])) {
    $attachmentUrl = $attachmentType = $attachmentName = null;
  }
  if (!empty($_FILES['guide_attachment']['name']) && ($_FILES['guide_attachment']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $file = $_FILES['guide_attachment'];
    $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $allowed = [
      'jpg' => 'image',
      'jpeg' => 'image',
      'png' => 'image',
      'webp' => 'image',
      'mp4' => 'video',
      'webm' => 'video',
      'mov' => 'video',
      'pdf' => 'document',
      'doc' => 'document',
      'docx' => 'document',
    ];
    if (!isset($allowed[$extension]) || (int) $file['size'] > 100 * 1024 * 1024) {
      exit('نوع الملف غير مسموح أو يتجاوز حجمه 100MB.');
    }
    $directory = __DIR__ . '/../uploads/test_guides/';
    if (!is_dir($directory)) {
      mkdir($directory, 0755, true);
    }
    $storedName = 'guide_' . bin2hex(random_bytes(12)) . '.' . $extension;
    if (!move_uploaded_file($file['tmp_name'], $directory . $storedName)) {
      exit('تعذر حفظ المرفق.');
    }
    $attachmentUrl = '../uploads/test_guides/' . $storedName;
    $attachmentType = $allowed[$extension];
    $attachmentName = basename($file['name']);
  }

  $db->prepare('INSERT INTO quiz_admin_guides (id, title, content, attachment_url, attachment_type, attachment_name, updated_by, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content, attachment_url=excluded.attachment_url, attachment_type=excluded.attachment_type, attachment_name=excluded.attachment_name, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP')
    ->execute([$title !== '' ? $title : 'ملاحظات وتعليمات بنك الأسئلة', $content, $attachmentUrl, $attachmentType, $attachmentName, (int) ($currentUserData['id'] ?? 0)]);
  header('Location: tests.php?saved_guide=1');
  exit;
}

$adminGuide = $db->query('SELECT * FROM quiz_admin_guides WHERE id = 1')->fetch(PDO::FETCH_ASSOC) ?: [
  'title' => 'ملاحظات وتعليمات بنك الأسئلة',
  'content' => '',
  'attachment_url' => null,
  'attachment_type' => null,
  'attachment_name' => null,
];

// ---------------- Handle AJAX API actions ----------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!empty($_FILES['csvFile']) || (($_POST['action'] ?? '') === 'import_questions_csv')) {
    if (!csrf_check($_POST['csrf'] ?? '')) {
      http_response_code(400);
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode(['success' => false, 'error' => 'CSRF verification failed']);
      exit;
    }

    $fileTmp = $_FILES['csvFile']['tmp_name'] ?? '';
    if ($fileTmp === '' || !is_readable($fileTmp)) {
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode(['success' => false, 'error' => 'No CSV file uploaded']);
      exit;
    }

    $subjectSelectedId = trim((string) ($_POST['subjectId'] ?? ''));
    $partSelectedId = trim((string) ($_POST['partId'] ?? ''));
    $subjectSelectedName = trim((string) ($_POST['subjectName'] ?? ''));
    $partSelectedName = trim((string) ($_POST['partName'] ?? ''));

    $handle = fopen($fileTmp, 'r');
    if ($handle === false) {
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode(['success' => false, 'error' => 'Unable to read uploaded CSV']);
      exit;
    }

    $header = fgetcsv($handle);
    if ($header === false || count($header) === 0) {
      fclose($handle);
      header('Content-Type: application/json; charset=utf-8');
      echo json_encode(['success' => false, 'error' => 'CSV file is empty']);
      exit;
    }

    $normalizedHeaders = array_map('normalize_csv_header', $header);
    $mappedKeys = [];
    foreach ($normalizedHeaders as $idx => $name) {
      $mappedKeys[$name] = $idx;
    }

    $inserted = 0;
    $skipped = 0;
    $errors = [];
    $validTypes = ['mcq', 'multi', 'multi_select', 'tf', 'true_false', 'short', 'essay'];

    while (($row = fgetcsv($handle)) !== false) {
      if ($row === [null] || count(array_filter($row, fn($v) => trim((string) $v) !== '')) === 0) {
        continue;
      }

      $record = [];
      foreach ($header as $idx => $name) {
        $record[$idx] = $row[$idx] ?? '';
      }

      $recordMap = [];
      foreach ($normalizedHeaders as $idx => $name) {
        $recordMap[$name] = $record[$idx] ?? '';
      }

      $subjectName = trim((string) csv_first_value($recordMap, ['subject', 'subject_name', 'subjectid', 'subject_id', 'subjectidname', 'subject_name_en', 'المادة', 'الموضوع']));
      $partName = trim((string) csv_first_value($recordMap, ['part', 'part_name', 'partid', 'part_id', 'test', 'اختبار', 'الفصل', 'الجزء', 'lesson', 'lesson_name']));
      $qTextAr = trim((string) csv_first_value($recordMap, ['question_text', 'question_text_ar', 'text_ar', 'question', 'question_ar', 'السؤال', 'text', 'question_text_arabic']));
      $qTextEn = trim((string) csv_first_value($recordMap, ['question_text_en', 'question_en', 'text_en', 'english_question']));
      $type = trim(strtolower((string) csv_first_value($recordMap, ['type', 'question_type', 'kind', 'نوع_السؤال', 'نوع السؤال'])));
      $difficulty = trim(strtolower((string) csv_first_value($recordMap, ['difficulty', 'diff', 'level', 'صعوبة', 'الصعوبة'])));
      $points = trim((string) csv_first_value($recordMap, ['points', 'marks', 'score', 'الدرجة', 'النقاط']));
      $option1 = trim((string) csv_first_value($recordMap, ['option_1', 'option1', 'opt1', 'choice_1', 'الخيار_1', 'الخيار1']));
      $option2 = trim((string) csv_first_value($recordMap, ['option_2', 'option2', 'opt2', 'choice_2', 'الخيار_2', 'الخيار2']));
      $option3 = trim((string) csv_first_value($recordMap, ['option_3', 'option3', 'opt3', 'choice_3', 'الخيار_3', 'الخيار3']));
      $option4 = trim((string) csv_first_value($recordMap, ['option_4', 'option4', 'opt4', 'choice_4', 'الخيار_4', 'الخيار4']));
      $correctAnswer = trim((string) csv_first_value($recordMap, ['correct_answer', 'correctanswer', 'answer', 'correct', 'الإجابة_الصحيحة', 'الجواب_الصحيح', 'اجابة_صحيحة', 'الإجابة']));
      $hint = trim((string) csv_first_value($recordMap, ['hint', 'تلميح', 'hint_ar']));
      $explanation = trim((string) csv_first_value($recordMap, ['explanation', 'explanation_ar', 'شرح', 'التفسير']));
      $status = trim((string) csv_first_value($recordMap, ['status', 'الحالة']));

      if ($subjectName === '') {
        $subjectName = $subjectSelectedName !== '' ? $subjectSelectedName : 'عام';
      }
      if ($partName === '') {
        $partName = $partSelectedName !== '' ? $partSelectedName : 'default_part';
      }

      if ($qTextAr === '' && $qTextEn === '') {
        $skipped++;
        $errors[] = 'سؤال تم تخطيه لأن نص السؤال فارغ';
        continue;
      }

      if ($type === '') {
        $type = 'mcq';
      }
      if ($type === 'multi_select' || $type === 'multiple_select' || $type === 'multiple-choice-multiple-answer') {
        $type = 'multi';
      } elseif ($type === 'true_false' || $type === 'truefalse' || $type === 'true/false') {
        $type = 'tf';
      } elseif (!in_array($type, ['mcq', 'multi', 'tf', 'short', 'essay'], true)) {
        $type = 'mcq';
      }
      if (!in_array($difficulty, ['easy', 'medium', 'med', 'hard'], true)) {
        $difficulty = 'med';
      }
      if ($difficulty === 'medium') {
        $difficulty = 'med';
      }

      $subjectId = create_or_get_subject_id($db, $subjectName, $subjectSelectedId);
      $partId = create_or_get_part_id($db, $subjectId, $partName, $partSelectedId);

      $options = [];
      $correctKey = '';
      if (in_array($type, ['mcq', 'multi'], true)) {
        $candidates = [$option1, $option2, $option3, $option4];
        foreach ($candidates as $idx => $text) {
          if (trim((string) $text) === '') {
            continue;
          }
          $letter = chr(65 + $idx);
          $options[] = ['id' => $letter, 'text' => trim((string) $text), 'correct' => false];
        }
        if (count($options) === 0) {
          $skipped++;
          $errors[] = 'سؤال تم تخطيه لأن لا توجد خيارات صالحة';
          continue;
        }

        $answerValues = array_values(array_filter(array_map(
          static fn($value) => strtolower(trim((string) $value)),
          preg_split('/\s*,\s*/', (string) $correctAnswer, -1, PREG_SPLIT_NO_EMPTY)
        )));
        if (count($answerValues) === 0) {
          foreach ($options as $i => $opt) {
            if (str_contains(strtolower((string) $opt['text']), 'true') || str_contains(strtolower((string) $opt['text']), 'صح')) {
              $answerValues = [strtolower((string) chr(65 + $i))];
              break;
            }
          }
        }

        foreach ($options as $i => $opt) {
          $id = strtolower((string) $opt['id']);
          $isCorrect = in_array($id, $answerValues, true)
            || in_array((string) ($i + 1), $answerValues, true)
            || in_array((string) ($i + 1) . '.', $answerValues, true)
            || in_array(strtolower((string) $opt['text']), $answerValues, true);
          if ($isCorrect) {
            $options[$i]['correct'] = true;
          }
        }

        $correctKeys = array_values(array_map(
          static fn($opt) => $opt['id'],
          array_filter($options, static fn($opt) => !empty($opt['correct']))
        ));
        if (count($correctKeys) === 0) {
          $options[0]['correct'] = true;
          $correctKeys = [$options[0]['id']];
        }
        $correctKey = implode(',', $correctKeys);
      } elseif ($type === 'tf') {
        $correctKey = strtolower(trim((string) $correctAnswer));
        if ($correctKey === 'صحيح') {
          $correctKey = 'صح';
        } elseif ($correctKey === 'غير صحيح') {
          $correctKey = 'خطأ';
        }
        if ($correctKey === '' || !in_array($correctKey, ['true', 'false', 'صح', 'خطأ', 't', 'f'], true)) {
          $correctKey = 'true';
        }
        $options = [
          ['id' => 'A', 'text' => 'صح', 'correct' => strtolower($correctKey) === 'true' || strtolower($correctKey) === 'صح' || strtolower($correctKey) === 't'],
          ['id' => 'B', 'text' => 'خطأ', 'correct' => strtolower($correctKey) === 'false' || strtolower($correctKey) === 'خطأ' || strtolower($correctKey) === 'f'],
        ];
      }

      $questionTextAr = $qTextAr !== '' ? $qTextAr : $qTextEn;
      $questionTextEn = $qTextEn !== '' ? $qTextEn : $qTextAr;

      if (find_duplicate_quiz_question_id($db, $partSlug, $questionTextAr, $questionTextEn) !== null) {
        $skipped++;
        continue;
      }

      $subjectSlug = $subjectId;
      $partSlug = $partId;
      $statusValue = ($status !== '' ? $status : 'published');
      $pointsValue = (float) ($points !== '' ? $points : 1);

      $stmt = $db->prepare('INSERT INTO quiz_questions (part_id, question_text, question_text_en, question_type, options_json, correct_answer, marks, explanation, image_url, code_block, source_part_id, source_subject_id, part_slug, subject_slug, cat, points, type, diff, text_ar, text_en, code, explanation_ar, model_answer, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');

      $stmt->execute([
        (int) $db->query('SELECT id FROM quiz_parts WHERE slug = ' . $db->quote($partSlug) . ' LIMIT 1')->fetchColumn(),
        $questionTextAr,
        $questionTextEn,
        $type,
        json_encode($options, JSON_UNESCAPED_UNICODE),
        $correctKey,
        $pointsValue,
        $explanation !== '' ? $explanation : '',
        '',
        '',
        $partSlug,
        $subjectSlug,
        $partSlug,
        $subjectSlug,
        'Db',
        $pointsValue,
        $type,
        $difficulty,
        $questionTextAr,
        $questionTextEn,
        '',
        $explanation !== '' ? $explanation : '',
        '',
      ]);

      $inserted++;
    }

    fclose($handle);
    sync_quizzes_to_frontend($db);
    $fsSynced = false;
    if (function_exists('sync_all_quizzes_to_firestore')) {
      $fsResult = sync_all_quizzes_to_firestore($db);
      $fsSynced = ($fsResult['questions'] ?? 0) > 0;
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
      'success' => true,
      'imported' => $inserted,
      'skipped' => $skipped,
      'errors' => $errors,
      'firestore_synced' => $fsSynced,
    ]);
    exit;
  }

  $rawInput = file_get_contents('php://input');
  $input = json_decode($rawInput, true);
  if (!is_array($input)) {
    $input = $_POST;
  }

  $csrf = $input['csrf'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
  if (!csrf_check($csrf)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'CSRF verification failed']);
    exit;
  }

  require_once __DIR__ . '/../includes/sync_frontend_live.php';

  $action = $input['action'] ?? '';
  header('Content-Type: application/json; charset=utf-8');

  try {
    if ($action === 'save_question') {
      $id = (int) ($input['id'] ?? 0);
      $partId = trim($input['partId'] ?? '');
      $subjectId = trim($input['subjectId'] ?? '');
      $cat = trim($input['cat'] ?? 'Db');
      $points = (float) ($input['points'] ?? 1);
      $type = trim($input['type'] ?? 'mcq');
      $diff = trim($input['diff'] ?? 'med');
      $textAr = trim($input['textAr'] ?? '');
      $textEn = trim($input['textEn'] ?? '');
      $code = (string) ($input['code'] ?? '');
      $options = $input['options'] ?? [];
      $optionsJson = json_encode($options, JSON_UNESCAPED_UNICODE);
      $explanationAr = trim($input['explanationAr'] ?? '');
      $modelAnswer = trim($input['modelAnswer'] ?? '');
      $imageUrl = trim($input['imageUrl'] ?? '');

      $correctAnswer = '';
      if (is_array($options)) {
        foreach ($options as $opt) {
          if (!empty($opt['correct'])) {
            $correctAnswer = $opt['id'] ?? '';
            break;
          }
        }
      }

      $partRow = $db->prepare('SELECT id, slug, subject_id, source_subject_id FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
      $partRow->execute([$partId, $partId]);
      $partInfo = $partRow->fetch(PDO::FETCH_ASSOC) ?: ['id' => 1, 'slug' => (string) $partId, 'subject_id' => '', 'source_subject_id' => ''];
      $intPartId = (int) ($partInfo['id'] ?: 1);
      $resolvedPartSlug = trim((string) ($partId ?: ($partInfo['slug'] ?? '')));
      $resolvedSubjectId = trim((string) ($subjectId ?: ($partInfo['source_subject_id'] ?: ($partInfo['subject_id'] ?? ''))));

      $duplicateId = find_duplicate_quiz_question_id($db, $resolvedPartSlug, $textAr, $textEn, $id);
      if ($duplicateId !== null) {
        echo json_encode(['success' => false, 'error' => 'هذا السؤال موجود مسبقاً في نفس الاختبار.', 'duplicate_id' => $duplicateId], JSON_UNESCAPED_UNICODE);
        exit;
      }

      if ($id > 0) {
        $stmt = $db->prepare('UPDATE quiz_questions SET 
                    part_id = ?, question_text = ?, question_text_en = ?, question_type = ?,
                    options_json = ?, correct_answer = ?, marks = ?, explanation = ?, image_url = ?,
                    code_block = ?, source_part_id = ?, source_subject_id = ?, part_slug = ?,
                    subject_slug = ?, cat = ?, points = ?, type = ?, diff = ?, text_ar = ?,
                    text_en = ?, code = ?, explanation_ar = ?, model_answer = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?');
        $stmt->execute([
          $intPartId,
          $textAr,
          $textEn,
          $type,
          $optionsJson,
          $correctAnswer,
          $points,
          $explanationAr,
          $imageUrl,
          $code,
          $resolvedPartSlug,
          $resolvedSubjectId,
          $resolvedPartSlug,
          $resolvedSubjectId,
          $cat,
          $points,
          $type,
          $diff,
          $textAr,
          $textEn,
          $code,
          $explanationAr,
          $modelAnswer,
          $id
        ]);
        $questionStmt = $db->prepare('SELECT * FROM quiz_questions WHERE id = ? LIMIT 1');
        $questionStmt->execute([$id]);
        $firestoreSynced = firestoreSyncQuestionToFirestore($db, $questionStmt->fetch(PDO::FETCH_ASSOC));
        sync_quizzes_to_frontend($db);
        echo json_encode(['success' => true, 'id' => $id, 'firestore_synced' => $firestoreSynced]);
      } else {
        $stmt = $db->prepare('INSERT INTO quiz_questions (
                    part_id, question_text, question_text_en, question_type, options_json, correct_answer,
                    marks, explanation, image_url, code_block, source_part_id, source_subject_id,
                    part_slug, subject_slug, cat, points, type, diff, text_ar, text_en, code,
                    explanation_ar, model_answer, sort_order, created_at, updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )');
        $stmt->execute([
          $intPartId,
          $textAr,
          $textEn,
          $type,
          $optionsJson,
          $correctAnswer,
          $points,
          $explanationAr,
          $imageUrl,
          $code,
          $resolvedPartSlug,
          $resolvedSubjectId,
          $resolvedPartSlug,
          $resolvedSubjectId,
          $cat,
          $points,
          $type,
          $diff,
          $textAr,
          $textEn,
          $code,
          $explanationAr,
          $modelAnswer
        ]);
        $newId = (int) $db->lastInsertId();
        $questionStmt = $db->prepare('SELECT * FROM quiz_questions WHERE id = ? LIMIT 1');
        $questionStmt->execute([$newId]);
        $firestoreSynced = firestoreSyncQuestionToFirestore($db, $questionStmt->fetch(PDO::FETCH_ASSOC));
        sync_quizzes_to_frontend($db);
        echo json_encode(['success' => true, 'id' => $newId, 'firestore_synced' => $firestoreSynced]);
      }
      exit;
    }

    if ($action === 'delete_question') {
      $id = (int) ($input['id'] ?? 0);
      $firestoreSynced = false;
      if ($id > 0) {
        $questionStmt = $db->prepare('SELECT * FROM quiz_questions WHERE id = ? LIMIT 1');
        $questionStmt->execute([$id]);
        $question = $questionStmt->fetch(PDO::FETCH_ASSOC);
        if ($question) {
          $firestoreSynced = firestoreDeleteQuizQuestionFromRecord($question);
        }
        $stmt = $db->prepare('DELETE FROM quiz_questions WHERE id = ?');
        $stmt->execute([$id]);
        sync_quizzes_to_frontend($db);
      }
      echo json_encode(['success' => true, 'firestore_synced' => $firestoreSynced]);
      exit;
    }

    if ($action === 'bulk_delete_questions') {
      $ids = array_map('intval', (array) ($input['ids'] ?? []));
      $firestoreSynced = true;
      if (!empty($ids)) {
        $inQuery = implode(',', array_fill(0, count($ids), '?'));
        $questionStmt = $db->prepare("SELECT * FROM quiz_questions WHERE id IN ($inQuery)");
        $questionStmt->execute($ids);
        foreach ($questionStmt->fetchAll(PDO::FETCH_ASSOC) as $question) {
          $firestoreSynced = firestoreDeleteQuizQuestionFromRecord($question) && $firestoreSynced;
        }
        $stmt = $db->prepare("DELETE FROM quiz_questions WHERE id IN ($inQuery)");
        $stmt->execute($ids);
        sync_quizzes_to_frontend($db);
      }
      echo json_encode(['success' => true, 'firestore_synced' => $firestoreSynced]);
      exit;
    }

    if ($action === 'reorder_questions') {
      $order = (array) ($input['order'] ?? []);
      $stmt = $db->prepare('UPDATE quiz_questions SET sort_order = ? WHERE id = ?');
      foreach ($order as $idx => $qid) {
        $stmt->execute([(int) $idx, (int) $qid]);
      }
      sync_quizzes_to_frontend($db);
      echo json_encode(['success' => true]);
      exit;
    }

    if ($action === 'save_part') {
      $slug = trim($input['id'] ?? '');
      $subjId = trim($input['subjectId'] ?? '');
      $name = trim($input['name'] ?? '');
      $titleEn = trim($input['titleEn'] ?? '');
      $icon = trim($input['icon'] ?? 'doc');
      $color = trim($input['color'] ?? '#1B3A2E');
      $category = trim($input['category'] ?? 'Quiz');
      $timeLimit = (int) ($input['timeLimit'] ?? 30);
      $passScore = (float) ($input['passScore'] ?? 60);
      $forceEnglish = !empty($input['forceEnglish']) ? 1 : 0;

      if ($slug !== '') {
        $chk = $db->prepare('SELECT rowid FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
        $chk->execute([$slug, $slug]);
        $exists = $chk->fetchColumn();

        if ($exists) {
          $stmt = $db->prepare('UPDATE quiz_parts SET 
                        title = ?, title_en = ?, name = ?, subject_id = ?, icon = ?, color = ?,
                        category = ?, duration_minutes = ?, pass_mark = ?, time_limit = ?,
                        pass_score = ?, force_english = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE slug = ? OR id = ?');
          $stmt->execute([
            $name,
            $titleEn,
            $name,
            $subjId,
            $icon,
            $color,
            $category,
            $timeLimit,
            $passScore,
            $timeLimit,
            $passScore,
            $forceEnglish,
            $slug,
            $slug
          ]);
        } else {
          $stmt = $db->prepare('INSERT INTO quiz_parts (
                        title, title_en, name, subject_id, icon, color, category,
                        duration_minutes, pass_mark, time_limit, pass_score, force_english,
                        status, slug, source_id, source_subject_id, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        "active", ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )');
          $stmt->execute([
            $name,
            $titleEn,
            $name,
            $subjId,
            $icon,
            $color,
            $category,
            $timeLimit,
            $passScore,
            $timeLimit,
            $passScore,
            $forceEnglish,
            $slug,
            $slug,
            $subjId
          ]);
        }
        $firestoreSynced = sync_quiz_part_to_firestore($db, $slug);
        sync_quizzes_to_frontend($db);
      }
      echo json_encode(['success' => true, 'id' => $slug, 'firestore_synced' => $firestoreSynced ?? false]);
      exit;
    }

    if ($action === 'delete_part') {
      $slug = trim($input['id'] ?? '');
      $firestoreSynced = false;
      if ($slug !== '') {
        $firestoreSynced = delete_quiz_part_from_firestore($db, $slug);
        $db->prepare('DELETE FROM quiz_questions WHERE part_slug = ?')->execute([$slug]);
        $db->prepare('DELETE FROM quiz_parts WHERE slug = ? OR id = ?')->execute([$slug, $slug]);
        sync_quizzes_to_frontend($db);
      }
      echo json_encode(['success' => true, 'firestore_synced' => $firestoreSynced]);
      exit;
    }

    if ($action === 'save_subject') {
      $id = trim($input['id'] ?? '');
      $name = trim($input['name'] ?? '');
      $nameEn = trim($input['nameEn'] ?? '');
      $icon = trim($input['icon'] ?? 'book');

      if ($id !== '') {
        $duplicateSubject = $db->prepare('SELECT id FROM quiz_subjects WHERE (id = ? OR name = ? OR name_en = ?) AND id != ? LIMIT 1');
        $duplicateSubject->execute([$id, $name, $nameEn, $id]);
        if ($duplicateSubject->fetchColumn()) {
          echo json_encode(['success' => false, 'error' => 'هذه المادة موجودة بالفعل.']);
          exit;
        }

        $normalizedName = normalize_quiz_subject_name($name);
        if ($normalizedName !== '') {
          $subjects = $db->query('SELECT id, name, name_en FROM quiz_subjects')->fetchAll(PDO::FETCH_ASSOC);
          foreach ($subjects as $subject) {
            if ((string) $subject['id'] === $id) {
              continue;
            }
            $existingNames = array_filter([
              normalize_quiz_subject_name($subject['name'] ?? ''),
              normalize_quiz_subject_name($subject['name_en'] ?? ''),
            ]);
            if (in_array($normalizedName, $existingNames, true)) {
              echo json_encode(['success' => false, 'error' => 'هذه المادة موجودة بالفعل.']);
              exit;
            }
          }
        }

        $firestoreSynced = false;
        $chk = $db->prepare('SELECT id FROM quiz_subjects WHERE id = ?');
        $chk->execute([$id]);
        if ($chk->fetchColumn()) {
          $db->prepare('UPDATE quiz_subjects SET name = ?, name_en = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$name, $nameEn, $icon, $id]);
        } else {
          $db->prepare('INSERT INTO quiz_subjects (id, name, name_en, icon, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
            ->execute([$id, $name, $nameEn, $icon]);
        }
        $firestoreSynced = sync_quiz_subject_to_firestore($db, $id);
        sync_quizzes_to_frontend($db);
      }
      echo json_encode(['success' => true, 'id' => $id, 'firestore_synced' => $firestoreSynced ?? false]);
      exit;
    }

    if ($action === 'delete_subject') {
      $id = trim($input['id'] ?? '');
      if ($id !== '') {
        $partStmt = $db->prepare('SELECT slug, id FROM quiz_parts WHERE subject_id = ?');
        $partStmt->execute([$id]);
        foreach ($partStmt->fetchAll(PDO::FETCH_ASSOC) as $part) {
          delete_quiz_part_from_firestore($db, (string) (($part['slug'] ?? '') ?: $part['id']));
        }
        firestoreDeleteDoc('quiz_subjects', $id);
        $db->prepare('DELETE FROM quiz_questions WHERE subject_slug = ?')->execute([$id]);
        $db->prepare('DELETE FROM quiz_parts WHERE subject_id = ?')->execute([$id]);
        $db->prepare('DELETE FROM quiz_subjects WHERE id = ?')->execute([$id]);
        sync_quizzes_to_frontend($db);
      }
      echo json_encode(['success' => true]);
      exit;
    }

    if ($action === 'sync_all_from_site') {
      $output = [];
      $retCode = 0;
      exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/../scripts/sync_quizzes_from_firestore.php') . ' 2>&1', $output, $retCode);

      if ($retCode === 0) {
        sync_quizzes_to_frontend($db);
      }

      $qCount = (int) $db->query('SELECT count(*) FROM quiz_questions')->fetchColumn();
      $pCount = (int) $db->query('SELECT count(*) FROM quiz_parts')->fetchColumn();
      $sCount = (int) $db->query('SELECT count(*) FROM quiz_subjects')->fetchColumn();

      echo json_encode([
        'success' => $retCode === 0,
        'counts' => [
          'questions' => $qCount,
          'parts' => $pCount,
          'subjects' => $sCount
        ],
        'error' => $retCode === 0 ? null : 'فشل جلب بيانات الاختبارات من Firestore الرسمي',
        'log' => implode("\n", $output)
      ]);
      exit;
    }

    if ($action === 'sync_to_firestore') {
      $partSlug = trim((string) ($input['partId'] ?? ''));
      $res = sync_all_quizzes_to_firestore($db, $partSlug !== '' ? $partSlug : null);
      echo json_encode([
        'success' => true,
        'counts' => $res,
      ]);
      exit;
    }

    if ($action === 'load_questions') {
      $partSlug = trim($input['partId'] ?? '');
      $stmt = $db->prepare('SELECT id, part_slug as partId, subject_slug as subjectId, cat, points, type, diff, text_ar as textAr, text_en as textEn, code, options_json, correct_answer as correctAnswer, explanation_ar as explanationAr, model_answer as modelAnswer, image_url as imageUrl FROM quiz_questions WHERE part_slug = ? ORDER BY sort_order, id');
      $stmt->execute([$partSlug]);
      $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
      foreach ($rows as &$qr) {
        $qr['points'] = (float) ($qr['points'] ?: 1);
        $qr['options'] = !empty($qr['options_json']) ? json_decode($qr['options_json'], true) : [];
        if (!is_array($qr['options']))
          $qr['options'] = [];
        unset($qr['options_json']);
      }
      unset($qr);
      echo json_encode(['success' => true, 'questions' => $rows]);
      exit;
    }

    echo json_encode(['success' => false, 'error' => 'Unknown action']);
    exit;
  } catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
  }
}

// ---------------- Fetch initial data from SQLite for page load ----------------
// Only subjects + parts on load; questions are fetched on-demand via AJAX
$dbSubjectsRows = $db->query('SELECT id, name, name_en, icon FROM quiz_subjects ORDER BY sort_order, name')->fetchAll(PDO::FETCH_ASSOC);

$dbPartsRows = $db->query('SELECT COALESCE(NULLIF(slug, ""), CAST(id AS TEXT)) as id, subject_id, name, title_en as titleEn, icon, color, category, time_limit as timeLimit, pass_score as passScore, force_english as forceEnglish FROM quiz_parts ORDER BY sort_order, name')->fetchAll(PDO::FETCH_ASSOC);
$dbParts = [];
foreach ($dbPartsRows as $pr) {
  $sid = $pr['subject_id'] ?: 'other';
  $pr['forceEnglish'] = (bool) $pr['forceEnglish'];
  $pr['timeLimit'] = (int) ($pr['timeLimit'] ?: 30);
  $pr['passScore'] = (float) ($pr['passScore'] ?: 60);
  if (!isset($dbParts[$sid])) {
    $dbParts[$sid] = [];
  }
  $dbParts[$sid][] = $pr;
}


$dbQuestionsRows = $db->query('SELECT id, part_slug as partId, subject_slug as subjectId, cat, points, type, diff, text_ar as textAr, text_en as textEn, code, options_json, correct_answer as correctAnswer, explanation_ar as explanationAr, model_answer as modelAnswer, image_url as imageUrl FROM quiz_questions ORDER BY sort_order, id')->fetchAll(PDO::FETCH_ASSOC);
$dbQuestions = [];
foreach ($dbQuestionsRows as $qr) {
  $pid = $qr['partId'] ?: 'part_' . (int) $qr['id'];
  $qr['points'] = (float) ($qr['points'] ?: 1);
  try {
    $qr['options'] = !empty($qr['options_json']) ? json_decode($qr['options_json'], true) : [];
    if (!is_array($qr['options']))
      $qr['options'] = [];
  } catch (Exception $e) {
    $qr['options'] = [];
  }
  unset($qr['options_json']);
  if (!isset($dbQuestions[$pid])) {
    $dbQuestions[$pid] = [];
  }
  $dbQuestions[$pid][] = $qr;
}

require __DIR__ . '/_header.php';

?>

<!-- Fonts & Assets for Official Registry -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link
  href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=El+Messiri:wght@500;600;700;800&family=Tajawal:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
  rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.6/purify.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/java.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"></script>


<style>
  /* ============================================================
   DESIGN THESIS — "السجل الرسمي لبنك الأسئلة والاختبارات"
   Clean Modern Palette + IBM Plex Sans Arabic + Master/Detail
   ============================================================ */

  :root {
    --paper: #FAF6EB;
    --paper-deep: #F2EBD9;
    --card: #FFFFFF;
    --ink: #12141C;
    --ink-soft: #5B6172;
    --ink-faint: #9298A6;
    --line: #E3E6EB;
    --line-strong: #D3D7DE;
    --rule: #E2D7C2;
    --rule-strong: #CBBFA8;

    --navy: #1B3A8A;
    --navy-soft: #EAEEFA;
    --leather: #1B3A8A;
    --leather-dark: #12285E;
    --leather-soft: #EAEEFA;
    --leather-line: #B0C4DE;

    --gold: #B98900;
    --gold-soft: #FBF3E1;
    --brass: #B98900;
    --brass-soft: #FBF3E1;
    --brass-line: #E6D3A3;

    --green: #1E7F5C;
    --green-soft: #E7F5F0;
    --red: #9C2B2B;
    --red-soft: #F9E8E8;
    --seal: #9C2B2B;
    --seal-soft: #F9E8E8;

    --code-bg: #0F1220;
    --code-line: #242847;

    --radius-lg: 14px;
    --radius-md: 10px;
    --radius-sm: 8px;
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 10px 25px -10px rgba(0, 0, 0, 0.12);

    --font-display: 'Noto Kufi Arabic', sans-serif;
    --font-body: 'IBM Plex Sans Arabic', sans-serif;
  }

  .registry-page-wrapper {
    background: #F8F9FA;
    color: var(--ink);
    font-family: 'IBM Plex Sans Arabic', sans-serif;
    min-height: 100vh;
    padding-bottom: 50px;
  }

  .kufi {
    font-family: 'Noto Kufi Arabic', sans-serif;
  }

  .mono {
    font-family: 'JetBrains Mono', monospace;
  }

  /* Masthead */
  .registry-page-wrapper .masthead {
    background: linear-gradient(135deg, #1B3A8A, #12285E);
    color: #fff;
    border-radius: var(--radius-lg);
    padding: 22px 28px;
    margin-bottom: 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: var(--shadow-md);
    flex-wrap: wrap;
    gap: 16px;
  }

  .registry-page-wrapper .mh-title {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .registry-page-wrapper .seal-badge {
    width: 50px;
    height: 50px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .registry-page-wrapper .mh-title h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 20px;
    font-weight: 800;
    color: #fff;
  }

  .registry-page-wrapper .mh-title .sub {
    margin: 4px 0 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
  }

  .registry-page-wrapper .tally {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .registry-page-wrapper .tally-item {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    padding: 8px 16px;
    text-align: center;
  }

  .registry-page-wrapper .tally-item b {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    color: #fff;
  }

  .registry-page-wrapper .tally-item span {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.75);
  }

  /* Breadcrumb */
  .registry-page-wrapper .crumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink-soft);
    margin-bottom: 18px;
    padding: 10px 16px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    flex-wrap: wrap;
  }

  .registry-page-wrapper .crumb .seg.on {
    color: var(--navy);
  }

  .registry-page-wrapper .crumb .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--line-strong);
    display: inline-block;
    margin-inline-end: 6px;
  }

  .registry-page-wrapper .crumb .seg.on .dot {
    background: var(--navy);
  }

  .registry-page-wrapper .crumb .arrow {
    color: var(--ink-faint);
    font-weight: 400;
  }

  /* ---------- 3-Column Board Structure ---------- */
  .registry-page-wrapper .board {
    display: grid;
    grid-template-columns: 290px 290px 1fr;
    gap: 16px;
    align-items: start;
    transition: all .28s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @media (max-width: 1200px) {
    .registry-page-wrapper .board {
      grid-template-columns: 260px 260px 1fr;
    }
  }

  @media (max-width: 980px) {
    .registry-page-wrapper .board {
      grid-template-columns: 1fr;
    }
  }

  /* طي القائمة الجانبية (المواد + الاختبارات) */
  .registry-page-wrapper .board.nav-collapsed {
    grid-template-columns: 1fr !important;
  }

  .registry-page-wrapper .board.nav-collapsed .board-nav-col {
    display: none !important;
  }

  .registry-page-wrapper .board.nav-collapsed .questions-panel {
    grid-column: 1 / -1;
    max-width: 100%;
  }

  /* Panels */
  .registry-page-wrapper .panel {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 180px);
    min-height: 520px;
    overflow: hidden;
  }

  .registry-page-wrapper .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }

  .registry-page-wrapper .panel-head h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    font-family: var(--font-display);
  }

  .registry-page-wrapper .panel-head .count {
    font-size: 11.5px;
    color: var(--ink-faint);
    font-weight: 700;
    margin-inline-start: 5px;
    font-family: 'JetBrains Mono', monospace;
  }

  .registry-page-wrapper .btn-add {
    border: 1px dashed var(--leather-line);
    background: var(--leather-soft);
    color: var(--navy);
    font-family: inherit;
    font-size: 12px;
    font-weight: 800;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: .15s;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .registry-page-wrapper .btn-add:hover {
    background: var(--navy);
    color: #fff;
    border-color: var(--navy);
  }

  .registry-page-wrapper .panel-body {
    padding: 12px;
    overflow-y: auto;
    flex: 1;
  }

  /* Row cards for Subjects & Parts */
  .registry-page-wrapper .row-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--line);
    background: #fff;
    border-radius: var(--radius-md);
    padding: 11px 12px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: .15s;
    position: relative;
  }

  .registry-page-wrapper .row-card:hover {
    border-color: var(--navy);
    background: var(--panel);
  }

  .registry-page-wrapper .row-card.active {
    background: var(--navy-soft);
    border-color: var(--navy);
    box-shadow: 0 0 0 2px rgba(27, 58, 138, 0.12);
  }

  .registry-page-wrapper .row-card.active::before {
    content: "";
    position: absolute;
    inset-inline-start: 0;
    top: 10%;
    bottom: 10%;
    width: 4px;
    background: var(--navy);
    border-radius: 0 4px 4px 0;
  }

  .registry-page-wrapper .row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .registry-page-wrapper .row-text .name {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.35;
    color: var(--ink);
  }

  .registry-page-wrapper .row-text .id {
    font-size: 10.5px;
    color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace;
  }

  .registry-page-wrapper .row-text .meta {
    display: flex;
    gap: 6px;
    margin-top: 3px;
    flex-wrap: wrap;
  }

  .registry-page-wrapper .mini-tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--panel);
    border: 1px solid var(--line);
    color: var(--ink-soft);
    font-family: 'JetBrains Mono', monospace;
  }

  .registry-page-wrapper .row-right {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: none;
  }

  .registry-page-wrapper .icon-box {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--navy-soft);
    color: var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex: none;
  }

  .registry-page-wrapper .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid var(--line-strong);
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    cursor: pointer;
    flex: none;
    transition: .15s;
    color: var(--ink-soft);
  }

  .registry-page-wrapper .icon-btn:hover {
    border-color: var(--navy);
    color: var(--navy);
    background: var(--navy-soft);
  }

  .registry-page-wrapper .icon-btn.danger:hover {
    border-color: var(--red);
    color: var(--red);
    background: var(--red-soft);
  }

  /* Search Box */
  .registry-page-wrapper .search-box {
    position: relative;
    margin-bottom: 10px;
  }

  .registry-page-wrapper .search-box input {
    width: 100%;
    border: 1px solid var(--line-strong);
    background: var(--panel);
    border-radius: 8px;
    padding: 9px 34px 9px 12px;
    font-family: inherit;
    font-size: 12.5px;
    outline: none;
    color: var(--ink);
    transition: .15s;
  }

  .registry-page-wrapper .search-box input:focus {
    border-color: var(--navy);
    background: #fff;
  }

  .registry-page-wrapper .search-box .ic {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--ink-faint);
    display: flex;
    align-items: center;
  }

  /* ============================================================
   USER'S DESIGN: QUESTIONS MASTER/DETAIL (Section Style)
   ============================================================ */

  .questions-panel {
    display: flex;
    flex-direction: column;
    min-height: 600px;
    max-height: calc(100vh - 180px);
  }

  /* Header */
  .qsec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    border-bottom: 1px solid var(--line);
    background: #fff;
    flex-wrap: wrap;
    gap: 10px;
  }

  .qsec-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .qsec-title h1 {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 16px;
    font-weight: 800;
    margin: 0;
  }

  .qsec-title .n {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--ink-faint);
  }

  /* Toggle Drawer Button */
  .btn-toggle-drawer {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--panel-2);
    color: var(--ink-soft);
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    padding: 6px 12px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    transition: .15s;
    font-family: inherit;
  }

  .btn-toggle-drawer:hover {
    background: var(--navy-soft);
    color: var(--navy);
    border-color: var(--navy);
  }

  .btn-toggle-drawer.collapsed-state {
    background: var(--navy);
    color: #fff;
    border-color: var(--navy);
  }

  .btn {
    padding: 8px 15px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    transition: .18s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-family: inherit;
  }

  .btn-outline {
    border: 1px solid var(--line-strong);
    color: var(--ink-soft);
    background: #fff;
  }

  .btn-outline:hover {
    border-color: var(--navy);
    color: var(--navy);
  }

  .btn-outline.on {
    border-color: var(--navy);
    color: var(--navy);
    background: var(--navy-soft);
  }

  .btn-solid {
    background: var(--navy);
    color: #fff;
    border: 1px solid var(--navy);
  }

  .btn-solid:hover {
    background: var(--leather-dark);
  }

  .icon {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    flex-shrink: 0;
  }

  /* Search Row in Questions */
  .qsearch-row {
    padding: 12px 22px;
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 12px;
    background: #fff;
  }

  .qsearch-input-box {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    padding: 8px 12px;
    background: var(--panel);
    max-width: 480px;
    flex: 1;
  }

  .qsearch-input-box input {
    border: none;
    background: none;
    outline: none;
    flex: 1;
    font-family: inherit;
    font-size: 12.5px;
    color: var(--ink);
  }

  .qsearch-input-box input::placeholder {
    color: var(--ink-faint);
  }

  /* Stats Row */
  .qstats-row {
    padding: 14px 22px;
    border-bottom: 1px solid var(--line);
    display: flex;
    gap: 28px;
    align-items: flex-end;
    flex-wrap: wrap;
    background: var(--panel);
  }

  .stat-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-block .v {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 17px;
    color: var(--ink);
  }

  .stat-block .l {
    font-size: 11px;
    color: var(--ink-faint);
  }

  .dist {
    flex: 1;
    min-width: 240px;
  }

  .dist-label {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--ink-faint);
    margin-bottom: 5px;
  }

  .dist-bar {
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    display: flex;
    background: var(--panel-2);
  }

  .dist-bar span {
    height: 100%;
  }

  .dist-legend {
    display: flex;
    gap: 16px;
    margin-top: 6px;
  }

  .dist-legend div {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--ink-soft);
  }

  .dist-legend i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    display: inline-block;
  }

  /* Toolbar */
  .qtoolbar-row {
    padding: 10px 22px;
    border-bottom: 1px solid var(--line);
    display: flex;
    gap: 8px;
    background: #fff;
  }

  .qtoolbar-row .btn-outline {
    font-size: 11.5px;
    padding: 6px 12px;
  }

  .prompt-question-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 430px;
    overflow-y: auto;
  }

  .prompt-question-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    cursor: pointer;
  }

  .prompt-question-item:has(input:checked) {
    border-color: var(--green);
    background: #f1f8f4;
  }

  .prompt-question-item input {
    margin-top: 3px;
    accent-color: var(--green);
  }

  .prompt-question-number {
    min-width: 28px;
    color: var(--ink-soft);
    font: 700 12px var(--mono);
  }

  .prompt-question-text {
    flex: 1;
    line-height: 1.7;
    font-size: 13px;
    color: var(--ink);
  }

  /* Bulk action bar */
  .bulk-bar {
    display: none;
    align-items: center;
    gap: 8px;
    background: var(--red-soft);
    border: 1px dashed var(--red);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--red);
  }

  .bulk-bar.open {
    display: flex;
  }

  .bulk-bar button {
    border: none;
    background: var(--red);
    color: #fff;
    border-radius: 6px;
    padding: 4px 10px;
    font-weight: 700;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .bulk-bar button.ghost {
    background: #fff;
    color: var(--red);
    border: 1px solid var(--red);
  }

  /* Master / Detail (qbody) */
  .qbody {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    overflow: hidden;
  }

  @media (max-width: 900px) {
    .qbody {
      grid-template-columns: 1fr;
    }
  }

  /* Index Pane (qindex) */
  .qindex {
    border-left: 1px solid var(--line);
    overflow-y: auto;
    background: #fff;
  }

  .qrow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    transition: .15s;
    position: relative;
  }

  .qrow:hover {
    background: var(--panel);
  }

  .qrow.active {
    background: var(--navy-soft);
  }

  .qrow.active::before {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: var(--navy);
  }

  .qnum {
    width: 32px;
    height: 32px;
    border-radius: 7px;
    border: 1.5px solid var(--line-strong);
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 11.5px;
    color: var(--ink-soft);
    flex-shrink: 0;
  }

  .qrow.active .qnum {
    border-color: var(--navy);
    color: var(--navy);
  }

  .qrow-text {
    flex: 1;
    min-width: 0;
  }

  .qrow-text .qt {
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--ink);
  }

  .qrow-text .qm {
    display: flex;
    gap: 5px;
    margin-top: 4px;
    align-items: center;
  }

  .dchip {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }

  .dchip.easy {
    background: var(--green);
  }

  .dchip.mid {
    background: var(--gold);
  }

  .dchip.hard {
    background: var(--red);
  }

  .qrow .pts {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-faint);
    flex-shrink: 0;
  }

  /* Detail Pane (qdetail) */
  .qdetail {
    padding: 26px 32px;
    overflow-y: auto;
    background: #fff;
  }

  .qd-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .qd-tags {
    display: flex;
    gap: 7px;
    align-items: center;
    flex-wrap: wrap;
  }

  .tag {
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    border: 1px solid;
  }

  .tag.easy {
    color: var(--green);
    background: var(--green-soft);
    border-color: #cdeadf;
  }

  .tag.mid {
    color: var(--gold);
    background: var(--gold-soft);
    border-color: #f2e2b8;
  }

  .tag.hard {
    color: var(--red);
    background: var(--red-soft);
    border-color: #eec9c9;
  }

  .tag.neutral {
    color: var(--ink-soft);
    background: var(--panel);
    border-color: var(--line-strong);
  }

  .qd-actions {
    display: flex;
    gap: 6px;
  }

  .qd-prompt {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.7;
    margin-bottom: 22px;
    color: var(--ink);
  }

  /* IDE code view */
  .ide {
    background: var(--code-bg);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 24px;
    border: 1px solid #1b1f38;
  }

  .ide-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 15px;
    border-bottom: 1px solid var(--code-line);
  }

  .ide-bar .lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: #8890c2;
    letter-spacing: .5px;
  }

  .ide-dots {
    display: flex;
    gap: 6px;
  }

  .ide-dots span {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }

  .ide-dots span:nth-child(1) {
    background: #3fbf5f;
  }

  .ide-dots span:nth-child(2) {
    background: #e0a941;
  }

  .ide-dots span:nth-child(3) {
    background: #e05a5a;
  }

  .ide-code {
    padding: 18px 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.9;
    color: #c9cdf0;
    overflow-x: auto;
    margin: 0;
  }

  /* Options */
  .options-title {
    font-family: 'Noto Kufi Arabic', sans-serif;
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .options-title .count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--ink-faint);
    font-weight: 400;
  }

  .options {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin-bottom: 24px;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border: 1.5px solid var(--line-strong);
    border-radius: 9px;
    transition: .15s;
    background: #fff;
  }

  .opt.correct {
    border-color: var(--green);
    background: var(--green-soft);
  }

  .opt-mark {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid var(--line-strong);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-faint);
  }

  .opt.correct .opt-mark {
    border-color: var(--green);
    color: var(--green);
    background: #fff;
  }

  .opt-text {
    flex: 1;
    font-size: 13px;
    color: var(--ink);
  }

  .opt-status {
    font-size: 11px;
    font-weight: 700;
    color: var(--green);
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .qd-footer {
    display: flex;
    justify-content: space-between;
    padding-top: 18px;
    border-top: 1px dashed var(--line-strong);
    font-size: 11.5px;
    color: var(--ink-faint);
    font-family: 'JetBrains Mono', monospace;
    flex-wrap: wrap;
    gap: 8px;
  }

  .qplaceholder-box {
    height: 100%;
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--ink-faint);
    text-align: center;
    gap: 10px;
    padding: 30px;
  }

  .qplaceholder-box p {
    margin: 0;
    font-size: 13.5px;
    font-weight: 700;
  }

  .qplaceholder-box .hint {
    font-size: 12px;
    color: var(--ink-faint);
  }

  /* ============================================================
   MODALS & OVERLAYS (.reg-overlay, .reg-modal, etc.)
   ============================================================ */
  .reg-overlay {
    position: fixed;
    inset: 0;
    background: rgba(18, 20, 28, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    overflow-y: auto;
  }

  .reg-overlay.open {
    display: flex !important;
  }

  .reg-modal {
    background: #FFFFFF;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 780px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    animation: modalPop .2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modalPop {
    0% {
      opacity: 0;
      transform: scale(0.96) translateY(10px);
    }

    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .reg-modal-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 22px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }

  .reg-modal-head .title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .reg-modal-head h3 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
  }

  .reg-x-btn {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    border: 1px solid var(--line-strong);
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--ink-soft);
    transition: .15s;
  }

  .reg-x-btn:hover {
    background: var(--red-soft);
    color: var(--red);
    border-color: var(--red);
  }

  .reg-nav-arrows {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .reg-nav-arrow {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--line-strong);
    background: #fff;
    cursor: pointer;
    font-size: 13px;
    font-weight: 800;
  }

  .reg-nav-arrow:hover {
    background: var(--navy-soft);
    color: var(--navy);
  }

  .reg-modal-body {
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
  }

  .reg-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
  }

  @media (max-width: 600px) {
    .reg-form-row {
      grid-template-columns: 1fr;
    }
  }

  .reg-f-field {
    margin-bottom: 14px;
  }

  .reg-f-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-soft);
    margin-bottom: 5px;
  }

  .reg-stepper {
    display: flex;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    overflow: hidden;
    width: 140px;
    background: var(--panel);
  }

  .reg-stepper button {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
  }

  .reg-stepper button:hover {
    background: var(--line-strong);
  }

  .reg-stepper input {
    width: 68px;
    border: none;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13.5px;
    font-weight: 700;
    background: transparent;
    outline: none;
  }

  .reg-select-wrap {
    position: relative;
  }

  .reg-select-box {
    width: 100%;
    border: 1px solid var(--line-strong);
    background: var(--panel);
    border-radius: 8px;
    padding: 9px 12px;
    font-size: 12.5px;
    font-family: inherit;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--ink);
  }

  .reg-select-panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    left: 0;
    background: #fff;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    z-index: 100;
    overflow: hidden;
    display: none;
  }

  .reg-select-panel.open {
    display: block;
  }

  .reg-select-opt {
    padding: 9px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .reg-select-opt:hover,
  .reg-select-opt.sel {
    background: var(--navy-soft);
    color: var(--navy);
  }

  .reg-modal textarea,
  .reg-modal input[type=text] {
    width: 100%;
    border: 1px solid var(--line-strong);
    background: var(--panel);
    border-radius: 8px;
    padding: 9px 12px;
    font-family: inherit;
    font-size: 12.5px;
    outline: none;
    color: var(--ink);
    transition: .15s;
  }

  .reg-modal textarea:focus,
  .reg-modal input[type=text]:focus {
    border-color: var(--navy);
    background: #fff;
  }

  .reg-modal textarea.code-input {
    background: var(--code-bg);
    color: #D9DED0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    min-height: 90px;
    direction: ltr;
    text-align: left;
  }

  .reg-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 5px;
  }

  .reg-tbtn {
    width: 24px;
    height: 24px;
    border: 1px solid var(--line-strong);
    background: #fff;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
  }

  .reg-mini-link {
    font-size: 11px;
    font-weight: 700;
    color: var(--navy);
    cursor: pointer;
  }

  .reg-opt-edit {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 8px;
    background: var(--panel);
  }

  .reg-opt-edit.correct {
    border-color: var(--green);
    background: var(--green-soft);
  }

  .reg-opt-edit-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .reg-opt-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .reg-correct-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .reg-correct-badge {
    font-size: 10px;
    font-weight: 800;
    background: var(--green);
    color: #fff;
    padding: 2px 7px;
    border-radius: 999px;
  }

  .reg-dashed-btn {
    width: 100%;
    border: 1.5px dashed var(--leather-line);
    background: var(--leather-soft);
    color: var(--navy);
    border-radius: 8px;
    padding: 9px;
    font-family: inherit;
    font-weight: 800;
    font-size: 12px;
    cursor: pointer;
  }

  .reg-modal-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 22px;
    border-top: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    flex-wrap: wrap;
    gap: 8px;
  }

  .reg-btn-primary {
    background: var(--navy);
    color: #fff;
    border: none;
    padding: 8px 20px;
    border-radius: 7px;
    font-weight: 800;
    font-size: 12.5px;
    cursor: pointer;
    font-family: inherit;
  }

  .reg-btn-ghost2 {
    background: #fff;
    color: var(--ink-soft);
    border: 1px solid var(--line-strong);
    padding: 8px 16px;
    border-radius: 7px;
    font-weight: 700;
    font-size: 12.5px;
    cursor: pointer;
    font-family: inherit;
  }

  #toast-host {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--ink);
    color: #fff;
    padding: 10px 18px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    box-shadow: var(--shadow-md);
    animation: modalPop .2s ease;
  }

  .toast.danger {
    background: var(--red);
  }

  .toast .undo-btn {
    border: 1px solid rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    border-radius: 5px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }


  /* ============================================================
   GLOBAL QUESTION BANK ANALYTICS BANNER (.global-analytics-panel)
   ============================================================ */
  .global-analytics-panel {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 20px 24px;
    margin-bottom: 20px;
    box-shadow: var(--shadow-sm);
  }

  .ga-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
    flex-wrap: wrap;
    gap: 12px;
    padding-bottom: 14px;
    border-bottom: 1px dashed var(--line-strong);
  }

  .ga-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ga-icon-box {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--navy-soft);
    color: var(--navy);
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }

  .ga-title {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 16.5px;
    font-weight: 800;
    color: var(--ink);
  }

  .ga-sub {
    margin: 0;
    font-size: 12px;
    color: var(--ink-faint);
    font-weight: 500;
  }

  .ga-pills-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }

  .ga-pill {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    transition: .15s;
  }

  .ga-pill:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  .ga-pill .p-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px;
    font-weight: 800;
    color: var(--ink);
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .ga-pill .p-lbl {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink-soft);
  }

  .ga-pill.purple {
    border-inline-start: 3.5px solid #6366F1;
  }

  .ga-pill.blue {
    border-inline-start: 3.5px solid var(--navy);
  }

  .ga-pill.green {
    border-inline-start: 3.5px solid var(--green);
  }

  .ga-pill.amber {
    border-inline-start: 3.5px solid var(--gold);
  }

  .ga-pill.red {
    border-inline-start: 3.5px solid var(--red);
  }

  .ga-pill.gold {
    border-inline-start: 3.5px solid #D97706;
  }

  .ga-chart-box {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 16px 20px;
  }

  .ga-chart-title {
    font-size: 12.5px;
    font-weight: 700;
    color: var(--ink-soft);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ga-chart-container {
    height: 200px;
    position: relative;
    width: 100%;
  }
</style>


<div class="registry-page-wrapper" id="registryApp">

  <?php if ($testsAdmin || !empty($adminGuide['content']) || !empty($adminGuide['attachment_url'])): ?>
    <section
      style="margin-bottom:18px;background:#fff;border:1px solid #d9e0eb;border-radius:14px;padding:18px 20px;box-shadow:0 8px 24px rgba(27,58,138,.06);">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
            <span style="font-size:20px;">📘</span>
            <h2 style="margin:0;color:#12285e;font-size:18px;">
              <?= $testsAdmin ? 'ملاحظات وطريقة العمل في بنك الأسئلة' : 'ملاحظات الإدارة لبنك الأسئلة' ?>
            </h2>
          </div>
          <?php if ($testsAdmin): ?>
            <p style="margin:0;color:#687386;font-size:12px;line-height:1.7;">أضف تعليمات للأدمن حول إنشاء الأسئلة أو
              استيرادها، وارفق صورة أو فيديو يوضح الخطوات.</p>
          <?php endif; ?>
        </div>
        <?php if (!empty($_GET['saved_guide'])): ?>
          <span
            style="background:#e7f5f0;color:#1e7f5c;border:1px solid #b9e4d3;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:800;">تم
            حفظ التعليمات</span>
        <?php endif; ?>
      </div>

      <?php if ($testsAdmin): ?>
        <form method="post" enctype="multipart/form-data" style="margin-top:14px;display:grid;gap:10px;">
          <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
          <input type="hidden" name="action" value="save_admin_guide">
          <input type="text" name="guide_title" value="<?= htmlspecialchars($adminGuide['title'] ?? '') ?>"
            placeholder="عنوان الملاحظات"
            style="width:100%;border:1px solid #d9e0eb;border-radius:8px;padding:10px;font:inherit;">
          <textarea name="guide_content" rows="4"
            placeholder="اكتب خطوات إضافة السؤال اليدوي، طريقة اختيار النوع والإجابة، أو طريقة إرفاق بنك الأسئلة..."
            style="width:100%;resize:vertical;border:1px solid #d9e0eb;border-radius:8px;padding:10px;font:inherit;line-height:1.7;"><?= htmlspecialchars($adminGuide['content'] ?? '') ?></textarea>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label
              style="display:inline-flex;align-items:center;gap:8px;background:#f5f7fb;border:1px dashed #b8c4d6;border-radius:8px;padding:9px 12px;color:#334155;font-size:12px;font-weight:700;cursor:pointer;">
              📎 إرفاق صورة أو فيديو أو ملف PDF/Word
              <input type="file" name="guide_attachment" accept="image/*,video/*,.pdf,.doc,.docx" style="display:none;">
            </label>
            <?php if (!empty($adminGuide['attachment_url'])): ?>
              <span style="font-size:11px;color:#64748b;">المرفق الحالي:
                <?= htmlspecialchars($adminGuide['attachment_name'] ?? 'ملف مرفق') ?></span>
              <label style="font-size:11px;color:#b91c1c;"><input type="checkbox" name="remove_guide_attachment" value="1">
                إزالة المرفق</label>
            <?php endif; ?>
            <button type="submit"
              style="margin-right:auto;background:#1b3a8a;color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;">حفظ
              الملاحظات والمرفق</button>
          </div>
        </form>
      <?php endif; ?>

      <?php if (!empty($adminGuide['content']) || !empty($adminGuide['attachment_url'])): ?>
        <div
          style="margin-top:14px;padding-top:14px;border-top:1px solid #edf0f5;color:#334155;font-size:13px;line-height:1.8;">
          <?php if (!empty($adminGuide['content'])): ?>
            <div><?= nl2br(htmlspecialchars($adminGuide['content'])) ?></div>
          <?php endif; ?>
          <?php if (($adminGuide['attachment_type'] ?? '') === 'image'): ?>
            <img src="<?= htmlspecialchars($adminGuide['attachment_url']) ?>" alt="مرفق تعليمات بنك الأسئلة"
              style="display:block;max-width:100%;max-height:360px;margin-top:12px;border-radius:10px;border:1px solid #d9e0eb;">
          <?php elseif (($adminGuide['attachment_type'] ?? '') === 'video'): ?>
            <video controls
              style="display:block;width:min(100%,720px);max-height:380px;margin-top:12px;border-radius:10px;background:#0f172a;">
              <source src="<?= htmlspecialchars($adminGuide['attachment_url']) ?>">
            </video>
          <?php elseif (!empty($adminGuide['attachment_url'])): ?>
            <a href="<?= htmlspecialchars($adminGuide['attachment_url']) ?>" target="_blank" rel="noopener"
              style="display:inline-block;margin-top:10px;color:#1b3a8a;font-weight:800;">📄 فتح المرفق:
              <?= htmlspecialchars($adminGuide['attachment_name'] ?? 'الملف') ?></a>
          <?php endif; ?>
        </div>
      <?php endif; ?>
    </section>
  <?php endif; ?>

  <div class="masthead">
    <div class="mh-title">
      <div class="seal-badge">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <line x1="8" y1="7" x2="16" y2="7" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>
      <div>
        <h1>السجل الرسمي لبنك الأسئلة</h1>
        <p class="sub">اختر مادة، ثم اختباراً، لعرض الأسئلة وتحريرها وتصديرها.</p>
      </div>
    </div>
    <div class="tally" id="tally"></div>
  </div>

  <div class="crumb" id="crumb"></div>

  <!-- Full-Width Difficulty & Flow Analytics Section at Top -->
  <div id="difficultySectionHost"></div>

  <div class="board" id="testsBoard">
    <!-- 1. عمود المواد الدراسية (المواد) -->
    <div class="panel board-nav-col" id="subjectsPanelCol">
      <div class="panel-head">
        <h2>المواد الدراسية <span class="count" id="subjCount"></span></h2>
        <button class="btn-add" id="addSubjectBtn">+ مادة جديدة</button>
      </div>
      <div class="panel-body" id="subjectList">
        <div class="search-box">
          <input type="text" id="subjectSearch" placeholder="ابحث باسم المادة أو المعرف...">
          <span class="ic"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg></span>
        </div>
        <div id="subjectItems"></div>
      </div>
    </div>

    <!-- 2. عمود الأجزاء / الاختبارات -->
    <div class="panel board-nav-col" id="partsPanelCol">
      <div class="panel-head">
        <h2>الأجزاء / الاختبارات <span class="count" id="partCount"></span></h2>
        <button class="btn-add" id="addPartBtn">+ اختبار جديد</button>
      </div>
      <div class="panel-body" id="partList"></div>
    </div>

    <!-- 3. عمود أسئلة الاختبار بنظام Master / Detail من تصميم المستخدم -->
    <div class="panel questions-panel" id="questionsPanel">
      <!-- رأس القسم -->
      <div class="qsec-head">
        <div class="qsec-title">
          <button type="button" class="btn-toggle-drawer" id="toggleDrawerBtn"
            title="طي/إظهار لوحة المواد والاختبارات لتوسيع مساحة الأسئلة">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span id="toggleDrawerText">طي المواد والاختبارات</span>
          </button>
          <h1 class="kufi">أسئلة الاختبار</h1>
          <span class="n mono" id="qCount"></span>
        </div>
        <div class="head-actions" style="display:flex;gap:8px;">
          <button class="btn btn-outline" id="selectModeBtn">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M9 12.5l2.2 2.2L16 9.5" />
              <rect x="3" y="3" width="18" height="18" rx="4" />
            </svg>
            تحديد
          </button>
          <button class="btn btn-solid" id="addQuestionBtn">
            <svg class="icon" viewBox="0 0 24 24" style="stroke:#fff">
              <path d="M12 5v14M5 12h14" />
            </svg>
            إضافة سؤال
          </button>
        </div>
      </div>

      <!-- شريط البحث والمحدد -->
      <div class="qsearch-row" id="qSearchRow" style="display:none;">
        <div class="qsearch-input-box">
          <svg class="icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.6" y2="16.6" />
          </svg>
          <input type="text" id="qSearchInput" placeholder="ابحث في نص الأسئلة...">
        </div>
        <div class="bulk-bar" id="bulkBar">
          <span>محدد: <span id="selCount">0</span></span>
          <button id="bulkDelete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg> حذف المحدد</button>
          <button class="ghost" id="bulkClear">إلغاء التحديد</button>
        </div>
      </div>

      <!-- شريط الإحصائيات -->
      <div class="qstats-row" id="qStatsRow" style="display:none;">
        <div class="stat-block"><span class="v mono" id="qStatDuration">30 د</span><span class="l"
            id="qStatAvgTime">المدة</span></div>
        <div class="stat-block"><span class="v mono" id="qStatTotalPts">0</span><span class="l">مجموع العلامات</span>
        </div>
        <div class="dist">
          <div class="dist-label">
            <span>توزيع مستويات الصعوبة</span>
            <span class="mono" id="qStatDistTotal">0 سؤال</span>
          </div>
          <div class="dist-bar" id="qStatDistBar">
            <span id="qBarEasy" style="width:0%; background:var(--green);"></span>
            <span id="qBarMed" style="width:0%; background:var(--gold);"></span>
            <span id="qBarHard" style="width:0%; background:var(--red);"></span>
          </div>
          <div class="dist-legend">
            <div><i style="background:var(--green)"></i>سهل — <span id="qStatEasyCount">0</span></div>
            <div><i style="background:var(--gold)"></i>متوسط — <span id="qStatMedCount">0</span></div>
            <div><i style="background:var(--red)"></i>صعب — <span id="qStatHardCount">0</span></div>
          </div>
        </div>
      </div>

      <!-- شريط الأدوات: خلط الأسئلة والخيارات -->
      <div class="qtoolbar-row" id="qToolbarRow" style="display:none;">
        <button class="btn btn-outline" id="importCsvBtn">
          <svg class="icon" viewBox="0 0 24 24" width="14" height="14">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
          </svg>
          استيراد CSV
        </button>
        <button class="btn btn-outline" id="shuffleQuestionsBtn">
          <svg class="icon" viewBox="0 0 24 24" width="14" height="14">
            <path d="M4 4l16 16M20 4L4 20" />
          </svg>
          ترتيب عشوائي للأسئلة
        </button>
        <button class="btn btn-outline" id="shuffleOptionsBtn">
          <svg class="icon" viewBox="0 0 24 24" width="14" height="14">
            <path d="M17 2l4 4-4 4M3 12h18M7 22l-4-4 4-4M21 12H3" />
          </svg>
          ترتيب عشوائي للخيارات
        </button>
        <button class="btn btn-outline" id="generatePromptBtn">
          <svg class="icon" viewBox="0 0 24 24" width="14" height="14">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
          </svg>
          توليد البرومت
        </button>
      </div>

      <!-- منطقة العرض Master/Detail -->
      <div class="qbody" id="qBodyContainer">
        <!-- فهرس الأسئلة -->
        <aside class="qindex" id="qIndex">
          <div class="qplaceholder-box">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <p>اختر اختباراً</p>
          </div>
        </aside>
        <!-- تفاصيل السؤال -->
        <div class="qdetail" id="qDetail">
          <div class="qplaceholder-box">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
              opacity=".4">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>اختر اختباراً أولاً</p>
            <span class="hint">ثم اختر سؤالاً من القائمة لعرض تفاصيله</span>
          </div>
        </div>
      </div>
    </div>
  </div>



  <div id="printArea"></div>

  <!-- Question editor modal -->
  <div class="reg-overlay" id="overlay">
    <div class="reg-modal">
      <div class="reg-modal-head">
        <div class="title">
          <button class="reg-x-btn" id="closeModal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg></button>
          <h3 id="modalTitle">إضافة سؤال جديد</h3>
        </div>
        <div class="reg-nav-arrows">
          <span class="pos" id="navPos"></span>
          <button class="reg-nav-arrow" id="prevQ" title="السؤال السابق">›</button>
          <button class="reg-nav-arrow" id="nextQ" title="السؤال التالي">‹</button>
        </div>
      </div>

      <div class="reg-modal-body">

        <div class="reg-form-row">
          <div class="reg-f-field">
            <div class="reg-f-label"><span>الدرجات / العلامات</span></div>
            <div class="reg-stepper">
              <button type="button" id="ptsMinus">−</button>
              <input type="text" id="ptsInput" value="1">
              <button type="button" id="ptsPlus">+</button>
            </div>
          </div>

          <div class="reg-f-field">
            <div class="reg-f-label"><span>نوع السؤال</span></div>
            <div class="reg-select-wrap">
              <button type="button" class="reg-select-box" id="typeBox">
                <span id="typeLabel">اختيار من متعدد (MCQ)</span>
                <span class="chev">▾</span>
              </button>
              <div class="reg-select-panel" id="typePanel">
                <div class="reg-select-opt sel" data-val="mcq">اختيار من متعدد (MCQ)</div>
                <div class="reg-select-opt" data-val="multi">اختيار متعدد الإجابات (Multi-Select)</div>
                <div class="reg-select-opt" data-val="tf">صح أم خطأ (True/False)</div>
                <div class="reg-select-opt" data-val="short">إجابة قصيرة (Short Answer)</div>
                <div class="reg-select-opt" data-val="essay">مقالي (Essay)</div>
              </div>
            </div>
          </div>
        </div>

        <div class="reg-f-field">
          <div class="reg-f-label"><span>مستوى الصعوبة</span></div>
          <div class="reg-select-wrap">
            <button type="button" class="reg-select-box" id="diffBox">
              <span id="diffLabel">متوسط</span>
              <span class="chev">▾</span>
            </button>
            <div class="reg-select-panel" id="diffPanel">
              <div class="reg-select-opt" data-val="easy">سهل</div>
              <div class="reg-select-opt sel" data-val="med">متوسط</div>
              <div class="reg-select-opt" data-val="hard">صعب</div>
            </div>
          </div>
        </div>

        <div class="reg-f-field">
          <div class="reg-f-label">
            <span>نص السؤال – عربي</span>
            <button type="button" class="reg-mini-link" data-tr="ar">ترجم إلى الإنجليزي ⟵</button>
          </div>
          <div class="reg-toolbar" data-target="qAr">
            <button class="reg-tbtn" data-wrap="strong">B</button>
            <button class="reg-tbtn" data-wrap="em"><i>I</i></button>
            <button class="reg-tbtn" data-wrap="u"><u>U</u></button>
            <button class="reg-tbtn" data-wrap="code">&lt;/&gt;</button>
            <div class="reg-tsep"></div>
            <span class="reg-swatch" style="background:#9C7A2E" data-color="#9C7A2E"></span>
            <span class="reg-swatch" style="background:#7A2321" data-color="#7A2321"></span>
            <span class="reg-swatch" style="background:#2C4F73" data-color="#2C4F73"></span>
            <span class="reg-swatch" style="background:#1B3A2E" data-color="#1B3A2E"></span>
          </div>
          <textarea id="qAr" placeholder="اكتب السؤال هنا..."></textarea>
          <div class="field-error" id="err-qAr">يرجى كتابة نص السؤال بالعربية.</div>
        </div>

        <div class="reg-f-field">
          <div class="reg-f-label">
            <span>نص السؤال – إنجليزي</span>
            <button type="button" class="reg-mini-link" data-tr="en">⟶ ترجم إلى العربي</button>
          </div>
          <div class="reg-toolbar" data-target="qEn">
            <button class="reg-tbtn" data-wrap="strong">B</button>
            <button class="reg-tbtn" data-wrap="em"><i>I</i></button>
            <button class="reg-tbtn" data-wrap="u"><u>U</u></button>
            <button class="reg-tbtn" data-wrap="code">&lt;/&gt;</button>
          </div>
          <textarea id="qEn" class="q-en" placeholder="Type question here..."></textarea>
        </div>

        <div class="reg-f-field">
          <div class="reg-f-label"><span>كود برمجي مرافق للسؤال (اختياري)</span></div>
          <textarea id="qCode" class="code-input" placeholder="أدخل الكود البرمجي هنا..."></textarea>
          <div class="reg-field-hint">يُعرض داخل نافذة IDE ويُلوَّن تلقائياً كـ Java.</div>
        </div>

        <div class="reg-f-field" id="optionsField">
          <div class="reg-f-label"><span>الخيارات – حدد الإجابة الصحيحة</span></div>
          <div id="optionsWrap"></div>
          <button type="button" class="reg-dashed-btn" id="addOptBtn">+ إضافة خيار</button>
          <div class="field-error" id="err-opts">يرجى تحديد إجابة صحيحة واحدة على الأقل وملء نص الخيارات.</div>
        </div>

        <div class="reg-f-field" id="shortAnswerField" style="display:none;">
          <div class="reg-f-label"><span>نموذج الإجابة (اختياري)</span></div>
          <textarea id="modelAnswer" placeholder="اكتب نموذج إجابة استرشادي..."></textarea>
        </div>

        <div class="reg-f-field">
          <div class="reg-f-label"><span>الشرح التوضيحي (اختياري)</span></div>
          <textarea id="qExplain" placeholder="يظهر للطالب في وضع التدريب بعد الإجابة..."></textarea>
        </div>

        <div class="reg-f-field">
          <div class="reg-f-label"><span>صورة السؤال (اختياري)</span></div>
          <div class="reg-dropzone" id="dropzone">
            <div id="dzContent"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" style="vertical-align:middle;margin-left:4px;">
                <path
                  d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg> اضغط لاختيار صورة</div>
          </div>
          <input type="file" id="imgInput" accept="image/*" style="display:none;">
        </div>

      </div>

      <div class="reg-modal-foot">
        <div class="left-actions">
          <button class="reg-btn-ghost2" id="duplicateBtn" style="display:none;"><svg width="13" height="13"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="vertical-align:middle;margin-left:4px;">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg> نسخ السؤال</button>
        </div>
        <div class="right-actions">
          <span class="reg-kbd-hint">Ctrl+Enter للحفظ · Esc للإغلاق</span>
          <button class="reg-btn-ghost2" id="cancelBtn">إلغاء</button>
          <button class="reg-btn-primary" id="saveBtn">حفظ السؤال</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Quiz settings modal -->
  <div class="reg-overlay" id="settingsOverlay">
    <div class="reg-modal" style="max-width:560px;">
      <div class="reg-modal-head">
        <div class="title">
          <button class="reg-x-btn" id="closeSettings"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg></button>
          <h3>إعدادات الاختبار</h3>
        </div>
      </div>
      <div class="reg-modal-body">
        <div class="reg-f-field">
          <div class="reg-f-label"><span>اسم الاختبار (عربي)</span></div>
          <input type="text" id="setTitleAr" placeholder="مثال: أسئلة سنوات ميد">
        </div>
        <div class="reg-f-field">
          <div class="reg-f-label"><span>اسم الاختبار (إنجليزي)</span></div>
          <input type="text" id="setTitleEn" class="q-en" placeholder="e.g. Midterm Exam">
        </div>
        <div class="reg-f-field">
          <div class="reg-f-label"><span>الأيقونة</span></div>
          <div class="reg-emoji-pick" id="iconPick"></div>
        </div>
        <div class="reg-f-field">
          <div class="reg-f-label"><span>اللون المميز</span></div>
          <div class="reg-color-pick" id="colorPick"></div>
        </div>
        <div class="reg-form-row">
          <div class="reg-f-field">
            <div class="reg-f-label"><span>التصنيف</span></div>
            <input type="text" id="setCategory" placeholder="مثال: Midterm">
          </div>
          <div class="reg-f-field">
            <div class="reg-f-label"><span>نسبة النجاح %</span></div>
            <input type="text" id="setPassScore" placeholder="60">
          </div>
        </div>
        <div class="reg-form-row">
          <div class="reg-f-field">
            <div class="reg-f-label"><span>مدة الاختبار (دقيقة)</span></div>
            <input type="text" id="setTimeLimit" placeholder="30">
          </div>
          <div class="reg-f-field">
            <div class="reg-f-label"><span>&nbsp;</span></div>
            <label class="reg-checkline">
              <input type="checkbox" id="setForceEnglish">
              إجبار عرض الأسئلة بالإنجليزية
            </label>
          </div>
        </div>
      </div>
      <div class="reg-modal-foot">
        <div></div>
        <div class="right-actions">
          <button class="reg-btn-ghost2" id="settingsCancel">إلغاء</button>
          <button class="reg-btn-primary" id="settingsSave">حفظ الإعدادات</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Generic confirm / rename modal -->
  <div class="reg-overlay" id="confirmOverlay">
    <div class="reg-modal small">
      <div class="reg-modal-head">
        <div class="title">
          <h3 id="confirmTitle">تأكيد</h3>
        </div>
      </div>
      <div class="reg-modal-body">
        <p id="confirmMessage" style="font-size:13.5px;line-height:1.8;color:#5B6152;margin:0 0 14px;"></p>
        <input type="text" id="confirmInput" style="display:none;">
      </div>
      <div class="reg-modal-foot">
        <div></div>
        <div class="right-actions">
          <button class="reg-btn-ghost2" id="confirmCancel">إلغاء</button>
          <button class="reg-btn-primary" id="confirmOk">تأكيد</button>
        </div>
      </div>
    </div>
  </div>

  <!-- General prompt builder modal -->
  <div class="reg-overlay" id="promptOverlay">
    <div class="reg-modal" style="max-width:620px;">
      <div class="reg-modal-head">
        <div class="title">
          <button class="reg-x-btn" id="closePromptModal" type="button" aria-label="إغلاق"><svg width="14" height="14"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg></button>
          <h3>إنشاء برومت اختبار عام</h3>
        </div>
      </div>
      <div class="reg-modal-body">
        <div class="reg-form-row">
          <div class="reg-f-field">
            <div class="reg-f-label"><span>لغة الاختبار</span></div>
            <select id="promptLanguage">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="reg-f-field">
            <div class="reg-f-label"><span>عدد الأسئلة</span></div>
            <input id="promptCount" type="number" min="1" max="100" value="10" inputmode="numeric">
          </div>
        </div>
        <div class="reg-f-field">
          <div class="reg-f-label"><span>نوع الاختبار</span></div>
          <select id="promptQuestionType">
            <option value="mcq">اختيار من متعدد (mcq)</option>
            <option value="true_false">صح أو خطأ (true_false)</option>
            <option value="multi_select">اختيار متعدد الإجابات (multi_select)</option>
          </select>
        </div>
        <div class="reg-f-field">
          <div class="reg-f-label"><span>موضوع الاختبار <small>(اختياري)</small></span></div>
          <textarea id="promptTopic" rows="4" placeholder="مثال: القوائم و tuples في لغة بايثون..."></textarea>
        </div>
        <p style="margin:0;color:var(--ink-soft);font-size:13px;line-height:1.8;">سيتم إنشاء برومت جاهز للنسخ بناءً على
          اختياراتك، دون الحاجة لاختيار مادة أو اختبار من القائمة.</p>
      </div>
      <div class="reg-modal-foot">
        <div></div>
        <div class="right-actions">
          <button class="reg-btn-ghost2" id="cancelPrompt" type="button">إلغاء</button>
          <button class="reg-btn-primary" id="buildPrompt" type="button">إنشاء ونسخ البرومت</button>
        </div>
      </div>
    </div>
  </div>

  <div id="toast-host"></div>

  <script>              (function () {
      const $ = s => document.querySelector(s);
      const esc = s => (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
      const normalizeSearchText = value => String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/[ـ\s]+/g, '');

      const ALLOWED_TAGS = ['span', 'strong', 'em', 'u', 'b', 'i', 'mark', 'code', 'br', 'sup', 'sub', 'small'];
      const ALLOWED_ATTR = ['style', 'class'];
      function safeHtml(raw) {
        if (!raw) return '';
        if (window.DOMPurify) {
          return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
        }
        return esc(raw);
      }

      const typeLabels = {
        mcq: 'اختيار من متعدد (MCQ)', multi: 'اختيار متعدد الإجابات (Multi-Select)',
        tf: 'صح أم خطأ (True/False)', short: 'إجابة قصيرة (Short Answer)', essay: 'مقالي (Essay)'
      };
      const typeShort = { mcq: 'MCQ', multi: 'Multi', tf: 'T/F', short: 'قصيرة', essay: 'مقالي' };
      const diffLabels = { easy: 'سهل', med: 'متوسط', hard: 'صعب' };


      // Database injected data
      const initialSubjects = <?= json_encode($dbSubjectsRows, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
      const initialParts = <?= json_encode($dbParts, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
      const initialQuestions = <?= json_encode($dbQuestions, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
      const csrfToken = <?= json_encode(csrf_token()) ?>;

      async function apiCall(action, payload = {}) {
        try {
          const res = await fetch('tests.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, csrf: csrfToken, ...payload })
          });
          return await res.json();
        } catch (e) {
          console.error('API Error:', e);
          return { success: false, error: e.message };
        }
      }

      async function uploadCsvQuestions(file) {
        if (!file || !state.subjectId || !state.partId) {
          toast('اختر مادة واختباراً أولاً قبل الاستيراد', { danger: true });
          return;
        }

        const form = new FormData();
        form.append('action', 'import_questions_csv');
        form.append('csrf', csrfToken);
        form.append('subjectId', state.subjectId);
        form.append('partId', state.partId);
        form.append('subjectName', (subjects.find(s => s.id === state.subjectId)?.name || ''));
        form.append('partName', (parts[state.subjectId]?.find(p => p.id === state.partId)?.name || ''));
        form.append('csvFile', file);

        try {
          const res = await fetch('tests.php', { method: 'POST', body: form });
          const data = await res.json();
          if (!data || !data.success) {
            throw new Error((data && data.error) ? data.error : 'فشل استيراد الملف');
          }

          toast(`تم استيراد ${data.imported || 0} سؤالاً بنجاح${data.skipped ? '، وتم تخطي ' + data.skipped + ' سؤالاً' : ''}`);
          if (data.errors && data.errors.length) {
            console.warn('CSV import warnings:', data.errors.slice(0, 5));
          }
          if (questions[state.partId]) {
            questions[state.partId] = [];
          }
          await loadQuestionsForPart(state.partId);
          renderAll();
        } catch (err) {
          console.error(err);
          toast(err.message || 'فشل استيراد CSV', { danger: true });
        }
      }

      // ---- SVG icon library (inline, used in icon-box cells) ----
      const ICONS = {
        monitor: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></svg>`,
        globe: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
        briefcase: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>`,
        brain: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3C5.5 3 3 5.5 3 8c0 1.8.9 3.4 2.3 4.4C4.5 13.2 4 14.1 4 15c0 2.2 1.8 4 4 4"/><path d="M15 3c3.5 0 6 2.5 6 5 0 1.8-.9 3.4-2.3 4.4.8.8 1.3 1.7 1.3 2.6 0 2.2-1.8 4-4 4"/><path d="M9 19h6"/><path d="M12 3v2"/><path d="M12 19v2"/></svg>`,
        flag: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="4" y1="15" x2="4" y2="21"/><path d="M4 15V4l8 3 8-3v11l-8 3-8-3z"/></svg>`,
        gear: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        mosque: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18"/><path d="M6 21V9"/><path d="M18 21V9"/><path d="M6 9C6 7 7 5 9 4c0 0 1.5 2 3 2s3-2 3-2c2 1 3 3 3 5"/><path d="M10 21v-5a2 2 0 1 1 4 0v5"/></svg>`,
        math: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="2" y1="12" x2="22" y2="12"/><path d="M7 2l-5 10 5 10"/><path d="M17 2l5 10-5 10"/></svg>`,
        lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        rocket: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
        chart: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
        robot: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M12 11V7"/><circle cx="12" cy="5" r="2"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/><path d="M7 11V9a5 5 0 0 1 10 0v2"/></svg>`,
        eye: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
        scale: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="3" x2="12" y2="21"/><path d="M3 9l9-6 9 6"/><path d="M8 21h8"/><path d="M3 9h4l-2 6"/><path d="M21 9h-4l2 6"/></svg>`,
        scroll: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>`,
        grid: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
        folder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
        database: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
        code: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
        medal: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="15" r="6"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>`,
        search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        linux: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5.5-3 7l-4 3-4-3C6.5 14.5 5 12 5 9a7 7 0 0 1 7-7z"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M9 14s1 1 3 1 3-1 3-1"/></svg>`,
        phone: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`,
        sigma: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 4H6l6 8-6 8h12"/></svg>`,
        cloud: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
        pickaxe: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 21 9-9"/><path d="m12.5 9.5-5-5L12 1l8.5 8.5-4.5 4.5-3-3"/></svg>`,
        shield: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        book: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
        pencil: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
        doc: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
        flask: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3h6"/><path d="M10 9l-5 10a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 19L14 9"/><line x1="10" y1="3" x2="10" y2="9"/><line x1="14" y1="3" x2="14" y2="9"/></svg>`,
        target: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
        wifi: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
        layers: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
        detective: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/></svg>`,
        inbox: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
      };
      function iconHtml(key) { return ICONS[key] || ICONS.book; }

      const quizColors = ['#1B3A2E', '#7A2321', '#2C4F73', '#9C7A2E', '#5E4A8E', '#166B62'];
      const iconChoices = ['book', 'pencil', 'doc', 'flask', 'target', 'folder', 'brain', 'search', 'grid', 'gear'];

      // ---------------- Real data (from question bank export & system materials) ----------------
      const defaultSubjects = [
        { id: 'oop', name: 'برمجة موجهة للكائنات', icon: 'monitor' },
        { id: 'comp_skills', name: 'مهارات حاسوب والتعلم الإلكتروني', icon: 'monitor' },
        { id: 'digital_society', name: 'مجتمع رقمي', icon: 'globe' },
        { id: 'vr_business', name: 'مبادئ الأعمال للواقع الافتراضي', icon: 'briefcase' },
        { id: 'psych_basics', name: 'مبادئ علم النفس', icon: 'brain' },
        { id: 'applied_english_102', name: 'اللغة الإنجليزية التطبيقية 102', icon: 'flag' },
        { id: 'comp_networks_1', name: 'شبكات الحاسوب 1', icon: 'wifi' },
        { id: 'operating_systems', name: 'نظم تشغيل للهندسة', icon: 'gear' },
        { id: 'islam_and_life', name: 'الإسلام والحياة', icon: 'mosque' },
        { id: 'calculus_1', name: 'تفاضل وتكامل 1', icon: 'math' },
        { id: 'calculus_2', name: 'تفاضل وتكامل 2', icon: 'math' },
        { id: 'info_security', name: 'مبادئ أمن المعلومات', icon: 'lock' },
        { id: 'entrepreneurship', name: 'الريادة والابتكار (باللغة الإنجليزية)', icon: 'rocket' },
        { id: 'numerical_analysis', name: 'مبادئ التحليل العددي', icon: 'chart' },
        { id: 'ai_programming', name: 'برمجة الذكاء الاصطناعي', icon: 'robot' },
        { id: 'machine_learning', name: 'تعلم الآلة', icon: 'robot' },
        { id: 'cyber_iot', name: 'انترنت الأشياء وأمنها', icon: 'wifi' },
        { id: 'ml_lab', name: 'مختبر تعلم الآلة', icon: 'robot' },
        { id: 'biometrics_security', name: 'أمن وقياسات بيولوجية', icon: 'eye' },
        { id: 'intro_law', name: 'مدخل إلى علم القانون', icon: 'scale' },
        { id: 'criminal_law_general', name: 'قانون العقوبات - القسم العام', icon: 'scroll' },
        { id: 'digital_logic_design', name: 'تصميم منطق رقمي', icon: 'grid' },
        { id: 'data_structures', name: 'هياكل بيانات', icon: 'folder' },
        { id: 'databases', name: 'قواعد بيانات', icon: 'database' },
        { id: 'comp_skills_2_science', name: 'مهارات حاسوب 2 للطلبة الكليات العلمية', icon: 'monitor' },
        { id: 'military_science', name: 'علوم عسكرية', icon: 'medal' },
        { id: 'prob_stats', name: 'الاحتمالات والإحصاء', icon: 'chart' },
        { id: 'information_retrieval', name: 'نظم استرجاع المعلومات', icon: 'search' },
        { id: 'df_operating_systems', name: 'نظم تشغيل للتحقيقات الجنائية', icon: 'monitor' },
        { id: 'principles_of_cybersecurity', name: 'مبادئ الأمن السيبراني', icon: 'shield' },
        { id: 'applied_english_101', name: 'اللغة الإنجليزية التطبيقية 101', icon: 'flag' },
        { id: 'design_and_analysis_of_algorithms', name: 'تصميم وتحليل خوارزميات', icon: 'code' },
        { id: 'ai_applications', name: 'تطبيقات الذكاء الاصطناعي', icon: 'robot' },
        { id: 'information_technology_crimes', name: 'جرائم تكنولوجيا المعلومات', icon: 'detective' },
        { id: 'introduction_to_unix', name: 'مقدمة إلى اليونكس', icon: 'linux' },
        { id: 'islamic_culture', name: 'الثقافة الإسلامية', icon: 'mosque' },
        { id: 'mobile_application_development', name: 'تطوير تطبيقات الهاتف المحمول', icon: 'phone' },
        { id: 'oop_lab', name: 'مختبر برمجة موجهة للكائنات', icon: 'code' },
        { id: 'discrete_math_structures', name: 'الهياكل الرياضية المتقطعة', icon: 'sigma' },
        { id: 'vr_special_topics', name: 'موضوعات خاصة في الواقع الافتراضي', icon: 'layers' },
        { id: 'vr_systems', name: 'تصميم وبناء أنظمة الواقع الافتراضي', icon: 'book' },
        { id: 'network_security', name: 'أمن شبكات', icon: 'shield' },
        { id: 'software_engineering', name: 'هندسة البرمجيات', icon: 'code' },
        { id: 'cloud_computing', name: 'الحوسبة السحابية', icon: 'cloud' },
        { id: 'data_mining', name: 'تنقيب البيانات', icon: 'pickaxe' },
        { id: 'penetration_testing', name: 'اختبار الاختراق', icon: 'shield' },
        { id: 'national_education', name: 'التربية الوطنية والسلوك الجامعي', icon: 'flag' },
        { id: 'applied_arabic', name: 'اللغة العربية التطبيقية', icon: 'book' }
      ];

      const defaultParts = {
        oop: [
          { id: 'oop_midterm', name: 'أسئلة سنوات ميد', icon: 'doc', color: '#1B3A2E', category: 'Midterm', timeLimit: 30, passScore: 60, forceEnglish: false, titleEn: '' },
          { id: 'oop_final', name: 'أسئلة فاينل', icon: 'scroll', color: '#7A2321', category: 'Final', timeLimit: 45, passScore: 60, forceEnglish: false, titleEn: '' },
          { id: 'oop_quizzes', name: 'كويزات', icon: 'pencil', color: '#166B62', category: 'Quiz', timeLimit: 15, passScore: 50, forceEnglish: true, titleEn: '' },
        ],
        comp_skills: [
          { id: 'cs_quiz1', name: 'كويز 1', icon: 'pencil', color: '#2C4F73', category: 'Quiz', timeLimit: 20, passScore: 50, forceEnglish: false, titleEn: '' }
        ],
        applied_english_101: [
          { id: 'eng101_quiz1', name: 'كويز الأول', icon: 'pencil', color: '#2C4F73', category: 'Quiz', timeLimit: 20, passScore: 50, forceEnglish: true, titleEn: 'Quiz 1' }
        ]
      };

      const opts = (arr, correctIndex) => arr.map((t, i) => ({ text: t, correct: i === correctIndex }));

      const defaultQuestions = {
        oop_midterm: [
          {
            id: 1, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: '<span style="color:#9C7A2E"><strong>بالنظر إلى الكود التالي:</strong></span> أي من العبارات التالية صحيحة داخل التابع <strong>show()</strong>؟',
            textEn: '<span style="color:#9C7A2E"><strong>Given the following code:</strong></span> Which of the following statements is correct inside <strong>show()</strong>?',
            code: 'public class Item {\n    private int num;\n    public double price;\n    public void show()\n    {   }\n}',
            options: opts(['System.out.print(num + " " + price);', 'System.out.print(num);', 'System.out.print(price);', 'All of the above (a, b, and c).', 'None of the above.'], 3)
          },

          {
            id: 2, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'كيف يمكن الوصول إلى متغير غير ساكن (non-static) من صنف آخر داخل نفس الحزمة (package)؟',
            textEn: 'How would you access a non-static variable from another class in the same package?',
            code: 'public class A {\n    int x = 10;\n}\npublic class B {\n    void display()\n    { // Access x here }\n}',
            options: opts(['System.out.println(A.x);', 'A a = new A(); System.out.println(a.x);', 'System.out.println(x);', 'this.x', 'A a = new A(); System.out.println(A.x);'], 1)
          },

          {
            id: 3, cat: 'Db', points: 1.5, type: 'mcq', diff: 'hard',
            textAr: 'بالاعتماد على الصنف التالي:<br><strong>أي عبارة صحيحة داخل التابع post؟</strong>',
            textEn: 'According to the following class:<br><strong>Which statement is correct inside post method?</strong>',
            code: 'public class Address {\n    private int num;\n    private static String zcode;\n    public static void post(int t)\n    {    }\n}',
            options: opts(['System.out.print(num);', 'zcode = t;', 'num = t;', 'System.out.print(zcode + ":" + num);', 'System.out.print(zcode);'], 4),
            explanationAr: 'التابع post ساكن (static)، لذا لا يمكنه الوصول إلى المتغير الوصفي num مباشرة. كذلك لا يمكن إسناد t (وهو int) إلى zcode (وهو String) دون تحويل. العبارة الوحيدة السليمة هي طباعة المتغير الساكن zcode مباشرة.'
          },

          {
            id: 4, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'بالاعتماد على الصنف التالي:<br>أي العبارات التالية يجب كتابتها داخل <u>التابع الضابط (setter)</u> \'<em><mark style="background:#F1E4C0;color:#000">setValue</mark></em>\' لنسخ قيمة المعامل إلى <span style="color:#9C7A2E"><strong>المتغير الوصفي (instance variable)</strong></span>؟',
            textEn: 'According to the following class:<br>Which statement should be written inside the <u>setter method</u> \'<em><mark style="background:#F1E4C0;color:#000">setValue</mark></em>\' to copy the parameter into the <span style="color:#9C7A2E"><strong>instance variable</strong></span>?',
            code: 'public class Container {\n    private int value;\n    public void setValue(int value)\n    {    }\n}',
            options: opts(['value = value;', 'this.value = s;', 'value = s;', 'this.value = value;', 'value = this.value;'], 3)
          },

          {
            id: 5, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'بالنظر إلى الصنف التالي:<br>أي عبارة تُنشئ كائناً من الصنف Motor بشكل صحيح داخل التابع main؟',
            textEn: 'Given the following class:<br>Which statement correctly creates an object of class Motor inside the main method?',
            code: 'public class Motor {\n    private String model;\n    private int price;\n    private double capacity;\n    public Motor(int a) { price=a; capacity=0.0; }\n    public void show() { System.out.print(model + " " + price); }\n}',
            options: opts(['Motor m = new Motor(3500);', 'Motor m = new Motor("Toyota",3000);', 'Motor m = new Motor("Toyota",2500,1.6);', 'Motor m = new Motor(2.5);', 'Motor m = new Motor();'], 0)
          },

          {
            id: 6, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'اقرأ الكود التالي:<br>أي من العبارات التالية <strong>غير</strong> صحيحة لتعيين قيمة color إلى "black" داخل main؟',
            textEn: 'Read the following code:<br>Which of the following is <strong>NOT</strong> correct to set color to "black" in main?',
            code: 'public class Square {\n    private double area;\n    static String color;\n}\npublic class Test{\n    public static void main(String[] args){\n        Square s1 = new Square();\n        Square s2 = new Square();\n        // line here\n    }\n}',
            options: opts(['s2.color = "black";', 's1.color = "black";', 'Square.color = "black";', 'color = "black";', 's1.area = 5.0;'], 3)
          },

          {
            id: 7, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'ما هو <strong><mark style="background:#DEE9DF;color:#000">ناتج التنفيذ</mark></strong> للكود التالي؟',
            textEn: 'What is the <strong><mark style="background:#DEE9DF;color:#000">output</mark></strong> after executing the following code:',
            code: 'public class Rectangle {\n private int width;\n int height;\n public void setWidth(int width) { this.width = width; }\n public int getHeight() { return height; }\n public void show() { System.out.print(width); }\n}\npublic class Test {\n public static void main(String[] args) {\n  Rectangle r = new Rectangle();\n  r.height = 4;\n  r.setWidth(r.getHeight() + 3);\n  r.show();\n }\n}',
            options: opts(['4', '10', '5', '7', '6'], 3)
          },

          {
            id: 8, cat: 'Db', points: 1.5, type: 'mcq', diff: 'hard',
            textAr: 'بالنظر إلى الأصناف التالية:<br>أي من العبارات التالية يمكن كتابتها في <strong><span style="color:#9C7A2E">السطر 2</span></strong> داخل main لزيادة قيمة count بمقدار واحد؟',
            textEn: 'Given the following classes:<br>Which statement could be written in <strong><span style="color:#9C7A2E">line 2</span></strong> inside main to increase <strong>count by one</strong>?',
            code: 'public class Counter {\n private int count;\n public void setCount(int count) { this.count = count; }\n public int getCount() { return count; }\n}\npublic class Test {\n public static void main(String[] args) {\n  Counter c = new Counter();\n  c.setCount(3);\n  // line 2\n }\n}',
            options: opts(['c.getCount();', 'count++;', 'c.count++;', 'c.setCount(c.getCount() + 1);', 'c.getCount(c.setCount() + 1);'], 3)
          },

          {
            id: 9, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'ما هو <strong><span style="color:#9C7A2E">ناتج التنفيذ</span></strong> للكود التالي؟',
            textEn: 'What is the <strong><span style="color:#9C7A2E">output</span></strong> after executing the following code:',
            code: 'public class Wheel {\n int radius;\n public Wheel(int r) { radius=r; }\n public Wheel() { radius=4; }\n public void show() { System.out.print(radius); }\n}\npublic class Test{\n public static void main(String[] args){\n  Wheel w = new Wheel();\n  w.show();\n  w.radius = 9;\n }\n}',
            options: opts(['4', '9', '0', '5', 'null'], 0)
          },

          {
            id: 10, cat: 'Db', points: 1.5, type: 'mcq', diff: 'hard',
            textAr: 'بالاعتماد على الكود التالي:<br><strong>أي مما يلي غير صحيح كتابته داخل display؟</strong>',
            textEn: 'According to the following code:<br><strong>Which is incorrect to write inside display?</strong>',
            code: 'public class Point {\n private int x;\n public int y;\n public void display()\n {    }\n}\npublic class Test {\n public static void main(String[] args){\n  Point p = new Point();\n  p.display();\n }\n}',
            options: opts(['System.out.print(x);', 'System.out.print(p.y);', 'x++;', 'System.out.print(y);', 'System.out.print(x + " " + y);'], 1),
            explanationAr: 'المتغير p محلي داخل main فقط، ولا يمكن الوصول إليه من داخل تابع display لأنه ليس معرّفاً هناك.'
          },

          {
            id: 11, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'تتبّع الكود أدناه ثم حدد <mark style="background:#F1E4C0;color:#000"><strong>الناتج</strong>:</mark>',
            textEn: 'Trace the below code then find the <mark style="background:#F1E4C0;color:#000"><strong>output</strong>:</mark>',
            code: 'public class Phone {\n double price;\n static String brand;\n}\npublic class Test{\n public static void main(String[] args){\n  Phone p1 = new Phone();\n  Phone p2 = new Phone();\n  p1.price = 400;\n  p1.brand = "X1";\n  p2.price = 260;\n  Phone.brand = "Z";\n  System.out.print(p1.brand);\n }\n}',
            options: opts(['260', 'null', 'Z', '400', 'X1'], 2)
          },

          {
            id: 12, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'حدد ناتج الكود أدناه:',
            textEn: 'Find the output of the below code:',
            code: 'public class Box {\n int width;\n Box(int w) { width = w; }\n}\npublic class MyTest {\n public static void main(String[] args) {\n  Box b = new Box();\n  System.out.println(b.width);\n }\n}',
            options: opts(['0', 'null', 'Error - no matching constructor', 'false', 'width = 0'], 2)
          },

          {
            id: 13, cat: 'Db', points: 1.5, type: 'mcq', diff: 'hard',
            textAr: 'بالنظر إلى الكود التالي:<br>أي عبارة يمكن كتابتها في <mark style="background:#DEE9DF;color:#000"><strong>السطر 3</strong></mark> داخل <strong>main</strong> لاستدعاء التابع \'<strong>exam</strong>\' بشكل صحيح؟',
            textEn: 'Given the following code:<br>Which statement could be written in <mark style="background:#DEE9DF;color:#000"><strong>line 3</strong></mark> inside <strong>main</strong> to correctly call method \'<strong>exam</strong>\'?',
            code: 'public class Mid {\n private void exam() { System.out.print("Done"); }\n public static void main(String[] args) {\n  Mid m = new Mid();\n  // line 3\n }\n}',
            options: opts(['m.exam();', 'System.out.print(m.exam());', 'exam();', 'm.exam(1);', 'String s = m.exam();'], 0),
            explanationAr: 'التوابع الخاصة (private) يمكن استدعاؤها من داخل نفس الصنف حتى عبر كائن، لأن الخصوصية في جافا مرتبطة بالصنف نفسه وليس بالكائن.'
          },

          {
            id: 14, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'بالنظر إلى الصنف \'<strong>Student</strong>\' الذي يحتوي على متغير خاص من نوع String باسم \'<strong>name</strong>\'، أي مما يلي تصريح صحيح لتابع يُعيّن قيمة name؟',
            textEn: 'Given class \'<strong>Student</strong>\' with private String \'<strong>name</strong>\', which of the following is a correct header to set the \'<strong>name</strong>\'?',
            code: '',
            options: opts(['public void setName(String na)', 'public void setName(Student na)', 'public void setName(int na)', 'public int setName(int na)', 'public String setName()'], 0)
          },

          {
            id: 15, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'ماذا ستطبع هذه القطعة من الكود؟',
            textEn: 'What will this segment of code print?',
            code: 'for (int i=1; i<=5; i++) {\n if (i==3) continue;\n System.out.print(i + " ");\n}',
            options: opts(['1 2 4 5', '1 2 3 4 5', '1 2', '4 5', 'Compilation Error'], 0)
          },

          {
            id: 16, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'ما الخطأ في هذا الكود؟',
            textEn: 'What is wrong with this code?',
            code: 'public class Student {\n private String name;\n}\npublic class Example {\n public static void main(String[] args) {\n  Student s = new Student();\n  System.out.println(s.name);\n }\n}',
            options: opts(["When creating object 's' a name must be given", "Cannot access 'name' from outside class", "The variable 'name' should be defined in main", "A constructor must be defined", "The instance variable 'name' should be static"], 1)
          },

          {
            id: 17, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'ما ناتج الكود التالي؟',
            textEn: 'What is the output of the following code:',
            code: 'public class Product {\n int id;\n public Product() { id = 10; }\n}\npublic class Test {\n public static void main(String[] args) {\n  Product p = new Product();\n  System.out.print(p.id);\n }\n}',
            options: opts(['0', '10', '1', 'null', 'Error on code'], 1)
          },

          {
            id: 18, cat: 'Db', points: 1.5, type: 'mcq', diff: 'med',
            textAr: 'بافتراض وجود صنف \'<mark style="background:#DEE9DF;color:#000"><strong>Employee</strong></mark>\' يحتوي متغيراً خاصاً باسم \'<strong><mark style="background:#DEE9DF;color:#000">salary</mark></strong>\' من نوع double، اختر التصريح الصحيح لتابع getter الخاص بـ \'<mark style="background:#DEE9DF;color:#000"><strong>salary</strong></mark>\'.',
            textEn: 'Suppose a class \'<mark style="background:#DEE9DF;color:#000"><strong>Employee</strong></mark>\' with a private instance variable \'<strong><mark style="background:#DEE9DF;color:#000">salary</mark></strong>\' of type double, choose the correct header for a getter method for the \'<mark style="background:#DEE9DF;color:#000"><strong>salary</strong></mark>\'?',
            code: '',
            options: opts(['public void getSalary()', 'public int getSalary(double s)', 'public double getSalary()', 'public String getSalary(double salary)', 'public void getSalary(double salary)'], 2)
          },

          {
            id: 19, cat: 'Db', points: 1.5, type: 'mcq', diff: 'easy',
            textAr: 'ما القيمة الافتراضية لمتغير من نوع boolean <span style="color:#7A2321"><strong>(متغير وصفي)</strong></span> غير مُهيّأ في جافا؟',
            textEn: 'What is the default value of an uninitialized boolean <span style="color:#7A2321"><strong>instance variable</strong></span> in Java?',
            code: '',
            options: opts(['true', 'false', 'null', '0', 'undefined'], 1)
          },
        ],
        oop_final: [],
        oop_quizzes: [],
        cs_quiz1: [],
        eng101_quiz1: [
          { id: 101, cat: 'Db', points: 1, type: 'mcq', diff: 'easy', textAr: '', textEn: 'Choose the correct nationality: "He is from Poland. He is ____."', code: '', options: opts(['Indian', 'Polish', 'Jordanian', 'Poland'], 1) },
          { id: 102, cat: 'Db', points: 1, type: 'mcq', diff: 'easy', textAr: '', textEn: 'Choose the correct form: "____ a new car?"', code: '', options: opts(['Has she got', 'Has he got', 'Does she have', 'Has he'], 0) }
        ]
      };


      // Load from Database (with fallback to default)
      let subjects = (Array.isArray(initialSubjects) && initialSubjects.length > 0) ? initialSubjects : defaultSubjects;
      let parts = (initialParts && Object.keys(initialParts).length > 0) ? initialParts : defaultParts;
      let questions = (initialQuestions && Object.keys(initialQuestions).length > 0) ? initialQuestions : defaultQuestions;

      const isValidSubject = (id) => !!id && subjects.some(s => String(s.id) === String(id));
      const getFirstUsableState = () => {
        const subjectWithParts = subjects.find(s => Array.isArray(parts[s.id]) && parts[s.id].length > 0)
          || subjects[0] || null;
        if (!subjectWithParts) {
          return { subjectId: null, partId: null };
        }
        const subjectParts = Array.isArray(parts[subjectWithParts.id]) ? parts[subjectWithParts.id] : [];
        const firstPart = subjectParts.find(p => p && p.id) || null;
        return { subjectId: subjectWithParts.id, partId: firstPart ? firstPart.id : null };
      };

      function persistData() {
        try {
          localStorage.setItem('registry_subjects', JSON.stringify(subjects));
          localStorage.setItem('registry_parts', JSON.stringify(parts));
          localStorage.setItem('registry_questions', JSON.stringify(questions));
        } catch (e) { }
      }

      let nextQId = 200;
      Object.values(questions).forEach(list => {
        list.forEach(q => { if (q.id >= nextQId) nextQId = q.id + 1; });
      });

      let subjectSearchTerm = '';
      let partSearchTerm = '';
      let questionSearchTerm = '';
      let selectMode = false;
      let selectedQIds = new Set();
      let dragQId = null;
      let currentDetailQId = null; // currently shown in qdetail

      // Auto-select a valid first subject/part from the real DB-backed data.
      // This prevents the page from staying blank when the current state is empty or stale.
      const firstUsableState = getFirstUsableState();
      let state = {
        subjectId: isValidSubject(subjects[0]?.id) ? subjects[0].id : firstUsableState.subjectId,
        partId: firstUsableState.partId,
        editingQuestionId: null
      };

      if (!state.subjectId || !isValidSubject(state.subjectId)) {
        state.subjectId = firstUsableState.subjectId;
      }
      if (state.subjectId && Array.isArray(parts[state.subjectId]) && parts[state.subjectId].length > 0 && !parts[state.subjectId].some(p => String(p.id) === String(state.partId))) {
        state.partId = parts[state.subjectId][0].id;
      }
      if (!state.subjectId || !state.partId) {
        const fallbackState = getFirstUsableState();
        state.subjectId = fallbackState.subjectId;
        state.partId = fallbackState.partId;
      }
      let currentType = 'mcq';
      let currentDiff = 'med';
      let currentOptions = [];


      // ---------------- Toast (+ undo) ----------------
      function toast(msg, opts) {
        opts = opts || {};
        const host = $('#toast-host');
        const el = document.createElement('div');
        el.className = 'toast' + (opts.danger ? ' danger' : '');
        const checkSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        const warnSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        el.innerHTML = `<span class="ic">${opts.icon || (opts.danger ? warnSvg : checkSvg)}</span><span>${esc(msg)}</span>`;
        if (opts.onUndo) {
          const btn = document.createElement('button');
          btn.className = 'undo-btn'; btn.textContent = 'تراجع';
          btn.addEventListener('click', () => { opts.onUndo(); el.remove(); });
          el.appendChild(btn);
        }
        host.appendChild(el);
        setTimeout(() => el.remove(), opts.onUndo ? 6000 : 2600);
      }

      // ---------------- Generic confirm / prompt modal ----------------
      const confirmOverlay = $('#confirmOverlay');
      let confirmResolver = null;
      function askConfirm(title, message, opts) {
        opts = opts || {};
        $('#confirmTitle').textContent = title;
        $('#confirmMessage').textContent = message;
        const input = $('#confirmInput');
        if (opts.inputValue !== undefined) {
          input.style.display = 'block'; input.value = opts.inputValue; input.placeholder = opts.placeholder || '';
        } else {
          input.style.display = 'none'; input.value = '';
        }
        $('#confirmOk').textContent = opts.okLabel || 'تأكيد';
        $('#confirmOk').className = 'reg-btn-primary' + (opts.danger ? ' danger' : '');
        confirmOverlay.classList.add('open');
        setTimeout(() => input.style.display === 'block' ? input.focus() : null, 30);
        return new Promise(res => { confirmResolver = res; });
      }
      function closeConfirm(result) {
        confirmOverlay.classList.remove('open');
        if (confirmResolver) { confirmResolver(result); confirmResolver = null; }
      }
      $('#confirmOk').addEventListener('click', () => {
        const input = $('#confirmInput');
        closeConfirm(input.style.display === 'block' ? (input.value.trim() || null) : true);
      });
      $('#confirmCancel').addEventListener('click', () => closeConfirm(null));
      confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirm(null); });
      $('#confirmInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('#confirmOk').click(); });

      // ---------------- Rich text render pipeline ----------------
      function renderRich(container) {
        if (window.hljs) {
          container.querySelectorAll('pre code').forEach(el => { try { hljs.highlightElement(el); } catch (e) { } });
        }
        if (window.renderMathInElement) {
          try {
            renderMathInElement(container, {
              delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
              throwOnError: false
            });
          } catch (e) { }
        }
      }

      // ---------------- Tally / masthead ----------------
      function renderTally() {
        let testCount = 0, qCount = 0, ptsSum = 0;
        Object.values(parts).forEach(list => testCount += list.length);
        Object.values(questions).forEach(list => { qCount += list.length; list.forEach(q => ptsSum += (q.points || 0)); });
        $('#tally').innerHTML = `
      <div class="tally-item"><b>${subjects.length}</b><span>مادة</span></div>
      <div class="tally-item"><b>${testCount}</b><span>اختبار</span></div>
      <div class="tally-item"><b>${qCount}</b><span>سؤال</span></div>
      <div class="tally-item"><b>${ptsSum}</b><span>علامة</span></div>
    `;
      }

      // ---------------- Dashboard ----------------
      function renderDashboard() {
        const grid = $('#dashGrid');
        const subjRows = subjects.map(s => {
          const qN = (parts[s.id] || []).reduce((a, p) => a + (questions[p.id] || []).length, 0);
          return { name: s.name, n: qN };
        }).filter(r => r.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
        const maxN = Math.max(1, ...subjRows.map(r => r.n));

        let diffCounts = { easy: 0, med: 0, hard: 0 };
        Object.values(questions).forEach(list => list.forEach(q => { diffCounts[q.diff || 'med'] = (diffCounts[q.diff || 'med'] || 0) + 1; }));
        const maxDiff = Math.max(1, diffCounts.easy, diffCounts.med, diffCounts.hard);

        let typeCounts = {};
        Object.values(questions).forEach(list => list.forEach(q => { typeCounts[q.type] = (typeCounts[q.type] || 0) + 1; }));
        const maxType = Math.max(1, ...Object.values(typeCounts), 1);

        grid.innerHTML = `
      <div class="dash-card">
        <div class="lbl"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg> الأسئلة حسب المادة (الأعلى)</div>
        ${subjRows.length ? subjRows.map(r => `
          <div class="bar-row"><span class="nm">${esc(r.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(r.n / maxN * 100).toFixed(0)}%"></div></div><span class="val">${r.n}</span></div>
        `).join('') : '<div style="font-size:12px;color:var(--ink-faint)">لا توجد بيانات بعد</div>'}
      </div>
      <div class="dash-card">
        <div class="lbl"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> توزيع مستوى الصعوبة</div>
        ${Object.entries(diffCounts).map(([k, v]) => `
          <div class="bar-row"><span class="nm">${diffLabels[k]}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxDiff * 100).toFixed(0)}%"></div></div><span class="val">${v}</span></div>
        `).join('')}
      </div>
      <div class="dash-card">
        <div class="lbl"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> توزيع أنواع الأسئلة</div>
        ${Object.entries(typeCounts).length ? Object.entries(typeCounts).map(([k, v]) => `
          <div class="bar-row"><span class="nm">${typeShort[k] || k}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxType * 100).toFixed(0)}%"></div></div><span class="val">${v}</span></div>
        `).join('') : '<div style="font-size:12px;color:var(--ink-faint)">لا توجد بيانات بعد</div>'}
      </div>
    `;
      }



      // ---------------- Collapsible Navigation Drawer Logic ----------------
      let updateDrawerUI = function () { };
      function initNavDrawer() {
        const board = document.getElementById('testsBoard');
        const toggleBtn = document.getElementById('toggleDrawerBtn');
        const toggleText = document.getElementById('toggleDrawerText');
        if (!board || !toggleBtn) return;

        updateDrawerUI = function (isCollapsed) {
          if (typeof isCollapsed === 'undefined') {
            isCollapsed = board.classList.contains('nav-collapsed');
          }
          if (isCollapsed) {
            board.classList.add('nav-collapsed');
            toggleBtn.classList.add('collapsed-state');
            if (toggleText) {
              const s = subjects.find(x => x.id === state.subjectId);
              const p = s ? (parts[s.id] || []).find(x => x.id === state.partId) : null;
              const label = s && p ? `إظهار المواد (${esc(s.name)} - ${esc(p.name)})` : 'إظهار المواد والاختبارات';
              toggleText.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px;"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg> ${label}`;
            }
            toggleBtn.title = 'إظهار لوحة المواد والاختبارات';
          } else {
            board.classList.remove('nav-collapsed');
            toggleBtn.classList.remove('collapsed-state');
            if (toggleText) {
              toggleText.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px;"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg> طي المواد والاختبارات`;
            }
            toggleBtn.title = 'طي لوحة المواد والاختبارات لتوسيع مساحة الأسئلة';
          }
        };

        const savedState = localStorage.getItem('makanak_tests_nav_collapsed') === '1';
        updateDrawerUI(savedState);

        toggleBtn.addEventListener('click', () => {
          const isNowCollapsed = !board.classList.contains('nav-collapsed');
          localStorage.setItem('makanak_tests_nav_collapsed', isNowCollapsed ? '1' : '0');
          updateDrawerUI(isNowCollapsed);
          if (!isNowCollapsed) {
            toast('تم إظهار لوحة المواد والاختبارات');
          } else {
            toast('تم طي القائمة وتوسيع عرض الأسئلة للشاشة الكاملة!');
          }
        });
      }

      // ---------------- Breadcrumb ----------------
      function renderCrumb() {
        if (typeof updateDrawerUI === "function") updateDrawerUI();
        const s = subjects.find(x => x.id === state.subjectId);
        const p = s ? (parts[s.id] || []).find(x => x.id === state.partId) : null;
        const crumbEl = $('#crumb');
        if (!crumbEl) return;
        crumbEl.innerHTML = `
      <span class="seg ${s ? 'on' : ''}"><span class="dot"></span>${s ? esc(s.name) : 'اختر مادة'}</span>
      <span class="arrow">‹</span>
      <span class="seg ${p ? 'on' : ''}"><span class="dot ${p ? 'on' : ''}"></span>${p ? esc(p.name) : 'اختر اختباراً'}</span>
      <span class="arrow">‹</span>
      <span class="seg ${p ? 'on' : ''}"><span class="dot ${p ? 'on' : ''}"></span>أسئلة الاختبار</span>
    `;
      }

      // ---------------- Subjects panel ----------------
      function renderSubjects() {
        const cntEl = $('#subjCount');
        if (cntEl) cntEl.textContent = `(${subjects.length})`;
        const box = $('#subjectItems');
        if (!box) return;
        const term = normalizeSearchText(subjectSearchTerm.trim());
        const visible = subjects.filter(s => {
          const name = normalizeSearchText(s.name);
          const id = normalizeSearchText(s.id);
          return !term || name.includes(term) || id.includes(term);
        });
        if (subjects.length === 0) {
          box.innerHTML = `<div class="qplaceholder-box"><p>لا توجد مواد بعد</p><span class="hint">اضغط "+ مادة جديدة" للبدء</span></div>`;
          return;
        }
        if (visible.length === 0) {
          box.innerHTML = `<div class="qplaceholder-box"><p>لا توجد نتائج مطابقة</p></div>`;
          return;
        }
        box.innerHTML = visible.map(s => {
          const testN = (parts[s.id] || []).length;
          return `
      <div class="row-card ${state.subjectId === s.id ? 'active' : ''}" data-id="${s.id}">
        <div class="row-text">
          <span class="name">${esc(s.name)}</span>
          <span class="id">ID: ${s.id}</span>
          <div class="meta"><span class="mini-tag">${testN} اختبار</span></div>
        </div>
        <div class="row-right">
          <button class="icon-btn edit-subj" data-id="${s.id}" title="تعديل الاسم">${ICONS.pencil}</button>
          <button class="icon-btn danger del-subj" data-id="${s.id}" title="حذف"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          <div class="icon-box">${iconHtml(s.icon)}</div>
        </div>
      </div>
    `;
        }).join('');

        box.querySelectorAll('.row-card').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            state.subjectId = el.dataset.id;
            const currentParts = parts[state.subjectId] || [];
            state.partId = currentParts.length > 0 ? currentParts[0].id : null;
            if (state.partId) loadQuestionsForPart(state.partId);
            currentDetailQId = null;
            renderAll();
          });
        });
        box.querySelectorAll('.edit-subj').forEach(b => b.addEventListener('click', async e => {
          e.stopPropagation();
          const s = subjects.find(x => x.id === b.dataset.id);
          const name = await askConfirm('تعديل اسم المادة', 'أدخل الاسم الجديد للمادة:', { inputValue: s.name, okLabel: 'حفظ' });
          if (name) { s.name = name; apiCall('save_subject', { id: s.id, name: s.name, icon: s.icon }); persistData(); renderAll(); toast('تم تحديث المادة'); }
        }));
        box.querySelectorAll('.del-subj').forEach(b => b.addEventListener('click', async e => {
          e.stopPropagation();
          const id = b.dataset.id;
          const s = subjects.find(x => x.id === id);
          const ok = await askConfirm('حذف المادة', `سيتم حذف "${s.name}" وكل الاختبارات والأسئلة المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.`, { okLabel: 'حذف نهائياً', danger: true });
          if (!ok) return;
          const idx = subjects.findIndex(x => x.id === id);
          const removedSubj = subjects[idx]; const removedParts = parts[id];
          subjects = subjects.filter(x => x.id !== id);
          delete parts[id];
          if (state.subjectId === id) { state.subjectId = null; state.partId = null; currentDetailQId = null; }
          apiCall('delete_subject', { id });
          persistData();
          renderAll();
          toast('تم حذف المادة', {
            danger: true, onUndo: () => {
              subjects.splice(idx, 0, removedSubj); if (removedParts) parts[id] = removedParts; persistData(); renderAll();
            }
          });
        }));
      }

      // ---------------- Parts panel ----------------
      function renderParts() {
        const list = state.subjectId ? (parts[state.subjectId] || []) : [];
        const cntEl = $('#partCount');
        if (cntEl) cntEl.textContent = state.subjectId ? `(${list.length})` : '';
        const box = $('#partList');
        if (!box) return;
        if (!state.subjectId) {
          box.innerHTML = `<div class="qplaceholder-box"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg><p>اختر مادة أولاً</p></div>`;
          return;
        }
        const term = partSearchTerm.trim().toLowerCase();
        const visible = list.filter(p => !term || p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term));
        if (list.length === 0) {
          box.innerHTML = `<div class="qplaceholder-box"><p>لا توجد اختبارات لهذه المادة</p><span class="hint">اضغط "+ اختبار جديد"</span></div>`;
          return;
        }
        if (visible.length === 0) {
          box.innerHTML = `<div class="qplaceholder-box"><p>لا توجد نتائج مطابقة</p></div>`;
          return;
        }
        const trashSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
        const copySvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        const settingsSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
        box.innerHTML = `
      <div class="search-box"><input type="text" id="partSearchInput" value="${esc(partSearchTerm)}" placeholder="ابحث في الاختبارات..."><span class="ic">${ICONS.search}</span></div>
      ${visible.map(p => {
          const qN = (questions[p.id] || []).length;
          const ptsN = (questions[p.id] || []).reduce((a, q) => a + (q.points || 0), 0);
          return `
      <div class="row-card ${state.partId === p.id ? 'active' : ''}" data-id="${p.id}">
        <div class="row-text">
          <span class="name">${esc(p.name)}</span>
          <span class="id">ID: ${p.id}</span>
          <div class="meta">
            <span class="mini-tag" style="border-color:${p.color}55;color:${p.color}">${qN} سؤال</span>
            <span class="mini-tag">${ptsN} علامة</span>
            ${p.timeLimit ? `<span class="mini-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${p.timeLimit}د</span>` : ''}
          </div>
        </div>
        <div class="row-right">
          <button class="icon-btn edit-part duplicate-part" data-id="${p.id}" title="نسخ الاختبار">${copySvg}</button>
          <button class="icon-btn gear settings-part" data-id="${p.id}" title="إعدادات الاختبار">${settingsSvg}</button>
          <button class="icon-btn danger del-part" data-id="${p.id}" title="حذف">${trashSvg}</button>
          <div class="icon-box" style="background:${p.color}22">${iconHtml(p.icon)}</div>
        </div>
      </div>
    `;
        }).join('')}`;
        $('#partSearchInput')?.addEventListener('input', e => { partSearchTerm = e.target.value; renderParts(); });
        box.querySelectorAll('.row-card').forEach(el => {
          el.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            state.partId = el.dataset.id;
            loadQuestionsForPart(el.dataset.id);
            currentDetailQId = null;
            renderAll();
          });
        });
        box.querySelectorAll('.settings-part').forEach(b => b.addEventListener('click', e => {
          e.stopPropagation();
          openSettings(b.dataset.id);
        }));
        box.querySelectorAll('.duplicate-part').forEach(b => b.addEventListener('click', e => {
          e.stopPropagation();
          const src = list.find(x => x.id === b.dataset.id);
          const copy = JSON.parse(JSON.stringify(src));
          copy.id = 'part_' + Math.random().toString(36).slice(2, 8);
          copy.name = src.name + ' (نسخة)';
          parts[state.subjectId].push(copy);
          questions[copy.id] = JSON.parse(JSON.stringify(questions[src.id] || [])).map(q => ({ ...q, id: nextQId++ }));
          persistData();
          renderAll(); toast('تم نسخ الاختبار');
        }));
        box.querySelectorAll('.del-part').forEach(b => b.addEventListener('click', async e => {
          e.stopPropagation();
          const id = b.dataset.id;
          const p = list.find(x => x.id === id);
          const ok = await askConfirm('حذف الاختبار', `سيتم حذف اختبار "${p.name}" وكل أسئلته (${(questions[id] || []).length}). هذا الإجراء لا يمكن التراجع عنه.`, { okLabel: 'حذف نهائياً', danger: true });
          if (!ok) return;
          const idx = parts[state.subjectId].findIndex(x => x.id === id);
          const removedPart = parts[state.subjectId][idx]; const removedQs = questions[id];
          const result = await apiCall('delete_part', { id });
          if (!result?.success) {
            toast('تعذر حذف الاختبار: ' + (result?.error || 'خطأ غير معروف'), { danger: true });
            return;
          }
          parts[state.subjectId] = parts[state.subjectId].filter(x => x.id !== id);
          delete questions[id];
          if (state.partId === id) { state.partId = null; currentDetailQId = null; }
          persistData();
          renderAll();
          toast(result.firestore_synced ? 'تم حذف الاختبار ومزامنته مباشرة' : 'تم حذفه محلياً، تعذرت مزامنة Firestore', { danger: !result.firestore_synced });
        }));
      }

      let settingsPartId = null;
      let settingsIcon = 'doc';
      let settingsColor = quizColors[0];

      function openSettings(partId) {
        const part = (parts[state.subjectId] || []).find(item => item.id === partId);
        if (!part) return;
        settingsPartId = partId;
        settingsIcon = part.icon || 'doc';
        settingsColor = part.color || quizColors[0];
        $('#setTitleAr').value = part.name || '';
        $('#setTitleEn').value = part.titleEn || '';
        $('#setCategory').value = part.category || '';
        $('#setPassScore').value = part.passScore ?? 60;
        $('#setTimeLimit').value = part.timeLimit ?? 30;
        $('#setForceEnglish').checked = !!part.forceEnglish;
        $('#iconPick').innerHTML = ['doc', 'book', 'pencil', 'code', 'file'].map(icon =>
          `<button type="button" class="reg-icon-choice ${settingsIcon === icon ? 'active' : ''}" data-icon="${icon}">${iconHtml(icon)}</button>`
        ).join('');
        $('#colorPick').innerHTML = quizColors.map(color =>
          `<button type="button" class="reg-color-choice ${settingsColor === color ? 'active' : ''}" data-color="${color}" style="background:${color}" aria-label="${color}"></button>`
        ).join('');
        $('#iconPick').querySelectorAll('[data-icon]').forEach(button => button.addEventListener('click', () => {
          settingsIcon = button.dataset.icon;
          $('#iconPick').querySelectorAll('[data-icon]').forEach(item => item.classList.toggle('active', item === button));
        }));
        $('#colorPick').querySelectorAll('[data-color]').forEach(button => button.addEventListener('click', () => {
          settingsColor = button.dataset.color;
          $('#colorPick').querySelectorAll('[data-color]').forEach(item => item.classList.toggle('active', item === button));
        }));
        $('#settingsOverlay').classList.add('open');
      }

      function closeSettings() {
        $('#settingsOverlay').classList.remove('open');
        settingsPartId = null;
      }

      $('#closeSettings').addEventListener('click', closeSettings);
      $('#settingsCancel').addEventListener('click', closeSettings);
      $('#settingsOverlay').addEventListener('click', event => {
        if (event.target === $('#settingsOverlay')) closeSettings();
      });
      $('#settingsSave').addEventListener('click', async () => {
        if (!settingsPartId) return;
        const part = (parts[state.subjectId] || []).find(item => item.id === settingsPartId);
        if (!part) return;
        const name = $('#setTitleAr').value.trim();
        if (!name) {
          toast('اكتب اسم الاختبار أولاً', { danger: true });
          return;
        }
        const payload = {
          id: settingsPartId,
          subjectId: state.subjectId,
          name,
          titleEn: $('#setTitleEn').value.trim(),
          icon: settingsIcon,
          color: settingsColor,
          category: $('#setCategory').value.trim(),
          timeLimit: Number($('#setTimeLimit').value) || 30,
          passScore: Number($('#setPassScore').value) || 60,
          forceEnglish: $('#setForceEnglish').checked ? 1 : 0
        };
        const saveButton = $('#settingsSave');
        saveButton.disabled = true;
        saveButton.textContent = 'جارٍ الحفظ...';
        const result = await apiCall('save_part', payload);
        saveButton.disabled = false;
        saveButton.textContent = 'حفظ الإعدادات';
        if (!result?.success) {
          toast('تعذر حفظ إعدادات الاختبار: ' + (result?.error || 'خطأ غير معروف'), { danger: true });
          return;
        }
        Object.assign(part, {
          name,
          titleEn: payload.titleEn,
          icon: settingsIcon,
          color: settingsColor,
          category: payload.category,
          timeLimit: payload.timeLimit,
          passScore: payload.passScore,
          forceEnglish: !!payload.forceEnglish
        });
        persistData();
        closeSettings();
        renderAll();
        toast(result.firestore_synced ? 'تم تعديل الاختبار ومزامنته مباشرة' : 'تم التعديل محلياً، تعذرت المزامنة السحابية', { danger: !result.firestore_synced });
      });

      // ---------------- Shuffle helpers ----------------
      function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }

      const promptOverlay = $('#promptOverlay');
      function openPromptBuilder() {
        promptOverlay.classList.add('open');
        setTimeout(() => $('#promptTopic').focus(), 30);
      }

      function closePromptBuilder() {
        promptOverlay.classList.remove('open');
      }

      function buildGeneralPrompt() {
        const language = $('#promptLanguage').value;
        const count = Math.min(100, Math.max(1, Number($('#promptCount').value) || 1));
        const type = $('#promptQuestionType').value;
        const topic = $('#promptTopic').value.trim() || 'الموضوع الموجود في المحتوى المرفق';
        const correctTf = language === 'ar' ? 'صحيح أو خطأ' : 'True or False';
        const typeLabel = {
          mcq: 'اختيار من متعدد (mcq)',
          true_false: 'صح أم خطأ (true_false)',
          multi_select: 'اختيار متعدد الإجابات (multi_select)'
        }[type];
        const typeRules = {
          mcq: `نوع السؤال: "mcq" فقط.
- option_1 وoption_2 وoption_3 وoption_4 خيارات مختلفة.
- option_5 فارغ تماماً.
- correct_answer رقم الخيار الصحيح فقط: 1 أو 2 أو 3 أو 4.`,
          true_false: `نوع السؤال: "true_false" فقط.
- option_1 إلى option_5 تترك فارغة تماماً.
- correct_answer تكون "${correctTf}" حسب لغة الاختبار.`,
          multi_select: `نوع السؤال: "multi_select" فقط.
- option_1 إلى option_4 خيارات مختلفة.
- option_5 فارغ تماماً.
- correct_answer أرقام الخيارات الصحيحة مفصولة بفاصلة، مثل: "1,3" أو "2,4".`
        }[type];
        return `الدور: خبير في تصميم الاختبارات ومطور بيانات CSV لدعم اللغة العربية (UTF-8 with BOM).

المهمة: قراءة المحتوى المرفق وتوليد بنك أسئلة بصيغة CSV لنوع "${typeLabel}" فقط.

شروط وإعدادات الملف:
- عدد الأسئلة المطلوب: ${count} سؤالاً.
- لغة الاختبار: ${language === 'ar' ? 'العربية الفصحى' : 'English'}.
- موضوع الاختبار: ${topic}.
- الدرجات (points): درجة واحدة لكل سؤال (إجمالي العلامات = عدد الأسئلة).
- مصدر المعلومات: نص الكتاب أو المحتوى المرفق فقط دون أي إضافات خارجية.
- تفاصيل العناوين: ممنوع ذكر اسم الدرس أو الوحدة أو العناوين الفرعية تماماً.

${typeRules}

مواصفات CSV:
- استخدم الأعمدة التالية بالترتيب الدقيق:
id,type,difficulty,points,question_text,hint,explanation,status,option_1,option_2,option_3,option_4,option_5,correct_answer
- id يترك فارغاً تماماً.
- difficulty تكون واحدة من: easy أو medium أو hard.
- points تكون "1".
- status تكون "published".
- explanation شرح مختصر ودقيق للإجابة من المحتوى المرفق.
- لا تضف أي أعمدة أخرى.

التنفيذ:
1. اكتب كود Python يقرأ المحتوى المرفق ويستخرج البيانات.
2. أنشئ ملف CSV مشفراً بـ UTF-8 with BOM باستخدام encoding="utf-8-sig".
3. اجعل الملف قابلاً للتنزيل مباشرة، وزودني برابط التنزيل المباشر.
4. أعد ${count} سؤالاً بالضبط.
5. لا تضع Markdown أو شرحاً خارج ملف CSV عند إنشاء البيانات.`;
      }

      async function copyPromptText(prompt) {
        try {
          await navigator.clipboard.writeText(prompt);
        } catch (error) {
          const textarea = document.createElement('textarea');
          textarea.value = prompt;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }
      }

      $('#closePromptModal').addEventListener('click', closePromptBuilder);
      $('#cancelPrompt').addEventListener('click', closePromptBuilder);
      promptOverlay.addEventListener('click', event => { if (event.target === promptOverlay) closePromptBuilder(); });
      $('#buildPrompt').addEventListener('click', async () => {
        const countInput = $('#promptCount');
        const count = Number(countInput.value);
        if (!Number.isInteger(count) || count < 1 || count > 100) {
          toast('أدخل عدد أسئلة بين 1 و100', { danger: true });
          countInput.focus();
          return;
        }
        await copyPromptText(buildGeneralPrompt());
        closePromptBuilder();
        toast('تم إنشاء البرومت ونسخه بنجاح');
      });

      function bindShuffleButtons() {
        const sQBtn = $('#shuffleQuestionsBtn');
        if (sQBtn && !sQBtn.dataset.bound) {
          sQBtn.dataset.bound = 'true';
          sQBtn.addEventListener('click', async () => {
            if (!state.partId || !questions[state.partId] || questions[state.partId].length < 2) return;
            const ok = await askConfirm('ترتيب عشوائي للأسئلة', 'هل تريد إعادة ترتيب كافة أسئلة هذا الاختبار عشوائياً وحفظ الترتيب الجديد؟', { okLabel: 'خلط الأسئلة' });
            if (!ok) return;
            shuffleArray(questions[state.partId]);
            apiCall('reorder_questions', { order: questions[state.partId].map(q => q.id) });
            persistData();
            renderQuestions();
            toast('تم ترتيب الأسئلة عشوائياً وحفظها في قاعدة البيانات!');
          });
        }

        const sOBtn = $('#shuffleOptionsBtn');
        if (sOBtn && !sOBtn.dataset.bound) {
          sOBtn.dataset.bound = 'true';
          sOBtn.addEventListener('click', async () => {
            if (!state.partId || !questions[state.partId]) return;
            const ok = await askConfirm('ترتيب عشوائي للخيارات', 'هل تريد خلط وإعادة ترتيب خيارات الإجابة عشوائياً لكافة أسئلة هذا الاختبار مع الحفاظ على صحة الإجابات؟', { okLabel: 'خلط الخيارات' });
            if (!ok) return;
            const list = questions[state.partId];
            let shuffledCount = 0;
            for (const q of list) {
              if (q.options && q.options.length > 1) {
                shuffleArray(q.options);
                apiCall('save_question', { id: q.id, partId: state.partId, subjectId: state.subjectId, ...q });
                shuffledCount++;
              }
            }
            persistData();
            renderQuestions();
            toast(`تم خلط وترتيب خيارات الإجابة عشوائياً لـ ${shuffledCount} سؤالاً!`);
          });
        }

        const promptBtn = $('#generatePromptBtn');
        if (promptBtn && !promptBtn.dataset.bound) {
          promptBtn.dataset.bound = 'true';
          promptBtn.addEventListener('click', () => {
            openPromptBuilder();
          });
        }
      }

      // ---------------- Questions Master/Detail Render ----------------

      function renderQuestions() {
        const list = state.partId ? (questions[state.partId] || []) : [];
        const qCountEl = $('#qCount');
        if (qCountEl) qCountEl.textContent = state.partId ? `(${list.length})` : '';

        const searchRow = $('#qSearchRow');
        const statsRow = $('#qStatsRow');
        const toolbarRow = $('#qToolbarRow');
        const qIndex = $('#qIndex');
        const qDetail = $('#qDetail');

        if (!state.partId) {
          if (searchRow) searchRow.style.display = 'none';
          if (statsRow) statsRow.style.display = 'none';
          if (toolbarRow) toolbarRow.style.display = 'flex';
          if (qIndex) qIndex.innerHTML = `<div class="qplaceholder-box"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="9 18 15 12 9 6"/></svg><p>اختر اختباراً</p></div>`;
          if (qDetail) qDetail.innerHTML = `<div class="qplaceholder-box"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>اختر اختباراً أولاً</p><span class="hint">ثم اختر سؤالاً من القائمة لعرض تفاصيله</span></div>`;
          currentDetailQId = null;
          return;
        }

        if (searchRow) searchRow.style.display = 'flex';
        if (statsRow) statsRow.style.display = 'flex';
        if (toolbarRow) toolbarRow.style.display = 'flex';

        // Compute Stats
        const ptsTotal = list.reduce((a, q) => a + (q.points || 0), 0);
        const easyCount = list.filter(q => (q.diff || 'med') === 'easy').length;
        const medCount = list.filter(q => (q.diff || 'med') === 'med').length;
        const hardCount = list.filter(q => (q.diff || 'med') === 'hard').length;
        const totalQ = list.length || 1;
        const easyPct = Math.round((easyCount / totalQ) * 100);
        const medPct = Math.round((medCount / totalQ) * 100);
        const hardPct = Math.max(0, 100 - easyPct - medPct);

        const currentP = state.subjectId ? (parts[state.subjectId] || []).find(x => x.id === state.partId) : null;
        const timeLimit = currentP ? (currentP.timeLimit || 30) : 30;
        const avgSecPerQ = list.length ? Math.round((timeLimit * 60) / list.length) : 0;

        // Fill Stats
        if ($('#qStatDuration')) $('#qStatDuration').textContent = `${timeLimit} د`;
        if ($('#qStatAvgTime')) $('#qStatAvgTime').textContent = `المدة (${avgSecPerQ}ث / سؤال)`;
        if ($('#qStatTotalPts')) $('#qStatTotalPts').textContent = ptsTotal;
        if ($('#qStatDistTotal')) $('#qStatDistTotal').textContent = `${list.length} سؤال`;
        if ($('#qBarEasy')) $('#qBarEasy').style.width = `${easyPct}%`;
        if ($('#qBarMed')) $('#qBarMed').style.width = `${medPct}%`;
        if ($('#qBarHard')) $('#qBarHard').style.width = `${hardPct}%`;
        if ($('#qStatEasyCount')) $('#qStatEasyCount').textContent = easyCount;
        if ($('#qStatMedCount')) $('#qStatMedCount').textContent = medCount;
        if ($('#qStatHardCount')) $('#qStatHardCount').textContent = hardCount;

        // Filter questions
        const term = questionSearchTerm.trim().toLowerCase();
        const filtered = list.filter((q, i) => !term || (q.textAr || '').toLowerCase().includes(term) || (q.textEn || '').toLowerCase().includes(term) || String(i + 1) === term);

        if (list.length === 0) {
          if (qIndex) qIndex.innerHTML = `<div class="qplaceholder-box"><p>لا توجد أسئلة بعد</p><span class="hint">اضغط "+ إضافة سؤال"</span></div>`;
          if (qDetail) qDetail.innerHTML = `<div class="qplaceholder-box"><p>لا توجد أسئلة في هذا الاختبار</p></div>`;
          currentDetailQId = null;
          updateBulkBar();
          bindShuffleButtons();
          return;
        }

        if (filtered.length === 0) {
          if (qIndex) qIndex.innerHTML = `<div class="qplaceholder-box"><p>لا توجد نتائج مطابقة</p></div>`;
          if (qDetail) qDetail.innerHTML = `<div class="qplaceholder-box"><p>لا توجد نتائج مطابقة للبحث</p></div>`;
          updateBulkBar();
          bindShuffleButtons();
          return;
        }

        // Ensure active question
        if (!currentDetailQId || !list.find(q => q.id === currentDetailQId)) {
          currentDetailQId = filtered[0].id;
        }

        // Render qindex
        qIndex.innerHTML = filtered.map((q, fi) => {
          const i = list.indexOf(q);
          const diffCls = q.diff === 'easy' ? 'easy' : (q.diff === 'hard' ? 'hard' : 'mid');
          const p = state.subjectId ? (parts[state.subjectId] || []).find(x => x.id === state.partId) : null;
          const isEng = p && p.forceEnglish;
          const txt = isEng ? (q.textEn || q.textAr || '') : (q.textAr || q.textEn || '');
          return `
        <div class="qrow ${q.id === currentDetailQId ? 'active' : ''}" data-id="${q.id}">
          ${selectMode ? `<input type="checkbox" class="q-check" data-id="${q.id}" ${selectedQIds.has(q.id) ? 'checked' : ''} style="margin-left:4px;">` : ''}
          <div class="qnum mono">Q${i + 1}</div>
          <div class="qrow-text">
            <div class="qt">${esc(txt)}</div>
            <div class="qm">
              <span class="dchip ${diffCls}"></span>
            </div>
          </div>
          <div class="pts">${q.points} pt</div>
        </div>
      `;
        }).join('');

        // Render qdetail
        const activeQ = list.find(q => q.id === currentDetailQId) || filtered[0];
        renderDetailView(activeQ, list);

        // Bind click events on index rows
        qIndex.querySelectorAll('.qrow').forEach(row => {
          row.addEventListener('click', (e) => {
            if (e.target.closest('input[type=checkbox]')) return;
            const qid = Number(row.dataset.id);
            currentDetailQId = qid;
            qIndex.querySelectorAll('.qrow').forEach(r => r.classList.toggle('active', Number(r.dataset.id) === qid));
            const clickedQ = list.find(q => q.id === qid);
            renderDetailView(clickedQ, list);
          });
        });

        // Checkbox events
        qIndex.querySelectorAll('.q-check').forEach(cb => cb.addEventListener('change', e => {
          const id = Number(cb.dataset.id);
          if (cb.checked) selectedQIds.add(id); else selectedQIds.delete(id);
          updateBulkBar();
        }));

        // Search input
        $('#qSearchInput')?.addEventListener('input', e => { questionSearchTerm = e.target.value; renderQuestions(); });

        updateBulkBar();
        bindShuffleButtons();
      }

      function renderDetailView(q, list) {
        const panel = $('#qDetail');
        if (!panel || !q) return;
        const i = list.indexOf(q);
        const diffMap = { easy: 'سهل', med: 'متوسط', hard: 'صعب' };
        const diffTagMap = { easy: 'easy', med: 'mid', hard: 'hard' };
        const diffLabel = diffMap[q.diff || 'med'] || 'متوسط';
        const diffTag = diffTagMap[q.diff || 'med'] || 'mid';

        const p = state.subjectId ? (parts[state.subjectId] || []).find(x => x.id === state.partId) : null;
        const isEng = p && p.forceEnglish;
        const mainText = isEng ? (q.textEn || q.textAr) : (q.textAr || q.textEn);
        const subText = isEng ? (q.textAr && q.textAr !== q.textEn ? q.textAr : '') : (q.textEn && q.textEn !== q.textAr ? q.textEn : '');

        let optionsHtml = '';
        if (q.type === 'short') {
          optionsHtml = `<div class="short-answer-box"><b>نموذج الإجابة:</b> ${safeHtml(q.modelAnswer) || '<span style="opacity:.6">غير محدد</span>'}</div>`;
        } else if (q.type === 'essay') {
          optionsHtml = `<div class="essay-box"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:4px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> سؤال مقالي — يُقيَّم يدوياً.</div>`;
        } else if (q.options && q.options.length) {
          optionsHtml = `
        <div class="options-title">
          <span class="kufi">خيارات الإجابة</span>
          <span class="count mono">${q.options.length} خيارات</span>
        </div>
        <div class="options">
          ${q.options.map((o, idx) => `
            <div class="opt ${o.correct ? 'correct' : ''}">
              <div class="opt-mark mono">${String.fromCharCode(65 + idx)}</div>
              <div class="opt-text">${safeHtml(o.text)}</div>
              ${o.correct ? '<div class="opt-status"><svg class="icon" viewBox="0 0 24 24" width="13" height="13"><path d="M20 6L9 17l-5-5"/></svg>الإجابة الصحيحة</div>' : ''}
            </div>
          `).join('')}
        </div>
      `;
        }

        panel.innerHTML = `
      <div class="qd-top">
        <div class="qd-tags">
          <span class="tag neutral mono">Q${i + 1}</span>
          <span class="tag ${diffTag}">${diffLabel}</span>
          <span class="tag neutral">${typeShort[q.type] || q.type || 'MCQ'}</span>
          <span class="tag neutral mono">${q.points} pt</span>
          <span class="tag neutral">${q.cat || 'Db'}</span>
        </div>
        <div class="qd-actions">
          <button class="icon-btn edit-q" data-id="${q.id}" title="تعديل"><svg class="icon" viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg></button>
          <button class="icon-btn dup-q" data-id="${q.id}" title="نسخ"><svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button>
          <button class="icon-btn move-up" data-id="${q.id}" title="نقل لأعلى" ${i === 0 ? 'disabled' : ''}><svg class="icon" viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
          <button class="icon-btn move-down" data-id="${q.id}" title="نقل لأسفل" ${i === list.length - 1 ? 'disabled' : ''}><svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg></button>
          <button class="icon-btn danger del-q" data-id="${q.id}" title="حذف"><svg class="icon" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>
        </div>
      </div>

      <div class="qd-prompt" dir="${isEng && q.textEn ? 'ltr' : 'rtl'}" style="${isEng && q.textEn ? 'text-align:left;' : ''}">
        ${safeHtml(mainText)}
        ${subText ? `<div style="font-size:13px;color:var(--ink-faint);margin-top:6px;font-weight:400;" dir="${isEng ? 'rtl' : 'ltr'}">${safeHtml(subText)}</div>` : ''}
      </div>

      ${q.code ? `
        <div class="ide">
          <div class="ide-bar">
            <span class="lbl">IDE VIEW</span>
            <div class="ide-dots"><span></span><span></span><span></span></div>
          </div>
          <pre class="ide-code"><code class="language-java">${esc(q.code)}</code></pre>
        </div>` : ''}

      ${optionsHtml}

      ${q.explanationAr ? `
        <button type="button" class="explain-toggle" data-q="${q.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:3px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> عرض الشرح التوضيحي</button>
        <div class="explain-box" id="explain-${q.id}">${safeHtml(q.explanationAr)}</div>
      ` : ''}

      <div class="qd-footer">
        <span>معرّف السؤال: Q${i + 1}_${(q.cat || 'db').toLowerCase()}_${q.id}</span>
        <span>النوع: ${typeShort[q.type] || q.type} · النقاط: ${q.points} pt</span>
      </div>
    `;

        renderRich(panel);

        // Bind action buttons
        panel.querySelector('.edit-q')?.addEventListener('click', () => openModal(Number(q.id)));
        panel.querySelector('.dup-q')?.addEventListener('click', () => {
          toast('لا يمكن نسخ سؤال مطابق داخل نفس الاختبار. غيّر نص السؤال أولاً.');
        });
        panel.querySelector('.move-up')?.addEventListener('click', () => reorderQuestion(Number(q.id), -1));
        panel.querySelector('.move-down')?.addEventListener('click', () => reorderQuestion(Number(q.id), 1));
        panel.querySelector('.del-q')?.addEventListener('click', async () => {
          const ok = await askConfirm('حذف السؤال', 'هل تريد حذف هذا السؤال نهائياً؟', { okLabel: 'حذف', danger: true });
          if (!ok) return;
          const qid = Number(q.id);
          const result = await apiCall('delete_question', { id: qid });
          if (!result?.success) {
            toast('تعذر حذف السؤال: ' + (result?.error || 'خطأ غير معروف'), { danger: true });
            return;
          }
          const idx = list.findIndex(x => x.id === qid);
          const removed = list[idx];
          questions[state.partId] = list.filter(x => x.id !== qid);
          persistData();
          currentDetailQId = null;
          renderAll();
          toast(result.firestore_synced ? 'تم حذف السؤال ومزامنته مباشرة' : 'تم حذفه محلياً، تعذرت مزامنة Firestore', { danger: !result.firestore_synced });
        });
        panel.querySelectorAll('.explain-toggle').forEach(b => b.addEventListener('click', () => {
          $('#explain-' + b.dataset.q)?.classList.toggle('open');
        }));
      }

      function updateBulkBar() {
        const bar = $('#bulkBar');
        if (!bar) return;
        bar.classList.toggle('open', selectMode && selectedQIds.size > 0);
        const c = $('#selCount'); if (c) c.textContent = selectedQIds.size;
      }
      $('#selectModeBtn').addEventListener('click', () => {
        if (!state.partId) { toast('اختر اختباراً أولاً', { danger: true }); return; }
        selectMode = !selectMode;
        selectedQIds.clear();
        $('#selectModeBtn').classList.toggle('active-sel', selectMode);
        $('#selectModeBtn').innerHTML = selectMode
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> إلغاء`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> تحديد`;
        renderQuestions();
      });
      document.addEventListener('click', e => {
        if (e.target.id === 'bulkClear') { selectedQIds.clear(); renderQuestions(); }
        if (e.target.id === 'bulkDelete') {
          (async () => {
            const ok = await askConfirm('حذف الأسئلة المحددة', `سيتم حذف ${selectedQIds.size} سؤالاً نهائياً.`, { okLabel: 'حذف', danger: true });
            if (!ok) return;
            const idsToDelete = Array.from(selectedQIds);
            const result = await apiCall('bulk_delete_questions', { ids: idsToDelete });
            if (!result?.success) {
              toast('تعذر حذف الأسئلة: ' + (result?.error || 'خطأ غير معروف'), { danger: true });
              return;
            }
            questions[state.partId] = questions[state.partId].filter(q => !selectedQIds.has(q.id));
            toast(result.firestore_synced ? `تم حذف ${idsToDelete.length} سؤالاً ومزامنتها مباشرة` : 'تم الحذف محلياً، تعذرت مزامنة Firestore', { danger: !result.firestore_synced });
            selectedQIds.clear();
            persistData();
            renderAll();
          })();
        }
      });

      function reorderQuestion(qId, dir) {
        const list = questions[state.partId];
        const idx = list.findIndex(q => q.id === qId);
        const swapWith = idx + dir;
        if (swapWith < 0 || swapWith >= list.length) return;
        [list[idx], list[swapWith]] = [list[swapWith], list[idx]];
        persistData();
        renderQuestions();
      }

      // ---------------- Lazy load questions for selected part ----------------
      async function loadQuestionsForPart(partId) {
        if (!partId) return;
        if (questions[partId] !== undefined) return; // already loaded or cached
        questions[partId] = []; // show empty while loading
        renderQuestions();
        const res = await apiCall('load_questions', { partId });
        if (res && res.success) {
          const qs = res.questions || [];
          if (qs.length > 0) {
            qs.forEach(q => {
              q.id = parseInt(q.id);
              q.points = parseFloat(q.points) || 1;
            });
          }
          questions[partId] = qs;
          if (nextQId <= 200) {
            qs.forEach(q => { if (q.id >= nextQId) nextQId = q.id + 1; });
          }
          renderQuestions();
          renderTally();
        }
      }



      let currentChartInstance = null;

      function renderGlobalAnalyticsSection() {
        const host = $('#difficultySectionHost');
        if (!host) return;

        let allQs = [];
        Object.values(questions).forEach(list => {
          if (Array.isArray(list)) allQs.push(...list);
        });

        const totalCount = allQs.length;
        const easyCount = allQs.filter(q => (q.diff || 'med') === 'easy').length;
        const medCount = allQs.filter(q => (q.diff || 'med') === 'med').length;
        const hardCount = allQs.filter(q => (q.diff || 'med') === 'hard').length;
        const totalPts = allQs.reduce((s, q) => s + (q.points || 0), 0);

        let totalTests = 0;
        Object.values(parts).forEach(list => { totalTests += list.length; });

        const easyPct = totalCount ? Math.round((easyCount / totalCount) * 100) : 0;
        const medPct = totalCount ? Math.round((medCount / totalCount) * 100) : 0;
        const hardPct = totalCount ? Math.max(0, 100 - easyPct - medPct) : 0;

        host.innerHTML = `
      <div class="global-analytics-panel">
        <div class="ga-header">
          <div class="ga-title-wrap">
            <div class="ga-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            </div>
            <div>
              <h2 class="ga-title">تحليلات بنك الأسئلة الشاملة — حركة وتدفق مستويات الصعوبة</h2>
              <p class="ga-sub">إحصائية شاملة ومؤشرات الصعوبة وتوزيع الأسئلة عبر كافة المواد والاختبارات</p>
            </div>
          </div>
          <div style="font-size:12px;font-weight:700;color:var(--ink-soft);background:var(--paper-deep);padding:6px 14px;border-radius:999px;border:1px solid var(--rule);">
            تحديث مباشر لقاعدة البيانات
          </div>
        </div>

        <div class="ga-pills-row">
          <div class="ga-pill purple">
            <div class="p-val">${totalCount.toLocaleString('ar-EG')}</div>
            <div class="p-lbl">إجمالي الأسئلة</div>
          </div>
          <div class="ga-pill blue">
            <div class="p-val">${totalTests} اختبار</div>
            <div class="p-lbl">${subjects.length} مادة دراسية</div>
          </div>
          <div class="ga-pill green">
            <div class="p-val">${easyCount} <span style="font-size:12px">(${easyPct}%)</span></div>
            <div class="p-lbl">🟢 أسئلة سهلة</div>
          </div>
          <div class="ga-pill amber">
            <div class="p-val">${medCount} <span style="font-size:12px">(${medPct}%)</span></div>
            <div class="lbl p-lbl">🟡 أسئلة متوسطة</div>
          </div>
          <div class="ga-pill red">
            <div class="p-val">${hardCount} <span style="font-size:12px">(${hardPct}%)</span></div>
            <div class="p-lbl">🔴 أسئلة صعبة</div>
          </div>
          <div class="ga-pill gold">
            <div class="p-val">${totalPts.toLocaleString('ar-EG')}</div>
            <div class="p-lbl">مجموع العلامات</div>
          </div>
        </div>

        <div class="ga-chart-box">
          <div class="ga-chart-title">
            <span>📈 منحنى تدفق وتوزيع الصعوبة لكافة الأسئلة (سهل ⟵ متوسط ⟵ صعب)</span>
            <span style="font-size:11px;color:var(--ink-faint)">مبني على ${totalCount} سؤال</span>
          </div>
          <div class="ga-chart-container">
            <canvas id="quizDiffChart"></canvas>
          </div>
        </div>
      </div>
    `;

        renderGlobalChart(easyCount, medCount, hardCount, allQs);
      }

      function renderGlobalChart(easyCount, medCount, hardCount, allQs) {
        const canvas = document.getElementById('quizDiffChart');
        if (!canvas || !window.Chart) return;

        if (currentChartInstance) {
          currentChartInstance.destroy();
          currentChartInstance = null;
        }

        const easyMarks = allQs.filter(q => (q.diff || 'med') === 'easy').reduce((a, q) => a + (q.points || 0), 0);
        const medMarks = allQs.filter(q => (q.diff || 'med') === 'med').reduce((a, q) => a + (q.points || 0), 0);
        const hardMarks = allQs.filter(q => (q.diff || 'med') === 'hard').reduce((a, q) => a + (q.points || 0), 0);

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(2, 132, 199, 0.40)');
        gradient.addColorStop(1, 'rgba(2, 132, 199, 0.01)');

        currentChartInstance = new Chart(ctx, {
          type: 'line',
          data: {
            labels: ['أسئلة سهلة (Easy)', 'أسئلة متوسطة (Medium)', 'أسئلة صعبة (Hard)'],
            datasets: [
              {
                label: 'إجمالي عدد الأسئلة',
                data: [easyCount, medCount, hardCount],
                borderColor: '#0284c7',
                backgroundColor: gradient,
                fill: true,
                tension: 0.45,
                borderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 8,
                pointBackgroundColor: '#0284c7',
              },
              {
                label: 'إجمالي مجموع العلامات',
                data: [easyMarks, medMarks, hardMarks],
                borderColor: '#8b5cf6',
                backgroundColor: 'transparent',
                borderDash: [6, 6],
                tension: 0.45,
                borderWidth: 2.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointBackgroundColor: '#8b5cf6',
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                rtl: true,
                labels: {
                  boxWidth: 14,
                  font: { family: 'Tajawal', size: 12, weight: 'bold' }
                }
              },
              tooltip: {
                rtl: true,
                titleFont: { family: 'Tajawal', size: 13 },
                bodyFont: { family: 'Tajawal', size: 12 }
              }
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { font: { family: 'Tajawal', size: 12, weight: 'bold' }, color: '#5B6152' }
              },
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(222, 210, 174, 0.35)', strokeDashArray: [3, 3] },
                ticks: { font: { family: 'Tajawal', size: 11 }, color: '#9B9A82' }
              }
            }
          }
        });
      }


      function renderAll() {
        try { renderTally(); } catch (e) { console.error('Tally error:', e); }
        try { renderCrumb(); } catch (e) { console.error('Crumb error:', e); }
        try { renderGlobalAnalyticsSection(); } catch (e) { console.error('Analytics error:', e); }
        try { renderSubjects(); } catch (e) { console.error('Subjects error:', e); }
        try { renderParts(); } catch (e) { console.error('Parts error:', e); }
        try { renderQuestions(); } catch (e) { console.error('Questions error:', e); }
        const dash = $('#dashboard');
        if (dash && dash.classList.contains('open')) {
          try { renderDashboard(); } catch (e) { console.error('Dashboard error:', e); }
        }
      }

      $('#subjectSearch').addEventListener('input', e => { subjectSearchTerm = e.target.value; renderSubjects(); });

      // Fix subjectSearch icon - set via DOM since it's static HTML
      const _ic = document.querySelector('#subjectList .search-box .ic'); if (_ic) _ic.innerHTML = ICONS.search;

      // ---------------- Quick-add rows ----------------
      function quickAdd(container, placeholder, onConfirm) {
        if (container.querySelector('.quick-add-row')) return;
        const row = document.createElement('div');
        row.className = 'quick-add-row';
        row.innerHTML = `<input type="text" placeholder="${placeholder}"><button class="qa-ok">إضافة</button><button class="qa-cancel">إلغاء</button>`;
        container.prepend(row);
        const input = row.querySelector('input');
        input.focus();
        const confirmFn = async () => { const v = input.value.trim(); if (v) { await onConfirm(v); } row.remove(); };
        row.querySelector('.qa-ok').addEventListener('click', confirmFn);
        row.querySelector('.qa-cancel').addEventListener('click', () => row.remove());
        input.addEventListener('keydown', e => { if (e.key === 'Enter') confirmFn(); if (e.key === 'Escape') row.remove(); });
      }

      $('#addSubjectBtn').addEventListener('click', () => {
        quickAdd($('#subjectItems'), 'اسم المادة الجديدة...', async (name) => {
          const id = 'subj_' + Math.random().toString(36).slice(2, 8);
          if (subjects.some(subject => normalizeSearchText(subject.name) === normalizeSearchText(name))) {
            toast('هذه المادة موجودة بالفعل.', { danger: true });
            return;
          }
          const result = await apiCall('save_subject', { id, name, icon: 'book' });
          if (!result?.success) {
            toast(result?.error || 'تعذر إضافة المادة.', { danger: true });
            return;
          }
          subjects.push({ id, name, icon: 'book' });
          state.subjectId = id; state.partId = null;
          persistData();
          renderAll(); toast('تمت إضافة المادة');
        });
      });
      $('#addPartBtn').addEventListener('click', () => {
        if (!state.subjectId) { toast('اختر مادة أولاً', { danger: true }); return; }
        quickAdd($('#partList'), 'اسم الاختبار الجديد...', (name) => {
          const id = 'part_' + Math.random().toString(36).slice(2, 8);
          if (!parts[state.subjectId]) parts[state.subjectId] = [];
          const color = quizColors[parts[state.subjectId].length % quizColors.length];
          const newP = { id, name, icon: 'pencil', color, category: '', timeLimit: 30, passScore: 60, forceEnglish: false, titleEn: '' };
          parts[state.subjectId].push(newP);
          state.partId = id;
          questions[id] = [];
          apiCall('save_part', { id, subjectId: state.subjectId, name, icon: 'pencil', color, category: '', timeLimit: 30, passScore: 60, forceEnglish: 0 });
          persistData();
          renderAll(); toast('تمت إضافة الاختبار');
        });
      });
      $('#addQuestionBtn').addEventListener('click', () => openModal(null));

      const csvInput = document.createElement('input');
      csvInput.type = 'file';
      csvInput.accept = '.csv,text/csv';
      csvInput.style.display = 'none';
      document.body.appendChild(csvInput);

      $('#importCsvBtn').addEventListener('click', () => {
        if (!state.subjectId || !state.partId) {
          toast('اختر مادة ثم اختباراً أولاً', { danger: true });
          return;
        }
        csvInput.value = '';
        csvInput.click();
      });

      csvInput.addEventListener('change', async () => {
        const file = csvInput.files && csvInput.files[0];
        if (!file) return;
        await uploadCsvQuestions(file);
      });

      // ================= Question modal logic =================
      const overlay = $('#overlay');

      function defaultOptionsForType(type) {
        if (type === 'tf') return [{ text: 'صح', correct: true }, { text: 'خطأ', correct: false }];
        if (type === 'mcq') return [{ text: '', correct: true }, { text: '', correct: false }];
        if (type === 'multi') return [{ text: '', correct: true }, { text: '', correct: false }];
        return [];
      }

      function setType(type) {
        currentType = type;
        $('#typeLabel').textContent = typeLabels[type];
        document.querySelectorAll('#typePanel .reg-select-opt').forEach(o => o.classList.toggle('sel', o.dataset.val === type));
        const showOptions = (type === 'mcq' || type === 'multi' || type === 'tf');
        $('#optionsField').style.display = showOptions ? '' : 'none';
        $('#shortAnswerField').style.display = (type === 'short') ? '' : 'none';
        if (showOptions && currentOptions.length === 0) currentOptions = defaultOptionsForType(type);
        if (type === 'tf') currentOptions = [{ text: 'صح', correct: currentOptions[0]?.correct ?? true }, { text: 'خطأ', correct: currentOptions[1]?.correct ?? false }];
        renderOptions();
      }

      function setDiff(d) {
        currentDiff = d;
        $('#diffLabel').textContent = diffLabels[d];
        document.querySelectorAll('#diffPanel .reg-select-opt').forEach(o => o.classList.toggle('sel', o.dataset.val === d));
      }
      $('#diffBox').addEventListener('click', () => {
        $('#diffPanel').classList.toggle('open'); $('#diffBox').classList.toggle('open');
      });
      document.querySelectorAll('#diffPanel .reg-select-opt').forEach(o => {
        o.addEventListener('click', () => { setDiff(o.dataset.val); $('#diffPanel').classList.remove('open'); $('#diffBox').classList.remove('open'); });
      });

      function renderOptions() {
        const wrap = $('#optionsWrap');
        const lockText = currentType === 'tf';
        wrap.innerHTML = currentOptions.map((o, i) => `
      <div class="reg-opt-edit ${o.correct ? 'correct' : ''}" data-i="${i}">
        <div class="reg-opt-edit-top">
          <div class="reg-opt-left">
            <span class="reg-grip">⋮⋮</span>
            <label class="reg-correct-toggle">
              <input type="${currentType === 'multi' ? 'checkbox' : 'radio'}" name="correctOpt" ${o.correct ? 'checked' : ''} class="correct-input">
              صحيح
            </label>
          </div>
          ${o.correct ? '<span class="reg-correct-badge">الإجابة الصحيحة</span>' : `<button type="button" class="icon-btn danger del-opt"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`}
        </div>
        <input type="text" class="opt-text" value="${esc(o.text)}" placeholder="نص الخيار..." ${lockText ? 'readonly' : ''}>
      </div>
    `).join('');

        wrap.querySelectorAll('.reg-opt-edit').forEach(el => {
          const i = Number(el.dataset.i);
          el.querySelector('.correct-input').addEventListener('change', (e) => {
            if (currentType === 'multi') {
              currentOptions[i].correct = e.target.checked;
            } else {
              currentOptions.forEach((o, idx) => o.correct = (idx === i));
            }
            renderOptions();
          });
          el.querySelector('.opt-text').addEventListener('input', (e) => { currentOptions[i].text = e.target.value; });
          const delBtn = el.querySelector('.del-opt');
          if (delBtn) delBtn.addEventListener('click', () => { currentOptions.splice(i, 1); renderOptions(); });
        });
      }

      $('#addOptBtn').addEventListener('click', () => {
        if (currentType === 'tf') { toast('لا يمكن إضافة خيارات لسؤال صح/خطأ', { danger: true }); return; }
        currentOptions.push({ text: '', correct: false });
        renderOptions();
      });

      $('#typeBox').addEventListener('click', () => {
        $('#typePanel').classList.toggle('open');
        $('#typeBox').classList.toggle('open');
      });
      document.querySelectorAll('#typePanel .reg-select-opt').forEach(o => {
        o.addEventListener('click', () => {
          setType(o.dataset.val);
          $('#typePanel').classList.remove('open');
          $('#typeBox').classList.remove('open');
        });
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#typeBox') && !e.target.closest('#typePanel')) {
          $('#typePanel').classList.remove('open'); $('#typeBox').classList.remove('open');
        }
        if (!e.target.closest('#diffBox') && !e.target.closest('#diffPanel')) {
          $('#diffPanel').classList.remove('open'); $('#diffBox').classList.remove('open');
        }
      });

      function clampPts(v) { v = Math.round(v * 2) / 2; return Math.max(0, v); }
      $('#ptsMinus').addEventListener('click', () => { $('#ptsInput').value = clampPts(parseFloat($('#ptsInput').value || 0) - 0.5); });
      $('#ptsPlus').addEventListener('click', () => { $('#ptsInput').value = clampPts(parseFloat($('#ptsInput').value || 0) + 0.5); });

      const tagWrap = { strong: ['<strong>', '</strong>'], em: ['<em>', '</em>'], u: ['<u>', '</u>'], code: ['<code>', '</code>'] };
      document.querySelectorAll('.reg-tbtn[data-wrap]').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.closest('.reg-toolbar').dataset.target;
          const ta = document.getElementById(targetId);
          const [open, close] = tagWrap[btn.dataset.wrap];
          const s = ta.selectionStart, e = ta.selectionEnd;
          const sel = ta.value.slice(s, e) || 'نص';
          ta.value = ta.value.slice(0, s) + open + sel + close + ta.value.slice(e);
          ta.focus();
        });
      });
      document.querySelectorAll('.reg-swatch[data-color]').forEach(sw => {
        sw.addEventListener('click', () => {
          const targetId = sw.closest('.reg-toolbar').dataset.target;
          const ta = document.getElementById(targetId);
          const color = sw.dataset.color;
          const s = ta.selectionStart, e = ta.selectionEnd;
          const sel = ta.value.slice(s, e) || 'نص';
          ta.value = ta.value.slice(0, s) + `<span style="color:${color}">` + sel + `</span>` + ta.value.slice(e);
          ta.focus();
        });
      });

      document.querySelectorAll('.reg-mini-link[data-tr]').forEach(btn => {
        btn.addEventListener('click', () => toast('الترجمة الآلية غير متاحة في هذا العرض التجريبي'));
      });

      $('#dropzone').addEventListener('click', () => $('#imgInput').click());
      $('#imgInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { $('#dzContent').innerHTML = `<img src="${reader.result}"><div>${esc(file.name)}</div>`; };
        reader.readAsDataURL(file);
      });

      function clearFieldErrors() {
        $('#err-qAr').classList.remove('show');
        $('#err-opts').classList.remove('show');
      }

      function resetModalFields() {
        $('#ptsInput').value = '1';
        setType('mcq');
        setDiff('med');
        currentOptions = defaultOptionsForType('mcq');
        renderOptions();
        $('#qAr').value = ''; $('#qEn').value = ''; $('#qCode').value = ''; $('#modelAnswer').value = ''; $('#qExplain').value = '';
        $('#dzContent').innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-left:4px;"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg> اضغط لاختيار صورة`;
        clearFieldErrors();
      }

      function openModal(qId) {
        if (!state.partId) { toast('اختر اختباراً أولاً', { danger: true }); return; }
        resetModalFields();
        state.editingQuestionId = qId || null;
        $('#duplicateBtn').style.display = qId ? '' : 'none';
        if (qId) {
          const q = questions[state.partId].find(x => x.id === qId);
          $('#modalTitle').textContent = 'تعديل سؤال';
          $('#ptsInput').value = q.points;
          setType(q.type);
          setDiff(q.diff || 'med');
          currentOptions = (q.options || []).map(o => ({ ...o }));
          renderOptions();
          $('#qAr').value = q.textAr || '';
          $('#qEn').value = q.textEn || '';
          $('#qCode').value = q.code || '';
          $('#modelAnswer').value = q.modelAnswer || '';
          $('#qExplain').value = q.explanationAr || '';
        } else {
          $('#modalTitle').textContent = 'إضافة سؤال جديد';
        }
        updateNavArrows();
        overlay.classList.add('open');
      }
      function closeModal() { overlay.classList.remove('open'); }

      $('#closeModal').addEventListener('click', closeModal);
      $('#cancelBtn').addEventListener('click', closeModal);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

      document.addEventListener('keydown', (e) => {
        if (overlay.classList.contains('open')) {
          if (e.key === 'Escape') closeModal();
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#saveBtn').click(); }
        }
        if (confirmOverlay.classList.contains('open') && e.key === 'Escape') closeConfirm(null);
        if (settingsOverlay.classList.contains('open') && e.key === 'Escape') settingsOverlay.classList.remove('open');
      });

      function updateNavArrows() {
        const list = questions[state.partId] || [];
        const idx = list.findIndex(q => q.id === state.editingQuestionId);
        $('#prevQ').disabled = idx <= 0;
        $('#nextQ').disabled = idx === -1 || idx >= list.length - 1;
        $('#navPos').textContent = idx >= 0 ? `${idx + 1} / ${list.length}` : '';
      }
      $('#prevQ').addEventListener('click', () => {
        const list = questions[state.partId] || [];
        const idx = list.findIndex(q => q.id === state.editingQuestionId);
        if (idx > 0) openModal(list[idx - 1].id);
      });
      $('#nextQ').addEventListener('click', () => {
        const list = questions[state.partId] || [];
        const idx = list.findIndex(q => q.id === state.editingQuestionId);
        if (idx < list.length - 1) openModal(list[idx + 1].id);
      });

      function buildPayload() {
        return {
          cat: 'Db',
          points: parseFloat($('#ptsInput').value) || 0,
          type: currentType,
          diff: currentDiff,
          textAr: $('#qAr').value.trim(),
          textEn: $('#qEn').value.trim(),
          code: $('#qCode').value,
          modelAnswer: $('#modelAnswer').value.trim(),
          explanationAr: $('#qExplain').value.trim(),
          options: (currentType === 'short' || currentType === 'essay') ? [] : currentOptions.filter(o => o.text.trim() !== '' || currentType === 'tf'),
        };
      }

      $('#saveBtn').addEventListener('click', async () => {
        clearFieldErrors();
        const textAr = $('#qAr').value.trim();
        const textEn = $('#qEn').value.trim();
        let ok = true;
        if (!textAr && !textEn) { $('#err-qAr').classList.add('show'); ok = false; }
        if ((currentType === 'mcq' || currentType === 'multi') && !currentOptions.some(o => o.correct && o.text.trim() !== '')) {
          $('#err-opts').classList.add('show'); ok = false;
        }
        if (!ok) { toast('يرجى تصحيح الحقول المُعلَّمة قبل الحفظ', { danger: true }); return; }

        const payload = buildPayload();
        if (!questions[state.partId]) questions[state.partId] = [];
        if (state.editingQuestionId) {
          const q = questions[state.partId].find(x => x.id === state.editingQuestionId);
          const response = await apiCall('save_question', { id: q.id, partId: state.partId, subjectId: state.subjectId, ...payload });
          if (!response?.success) {
            toast(response?.error || 'تعذر حفظ السؤال', { danger: true });
            return;
          }
          Object.assign(q, payload);
          toast('تم حفظ التعديلات في قاعدة البيانات');
        } else {
          const response = await apiCall('save_question', { id: 0, partId: state.partId, subjectId: state.subjectId, ...payload });
          if (!response?.success) {
            toast(response?.error || 'تعذر إضافة السؤال', { danger: true });
            return;
          }
          questions[state.partId].push({ id: response.id || nextQId++, ...payload });
          toast('تمت إضافة السؤال لقاعدة البيانات');
        }
        closeModal();
        persistData();
        renderAll();
      });

      $('#duplicateBtn').addEventListener('click', () => {
        if (!state.editingQuestionId) return;
        toast('لا يمكن نسخ سؤال مطابق داخل نفس الاختبار. غيّر نص السؤال أولاً.');
      });

      // ================= Export / Import =================
      $('#exportBtn')?.addEventListener('click', () => {
        if (!state.partId) { toast('اختر اختباراً أولاً لتصديره', { danger: true }); return; }
        const p = parts[state.subjectId].find(x => x.id === state.partId);
        const list = questions[state.partId] || [];
        const exportObj = {
          [p.id]: {
            id: p.id,
            title: p.titleEn || p.name,
            titleAr: p.name,
            icon: p.icon,
            color: p.color,
            category: p.category || '',
            forceEnglish: !!p.forceEnglish,
            timeLimit: p.timeLimit || 30,
            passScore: p.passScore || 60,
            questions: list.map((q, i) => ({
              id: i + 1,
              type: q.type,
              difficulty: q.diff || 'med',
              questionAr: q.textAr,
              questionEn: q.textEn,
              code: q.code || undefined,
              options: (q.options || []).map((o, oi) => ({ id: String.fromCharCode(97 + oi), textAr: o.text, textEn: o.text })),
              correctAnswer: (q.options || []).findIndex(o => o.correct) >= 0 ? String.fromCharCode(97 + (q.options || []).findIndex(o => o.correct)) : undefined,
              modelAnswer: q.modelAnswer || undefined,
              marks: q.points,
              explanationAr: q.explanationAr || undefined,
            }))
          }
        };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${p.id}.json`;
        a.click();
        toast('تم تصدير الاختبار');
      });

      $('#importBtn')?.addEventListener('click', () => $('#importFile').click());
      $('#importFile')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            const key = Object.keys(data)[0];
            const quiz = data[key];
            if (!state.subjectId) { toast('اختر مادة أولاً لاستيراد الاختبار إليها', { danger: true }); return; }
            const newPart = {
              id: quiz.id || ('part_' + Math.random().toString(36).slice(2, 8)),
              name: quiz.titleAr || quiz.title || 'اختبار مستورد',
              titleEn: quiz.title || '',
              icon: quiz.icon || 'inbox',
              color: quiz.color || quizColors[0],
              category: quiz.category || '',
              timeLimit: quiz.timeLimit || 30,
              passScore: quiz.passScore || 60,
              forceEnglish: !!quiz.forceEnglish,
            };
            if (!parts[state.subjectId]) parts[state.subjectId] = [];
            parts[state.subjectId].push(newPart);
            questions[newPart.id] = (quiz.questions || []).map(q => {
              const optionsArr = (q.options || []).map(o => ({ text: o.textAr || o.textEn || '', correct: (q.correctAnswer === o.id) }));
              return {
                id: nextQId++,
                cat: 'Db',
                points: q.marks ?? 1,
                type: q.type || 'mcq',
                diff: q.difficulty || 'med',
                textAr: q.questionAr || '',
                textEn: q.questionEn || '',
                code: q.code || '',
                modelAnswer: q.modelAnswer || '',
                explanationAr: q.explanationAr || '',
                options: optionsArr,
              };
            });
            state.partId = newPart.id;
            persistData();
            renderAll();
            toast('تم استيراد الاختبار بنجاح');
          } catch (err) {
            toast('تعذّر قراءة الملف — تأكد أنه بصيغة JSON صحيحة', { danger: true });
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });

      // ================= Print / PDF export =================
      $('#printBtn')?.addEventListener('click', () => {
        if (!state.partId) { toast('اختر اختباراً أولاً للطباعة', { danger: true }); return; }
        const p = parts[state.subjectId].find(x => x.id === state.partId);
        const list = questions[state.partId] || [];
        const area = $('#printArea');
        area.innerHTML = `
      <div style="font-family:'El Messiri',sans-serif;padding:20px;">
        <h1 style="font-size:22px;border-bottom:2px solid #1B3A2E;padding-bottom:10px;">${esc(p.name)}</h1>
        <p style="font-size:12px;color:#555;">عدد الأسئلة: ${list.length} · مجموع العلامات: ${list.reduce((a, q) => a + (q.points || 0), 0)}</p>
        ${list.map((q, i) => `
          <div style="margin:16px 0;padding-bottom:12px;border-bottom:1px solid #ddd;">
            <div style="font-weight:800;margin-bottom:6px;">${i + 1}. ${safeHtml(q.textAr || q.textEn)} <span style="font-weight:400;font-size:11px;">(${q.points} pt)</span></div>
            ${q.code ? `<pre style="background:#12180F;color:#D9DED0;padding:10px;border-radius:6px;direction:ltr;text-align:left;font-size:11px;overflow-x:auto;">${esc(q.code)}</pre>` : ''}
            ${(q.options || []).map((o, oi) => `<div style="font-size:13px;margin:3px 0;">${String.fromCharCode(65 + oi)}. ${safeHtml(o.text)} ${o.correct ? ' [✓]' : ''}</div>`).join('')}
          </div>
        `).join('')}
      </div>
    `;
        window.print();
      });


      $('#syncDbBtn')?.addEventListener('click', async () => {
        const ok = await askConfirm('استيراد ومزامنة قاعدة البيانات', 'هل تريد جلب كافة المواد والاختبارات والأسئلة مباشرة من Firestore الرسمي وتحديث لوحة التحكم بالكامل؟', { okLabel: 'مزامنة الآن' });
        if (!ok) return;
        toast('جارٍ جلب المحتوى الكامل من الموقع الرسمي...');
        const res = await apiCall('sync_all_from_site');
        if (res && res.success) {
          toast(`تمت المزامنة بنجاح! الأسئلة: ${res.counts.questions}، الاختبارات: ${res.counts.parts}، المواد: ${res.counts.subjects}`);
          setTimeout(() => window.location.reload(), 1400);
        } else {
          toast('حدث خطأ أثناء المزامنة: ' + (res.error || 'غير معروف'), { danger: true });
        }
      });

      // Initialize collapsible drawer
      initNavDrawer();

      // Load questions for the initially selected part
      if (state.partId) {
        loadQuestionsForPart(state.partId);
      }
      renderAll();
    })();
  </script>

  <?php
  require __DIR__ . '/_footer.php';
  ?>