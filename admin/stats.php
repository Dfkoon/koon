<?php
$page_key = 'stats';
$page_title = 'الإحصائيات ونشاط المنسقين';
require_once __DIR__ . '/../config.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();

// ← جلب بيانات المستخدم الحالي وتحديد الصلاحية (admin فقط)
$currentUserId = $_SESSION['user_id'] ?? 0;
$currentUser = $db->prepare('SELECT * FROM users WHERE id = ?');
$currentUser->execute([$currentUserId]);
$currentUser = $currentUser->fetch(PDO::FETCH_ASSOC) ?: [];
$isAdmin = in_array($currentUser['role'] ?? '', ['admin', 'super_admin'], true)
    || (int) ($currentUser['id'] ?? 0) === 1
    || ($currentUser['username'] ?? '') === 'HUSSIEN';

$db->exec('CREATE TABLE IF NOT EXISTS dashboard_metrics (metric_key TEXT PRIMARY KEY, metric_value INTEGER NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
$metricRows = $db->query('SELECT metric_key, metric_value FROM dashboard_metrics')->fetchAll(PDO::FETCH_KEY_PAIR);
$officialMetrics = [
    'total_visits' => max((int) ($metricRows['total_visits'] ?? 0), (int) $db->query("SELECT COALESCE(SUM(views_count), 0) FROM page_views")->fetchColumn()),
    'material_opens' => max((int) ($metricRows['material_opens'] ?? 0), (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'material_view'")->fetchColumn()),
    'quiz_completions' => max((int) ($metricRows['quiz_completions'] ?? 0), (int) $db->query("SELECT COUNT(*) FROM analytics_events WHERE event_type = 'quiz_completed'")->fetchColumn()),
    'suggestions' => max((int) ($metricRows['suggestions'] ?? 0), (int) $db->query("SELECT COUNT(*) FROM feedback_reviews WHERE feedback_type IN ('suggestion', 'collaboration')")->fetchColumn()),
    'pending_reports' => max((int) ($metricRows['pending_reports'] ?? 0), (int) $db->query("SELECT COUNT(*) FROM question_reports WHERE status IN ('pending', 'new', '') OR status IS NULL")->fetchColumn()),
    'service_requests' => max((int) ($metricRows['service_requests'] ?? 0), (int) $db->query("SELECT COUNT(*) FROM service_requests WHERE status IN ('new', 'in_progress', 'pending')")->fetchColumn()),
];

// جلب صفحات الموقع وإحصائيات الزيارات
$pageViewsStmt = $db->query('SELECT * FROM page_views ORDER BY views_count DESC');
$pages = $pageViewsStmt->fetchAll(PDO::FETCH_ASSOC);

$totalViews = array_sum(array_column($pages, 'views_count'));
$totalUnique = array_sum(array_column($pages, 'unique_visitors'));

// جلب قائمة المنسقين والمشرفين وحالة نشاطهم
$usersStmt = $db->query('SELECT * FROM users ORDER BY last_active_at DESC');
$coordinators = $usersStmt->fetchAll(PDO::FETCH_ASSOC);

// حساب المنسقين النشطين خلال آخر 15 دقيقة
$activeCount = 0;
$now = time();
foreach ($coordinators as $c) {
    if (!empty($c['last_active_at'])) {
        $lastTime = strtotime($c['last_active_at']);
        if (($now - $lastTime) <= 900) { // 15 دقيقة
            $activeCount++;
        }
    }
}

// جلب آخر 15 عملية مسجلة في سجل النشاط
$logsStmt = $db->query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 15');
$recentLogs = $logsStmt->fetchAll(PDO::FETCH_ASSOC);

$incomingRequests = $db->query("SELECT request_type, request_title, request_message, status, created_at, target_url FROM (
    SELECT 'رأي وتقييم' AS request_type, COALESCE(title, 'تقييم جديد') AS request_title, student_name AS request_message, status, created_at, 'reviews.php' AS target_url FROM feedback_reviews
    UNION ALL
    SELECT 'مساهمة' AS request_type, subject_name AS request_title, student_name AS request_message, status, created_at, 'contributions.php' AS target_url FROM contributions
    UNION ALL
    SELECT 'طلب خدمة' AS request_type, service_type AS request_title, student_name AS request_message, status, created_at, 'service_requests.php' AS target_url FROM service_requests
    UNION ALL
    SELECT 'تبادل مواد' AS request_type, material_name AS request_title, donor_name AS request_message, status, created_at, 'donations.php' AS target_url FROM material_exchanges
    UNION ALL
    SELECT 'طلب انضمام' AS request_type, 'طلب انضمام للفريق' AS request_title, applicant_name AS request_message, status, created_at, 'membership_requests.php' AS target_url FROM membership_requests
    UNION ALL
    SELECT 'بلاغ سؤال' AS request_type, question_title AS request_title, reporter_name AS request_message, status, created_at, 'reports.php' AS target_url FROM question_reports
) ORDER BY created_at DESC LIMIT 100")->fetchAll(PDO::FETCH_ASSOC);

$chartRanges = [
    'week' => ['label' => 'آخر أسبوع', 'days' => 7, 'format' => 'm/d'],
    'month' => ['label' => 'آخر شهر', 'days' => 30, 'format' => 'm/d'],
    'five_months' => ['label' => 'آخر 5 أشهر', 'days' => 150, 'format' => 'm/Y'],
    'year' => ['label' => 'آخر سنة', 'days' => 365, 'format' => 'm/Y'],
];
$chartData = [];
$eventRows = $db->query("SELECT substr(occurred_at, 1, 10) AS day, event_type, COUNT(*) AS total FROM analytics_events WHERE occurred_at >= date('now', '-365 days') GROUP BY day, event_type")->fetchAll(PDO::FETCH_ASSOC);
foreach ($chartRanges as $rangeKey => $range) {
    $monthly = in_array($rangeKey, ['five_months', 'year'], true);
    $buckets = [];
    for ($offset = $range['days'] - 1; $offset >= 0; $offset--) {
        $date = date('Y-m-d', strtotime("-$offset days"));
        $bucket = $monthly ? date('Y-m', strtotime($date)) : $date;
        $buckets[$bucket] ??= ['visits' => 0, 'views' => 0];
    }
    foreach ($eventRows as $event) {
        $eventDate = $event['day'];
        if ($eventDate < date('Y-m-d', strtotime('-' . ($range['days'] - 1) . ' days')))
            continue;
        $bucket = $monthly ? substr($eventDate, 0, 7) : $eventDate;
        if (!isset($buckets[$bucket]))
            continue;
        $buckets[$bucket]['views'] += (int) $event['total'];
        if ($event['event_type'] === 'visit')
            $buckets[$bucket]['visits'] += (int) $event['total'];
    }
    $chartData[$rangeKey] = [
        'labels' => array_map(static fn($date) => date($range['format'], strtotime($date . ($monthly ? '-01' : ''))), array_keys($buckets)),
        'visits' => array_column($buckets, 'visits'),
        'views' => array_column($buckets, 'views'),
    ];
}
$chartLabels = $chartData['week']['labels'];
$chartVisits = $chartData['week']['visits'];
$chartViews = $chartData['week']['views'];
$requestTypeCounts = [];
foreach ($incomingRequests as $request) {
    $requestTypeCounts[$request['request_type']] = ($requestTypeCounts[$request['request_type']] ?? 0) + 1;
}
$deviceCounts = ['الهاتف الذكي' => 0, 'الكمبيوتر' => 0, 'الجهاز اللوحي' => 0];
foreach ($db->query('SELECT user_agent FROM analytics_events')->fetchAll(PDO::FETCH_COLUMN) as $userAgent) {
    if (preg_match('/tablet|ipad|android(?!.*mobile)/i', $userAgent))
        $deviceCounts['الجهاز اللوحي']++;
    elseif (preg_match('/mobile|iphone|ipod|android/i', $userAgent))
        $deviceCounts['الهاتف الذكي']++;
    else
        $deviceCounts['الكمبيوتر']++;
}

$systemRoleLabels = [
    'observer' => 'زائر / مراقب (قراءة فقط)',
    'coordinator' => 'منسق نظام',
    'general_coordinator' => 'منسق عام',
    'team_lead' => 'مسؤول فريق',
    'campaign_coordinator' => 'منسق حملة',
    'field_officer' => 'مسؤول ميداني',
    'assistant_field_officer' => 'مساعد مسؤول ميداني',
    'admin' => 'مشرف عام',
];
$systemSections = [
    'tasks' => ['label' => 'المهام والتكليفات', 'icon' => ''],
    'rewards' => ['label' => 'النقاط والمكافآت', 'icon' => ''],
    'donations' => ['label' => 'إدارة تبادل المواد', 'icon' => ''],
    'materials' => ['label' => 'المواد الدراسية والملفات', 'icon' => ''],
    'tests' => ['label' => 'الاختبارات والاستبيانات', 'icon' => ''],
    'services' => ['label' => 'طلبات الخدمات الطلابية', 'icon' => ''],
    'ads' => ['label' => 'الإعلانات والبانرات', 'icon' => ''],
    'membership' => ['label' => 'طلبات الانضمام والتطوع', 'icon' => ''],
    'stats' => ['label' => 'الإحصائيات والتقارير', 'icon' => ''],
    'coordinators' => ['label' => 'المنسقون وحسابات النظام', 'icon' => ''],
    'general' => ['label' => 'الإدارة العامة وإعدادات الموقع', 'icon' => ''],
    'reviews' => ['label' => 'الآراء والتقييمات', 'icon' => ''],
    'reports' => ['label' => 'البلاغات والشكاوى', 'icon' => ''],
    'contributions' => ['label' => 'المساهمات الجامعية', 'icon' => ''],
    'activity' => ['label' => 'سجل النشاط والأمان', 'icon' => ''],
    'faq' => ['label' => 'نشمي والأسئلة الشائعة', 'icon' => ''],
];
$statsAccessRows = [];
foreach ($coordinators as $coordRow) {
    $userPerms = json_decode((string) ($coordRow['permissions'] ?? '[]'), true) ?: [];
    $statsAccessRows[] = [
        'id' => (int) ($coordRow['id'] ?? 0),
        'username' => (string) ($coordRow['username'] ?? ''),
        'email' => (string) ($coordRow['email'] ?? ''),
        'role' => (string) ($coordRow['role'] ?? 'coordinator'),
        'permissions' => $userPerms,
        'totp_enabled' => !empty($coordRow['totp_enabled']),
        'last_active_at' => (string) ($coordRow['last_active_at'] ?? ''),
    ];
}

$requestStyles = [
    'رأي وتقييم' => ['color' => '#7c3aed', 'background' => '#f5f3ff', 'icon' => '★'],
    'مساهمة' => ['color' => '#0891b2', 'background' => '#ecfeff', 'icon' => '＋'],
    'طلب خدمة' => ['color' => '#ea580c', 'background' => '#fff7ed', 'icon' => '⚙'],
    'تبادل مواد' => ['color' => '#16a34a', 'background' => '#f0fdf4', 'icon' => '↔'],
    'طلب انضمام' => ['color' => '#dc2626', 'background' => '#fef2f2', 'icon' => '♣'],
    'بلاغ سؤال' => ['color' => '#ca8a04', 'background' => '#fefce8', 'icon' => '⚑'],
];

// استعلامات مركز الإجراءات والمهام اليومية العاجلة
$todayDateStr = date('Y-m-d');
$arabicDays = ['Sunday' => 'الأحد', 'Monday' => 'الاثنين', 'Tuesday' => 'الثلاثاء', 'Wednesday' => 'الأربعاء', 'Thursday' => 'الخميس', 'Friday' => 'الجمعة', 'Saturday' => 'السبت'];
$currentDayName = $arabicDays[date('l')] ?? date('l');

// 1. تبرعات وكتب بانتظار الفرز والتوزيع
$dacUnassigned = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE archive_key IS NULL AND (assigned_coordinator = 'shared' OR assigned_coordinator = 'admin' OR assigned_coordinator = '' OR assigned_coordinator IS NULL)")->fetchColumn();

// 2. مواعيد تسليم مجدولة اليوم في الحرم الجامعي
$dacTodayPickups = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE archive_key IS NULL AND status = 'reserved' AND pickup_date = '$todayDateStr'")->fetchColumn();

// 3. بلاغات وشكاوى معلقة تحتاج مراجعة
$dacPendingReports = 0;
try {
    $dacPendingReports = (int) $db->query("SELECT COUNT(*) FROM question_reports WHERE status = 'pending' OR status IS NULL OR status = ''")->fetchColumn();
} catch (Exception $e) {
}

// 4. مهام وتكليفات قيد الإنجاز
$dacActiveTasks = 0;
try {
    $dacActiveTasks = (int) $db->query("SELECT COUNT(*) FROM coordinator_tasks WHERE status != 'completed'")->fetchColumn();
} catch (Exception $e) {
}


// جلب إحصائيات بنك الأسئلة الشاملة ومؤشرات الصعوبة لكافة الاختبارات
$db->exec("
    CREATE TABLE IF NOT EXISTS quiz_subjects (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS quiz_parts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
    CREATE TABLE IF NOT EXISTS quiz_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, diff TEXT DEFAULT 'med', points REAL DEFAULT 1);
");

$quizTotalQuestions = (int) $db->query('SELECT count(*) FROM quiz_questions')->fetchColumn();
$quizTotalParts = (int) $db->query('SELECT count(*) FROM quiz_parts')->fetchColumn();
$quizTotalSubjects = (int) $db->query('SELECT count(*) FROM quiz_subjects')->fetchColumn();

$quizEasyCount = (int) $db->query("SELECT count(*) FROM quiz_questions WHERE diff = 'easy'")->fetchColumn();
$quizMedCount = (int) $db->query("SELECT count(*) FROM quiz_questions WHERE diff IN ('med', 'medium')")->fetchColumn();
$quizHardCount = (int) $db->query("SELECT count(*) FROM quiz_questions WHERE diff = 'hard'")->fetchColumn();

$quizEasyMarks = (float) $db->query("SELECT COALESCE(SUM(points),0) FROM quiz_questions WHERE diff = 'easy'")->fetchColumn();
$quizMedMarks = (float) $db->query("SELECT COALESCE(SUM(points),0) FROM quiz_questions WHERE diff IN ('med', 'medium')")->fetchColumn();
$quizHardMarks = (float) $db->query("SELECT COALESCE(SUM(points),0) FROM quiz_questions WHERE diff = 'hard'")->fetchColumn();
$quizTotalMarks = (float) $db->query('SELECT COALESCE(SUM(points),0) FROM quiz_questions')->fetchColumn();

$quizEasyPct = $quizTotalQuestions > 0 ? round(($quizEasyCount / $quizTotalQuestions) * 100) : 0;
$quizMedPct = $quizTotalQuestions > 0 ? round(($quizMedCount / $quizTotalQuestions) * 100) : 0;
$quizHardPct = max(0, 100 - $quizEasyPct - $quizMedPct);

$topQuizSubjects = $db->query("
    SELECT s.name, count(q.id) as q_count 
    FROM quiz_subjects s 
    LEFT JOIN quiz_questions q ON q.subject_slug = s.id 
    GROUP BY s.id 
    HAVING q_count > 0
    ORDER BY q_count DESC 
    LIMIT 6
")->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';

?>

<!-- بطاقات الإحصائيات السريعة -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي الزيارات</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($officialMetrics['total_visits']) ?></div>
        <div class="stats-footer">
            <span class="trend-up">بيانات رسمية</span>
            <span>من لوحة المنصة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">فتح المواد الدراسية</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($officialMetrics['material_opens']) ?></div>
        <div class="stats-footer">
            <span class="trend-up">بيانات رسمية</span>
            <span>من لوحة المنصة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">اختبارات مكتملة</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <polyline points="16 11 18 13 22 9" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($officialMetrics['quiz_completions']) ?></div>
        <div class="stats-footer">
            <span class="badge-online-pulse">بيانات رسمية من بنك الأسئلة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">رسائل واقتراحات</span>
            <div class="stats-icon-box icon-gold">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="20" height="14" x="2" y="5" rx="2" />
                    <line x1="2" x2="22" y1="10" x2="10" />
                    <circle cx="12" cy="15" r="2" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($officialMetrics['suggestions']) ?></div>
        <div class="stats-footer">
            <span class="trend-up">بيانات رسمية</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">بلاغات معلقة</span>
            <div class="stats-icon-box icon-gold">⚑</div>
        </div>
        <div class="stats-number"><?= number_format($officialMetrics['pending_reports']) ?></div>
        <div class="stats-footer"><span class="trend-up">تحتاج مراجعة</span></div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">طلبات الخدمات والنماذج</span>
            <div class="stats-icon-box icon-blue">⚙</div>
        </div>
        <div class="stats-number"><?= number_format($officialMetrics['service_requests']) ?></div>
        <div class="stats-footer"><span class="trend-up">مستلمة من الموقع الرسمي</span></div>
    </div>
</div>

<div class="global-analytics-panel">
    <div class="ga-header">
        <div class="ga-title-wrap">
            <div class="ga-icon-box">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 3v18h18" />
                    <path d="m19 9-5 5-4-4-3 3" />
                </svg>
            </div>
            <div>
                <h2 class="ga-title">تحليلات بنك الأسئلة الشاملة — حركة وتدفق مستويات الصعوبة</h2>
                <p class="ga-sub">إحصائية شاملة ومؤشرات الصعوبة وتوزيع الأسئلة عبر كافة المواد والاختبارات</p>
            </div>
        </div>
        <div class="ga-live-badge">تحديث مباشر لقاعدة البيانات</div>
    </div>

    <div class="ga-pills-row">
        <div class="ga-pill purple">
            <div class="p-val"><?= number_format($quizTotalQuestions) ?></div>
            <div class="p-lbl">إجمالي الأسئلة</div>
        </div>
        <div class="ga-pill blue">
            <div class="p-val"><?= number_format($quizTotalParts) ?> اختبار</div>
            <div class="p-lbl"><?= number_format($quizTotalSubjects) ?> مادة دراسية</div>
        </div>
        <div class="ga-pill green">
            <div class="p-val"><?= number_format($quizEasyCount) ?> <span
                    style="font-size:12px;">(<?= $quizEasyPct ?>%)</span></div>
            <div class="p-lbl">🟢 أسئلة سهلة</div>
        </div>
        <div class="ga-pill amber">
            <div class="p-val"><?= number_format($quizMedCount) ?> <span
                    style="font-size:12px;">(<?= $quizMedPct ?>%)</span></div>
            <div class="p-lbl">🟡 أسئلة متوسطة</div>
        </div>
        <div class="ga-pill red">
            <div class="p-val"><?= number_format($quizHardCount) ?> <span
                    style="font-size:12px;">(<?= $quizHardPct ?>%)</span></div>
            <div class="p-lbl">🔴 أسئلة صعبة</div>
        </div>
        <div class="ga-pill gold">
            <div class="p-val"><?= number_format($quizTotalMarks, 1) ?></div>
            <div class="p-lbl">مجموع العلامات</div>
        </div>
    </div>

    <div class="ga-chart-box">
        <div class="ga-chart-title">
            <span>📈 منحنى تدفق وتوزيع الصعوبة لكافة الأسئلة (سهل ⟵ متوسط ⟵ صعب)</span>
            <span style="font-size:11px;color:#8a8f9d;">مبني على <?= number_format($quizTotalQuestions) ?> سؤال</span>
        </div>
        <div class="ga-chart-container">
            <canvas id="statsQuizDiffChart"></canvas>
        </div>
    </div>
</div>

<script>
    (() => {
        const canvas = document.getElementById('statsQuizDiffChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const easyMarks = <?= (float) $quizEasyMarks ?>;
        const medMarks = <?= (float) $quizMedMarks ?>;
        const hardMarks = <?= (float) $quizHardMarks ?>;

        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, 'rgba(2, 132, 199, 0.38)');
        gradient.addColorStop(1, 'rgba(2, 132, 199, 0.02)');

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['أسئلة سهلة (Easy)', 'أسئلة متوسطة (Medium)', 'أسئلة صعبة (Hard)'],
                datasets: [
                    {
                        label: 'إجمالي عدد الأسئلة',
                        data: [<?= (int) $quizEasyCount ?>, <?= (int) $quizMedCount ?>, <?= (int) $quizHardCount ?>],
                        borderColor: '#0284c7',
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.45,
                        borderWidth: 3,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#0284c7'
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
                        pointBackgroundColor: '#8b5cf6'
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
                            font: { family: 'Tahoma, Arial, sans-serif', size: 12, weight: '700' },
                            color: '#4b5563'
                        }
                    },
                    tooltip: {
                        rtl: true,
                        titleFont: { family: 'Tahoma, Arial, sans-serif', size: 13 },
                        bodyFont: { family: 'Tahoma, Arial, sans-serif', size: 12 }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Tahoma, Arial, sans-serif', size: 12, weight: '700' }, color: '#5B6152' }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(222, 210, 174, 0.35)', strokeDashArray: [3, 3] },
                        ticks: { font: { family: 'Tahoma, Arial, sans-serif', size: 11 }, color: '#9B9A82' }
                    }
                }
            }
        });
    })();
</script>

<div class="stats-access-panel">
    <div class="stats-access-header">
        <div>
            <h3>جدول حسابات الدخول المعتمدة والصلاحيات الممنوحة</h3>
        </div>
        <span class="stats-access-count"><?= count($statsAccessRows) ?> حساب</span>
    </div>

    <div class="table-wrapper">
        <table class="stats-access-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>المنسق</th>
                    <th>اسم المستخدم (Login)</th>
                    <th>البريد الإلكتروني</th>
                    <th>الدور والصلاحيات</th>
                    <th>الصفحات المسموحة</th>
                    <th>2FA</th>
                    <th>آخر دخول</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($statsAccessRows)): ?>
                    <tr>
                        <td colspan="8" class="stats-empty-row">لا يوجد حسابات دخول للنظام حالياً</td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($statsAccessRows as $index => $row): ?>
                        <?php
                        $isAdminRole = ($row['role'] ?? '') === 'admin';
                        $roleLabel = $systemRoleLabels[$row['role']] ?? 'منسق نظام';
                        $permissions = $row['permissions'];
                        ?>
                        <tr>
                            <td><?= $index + 1 ?></td>
                            <td>
                                <div class="stats-user-name"><?= htmlspecialchars($row['username'] ?: '—') ?></div>
                                <div class="stats-user-meta">منسق / مدير</div>
                            </td>
                            <td>
                                <span class="stats-login-tag">@<?= htmlspecialchars($row['username'] ?: '—') ?></span>
                            </td>
                            <td class="stats-email"><?= htmlspecialchars($row['email'] ?: '—') ?></td>
                            <td>
                                <span
                                    class="stats-role-badge <?= $isAdminRole ? 'badge-warning' : 'badge-success' ?>"><?= htmlspecialchars($roleLabel) ?></span>
                            </td>
                            <td>
                                <?php if ($isAdminRole): ?>
                                    <span class="stats-full-access">وصول كامل</span>
                                <?php elseif (empty($permissions)): ?>
                                    <span class="stats-empty-perms">لا توجد صفحات مخصصة</span>
                                <?php else: ?>
                                    <div class="stats-perms-wrap">
                                        <span class="stats-perm-count"><?= count($permissions) ?> قسم مسموح</span>
                                        <?php foreach (array_slice($permissions, 0, 2) as $perm): ?>
                                            <?php if (isset($systemSections[$perm])): ?>
                                                <span
                                                    class="stats-perm-chip"><?= htmlspecialchars($systemSections[$perm]['label']) ?></span>
                                            <?php endif; ?>
                                        <?php endforeach; ?>
                                    </div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if ($row['totp_enabled']): ?>
                                    <span class="stats-2fa-on">مفعّل</span>
                                <?php else: ?>
                                    <span class="stats-2fa-off">غير مفعّل</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div class="stats-last-login">
                                    <?= !empty($row['last_active_at']) ? date('Y-m-d H:i', strtotime($row['last_active_at'])) : 'لم يدخل بعد' ?>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>


