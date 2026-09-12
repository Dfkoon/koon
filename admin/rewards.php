<?php
/**
 * admin/rewards.php — نظام نقاط، إنجازات، ومكافآت المنسقين التنافسي (Leaderboard & Rewards)
 */
$page_key   = 'rewards';
$page_title = 'النقاط والمكافآت';
require_once __DIR__ . '/../config.php';
if (empty($_SESSION['authenticated'])) { redirect('../login.php'); }
$db = get_db();

$userId = (int)($_SESSION['user_id'] ?? 0);
$userStmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$userStmt->execute([$userId]);
$currentUser = $userStmt->fetch(PDO::FETCH_ASSOC) ?: [];

$isAdmin = (($currentUser['role'] ?? '') === 'admin' || ($currentUser['role'] ?? '') === 'super_admin' || $userId === 1 || ($currentUser['username'] ?? '') === 'HUSSIEN');

// معرف المنسق المرتبط بحساب المستخدم الحالي (إن وجد)
$coordStmt = $db->prepare('SELECT * FROM coordinators WHERE user_id = ?');
$coordStmt->execute([$userId]);
$myCoord = $coordStmt->fetch(PDO::FETCH_ASSOC);
$myCoordId = $myCoord ? (int)$myCoord['id'] : 0;

/* ================================================================
   معالجة POST
   ================================================================ */
