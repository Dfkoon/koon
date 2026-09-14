<?php
/**
 * admin/quick_delivery.php
 * صفحة تأكيد التسليم الفوري عبر مسح رمز QR بكاميرا الهاتف
 */
require_once __DIR__ . '/../config.php';

$db = get_db();
$id = (int) ($_GET['id'] ?? 0);
$token = $_GET['token'] ?? '';
$action = $_POST['action'] ?? '';

// التحقق الأمني من الرمز الفريد للعملية
$expectedToken = hash('sha256', $id . '_makanak_delivery_secure_salt_2026');
$isTokenValid = ($id > 0 && hash_equals($expectedToken, $token));

if (!$isTokenValid) {
    die('<div style="font-family:sans-serif; text-align:center; padding:60px 20px; direction:rtl;"><h2>⛔ رمز الاستجابة السريعة (QR) غير صالح أو منتهي الصلاحية</h2><a href="donations.php">العودة للوحة التحكم</a></div>');
}

$stmt = $db->prepare('SELECT * FROM material_exchanges WHERE id = ?');
$stmt->execute([$id]);
$item = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$item) {
    die('<div style="font-family:sans-serif; text-align:center; padding:60px 20px; direction:rtl;"><h2>❌ لم يتم العثور على بيانات هذا الكتاب في النظام.</h2></div>');
}

$alreadyDelivered = ($item['status'] === 'completed' || $item['delivery_status'] === 'completed');
$justDelivered = false;

