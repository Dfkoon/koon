<?php
/**
 * admin/backups.php — مركز النسخ الاحتياطي ومراقبة التزامن مع Firebase
 */
$page_key = 'general';
$page_title = 'النسخ الاحتياطي ومراقبة التزامن السحابي';
require_once __DIR__ . '/../config.php';
if (!function_exists('liveSyncCollection')) {
    require_once __DIR__ . '/../sync_official_live.php';
}

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();
$userId = (int) ($_SESSION['user_id'] ?? 0);
$userStmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$userStmt->execute([$userId]);
$currentUserData = $userStmt->fetch(PDO::FETCH_ASSOC);

$isAdmin = in_array($currentUserData['role'] ?? '', ['admin', 'super_admin'], true)
    || $userId === 1
    || strtoupper((string) ($currentUserData['username'] ?? '')) === 'HUSSIEN';

if (!$isAdmin) {
    http_response_code(403);
    require __DIR__ . '/_header.php';
    echo '<div class="panel-box" style="padding:30px; text-align:center; color:#b91c1c;"><h3>عذراً، هذه الصفحة مخصصة للإدارة العليا والمشرفين فقط.</h3></div>';
    require __DIR__ . '/_footer.php';
    exit;
}

$backupDir = get_sqlite_backup_dir();
$flash = null;

// ── 1. معالجة التحميل المباشر للنسخة الحية (Download Live SQLite) ─────────────
if (isset($_GET['action']) && $_GET['action'] === 'download_live') {
    $dbPath = DB_PATH;
    if (!file_exists($dbPath)) {
        die('ملف قاعدة البيانات غير موجود.');
    }
    $filename = 'makanak_db_live_' . date('Y-m-d_His') . '.sqlite';
    header('Content-Type: application/x-sqlite3');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($dbPath));
    header('Pragma: no-cache');
    header('Expires: 0');
    readfile($dbPath);
    exit;
}

// ── 2. معالجة تحميل نسخة احتياطية سابقة من السيرفر ────────────────────────────
if (isset($_GET['action']) && $_GET['action'] === 'download_file') {
    $file = basename((string) ($_GET['file'] ?? ''));
    $target = $backupDir . '/' . $file;
    if ($file !== '' && file_exists($target)) {
        header('Content-Type: application/x-sqlite3');
        header('Content-Disposition: attachment; filename="' . $file . '"');
        header('Content-Length: ' . filesize($target));
        header('Pragma: no-cache');
        header('Expires: 0');
        readfile($target);
        exit;
    }
    $flash = ['type' => 'error', 'msg' => 'الملف المطلوب غير موجود.'];
}