$flash = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني CSRF'];
    } else {
        $action = $_POST['action'] ?? '';

        // ───── 1. منح نقاط تشجيعية / تعديل رصيد من قبل المدير ─────
        if ($action === 'grant_points' && $isAdmin) {
            $targetCoordId = (int)$_POST['coordinator_id'];
            $pointsAmount  = (int)$_POST['points_amount'];
            $reason        = trim($_POST['reason'] ?? 'مكافأة تقديرية من إدارة المنصة');

            if ($targetCoordId > 0 && $pointsAmount != 0) {
                $actionType = ($pointsAmount > 0) ? 'admin_grant' : 'admin_deduct';
                add_coordinator_points($targetCoordId, $pointsAmount, $reason, $actionType, null, $currentUser['username'] ?? 'المدير');
                log_activity("منح نقاط للمنسق ID $targetCoordId بمقدار $pointsAmount نقطة: $reason", 'rewards');
                $flash = ['type' => 'success', 'msg' => "تم تحديث رصيد النقاط بنجاح ($pointsAmount نقطة) 🪙"];
            } else {
                $flash = ['type' => 'error', 'msg' => 'يرجى اختيار المنسق وتحديد عدد النقاط'];
            }
        }

        // ───── 1.1 ضبط رصيد النقاط مباشرة من قبل المدير ─────
        elseif ($action === 'adjust_points' && $isAdmin) {
            $targetCoordId = (int) ($_POST['coordinator_id'] ?? 0);
            $newPoints = max(0, (int) ($_POST['new_points'] ?? 0));
            $reason = trim($_POST['reason'] ?? '');

            $coordStmt = $db->prepare('SELECT points FROM coordinators WHERE id = ?');
            $coordStmt->execute([$targetCoordId]);
            $currentPoints = $coordStmt->fetchColumn();

            if ($currentPoints === false || $reason === '') {
                $flash = ['type' => 'error', 'msg' => 'يرجى اختيار المنسق وإدخال الرصيد الجديد وسبب التعديل'];
            } elseif ((int) $currentPoints === $newPoints) {
                $flash = ['type' => 'error', 'msg' => 'الرصيد الجديد مطابق للرصيد الحالي'];
            } else {
                $change = $newPoints - (int) $currentPoints;
                add_coordinator_points($targetCoordId, $change, $reason, 'admin_adjust', null, $currentUser['username'] ?? 'المدير');
                log_activity("ضبط رصيد نقاط المنسق ID $targetCoordId إلى $newPoints نقطة: $reason", 'rewards');
                $flash = ['type' => 'success', 'msg' => 'تم ضبط رصيد النقاط بنجاح'];
            }
        }

        // ───── 2. إضافة مكافأة جديدة للمتجر (Admin) ─────
        elseif ($action === 'create_reward' && $isAdmin) {
            $title       = trim($_POST['title'] ?? '');
            $desc        = trim($_POST['description'] ?? '');
            $costPoints  = (int)($_POST['cost_points'] ?? 100);
            $icon        = trim($_POST['icon'] ?? '🎁');
            $category    = $_POST['category'] ?? 'certificate';
            $stock       = (int)($_POST['stock'] ?? -1);

            if ($title && $costPoints > 0) {
                $stmt = $db->prepare("INSERT INTO rewards (title, description, cost_points, icon, category, stock, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)");
                $stmt->execute([$title, $desc, $costPoints, $icon, $category, $stock]);
                log_activity("أضاف مكافأة جديدة لمتجر المنسقين: $title", 'rewards');
                $flash = ['type' => 'success', 'msg' => 'تمت إضافة المكافأة إلى المتجر بنجاح 🎁'];
            }
        }

        // ───── 3. تعديل مكافأة في المتجر (Admin) ─────
        elseif ($action === 'edit_reward' && $isAdmin) {
            $rewardId   = (int)$_POST['reward_id'];
            $title      = trim($_POST['title'] ?? '');
            $desc       = trim($_POST['description'] ?? '');
            $costPoints = (int)($_POST['cost_points'] ?? 100);
            $icon       = trim($_POST['icon'] ?? '🎁');
            $category   = $_POST['category'] ?? 'certificate';
            $stock      = (int)($_POST['stock'] ?? -1);
            $isActive   = isset($_POST['is_active']) ? 1 : 0;

            if ($rewardId > 0 && $title) {
                $stmt = $db->prepare("UPDATE rewards SET title = ?, description = ?, cost_points = ?, icon = ?, category = ?, stock = ?, is_active = ? WHERE id = ?");
                $stmt->execute([$title, $desc, $costPoints, $icon, $category, $stock, $isActive, $rewardId]);
                log_activity("عدل المكافأة ID $rewardId: $title", 'rewards');
                $flash = ['type' => 'success', 'msg' => 'تم حفظ تعديلات المكافأة بنجاح ✅'];
            }
        }

        // ───── 4. حذف مكافأة (Admin) ─────
        elseif ($action === 'delete_reward' && $isAdmin) {
            $rewardId = (int)$_POST['reward_id'];
            $db->prepare("DELETE FROM rewards WHERE id = ?")->execute([$rewardId]);
            log_activity("حذف المكافأة ID $rewardId", 'rewards');
            $flash = ['type' => 'success', 'msg' => 'تم حذف المكافأة من المتجر'];
        }

        // ───── 5. طلب استبدال مكافأة من قبل المنسق ─────
        elseif ($action === 'redeem_reward') {
            $rewardId = (int)$_POST['reward_id'];
            $coordToRedeemId = $myCoordId;

            // إذا كان آدمن يطلب بالنيابة عن منسق
            if ($isAdmin && !empty($_POST['manual_coord_id'])) {
                $coordToRedeemId = (int)$_POST['manual_coord_id'];
            }

            $cStmt = $db->prepare("SELECT * FROM coordinators WHERE id = ?");
            $cStmt->execute([$coordToRedeemId]);
            $cData = $cStmt->fetch(PDO::FETCH_ASSOC);

            $rStmt = $db->prepare("SELECT * FROM rewards WHERE id = ? AND is_active = 1");
            $rStmt->execute([$rewardId]);
            $rData = $rStmt->fetch(PDO::FETCH_ASSOC);

            if (!$cData) {
                $flash = ['type' => 'error', 'msg' => 'لم يتم العثور على ملف المنسق'];
            } elseif (!$rData) {
                $flash = ['type' => 'error', 'msg' => 'المكافأة غير متوفرة أو تم إيقافها'];
            } elseif ($rData['stock'] == 0) {
                $flash = ['type' => 'error', 'msg' => 'نفدت الكمية المتاحة من هذه المكافأة حالياً'];
            } elseif ($cData['points'] < $rData['cost_points']) {
                $flash = ['type' => 'error', 'msg' => "عذراً، رصيد نقاطك ({$cData['points']}) لا يكفي لاستبدال هذه المكافأة ({$rData['cost_points']} نقطة)"];
            } else {
                // خصم النقاط وتسجيل الطلب
                $cost = (int)$rData['cost_points'];
                add_coordinator_points($coordToRedeemId, -$cost, "طلب استبدال مكافأة: {$rData['title']}", 'reward_redemption', null, $currentUser['username'] ?? 'المنسق');

                $insStmt = $db->prepare("INSERT INTO reward_redemptions (coordinator_id, reward_id, points_spent, status, created_at) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)");
                $insStmt->execute([$coordToRedeemId, $rewardId, $cost]);

                if ($rData['stock'] > 0) {
                    $db->prepare("UPDATE rewards SET stock = stock - 1 WHERE id = ?")->execute([$rewardId]);
                }

                log_activity("طلب استبدال المكافأة {$rData['title']} للمنسق {$cData['name']}", 'rewards');
                $flash = ['type' => 'success', 'msg' => "تهانينا! تم إرسال طلب استبدال المكافأة ({$rData['title']}) بنجاح وخصم {$cost} نقطة. ستتم مراجعتها من الإدارة 🎉"];
            }
        }

        // ───── 6. اعتماد أو رفض طلب الاستبدال (Admin) ─────
        elseif ($action === 'process_redemption' && $isAdmin) {
            $redemptionId = (int)$_POST['redemption_id'];
            $newStatus    = $_POST['status']; // 'approved' or 'rejected'
            $adminNotes   = trim($_POST['admin_notes'] ?? '');

            $rdStmt = $db->prepare("SELECT rd.*, r.title AS reward_title, c.name AS coord_name FROM reward_redemptions rd JOIN rewards r ON rd.reward_id = r.id JOIN coordinators c ON rd.coordinator_id = c.id WHERE rd.id = ?");
            $rdStmt->execute([$redemptionId]);
            $redemption = $rdStmt->fetch(PDO::FETCH_ASSOC);

            if ($redemption && $redemption['status'] === 'pending') {
                if ($newStatus === 'rejected') {
                    // إعادة النقاط للمنسق عند الرفض
                    add_coordinator_points($redemption['coordinator_id'], (int)$redemption['points_spent'], "إعادة نقاط لرفض طلب المكافأة: {$redemption['reward_title']}", 'admin_grant', null, $currentUser['username'] ?? 'المدير');
                }

                $db->prepare("UPDATE reward_redemptions SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
                   ->execute([$newStatus, $adminNotes, $redemptionId]);

                log_activity("قام بمعالجة طلب مكافأة ID $redemptionId بالحالة $newStatus", 'rewards');
                $flash = ['type' => 'success', 'msg' => ($newStatus === 'approved' ? 'تم اعتماد وتسليم المكافأة بنجاح 🏆' : 'تم رفض الطلب وإعادة النقاط للمنسق')];
            }
        }
    }
}

/* ================================================================
   جلب البيانات والترتيب
   ================================================================ */
$tabFilter = $_GET['tab'] ?? 'leaderboard';
$search    = trim($_GET['q'] ?? '');

