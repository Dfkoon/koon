<?php
/**
 * admin/export_center.php — المركز المتقدم لتصدير التقارير الرسمية (Excel / CSV / Printable PDF)
 */
$page_key = 'stats';
$page_title = 'مركز تصدير التقارير والأرشيف';
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();

// ── 1. معالجة طلبات التصدير (Export Handlers) ──────────────────────────────────
$type = $_GET['type'] ?? '';
$format = $_GET['format'] ?? 'csv';

if ($type !== '') {
    // A. تصدير إحصائيات وتفاعل المنصة
    if ($type === 'analytics') {
        $range = $_GET['range'] ?? 'all';
        $query = "SELECT page_name, slug, views_count, unique_visitors, updated_at AS last_visited_at FROM page_views ORDER BY views_count DESC";
        $rows = $db->query($query)->fetchAll(PDO::FETCH_ASSOC);

        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="makanak_analytics_' . date('Y-m-d') . '.csv"');
            echo "\xEF\xBB\xBF";
            $out = fopen('php://output', 'w');
            fputcsv($out, ['الصفحة / القسم', 'الرابط المختصر', 'إجمالي المشاهدات', 'الزوار الفريدين', 'تاريخ آخر زيارة']);
            foreach ($rows as $r) {
                fputcsv($out, [$r['page_name'], $r['slug'], $r['views_count'], $r['unique_visitors'], $r['last_visited_at']]);
            }
            fclose($out);
            exit;
        } elseif ($format === 'print') {
            $totalViews = array_sum(array_column($rows, 'views_count'));
            $totalUnique = array_sum(array_column($rows, 'unique_visitors'));
            ?>
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>تقرير الزيارات وتفاعل المنصة — منصة مكانك</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #1e293b; line-height: 1.5; }
                    .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px; }
                    .header h1 { margin: 0 0 5px; font-size: 24px; color: #0284c7; }
                    .header p { margin: 0; color: #64748b; font-size: 13px; }
                    .summary { display: flex; gap: 20px; margin-bottom: 20px; justify-content: center; }
                    .summary-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 20px; text-align: center; }
                    .summary-box strong { font-size: 20px; color: #0f172a; display: block; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right; }
                    th { background: #f1f5f9; font-weight: bold; }
                    tr:nth-child(even) { background: #f8fafc; }
                    @media print { .no-print { display: none; } body { margin: 0; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 15px; display: flex; justify-content: space-between;">
                    <button onclick="window.print()" style="padding: 8px 16px; background: #0284c7; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">طباعة التقرير / حفظ كـ PDF</button>
                    <a href="export_center.php" style="color: #64748b; text-decoration: none; font-size: 14px;">العودة لمركز التقارير</a>
                </div>
                <div class="header">
                    <h1>منصة مكانك — تقرير الزيارات والتفاعل الأكاديمي</h1>
                    <p>تاريخ استخراج التقرير: <?= date('Y-m-d H:i') ?> | تم التوليد بواسطة وحدة التحكم الإدارية</p>
                </div>
                <div class="summary">
                    <div class="summary-box"><span>إجمالي المشاهدات</span><strong><?= number_format($totalViews) ?></strong></div>
                    <div class="summary-box"><span>إجمالي الزوار الفريدين</span><strong><?= number_format($totalUnique) ?></strong></div>
                    <div class="summary-box"><span>عدد الأقسام المشمولة</span><strong><?= count($rows) ?></strong></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>القسم / الصفحة</th>
                            <th>الرابط</th>
                            <th>المشاهدات</th>
                            <th>الزوار الفريدين</th>
                            <th>آخر نشاط</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($rows as $i => $r): ?>
                            <tr>
                                <td><?= $i + 1 ?></td>
                                <td><strong><?= htmlspecialchars($r['page_name']) ?></strong></td>
                                <td style="font-family: monospace; font-size: 11px;"><?= htmlspecialchars($r['slug']) ?></td>
                                <td><?= number_format($r['views_count']) ?></td>
                                <td><?= number_format($r['unique_visitors']) ?></td>
                                <td><?= htmlspecialchars($r['last_visited_at'] ?? '—') ?></td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </body>
            </html>
            <?php
            exit;
        }
    }

    // B. تصدير بنك الأسئلة والكويزات
    elseif ($type === 'quizzes') {
        $subjectId = trim((string) ($_GET['subject_id'] ?? ''));
        $whereSql = '';
        $qParams = [];
        if ($subjectId !== '') {
            $whereSql = 'WHERE p.subject_id = ?';
            $qParams[] = $subjectId;
        }

        $stmt = $db->prepare("
            SELECT q.id, s.name AS subject_name, p.title AS part_title,
                   COALESCE(NULLIF(q.text_ar, ''), NULLIF(q.question_text, ''), q.text_en, q.question_text_en, '') AS question,
                   q.options_json, q.correct_answer,
                   COALESCE(NULLIF(q.explanation_ar, ''), q.explanation, '') AS explanation
            FROM quiz_questions q
            JOIN quiz_parts p ON q.part_id = p.id
            JOIN quiz_subjects s ON p.subject_id = s.id
            {$whereSql}
            ORDER BY s.sort_order ASC, p.id ASC, q.id ASC
        ");
        $stmt->execute($qParams);
        $questions = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="makanak_questions_' . date('Y-m-d') . '.csv"');
            echo "\xEF\xBB\xBF";
            $out = fopen('php://output', 'w');
            fputcsv($out, ['المعرف', 'المادة', 'القسم / الوحدة', 'نص السؤال', 'الخيار (أ)', 'الخيار (ب)', 'الخيار (ج)', 'الخيار (د)', 'الإجابة النموذجية', 'التوضيح']);
            foreach ($questions as $q) {
                $opts = !empty($q['options_json']) ? json_decode($q['options_json'], true) : [];
                $optA = ''; $optB = ''; $optC = ''; $optD = '';
                if (is_array($opts)) {
                    foreach ($opts as $idx => $opt) {
                        $txt = $opt['text'] ?? $opt['textAr'] ?? $opt['textEn'] ?? (is_string($opt) ? $opt : '');
                        if ($idx === 0 || ($opt['id'] ?? '') === 'a') $optA = $txt;
                        elseif ($idx === 1 || ($opt['id'] ?? '') === 'b') $optB = $txt;
                        elseif ($idx === 2 || ($opt['id'] ?? '') === 'c') $optC = $txt;
                        elseif ($idx === 3 || ($opt['id'] ?? '') === 'd') $optD = $txt;
                    }
                }
                fputcsv($out, [
                    $q['id'],
                    $q['subject_name'],
                    $q['part_title'],
                    $q['question'],
                    $optA,
                    $optB,
                    $optC,
                    $optD,
                    $q['correct_answer'],
                    $q['explanation'] ?? '',
                ]);
            }
            fclose($out);
            exit;
        } elseif ($format === 'print') {
            ?>
            <!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>ورقة أسئلة وبنك الاختبارات — منصة مكانك</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 30px; color: #0f172a; line-height: 1.6; }
                    .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 24px; }
                    .header h2 { margin: 0 0 4px; color: #0284c7; font-size: 22px; }
                    .header p { margin: 0; color: #64748b; font-size: 13px; }
                    .q-card { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; page-break-inside: avoid; }
                    .q-num { font-weight: 900; color: #0284c7; margin-left: 6px; }
                    .q-meta { font-size: 11px; color: #64748b; float: left; }
                    .q-text { font-size: 15px; font-weight: 700; margin: 8px 0 12px; }
                    .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13.5px; }
                    .opt-box { padding: 6px 10px; border-radius: 6px; background: #f8fafc; border: 1px solid #e2e8f0; }
                    .opt-correct { border-color: #86efac; background: #f0fdf4; font-weight: bold; color: #166534; }
                    @media print { .no-print { display: none; } body { margin: 15mm; } }
                </style>
            </head>
            <body>
                <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: space-between;">
                    <button onclick="window.print()" style="padding: 9px 18px; background: #0284c7; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">طباعة ورقة الأسئلة / PDF</button>
                    <a href="export_center.php" style="color: #64748b; text-decoration: none; font-size: 14px;">العودة لمركز التقارير</a>
                </div>
                <div class="header">
                    <h2>منصة مكانك — بنك الاختبارات والأسئلة النموذجية</h2>
                    <p>إجمالي الأسئلة المستخرجة: <?= count($questions) ?> سؤال | تاريخ الاستخراج: <?= date('Y-m-d') ?></p>
                </div>
                <?php foreach ($questions as $idx => $q): ?>
                    <?php
                    $opts = !empty($q['options_json']) ? json_decode($q['options_json'], true) : [];
                    $optLetters = ['A', 'B', 'C', 'D', 'E'];
                    $optLabels = ['أ', 'ب', 'ج', 'د', 'هـ'];
                    ?>
                    <div class="q-card">
                        <span class="q-meta"><?= htmlspecialchars($q['subject_name']) ?> — <?= htmlspecialchars($q['part_title']) ?></span>
                        <div class="q-text">
                            <span class="q-num">س <?= $idx + 1 ?>:</span>
                            <?= htmlspecialchars($q['question']) ?>
                        </div>
                        <div class="options-grid">
                            <?php if (is_array($opts)): ?>
                                <?php foreach ($opts as $oIdx => $opt): ?>
                                    <?php
                                    $txt = $opt['text'] ?? $opt['textAr'] ?? $opt['textEn'] ?? (is_string($opt) ? $opt : '');
                                    $optId = strtolower((string) ($opt['id'] ?? $optLetters[$oIdx] ?? ''));
                                    $corr = strtolower((string) $q['correct_answer']);
                                    $isCorrect = !empty($opt['correct']) || ($optId === $corr);
                                    $label = $optLabels[$oIdx] ?? ($oIdx + 1);
                                    ?>
                                    <div class="opt-box <?= $isCorrect ? 'opt-correct' : '' ?>">
                                        <?= $label ?>) <?= htmlspecialchars($txt) ?>
                                    </div>
                                <?php endforeach; ?>
                            <?php endif; ?>
                        </div>
                        <?php if (!empty($q['explanation'])): ?>
                            <div style="margin-top: 8px; font-size: 12px; color: #0369a1; background: #f0f9ff; padding: 6px 10px; border-radius: 6px;">
                                💡 <strong>التوضيح:</strong> <?= htmlspecialchars($q['explanation']) ?>
                            </div>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
            </body>
            </html>
            <?php
            exit;
        }
    }

    // C. تصدير سجل المنسقين ولوحة الشرف
    elseif ($type === 'coordinators') {
        $coordinators = $db->query("SELECT name, phone, faculty, major, role_type, points, lifetime_points, badge_level, tasks_completed, is_active, joined_at FROM coordinators ORDER BY lifetime_points DESC")->fetchAll(PDO::FETCH_ASSOC);

        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="makanak_coordinators_' . date('Y-m-d') . '.csv"');
            echo "\xEF\xBB\xBF";
            $out = fopen('php://output', 'w');
            fputcsv($out, ['الاسم', 'الهاتف', 'الكلية', 'التخصص', 'الدور / الصفة', 'النقاط الحالية', 'النقاط التراكمية', 'المستوى', 'المهام المنجزة', 'الحالة', 'تاريخ الانضمام']);
            foreach ($coordinators as $c) {
                fputcsv($out, [
                    $c['name'],
                    $c['phone'],
                    $c['faculty'],
                    $c['major'],
                    $c['role_type'],
                    $c['points'],
                    $c['lifetime_points'],
                    $c['badge_level'],
                    $c['tasks_completed'],
                    $c['is_active'] ? 'نشط' : 'معطل',
                    $c['joined_at'],
                ]);
            }
            fclose($out);
            exit;
        }
    }

    // D. تصدير تبادل المواد والكتب
    elseif ($type === 'materials_exchange') {
        $exchanges = $db->query("SELECT id, material_name, course_code, faculty, donor_name, donor_phone, booker_name, booker_phone, status, pickup_date, created_at FROM material_exchanges ORDER BY id DESC")->fetchAll(PDO::FETCH_ASSOC);

        if ($format === 'csv') {
            header('Content-Type: text/csv; charset=UTF-8');
            header('Content-Disposition: attachment; filename="makanak_materials_exchange_' . date('Y-m-d') . '.csv"');
            echo "\xEF\xBB\xBF";
            $out = fopen('php://output', 'w');
            fputcsv($out, ['المعرف', 'اسم المادة / الكتاب', 'رمز المساق', 'الكلية', 'المتبرع', 'هاتف المتبرع', 'المستلم / الحاجز', 'هاتف المستلم', 'الحالة', 'تاريخ الاستلام', 'تاريخ الإضافة']);
            foreach ($exchanges as $ex) {
                fputcsv($out, [
                    $ex['id'],
                    $ex['material_name'],
                    $ex['course_code'],
                    $ex['faculty'],
                    $ex['donor_name'],
                    $ex['donor_phone'],
                    $ex['booker_name'] ?? '—',
                    $ex['booker_phone'] ?? '—',
                    $ex['status'],
                    $ex['pickup_date'] ?? '—',
                    $ex['created_at'],
                ]);
            }
            fclose($out);
            exit;
        }
    }
}

// جلب المواد لقائمة الفلتر
$subjects = $db->query("SELECT id, name FROM quiz_subjects ORDER BY sort_order ASC")->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:16px; margin-bottom:24px;">
    <div>
        <h2 style="font-family:'Cairo',sans-serif; font-size:22px; font-weight:900; margin:0 0 4px; color:#0f172a; display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#0284c7" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            مركز تصدير التقارير والأرشيف الأكاديمي
        </h2>
        <p style="margin:0; font-size:13px; color:#64748b;">استخراج ملفات Excel (CSV) بترميز عربي سليم وتقارير PDF منسقة للطباعة لعمادة شؤون الطلبة والإدارة الجامعية</p>
    </div>
</div>

<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">

    <!-- 1. بطاقة تقرير الإحصائيات والأداء -->
    <div class="panel-box" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:#e0f2fe; display:flex; align-items:center; justify-content:center; color:#0284c7;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                </div>
                <div>
                    <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">إحصائيات الزيارات والتفاعل</h3>
                    <span style="font-size:12px; color:#64748b;">بيانات المشاهدات وتفاعل الطلبة مع الأقسام</span>
                </div>
            </div>
            <p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:18px;">
                يتضمن التقرير إجمالي المشاهدات، والزوار الفريدين لكل قسم (المواد، الكويزات، تبادل المواد، الخطط)، وتاريخ آخر زيارة.
            </p>
        </div>
        <div style="display:flex; gap:10px; border-top:1px solid #f1f5f9; padding-top:16px;">
            <a href="?type=analytics&format=csv" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; text-align:center; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                تصدير Excel (CSV)
            </a>
            <a href="?type=analytics&format=print" target="_blank" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; text-align:center; border-radius:8px; background:#f0f9ff; border:1px solid #bae6fd; color:#0369a1; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                طباعة / PDF
            </a>
        </div>
    </div>

    <!-- 2. بطاقة بنك الكويزات والأسئلة -->
    <div class="panel-box" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:#fef3c7; display:flex; align-items:center; justify-content:center; color:#b45309;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
                </div>
                <div>
                    <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">بنك الأسئلة والاختبارات</h3>
                    <span style="font-size:12px; color:#64748b;">تصدير نماذج امتحانات وبنك الأسئلة الكامل</span>
                </div>
            </div>
            <form method="GET" action="" id="quiz-export-form" style="margin-bottom:14px;">
                <input type="hidden" name="type" value="quizzes">
                <label style="display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">تصفية حسب المساق / المادة:</label>
                <select name="subject_id" id="quiz_subj_select" style="width:100%; padding:8px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px; background:#fff;">
                    <option value="">كافة المواد والمساقات</option>
                    <?php foreach ($subjects as $s): ?>
                        <option value="<?= htmlspecialchars($s['id']) ?>"><?= htmlspecialchars($s['name']) ?></option>
                    <?php endforeach; ?>
                </select>
            </form>
        </div>
        <div style="display:flex; gap:10px; border-top:1px solid #f1f5f9; padding-top:16px;">
            <button type="button" onclick="exportQuiz('csv')" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                تصدير Excel (CSV)
            </button>
            <button type="button" onclick="exportQuiz('print')" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; border-radius:8px; background:#f0f9ff; border:1px solid #bae6fd; color:#0369a1; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                نموذج امتحان / PDF
            </button>
        </div>
    </div>

    <!-- 3. بطاقة سجل المنسقين وفرق العمل -->
    <div class="panel-box" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:#ede9fe; display:flex; align-items:center; justify-content:center; color:#6d28d9;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <div>
                    <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">سجل المنسقين ونقاط التكريم</h3>
                    <span style="font-size:12px; color:#64748b;">إنجازات الفرق، الرتب ونقاط المكافآت</span>
                </div>
            </div>
            <p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:18px;">
                كشف إحصائي كامل يشمل بيانات منسقي الكليات، عدد المهام المكتملة، الرتبة (برونزي، فضي، ذهبي، بلاتيني)، ورصيد النقاط المستحق.
            </p>
        </div>
        <div style="display:flex; gap:10px; border-top:1px solid #f1f5f9; padding-top:16px;">
            <a href="?type=coordinators&format=csv" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; text-align:center; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                تصدير Excel (CSV)
            </a>
            <a href="coordinators.php" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; text-align:center; border-radius:8px; background:#f8fafc; border:1px solid #cbd5e1; color:#1e293b; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
                إدارة المنسقين
            </a>
        </div>
    </div>

    <!-- 4. بطاقة تبادل المواد وتدوير الكتب -->
    <div class="panel-box" style="padding:22px; display:flex; flex-direction:column; justify-content:space-between;">
        <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                <div style="width:40px; height:40px; border-radius:10px; background:#fce7f3; display:flex; align-items:center; justify-content:center; color:#be185d;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" x2="10"/><circle cx="12" cy="15" r="2"/></svg>
                </div>
                <div>
                    <h3 style="margin:0; font-size:16px; font-weight:800; color:#0f172a;">سجل تبادل المواد والكتب</h3>
                    <span style="font-size:12px; color:#64748b;">حركة التبرعات واستلام الكتب والمستلزمات</span>
                </div>
            </div>
            <p style="font-size:13px; color:#475569; line-height:1.6; margin-bottom:18px;">
                تصدير كافة طلبات تبادل المواد وتدوير المراجع الدراسية، أسماء المتبرعين والمستفيدين، وتواريخ التسليم.
            </p>
        </div>
        <div style="display:flex; gap:10px; border-top:1px solid #f1f5f9; padding-top:16px;">
            <a href="?type=materials_exchange&format=csv" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; text-align:center; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                تصدير Excel (CSV)
            </a>
            <a href="donations.php" style="flex:1; padding:9px 12px; font-size:12.5px; font-weight:800; text-align:center; border-radius:8px; background:#f8fafc; border:1px solid #cbd5e1; color:#1e293b; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:6px;">
                إدارة التبادل
            </a>
        </div>
    </div>

</div>

<script>
function exportQuiz(format) {
    const subj = document.getElementById('quiz_subj_select').value;
    let url = '?type=quizzes&format=' + format;
    if (subj) {
        url += '&subject_id=' + encodeURIComponent(subj);
    }
    if (format === 'print') {
        window.open(url, '_blank');
    } else {
        window.location.href = url;
    }
}
</script>

<?php require __DIR__ . '/_footer.php'; ?>
