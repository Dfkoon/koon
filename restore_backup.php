<?php
/**
 * scripts/restore_from_backup.php
 * restore_backup.php
 * يسترجع الملاحظات والتعليمات والأسئلة والبيانات من النسخة الاحتياطية إلى قاعدة البيانات الحالية
 */
if (file_exists(__DIR__ . '/config.php')) {
    require_once __DIR__ . '/config.php';
} elseif (file_exists(__DIR__ . '/../config.php')) {
    require_once __DIR__ . '/../config.php';
}

$db = get_db();
$baseDir = __DIR__;

$backupFiles = glob($baseDir . '/.backups/*.sqlite');

// فحص ملفات database.sqlite.before-* أيضاً (قد تكون أحدث)
$beforeFiles = glob($baseDir . '/database.sqlite.before-*');
if (!empty($beforeFiles)) {
    $backupFiles = array_merge($backupFiles ?: [], $beforeFiles);
}

if (empty($backupFiles)) {
    echo "❌ لم يتم العثور على ملفات نسخ احتياطية في مجلد .backups\n";
    echo "❌ لم يتم العثور على ملفات نسخ احتياطية في مجلد .backups أو ملفات database.sqlite.before-*\n";
    exit(1);
}

rsort($backupFiles);
// ترتيب حسب تاريخ التعديل (الأحدث أولاً)
usort($backupFiles, fn($a, $b) => filemtime($b) - filemtime($a));
$backupFile = $backupFiles[0];
echo "🔍 جاري فحص أحدث نسخة احتياطية: " . basename($backupFile) . " (حجم: " . round(filesize($backupFile) / 1024 / 1024, 2) . " MB)\n";
echo "🔍 جاري فحص أحدث نسخة احتياطية: " . basename($backupFile) . " (حجم: " . round(filesize($backupFile) / 1024 / 1024, 2) . " MB, تعديل: " . date('Y-m-d H:i', filemtime($backupFile)) . ")\n";
if (count($backupFiles) > 1) {
    echo "ℹ️ ملفات احتياطية متاحة:\n";
    foreach ($backupFiles as $f) {
        echo "   - " . basename($f) . " (" . date('Y-m-d H:i', filemtime($f)) . ")\n";
    }
}

try {
    $bDb = new PDO('sqlite:' . $backupFile);
    $bDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec("PRAGMA foreign_keys = OFF;");
    $bDb->exec("PRAGMA foreign_keys = OFF;");

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
    // 2. استرجاع الأجزاء والاختبارات
    $hasParts = (int) $bDb->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='quiz_parts'")->fetchColumn();
    if ($hasParts > 0) {
        $parts = $bDb->query("SELECT * FROM quiz_parts")->fetchAll(PDO::FETCH_ASSOC);
        $insertPart = $db->prepare("INSERT OR IGNORE INTO quiz_parts (
            id, slug, subject_id, name, title, title_en, icon, color, category,
            duration_minutes, time_limit, pass_mark, pass_score, force_english,
            status, source_id, source_subject_id, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
        foreach ($parts as $p) {
            $insertPart->execute([
                $p['id'], $p['slug'] ?: (string) $p['id'], $p['subject_id'] ?? '',
                $p['name'] ?? '', $p['title'] ?? '', $p['title_en'] ?? '',
                $p['icon'] ?? 'doc', $p['color'] ?? '#1B3A2E', $p['category'] ?? 'Quiz',
                $p['duration_minutes'] ?? 30, $p['time_limit'] ?? 30, $p['pass_mark'] ?? 60,
                $p['pass_score'] ?? 60, $p['force_english'] ?? 0, 'active',
                $p['source_id'] ?? ($p['slug'] ?: (string) $p['id']),
                $p['source_subject_id'] ?? ($p['subject_id'] ?? ''), $p['sort_order'] ?? 0
            ]);
        }
    }

    // 3. استرجاع أي أسئلة إضافية
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
                try {
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
                } catch (Throwable $qErr) {}
            }
            echo "✅ تم دمج {$restoredQ} سؤال من النسخة الاحتياطية بنجاح!\n";
        }
    }

    $db->exec("PRAGMA foreign_keys = ON;");

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