// قائمة المنسقين مع الترتيب حسب النقاط التراكمية (Leaderboard)
$coordsList = $db->query("
    SELECT c.*, u.username, u.email,
           (SELECT COUNT(*) FROM coordinator_tasks WHERE claimed_by_coord_id = c.id AND status = 'completed') AS verified_completed_tasks
    FROM coordinators c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.is_active = 1
    ORDER BY c.lifetime_points DESC, c.tasks_completed DESC, c.name ASC
")->fetchAll(PDO::FETCH_ASSOC);

// قائمة المكافآت في المتجر
$rewardsList = $db->query("SELECT * FROM rewards ORDER BY is_active DESC, cost_points ASC")->fetchAll(PDO::FETCH_ASSOC);

// سجل طلبات الاستبدال
$redemptionsWhere = []; $redemptionsParams = [];
if (!$isAdmin && $myCoordId > 0) {
    $redemptionsWhere[] = "rd.coordinator_id = ?";
    $redemptionsParams[] = $myCoordId;
}
$redemptionsSql = "
    SELECT rd.*, r.title AS reward_title, r.icon AS reward_icon, r.category AS reward_category,
           c.name AS coord_name, c.faculty AS coord_faculty, c.phone AS coord_phone
    FROM reward_redemptions rd
    JOIN rewards r ON rd.reward_id = r.id
    JOIN coordinators c ON rd.coordinator_id = c.id
" . ($redemptionsWhere ? " WHERE " . implode(" AND ", $redemptionsWhere) : "") . " ORDER BY rd.created_at DESC";
$redemptionsStmt = $db->prepare($redemptionsSql);
$redemptionsStmt->execute($redemptionsParams);
$redemptionsList = $redemptionsStmt->fetchAll(PDO::FETCH_ASSOC);

// سجل حركات النقاط التفصيلي
$ledgerWhere = []; $ledgerParams = [];
if (!$isAdmin && $myCoordId > 0) {
    $ledgerWhere[] = "pt.coordinator_id = ?";
    $ledgerParams[] = $myCoordId;
}
if ($search) {
    $ledgerWhere[] = "(c.name LIKE ? OR pt.reason LIKE ?)";
    $ledgerParams[] = "%$search%";
    $ledgerParams[] = "%$search%";
}
$ledgerSql = "
    SELECT pt.*, c.name AS coord_name, c.faculty AS coord_faculty
    FROM points_transactions pt
    JOIN coordinators c ON pt.coordinator_id = c.id
" . ($ledgerWhere ? " WHERE " . implode(" AND ", $ledgerWhere) : "") . " ORDER BY pt.created_at DESC LIMIT 100";
$ledgerStmt = $db->prepare($ledgerSql);
$ledgerStmt->execute($ledgerParams);
$ledgerList = $ledgerStmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات عامة
$stats = $db->query("SELECT 
    SUM(lifetime_points) AS total_lifetime_points,
    SUM(points) AS total_current_points,
    COUNT(*) AS total_coordinators
    FROM coordinators WHERE is_active = 1")->fetch(PDO::FETCH_ASSOC);

$pendingRedemptionsCount = (int)$db->query("SELECT COUNT(*) FROM reward_redemptions WHERE status = 'pending'")->fetchColumn();

// رتبة ومعلومات المنسق الحالي
$myRank = 0;
if ($myCoordId > 0) {
    foreach ($coordsList as $index => $c) {
        if ($c['id'] == $myCoordId) {
            $myRank = $index + 1;
            $myCoordData = $c;
            break;
        }
    }
}
$myBadge = get_coordinator_badge_level((int)($myCoordData['lifetime_points'] ?? 0));

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
<div style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type']==='success'?'#dcfce7':'#fee2e2' ?>;color:<?= $flash['type']==='success'?'#15803d':'#b91c1c' ?>;border:1px solid <?= $flash['type']==='success'?'#bbf7d0':'#fecaca' ?>;">
    <?= htmlspecialchars($flash['msg']) ?>
</div>
<?php endif; ?>

<!-- ================================================================
     بطاقة إنجازاتي ورتبتي الشخصية (My Gamification Hero Banner)
     ================================================================ -->
<?php if ($myCoordId > 0): ?>
<div style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%);color:#fff;border-radius:16px;padding:22px 26px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);position:relative;overflow:hidden;">
    
    <!-- خلفية زخرفية -->
    <div style="position:absolute;left:-20px;bottom:-30px;font-size:120px;opacity:0.05;pointer-events:none;">🏆</div>

    <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#eab308,#ca8a04);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 0 0 4px rgba(234,179,8,0.2);">
            <?= $myBadge['icon'] ?>
        </div>
        <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <h3 style="margin:0;font-size:18px;font-weight:900;color:#fff;font-family:'Cairo',sans-serif;"><?= htmlspecialchars($myCoordData['name']) ?></h3>
                <span style="background:<?= $myBadge['bg'] ?>;color:<?= $myBadge['color'] ?>;padding:2px 10px;border-radius:12px;font-size:11.5px;font-weight:900;">
                    <?= $myBadge['label'] ?>
                </span>
            </div>
            <div style="font-size:12.5px;color:#94a3b8;">
                <span>🏛️ <?= htmlspecialchars($myCoordData['faculty']) ?></span>
                <span style="margin:0 6px;">·</span>
                <span>المركز في لوحة الصدارة: <strong style="color:#fde047;">#<?= $myRank ?></strong> على مستوى الجامعة</span>
            </div>
        </div>
    </div>

    <!-- مؤشرات الرصيد والنقاط -->
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">
        <div style="text-align:center;background:rgba(255,255,255,0.06);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:11.5px;color:#cbd5e1;margin-bottom:2px;">الرصيد المتاح للاستبدال</div>
            <div style="font-size:22px;font-weight:900;color:#38bdf8;">🪙 <?= number_format($myCoordData['points']) ?> <span style="font-size:13px;font-weight:700;">نقطة</span></div>
        </div>

        <div style="text-align:center;background:rgba(255,255,255,0.06);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:11.5px;color:#cbd5e1;margin-bottom:2px;">النقاط التراكمية التاريخية</div>
            <div style="font-size:22px;font-weight:900;color:#facc15;">⭐ <?= number_format($myCoordData['lifetime_points']) ?></div>
        </div>

        <div style="text-align:center;background:rgba(255,255,255,0.06);padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:11.5px;color:#cbd5e1;margin-bottom:2px;">المهام المنجزة</div>
            <div style="font-size:22px;font-weight:900;color:#4ade80;">✅ <?= number_format($myCoordData['tasks_completed']) ?></div>
        </div>
    </div>

    <!-- شريط التقدم نحو الرتبة التالية -->
    <?php if ($myBadge['next_points']): ?>
    <div style="width:100%;margin-top:6px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08);">
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#cbd5e1;margin-bottom:6px;">
            <span>التقدم نحو الترقية للرتبة القادمة</span>
            <span><?= $myCoordData['lifetime_points'] ?> / <?= $myBadge['next_points'] ?> نقطة (تبقى <?= $myBadge['next_points'] - $myCoordData['lifetime_points'] ?> نقطة)</span>
        </div>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:6px;overflow:hidden;">
            <div style="width:<?= $myBadge['progress'] ?>%;height:100%;background:linear-gradient(90deg,#38bdf8,#818cf8);border-radius:6px;"></div>
        </div>
    </div>
    <?php endif; ?>

</div>
<?php endif; ?>

<!-- ================================================================
     KPI بطاقات المؤشرات الرقمية
     ================================================================ -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي نقاط المنصة</span>
            <div class="stats-icon-box icon-gold">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 9.5a3.5 3.5 0 1 0-7 0 3.5 3.5 0 1 0 7 0Z"/></svg>
            </div>
        </div>
        <div class="stats-number" style="color:#d97706;"><?= number_format($stats['total_lifetime_points'] ?? 0) ?></div>
        <div class="stats-footer">
            <span class="trend-up"><?= number_format($stats['total_current_points'] ?? 0) ?></span>
            <span>رصيد نشط حالي</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">المنسقون المشاركون</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total_coordinators'] ?? 0) ?></div>
        <div class="stats-footer">
            <span style="color:#0284c7;font-weight:700;">فريق الكليات</span>
            <span>يتنافسون بالإنجاز</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">المكافآت والشهادات</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
            </div>
        </div>
        <div class="stats-number" style="color:#7c3aed;"><?= count($rewardsList) ?></div>
        <div class="stats-footer">
            <span style="color:#7c3aed;font-weight:700;">متوفرة بالمتجر</span>
            <span>شهادات ودروع وتكريم</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">طلبات التكريم المعلقة</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
        </div>
        <div class="stats-number" style="color:<?= $pendingRedemptionsCount>0?'#ea580c':'#16a34a' ?>;"><?= $pendingRedemptionsCount ?></div>
        <div class="stats-footer">
            <span style="color:<?= $pendingRedemptionsCount>0?'#ea580c':'#16a34a' ?>;font-weight:700;">طلبات استبدال</span>
            <span>بانتظار الاعتماد</span>
        </div>
    </div>
</div>

<!-- ================================================================
     التبويبات + أزرار الإجراءات
     ================================================================ -->
<div class="tabs-header-wrapper">
    <nav class="tabs-nav">
        <a href="?tab=leaderboard"  class="tab-btn <?= $tabFilter==='leaderboard'?'active':'' ?>">لوحة الشرف والصدارة</a>
        <a href="?tab=store"        class="tab-btn <?= $tabFilter==='store'?'active':'' ?>">متجر المكافآت والشهادات (<?= count($rewardsList) ?>)</a>
        <a href="?tab=redemptions"   class="tab-btn <?= $tabFilter==='redemptions'?'active':'' ?>">
            طلبات الاستبدال والتكريم 
            <?php if ($pendingRedemptionsCount > 0): ?>
                <span style="background:#ea580c;color:#fff;padding:1px 7px;border-radius:10px;font-size:11px;"><?= $pendingRedemptionsCount ?></span>
            <?php endif; ?>
        </a>
        <a href="?tab=ledger"       class="tab-btn <?= $tabFilter==='ledger'?'active':'' ?>">سجل حركات النقاط</a>
    </nav>
    <div class="tabs-actions">
        <?php if ($isAdmin): ?>
        <button class="btn btn-secondary" onclick="openModal('grantPointsModal')" style="background:#eff6ff;color:#0284c7;border-color:#bfdbfe;">
            منح نقاط تشجيعية
        </button>
        <button class="btn btn-primary" onclick="openModal('addRewardModal')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            إضافة مكافأة جديدة
        </button>
        <?php endif; ?>
    </div>
</div>

<!-- ================================================================
     محتوى التبويب 1: لوحة الصدارة والتنافس (Leaderboard)
     ================================================================ -->
<?php if ($tabFilter === 'leaderboard'): ?>
<div class="panel-box" style="padding:0;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
        <div>
            <h4 style="margin:0 0 2px;font-size:15px;font-weight:800;color:#0f172a;">الترتيب العام لمنسقي الكليات</h4>
            <p style="margin:0;font-size:12px;color:#64748b;">يتم تحديث الرتب والنقاط تلقائياً فور إنجاز كل مهمة أو تكليف</p>
        </div>
        <div style="font-size:12px;color:#0284c7;font-weight:700;">
            المستوى الذهبي: 250+ | البلاتيني: 500+ | الماسي: 1000+
        </div>
    </div>

    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width:60px;text-align:center;">الترتيب</th>
                    <th>المنسق</th>
                    <th>الكلية</th>
                    <th>الرتبة والأوسمة</th>
                    <th>النقاط المتاحة</th>
                    <th>النقاط التراكمية</th>
                    <th>المهام المنجزة</th>
                    <?php if ($isAdmin): ?><th style="text-align:center;">إجراء الإدارة</th><?php endif; ?>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($coordsList as $idx => $c): 
                    $rank = $idx + 1;
                    $badge = get_coordinator_badge_level((int)$c['lifetime_points']);
                    $isTop1 = ($rank === 1);
                    $isTop2 = ($rank === 2);
                    $isTop3 = ($rank === 3);
                ?>
                <tr style="background:<?= $c['id']==$myCoordId ? '#f0fdf4' : ($isTop1 ? '#fffbeb' : '') ?>;">
                    
                    <!-- الترتيب والوسام -->
                    <td style="text-align:center;">
                        <?php if ($isTop1): ?>
                            <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#fef08a;color:#854d0e;font-weight:900;font-size:15px;">1</span>
                        <?php elseif ($isTop2): ?>
                            <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#e2e8f0;color:#334155;font-weight:900;font-size:14px;">2</span>
                        <?php elseif ($isTop3): ?>
                            <span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#ffedd5;color:#9a3412;font-weight:900;font-size:14px;">3</span>
                        <?php else: ?>
                            <span style="color:#64748b;font-weight:800;font-size:13px;">#<?= $rank ?></span>
                        <?php endif; ?>
                    </td>

                    <!-- اسم المنسق -->
                    <td>
                        <div style="display:flex;align-items:center;gap:10px;">
                            <div style="width:34px;height:34px;border-radius:50%;background:<?= $isTop1?'#eab308':'#0284c7' ?>;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;">
                                <?= mb_substr($c['name'], 0, 1, 'UTF-8') ?>
                            </div>
                            <div>
                                <div style="font-weight:800;color:#0f172a;">
                                    <?= htmlspecialchars($c['name']) ?>
                                    <?php if ($c['id'] == $myCoordId): ?><span style="background:#bbf7d0;color:#166534;font-size:10.5px;padding:1px 6px;border-radius:6px;margin-right:4px;">حسابك</span><?php endif; ?>
                                </div>
                                <div style="font-size:11px;color:#64748b;font-family:'IBM Plex Mono',monospace;"><?= htmlspecialchars($c['username'] ?? '') ?></div>
                            </div>
                        </div>
                    </td>

                    <!-- الكلية -->
                    <td>
                        <span style="font-size:12.5px;color:#334155;font-weight:700;"><?= htmlspecialchars($c['faculty']) ?></span>
                    </td>

                    <!-- الرتبة -->
                    <td>
                        <span style="background:<?= $badge['bg'] ?>;color:<?= $badge['color'] ?>;padding:3px 10px;border-radius:12px;font-size:11.5px;font-weight:800;border:1px solid rgba(0,0,0,0.05);display:inline-flex;align-items:center;gap:4px;">
                            <span><?= $badge['label'] ?></span>
                        </span>
                    </td>

                    <!-- النقاط المتاحة -->
                    <td>
                        <strong style="color:#0284c7;font-size:14px;"><?= number_format($c['points']) ?> نقطة</strong>
                    </td>

                    <!-- النقاط التراكمية -->
                    <td>
                        <strong style="color:#d97706;font-size:14px;"><?= number_format($c['lifetime_points']) ?> نقطة</strong>
                    </td>

                    <!-- المهام المنجزة -->
                    <td>
                        <span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:800;">
                            <?= $c['tasks_completed'] ?> مهمة
                        </span>
                    </td>

                    <!-- إجراءات المدير -->
                    <?php if ($isAdmin): ?>
                    <td style="text-align:center;">
                        <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:11.5px;" onclick="openGrantModalFor(<?= $c['id'] ?>, '<?= htmlspecialchars(addslashes($c['name'])) ?>')">
                            منح نقاط
                        </button>
                    </td>
                    <?php endif; ?>

                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php endif; ?>

<!-- ================================================================
     محتوى التبويب 2: متجر المكافآت والشهادات (Rewards Store)
     ================================================================ -->
<?php if ($tabFilter === 'store'): ?>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;">
    <?php foreach ($rewardsList as $r): 
        $canAfford = ($myCoordId > 0 && ($myCoordData['points'] ?? 0) >= $r['cost_points']);
    ?>
    <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:20px;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,0.03);position:relative;">
        
        <!-- رأس بطاقة المكافأة -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;">
            <div style="width:48px;height:48px;border-radius:12px;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 2px 6px rgba(245,158,11,0.15);">
                <?= $r['icon'] ?>
            </div>
            <div style="background:#fef3c7;color:#b45309;padding:4px 10px;border-radius:12px;font-size:13px;font-weight:900;display:flex;align-items:center;gap:4px;">
                <span>🪙</span> <?= number_format($r['cost_points']) ?> نقطة
            </div>
        </div>

        <!-- عنوان ووصف المكافأة -->
        <h4 style="font-family:'Cairo',sans-serif;font-size:15.5px;font-weight:800;color:#0f172a;margin:0 0 8px;">
            <?= htmlspecialchars($r['title']) ?>
        </h4>
        <p style="font-size:12.8px;color:#64748b;line-height:1.6;margin:0 0 16px;flex:1;">
            <?= nl2br(htmlspecialchars($r['description'] ?? '')) ?>
        </p>

        <!-- الكمية المتاحة والحالة -->
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:14px;padding-top:10px;border-top:1px solid #f1f5f9;">
            <span>الكمية المتاحة: <strong style="color:#0f172a;"><?= $r['stock'] == -1 ? 'غير محدودة ♾️' : $r['stock'] . ' متبقية' ?></strong></span>
            <span><?= $r['is_active'] ? '<span style="color:#15803d;font-weight:700;">● متاح للاستبدال</span>' : '<span style="color:#dc2626;font-weight:700;">● متوقف مؤقتاً</span>' ?></span>
        </div>

        <!-- زر الاستبدال أو الإدارة -->
        <div style="display:flex;align-items:center;gap:8px;margin-top:auto;">
            <?php if ($myCoordId > 0 && $r['is_active'] && $r['stock'] != 0): ?>
                <form method="post" style="flex:1;" onsubmit="return confirm('هل أنت متأكد من رغبتك في استبدال <?= $r['cost_points'] ?> نقطة للحصول على: <?= htmlspecialchars(addslashes($r['title'])) ?>؟');">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="redeem_reward">
                    <input type="hidden" name="reward_id" value="<?= $r['id'] ?>">
                    <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;padding:8px 12px;font-size:12.5px;background:<?= $canAfford?'#0284c7':'#94a3b8' ?>;" <?= !$canAfford?'disabled':'' ?>>
                        <?= $canAfford ? '🎁 استبدال المكافأة الآن' : '🪙 نقاطك غير كافية' ?>
                    </button>
                </form>
            <?php endif; ?>

            <?php if ($isAdmin): ?>
                <button type="button" class="btn-action btn-edit" onclick='openEditRewardModal(<?= json_encode($r, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)' title="تعديل المكافأة">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <form method="post" style="display:inline;" onsubmit="return confirm('هل أنت متأكد من حذف هذه المكافأة من المتجر؟');">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="delete_reward">
                    <input type="hidden" name="reward_id" value="<?= $r['id'] ?>">
                    <button type="submit" class="btn-action btn-delete" title="حذف">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </form>
            <?php endif; ?>
        </div>

    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

