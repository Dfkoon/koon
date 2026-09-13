<?php
/**
 * admin/general_admin.php — إعدادات النظام الشاملة لمنصة مكانك
 */
$page_key = 'general';
$page_title = 'الإدارة العامة — إعدادات النظام';
require_once __DIR__ . '/../config.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();

const FIREBASE_PROJECT_ID = 'koon-609da';
const FIREBASE_API_KEY = 'AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA';

function firebaseRequest(string $method, string $path, ?array $payload = null): array
{
    $url = 'https://firestore.googleapis.com/v1/projects/' . FIREBASE_PROJECT_ID . '/databases/(default)/documents/' . ltrim($path, '/') . '?key=' . urlencode(FIREBASE_API_KEY);
    if ($method === 'PATCH' && !empty($payload['fields'])) {
        foreach (array_keys($payload['fields']) as $fieldKey) {
            $url .= '&updateMask.fieldPaths=' . urlencode($fieldKey);
        }
    }
    $options = ['http' => ['method' => $method, 'header' => "Content-Type: application/json\r\n", 'ignore_errors' => true, 'timeout' => 8]];
    if ($payload !== null) $options['http']['content'] = json_encode($payload);
    $response = @file_get_contents($url, false, stream_context_create($options));
    return $response ? (json_decode($response, true) ?: []) : [];
}

function firebaseFields(array $fields): array
{
    $result = [];
    foreach ($fields as $key => $value) {
        $result[$key] = is_bool($value) ? ['booleanValue' => $value] : ['stringValue' => (string)$value];
    }
    return $result;
}

/* ================================================================
   معالجة POST — حفظ الإعدادات
   ================================================================ */
$flash = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني. أعد المحاولة.'];
    } else {
        $action = $_POST['action'] ?? '';
        if (in_array($action, ['urgent_news_create', 'urgent_news_update', 'urgent_news_delete'], true)) {
            $newsId = trim($_POST['news_id'] ?? '');
            if ($action === 'urgent_news_delete' && $newsId !== '') {
                firebaseRequest('DELETE', 'urgent_news/' . rawurlencode($newsId));
                $flash = ['type' => 'success', 'msg' => 'تم حذف الخبر من الشريط العاجل'];
            } elseif ($action !== 'urgent_news_delete') {
                $titleAr = trim($_POST['title_ar'] ?? '');
                if ($titleAr === '') {
                    $flash = ['type' => 'error', 'msg' => 'يرجى كتابة نص الخبر بالعربية'];
                } else {
                    $newsFields = firebaseFields([
                        'titleAr' => $titleAr,
                        'titleEn' => trim($_POST['title_en'] ?? ''),
                        'link' => trim($_POST['link'] ?? ''),
                        'active' => ($_POST['active'] ?? '0') === '1',
                        'updatedAt' => date('c'),
                    ]);
                    $newsPath = $action === 'urgent_news_update' && $newsId !== ''
                        ? 'urgent_news/' . rawurlencode($newsId) : 'urgent_news';
                    firebaseRequest($action === 'urgent_news_update' ? 'PATCH' : 'POST', $newsPath, ['fields' => $newsFields]);
                    $flash = ['type' => 'success', 'msg' => 'تم حفظ خبر الشريط العاجل'];
                }
            }
        }
        $group = $_POST['group'] ?? '';
        $fields = $_POST['fields'] ?? [];
        if (!empty($group) && !empty($fields)) {
            $stmt = $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value, updated_at=CURRENT_TIMESTAMP");
            foreach ($fields as $key => $value) {
                $stmt->execute([$key, $value, $group]);
            }

            if (in_array($group, ['system', 'homepage', 'notifications', 'security'], true)) {
                $firebaseSettings = [];
                foreach ($fields as $key => $value) {
                    $firebaseSettings[$key] = $value === '1' ? true : ($value === '0' ? false : $value);
                }
                if ($group === 'system' && array_key_exists('exchange_campaign_enabled', $fields)) {
                    $campaignEnabled = $fields['exchange_campaign_enabled'] === '1';
                    $bookingEnabled = ($fields['exchange_booking_enabled'] ?? '1') === '1';
                    $donationEnabled = ($fields['exchange_donation_enabled'] ?? '1') === '1';
                    $statusCheckerEnabled = ($fields['material_status_checker_enabled'] ?? '1') === '1';
                    $firebaseSettings['campaignPhase'] = !$campaignEnabled ? 'suspended' : ($bookingEnabled ? 'exchange' : 'collection');
                    $firebaseSettings['donationFormFrozen'] = !$donationEnabled;
                    $firebaseSettings['material_status_checker_enabled'] = $statusCheckerEnabled;
                    $firebaseSettings['requestStatusFormEnabled'] = $statusCheckerEnabled;
                }
                firebaseRequest('PATCH', 'system_configs/global_settings', ['fields' => firebaseFields($firebaseSettings)]);
            }
            log_activity("حدّث إعدادات القسم: $group", 'settings');
            $flash = ['type' => 'success', 'msg' => 'تم حفظ الإعدادات بنجاح ✅'];
        }
    }
}

