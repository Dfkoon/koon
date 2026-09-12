<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

function checkHttp(string $url, float $timeout = 5.0): array
{
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => (int) max(3, ceil($timeout)),
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
  ]);

  $response = curl_exec($ch);
  $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

  return [
    'code' => (int) $httpCode,
    'body' => is_string($response) ? $response : '',
  ];
}

$db = get_db();

echo "LIVE SYNC VERIFICATION REPORT\n";
echo "===============================================\n\n";

// 1. Firestore connectivity
$firestoreUrl = 'https://firestore.googleapis.com/v1/projects/koon-609da/databases/(default)/documents/quiz_subjects?pageSize=1&key=AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';
$firestoreCheck = checkHttp($firestoreUrl, 5.0);

echo "1. Firestore Connection:\n";
if ($firestoreCheck['code'] === 200) {
  echo "   OK: Firestore API connected\n";
} else {
  echo "   ERROR: HTTP {$firestoreCheck['code']}\n";
}

// 2. Frontend data file
$quizFile = __DIR__ . '/koon.quiz/src/data/quizData.js';
echo "\n2. Frontend Data File:\n";
if (is_file($quizFile)) {
  $bytes = filesize($quizFile);
  $mtime = filemtime($quizFile);
  echo "   OK: quizData.js exists ({$bytes} bytes, modified " . date('Y-m-d H:i:s', (int) $mtime) . ")\n";
} else {
  echo "   ERROR: quizData.js not found at {$quizFile}\n";
}

// 3. Local database health
$questionCount = (int) $db->query('SELECT COUNT(*) FROM quiz_questions')->fetchColumn();
$subjectCount = (int) $db->query('SELECT COUNT(*) FROM quiz_subjects')->fetchColumn();
$partCount = (int) $db->query('SELECT COUNT(*) FROM quiz_parts')->fetchColumn();

echo "\n3. Local SQLite State:\n";
echo "   OK: quiz_questions={$questionCount}, quiz_subjects={$subjectCount}, quiz_parts={$partCount}\n";

// 4. Optional live sync smoke check
$syncUrl = 'https://firestore.googleapis.com/v1/projects/koon-609da/databases/(default)/documents/page_views?pageSize=1&key=AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';
$syncCheck = checkHttp($syncUrl, 5.0);

echo "\n4. Live Sync Smoke Check:\n";
if ($syncCheck['code'] === 200) {
  echo "   OK: Firestore page_views collection is reachable\n";
} else {
  echo "   ERROR: Firestore page_views check failed with HTTP {$syncCheck['code']}\n";
}

echo "\n===============================================\n";
echo "Verification complete.\n";