<?php
$chartMax = max(max($chartVisits ?: [0]), max($chartViews ?: [0]), 1);
$chartSvgWidth = 760;
$chartSvgHeight = 220;
$chartPadding = 30;
$chartInnerWidth = $chartSvgWidth - ($chartPadding * 2);
$chartInnerHeight = $chartSvgHeight - ($chartPadding * 2);
$chartXStep = count($chartLabels) > 1 ? $chartInnerWidth / (count($chartLabels) - 1) : 0;

$buildLine = function (array $values) use ($chartSvgWidth, $chartSvgHeight, $chartPadding, $chartInnerWidth, $chartInnerHeight, $chartMax, $chartXStep): string {
    $points = [];
    foreach ($values as $index => $value) {
        $x = $chartPadding + ($chartXStep * $index);
        $y = $chartSvgHeight - $chartPadding - (($value / $chartMax) * $chartInnerHeight);
        $points[] = "$x,$y";
    }
    return implode(' ', $points);
};

$visitsPoints = $buildLine($chartVisits);
$viewsPoints = $buildLine($chartViews);
?>

<div class="stats-chart-panel">
    <div class="stats-chart-header">
        <div class="stats-chart-range" role="group" aria-label="الفترة الزمنية">
            <?php foreach ($chartRanges as $rangeKey => $range): ?>
                <button type="button" class="stats-range-button<?= $rangeKey === 'year' ? ' is-active' : '' ?>"
                    data-chart-range="<?= $rangeKey ?>"><?= $range['label'] ?></button>
            <?php endforeach; ?>
        </div>

        <div class="stats-chart-title-wrap">
            <div class="stats-chart-title" id="stats-chart-title">إحصائيات الزيارات خلال آخر سنة</div>
            <div class="stats-chart-subtitle">زيارات ومشاهدات الموقع الرسمي من سجل الأحداث المباشر</div>
        </div>

        <div class="stats-chart-legend">
            <span><i class="legend-dot dot-visits"></i> الزيارات</span>
            <span><i class="legend-dot dot-views"></i> المشاهدات</span>
        </div>
    </div>

    <svg class="stats-svg-chart" viewBox="0 0 760 220" preserveAspectRatio="none" role="img"
        aria-label="مخطط زيارات الموقع خلال آخر سنة" id="stats-visits-chart">
        <g>
            <defs>
                <linearGradient id="visits-area-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stop-color="#4f46e5" stop-opacity="0.18" />
                    <stop offset="1" stop-color="#4f46e5" stop-opacity="0.02" />
                </linearGradient>
            </defs>

            <?php for ($i = 0; $i <= 4; $i++):
                $y = $chartPadding + (($chartInnerHeight / 4) * $i);
                $value = round($chartMax - (($chartMax / 4) * $i));
                ?>
                <line x1="30" y1="<?= $y ?>" x2="730" y2="<?= $y ?>" class="grid-line chart-grid-line" />
                <text x="8" y="<?= $y + 4 ?>" class="chart-axis-label chart-y-label"><?= $value ?></text>
            <?php endfor; ?>

            <?php foreach ($chartLabels as $index => $label):
                $x = $chartPadding + ($chartXStep * $index);
                ?>
                <text x="<?= $x ?>" y="210" text-anchor="middle"
                    class="chart-axis-label chart-axis-bottom chart-x-label"><?= $label ?></text>
            <?php endforeach; ?>

            <polyline class="chart-line chart-line-visits"
                points="<?= htmlspecialchars($visitsPoints, ENT_QUOTES, 'UTF-8') ?>" />
            <polyline class="chart-line chart-line-views"
                points="<?= htmlspecialchars($viewsPoints, ENT_QUOTES, 'UTF-8') ?>" />
            <polygon class="chart-area-visits"
                points="<?= htmlspecialchars($visitsPoints . ' 700,190 30,190', ENT_QUOTES, 'UTF-8') ?>" />
            <g class="chart-points-visits"></g>
            <g class="chart-points-views"></g>
        </g>
    </svg>
    <div class="chart-point-tooltip" id="visits-point-tooltip" role="status" aria-live="polite"></div>
