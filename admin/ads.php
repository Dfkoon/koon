<?php
/**
 * admin/ads.php — إدارة الإعلانات وشريط التنبيهات والإشعارات العامة
 */
$page_key = 'ads';
$page_title = 'إدارة الإعلانات والتنبيهات';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../sync_official_live.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();
$defaultPromoAds = [
    [
        'id' => 'horizon',
        'badge' => '🎓 الأفق للتصاميم',
        'title' => 'لأن لحظة التخرج لا تتكرر...',
        'highlight' => 'ذكرياتك تستحق الأفضل.',
        'description' => 'خلّي ذكرياتك تنطبع بطريقة تليق فيك. نحن في الأفق للتصاميم نصمم لك دفتر تخرج فاخر، يجمع أجمل لحظاتك بأرقى الأساليب الفنية.',
        'ctaText' => 'احجز تصميمك الآن',
        'ctaLink' => 'https://wa.me/962798421524',
        'secondaryText' => 'شاهد أعمالنا',
        'secondaryLink' => 'https://www.instagram.com/p/DUqUOoYjMyD/',
        'phone' => '0798421524',
        'type' => 'book',
    ],
    [
        'id' => 'nabdh',
        'badge' => '🌟 مبادرة إنسانية',
        'title' => 'مبادرة مرافقة الطلبة ذوي الاحتياجات الخاصة',
        'highlight' => 'جامعة البلقاء التطبيقية',
        'description' => 'يعلن نادي نبض عن فتح باب الانضمام لمبادرة مرافقة زملائنا من الطلبة ذوي الاحتياجات الخاصة، تعزيزًا لروح المساندة والتكافل داخل جامعتنا.',
        'tasks' => ['قراءة الأسئلة للطالب/ـة عند الحاجة.', 'كتابة الإجابات نيابة عن الطالب.', 'مرافقة الطالب أثناء التنقل بين القاعات.', 'تقديم الدعم اللوجستي والإنساني.'],
        'quote' => 'ﷺ: (من كان في حاجة أخيه كان الله في حاجته)',
        'ctaText' => 'انضم للمبادرة الآن',
        'ctaLink' => 'https://chat.whatsapp.com/KdxQ3L1aDQfAK7azrXcxE7',
        'secondaryText' => 'عن النادي',
        'secondaryLink' => '#',
        'type' => 'charity',
    ],
];
$promoDocument = liveFirestoreGet('homepage_content', 'graduation_promo');
$promoDocumentExists = is_array($promoDocument);
$promoDocument = $promoDocument ?? [];
$promoEnabled = array_key_exists('enabled', $promoDocument) ? (bool) $promoDocument['enabled'] : true;
$promoAds = $promoDocumentExists && is_array($promoDocument['ads'] ?? null) ? $promoDocument['ads'] : $defaultPromoAds;

$noticeTypes = [
    'info' => ['label' => 'ℹ️ معلومات عامة', 'badge' => 'badge-role'],
    'warning' => ['label' => '⚠️ تحذير أكاديمي', 'badge' => 'badge-warning'],
    'success' => ['label' => '✅ خبر سار وإنجاز', 'badge' => 'badge-success'],
    'alert' => ['label' => '🔔 تنبيه هام', 'badge' => 'badge-faculty'],
    'urgent' => ['label' => '🚨 إعلان اضطراري / عاجل', 'badge' => 'badge-cancelled'],
    'survey' => ['label' => '⭐ استطلاع رأي وتقييم إجباري', 'badge' => 'badge-completed'],
];

$targetPages = [
    '' => '📌 جميع صفحات الموقع (شريط عام)',
    '/exchange' => '🔄 قسم تبادل الكتب والمواد',
    '/quiz' => '📝 قسم الاختبارات وبنك الأسئلة',
    '/materials' => '📚 قسم المواد الدراسية والملخصات',
    '/plans' => '🗺️ الخطط الدراسية',
    '/calendar' => '📅 التقويم الأكاديمي',
    '/grading' => '📊 نظام العلامات وحساب المعدل',
    '/faq' => '❓ الأسئلة الشائعة ونشمي',
    '/about' => 'ℹ️ من نحن',
];