/* ================================================================
   قراءة الإعدادات من قاعدة البيانات
   ================================================================ */
$allSettings = [];
$rows = $db->query("SELECT setting_key, setting_value FROM site_settings")->fetchAll(PDO::FETCH_ASSOC);
foreach ($rows as $row) {
    $allSettings[$row['setting_key']] = $row['setting_value'];
}
$urgentNewsResponse = firebaseRequest('GET', 'urgent_news');
$urgentNews = [];
foreach (($urgentNewsResponse['documents'] ?? []) as $document) {
    $fields = $document['fields'] ?? [];
    $urgentNews[] = [
        'id' => basename($document['name'] ?? ''),
        'titleAr' => $fields['titleAr']['stringValue'] ?? '',
        'titleEn' => $fields['titleEn']['stringValue'] ?? '',
        'link' => $fields['link']['stringValue'] ?? '',
        'active' => ($fields['active']['booleanValue'] ?? false),
    ];
}
usort($urgentNews, static fn($a, $b) => strcmp($a['titleAr'], $b['titleAr']));
function s(array $settings, string $key, string $default = ''): string
{
    return htmlspecialchars($settings[$key] ?? $default);
}

// التبويب النشط
$activeTab = $_GET['tab'] ?? 'general';

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?></div>
<?php endif; ?>

<!-- ================================================================
     رأس الصفحة مع أيقونة وبطاقات سريعة
     ================================================================ -->