// ── 3. معالجة عمليات POST (إنشاء نسخة، استعادة، حذف، مزامنة يدوية) ─────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'انتهت صلاحية الجلسة، يرجى إعادة المحاولة.'];
    } else {
        $action = $_POST['action'] ?? '';

        // إنشاء نسخة احتياطية جديدة
        if ($action === 'create_backup') {
            $note = trim((string) ($_POST['note'] ?? 'manual'));
            $res = create_sqlite_backup($note);
            if ($res['success']) {
                $flash = ['type' => 'success', 'msg' => 'تم إنشاء نسخة احتياطية بنجاح: ' . $res['filename']];
            } else {
                $flash = ['type' => 'error', 'msg' => 'فشل إنشاء النسخة: ' . ($res['message'] ?? '')];
            }
        }

        // حذف نسخة احتياطية
        elseif ($action === 'delete_backup') {
            $filename = basename((string) ($_POST['filename'] ?? ''));
            $target = $backupDir . '/' . $filename;
            if ($filename !== '' && file_exists($target)) {
                @unlink($target);
                log_activity("حذف نسخة احتياطية: {$filename}", 'settings');
                $flash = ['type' => 'success', 'msg' => "تم حذف النسخة الاحتياطية ({$filename}) بنجاح."];
            } else {
                $flash = ['type' => 'error', 'msg' => 'الملف غير موجود.'];
            }
        }

        // استعادة نسخة احتياطية سابقة
        elseif ($action === 'restore_backup') {
            $filename = basename((string) ($_POST['filename'] ?? ''));
            $password = (string) ($_POST['admin_password'] ?? '');
            $target = $backupDir . '/' . $filename;

            // التحقق من كلمة مرور المشرف الحالي للأمان الفائق
            if (!password_verify($password, $currentUserData['password_hash'] ?? '')) {
                $flash = ['type' => 'error', 'msg' => 'كلمة المرور غير صحيحة. تم إلغاء الاستعادة لحماية البيانات.'];
            } elseif (!file_exists($target)) {
                $flash = ['type' => 'error', 'msg' => 'ملف النسخة الاحتياطية غير موجود.'];
            } else {
                // حفظ نسخة أمان من قاعدة البيانات الحالية قبل الاستعادة
                create_sqlite_backup('before_restore_' . date('His'));
                $dbPath = DB_PATH;
                if (@copy($target, $dbPath)) {
                    log_activity("استعادة قاعدة البيانات من النسخة: {$filename}", 'security');
                    $flash = ['type' => 'success', 'msg' => "تم استعادة قاعدة البيانات بنجاح من النسخة ({$filename})!"];
                } else {
                    $flash = ['type' => 'error', 'msg' => 'تعذر استبدال ملف قاعدة البيانات الحالي، يرجى التحقق من صلاحيات المجلد.'];
                }
            }
        }

        // تشغيل مزامنة يدوية فورية مع Firebase
        elseif ($action === 'trigger_live_sync') {
            try {
                $startTime = microtime(true);
                sync_official_live($db);
                $duration = round((microtime(true) - $startTime), 2);
                log_activity("تنفيذ مزامنة يدوية مع Firebase (استغرقت {$duration} ثوانٍ)", 'settings');
                $flash = ['type' => 'success', 'msg' => "تمت المزامنة الحية مع خوادم Firebase بنجاح خلال ({$duration} ثانية)! ✅"];
            } catch (Throwable $syncErr) {
                $flash = ['type' => 'error', 'msg' => 'فشلت المزامنة: ' . $syncErr->getMessage()];
            }
        }

        // حفظ إعدادات النسخ التلقائي
        elseif ($action === 'save_backup_settings') {
            $autoEnabled = ($_POST['auto_backup_enabled'] ?? '0') === '1' ? '1' : '0';
            $maxKeep = max(3, min(50, (int) ($_POST['max_keep_backups'] ?? 10)));
            $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at)
                VALUES ('auto_backup_enabled', ?, 'backup', CURRENT_TIMESTAMP)
                ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP")
                ->execute([$autoEnabled]);
            $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at)
                VALUES ('max_keep_backups', ?, 'backup', CURRENT_TIMESTAMP)
                ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP")
                ->execute([(string) $maxKeep]);
            $flash = ['type' => 'success', 'msg' => 'تم حفظ إعدادات النسخ الاحتياطي التلقائي بنجاح.'];
        }
    }
}

// ── 4. فحص صحة اتصال Firebase (Live Ping Test) ──────────────────────────────
$firebasePing = [
    'online' => false,
    'latency_ms' => null,
    'http_code' => 0,
    'error' => null,
];
$pingUrl = LIVE_SYNC_BASE . 'system_configs/global_settings?key=' . urlencode(LIVE_SYNC_KEY);
$pStart = microtime(true);
if (function_exists('curl_init')) {
    $ch = curl_init($pingUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT_MS => 2000,
        CURLOPT_TIMEOUT_MS => 4000,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $pResp = curl_exec($ch);
    $curlErr = curl_error($ch);
    $firebasePing['http_code'] = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $firebasePing['latency_ms'] = (int) round((microtime(true) - $pStart) * 1000);
    $firebasePing['online'] = ($firebasePing['http_code'] >= 200 && $firebasePing['http_code'] < 400);
    if (!$firebasePing['online']) {
        $firebasePing['error'] = $curlErr ?: ('HTTP ' . $firebasePing['http_code']);
    }
} else {
    $ctx = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true]]);
    $pResp = @file_get_contents($pingUrl, false, $ctx);
    $firebasePing['latency_ms'] = (int) round((microtime(true) - $pStart) * 1000);
    $firebasePing['online'] = ($pResp !== false);
}