</div>

<script>
    (() => {
        const chartData = <?= json_encode($chartData, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
        const chart = document.getElementById('stats-visits-chart');
        const title = document.getElementById('stats-chart-title');
        const tooltip = document.getElementById('visits-point-tooltip');
        const buttons = document.querySelectorAll('[data-chart-range]');
        const width = 760;
        const height = 220;
        const padding = 30;
        const innerWidth = width - (padding * 2);
        const innerHeight = height - (padding * 2);

        function renderChart(rangeKey) {
            const data = chartData[rangeKey];
            const values = [...data.visits, ...data.views];
            const max = Math.max(...values, 1);
            const step = data.labels.length > 1 ? innerWidth / (data.labels.length - 1) : 0;
            const linePoints = (series) => series.map((value, index) => {
                const x = padding + (step * index);
                const y = height - padding - ((value / max) * innerHeight);
                return `${x},${y}`;
            }).join(' ');

            chart.querySelectorAll('.chart-y-label').forEach((label, index) => {
                const value = Math.round(max - ((max / 4) * index));
                label.textContent = value.toLocaleString('ar-EG');
            });
            chart.querySelectorAll('.chart-grid-line').forEach((line, index) => {
                const y = padding + ((innerHeight / 4) * index);
                line.setAttribute('y1', y);
                line.setAttribute('y2', y);
            });
            chart.querySelectorAll('.chart-x-label').forEach((label) => label.remove());
            const labelStride = data.labels.length > 14 ? Math.ceil(data.labels.length / 10) : 1;
            data.labels.forEach((label, index) => {
                const axisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                axisLabel.setAttribute('x', padding + (step * index));
                axisLabel.setAttribute('y', '210');
                axisLabel.setAttribute('text-anchor', 'middle');
                axisLabel.setAttribute('class', 'chart-axis-label chart-axis-bottom chart-x-label');
                axisLabel.textContent = index % labelStride === 0 || index === data.labels.length - 1 ? label : '';
                chart.querySelector('g').appendChild(axisLabel);
            });

            const visitPath = linePoints(data.visits);
            const viewPath = linePoints(data.views);
            chart.querySelector('.chart-line-visits').setAttribute('points', visitPath);
            chart.querySelector('.chart-line-views').setAttribute('points', viewPath);
            chart.querySelector('.chart-area-visits').setAttribute('points', `${visitPath} ${width - padding},${height - padding} ${padding},${height - padding}`);
            chart.querySelector('.chart-points-visits').innerHTML = data.visits.map((value, index) => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', padding + (step * index));
                circle.setAttribute('cy', height - padding - ((value / max) * innerHeight));
                circle.setAttribute('r', data.labels.length > 14 ? '2.8' : '4.8');
                circle.setAttribute('data-index', index);
                circle.setAttribute('class', 'chart-point chart-point-visits');
                return circle.outerHTML;
            }).join('');
            chart.querySelector('.chart-points-views').innerHTML = data.views.map((value, index) => {
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', padding + (step * index));
                circle.setAttribute('cy', height - padding - ((value / max) * innerHeight));
                circle.setAttribute('r', data.labels.length > 14 ? '2.8' : '4.8');
                circle.setAttribute('data-index', index);
                circle.setAttribute('class', 'chart-point chart-point-views');
                return circle.outerHTML;
            }).join('');
            chart.querySelectorAll('.chart-point').forEach((point) => {
                const showVisitTooltip = () => {
                    const index = Number(point.dataset.index);
                    tooltip.textContent = `${data.labels[index]}: الزيارات ${Number(data.visits[index]).toLocaleString('ar-EG')}، المشاهدات ${Number(data.views[index]).toLocaleString('ar-EG')}`;
                    tooltip.classList.add('is-visible');
                };
                point.onclick = showVisitTooltip;
                point.onmouseenter = showVisitTooltip;
                point.onmouseleave = () => tooltip.classList.remove('is-visible');
            });

            const rangeLabel = buttons.length ? Array.from(buttons).find((button) => button.dataset.chartRange === rangeKey)?.textContent || 'آخر سنة' : 'آخر سنة';
            title.textContent = `إحصائيات الزيارات خلال ${rangeLabel}`;
            chart.setAttribute('aria-label', title.textContent);
            buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.chartRange === rangeKey));
        }

        buttons.forEach((button) => button.addEventListener('click', () => renderChart(button.dataset.chartRange)));
        renderChart('year');
    })();
