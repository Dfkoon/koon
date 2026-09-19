<?php
/**
 * includes/seed_quizzes.php
 * يتيح استيراد وتعبئة بنك الأسئلة والاختبارات والمواد تلقائياً من حزمة quizData.js
 * في حال كانت قاعدة بيانات SQLite فارغة أو عند طلب إعادة المزامنة.
 */

function seed_quizzes_from_bundle(PDO $db, bool $force = false): array
{
    $qCount = (int) $db->query('SELECT count(*) FROM quiz_questions')->fetchColumn();
    $pCount = (int) $db->query('SELECT count(*) FROM quiz_parts')->fetchColumn();

    if (!$force && $qCount > 0 && $pCount > 0) {
        return [
            'status' => 'skipped',
            'message' => 'قاعدة البيانات تحتوي بالفعل على أسئلة واختبارات.',
            'subjects' => (int) $db->query('SELECT count(*) FROM quiz_subjects')->fetchColumn(),
            'parts' => $pCount,
            'questions' => $qCount,
        ];
    }

    $baseDir = dirname(__DIR__);
    $possibleFiles = [
        $baseDir . '/mt-bau-full/src/data/quizData.js',
        $baseDir . '/Makanak Al-Jami\'i/src/data/quizData.js',
        $baseDir . '/../Makanak Al-Jami\'i/src/data/quizData.js',
        $baseDir . '/koon.quiz/src/data/quizData.js',
        $baseDir . '/scratch_quiz_export.json',
    ];

    $quizData = null;
    $quizCategories = null;

    foreach ($possibleFiles as $file) {
        if (!file_exists($file) || filesize($file) < 500) {
            continue;
        }

        $ext = pathinfo($file, PATHINFO_EXTENSION);
        if ($ext === 'json') {
            $json = json_decode(file_get_contents($file), true);
            if (!empty($json['quizData']) && !empty($json['categories'])) {
                $quizData = $json['quizData'];
                $quizCategories = $json['categories'];
                break;
            }
        } elseif ($ext === 'js') {
            $content = file_get_contents($file);
            $posData = strpos($content, 'export const quizData =');
            $posCats = strpos($content, 'export const quizCategories =');
            if ($posData !== false && $posCats !== false) {
                $dataStr = trim(substr($content, $posData + strlen('export const quizData ='), $posCats - ($posData + strlen('export const quizData ='))));
                $dataStr = rtrim(rtrim($dataStr), ';');
                $catsStr = trim(substr($content, $posCats + strlen('export const quizCategories =')));
                $catsStr = rtrim(rtrim($catsStr), ';');
                $decodedData = json_decode($dataStr, true);
                $decodedCats = json_decode($catsStr, true);
                if (is_array($decodedData) && !empty($decodedData)) {
                    $quizData = $decodedData;
                    $quizCategories = is_array($decodedCats) ? $decodedCats : [];
                    break;
                }
            }
        }
    }

    if (empty($quizData)) {
        return [
            'status' => 'error',
            'message' => 'لم يتم العثور على ملف quizData.js لاستيراد البيانات منه.',
            'subjects' => 0,
            'parts' => 0,
            'questions' => 0,
        ];
    }

    // بناء خريطة الأجزاء إلى المواد من quizCategories
    $partToSubjectMap = [];
    $subjectOrder = 0;

    $findSubjectStmt = $db->prepare('SELECT id FROM quiz_subjects WHERE id = ? LIMIT 1');
    $insertSubjectStmt = $db->prepare('INSERT INTO quiz_subjects (id, name, name_en, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)');
    $updateSubjectStmt = $db->prepare('UPDATE quiz_subjects SET name = ?, name_en = ?, icon = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

    $db->beginTransaction();

    try {
        if (is_array($quizCategories)) {
            foreach ($quizCategories as $cat) {
                $subId = trim((string) ($cat['id'] ?? ''));
                if ($subId === '') continue;

                $nameAr = trim((string) ($cat['nameAr'] ?? ($cat['name'] ?? $subId)));
                $nameEn = trim((string) ($cat['name'] ?? $subId));
                $icon = trim((string) ($cat['icon'] ?? 'book'));

                $findSubjectStmt->execute([$subId]);
                if ($findSubjectStmt->fetchColumn()) {
                    $updateSubjectStmt->execute([$nameAr, $nameEn, $icon, $subId]);
                } else {
                    $insertSubjectStmt->execute([$subId, $nameAr, $nameEn, $icon, ++$subjectOrder]);
                }

                if (!empty($cat['parts']) && is_array($cat['parts'])) {
                    foreach ($cat['parts'] as $p) {
                        $pId = trim((string) ($p['id'] ?? ''));
                        if ($pId !== '') {
                            $partToSubjectMap[$pId] = [
                                'subject_id' => $subId,
                                'title' => (string) ($p['title'] ?? ''),
                                'titleAr' => (string) ($p['titleAr'] ?? ''),
                            ];
                        }
                    }
                }
            }
        }

        // استعلامات إدارة الأجزاء
        $findPartStmt = $db->prepare('SELECT id FROM quiz_parts WHERE slug = ? OR id = ? LIMIT 1');
        $insertPartStmt = $db->prepare('INSERT INTO quiz_parts (
            slug, subject_id, name, title, title_en, icon, color, category,
            duration_minutes, time_limit, pass_mark, pass_score, force_english,
            status, source_id, source_subject_id, sort_order, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            "active", ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )');
        $updatePartStmt = $db->prepare('UPDATE quiz_parts SET
            subject_id = ?, name = ?, title = ?, title_en = ?, icon = ?, color = ?,
            source_subject_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?');

        $partOrder = 0;
        $insertedParts = 0;

        foreach ($quizData as $partSlug => $partDef) {
            $partSlug = trim((string) ($partDef['id'] ?? $partSlug));
            if ($partSlug === '') continue;

            $meta = $partToSubjectMap[$partSlug] ?? null;
            $subId = $meta['subject_id'] ?? '';

            if ($subId === '') {
                foreach (array_keys($partToSubjectMap) as $knownPart) {
                    $prefix = preg_replace('/_(quiz\d+|midterm|final|part\d+|expected|p\d+).*$/i', '', $partSlug);
                    if ($prefix !== '' && strpos($knownPart, $prefix) === 0) {
                        $subId = $partToSubjectMap[$knownPart]['subject_id'];
                        break;
                    }
                }
            }
            if ($subId === '') {
                $subId = preg_replace('/_(quiz\d+|midterm|final|part\d+|expected|p\d+).*$/i', '', $partSlug);
            }

            $titleEn = (string) ($partDef['title'] ?? ($meta['title'] ?? $partSlug));
            $titleAr = (string) ($partDef['titleAr'] ?? ($meta['titleAr'] ?? $titleEn));
            $icon = (string) ($partDef['icon'] ?? 'doc');
            $color = (string) ($partDef['color'] ?? '#1B3A2E');
            $forceEnglish = !empty($partDef['forceEnglish']) ? 1 : 0;
            $category = !empty($partDef['category']) ? $partDef['category'] : 'Quiz';

            $findPartStmt->execute([$partSlug, $partSlug]);
            $existingPartId = $findPartStmt->fetchColumn();

            if ($existingPartId) {
                $updatePartStmt->execute([
                    $subId,
                    $titleAr,
                    $titleAr,
                    $titleEn,
                    $icon,
                    $color,
                    $subId,
                    $existingPartId
                ]);
            } else {
                $insertPartStmt->execute([
                    $partSlug,
                    $subId,
                    $titleAr,
                    $titleAr,
                    $titleEn,
                    $icon,
                    $color,
                    $category,
                    30,
                    30,
                    60,
                    60,
                    $forceEnglish,
                    $partSlug,
                    $subId,
                    ++$partOrder
                ]);
            }
            $insertedParts++;
        }

        // جلب خريطة معرفات الأجزاء الرقمية
        $partIdRows = $db->query('SELECT slug, id FROM quiz_parts')->fetchAll(PDO::FETCH_KEY_PAIR);

        // استعلامات إدارة الأسئلة
        $findQStmt = $db->prepare('SELECT id FROM quiz_questions WHERE id = ? LIMIT 1');
        $insertQStmt = $db->prepare('INSERT INTO quiz_questions (
            id, part_id, question_text, question_text_en, question_type, options_json,
            correct_answer, marks, explanation, image_url, code_block, source_part_id,
            source_subject_id, part_slug, subject_slug, cat, points, type, diff,
            text_ar, text_en, code, explanation_ar, model_answer, sort_order, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )');
        $updateQStmt = $db->prepare('UPDATE quiz_questions SET
            part_id = ?, question_text = ?, question_text_en = ?, question_type = ?, options_json = ?,
            correct_answer = ?, marks = ?, explanation = ?, image_url = ?, code_block = ?,
            part_slug = ?, subject_slug = ?, points = ?, text_ar = ?, text_en = ?, code = ?,
            explanation_ar = ?, model_answer = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?');

        $insertedQuestions = 0;
        $nextAutoQId = (int) ($db->query('SELECT MAX(id) FROM quiz_questions')->fetchColumn() ?: 10000);

        foreach ($quizData as $partSlug => $partDef) {
            $partSlug = trim((string) ($partDef['id'] ?? $partSlug));
            $intPartId = (int) ($partIdRows[$partSlug] ?? 1);
            $subId = $partToSubjectMap[$partSlug]['subject_id'] ?? preg_replace('/_(quiz\d+|midterm|final|part\d+|expected|p\d+).*$/i', '', $partSlug);

            $questions = $partDef['questions'] ?? [];
            if (!is_array($questions)) continue;

            $qSort = 0;
            foreach ($questions as $q) {
                $rawId = isset($q['id']) && is_numeric($q['id']) ? (int) $q['id'] : ++$nextAutoQId;
                $textAr = trim((string) ($q['questionAr'] ?? ($q['text_ar'] ?? ($q['question'] ?? ''))));
                $textEn = trim((string) ($q['questionEn'] ?? ($q['text_en'] ?? '')));
                $qType = trim((string) ($q['type'] ?? 'mcq'));
                $options = is_array($q['options'] ?? null) ? $q['options'] : [];
                $optionsJson = json_encode($options, JSON_UNESCAPED_UNICODE);
                $correct = trim((string) ($q['correctAnswer'] ?? ($q['correct_answer'] ?? '')));
                $points = (float) ($q['marks'] ?? ($q['points'] ?? 1));
                $explanation = trim((string) ($q['explanationAr'] ?? ($q['explanation'] ?? '')));
                $code = trim((string) ($q['code'] ?? ''));
                $imageUrl = trim((string) ($q['imageUrl'] ?? ($q['image_url'] ?? '')));
                $modelAnswer = trim((string) ($q['modelAnswer'] ?? ($q['model_answer'] ?? '')));

                $findQStmt->execute([$rawId]);
                if ($findQStmt->fetchColumn()) {
                    $updateQStmt->execute([
                        $intPartId,
                        $textAr,
                        $textEn,
                        $qType,
                        $optionsJson,
                        $correct,
                        $points,
                        $explanation,
                        $imageUrl,
                        $code,
                        $partSlug,
                        $subId,
                        $points,
                        $textAr,
                        $textEn,
                        $code,
                        $explanation,
                        $modelAnswer,
                        $rawId
                    ]);
                } else {
                    $insertQStmt->execute([
                        $rawId,
                        $intPartId,
                        $textAr,
                        $textEn,
                        $qType,
                        $optionsJson,
                        $correct,
                        $points,
                        $explanation,
                        $imageUrl,
                        $code,
                        $partSlug,
                        $subId,
                        $partSlug,
                        $subId,
                        'Db',
                        $points,
                        $qType,
                        'med',
                        $textAr,
                        $textEn,
                        $code,
                        $explanation,
                        $modelAnswer,
                        ++$qSort
                    ]);
                }
                $insertedQuestions++;
            }
        }

        $db->commit();

        return [
            'status' => 'success',
            'message' => 'تم استيراد بنك الاختبارات والأسئلة بنجاح!',
            'subjects' => (int) $db->query('SELECT count(*) FROM quiz_subjects')->fetchColumn(),
            'parts' => (int) $db->query('SELECT count(*) FROM quiz_parts')->fetchColumn(),
            'questions' => (int) $db->query('SELECT count(*) FROM quiz_questions')->fetchColumn(),
        ];
    } catch (Throwable $e) {
        $db->rollBack();
        error_log('seed_quizzes_from_bundle failed: ' . $e->getMessage());
        return [
            'status' => 'error',
            'message' => 'حدث خطأ أثناء استيراد الأسئلة: ' . $e->getMessage(),
            'subjects' => 0,
            'parts' => 0,
            'questions' => 0,
        ];
    }
}
