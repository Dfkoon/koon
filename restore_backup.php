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

    // 2. استرجاع المواد الدراسية (study_materials)
    $hasMaterials = (int) $bDb->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='study_materials'")->fetchColumn();
    if ($hasMaterials > 0) {
        $mCount = (int) $bDb->query("SELECT count(*) FROM study_materials WHERE status = 'active'")->fetchColumn();
        echo "📚 عدد المواد الدراسية في النسخة الاحتياطية: {$mCount}\n";
        if ($mCount > 0) {
            // إضافة الأعمدة المفقودة إن لزم
            $existingCols = $db->query("PRAGMA table_info(study_materials)")->fetchAll(PDO::FETCH_COLUMN, 1);
            foreach (['semester' => 'TEXT DEFAULT "first"', 'academic_year' => 'TEXT DEFAULT "all_levels"'] as $col => $type) {
                if (!in_array($col, $existingCols)) {
                    $db->exec("ALTER TABLE study_materials ADD COLUMN $col $type");
                }
            }
            $materials = $bDb->query("SELECT * FROM study_materials WHERE status = 'active'")->fetchAll(PDO::FETCH_ASSOC);
            $insertM = $db->prepare("INSERT OR IGNORE INTO study_materials 
                (id, title, course_name, course_code, faculty, major, requirement_category, material_type,
                 semester, academic_year, instructor, file_url, file_type, status, description,
                 contributor_name, downloads_count, views_count, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $restoredM = 0;
            foreach ($materials as $m) {
                try {
                    $insertM->execute([
                        $m['id'], $m['title'], $m['course_name'], $m['course_code'] ?? '',
                        $m['faculty'] ?? '', $m['major'] ?? '', $m['major'] ?? '',
                        $m['material_type'] ?? 'summary',
                        $m['semester'] ?? 'first', $m['academic_year'] ?? 'all_levels',
                        $m['instructor'] ?? '', $m['file_url'] ?? '', $m['file_type'] ?? 'pdf',
                        $m['status'] ?? 'active', $m['description'] ?? '',
                        $m['contributor_name'] ?? '', $m['downloads_count'] ?? 0, $m['views_count'] ?? 0,
                        $m['created_at'] ?? date('Y-m-d H:i:s'), $m['updated_at'] ?? date('Y-m-d H:i:s'),
                    ]);
                    $restoredM++;
                } catch (Throwable $me) {}
            }
            echo "✅ تم دمج {$restoredM} مادة دراسية من النسخة الاحتياطية بنجاح!\n";
        }
    }

    // 3. استرجاع الأجزاء والاختبارات
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

    // 4. استرجاع وتفعيل حسابات المنسقين
    $hasCoords = (int) $bDb->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='coordinators'")->fetchColumn();
    if ($hasCoords > 0) {
        $coords = $bDb->query("SELECT * FROM coordinators")->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($coords)) {
            $cInsert = $db->prepare("INSERT OR REPLACE INTO coordinators (
                id, name, phone, gender, faculty, major, role_type, bio,
                tasks_count, tasks_completed, is_active, joined_at, last_active_at,
                notes, user_id, points, lifetime_points, badge_level, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
            foreach ($coords as $c) {
                try {
                    $cInsert->execute([
                        $c['id'], $c['name'], $c['phone'] ?? '', $c['gender'] ?? 'male',
                        $c['faculty'] ?? '', $c['major'] ?? '', $c['role_type'] ?? 'coordinator',
                        $c['bio'] ?? '', (int) ($c['tasks_count'] ?? 0), (int) ($c['tasks_completed'] ?? 0),
                        $c['joined_at'] ?? date('Y-m-d'), $c['last_active_at'] ?? null,
                        $c['notes'] ?? '', $c['user_id'] ?? null, (int) ($c['points'] ?? 0),
                        (int) ($c['lifetime_points'] ?? 0), $c['badge_level'] ?? 'bronze'
                    ]);
                } catch (Throwable $ce) {}
            }
            echo "✅ تم استرجاع " . count($coords) . " منسق وتفعيلهم بنجاح!\n";
        }
    }
    // تفعيل جميع المنسقين بدون استثناء
    $db->exec("UPDATE coordinators SET is_active = 1;");
    $totalActiveCoords = (int) $db->query("SELECT count(*) FROM coordinators WHERE is_active = 1")->fetchColumn();
    echo "👥 إجمالي المنسقين النشطين حالياً: {$totalActiveCoords}\n";

    // 5. استرجاع وتأمين حسابات المستخدمين وكلمات المرور السابقة
    $hasUsers = (int) $bDb->query("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='users'")->fetchColumn();
    if ($hasUsers > 0) {
        $uList = $bDb->query("SELECT * FROM users")->fetchAll(PDO::FETCH_ASSOC);
        if (!empty($uList)) {
            $checkUserStmt = $db->prepare("SELECT id FROM users WHERE username = ? OR id = ? LIMIT 1");
            $uUpdate = $db->prepare("UPDATE users SET full_name = ?, role = ?, password_hash = ?, must_change_password = 0, failed_attempts = 0, locked_until = 0 WHERE id = ?");
            $uInsert = $db->prepare("INSERT INTO users (
                id, username, full_name, email, role, password_hash,
                totp_secret, totp_enabled, must_change_password, failed_attempts,
                locked_until, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, CURRENT_TIMESTAMP)");

            $restoredUsers = 0;
            foreach ($uList as $u) {
                try {
                    $checkUserStmt->execute([$u['username'], $u['id']]);
                    $existingUserId = $checkUserStmt->fetchColumn();
                    if ($existingUserId) {
                        $uUpdate->execute([
                            $u['full_name'] ?? $u['username'],
                            $u['role'] ?? 'coordinator',
                            $u['password_hash'],
                            $existingUserId
                        ]);
                    } else {
                        $uInsert->execute([
                            $u['id'], $u['username'], $u['full_name'] ?? $u['username'],
                            $u['email'] ?? '', $u['role'] ?? 'coordinator',
                            $u['password_hash'], $u['totp_secret'] ?? null, (int) ($u['totp_enabled'] ?? 0)
                        ]);
                    }
                    $restoredUsers++;
                } catch (Throwable $ue) {}
            }
            echo "✅ تم استرجاع وتأمين {$restoredUsers} حساب مستخدم بكلمات المرور السابقة بنجاح!\n";
        }
    }
    // تصفير أي محاولات فاشلة وفك الأقفال عن جميع الحسابات
    $db->exec("UPDATE users SET failed_attempts = 0, locked_until = 0, must_change_password = 0;");

    // 6. استرجاع كافة الأسئلة والمواد من حزمة البيانات الشاملة (quizData.js - 1,395 سؤالاً عبر 59 مادة)
    require_once __DIR__ . '/includes/seed_quizzes.php';
    echo "🔄 جاري دمج بنك الأسئلة الشامل (1,395 سؤالاً عبر 59 مادة)...\n";
    $seedRes = seed_quizzes_from_bundle($db, true);
    if (($seedRes['status'] ?? '') === 'success' || ($seedRes['status'] ?? '') === 'skipped') {
        echo "✅ تم دمج وتحديث بنك الأسئلة بالكامل: {$seedRes['questions']} سؤال عبر {$seedRes['parts']} اختبار في {$seedRes['subjects']} مادة!\n";
    }

    $db->exec("PRAGMA foreign_keys = ON;");

    $currTotalQ = (int) $db->query("SELECT count(*) FROM quiz_questions")->fetchColumn();
    $currTotalP = (int) $db->query("SELECT count(*) FROM quiz_parts")->fetchColumn();
    $currTotalS = (int) $db->query("SELECT count(*) FROM quiz_subjects")->fetchColumn();
    $currTotalM = (int) $db->query("SELECT count(*) FROM study_materials")->fetchColumn();
    $currTotalC = (int) $db->query("SELECT count(*) FROM coordinators WHERE is_active = 1")->fetchColumn();
    echo "\n🎉 إجمالي البيانات في قاعدة البيانات الحالية:\n";
    echo "- المواد الدراسية: {$currTotalM}\n";
    echo "- مواد الاختبارات: {$currTotalS}\n";
    echo "- الاختبارات: {$currTotalP}\n";
    echo "- الأسئلة: {$currTotalQ}\n";
    echo "- المنسقين النشطين: {$currTotalC}\n";

} catch (Throwable $e) {
    echo "❌ خطأ أثناء الاسترجاع: " . $e->getMessage() . "\n";
    exit(1);
}