<!-- ================================================================
     محتوى التبويب 3: طلبات الاستبدال والتكريم (Redemption Requests)
     ================================================================ -->
<?php if ($tabFilter === 'redemptions'): ?>
<div class="panel-box" style="padding:0;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
        <div>
            <h4 style="margin:0 0 2px;font-size:15px;font-weight:800;color:#0f172a;">📬 سجل طلبات استبدال المكافآت والشهادات</h4>
            <p style="margin:0;font-size:12px;color:#64748b;">متابعة طلبات المنسقين وتأكيد تسليم الشهادات والدروع التكريمية</p>
        </div>
    </div>

    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>المنسق</th>
                    <th>المكافأة المطلوبة</th>
                    <th>النقاط المخصومة</th>
                    <th>حالة الطلب</th>
                    <th>تاريخ الطلب</th>
                    <?php if ($isAdmin): ?><th>إجراء الإدارة</th><?php endif; ?>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($redemptionsList)): ?>
                    <tr><td colspan="7" style="text-align:center;padding:40px;color:#64748b;">لا توجد طلبات استبدال حتى الآن</td></tr>
                <?php endif; ?>

                <?php foreach ($redemptionsList as $rd): 
                    $stBadge = ['bg' => '#fef3c7', 'color' => '#b45309', 'label' => 'قيد المراجعة ⏳'];
                    if ($rd['status'] === 'approved') $stBadge = ['bg' => '#dcfce7', 'color' => '#15803d', 'label' => 'معتمدة ومسلمة ✅'];
                    if ($rd['status'] === 'rejected') $stBadge = ['bg' => '#fee2e2', 'color' => '#b91c1c', 'label' => 'مرفوضة (أعيدت النقاط) ✕'];
                ?>
                <tr>
                    <td style="font-family:'IBM Plex Mono',monospace;color:#64748b;"><?= $rd['id'] ?></td>
                    <td>
                        <strong style="color:#0f172a;"><?= htmlspecialchars($rd['coord_name']) ?></strong>
                        <div style="font-size:11px;color:#64748b;">🏛️ <?= htmlspecialchars($rd['coord_faculty'] ?? '') ?></div>
                    </td>
                    <td>
                        <div style="display:flex;align-items:center;gap:6px;font-weight:800;color:#0f172a;">
                            <span><?= $rd['reward_icon'] ?></span>
                            <span><?= htmlspecialchars($rd['reward_title']) ?></span>
                        </div>
                    </td>
                    <td>
                        <strong style="color:#dc2626;">🪙 -<?= number_format($rd['points_spent']) ?></strong>
                    </td>
                    <td>
                        <span style="background:<?= $stBadge['bg'] ?>;color:<?= $stBadge['color'] ?>;padding:2px 8px;border-radius:6px;font-size:11.5px;font-weight:800;">
                            <?= $stBadge['label'] ?>
                        </span>
                        <?php if (!empty($rd['admin_notes'])): ?>
                            <div style="font-size:11px;color:#64748b;margin-top:3px;"><?= htmlspecialchars($rd['admin_notes']) ?></div>
                        <?php endif; ?>
                    </td>
                    <td style="font-size:12px;color:#64748b;"><?= date('Y-m-d H:i', strtotime($rd['created_at'])) ?></td>
                    
                    <?php if ($isAdmin): ?>
                    <td>
                        <?php if ($rd['status'] === 'pending'): ?>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <form method="post" style="display:inline;">
                                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                                    <input type="hidden" name="action" value="process_redemption">
                                    <input type="hidden" name="redemption_id" value="<?= $rd['id'] ?>">
                                    <input type="hidden" name="status" value="approved">
                                    <button type="submit" class="btn btn-primary" style="padding:4px 8px;font-size:11.5px;background:#16a34a;">
                                        ✅ اعتماد
                                    </button>
                                </form>
                                <form method="post" style="display:inline;" onsubmit="return confirm('هل تريد رفض الطلب وإعادة النقاط للمنسق؟');">
                                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                                    <input type="hidden" name="action" value="process_redemption">
                                    <input type="hidden" name="redemption_id" value="<?= $rd['id'] ?>">
                                    <input type="hidden" name="status" value="rejected">
                                    <button type="submit" class="btn btn-secondary" style="padding:4px 8px;font-size:11.5px;color:#dc2626;">
                                        ✕ رفض
                                    </button>
                                </form>
                            </div>
                        <?php else: ?>
                            <span style="font-size:11px;color:#94a3b8;">تمت المعالجة</span>
                        <?php endif; ?>
                    </td>
                    <?php endif; ?>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php endif; ?>

