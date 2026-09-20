<?php
/**
 * scripts/restore_from_backup.php
 * يسترجع الملاحظات والتعليمات والأسئلة والبيانات من النسخة الاحتياطية إلى قاعدة البيانات الحالية
 */
require_once __DIR__ . '/config.php';

$db = get_db();
$baseDir = __DIR__;

$backupFiles = glob($baseDir . '/.backups/*.sqlite');
if (empty($backupFiles)) {
    echo "❌ لم يتم العثور على ملفات نسخ احتياطية في مجلد .backups\n";
    exit(1);
}

rsort($backupFiles);
$backupFile = $backupFiles[0];
echo "🔍 جاري فحص أحدث نسخة احتياطية: " . basename($backupFile) . " (حجم: " . round(filesize($backupFile) / 1024 / 1024, 2) . " MB)\n";

try {
    $bDb = new PDO('sqlite:' . $backupFile);
    $bDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. استرجاع الملاحظات والتعليمات (quiz_admin_guides)
    $hasGuides = (int) $bDb->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='quiz_admin_guides'")->fetchColumn();
    if ($hasGuides > 0) {
        $guides = $bDb->query("SELECT * FROM quiz_admin_guides")->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($guides)) {
            $stmt = $db->prepare("INSERT INTO quiz_admin_guides (id, title, content, attachment_url, attachment_type, attachment_name, updated_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    content = excluded.content,
                    attachment_url = excluded.attachment_url,
                    attachment_type = excluded.attachment_type,
                    attachment_name = excluded.attachment_name,
                    updated_by = excluded.updated_by,
                    updated_at = excluded.updated_at");
            foreach ($guides as $g) {
                $stmt->execute([
                    $g['id'], $g['title'], $g['content'], $g['attachment_url'],
                    $g['attachment_type'], $g['attachment_name'], $g['updated_by'] ?? 1,
                    $g['updated_at'] ?? date('Y-m-d H:i:s')
                ]);
            }
            echo "✅ تم استرجاع " . count($guides) . " من الملاحظات والتعليمات (quiz_admin_guides) بنجاح!\n";
        } else {
            echo "ℹ️ جدول الملاحظات في النسخة الاحتياطية فارغ.\n";
        }
    }

    // 2. استرجاع أي أسئلة واختبارات إضافية
    $hasQuestions = (int) $bDb->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='quiz_questions'")->fetchColumn();
    if ($hasQuestions > 0) {
        $qCount = (int) $bDb->query("SELECT count(*) FROM quiz_questions")->fetchColumn();
        echo "📊 عدد الأسئلة في النسخة الاحتياطية: {$qCount}\n";
        if ($qCount > 0) {
            $questions = $bDb->query("SELECT * FROM quiz_questions")->fetchAll(PDO::FETCH_ASSOC);
            $insertQ = $db->prepare("INSERT OR IGNORE INTO quiz_questions (
                id, part_id, question_text, question_text_en, question_type, options_json,
                correct_answer, marks, explanation, image_url, code_block, source_part_id,
                source_subject_id, part_slug, subject_slug, cat, points, type, diff,
                text_ar, text_en, code, explanation_ar, model_answer, sort_order, created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )");
            $restoredQ = 0;
            foreach ($questions as $q) {
                $insertQ->execute([
                    $q['id'], $q['part_id'] ?? 1, $q['question_text'] ?? ($q['text_ar'] ?? ''),
                    $q['question_text_en'] ?? ($q['text_en'] ?? ''), $q['question_type'] ?? ($q['type'] ?? 'mcq'),
                    $q['options_json'] ?? '[]', $q['correct_answer'] ?? '', $q['marks'] ?? ($q['points'] ?? 1),
                    $q['explanation'] ?? ($q['explanation_ar'] ?? ''), $q['image_url'] ?? '',
                    $q['code_block'] ?? ($q['code'] ?? ''), $q['source_part_id'] ?? ($q['part_slug'] ?? ''),
                    $q['source_subject_id'] ?? ($q['subject_slug'] ?? ''), $q['part_slug'] ?? '',
                    $q['subject_slug'] ?? '', $q['cat'] ?? 'Db', $q['points'] ?? ($q['marks'] ?? 1),
                    $q['type'] ?? ($q['question_type'] ?? 'mcq'), $q['diff'] ?? 'med',
                    $q['text_ar'] ?? ($q['question_text'] ?? ''), $q['text_en'] ?? ($q['question_text_en'] ?? ''),
                    $q['code'] ?? ($q['code_block'] ?? ''), $q['explanation_ar'] ?? ($q['explanation'] ?? ''),
                    $q['model_answer'] ?? '', $q['sort_order'] ?? 0
                ]);
                $restoredQ++;
            }
            echo "✅ تم دمج {$restoredQ} سؤال من النسخة الاحتياطية بنجاح!\n";
        }
    }

    $currTotalQ = (int) $db->query("SELECT count(*) FROM quiz_questions")->fetchColumn();
    $currTotalP = (int) $db->query("SELECT count(*) FROM quiz_parts")->fetchColumn();
    $currTotalS = (int) $db->query("SELECT count(*) FROM quiz_subjects")->fetchColumn();
    echo "\n🎉 إجمالي البيانات في قاعدة البيانات الحالية:\n";
    echo "- المواد: {$currTotalS}\n";
    echo "- الاختبارات: {$currTotalP}\n";
    echo "- الأسئلة: {$currTotalQ}\n";

} catch (Throwable $e) {
    echo "❌ خطأ أثناء الاسترجاع: " . $e->getMessage() . "\n";
    exit(1);
}
