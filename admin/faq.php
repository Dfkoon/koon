<?php
/**
 * admin/faq.php — إدارة الأسئلة الشائعة وقاعدة معرفة المساعد الذكي نشمي
 */
$page_key = 'faq';
$page_title = 'إدارة الأسئلة الشائعة ونشمي';
require_once __DIR__ . '/../config.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();

$categories = [
    'general' => ['label' => '🌐 عام وموقع مكانك', 'badge' => 'badge-role'],
    'registration' => ['label' => '📝 التسجيل والقبول', 'badge' => 'badge-faculty'],
    'plans' => ['label' => '🗺️ الخطط والتخصصات', 'badge' => 'badge-warning'],
    'quizzes' => ['label' => '❓ بنك الأسئلة والكويزات', 'badge' => 'badge-pending'],
    'exchange' => ['label' => '🔄 تبادل الكتب والمواد', 'badge' => 'badge-subtle'],
    'grades' => ['label' => '📊 حساب المعدل والعلامات', 'badge' => 'badge-success'],
    'services' => ['label' => '🚀 الخدمات الطلابية', 'badge' => 'badge-code'],
];

$flash = null;

// معالجة الإجراءات POST
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        // 1. إضافة سؤال شائع جديد
        if ($action === 'create') {
            $cat = $_POST['category'] ?? 'general';
            $qAr = trim($_POST['question_ar'] ?? '');
            $qEn = trim($_POST['question_en'] ?? '');
            $aAr = trim($_POST['answer_ar'] ?? '');
            $aEn = trim($_POST['answer_en'] ?? '');
            $keywords = trim($_POST['keywords'] ?? '');
            $order = (int) ($_POST['sort_order'] ?? 0);
            $isActive = !empty($_POST['is_active']) ? 1 : 0;

            if ($qAr === '' || $aAr === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال السؤال والإجابة باللغة العربية.'];
            } else {
                $stmt = $db->prepare("INSERT INTO faq_entries 
                    (category, question_ar, question_en, answer_ar, answer_en, keywords, sort_order, is_active) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$cat, $qAr, $qEn, $aAr, $aEn, $keywords, $order, $isActive]);
                $newId = $db->lastInsertId();

                log_activity("إضافة سؤال جديد لقاعدة معرفة نشمي: \"$qAr\" (#$newId)", 'faq');
                $flash = ['type' => 'success', 'msg' => 'تمت إضافة السؤال بنجاح لقاعدة معرفة نشمي ✅'];
            }
        }

        // 2. تعديل سؤال
        elseif ($action === 'edit') {
            $id = (int) ($_POST['id'] ?? 0);
            $cat = $_POST['category'] ?? 'general';
            $qAr = trim($_POST['question_ar'] ?? '');
            $qEn = trim($_POST['question_en'] ?? '');
            $aAr = trim($_POST['answer_ar'] ?? '');
            $aEn = trim($_POST['answer_en'] ?? '');
            $keywords = trim($_POST['keywords'] ?? '');
            $order = (int) ($_POST['sort_order'] ?? 0);
            $isActive = !empty($_POST['is_active']) ? 1 : 0;

            if ($qAr === '' || $aAr === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى إدخال السؤال والإجابة بالعربية.'];
            } else {
                $stmt = $db->prepare("UPDATE faq_entries SET 
                    category=?, question_ar=?, question_en=?, answer_ar=?, answer_en=?, 
                    keywords=?, sort_order=?, is_active=?, updated_at=CURRENT_TIMESTAMP 
                    WHERE id=?");
                $stmt->execute([$cat, $qAr, $qEn, $aAr, $aEn, $keywords, $order, $isActive, $id]);

                log_activity("تعديل السؤال الشائع #$id (\"$qAr\")", 'faq');
                $flash = ['type' => 'success', 'msg' => 'تم حفظ التعديلات بنجاح ✅'];
            }
        }

        // 3. تبديل حالة التفعيل
        elseif ($action === 'toggle_active') {
            $id = (int) ($_POST['id'] ?? 0);
            $stmt = $db->prepare("UPDATE faq_entries SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$id]);

            $flash = ['type' => 'success', 'msg' => 'تم تحديث حالة السؤال'];
        }

        // 4. حذف سؤال
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            archive_delete('faq_entries', $id, 'حذف سؤال');

            log_activity("حذف السؤال #$id من قاعدة المعرفة", 'faq');
            $flash = ['type' => 'success', 'msg' => 'تم حذف السؤال نهائياً 🗑️'];
        }
    }
}