<!-- ================================================================
     محتوى التبويب 4: سجل حركات النقاط (Points Ledger)
     ================================================================ -->
<?php if ($tabFilter === 'ledger'): ?>
<div class="panel-box" style="padding:0;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;background:#f8fafc;">
        <div>
            <h4 style="margin:0 0 2px;font-size:15px;font-weight:800;color:#0f172a;">📜 سجل المعاملات وحركات النقاط</h4>
            <p style="margin:0;font-size:12px;color:#64748b;">سجل شفاف وموثق لجميع عمليات كسب، منح، واستبدال النقاط</p>
        </div>
        <form method="get" style="display:flex;gap:6px;">
            <input type="hidden" name="tab" value="ledger">
            <input type="text" name="q" value="<?= htmlspecialchars($search) ?>" placeholder="بحث بالاسم أو السبب..." class="form-control" style="font-size:12px;padding:4px 10px;">
            <button type="submit" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;">🔍</button>
        </form>
    </div>

    <div class="table-responsive">
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>المنسق</th>
                    <th>الحركة</th>
                    <th>النقاط</th>
                    <th>السبب والتفاصيل</th>
                    <th>المصدر</th>
                    <th>التاريخ والوقت</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($ledgerList)): ?>
                    <tr><td colspan="7" style="text-align:center;padding:40px;color:#64748b;">لا توجد حركات مسجلة</td></tr>
                <?php endif; ?>

                <?php foreach ($ledgerList as $tx): 
                    $isPositive = ($tx['points_change'] > 0);
                ?>
                <tr>
                    <td style="font-family:'IBM Plex Mono',monospace;color:#64748b;"><?= $tx['id'] ?></td>
                    <td>
                        <strong style="color:#0f172a;"><?= htmlspecialchars($tx['coord_name']) ?></strong>
                        <div style="font-size:11px;color:#64748b;">🏛️ <?= htmlspecialchars($tx['coord_faculty'] ?? '') ?></div>
                    </td>
                    <td>
                        <?php if ($tx['action_type'] === 'task_completion'): ?>
                            <span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;">✅ إنجاز مهمة</span>
                        <?php elseif ($tx['action_type'] === 'admin_grant'): ?>
                            <span style="background:#eff6ff;color:#0284c7;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;">⭐ مكافأة إدارة</span>
                        <?php elseif ($tx['action_type'] === 'reward_redemption'): ?>
                            <span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;">🎁 استبدال مكافأة</span>
                        <?php else: ?>
                            <span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;">🔄 تعديل رصيد</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <strong style="color:<?= $isPositive?'#16a34a':'#dc2626' ?>;font-size:14px;font-family:'IBM Plex Mono',monospace;">
                            <?= $isPositive ? '+' : '' ?><?= $tx['points_change'] ?> 🪙
                        </strong>
                    </td>
                    <td style="font-size:13px;color:#334155;">
                        <?= htmlspecialchars($tx['reason']) ?>
                    </td>
                    <td style="font-size:11.5px;color:#64748b;"><?= htmlspecialchars($tx['created_by']) ?></td>
                    <td style="font-size:12px;color:#64748b;font-family:'IBM Plex Mono',monospace;"><?= date('Y-m-d H:i', strtotime($tx['created_at'])) ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php endif; ?>