$flash = null;

// معالجة الإجراءات POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'promo_save' || $action === 'promo_delete' || $action === 'promo_toggle') {
            $promoAds = $promoDocumentExists && is_array($promoDocument['ads'] ?? null) ? $promoDocument['ads'] : $defaultPromoAds;
            if ($action === 'promo_toggle') {
                $promoEnabled = !$promoEnabled;
            } elseif ($action === 'promo_delete') {
                $deleteId = trim($_POST['promo_id'] ?? '');
                $promoAds = array_values(array_filter($promoAds, static fn($ad) => (string) ($ad['id'] ?? '') !== $deleteId));
            } else {
                $promoId = trim($_POST['promo_id'] ?? '') ?: 'promo_' . bin2hex(random_bytes(4));
                $ad = [
                    'id' => $promoId,
                    'enabled' => !empty($_POST['promo_enabled']),
                    'badge' => trim($_POST['promo_badge'] ?? ''),
                    'title' => trim($_POST['promo_title'] ?? ''),
                    'highlight' => trim($_POST['promo_highlight'] ?? ''),
                    'description' => trim($_POST['promo_description'] ?? ''),
                    'tasks' => array_values(array_filter(array_map('trim', explode("\n", $_POST['promo_tasks'] ?? '')))),
                    'quote' => trim($_POST['promo_quote'] ?? ''),
                    'ctaText' => trim($_POST['promo_cta_text'] ?? ''),
                    'ctaLink' => trim($_POST['promo_cta_link'] ?? ''),
                    'secondaryText' => trim($_POST['promo_secondary_text'] ?? ''),
                    'secondaryLink' => trim($_POST['promo_secondary_link'] ?? ''),
                    'phone' => trim($_POST['promo_phone'] ?? ''),
                    'type' => $_POST['promo_type'] === 'charity' ? 'charity' : 'book',
                ];
                $found = false;
                foreach ($promoAds as $index => $existingAd) {
                    if ((string) ($existingAd['id'] ?? '') === $promoId) {
                        $promoAds[$index] = $ad;
                        $found = true;
                        break;
                    }
                }
                if (!$found)
                    $promoAds[] = $ad;
            }
            if ($action === 'promo_save' && (($ad['title'] ?? '') === '' || ($ad['ctaLink'] ?? '') === '')) {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال عنوان الإعلان ورابط الزر.'];
            } elseif (liveFirestoreSet('homepage_content', 'graduation_promo', ['enabled' => $promoEnabled, 'ads' => $promoAds])) {
                $promoDocument = ['enabled' => $promoEnabled, 'ads' => $promoAds];
                log_activity('تحديث مكوّن إعلانات الصفحة الرئيسية GraduationPromo', 'ads');
                $flash = ['type' => 'success', 'msg' => $action === 'promo_delete' ? 'تم حذف بطاقة الإعلان.' : 'تم حفظ مكوّن الإعلان بنجاح.'];
            } else {
                $flash = ['type' => 'error', 'msg' => 'تعذر حفظ مكوّن الإعلان في Firestore.'];
            }
        }

        // 1. إضافة إعلان / تنبيه جديد
        elseif ($action === 'create') {
            $titleAr = trim($_POST['title_ar'] ?? '');
            $titleEn = trim($_POST['title_en'] ?? '');
            $bodyAr = trim($_POST['body_ar'] ?? '');
            $bodyEn = trim($_POST['body_en'] ?? '');
            $nType = $_POST['notice_type'] ?? 'info';
            $targetPath = trim($_POST['target_path'] ?? '');
            $actTextAr = trim($_POST['action_text_ar'] ?? '');
            $actTextEn = trim($_POST['action_text_en'] ?? '');
            $actUrl = trim($_POST['action_url'] ?? '');
            $isMandatory = !empty($_POST['is_mandatory']) ? 1 : 0;
            $isPinned = !empty($_POST['is_pinned']) ? 1 : 0;
            $isActive = !empty($_POST['is_active']) ? 1 : 0;
            $expiresAt = !empty($_POST['expires_at']) ? $_POST['expires_at'] : null;
            $creator = $_SESSION['username'] ?? 'المدير العام';

            if ($titleAr === '' || $bodyAr === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال عنوان ونص الإعلان باللغة العربية على الأقل.'];
            } else {
                $stmt = $db->prepare("INSERT INTO notices 
                    (title_ar, title_en, body_ar, body_en, notice_type, target_path, action_text_ar, action_text_en, action_url, is_mandatory, is_pinned, is_active, expires_at, created_by) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$titleAr, $titleEn, $bodyAr, $bodyEn, $nType, $targetPath, $actTextAr, $actTextEn, $actUrl, $isMandatory, $isPinned, $isActive, $expiresAt, $creator]);
                $newId = $db->lastInsertId();

                log_activity("إضافة إعلان وتنبيه جديد: \"$titleAr\" (#$newId)", 'ads');
                $flash = ['type' => 'success', 'msg' => 'تم نشر الإعلان بنجاح ✅'];
            }
        }

        // 2. تعديل إعلان
        elseif ($action === 'edit') {
            $id = (int) ($_POST['id'] ?? 0);
            $titleAr = trim($_POST['title_ar'] ?? '');
            $titleEn = trim($_POST['title_en'] ?? '');
            $bodyAr = trim($_POST['body_ar'] ?? '');
            $bodyEn = trim($_POST['body_en'] ?? '');
            $nType = $_POST['notice_type'] ?? 'info';
            $targetPath = trim($_POST['target_path'] ?? '');
            $actTextAr = trim($_POST['action_text_ar'] ?? '');
            $actTextEn = trim($_POST['action_text_en'] ?? '');
            $actUrl = trim($_POST['action_url'] ?? '');
            $isMandatory = !empty($_POST['is_mandatory']) ? 1 : 0;
            $isPinned = !empty($_POST['is_pinned']) ? 1 : 0;
            $isActive = !empty($_POST['is_active']) ? 1 : 0;
            $expiresAt = !empty($_POST['expires_at']) ? $_POST['expires_at'] : null;

            if ($titleAr === '' || $bodyAr === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال العنوان والنص بالعربية.'];
            } else {
                $stmt = $db->prepare("UPDATE notices SET 
                    title_ar=?, title_en=?, body_ar=?, body_en=?, notice_type=?, target_path=?, 
                    action_text_ar=?, action_text_en=?, action_url=?, is_mandatory=?, is_pinned=?, 
                    is_active=?, expires_at=?, updated_at=CURRENT_TIMESTAMP 
                    WHERE id=?");
                $stmt->execute([$titleAr, $titleEn, $bodyAr, $bodyEn, $nType, $targetPath, $actTextAr, $actTextEn, $actUrl, $isMandatory, $isPinned, $isActive, $expiresAt, $id]);

                log_activity("تعديل الإعلان #$id (\"$titleAr\")", 'ads');
                $flash = ['type' => 'success', 'msg' => 'تم حفظ تعديلات الإعلان بنجاح ✅'];
            }
        }

        // 3. تبديل حالة التفعيل
        elseif ($action === 'toggle_active') {
            $id = (int) ($_POST['id'] ?? 0);
            $stmt = $db->prepare("UPDATE notices SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$id]);

            $flash = ['type' => 'success', 'msg' => 'تم تحديث حالة تفعيل الإعلان'];
        }

        // 4. حذف إعلان
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            archive_delete('notices', $id, 'حذف إعلان');

            log_activity("حذف الإعلان #$id", 'ads');
            $flash = ['type' => 'success', 'msg' => 'تم حذف الإعلان نهائياً 🗑️'];
        }
    }
}