// الفلاتر
$catFilter = $_GET['category'] ?? 'all';
$statusFilter = $_GET['status'] ?? 'all';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];

if ($catFilter !== 'all') {
    $where[] = "category = ?";
    $params[] = $catFilter;
}
if ($statusFilter === 'active') {
    $where[] = "is_active = 1";
} elseif ($statusFilter === 'inactive') {
    $where[] = "is_active = 0";
}
if ($search !== '') {
    $where[] = "(question_ar LIKE ? OR question_en LIKE ? OR answer_ar LIKE ? OR answer_en LIKE ? OR keywords LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT * FROM faq_entries" . ($where ? " WHERE " . implode(" AND ", $where) : "") . " ORDER BY sort_order ASC, views_count DESC, id ASC";
$stmt = $db->prepare($sql);
$stmt->execute($params);
$faqs = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_count,
    SUM(views_count) AS total_views
FROM faq_entries")->fetch(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<!-- بطاقات المؤشرات (KPIs) -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي الأسئلة المعتمدة</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">سؤال وجواب</span>
            <span>في قاعدة معرفة نشمي</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">أسئلة نشطة للمحادثة</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #15803d;"><?= number_format($stats['active_count'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">يستخدمها نشمي للإجابة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي المشاهدات والاستعلامات</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #7e22ce;"><?= number_format($stats['total_views'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up">استفسار تم حله</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">أقسام المعرفة</span>
            <div class="stats-icon-box icon-yellow">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color: #ca8a04;"><?= count($categories) ?></div>
        <div class="stats-footer">
            <span>تصنيفات أكاديمية وإدارية</span>
        </div>
    </div>
</div>

<!-- صندوق جدول الأسئلة الرئيسي -->
<div class="panel-box">
    <div class="panel-box-header"
        style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 10px;">
            <div class="sidebar-logo" style="width: 32px; height: 32px; font-size: 16px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            </div>
            <h3 class="panel-box-title" style="margin:0;">قاعدة بيانات الأسئلة الشائعة والمساعد الذكي نشمي</h3>
        </div>
        <button type="button" class="btn-primary" onclick="openAddModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إضافة سؤال وجواب جديد
        </button>
    </div>

    <!-- شريط الفلاتر والبحث -->
    <div class="panel-box-body" style="border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 16px 20px;">
        <form method="GET" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            <div style="flex: 1; min-width: 220px;">
                <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                    placeholder="ابحث في نص السؤال، الإجابة، أو الكلمات المفتاحية..." class="form-input"
                    style="width: 100%;">
            </div>
            <div style="min-width: 170px;">
                <select name="category" class="form-select" onchange="this.form.submit()">
                    <option value="all">جميع الأقسام والتصنيفات</option>
                    <?php foreach ($categories as $ck => $cv): ?>
                        <option value="<?= $ck ?>" <?= $catFilter === $ck ? 'selected' : '' ?>><?= $cv['label'] ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div style="min-width: 130px;">
                <select name="status" class="form-select" onchange="this.form.submit()">
                    <option value="all" <?= $statusFilter === 'all' ? 'selected' : '' ?>>كل الحالات</option>
                    <option value="active" <?= $statusFilter === 'active' ? 'selected' : '' ?>>النشطة فقط</option>
                    <option value="inactive" <?= $statusFilter === 'inactive' ? 'selected' : '' ?>>المتوقفة</option>
                </select>
            </div>
            <button type="submit" class="btn-secondary">تصفية</button>
            <?php if ($search !== '' || $catFilter !== 'all' || $statusFilter !== 'all'): ?>
                <a href="faq.php" class="btn-outline" style="text-decoration:none;">إلغاء الفلتر</a>
            <?php endif; ?>
        </form>
    </div>

    <!-- جدول البيانات -->
    <div class="panel-box-body" style="padding: 0; overflow-x: auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 40px;">#</th>
                    <th>القسم</th>
                    <th>السؤال (عربي / إنجليزي)</th>
                    <th>الإجابة النموذجية</th>
                    <th>الكلمات المفتاحية للذكاء الاصطناعي</th>
                    <th style="text-align:center;">المشاهدات</th>
                    <th style="text-align:center;">الحالة</th>
                    <th style="text-align: center; width: 130px;">إجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($faqs)): ?>
                    <tr>
                        <td colspan="8" style="text-align: center; color: #64748b; padding: 40px;">
                            لا توجد أسئلة شائعة مطابقة للشروط.
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($faqs as $fq):
                    $catInfo = $categories[$fq['category']] ?? ['label' => $fq['category'], 'badge' => 'badge-subtle'];
                    ?>
                    <tr>
                        <td style="font-family: monospace; color: #94a3b8;">#<?= $fq['id'] ?></td>
                        <td>
                            <span class="<?= $catInfo['badge'] ?>" style="font-size:11px;"><?= $catInfo['label'] ?></span>
                        </td>
                        <td style="max-width: 240px;">
                            <div style="font-weight: 700; color: #0f172a;"><?= htmlspecialchars($fq['question_ar']) ?></div>
                            <?php if (!empty($fq['question_en'])): ?>
                                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                                    <?= htmlspecialchars($fq['question_en']) ?></div>
                            <?php endif; ?>
                        </td>
                        <td style="max-width: 300px;">
                            <div style="font-size: 12px; color: #334155; line-height: 1.4;">
                                <?= nl2br(htmlspecialchars(mb_strimwidth($fq['answer_ar'], 0, 110, '...'))) ?>
                            </div>
                            <?php if (!empty($fq['answer_en'])): ?>
                                <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                                    <?= htmlspecialchars(mb_strimwidth($fq['answer_en'], 0, 60, '...')) ?>
                                </div>
                            <?php endif; ?>
                        </td>
                        <td style="max-width: 180px;">
                            <?php if (!empty($fq['keywords'])): ?>
                                <div
                                    style="font-size: 11px; color: #0284c7; background: #f0f9ff; padding: 4px 6px; border-radius: 4px;">
                                    🔍 <?= htmlspecialchars($fq['keywords']) ?>
                                </div>
                            <?php else: ?>
                                <span style="color: #94a3b8; font-size: 11px;">تلقائي</span>
                            <?php endif; ?>
                        </td>
                        <td style="text-align: center; font-weight: 600; color: #475569;">
                            <?= number_format($fq['views_count']) ?>
                        </td>
                        <td style="text-align: center;">
                            <form method="POST" style="display:inline;">
                                <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                <input type="hidden" name="action" value="toggle_active">
                                <input type="hidden" name="id" value="<?= $fq['id'] ?>">
                                <button type="submit" class="btn-outline"
                                    style="padding: 4px 8px; font-size: 11px; border-color: <?= $fq['is_active'] ? '#bbf7d0' : '#fecaca' ?>; color: <?= $fq['is_active'] ? '#15803d' : '#b91c1c' ?>;">
                                    <?= $fq['is_active'] ? '✓ نشط' : '✕ متوقف' ?>
                                </button>
                            </form>
                        </td>
                        <td style="text-align: center;">
                            <div style="display: flex; gap: 4px; justify-content: center;">
                                <!-- زر التعديل -->
                                <button type="button" class="btn-secondary" style="padding: 4px 8px; font-size: 11px;"
                                    onclick='openEditModal(<?= json_encode($fq, JSON_HEX_APOS | JSON_HEX_QUOT) ?>)'
                                    title="تعديل">
                                    ✏️
                                </button>

                                <!-- زر الحذف -->
                                <form method="POST" style="display:inline;"
                                    onsubmit="return confirm('هل تريد حذف هذا السؤال نهائياً؟');">
                                    <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
                                    <input type="hidden" name="action" value="delete">
                                    <input type="hidden" name="id" value="<?= $fq['id'] ?>">
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

<!-- Modal: إضافة سؤال جديد -->
<div id="addModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 650px;">
        <div class="modal-header">
            <h3>إضافة سؤال جديد لقاعدة معرفة نشمي</h3>
            <button type="button" class="modal-close" onclick="closeAddModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">القسم / التصنيف *</label>
                        <select name="category" class="form-select">
                            <?php foreach ($categories as $ck => $cv): ?>
                                <option value="<?= $ck ?>"><?= $cv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">ترتيب العرض</label>
                        <input type="number" name="sort_order" class="form-input" value="10">
                    </div>
                </div>

                <div>
                    <label class="form-label">نص السؤال (بالعربية) *</label>
                    <input type="text" name="question_ar" class="form-input" required
                        placeholder="مثال: كيف يمكنني حساب المعدل الفصلي والتراكمي؟">
                </div>

                <div>
                    <label class="form-label">نص السؤال (بالإنجليزي - اختياري)</label>
                    <input type="text" name="question_en" class="form-input" placeholder="How to calculate GPA?">
                </div>

                <div>
                    <label class="form-label">الإجابة النموذجية الشاملة (بالعربية) *</label>
                    <textarea name="answer_ar" class="form-input" rows="4" required
                        placeholder="اكتب الإجابة المفصلة التي سيستخدمها نشمي..."></textarea>
                </div>

                <div>
                    <label class="form-label">الإجابة (بالإنجليزي - اختياري)</label>
                    <textarea name="answer_en" class="form-input" rows="2" placeholder="English Answer..."></textarea>
                </div>

                <div>
                    <label class="form-label">الكلمات المفتاحية ومرادفات البحث (مفصولة بفواصل)</label>
                    <input type="text" name="keywords" class="form-input" placeholder="معدل, GPA, حساب, علامات, نقاط">
                </div>

                <div style="padding-top: 4px;">
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" name="is_active" value="1" checked>
                        <span>تفعيل السؤال فوراً وإتاحته للطلاب والمساعد نشمي</span>
                    </label>
                </div>
            </div>

            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeAddModal()">إلغاء</button>
                <button type="submit" class="btn-primary">حفظ ونشر السؤال</button>
            </div>
        </form>
    </div>
</div>

<!-- Modal: تعديل سؤال -->
<div id="editModal" class="modal-overlay" style="display:none;">
    <div class="modal-box" style="max-width: 650px;">
        <div class="modal-header">
            <h3>تعديل بيانات السؤال</h3>
            <button type="button" class="modal-close" onclick="closeEditModal()">×</button>
        </div>
        <form method="POST">
            <input type="hidden" name="csrf" value="<?= csrf_token() ?>">
            <input type="hidden" name="action" value="edit">
            <input type="hidden" name="id" id="edit_id">

            <div class="modal-body" style="display: flex; flex-direction: column; gap: 14px;">
                <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
                    <div>
                        <label class="form-label">القسم / التصنيف *</label>
                        <select name="category" id="edit_category" class="form-select">
                            <?php foreach ($categories as $ck => $cv): ?>
                                <option value="<?= $ck ?>"><?= $cv['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div>
                        <label class="form-label">ترتيب العرض</label>
                        <input type="number" name="sort_order" id="edit_sort_order" class="form-input">
                    </div>
                </div>

                <div>
                    <label class="form-label">نص السؤال (بالعربية) *</label>
                    <input type="text" name="question_ar" id="edit_question_ar" class="form-input" required>
                </div>

                <div>
                    <label class="form-label">نص السؤال (بالإنجليزي)</label>
                    <input type="text" name="question_en" id="edit_question_en" class="form-input">
                </div>

                <div>
                    <label class="form-label">الإجابة النموذجية (بالعربية) *</label>
                    <textarea name="answer_ar" id="edit_answer_ar" class="form-input" rows="4" required></textarea>
                </div>

                <div>
                    <label class="form-label">الإجابة (بالإنجليزي)</label>
                    <textarea name="answer_en" id="edit_answer_en" class="form-input" rows="2"></textarea>
                </div>

                <div>
                    <label class="form-label">الكلمات المفتاحية ومرادفات البحث</label>
                    <input type="text" name="keywords" id="edit_keywords" class="form-input">
                </div>

                <div style="padding-top: 4px;">
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                        <input type="checkbox" name="is_active" id="edit_is_active" value="1">
                        <span>نشط ومتاح للبحث</span>
                    </label>
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

    function openEditModal(fq) {
        document.getElementById('edit_id').value = fq.id;
        document.getElementById('edit_category').value = fq.category || 'general';
        document.getElementById('edit_sort_order').value = fq.sort_order || 0;
        document.getElementById('edit_question_ar').value = fq.question_ar || '';
        document.getElementById('edit_question_en').value = fq.question_en || '';
        document.getElementById('edit_answer_ar').value = fq.answer_ar || '';
        document.getElementById('edit_answer_en').value = fq.answer_en || '';
        document.getElementById('edit_keywords').value = fq.keywords || '';
        document.getElementById('edit_is_active').checked = fq.is_active == 1;
        document.getElementById('editModal').style.display = 'flex';
    }
    function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

    window.onclick = function (event) {
        if (event.target == document.getElementById('addModal')) closeAddModal();
        if (event.target == document.getElementById('editModal')) closeEditModal();
    }
</script>

<?php require __DIR__ . '/_footer.php'; ?>