// ── 5. جلب قائمة النسخ وبيانات قاعدة البيانات ───────────────────────────────
$backups = get_sqlite_backup_list();
$liveDbSize = file_exists(DB_PATH) ? filesize(DB_PATH) : 0;
$liveDbSizeFormatted = round($liveDbSize / 1024 / 1024, 2) . ' MB';

// إعدادات النسخ التلقائي المحفوظة
$autoBackupEnabled = ($db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'auto_backup_enabled'")->fetchColumn() ?: '1') === '1';
$maxKeepBackups = (int) ($db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'max_keep_backups'")->fetchColumn() ?: 10);

require __DIR__ . '/_header.php';
?>

<div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:16px; margin-bottom:20px;">
    <div>
        <h2 style="font-family:'Cairo',sans-serif; font-size:22px; font-weight:900; margin:0 0 4px; color:#0f172a; display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#0284c7" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            النسخ الاحتياطي ومراقبة التزامن السحابي
        </h2>
        <p style="margin:0; font-size:13px; color:#64748b;">حماية وأرشفة بيانات المنصة (SQLite) ومراقبة الاتصال المباشر مع قواعد بيانات Firebase Firestore</p>
    </div>

    <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <a href="?action=download_live" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:800; padding:10px 18px; background:linear-gradient(135deg,#0284c7,#0369a1); color:#fff; border-radius:10px; text-decoration:none; box-shadow:0 4px 12px rgba(2,132,199,.25);">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            تحميل قاعدة البيانات الحالية (<?= $liveDbSizeFormatted ?>)
        </a>
    </div>
</div>

<?php if ($flash): ?>
    <div style="margin-bottom:20px; padding:14px 20px; border-radius:10px; font-weight:700; font-size:14px; background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>; color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>; border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<!-- شبكة مراقبة الاتصال وحالة النظام -->
<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:24px;">
    <!-- بطاقة حالة Firebase -->
    <div class="panel-box" style="padding:20px; border-right:4px solid <?= $firebasePing['online'] ? '#10b981' : '#ef4444' ?>;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
            <div>
                <span style="font-size:12px; font-weight:700; color:#64748b;">خوادم Firebase Live Sync</span>
                <h3 style="margin:4px 0 0; font-size:18px; font-weight:800; color:#0f172a;">
                    <?= $firebasePing['online'] ? 'متصل وجاهز ✅' : 'تعذر الاتصال ⚠️' ?>
                </h3>
            </div>
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:<?= $firebasePing['online'] ? '#10b981' : '#ef4444' ?>; box-shadow:0 0 8px <?= $firebasePing['online'] ? '#10b981' : '#ef4444' ?>;"></span>
        </div>
        <div style="font-size:13px; color:#475569; display:flex; flex-direction:column; gap:6px;">
            <div>زمن الاستجابة (Latency): <strong><?= $firebasePing['latency_ms'] ?? 0 ?> مللي ثانية</strong></div>
            <div>معرف المشروع: <code style="font-size:11px;">koon-609da</code></div>
            <div>كود الاستجابة HTTP: <strong><?= $firebasePing['http_code'] ?></strong></div>
        </div>
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
            <form method="POST" action="" style="margin:0;">
                <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                <input type="hidden" name="action" value="trigger_live_sync">
                <button type="submit" style="width:100%; padding:8px 12px; font-weight:800; font-size:12.5px; border-radius:8px; background:#f0fdf4; border:1px solid #bbf7d0; color:#166534; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    مزامنة فورية الآن
                </button>
            </form>
        </div>
    </div>

    <!-- بطاقة حالة قاعدة البيانات SQLite -->
    <div class="panel-box" style="padding:20px; border-right:4px solid #0284c7;">
        <span style="font-size:12px; font-weight:700; color:#64748b;">قاعدة البيانات الحالية (SQLite)</span>
        <h3 style="margin:4px 0 12px; font-size:18px; font-weight:800; color:#0f172a;">
            <?= $liveDbSizeFormatted ?> <span style="font-size:12px; font-weight:500; color:#64748b;">(الحجم الكلي)</span>
        </h3>
        <div style="font-size:13px; color:#475569; display:flex; flex-direction:column; gap:6px;">
            <div>النسخ المتوفرة بالسيرفر: <strong><?= count($backups) ?> نسخة</strong></div>
            <div>المسار: <code style="font-size:11px;"><?= htmlspecialchars(basename(DB_PATH)) ?></code></div>
            <div>تاريخ آخر تعديل: <strong><?= date('Y-m-d H:i:s', filemtime(DB_PATH)) ?></strong></div>
        </div>
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
            <button onclick="document.getElementById('modal-create-backup').style.display='flex'" style="width:100%; padding:8px 12px; font-weight:800; font-size:12.5px; border-radius:8px; background:#f0f9ff; border:1px solid #bae6fd; color:#0369a1; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                أخذ نسخة احتياطية بالسيرفر
            </button>
        </div>
    </div>

    <!-- بطاقة إعدادات الجدولة -->
    <div class="panel-box" style="padding:20px; border-right:4px solid #8b5cf6;">
        <span style="font-size:12px; font-weight:700; color:#64748b;">سياسة التدوير والأمان</span>
        <h3 style="margin:4px 0 12px; font-size:18px; font-weight:800; color:#0f172a;">
            النسخ التلقائي: <?= $autoBackupEnabled ? '<span style="color:#10b981;">مفعّل</span>' : '<span style="color:#64748b;">معطّل</span>' ?>
        </h3>
        <form method="POST" action="" style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="save_backup_settings">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <label>الحد الأقصى للنسخ:</label>
                <input type="number" name="max_keep_backups" value="<?= $maxKeepBackups ?>" min="3" max="50" style="width:65px; padding:4px 8px; border:1px solid #cbd5e1; border-radius:6px; text-align:center; font-weight:700;">
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <input type="checkbox" id="auto_en" name="auto_backup_enabled" value="1" <?= $autoBackupEnabled ? 'checked' : '' ?>>
                <label for="auto_en" style="cursor:pointer; font-size:12.5px;">تفعيل النسخ الدوري اليومي</label>
            </div>
            <button type="submit" style="margin-top:4px; padding:7px 12px; font-size:12px; font-weight:800; border-radius:8px; background:#ede9fe; color:#6d28d9; border:1px solid #ddd6fe; cursor:pointer;">
                حفظ السياسة
            </button>
        </form>
    </div>
</div>

<!-- جدول النسخ الاحتياطية المحفوظة في السيرفر -->
<div class="panel-box">
    <div class="panel-box-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px;">
        <h3 class="panel-box-title" style="margin:0; font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10M6 10h10"/></svg>
            النسخ الاحتياطية المتوفرة بالسيرفر (.backups)
        </h3>
        <span style="font-size:12.5px; color:#64748b; font-weight:600;">العدد الكلي: <?= count($backups) ?></span>
    </div>

    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th>اسم الملف</th>
                    <th>حجم النسخة</th>
                    <th>تاريخ ووقت الإنشاء</th>
                    <th style="text-align:center; width:220px;">الإجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (!$backups): ?>
                    <tr>
                        <td colspan="4" style="text-align:center; color:#64748b; padding:35px;">
                            لا توجد نسخ احتياطية مؤرشفة حالياً في مجلد السيرفر. يمكنك إنشاء أول نسخة الآن.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($backups as $b): ?>
                    <tr>
                        <td>
                            <strong style="font-family:monospace; color:#0f172a;"><?= htmlspecialchars($b['filename']) ?></strong>
                        </td>
                        <td>
                            <span style="font-weight:700; color:#0284c7;"><?= $b['size_formatted'] ?></span>
                        </td>
                        <td style="color:#64748b; font-size:13px; font-family:monospace;">
                            <?= $b['created_at'] ?>
                        </td>
                        <td style="text-align:center;">
                            <div style="display:inline-flex; gap:6px; align-items:center;">
                                <!-- تحميل النسخة -->
                                <a href="?action=download_file&file=<?= urlencode($b['filename']) ?>" title="تحميل الملف للجهاز" style="padding:5px 10px; font-size:12px; font-weight:700; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; text-decoration:none; color:#1e293b; display:inline-flex; align-items:center; gap:4px;">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                    تحميل
                                </a>

                                <!-- استعادة النسخة -->
                                <button onclick="promptRestore('<?= htmlspecialchars(addslashes($b['filename'])) ?>')" title="استعادة هذه النسخة كقاعدة بيانات حالية" style="padding:5px 10px; font-size:12px; font-weight:700; background:#fef3c7; border:1px solid #fde68a; border-radius:6px; color:#b45309; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                    استعادة
                                </button>

                                <!-- حذف النسخة -->
                                <form method="POST" action="" style="margin:0; display:inline;" onsubmit="return confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete_backup">
                                    <input type="hidden" name="filename" value="<?= htmlspecialchars($b['filename']) ?>">
                                    <button type="submit" title="حذف النسخة" style="padding:5px 8px; font-size:12px; font-weight:700; background:#fee2e2; border:1px solid #fecaca; border-radius:6px; color:#b91c1c; cursor:pointer;">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                    </button>
                                </form>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<!-- مودال إنشاء نسخة احتياطية جديدة -->
<div id="modal-create-backup" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,.6); z-index:9999; align-items:center; justify-content:center; padding:16px;">
    <div style="background:#fff; border-radius:16px; width:min(100%, 460px); padding:24px; box-shadow:0 20px 40px rgba(0,0,0,.2);">
        <h3 style="margin:0 0 10px; font-family:'Cairo',sans-serif; font-size:18px; font-weight:800; color:#0f172a;">إنشاء نسخة احتياطية لحظية بالسيرفر</h3>
        <p style="margin:0 0 18px; font-size:13px; color:#64748b;">سيتم أخذ لقطة كاملة متناسقة من قاعدة البيانات SQLite وحفظها في مجلد .backups</p>
        <form method="POST" action="">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create_backup">
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px;">ملاحظة أو سبب النسخ (اختياري):</label>
                <input type="text" name="note" placeholder="مثال: before_exam_import أو manual_archive" style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button type="button" onclick="document.getElementById('modal-create-backup').style.display='none'" style="padding:9px 16px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700; cursor:pointer;">إلغاء</button>
                <button type="submit" style="padding:9px 20px; border-radius:8px; border:none; background:#0284c7; color:#fff; font-weight:800; cursor:pointer;">إنشاء النسخة الآن</button>
            </div>
        </form>
    </div>
</div>

<!-- مودال تأكيد استعادة النسخة الاحتياطية -->
<div id="modal-restore-backup" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,.7); z-index:9999; align-items:center; justify-content:center; padding:16px;">
    <div style="background:#fff; border-radius:16px; width:min(100%, 480px); padding:24px; box-shadow:0 25px 50px rgba(0,0,0,.3); border-top:5px solid #eab308;">
        <h3 style="margin:0 0 10px; font-family:'Cairo',sans-serif; font-size:18px; font-weight:900; color:#854d0e;">⚠️ تأكيد استعادة قاعدة البيانات</h3>
        <p style="margin:0 0 14px; font-size:13px; color:#475569; line-height:1.6;">
            أنت على وشك استبدال قاعدة البيانات الحالية بالنسخة: <strong id="restore-target-filename" style="font-family:monospace; color:#0f172a;"></strong>.<br>
            سيتم أخذ نسخة أمان تلقائية لحظية قبل الاستبدال. للتأكيد، يرجى إدخال كلمة مرور حسابك المشرف:
        </p>
        <form method="POST" action="">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="restore_backup">
            <input type="hidden" name="filename" id="restore-input-filename" value="">
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px;">كلمة مرور المشرف:</label>
                <input type="password" name="admin_password" required placeholder="أدخل كلمة مرورك للتأكيد" style="width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <button type="button" onclick="document.getElementById('modal-restore-backup').style.display='none'" style="padding:9px 16px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:700; cursor:pointer;">إلغاء</button>
                <button type="submit" style="padding:9px 20px; border-radius:8px; border:none; background:#ca8a04; color:#fff; font-weight:800; cursor:pointer;">تأكيد الاستعادة</button>
            </div>
        </form>
    </div>
</div>

<script>
function promptRestore(filename) {
    document.getElementById('restore-target-filename').textContent = filename;
    document.getElementById('restore-input-filename').value = filename;
    document.getElementById('modal-restore-backup').style.display = 'flex';
}
</script>

<?php require __DIR__ . '/_footer.php'; ?>