<div
    style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding:20px 24px;background:linear-gradient(135deg,#0284c7 0%,#0369a1 100%);border-radius:16px;color:#fff;">
    <div
        style="width:52px;height:52px;background:rgba(255,255,255,.15);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="white" stroke-width="2">
            <circle cx="12" cy="12" r="3" />
            <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    </div>
    <div>
        <h2 style="font-family:'Cairo',sans-serif;font-size:20px;font-weight:900;margin:0 0 4px;">الإدارة العامة —
            إعدادات النظام</h2>
        <p style="margin:0;font-size:13px;opacity:.85;">تحكم كامل في إعدادات المنصة: الهوية، التواصل الاجتماعي، الأمان،
            الإشعارات والمظهر</p>
    </div>
    <?php if (($allSettings['maintenance_mode'] ?? '0') === '1'): ?>
        <div
            style="margin-right:auto;background:#fef3c7;color:#b45309;padding:8px 16px;border-radius:8px;font-weight:800;font-size:12.5px;">
            ⚠️ وضع الصيانة مفعّل
        </div>
    <?php endif; ?>
</div>

<!-- ================================================================
     التبويبات الرأسية للإعدادات
     ================================================================ -->
<div style="display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start;">

    <!-- القائمة الجانبية -->
    <div class="panel-box" style="padding:8px;">
        <?php
        $settingsTabs = [
            'general' => ['label' => 'إعدادات الموقع', 'icon' => '🌐'],
            'homepage' => ['label' => 'الصفحة الرئيسية', 'icon' => '🏠'],
            'urgent' => ['label' => 'الشريط العاجل', 'icon' => '📢'],
            'social' => ['label' => 'التواصل الاجتماعي', 'icon' => '📱'],
            'system' => ['label' => 'إعدادات النظام', 'icon' => '⚙️'],
            'security' => ['label' => 'الأمان وتسجيل الدخول', 'icon' => '🔒'],
            'notifications' => ['label' => 'الإشعارات والتنبيهات', 'icon' => '🔔'],
            'appearance' => ['label' => 'المظهر والتصميم', 'icon' => '🎨'],
            'backup' => ['label' => 'النسخ الاحتياطي والتزامن', 'icon' => '💾'],
        ];
        foreach ($settingsTabs as $tabKey => $tabMeta):
            ?>
            <a href="?tab=<?= $tabKey ?>"
                style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:8px;text-decoration:none;font-size:13.5px;font-weight:<?= $activeTab === $tabKey ? '800' : '700' ?>;color:<?= $activeTab === $tabKey ? '#0284c7' : '#334155' ?>;background:<?= $activeTab === $tabKey ? '#e0f2fe' : 'transparent' ?>;margin-bottom:2px;transition:all .15s;">
                <span style="font-size:16px;"><?= $tabMeta['icon'] ?></span>
                <?= $tabMeta['label'] ?>
                <?php if ($activeTab === $tabKey): ?>
                    <svg style="margin-right:auto;" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                        stroke-width="2">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                <?php endif; ?>
            </a>
        <?php endforeach; ?>
    </div>

    <!-- محتوى الإعدادات -->
    <div>

        <!-- ─── إعدادات الموقع ─── -->
        <?php if ($activeTab === 'homepage'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">🏠 أقسام الصفحة الرئيسية</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="homepage">
                    <p style="margin:0 0 18px;color:#64748b;font-size:13px;">فعّل أو أوقف الأقسام التي تظهر للزوار، ثم احفظ التغييرات لتنعكس على الموقع.</p>
                    <div class="modal-form-grid" style="margin-bottom:20px;">
                        <div class="form-group">
                            <label>عنوان الواجهة الرئيسية</label>
                            <input type="text" name="fields[home_hero_title]" value="<?= s($allSettings, 'home_hero_title') ?>" class="form-control" placeholder="اتعلم، شارك، وتقدم">
                        </div>
                        <div class="form-group">
                            <label>وصف الواجهة الرئيسية</label>
                            <input type="text" name="fields[home_hero_subtitle]" value="<?= s($allSettings, 'home_hero_subtitle') ?>" class="form-control" placeholder="منصتك الجامعية المتكاملة">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;">
                        <?php
                        $homepageSections = [
                            'home_hero_enabled' => 'الواجهة الرئيسية',
                            'home_marquee_enabled' => 'الشريط العاجل',
                            'home_services_enabled' => 'الخدمات',
                            'home_request_services_enabled' => 'نماذج طلب الخدمات',
                            'home_projects_enabled' => 'المشاريع',
                            'home_events_enabled' => 'الفعاليات القادمة',
                            'home_course_watcher_enabled' => 'مراقبة المواد',
                            'home_graduation_enabled' => 'قسم التخرج',
                            'home_weekly_tip_enabled' => 'النصيحة الأسبوعية',
                            'home_testimonials_enabled' => 'آراء الطلاب',
                            'home_suggestions_enabled' => 'الاقتراحات',
                            'home_useful_sites_enabled' => 'المواقع المفيدة',
                        ];
                        foreach ($homepageSections as $key => $label):
                            $enabled = ($allSettings[$key] ?? '1') === '1';
                        ?>
                            <label style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:<?= $enabled ? '#f0fdf4' : '#f8fafc' ?>;border:1px solid <?= $enabled ? '#bbf7d0' : '#e2e8f0' ?>;border-radius:10px;cursor:pointer;">
                                <input type="hidden" name="fields[<?= $key ?>]" value="0">
                                <input type="checkbox" name="fields[<?= $key ?>]" value="1" <?= $enabled ? 'checked' : '' ?> style="width:18px;height:18px;accent-color:#0284c7;">
                                <span style="font-weight:700;color:#0f172a;font-size:13px;">مفعّل: <?= htmlspecialchars($label) ?></span>
                            </label>
                        <?php endforeach; ?>
                    </div>
                    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ أقسام الصفحة</button>
                    </div>
                </form>
            </div>

        <?php elseif ($activeTab === 'urgent'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">📢 إدارة الشريط العاجل</h3>
                </div>
                <form method="post" style="padding:24px;border-bottom:1px solid #e2e8f0;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="urgent_news_create">
                    <h4 style="margin:0 0 14px;color:#0f172a;">إضافة خبر جديد</h4>
                    <div class="modal-form-grid">
                        <div class="form-group"><label>الخبر بالعربية *</label><input type="text" name="title_ar" class="form-control" required></div>
                        <div class="form-group"><label>الخبر بالإنجليزية</label><input type="text" name="title_en" class="form-control" dir="ltr"></div>
                        <div class="form-group"><label>رابط اختياري</label><input type="url" name="link" class="form-control" dir="ltr" placeholder="https://..."></div>
                        <label style="display:flex;align-items:center;gap:8px;font-weight:700;"><input type="checkbox" name="active" value="1" checked style="width:18px;height:18px;accent-color:#0284c7;"> عرض في الشريط</label>
                    </div>
                    <button type="submit" class="btn btn-primary" style="margin-top:16px;">➕ إضافة الخبر</button>
                </form>
                <div style="padding:20px 24px;">
                    <h4 style="margin:0 0 14px;color:#0f172a;">الأخبار الحالية</h4>
                    <?php if (empty($urgentNews)): ?>
                        <p style="color:#64748b;font-size:13px;">لا توجد أخبار مضافة بعد.</p>
                    <?php endif; ?>
                    <?php foreach ($urgentNews as $news): ?>
                        <form method="post" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:center;padding:12px 0;border-bottom:1px solid #f1f5f9;">
                            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                            <input type="hidden" name="action" value="urgent_news_update">
                            <input type="hidden" name="news_id" value="<?= htmlspecialchars($news['id']) ?>">
                            <input type="text" name="title_ar" value="<?= htmlspecialchars($news['titleAr']) ?>" class="form-control" aria-label="الخبر بالعربية">
                            <input type="text" name="title_en" value="<?= htmlspecialchars($news['titleEn']) ?>" class="form-control" dir="ltr" aria-label="الخبر بالإنجليزية">
                            <input type="url" name="link" value="<?= htmlspecialchars($news['link']) ?>" class="form-control" dir="ltr" aria-label="الرابط">
                            <div style="display:flex;gap:6px;align-items:center;">
                                <input type="hidden" name="active" value="0">
                                <input type="checkbox" name="active" value="1" <?= $news['active'] ? 'checked' : '' ?> title="عرض الخبر">
                                <button type="submit" class="btn btn-secondary" title="حفظ التعديل">💾</button>
                                <button type="submit" name="action" value="urgent_news_delete" class="btn btn-danger" title="حذف الخبر" onclick="return confirm('حذف هذا الخبر؟');">🗑️</button>
                            </div>
                        </form>
                    <?php endforeach; ?>
                </div>
            </div>

        <?php elseif ($activeTab === 'general'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">🌐 إعدادات الموقع والهوية</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="general">
                    <div class="modal-form-grid">
                        <div class="form-group">
                            <label>اسم المنصة *</label>
                            <input type="text" name="fields[site_name]"
                                value="<?= s($allSettings, 'site_name', 'مكانك الجامعي') ?>" required class="form-control"
                                placeholder="مكانك الجامعي">
                        </div>
                        <div class="form-group">
                            <label>الشعار النصي (الـ Logo)</label>
                            <input type="text" name="fields[logo_text]" value="<?= s($allSettings, 'logo_text', 'مكانك') ?>"
                                class="form-control" placeholder="مكانك">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>وصف المنصة المختصر (Tagline)</label>
                            <input type="text" name="fields[site_tagline]"
                                value="<?= s($allSettings, 'site_tagline', 'شريكك الأكاديمي في الجامعة') ?>"
                                class="form-control" placeholder="شريكك الأكاديمي في الجامعة">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>وصف المنصة الكامل (Meta Description)</label>
                            <textarea name="fields[site_description]" rows="3" class="form-control"
                                placeholder="وصف شامل للمنصة..."><?= s($allSettings, 'site_description') ?></textarea>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>رسالة الترحيب بالطلاب</label>
                            <textarea name="fields[welcome_message]" rows="2" class="form-control"
                                placeholder="مرحباً بكم في منصة مكانك..."><?= s($allSettings, 'welcome_message') ?></textarea>
                        </div>
                        <div class="form-group">
                            <label>البريد الإلكتروني للتواصل</label>
                            <input type="email" name="fields[contact_email]" value="<?= s($allSettings, 'contact_email') ?>"
                                class="form-control" dir="ltr">
                        </div>
                    </div>
                    <div
                        style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ إعدادات الموقع</button>
                    </div>
                </form>
            </div>

            <!-- ─── التواصل الاجتماعي ─── -->
        <?php elseif ($activeTab === 'social'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">📱 روابط التواصل الاجتماعي</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="social">
                    <div class="modal-form-grid">
                        <div class="form-group">
                            <label>
                                <span
                                    style="background:#25d366;color:#fff;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;margin-left:6px;">WhatsApp</span>
                                رابط واتساب الجماعة / الخدمة
                            </label>
                            <input type="url" name="fields[whatsapp_link]" value="<?= s($allSettings, 'whatsapp_link') ?>"
                                class="form-control" dir="ltr" placeholder="https://wa.me/962790000000">
                        </div>
                        <div class="form-group">
                            <label>
                                <span
                                    style="background:linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7);color:#fff;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;margin-left:6px;">Instagram</span>
                                رابط إنستغرام
                            </label>
                            <input type="url" name="fields[instagram_link]" value="<?= s($allSettings, 'instagram_link') ?>"
                                class="form-control" dir="ltr" placeholder="https://instagram.com/makanak_uni">
                        </div>
                        <div class="form-group">
                            <label>
                                <span
                                    style="background:#26a5e4;color:#fff;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;margin-left:6px;">Telegram</span>
                                رابط تيليغرام
                            </label>
                            <input type="url" name="fields[telegram_link]" value="<?= s($allSettings, 'telegram_link') ?>"
                                class="form-control" dir="ltr" placeholder="https://t.me/makanak_uni">
                        </div>
                        <div class="form-group">
                            <label>
                                <span
                                    style="background:#0a66c2;color:#fff;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;margin-left:6px;">LinkedIn</span>
                                رابط لينكدإن
                            </label>
                            <input type="url" name="fields[linkedin_link]" value="<?= s($allSettings, 'linkedin_link') ?>"
                                class="form-control" dir="ltr" placeholder="https://linkedin.com/company/...">
                        </div>
                        <div class="form-group">
                            <label>
                                <span
                                    style="background:#1d9bf0;color:#fff;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;margin-left:6px;">Twitter/X</span>
                                رابط تويتر / X
                            </label>
                            <input type="url" name="fields[twitter_link]" value="<?= s($allSettings, 'twitter_link') ?>"
                                class="form-control" dir="ltr" placeholder="https://x.com/...">
                        </div>
                    </div>
                    <div
                        style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ روابط التواصل</button>
                    </div>
                </form>
            </div>

            <!-- ─── إعدادات النظام ─── -->
        <?php elseif ($activeTab === 'system'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">⚙️ إعدادات النظام والتشغيل</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="system">
                    <!-- وضع الصيانة -->
                    <div
                        style="background:<?= ($allSettings['maintenance_mode'] ?? '0') === '1' ? '#fffbeb' : '#f8fafc' ?>;border:1px solid <?= ($allSettings['maintenance_mode'] ?? '0') === '1' ? '#fde68a' : '#e2e8f0' ?>;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
                        <div style="flex:1;">
                            <div style="font-weight:800;font-size:14px;color:#0f172a;">🚧 وضع الصيانة (Maintenance Mode)
                            </div>
                            <div style="font-size:12.5px;color:#64748b;margin-top:4px;">عند التفعيل، يرى زوار الموقع رسالة
                                الصيانة المحددة أدناه ولا يمكنهم الوصول للمحتوى</div>
                        </div>
                        <label
                            style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:13.5px;">
                            <input type="hidden" name="fields[maintenance_mode]" value="0">
                            <input type="checkbox" name="fields[maintenance_mode]" value="1"
                                <?= ($allSettings['maintenance_mode'] ?? '0') === '1' ? 'checked' : '' ?>
                                style="width:18px;height:18px;accent-color:#b45309;">
                            تفعيل
                        </label>
                    </div>
                    <div class="modal-form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>رسالة الصيانة (تُعرض للزوار)</label>
                            <input type="text" name="fields[maintenance_message]"
                                value="<?= s($allSettings, 'maintenance_message', 'المنصة تحت الصيانة، نعود قريباً!') ?>"
                                class="form-control" placeholder="المنصة تحت الصيانة، نعود قريباً!">
                        </div>
                        <div class="form-group">
                            <label>عدد العناصر في كل صفحة (Pagination)</label>
                            <select name="fields[items_per_page]" class="form-control">
                                <?php foreach ([10, 15, 20, 25, 30, 50] as $n): ?>
                                    <option value="<?= $n ?>"
                                        <?= ($allSettings['items_per_page'] ?? '20') === (string) $n ? 'selected' : '' ?>><?= $n ?> عنصر
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>المنطقة الزمنية (Timezone)</label>
                            <select name="fields[timezone]" class="form-control" dir="ltr">
                                <?php foreach (['Asia/Amman', 'Asia/Riyadh', 'Asia/Dubai', 'UTC', 'Europe/London'] as $tz): ?>
                                    <option value="<?= $tz ?>" <?= ($allSettings['timezone'] ?? 'Asia/Amman') === $tz ? 'selected' : '' ?>><?= $tz ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <!-- تفعيل/إيقاف التسجيل -->
                        <div class="form-group" style="grid-column:1/-1;">
                            <div
                                style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:16px;">
                                <div style="flex:1;">
                                    <div style="font-weight:800;font-size:13.5px;color:#0f172a;">السماح بطلبات التسجيل
                                        والانضمام الجديدة</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:3px;">عند الإيقاف، لا يمكن للطلاب
                                        الجدد تقديم طلبات انضمام للمنصة</div>
                                </div>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;">
                                    <input type="hidden" name="fields[allow_registration]" value="0">
                                    <input type="checkbox" name="fields[allow_registration]" value="1"
                                        <?= ($allSettings['allow_registration'] ?? '1') === '1' ? 'checked' : '' ?>
                                        style="width:18px;height:18px;accent-color:#0284c7;">
                                    مفعّل
                                </label>
                            </div>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px;">
                                <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                                    <span style="font-size:22px;">📚</span>
                                    <div>
                                        <div style="font-weight:900;font-size:15px;color:#166534;">نظام تبادل المواد</div>
                                        <div style="font-size:12px;color:#64748b;margin-top:3px;">التحكم باستقبال التبرعات والحجوزات في الحملة الحالية</div>
                                    </div>
                                </div>
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
                                    <?php
                                    $exchangeControls = [
                                        'exchange_campaign_enabled' => ['title' => 'تشغيل حملة تبادل المواد', 'desc' => 'إظهار الحملة واستقبال التبرعات الجديدة'],
                                        'exchange_booking_enabled' => ['title' => 'فتح الحجز الآن', 'desc' => 'السماح للطلاب بحجز المواد المتاحة'],
                                        'exchange_donation_enabled' => ['title' => 'فتح نموذج التبرع', 'desc' => 'السماح بإرسال مواد جديدة للتبادل'],
                                        'material_status_checker_enabled' => ['title' => 'فتح نموذج معرفة حالة الطلبات', 'desc' => 'السماح للطلاب بالاستعلام عن حالة تبرعاتهم وحجوزاتهم'],
                                    ];
                                    foreach ($exchangeControls as $key => $control):
                                        $enabled = ($allSettings[$key] ?? '1') === '1';
                                        $isStatusChecker = $key === 'material_status_checker_enabled';
                                        $controlColor = $enabled ? '#16a34a' : ($isStatusChecker ? '#dc2626' : '#64748b');
                                        $controlBackground = $enabled ? '#fff' : ($isStatusChecker ? '#fff1f2' : '#f8fafc');
                                        $controlBorder = $enabled ? '#bbf7d0' : ($isStatusChecker ? '#fecaca' : '#e2e8f0');
                                    ?>
                                        <label style="display:flex;align-items:center;gap:10px;padding:13px;background:<?= $controlBackground ?>;border:1px solid <?= $controlBorder ?>;border-radius:9px;cursor:pointer;">
                                            <input type="hidden" name="fields[<?= $key ?>]" value="0">
                                            <input type="checkbox" name="fields[<?= $key ?>]" value="1" <?= $enabled ? 'checked' : '' ?> style="width:18px;height:18px;accent-color:<?= $controlColor ?>;">
                                            <span>
                                                <strong style="display:block;color:#0f172a;font-size:13px;"><?= $control['title'] ?><?php if ($isStatusChecker): ?> <b style="color:<?= $controlColor ?>;font-size:11px;">— <?= $enabled ? 'مفتوح' : 'مغلق' ?></b><?php endif; ?></strong>
                                                <small style="display:block;color:#64748b;font-size:11px;margin-top:3px;"><?php if ($isStatusChecker): ?><?= $enabled ? 'النموذج ظاهر للطلاب ويمكنهم الاستعلام عن طلباتهم' : 'النموذج مخفي عن الطلاب ولا يمكن استخدامه حاليًا' ?><?php else: ?><?= $control['desc'] ?><?php endif; ?></small>
                                            </span>
                                        </label>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div
                        style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ إعدادات النظام</button>
                    </div>
                </form>
            </div>

            <!-- ─── الأمان ─── -->
        <?php elseif ($activeTab === 'security'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">🔒 الأمان وسياسات تسجيل الدخول</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="security">
                    <div class="modal-form-grid">
                        <div class="form-group">
                            <label>مدة الجلسة (بالدقائق)</label>
                            <input type="number" name="fields[session_lifetime]"
                                value="<?= s($allSettings, 'session_lifetime', '120') ?>" min="15" max="1440"
                                class="form-control">
                            <small style="color:#64748b;font-size:11.5px;">الوقت قبل انتهاء الجلسة تلقائياً عند
                                الخمول</small>
                        </div>
                        <div class="form-group">
                            <label>الحد الأقصى لمحاولات الدخول الفاشلة</label>
                            <input type="number" name="fields[max_login_attempts]"
                                value="<?= s($allSettings, 'max_login_attempts', '5') ?>" min="3" max="20"
                                class="form-control">
                            <small style="color:#64748b;font-size:11.5px;">يُقفل الحساب مؤقتاً عند تجاوز هذا العدد</small>
                        </div>
                        <div class="form-group">
                            <label>مدة الحظر المؤقت (بالدقائق)</label>
                            <input type="number" name="fields[lockout_minutes]"
                                value="<?= s($allSettings, 'lockout_minutes', '15') ?>" min="5" max="120"
                                class="form-control">
                        </div>
                        <div class="form-group">
                            <label>الحد الأدنى لطول كلمة المرور</label>
                            <input type="number" name="fields[password_min_length]"
                                value="<?= s($allSettings, 'password_min_length', '8') ?>" min="6" max="32"
                                class="form-control">
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <div
                                style="background:<?= ($allSettings['force_2fa'] ?? '0') === '1' ? '#f0fdf4' : '#f8fafc' ?>;border:1px solid <?= ($allSettings['force_2fa'] ?? '0') === '1' ? '#bbf7d0' : '#e2e8f0' ?>;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:16px;">
                                <div style="flex:1;">
                                    <div style="font-weight:800;font-size:13.5px;color:#0f172a;">🔐 إجبارية المصادقة
                                        الثنائية (2FA) لجميع المشرفين</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:3px;">يُلزم كل مشرف بتفعيل المصادقة
                                        الثنائية عند تسجيل الدخول</div>
                                </div>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;">
                                    <input type="hidden" name="fields[force_2fa]" value="0">
                                    <input type="checkbox" name="fields[force_2fa]" value="1"
                                        <?= ($allSettings['force_2fa'] ?? '0') === '1' ? 'checked' : '' ?>
                                        style="width:18px;height:18px;accent-color:#16a34a;">
                                    إجباري
                                </label>
                            </div>
                        </div>

                        <!-- درع منع تصوير الشاشة والعلامة المائية -->
                        <div class="form-group" style="grid-column:1/-1;">
                            <div
                                style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:16px;">
                                <div style="flex:1;">
                                    <div style="font-weight:800;font-size:13.5px;color:#1e3a8a;">🛡️ درع منع التقاط الشاشة
                                        (Anti-Screenshot & Capture Shield)</div>
                                    <div style="font-size:12px;color:#475569;margin-top:3px;">طمس الشاشة فوراً واعتراض أزرار
                                        واختصارات لقطة الشاشة والطباعة ومسح الحافظة</div>
                                </div>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;">
                                    <input type="hidden" name="fields[enable_anti_capture]" value="0">
                                    <input type="checkbox" name="fields[enable_anti_capture]" value="1"
                                        <?= ($allSettings['enable_anti_capture'] ?? '1') === '1' ? 'checked' : '' ?>
                                        style="width:18px;height:18px;accent-color:#0284c7;">
                                    مفعّل
                                </label>
                            </div>
                        </div>

                        <div class="form-group" style="grid-column:1/-1;">
                            <div
                                style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:16px;">
                                <div style="flex:1;">
                                    <div style="font-weight:800;font-size:13.5px;color:#0f172a;">🏷️ العلامة المائية
                                        الجنائية الديناميكية (Dynamic Watermark)</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:3px;">طباعة اسم المنسق ورقم الـ IP
                                        والتوقيت بالثواني بشكل شفاف ومائل على الشاشة لمنع التصوير بكاميرا خارجية</div>
                                </div>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;">
                                    <input type="hidden" name="fields[enable_watermark]" value="0">
                                    <input type="checkbox" name="fields[enable_watermark]" value="1"
                                        <?= ($allSettings['enable_watermark'] ?? '1') === '1' ? 'checked' : '' ?>
                                        style="width:18px;height:18px;accent-color:#0284c7;">
                                    مفعّل
                                </label>
                            </div>
                        </div>
                    </div>
                    <div
                        style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ إعدادات الأمان</button>
                    </div>
                </form>
            </div>

            <!-- ─── الإشعارات ─── -->
        <?php elseif ($activeTab === 'notifications'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">🔔 إعدادات الإشعارات والتنبيهات</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="notifications">
                    <div class="modal-form-grid">
                        <div class="form-group" style="grid-column:1/-1;">
                            <label>البريد الإلكتروني لاستقبال إشعارات الإدارة</label>
                            <input type="email" name="fields[admin_notify_email]"
                                value="<?= s($allSettings, 'admin_notify_email') ?>" class="form-control" dir="ltr"
                                placeholder="admin@makanak.edu.jo">
                        </div>
                        <?php
                        $notifOptions = [
                            'enable_notifications' => ['label' => 'تفعيل نظام الإشعارات بالكامل', 'desc' => 'تشغيل / إيقاف جميع الإشعارات'],
                            'notify_new_exchange' => ['label' => 'إشعار عند استلام طلب تبادل مادة جديد', 'desc' => ''],
                            'notify_new_member' => ['label' => 'إشعار عند تقديم طلب انضمام جديد', 'desc' => ''],
                            'notify_reports' => ['label' => 'إشعار عند ورود بلاغ جديد من مستخدم', 'desc' => ''],
                        ];
                        foreach ($notifOptions as $nKey => $nMeta): ?>
                            <div class="form-group" style="grid-column:1/-1;">
                                <div
                                    style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:13px 18px;display:flex;align-items:center;gap:16px;">
                                    <div style="flex:1;">
                                        <div style="font-weight:800;font-size:13px;color:#0f172a;"><?= $nMeta['label'] ?></div>
                                        <?php if ($nMeta['desc']): ?>
                                            <div style="font-size:12px;color:#64748b;margin-top:2px;"><?= $nMeta['desc'] ?></div>
                                        <?php endif; ?>
                                    </div>
                                    <label
                                        style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;white-space:nowrap;">
                                        <input type="hidden" name="fields[<?= $nKey ?>]" value="0">
                                        <input type="checkbox" name="fields[<?= $nKey ?>]" value="1"
                                            <?= ($allSettings[$nKey] ?? '1') === '1' ? 'checked' : '' ?>
                                            style="width:18px;height:18px;accent-color:#0284c7;">
                                        <span><?= ($allSettings[$nKey] ?? '1') === '1' ? 'مفعّل' : 'معطّل' ?></span>
                                    </label>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                    <div
                        style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ إعدادات الإشعارات</button>
                    </div>
                </form>
            </div>

            <!-- ─── المظهر ─── -->
        <?php elseif ($activeTab === 'appearance'): ?>
            <div class="panel-box">
                <div class="panel-box-header">
                    <h3 class="panel-box-title">🎨 إعدادات المظهر والتصميم</h3>
                </div>
                <form method="post" style="padding:24px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="group" value="appearance">
                    <div class="modal-form-grid">
                        <div class="form-group">
                            <label>اللون الأساسي للمنصة</label>
                            <div style="display:flex;align-items:center;gap:12px;">
                                <input type="color" name="fields[primary_color]"
                                    value="<?= s($allSettings, 'primary_color', '#0284c7') ?>"
                                    style="width:50px;height:40px;border:none;border-radius:8px;cursor:pointer;padding:0;">
                                <input type="text" id="colorTextInput"
                                    value="<?= s($allSettings, 'primary_color', '#0284c7') ?>" class="form-control" dir="ltr"
                                    style="max-width:140px;" placeholder="#0284c7">
                            </div>
                            <small style="color:#64748b;font-size:11.5px;">يُطبّق على الأزرار والروابط وشريط التنقل</small>
                        </div>
                        <div class="form-group">
                            <label>اتجاه اللغة (RTL / LTR)</label>
                            <select name="fields[rtl_mode]" class="form-control">
                                <option value="1" <?= ($allSettings['rtl_mode'] ?? '1') === '1' ? 'selected' : '' ?>>العربية — من
                                    اليمين لليسار (RTL)</option>
                                <option value="0" <?= ($allSettings['rtl_mode'] ?? '1') === '0' ? 'selected' : '' ?>>الإنجليزية — من
                                    اليسار لليمين (LTR)</option>
                            </select>
                        </div>
                        <div class="form-group" style="grid-column:1/-1;">
                            <div
                                style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:16px;">
                                <div style="flex:1;">
                                    <div style="font-weight:800;font-size:13.5px;color:#0f172a;">🌙 السماح بالوضع الداكن
                                        (Dark Mode)</div>
                                    <div style="font-size:12px;color:#64748b;margin-top:3px;">يتيح للمستخدمين تبديل المظهر
                                        بين الفاتح والداكن</div>
                                </div>
                                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;">
                                    <input type="hidden" name="fields[dark_mode_allowed]" value="0">
                                    <input type="checkbox" name="fields[dark_mode_allowed]" value="1"
                                        <?= ($allSettings['dark_mode_allowed'] ?? '0') === '1' ? 'checked' : '' ?>
                                        style="width:18px;height:18px;accent-color:#6d28d9;">
                                    مسموح
                                </label>
                            </div>
                        </div>
                        <!-- معاينة مباشرة للألوان -->
                        <div class="form-group" style="grid-column:1/-1;">
                            <label style="font-weight:700;margin-bottom:8px;display:block;">معاينة اللون الأساسي</label>
                            <div id="colorPreview" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                                <button type="button" id="previewBtn"
                                    style="background:<?= s($allSettings, 'primary_color', '#0284c7') ?>;color:#fff;border:none;padding:9px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:default;">زر
                                    رئيسي</button>
                                <span id="previewBadge"
                                    style="background:<?= s($allSettings, 'primary_color', '#0284c7') ?>22;color:<?= s($allSettings, 'primary_color', '#0284c7') ?>;padding:4px 12px;border-radius:20px;font-weight:700;font-size:12px;border:1px solid <?= s($allSettings, 'primary_color', '#0284c7') ?>44;">شارة
                                    نشطة</span>
                            </div>
                        </div>
                    </div>
                    <div
                        style="margin-top:20px;padding-top:16px;border-top:1px solid #f1f5f9;display:flex;justify-content:flex-end;">
                        <button type="submit" class="btn btn-primary">💾 حفظ إعدادات المظهر</button>
                    </div>
                </form>
            </div>
        <?php endif; ?>

        <?php if ($activeTab === 'backup'): ?>
            <div class="panel-box" style="padding:28px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
                    <div style="width:44px; height:44px; border-radius:12px; background:#e0f2fe; display:flex; align-items:center; justify-content:center; color:#0284c7;">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </div>
                    <div>
                        <h3 style="margin:0; font-size:18px; font-weight:900; color:#0f172a;">النسخ الاحتياطي ومراقبة التزامن السحابي</h3>
                        <p style="margin:2px 0 0; font-size:13px; color:#64748b;">إدارة النسخ الاحتياطية لملف قاعدة البيانات ومراقبة حالة الاتصال مع خوادم Firebase</p>
                    </div>
                </div>

                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:20px; margin-bottom:20px;">
                    <p style="margin:0 0 14px; font-size:13.5px; color:#334155; line-height:1.6;">
                        تم نقل وتطوير مركز النسخ الاحتياطي والتزامن في صفحة مخصصة متطورة توفر:
                    </p>
                    <ul style="margin:0 0 16px; padding-right:20px; font-size:13px; color:#475569; line-height:1.8;">
                        <li><strong>تحميل فوري بضغطة زر</strong> لقاعدة البيانات الحالية بصيغة SQLite كاملة.</li>
                        <li><strong>إنشاء نسخ احتياطية لحظية بالسيرفر</strong> داخل مجلد محفوظ مع إمكانية استعادتها بكلمة مرور المشرف.</li>
                        <li><strong>فحص الاتصال الحي مع خوادم Firebase</strong> وقياس زمن الاستجابة (Latency) والمزامنة اليدوية الفورية.</li>
                        <li><strong>سياسات التدوير التلقائي</strong> والاحتفاظ بعدد محدد من النسخ.</li>
                    </ul>
                    <div style="display:flex; gap:12px; flex-wrap:wrap;">
                        <a href="backups.php" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px; text-decoration:none; padding:10px 20px; font-weight:800;">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            فتح لوحة النسخ الاحتياطي والتزامن
                        </a>
                        <a href="backups.php?action=download_live" style="display:inline-flex; align-items:center; gap:8px; text-decoration:none; padding:10px 18px; font-weight:700; background:#fff; border:1px solid #cbd5e1; border-radius:8px; color:#0f172a; font-size:13px;">
                            تحميل نسخة حية فوراً (SQLite)
                        </a>
                    </div>
                </div>
            </div>
        <?php endif; ?>

    </div><!-- end content -->
</div><!-- end grid -->

<script>
    // ربط color picker بحقل النص
    const colorInput = document.querySelector('input[name="fields[primary_color]"]');
    const colorText = document.getElementById('colorTextInput');
    const prevBtn = document.getElementById('previewBtn');
    const prevBadge = document.getElementById('previewBadge');

    if (colorInput && colorText) {
        colorInput.addEventListener('input', function () {
            colorText.value = this.value;
            if (prevBtn) { prevBtn.style.background = this.value; }
            if (prevBadge) {
                prevBadge.style.background = this.value + '22';
                prevBadge.style.color = this.value;
                prevBadge.style.borderColor = this.value + '44';
            }
        });
        colorText.addEventListener('input', function () {
            if (/^#[0-9a-fA-F]{6}$/.test(this.value)) {
                colorInput.value = this.value;
                if (prevBtn) { prevBtn.style.background = this.value; }
            }
        });
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>