</script>

<style>
    .global-analytics-panel {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        padding: 20px 24px 18px;
        margin: 24px 10px 0;
        box-shadow: 0 10px 26px rgba(15, 23, 42, 0.04);
    }

    .ga-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 18px;
        flex-wrap: wrap;
        gap: 12px;
        padding-bottom: 14px;
        border-bottom: 1px dashed #dfe7f1;
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
        background: #edf3ff;
        color: #0f172a;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
    }

    .ga-title {
        margin: 0 0 4px;
        font-size: 21px;
        font-weight: 800;
        line-height: 1.4;
        color: #111827;
    }

    .ga-sub {
        margin: 0;
        font-size: 13px;
        color: #7a8393;
        font-weight: 500;
    }

    .ga-live-badge {
        font-size: 12px;
        font-weight: 700;
        color: #475569;
        background: #f5f5f5;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid #e5e7eb;
        white-space: nowrap;
    }

    .ga-pills-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 12px;
        margin-bottom: 18px;
    }

    .ga-pill {
        background: #f8fafc;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        transition: transform .15s ease, box-shadow .15s ease;
    }

    .ga-pill:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
    }

    .ga-pill .p-val {
        font-size: 18px;
        font-weight: 800;
        color: #111827;
        display: flex;
        align-items: baseline;
        gap: 4px;
    }

    .ga-pill .p-lbl {
        font-size: 11px;
        font-weight: 700;
        color: #53617a;
    }

    .ga-pill.purple {
        border-inline-start: 3.5px solid #6366F1;
    }

    .ga-pill.blue {
        border-inline-start: 3.5px solid #2563eb;
    }

    .ga-pill.green {
        border-inline-start: 3.5px solid #16a34a;
    }

    .ga-pill.amber {
        border-inline-start: 3.5px solid #d97706;
    }

    .ga-pill.red {
        border-inline-start: 3.5px solid #dc2626;
    }

    .ga-pill.gold {
        border-inline-start: 3.5px solid #d97706;
    }

    .ga-chart-box {
        background: #f8fafc;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 16px 20px;
    }

    .ga-chart-title {
        font-size: 12.5px;
        font-weight: 700;
        color: #475569;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
    }

    .ga-chart-container {
        height: 240px;
    }

    .stats-access-panel {
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        padding: 18px 16px 10px;
        margin: 24px 10px 0;
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
    }

    .stats-access-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 0 4px 14px;
        border-bottom: 1px solid #e5e7eb;
    }

    .stats-access-header h3 {
        margin: 0;
        color: #0f172a;
        font-size: 20px;
        font-weight: 800;
    }

    .stats-access-count {
        background: #f8fafc;
        border: 1px solid #dbe3ef;
        border-radius: 999px;
        color: #475569;
        font-size: 12px;
        font-weight: 800;
        padding: 7px 12px;
    }

    .table-wrapper {
        overflow-x: auto;
    }

    .stats-access-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
        min-width: 980px;
    }

    .stats-access-table th,
    .stats-access-table td {
        border-bottom: 1px solid #edf2f7;
        padding: 12px 10px;
        text-align: right;
        vertical-align: middle;
    }

    .stats-access-table thead th {
        background: #f8fafc;
        color: #475569;
        font-size: 12px;
        font-weight: 800;
    }

    .stats-access-table tbody td {
        color: #0f172a;
        font-size: 13px;
    }

    .stats-user-name {
        font-weight: 800;
        color: #0f172a;
    }

    .stats-user-meta {
        font-size: 11px;
        color: #64748b;
        margin-top: 3px;
    }

    .stats-login-tag {
        display: inline-block;
        background: #e0f2fe;
        color: #0369a1;
        border-radius: 6px;
        padding: 4px 8px;
        font-weight: 800;
        font-size: 12px;
    }

    .stats-email {
        color: #475569;
        direction: ltr;
        text-align: right;
    }

    .stats-role-badge {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 800;
        border: 1px solid transparent;
    }

    .badge-success {
        background: #dcfce7;
        border-color: #bbf7d0;
        color: #166534;
    }

    .badge-warning {
        background: #fef3c7;
        border-color: #fde68a;
        color: #92400e;
    }

    .stats-full-access {
        display: inline-block;
        background: #fef3c7;
        color: #b45309;
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 11px;
        font-weight: 800;
    }

    .stats-empty-perms,
    .stats-2fa-off {
        color: #94a3b8;
        font-size: 11.5px;
    }

    .stats-perms-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        max-width: 260px;
    }

    .stats-perm-count {
        background: #f1f5f9;
        color: #0f172a;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 800;
        padding: 2px 8px;
    }

    .stats-perm-chip {
        display: inline-flex;
        align-items: center;
        background: #e0f2fe;
        color: #0369a1;
        border-radius: 4px;
        font-size: 10.5px;
        padding: 2px 6px;
        font-weight: 700;
    }

    .stats-2fa-on {
        display: inline-flex;
        align-items: center;
        background: #dcfce7;
        color: #15803d;
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 800;
    }

    .stats-last-login {
        font-size: 12px;
        color: #0f172a;
        font-weight: 700;
    }

    .stats-empty-row {
        text-align: center;
        color: #94a3b8;
        padding: 30px 10px;
    }

    .stats-chart-panel {
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid rgba(203, 213, 225, 0.9);
        border-radius: 18px;
        padding: 18px 18px 12px;
        margin: 24px 10px 0;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.03);
    }

    .stats-chart-header {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: 14px;
        margin-bottom: 10px;
    }

    .stats-chart-title-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    .stats-chart-title {
        font-weight: 800;
        font-size: 18px;
        color: #1f2937;
        line-height: 1.5;
    }

    .stats-chart-subtitle {
        color: #6b7280;
        font-size: 12px;
        margin-top: 2px;
    }

    .stats-chart-legend {
        display: flex;
        gap: 18px;
        justify-content: flex-end;
        flex-wrap: wrap;
        font-size: 12px;
        color: #374151;
    }

    .stats-chart-range {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: flex-start;
    }

    .stats-range-button {
        background: rgba(255, 255, 255, 0.7);
        border: 1px solid #dbe4ee;
        border-radius: 10px;
        padding: 7px 12px;
        color: #526174;
        font-size: 12px;
        cursor: pointer;
        transition: all .2s ease;
    }

    .stats-range-button:hover,
    .stats-range-button.is-active {
        background: rgba(99, 102, 241, 0.08);
        border-color: #8b5cf6;
        color: #5b4dd9;
    }

    .legend-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-left: 6px;
        vertical-align: middle;
    }

    .dot-visits {
        background: #3aa0d8;
    }

    .dot-views {
        background: #8b5cf6;
    }

    .stats-svg-chart {
        width: 100%;
        height: 220px;
        display: block;
    }

    .grid-line {
        stroke: rgba(148, 163, 184, 0.55);
        stroke-width: 1;
    }

    .chart-line {
        fill: none;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    .chart-line-visits {
        stroke: #3aa0d8;
    }

    .chart-line-views {
        stroke: #8b5cf6;
        stroke-dasharray: 8 8;
    }

    .chart-area-visits {
        fill: rgba(58, 160, 216, 0.12);
    }

    .chart-point {
        stroke: #ffffff;
        stroke-width: 1.8;
    }

    .chart-point-visits {
        fill: #3aa0d8;
    }

    .chart-point-views {
        fill: #8b5cf6;
    }

    .chart-axis-label {
        font-size: 10px;
        fill: #6b7280;
        font-family: Tahoma, Arial, sans-serif;
    }

    @media (max-width: 768px) {
        .stats-chart-header {
            grid-template-columns: 1fr;
        }

        .stats-chart-title-wrap {
            align-items: flex-start;
        }

        .stats-chart-legend {
            justify-content: flex-start;
        }
    }
</style>

<?php require __DIR__ . '/_footer.php'; ?>