<!-- ================================================================
     النوافذ المنبثقة (Modals)
     ================================================================ -->

<!-- 1. مودال منح نقاط تشجيعية (Admin) -->
<?php if ($isAdmin): ?>
<div class="custom-modal-overlay" id="grantPointsModal">
    <div class="custom-modal-box" style="max-width:520px;">
        <div class="custom-modal-header">
            <h3>🪙 منح نقاط ومكافأة تقديرية للمنسق</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('grantPointsModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="grant_points">
            
            <div class="form-group">
                <label>اختر المنسق المستهدف *</label>
                <select name="coordinator_id" id="grant_coord_select" required class="form-control">
                    <option value="">— اختر المنسق من القائمة —</option>
                    <?php foreach ($coordsList as $c): ?>
                        <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['name']) ?> (<?= htmlspecialchars($c['faculty']) ?>) — رصيده: <?= $c['points'] ?> نقطة</option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="form-group">
                <label>عدد النقاط المراد منحها *</label>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="document.getElementById('grant_points_input').value = 15">+15</button>
                    <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="document.getElementById('grant_points_input').value = 25">+25</button>
                    <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="document.getElementById('grant_points_input').value = 50">+50</button>
                    <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:12px;" onclick="document.getElementById('grant_points_input').value = 100">+100</button>
                </div>
                <input type="number" name="points_amount" id="grant_points_input" required class="form-control" value="25" min="-500" max="1000" placeholder="مثال: 50">
            </div>

            <div class="form-group">
                <label>سبب المنح / نص المكافأة *</label>
                <textarea name="reason" rows="2" required class="form-control" placeholder="مثال: جهود استثنائية في تنظيم توزيع كتب كلية العلوم"></textarea>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('grantPointsModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary" style="background:#0284c7;">🪙 اعتماد وإيداع النقاط</button>
            </div>
        </form>
    </div>
</div>

<!-- 2. مودال إضافة مكافأة جديدة للمتجر (Admin) -->
<div class="custom-modal-overlay" id="addRewardModal">
    <div class="custom-modal-box" style="max-width:540px;">
        <div class="custom-modal-header">
            <h3>🎁 إضافة مكافأة أو شهادة لمتجر المنسقين</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('addRewardModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="create_reward">

            <div class="modal-form-grid" style="grid-template-columns:1fr 1fr;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label>عنوان المكافأة / الشهادة *</label>
                    <input type="text" name="title" required class="form-control" placeholder="مثال: شهادة تميز وتطوع معتمدة">
                </div>

                <div class="form-group">
                    <label>الرمز التعبيري / الأيقونة</label>
                    <input type="text" name="icon" value="📜" class="form-control" style="font-size:18px;">
                </div>

                <div class="form-group">
                    <label>تكلفة النقاط للاستبدال *</label>
                    <input type="number" name="cost_points" value="100" min="1" required class="form-control">
                </div>

                <div class="form-group">
                    <label>التصنيف</label>
                    <select name="category" class="form-control">
                        <option value="certificate">📜 شهادة شكر وتقدير</option>
                        <option value="shield">🏆 درع تكريمي</option>
                        <option value="badge">🎖️ شارة وبطاقة رقمية</option>
                        <option value="perk">📚 ميزة جامعية</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>الكمية المتاحة (-1 غير محدود)</label>
                    <input type="number" name="stock" value="-1" class="form-control">
                </div>

                <div class="form-group" style="grid-column:1/-1;">
                    <label>وصف وتفاصيل المكافأة</label>
                    <textarea name="description" rows="3" class="form-control" placeholder="اشرح ما تتضمنه هذه المكافأة، متى تسلم، وكيف يستفيد منها المنسق..."></textarea>
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('addRewardModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary">🎁 حفظ ونشر المكافأة</button>
            </div>
        </form>
    </div>
</div>

<!-- 3. مودال تعديل مكافأة (Admin) -->
<div class="custom-modal-overlay" id="editRewardModal">
    <div class="custom-modal-box" style="max-width:540px;">
        <div class="custom-modal-header">
            <h3>✏️ تعديل بيانات المكافأة</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('editRewardModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="edit_reward">
            <input type="hidden" name="reward_id" id="edit_reward_id">

            <div class="modal-form-grid" style="grid-template-columns:1fr 1fr;">
                <div class="form-group" style="grid-column:1/-1;">
                    <label>عنوان المكافأة *</label>
                    <input type="text" name="title" id="edit_reward_title" required class="form-control">
                </div>

                <div class="form-group">
                    <label>الأيقونة</label>
                    <input type="text" name="icon" id="edit_reward_icon" class="form-control" style="font-size:18px;">
                </div>

                <div class="form-group">
                    <label>تكلفة النقاط *</label>
                    <input type="number" name="cost_points" id="edit_reward_cost" min="1" required class="form-control">
                </div>

                <div class="form-group">
                    <label>التصنيف</label>
                    <select name="category" id="edit_reward_category" class="form-control">
                        <option value="certificate">📜 شهادة شكر وتقدير</option>
                        <option value="shield">🏆 درع تكريمي</option>
                        <option value="badge">🎖️ شارة وبطاقة رقمية</option>
                        <option value="perk">📚 ميزة جامعية</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>الكمية المتاحة</label>
                    <input type="number" name="stock" id="edit_reward_stock" class="form-control">
                </div>

                <div class="form-group" style="grid-column:1/-1;">
                    <label>الوصف</label>
                    <textarea name="description" id="edit_reward_desc" rows="3" class="form-control"></textarea>
                </div>

                <div class="form-group" style="grid-column:1/-1;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                        <input type="checkbox" name="is_active" id="edit_reward_active" value="1">
                        <span>متاحة ونشطة للاستبدال بالمتجر</span>
                    </label>
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('editRewardModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ التعديلات</button>
            </div>
        </form>
    </div>
</div>
<?php endif; ?>

<script>
function openModal(id){document.getElementById(id).classList.add('show');}
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.remove('show');}

function openGrantModalFor(coordId, coordName) {
    const sel = document.getElementById('grant_coord_select');
    if (sel) sel.value = coordId;
    openModal('grantPointsModal');
}

function openEditRewardModal(r) {
    document.getElementById('edit_reward_id').value = r.id;
    document.getElementById('edit_reward_title').value = r.title || '';
    document.getElementById('edit_reward_icon').value = r.icon || '🎁';
    document.getElementById('edit_reward_cost').value = r.cost_points || 100;
    document.getElementById('edit_reward_category').value = r.category || 'certificate';
    document.getElementById('edit_reward_stock').value = r.stock !== undefined ? r.stock : -1;
    document.getElementById('edit_reward_desc').value = r.description || '';
    document.getElementById('edit_reward_active').checked = (r.is_active == 1);
    openModal('editRewardModal');
}

document.querySelectorAll('.custom-modal-overlay').forEach(o=>{o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);});});
</script>

<?php require __DIR__ . '/_footer.php'; ?>