// معالجة تأكيد التسليم
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'confirm_delivery' && !$alreadyDelivered) {
    if (csrf_check($_POST['csrf'] ?? '')) {
        $stmtUpdate = $db->prepare("UPDATE material_exchanges SET 
            status = 'completed', 
            delivery_status = 'completed', 
            delivered_at = CURRENT_TIMESTAMP, 
            notes = CASE WHEN notes IS NOT NULL AND notes != '' THEN notes || ' | تم التسليم عبر QR' ELSE 'تم التسليم عبر مسح QR' END,
            updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?");
        $stmtUpdate->execute([$id]);
        
        log_activity("تأكيد تسليم المادة #$id (\"{$item['material_name']}\") عبر مسح رمز QR", 'material_exchange');
        $alreadyDelivered = true;
        $justDelivered = true;

        // مزامنة فورية مع Firestore
        if (file_exists(__DIR__ . '/../includes/sync_frontend_live.php')) {
            require_once __DIR__ . '/../includes/sync_frontend_live.php';
            if (function_exists('sync_material_exchanges_to_frontend')) {
                sync_material_exchanges_to_frontend($db);
            }
        }
        
        // إعادة جلب البيانات بعد التحديث
        $stmt->execute([$id]);
        $item = $stmt->fetch(PDO::FETCH_ASSOC);
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تأكيد تسليم مادة — منصة مكانك</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Tajawal', sans-serif;
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            color: #1e293b;
        }
        .delivery-card {
            background: #ffffff;
            width: 100%;
            max-width: 480px;
            border-radius: 24px;
            box-shadow: 0 20px 45px -10px rgba(2, 132, 199, 0.18), 0 0 0 1px rgba(226, 232, 240, 0.8);
            overflow: hidden;
            text-align: center;
            animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .card-header {
            padding: 30px 24px 20px;
            background: <?= $alreadyDelivered ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : 'linear-gradient(135deg, #eff6ff, #dbeafe)' ?>;
            border-bottom: 1.5px solid <?= $alreadyDelivered ? '#a7f3d0' : '#bfdbfe' ?>;
        }
        .status-icon-box {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            margin: 0 auto 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: <?= $alreadyDelivered ? '#10b981' : '#0284c7' ?>;
            color: #fff;
            box-shadow: 0 8px 25px <?= $alreadyDelivered ? 'rgba(16, 185, 129, 0.35)' : 'rgba(2, 132, 199, 0.35)' ?>;
        }
        .card-title {
            font-family: 'Cairo', sans-serif;
            font-size: 20px;
            font-weight: 800;
            color: <?= $alreadyDelivered ? '#065f46' : '#0369a1' ?>;
            margin-bottom: 6px;
        }
        .card-subtitle {
            font-size: 13px;
            color: <?= $alreadyDelivered ? '#047857' : '#0284c7' ?>;
        }
        .card-body {
            padding: 24px;
            text-align: right;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px dashed #e2e8f0;
            font-size: 13.5px;
        }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: #64748b; font-weight: 500; }
        .info-val { font-weight: 700; color: #0f172a; }
        .book-title-box {
            background: #f8fafc;
            border: 1.5px solid #e2e8f0;
            border-radius: 14px;
            padding: 14px 16px;
            margin-bottom: 18px;
            text-align: center;
        }
        .book-name {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
        }
        .book-code {
            display: inline-block;
            background: #e0f2fe;
            color: #0369a1;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 11.5px;
            font-weight: 800;
            margin-top: 4px;
        }
        .action-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 800;
            font-family: inherit;
            cursor: pointer;
            border: none;
            text-decoration: none;
            transition: all .2s;
        }
        .btn-confirm {
            background: #10b981;
            color: #fff;
            box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);
        }
        .btn-confirm:hover { background: #059669; }
        .btn-back {
            background: #f1f5f9;
            color: #475569;
            margin-top: 10px;
        }
        .btn-back:hover { background: #e2e8f0; color: #0f172a; }
        .btn-whatsapp {
            background: #25d366;
            color: #fff;
            margin-top: 10px;
        }
        .btn-whatsapp:hover { background: #1ebd59; }
    </style>
</head>
<body>

<div class="delivery-card">
    <div class="card-header">
        <div class="status-icon-box">
            <?php if ($alreadyDelivered): ?>
                <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            <?php else: ?>
                <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <polyline points="16 11 18 13 22 9" />
                </svg>
            <?php endif; ?>
        </div>

        <h1 class="card-title">
            <?= $alreadyDelivered ? 'تم التسليم بنجاح ✓' : 'تأكيد تسليم مادة دراسية' ?>
        </h1>
        <div class="card-subtitle">
            <?= $alreadyDelivered ? 'تم تسجيل هذه العملية كمسلّمة رسمياً في النظام' : 'امسح للتأكيد الفوري لمطابقة السند والتسليم' ?>
        </div>
    </div>

    <div class="card-body">
        <div class="book-title-box">
            <div class="book-name"><?= htmlspecialchars($item['material_name']) ?></div>
            <?php if (!empty($item['course_code'])): ?>
                <span class="book-code"><?= htmlspecialchars($item['course_code']) ?></span>
            <?php endif; ?>
            <div style="font-size:12px; color:#64748b; margin-top:4px;">الكلية: <?= htmlspecialchars($item['faculty'] ?: 'متطلب عام') ?></div>
        </div>

        <div class="info-row">
            <span class="info-label">رقم المادة:</span>
            <span class="info-val">#<?= $item['id'] ?></span>
        </div>
        <div class="info-row">
            <span class="info-label">الطالب المستلم:</span>
            <span class="info-val" style="color:#0284c7;"><?= htmlspecialchars($item['booker_name'] ?: 'غير محدد') ?></span>
        </div>
        <?php if (!empty($item['booker_phone'])): ?>
        <div class="info-row">
            <span class="info-label">هاتف المستلم:</span>
            <span class="info-val" dir="ltr"><?= htmlspecialchars($item['booker_phone']) ?></span>
        </div>
        <?php endif; ?>
        <div class="info-row">
            <span class="info-label">الطالب المتبرع:</span>
            <span class="info-val" style="color:#64748b; font-size:12.5px;">
                <?= (!empty($item['hide_donor_info']) || true) ? 'فاعل خير (محجوب للخصوصية)' : htmlspecialchars($item['donor_name'] ?: 'فاعل خير') ?>
            </span>
        </div>
        <?php if (!empty($item['delivered_at'])): ?>
        <div class="info-row">
            <span class="info-label">وقت التسليم المسجل:</span>
            <span class="info-val" style="color:#10b981;"><?= htmlspecialchars($item['delivered_at']) ?></span>
        </div>
        <?php endif; ?>

        <div style="margin-top: 24px;">
            <?php if (!$alreadyDelivered): ?>
                <form method="post">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="confirm_delivery">
                    <button type="submit" class="action-btn btn-confirm">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        تأكيد تسليم الكتاب للطالب الآن
                    </button>
                </form>
            <?php else: ?>
                <?php
                $adminWhatsappPhone = '962782934685';
                $studentName = !empty($item['booker_name']) ? $item['booker_name'] : 'طالب مستلم';
                $materialTitle = !empty($item['material_name']) ? $item['material_name'] : 'المادة الدراسية';
                $thanksMsg = "السلام عليكم ورحمة الله،\nأنا الطالب ({$studentName})، استلمت مادة ({$materialTitle}) بنجاح.\n\nأتوجه بجزيل الشكر والتقدير لإدارة منصة مكانك وفريق التنسيق وللمتبرع الكريم على هذه المبادرة الطيبة وجهودكم المباركة، جزاكم الله كل خير! 🌸";
                $thanksUrl = 'https://wa.me/' . $adminWhatsappPhone . '?text=' . rawurlencode($thanksMsg);
                ?>
                <a href="<?= $thanksUrl ?>" target="_blank" class="action-btn btn-whatsapp">
                    <span>💬 إرسال رسالة شكر للإدارة وفريق الحملة عبر واتساب</span>
                </a>
            <?php endif; ?>

            <button type="button" onclick="window.close(); if(!window.closed){ window.location.href='about:blank'; }" class="action-btn btn-back">
                ✕ إغلاق النافذة
            </button>
        </div>
    </div>
</div>

</body>
</html>