// الفلاتر
$statusFilter = $_GET['status'] ?? 'all';
$typeFilter = $_GET['type'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($statusFilter === 'active') {
    $where[] = "is_active = 1";
} elseif ($statusFilter === 'inactive') {
    $where[] = "is_active = 0";
} elseif ($statusFilter === 'pinned') {
    $where[] = "is_pinned = 1";
}

if ($typeFilter !== '') {
    $where[] = "notice_type = ?";
    $params[] = $typeFilter;
}
if ($search !== '') {
    $where[] = "(title_ar LIKE ? OR title_en LIKE ? OR body_ar LIKE ? OR body_en LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM notices" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY is_pinned DESC, is_active DESC, created_at DESC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$notices = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
    SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) AS pinned_count,
    SUM(CASE WHEN is_mandatory = 1 THEN 1 ELSE 0 END) AS mandatory_count
FROM notices")->fetch(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<div class="panel-box" style="margin-bottom:24px;border-top:4px solid #0284c7;">
    <div class="panel-box-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div>
            <h3 class="panel-box-title" style="margin:0;">مكوّن الإعلان الرئيسي في الصفحة الرئيسية</h3>
            <div style="font-size:12px;color:#64748b;margin-top:5px;">GraduationPromo — البطاقات المتحركة الظاهرة في
                واجهة الموقع.</div>
        </div>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="promo_toggle">
            <button type="submit" class="btn-outline"
                style="color:<?= $promoEnabled ? '#15803d' : '#b91c1c' ?>;border-color:<?= $promoEnabled ? '#86efac' : '#fecaca' ?>;">
                <?= $promoEnabled ? '✓ المكوّن مفعّل' : '✕ المكوّن متوقف' ?>
            </button>
        </form>
    </div>
    <div class="panel-box-body" style="display:grid;gap:18px;">
        <?php if (!$promoAds): ?>
            <div
                style="padding:14px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;font-size:13px;">
                لا توجد بطاقات مخصصة بعد. أضف أول بطاقة ليتم عرضها في الموقع.</div><?php endif; ?>
        <?php foreach ($promoAds as $promoAd): ?>
            <details style="border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;overflow:hidden;">
                <summary
                    style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;font-weight:800;color:#0f172a;list-style:none;">
                    <span><?= htmlspecialchars($promoAd['badge'] ?? 'بطاقة إعلان') ?> —
                        <?= htmlspecialchars($promoAd['title'] ?? 'بدون عنوان') ?></span>
                    <span style="color:#0284c7;font-size:12px;">فتح / إغلاق</span>
                </summary>
                <form method="post" style="padding:16px;border-top:1px solid #e2e8f0;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="promo_save">
                    <input type="hidden" name="promo_id" value="<?= htmlspecialchars($promoAd['id'] ?? '') ?>">
                    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                        <input class="form-input" name="promo_badge"
                            value="<?= htmlspecialchars($promoAd['badge'] ?? '') ?>" placeholder="الشارة">
                        <select class="form-select" name="promo_type">
                            <option value="book" <?= ($promoAd['type'] ?? '') === 'book' ? 'selected' : '' ?>>إعلان كتاب/خدمة
                            </option>
                            <option value="charity" <?= ($promoAd['type'] ?? '') === 'charity' ? 'selected' : '' ?>>مبادرة/فريق
                            </option>
                        </select>
                        <input class="form-input" name="promo_title"
                            value="<?= htmlspecialchars($promoAd['title'] ?? '') ?>" placeholder="العنوان الرئيسي" required>
                        <input class="form-input" name="promo_highlight"
                            value="<?= htmlspecialchars($promoAd['highlight'] ?? '') ?>" placeholder="الكلمة المميزة">
                        <textarea class="form-input" name="promo_description" rows="2"
                            placeholder="الوصف"><?= htmlspecialchars($promoAd['description'] ?? '') ?></textarea>
                        <textarea class="form-input" name="promo_tasks" rows="2"
                            placeholder="المهام، كل سطر مهمة"><?= htmlspecialchars(implode("\n", $promoAd['tasks'] ?? [])) ?></textarea>
                        <textarea class="form-input" name="promo_quote" rows="2"
                            placeholder="الاقتباس"><?= htmlspecialchars($promoAd['quote'] ?? '') ?></textarea>
                        <input class="form-input" name="promo_phone"
                            value="<?= htmlspecialchars($promoAd['phone'] ?? '') ?>" placeholder="رقم التواصل">
                        <input class="form-input" name="promo_cta_text"
                            value="<?= htmlspecialchars($promoAd['ctaText'] ?? '') ?>" placeholder="نص الزر الرئيسي">
                        <input class="form-input" name="promo_cta_link"
                            value="<?= htmlspecialchars($promoAd['ctaLink'] ?? '') ?>" placeholder="رابط الزر الرئيسي"
                            required>
                        <input class="form-input" name="promo_secondary_text"
                            value="<?= htmlspecialchars($promoAd['secondaryText'] ?? '') ?>" placeholder="نص الزر الثاني">
                        <input class="form-input" name="promo_secondary_link"
                            value="<?= htmlspecialchars($promoAd['secondaryLink'] ?? '') ?>" placeholder="رابط الزر الثاني">
                    </div>
                    <div style="display:flex;gap:8px;margin-top:12px;">
                        <label
                            style="display:flex;align-items:center;gap:6px;margin-left:auto;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;color:#475569;font-size:12px;cursor:pointer;">
                            <input type="checkbox" name="promo_enabled" value="1" <?= ($promoAd['enabled'] ?? true) ? 'checked' : '' ?>> عرض البطاقة
                        </label>
                        <button type="submit" class="btn btn-primary">حفظ التعديل</button>
                        <button type="submit" name="action" value="promo_delete" class="btn-outline"
                            onclick="return confirm('هل تريد حذف بطاقة الإعلان؟');">حذف البطاقة</button>
                    </div>
                </form>
            </details>
        <?php endforeach; ?>
        <details style="border:1px dashed #93c5fd;border-radius:12px;background:#eff6ff;overflow:hidden;">
            <summary style="padding:14px 16px;cursor:pointer;color:#0369a1;font-weight:800;list-style:none;">+ إضافة
                بطاقة إعلان جديدة <span style="float:left;font-size:12px;">فتح / إغلاق</span></summary>
            <form method="post" style="padding:16px;border-top:1px solid #bfdbfe;">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>"><input type="hidden"
                    name="action" value="promo_save">
                <h4 style="margin:0 0 12px;color:#0369a1;">إضافة بطاقة إعلان جديدة</h4>
                <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                    <input class="form-input" name="promo_title" placeholder="العنوان الرئيسي" required><input
                        class="form-input" name="promo_highlight" placeholder="الكلمة المميزة">
                    <input class="form-input" name="promo_badge" placeholder="الشارة"><select class="form-select"
                        name="promo_type">
                        <option value="book">إعلان كتاب/خدمة</option>
                        <option value="charity">مبادرة/فريق</option>
                    </select>
                    <textarea class="form-input" name="promo_description" rows="2"
                        placeholder="الوصف"></textarea><textarea class="form-input" name="promo_tasks" rows="2"
                        placeholder="المهام، كل سطر مهمة"></textarea>
                    <input class="form-input" name="promo_cta_text" placeholder="نص الزر الرئيسي"><input
                        class="form-input" name="promo_cta_link" placeholder="رابط الزر الرئيسي" required>
                    <input class="form-input" name="promo_secondary_text" placeholder="نص الزر الثاني"><input
                        class="form-input" name="promo_secondary_link" placeholder="رابط الزر الثاني">
                </div>
                <label
                    style="display:inline-flex;align-items:center;gap:6px;margin-top:12px;color:#475569;font-size:12px;cursor:pointer;"><input
                        type="checkbox" name="promo_enabled" value="1" checked> عرض البطاقة في الموقع</label>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;">+ إضافة البطاقة</button>
            </form>
        </details>
    </div>
</div>

<!-- بطاقات المؤشرات (KPIs) -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي الإعلانات والتنبيهات</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m3 11 18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">إعلانات مسجلة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إعلانات نشطة الآن في الموقع</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['active_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">تظهر لجميع الزوار</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إعلانات مثبتة في الأعلى</span>
            <div class="stats-icon-box icon-yellow">
                <span style="font-size:18px;">📌</span>
            </div>
        </div>
        <div class="stats-number" style="color: #ca8a04;"><?= number_format($stats['pinned_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>لها أولوية الظهور</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">نوافذ منبثقة إجبارية (Popup)</span>
            <div class="stats-icon-box icon-red">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #b91c1c;"><?= number_format($stats['mandatory_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span>تتطلب تفاعل الزائر</span>
        </div>
    </div>
</div>

<!-- صندوق جدول الإعلانات الرئيسي -->
<div class="panel-box">
    <div class="panel-box-header"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="sidebar-logo" style="width: 32px; height: 32px; font-size: 16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m3 11 18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
            </div>
            <h3 class="panel-box-title" style="margin:0;">قائمة الإعلانات والتنبيهات وشريط الأخبار</h3>
        </div>
        <button type="button" class="btn-primary" onclick="openAddModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إنشاء إعلان جديد
        </button>
    </div>

    <!-- شريط الفلاتر والبحث -->
    <div class="panel-box-body" style="border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 16px 20px;">
        <form method="GET" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث بعنوان الإعلان أو المحتوى..." class="form-input" style="width: 100%;">
            </div>
            <div style="min-width: 140px;">
                <select name="status" class="form-select" onchange="this.form.submit()">
                    <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>كل الحالات</option>
                    <option value="active" <?= $statusFilter === 'active' ? 'selected' : '' ?>>النشطة فقط</option>
                    <option value="inactive" <?= $statusFilter === 'inactive' ? 'selected' : '' ?>>المتوقفة</option>
                    <option value="pinned" <?= $statusFilter === 'pinned' ? 'selected' : '' ?>>المثبتة</option>
                </select>
            </div>
            <div style="min-width: 170px;">
                <select name="type" class="form-select" onchange="this.form.submit()">
                    <option value="">كل أنواع الإعلانات</option>
                    <?php foreach ($noticeTypes as $ntk => $ntv): ?>
                        <option value="<?= $ntk ?>" <?= $typeFilter === $ntk ? 'selected' : '' ?>><?= $ntv['label'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <button type="submit" class="btn-secondary">تصفية</button>
            <?php if ($search !== '' || $statusFilter !== 'all' || $typeFilter !== ''): ?>
                <a href="ads.php" class="btn-outline" style="text-decoration:none;">إلغاء الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>عنوان الإعلان</th>
                    <th>النوع</th>
                    <th>الصفحة المستهدفة</th>
                    <th>نص الإعلان والزر</th>
                    <th style="text-align:center;">إجباري</th>
                    <th style="text-align:center;">الحالة</th>
                    <th>تاريخ الانتهاء</th>
                    <th style="text-align: center; width: 140px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($notices)): ?>
                    <tr>
                        <td colspan="9" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد إعلانات مطابقة للشروط.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($notices as $not):
                    $nType = $noticeTypes[$not['notice_type']] ?? $noticeTypes['info'];
                    ?>
                    <tr style="<?= $not['is_pinned'] ? 'background: #fffbeb;' : '' ?>">
                        <td style="font-family: monospace; color: #94a3b8;">
                            <?php if ($not['is_pinned']): ?>
                                <span title="مثبت في البداية">📌</span>
                            <?php else: ?>
                                #<?= $not['id'] ?>
                            <?php endif; ?>
                        </td>
                        <td>
                            <div style="font-weight: 700; color: #0f172a;"><?= htmlspecialchars($not['title_ar']) ?></div>
                            <?php if (!empty($not['title_en'])): ?>
                                <div style="font-size: 11px; color: #64748b;"><?= htmlspecialchars($not['title_en']) ?></div>
                            <?php endif; ?>
                        </td>
                        <td>
                            <span class="<?= $nType['badge'] ?>" style="font-size:11px;"><?= $nType['label'] ?></span>
                        </td>
                        <td>
                            <span
                                class="badge-faculty"><?= htmlspecialchars($targetPages[$not['target_path']] ?? ($not['target_path'] ?: 'عام')) ?></span>
                        </td>
                        <td style="max-width: 260px;">
                            <div style="font-size: 12px; color: #334155; line-height: 1.3;">
                                <?= nl2br(htmlspecialchars(mb_strimwidth($not['body_ar'], 0, 90, '...'))) ?>
                            </div>
                            <?php if (!empty($not['action_text_ar'])): ?>
                                <div style="font-size: 11px; color: #0284c7; margin-top: 3px; font-weight: 600;">
                                    🔘 زر: <?= htmlspecialchars($not['action_text_ar']) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td style="text-align: center;">
                            <?php if ($not['is_mandatory']): ?>
                                <span class="badge-cancelled" style="font-size:10px;">نعم (Popup)</span>
                            <?php else: ?>
                                <span style="color: #94a3b8; font-size: 11px;">شريط عادي</span>
                            <?php endif; ?>
                        </td>
                        <td style="text-align: center;">
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                <input type="hidden" name="action" value="toggle_active">
                                <input type="hidden" name="id" value="<?= $not['id'] ?>">
                                <button type="submit" class="btn-outline"
                                    style="padding: 4px 8px; font-size: 11px; border-color: <?= $not['is_active'] ? '#bbf7d0' : '#fecaca' ?>; color: <?= $not['is_active'] ? '#15803d' : '#b91c1c' ?>;">
                                    <?= $not['is_active'] ? '✓ نشط' : '✕ متوقف' ?>
                                </button>
                            </form>
                        </td>
                        <td style="color: #64748b; font-size: 11px; white-space: nowrap;">
                            <?= $not['expires_at'] ? date('Y/m/d', strtotime($not['expires_at'])) : '<span style="color:#94a3b8;">دائم</span>' ?>
                        </td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                                <!-- زر التعديل -->
                                <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openEditModal(<?= json_encode($not, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="تعديل">
                                    ✏️
                                </button>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل تريد حذف هذا الإعلان نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $not['id'] ?>">
                                    <button type="submit" class="btn-danger" style="padding: 4px 8px; font-size: 11px;"
                                        title="حذف">
                                        🗑️
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

<!-- Modal: إنشاء إعلان جديد -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 650px;">
        <div class="modal-header">
            <h3>إنشاء إعلان أو تنبيه جديد</h3>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">عنوان الإعلان (بالعربية) *</label>
                        <input type="text" name="title_ar" class="form-input" required
                            placeholder="مثال: بدء استقبال كتب الفصل الجديد">
                    </div>
                    <div>
                        <label class="form-label">العنوان (بالإنجليزي - اختياري)</label>
                        <input type="text" name="title_en" class="form-input" placeholder="Book Exchange Open">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع الإعلان *</label>
                        <select name="notice_type" class="form-select">
                            <?php foreach ($noticeTypes as $ntk => $ntv): ?>
                                <option value="<?= $ntk ?>"><?= $ntv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">الصفحة المستهدفة للظهور</label>
                        <select name="target_path" class="form-select">
                            <?php foreach ($targetPages as $tpPath => $tpLabel): ?>
                                <option value="<?= htmlspecialchars($tpPath) ?>"><?= htmlspecialchars($tpLabel) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">نص ومحتوى الإعلان (بالعربية) *</label>
                    <textarea name="body_ar" class="form-input" rows="3" required
                        placeholder="اكتب تفاصيل الإعلان هنا..."></textarea>
                </div>

                <div>
                    <label class="form-label">المحتوى (بالإنجليزي - اختياري)</label>
                    <textarea name="body_en" class="form-input" rows="2" placeholder="English details..."></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نص الزر (عربي)</label>
                        <input type="text" name="action_text_ar" class="form-input" placeholder="مثال: تصفح الآن">
                    </div>
                    <div>
                        <label class="form-label">نص الزر (إنجليزي)</label>
                        <input type="text" name="action_text_en" class="form-input" placeholder="Browse Now">
                    </div>
                    <div>
                        <label class="form-label">رابط الزر (URL/Path)</label>
                        <input type="text" name="action_url" class="form-input" placeholder="/exchange">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px;">
                    <div>
                        <label class="form-label">تاريخ انتهاء الإعلان</label>
                        <input type="date" name="expires_at" class="form-input">
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center; padding-top: 24px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" name="is_active" value="1" checked>
                            <span>تفعيل الإعلان فوراً</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" name="is_pinned" value="1">
                            <span>تثبيت بالبداية 📌</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" name="is_mandatory" value="1">
                            <span>نافذة منبثقة (Popup)</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">نشر الإعلان</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: تعديل إعلان -->
<div id="editModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 650px;">
        <div class="modal-header">
            <h3>تعديل بيانات الإعلان</h3>
            <button type="button" class="modal-close" onclick="closeEditModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="id" id="edit_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">عنوان الإعلان (بالعربية) *</label>
                        <input type="text" name="title_ar" id="edit_title_ar" class="form-input" required>
                    </div>
                    <div>
                        <label class="form-label">العنوان (بالإنجليزي)</label>
                        <input type="text" name="title_en" id="edit_title_en" class="form-input">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نوع الإعلان *</label>
                        <select name="notice_type" id="edit_notice_type" class="form-select">
                            <?php foreach ($noticeTypes as $ntk => $ntv): ?>
                                <option value="<?= $ntk ?>"><?= $ntv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">الصفحة المستهدفة للظهور</label>
                        <select name="target_path" id="edit_target_path" class="form-select">
                            <?php foreach ($targetPages as $tpPath => $tpLabel): ?>
                                <option value="<?= htmlspecialchars($tpPath) ?>"><?= htmlspecialchars($tpLabel) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div>
                    <label class="form-label">نص ومحتوى الإعلان (بالعربية) *</label>
                    <textarea name="body_ar" id="edit_body_ar" class="form-input" rows="3" required></textarea>
                </div>

                <div>
                    <label class="form-label">المحتوى (بالإنجليزي)</label>
                    <textarea name="body_en" id="edit_body_en" class="form-input" rows="2"></textarea>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">نص الزر (عربي)</label>
                        <input type="text" name="action_text_ar" id="edit_action_text_ar" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">نص الزر (إنجليزي)</label>
                        <input type="text" name="action_text_en" id="edit_action_text_en" class="form-input">
                    </div>
                    <div>
                        <label class="form-label">رابط الزر (URL/Path)</label>
                        <input type="text" name="action_url" id="edit_action_url" class="form-input">
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px;">
                    <div>
                        <label class="form-label">تاريخ الانتهاء</label>
                        <input type="date" name="expires_at" id="edit_expires_at" class="form-input">
                    </div>
                    <div style="display: flex; gap: 16px; align-items: center; padding-top: 24px;">
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" name="is_active" id="edit_is_active" value="1">
                            <span>نشط الآن</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" name="is_pinned" id="edit_is_pinned" value="1">
                            <span>تثبيت بالبداية 📌</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                            <input type="checkbox" name="is_mandatory" id="edit_is_mandatory" value="1">
                            <span>نافذة منبثقة (Popup)</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeEditModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ التعديلات</button>
            </div>
        </form>
    </div>
</div>

<script>
    function openAddModal() { document.getElementById('addModal').style.display = 'flex'; }
    function closeAddModal() { document.getElementById('addModal').style.display = 'none'; }

    function openEditModal(not) {
        document.getElementById('edit_id').value = not.id;
        document.getElementById('edit_title_ar').value = not.title_ar || '';
        document.getElementById('edit_title_en').value = not.title_en || '';
        document.getElementById('edit_notice_type').value = not.notice_type || 'info';
        document.getElementById('edit_target_path').value = not.target_path || '';
        document.getElementById('edit_body_ar').value = not.body_ar || '';
        document.getElementById('edit_body_en').value = not.body_en || '';
        document.getElementById('edit_action_text_ar').value = not.action_text_ar || '';
        document.getElementById('edit_action_text_en').value = not.action_text_en || '';
        document.getElementById('edit_action_url').value = not.action_url || '';
        document.getElementById('edit_expires_at').value = not.expires_at ? not.expires_at.split(' ')[0] : '';
        document.getElementById('edit_is_active').checked = not.is_active == 1;
        document.getElementById('edit_is_pinned').checked = not.is_pinned == 1;
        document.getElementById('edit_is_mandatory').checked = not.is_mandatory == 1;
        document.getElementById('editModal').style.display = 'flex';
    }
    function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
        if (event.target == document.getElementById('editModal')) closeEditModal();
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>