<?php
$page_key = 'donations';
$page_title = 'إدارة تبادل المواد';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/sync_frontend_live.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();
foreach ([
    'archive_key' => 'TEXT',
    'archive_label' => 'TEXT',
    'donor_phone_alt' => 'TEXT',
    'donor_email' => 'TEXT',
    'delivery_week' => 'TEXT',
    'firestore_id' => 'TEXT'
] as $column => $type) {
    $columns = $db->query('PRAGMA table_info(material_exchanges)')->fetchAll(PDO::FETCH_COLUMN, 1);
    if (!in_array($column, $columns, true))
        $db->exec("ALTER TABLE material_exchanges ADD COLUMN $column $type");
}
$db->exec("UPDATE material_exchanges SET archive_key = 'second_2025_2026', archive_label = 'الفصل الدراسي الثاني 2025-2026' WHERE notes LIKE '%الفصل الدراسي الثاني 2025%'");
$db->exec("UPDATE material_exchanges SET archive_key = 'summer_2025_2026', archive_label = 'الفصل الدراسي الصيفي 2025-2026' WHERE notes LIKE '%الفصل الدراسي الصيفي 2026%'");

// ترحيل القيم القديمة النصية ('ahmad','sara','admin') إلى 'shared' لأن المنسقين محددون الآن بـ ID
$db->exec("UPDATE material_exchanges SET assigned_coordinator = 'shared' WHERE assigned_coordinator IN ('ahmad','sara','admin') OR (assigned_coordinator IS NOT NULL AND assigned_coordinator != 'shared' AND assigned_coordinator != '' AND assigned_coordinator NOT GLOB '[0-9]*')");

// جلب وتحديث طلبات التبرع الجديدة من السحابة إن وجدت
try {
    if (function_exists('pull_pending_donations_from_firestore')) {
        pull_pending_donations_from_firestore($db);
    }
} catch (Throwable $e) {
}

// تحميل المنسقين النشطين من قاعدة البيانات ديناميكياً
$activeCoordinators = $db->query("SELECT id, name, gender, role_type, faculty FROM coordinators WHERE is_active = 1 ORDER BY role_type DESC, name ASC")->fetchAll(PDO::FETCH_ASSOC);

/* ---------- صلاحيات المستخدم الحالي في هذه الصفحة ---------- */
$_donationsCurrentUserId = (int) ($_SESSION['user_id'] ?? 0);
$_donationsUserStmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1');
$_donationsUserStmt->execute([$_donationsCurrentUserId]);
$_donationsCurrentUser = $_donationsUserStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$_donationsRole = $_donationsCurrentUser['role'] ?? 'coordinator';

// الأدمن العام أو المستخدم رقم 1 أو HUSSIEN = صلاحية كاملة
$isDonationsAdmin = in_array($_donationsRole, ['admin', 'super_admin'], true)
    || $_donationsCurrentUserId === 1
    || strtoupper((string) ($_donationsCurrentUser['username'] ?? '')) === 'HUSSIEN';

// الصلاحيات الدقيقة للحملات والأرشيف
$canArchiveCampaign = $isDonationsAdmin || user_has_capability('donations.archive_manage', $_donationsCurrentUser);
$canCreateCampaign  = $isDonationsAdmin || user_has_capability('donations.create_campaign', $_donationsCurrentUser);
$canManageCampaigns = $canArchiveCampaign || $canCreateCampaign;
// الاطلاع على الأرشيف متاح للأدمن أو لمن يملك صلاحية donations.archive_view أو للمنسق افتراضياً
$canViewArchive     = $isDonationsAdmin || user_has_capability('donations.archive_view', $_donationsCurrentUser) || empty($_donationsCurrentUser['permissions']);

// جنس المنسق الحالي (للتحكم في إظهار جداول الذكور/الإناث)
// null = غير محدد (يرى كل الجداول) ، 'male' أو 'female'
$currentCoordGender = null;
if (!$isDonationsAdmin && $_donationsCurrentUserId > 0) {
    $_coordGenderStmt = $db->prepare('SELECT gender FROM coordinators WHERE user_id = ? LIMIT 1');
    $_coordGenderStmt->execute([$_donationsCurrentUserId]);
    $_coordGenderVal = $_coordGenderStmt->fetchColumn();
    if ($_coordGenderVal !== false && $_coordGenderVal !== '') {
        $currentCoordGender = (string) $_coordGenderVal; // 'male' أو 'female'
    }
    // إذا لم يكن له سجل في جدول coordinators يرى كل شيء (null)
}

$message = null;
$messageType = 'success';
$archiveVisibility = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'exchange_archive_visible' LIMIT 1")->fetchColumn();
$archiveVisibility = $archiveVisibility === false ? '0' : (string) $archiveVisibility;
$currentCampaignLabel = $db->query("SELECT setting_value FROM site_settings WHERE setting_key = 'exchange_current_campaign' LIMIT 1")->fetchColumn();
$currentCampaignLabel = $currentCampaignLabel === false || trim((string) $currentCampaignLabel) === ''
    ? 'الفصل الدراسي الأول 2026-2027'
    : (string) $currentCampaignLabel;

/* ---------- استعلام حالة التسليم الفوري بدون تحديث الصفحة (AJAX Live Check) ---------- */
if (isset($_GET['action']) && $_GET['action'] === 'check_delivery_status') {
    session_write_close();
    header('Content-Type: application/json; charset=utf-8');
    $chkId = (int)($_GET['id'] ?? 0);
    $chkRow = $db->query("SELECT status, delivery_status, delivered_at FROM material_exchanges WHERE id = $chkId LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $isDel = $chkRow && ($chkRow['status'] === 'completed' || $chkRow['delivery_status'] === 'completed');
    echo json_encode([
        'success' => true,
        'delivered' => (bool)$isDel,
        'delivered_at' => $chkRow['delivered_at'] ?? ''
    ]);
    exit;
}

/* ---------- معالجة الإجراءات (إضافة / تعديل / حجز / تسليم / إلغاء / حذف) ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $message = 'انتهت صلاحية النموذج، يرجى إعادة المحاولة.';
        $messageType = 'error';
    } else {
        $action = $_POST['action'] ?? '';

        if ($action === 'archive_current_campaign' || $action === 'start_new_campaign') {
            // ⛔ التحقق من الصلاحية المطلوبة
            $hasActionPerm = ($action === 'archive_current_campaign') ? $canArchiveCampaign : $canCreateCampaign;
            if (!$hasActionPerm) {
                $permName = ($action === 'archive_current_campaign') ? 'أرشفة الحملة' : 'فتح وبدء حملة جديدة';
                $message = "⛔ ليس لديك صلاحية ($permName). هذه العملية تتطلب إذناً متقدماً من مدير النظام.";
                $messageType = 'error';
            } else {
            $archiveSemesterName = trim($_POST['archive_semester_name'] ?? '');
            if ($archiveSemesterName === '') {
                $archiveSemesterName = trim($_POST['campaign_label'] ?? $currentCampaignLabel);
            }
            if ($archiveSemesterName === '') {
                $archiveSemesterName = $currentCampaignLabel;
            }
            $nextCampaignLabel = trim($_POST['next_campaign_label'] ?? '');
            if ($nextCampaignLabel === '' && !empty($_POST['campaign_label']) && $action === 'start_new_campaign') {
                $nextCampaignLabel = trim($_POST['campaign_label']);
            }

            $archiveKey = 'campaign_' . date('YmdHis') . '_' . substr(hash('sha256', $archiveSemesterName . microtime(true)), 0, 8);
            $db->beginTransaction();
            try {
                // ترحيل كل المواد الحالية غير المؤرشفة إلى الأرشيف
                $stmt = $db->prepare('UPDATE material_exchanges SET archive_key = ?, archive_label = ? WHERE archive_key IS NULL');
                $stmt->execute([$archiveKey, $archiveSemesterName]);
                $archivedCount = $stmt->rowCount();

                if ($nextCampaignLabel !== '') {
                    $stmt = $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at) VALUES ('exchange_current_campaign', ?, 'exchange', CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP");
                    $stmt->execute([$nextCampaignLabel]);
                    $currentCampaignLabel = $nextCampaignLabel;
                }

                $stmt = $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at) VALUES ('exchange_archive_visible', '1', 'exchange', CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = '1', updated_at = CURRENT_TIMESTAMP");
                $stmt->execute();
                $db->commit();

                $archiveVisibility = '1';
                log_activity("أرشفة الحملة الحالية ($archiveSemesterName) وترحيل $archivedCount مادة للأرشيف", 'material_exchange');
                $message = "تمت أرشفة كافة بيانات ($archiveSemesterName) بنجاح بعدد ($archivedCount مادة) وترحيلها للأرشيف. الجداول الحالية أصبحت فارغة وجاهزة لاستقبال طلبات الحملة الجديدة.";
            } catch (Throwable $exception) {
                if ($db->inTransaction())
                    $db->rollBack();
                $message = 'تعذر أرشفة الحملة الحالية، يرجى المحاولة مرة أخرى: ' . $exception->getMessage();
                $messageType = 'error';
            }
            } // end else (canManageCampaigns)
        } elseif ($action === 'toggle_archive_visibility') {
            $newVisibility = $archiveVisibility === '1' ? '0' : '1';
            $stmt = $db->prepare("INSERT INTO site_settings (setting_key, setting_value, setting_group, updated_at) VALUES ('exchange_archive_visible', ?, 'exchange', CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP");
            $stmt->execute([$newVisibility]);
            $archiveVisibility = $newVisibility;
            $message = $newVisibility === '1' ? 'تم إظهار أرشيف الحملات السابقة.' : 'تم إخفاء أرشيف الحملات السابقة وبدء حملة الفصل الأول 2026-2027.';
        }

        // 1. إضافة مادة جديدة للتبرع والتبادل
        elseif ($action === 'create') {
            $donorName = trim($_POST['donor_name'] ?? '');
            $donorPhone = trim($_POST['donor_phone'] ?? '');
            $donorGender = $_POST['donor_gender'] ?? 'male';
            $materialName = trim($_POST['material_name'] ?? '');
            $courseCode = trim($_POST['course_code'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $description = trim($_POST['description'] ?? '');
            $status = $_POST['status'] ?? 'approved';
            $assignedCoordinator = $_POST['assigned_coordinator'] ?? ($donorGender === 'female' ? 'sara' : 'ahmad');
            $notes = trim($_POST['notes'] ?? '');

            if ($donorName === '' || $materialName === '') {
                $message = 'الرجاء إدخال اسم المتبرع واسم المادة / الكتاب على الأقل.';
                $messageType = 'error';
            } else {
                $stmt = $db->prepare('INSERT INTO material_exchanges 
                    (donor_name, donor_phone, donor_gender, material_name, course_code, faculty, description, status, assigned_coordinator, notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmt->execute([$donorName, $donorPhone, $donorGender, $materialName, $courseCode, $faculty, $description, $status, $assignedCoordinator, $notes]);
                $newId = $db->lastInsertId();
                log_activity("إضافة مادة متبادلة جديدة: \"$materialName\" من المتبرع \"$donorName\" (#$newId)", 'material_exchange');
                sync_material_exchanges_to_frontend($db);
                $message = 'تمت إضافة المادة بنجاح إلى مستودع التبادل.';
            }
        }

        // 2. تعديل بيانات مادة
        elseif ($action === 'update') {
            $id = (int) ($_POST['id'] ?? 0);
            $donorName = trim($_POST['donor_name'] ?? '');
            $donorPhone = trim($_POST['donor_phone'] ?? '');
            $donorGender = $_POST['donor_gender'] ?? 'male';
            $materialName = trim($_POST['material_name'] ?? '');
            $courseCode = trim($_POST['course_code'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $description = trim($_POST['description'] ?? '');
            $status = $_POST['status'] ?? 'approved';
            $assignedCoordinator = $_POST['assigned_coordinator'] ?? 'ahmad';
            $pickupDate = trim($_POST['pickup_date'] ?? '');
            $pickupTime = trim($_POST['pickup_time'] ?? '');
            $deliveryStatus = $_POST['delivery_status'] ?? 'pending_contact';
            $bookerName = trim($_POST['booker_name'] ?? '');
            $bookerPhone = trim($_POST['booker_phone'] ?? '');
            $bookerGender = $_POST['booker_gender'] ?? 'male';
            $notes = trim($_POST['notes'] ?? '');

            // منع المنسقين من تعديل المواد المؤرشفة
            $archCheckStmt = $db->prepare('SELECT archive_key FROM material_exchanges WHERE id = ? LIMIT 1');
            $archCheckStmt->execute([$id]);
            $isArchivedItem = !empty($archCheckStmt->fetchColumn());

            if ($isArchivedItem && !$isDonationsAdmin) {
                $message = '⛔ المواد المؤرشفة تابعة لفصول سابقة وهي مخصصة للاطلاع فقط ولا يمكن للمنسقين تعديلها.';
                $messageType = 'error';
            } elseif ($donorName === '' || $materialName === '') {
                $message = 'الرجاء إدخال اسم المتبرع واسم المادة / الكتاب.';
                $messageType = 'error';
            } else {
                $stmt = $db->prepare('UPDATE material_exchanges SET 
                    donor_name=?, donor_phone=?, donor_gender=?, material_name=?, course_code=?, faculty=?, description=?, 
                    status=?, assigned_coordinator=?, pickup_date=?, pickup_time=?, delivery_status=?, booker_name=?, 
                    booker_phone=?, booker_gender=?, notes=?, updated_at=CURRENT_TIMESTAMP 
                    WHERE id=?');
                $stmt->execute([
                    $donorName,
                    $donorPhone,
                    $donorGender,
                    $materialName,
                    $courseCode,
                    $faculty,
                    $description,
                    $status,
                    $assignedCoordinator,
                    $pickupDate,
                    $pickupTime,
                    $deliveryStatus,
                    $bookerName,
                    $bookerPhone,
                    $bookerGender,
                    $notes,
                    $id
                ]);
                log_activity("تعديل بيانات المادة المتبادلة #$id (\"$materialName\")", 'material_exchange');

                // مزامنة التعديل والحالة مع Firestore فوراً ليتحدث الموقع مباشرة
                if (function_exists('sync_material_update_to_firestore')) {
                    $stmtM = $db->prepare('SELECT firestore_id FROM material_exchanges WHERE id = ? LIMIT 1');
                    $stmtM->execute([$id]);
                    $fsId = $stmtM->fetchColumn() ?: '';
                    try {
                        sync_material_update_to_firestore($id, [
                            'firestore_id' => $fsId,
                            'material_name' => $materialName,
                            'status' => $status,
                            'donor_name' => $donorName,
                            'course_code' => $courseCode,
                            'faculty' => $faculty,
                            'booker_name' => $bookerName,
                            'booker_phone' => $bookerPhone,
                            'booker_gender' => $bookerGender,
                            'pickup_date' => $pickupDate,
                            'pickup_time' => $pickupTime,
                            'notes' => $notes,
                        ], $db);
                    } catch (Throwable $e) {}
                }

                sync_material_exchanges_to_frontend($db);
                $message = 'تم حفظ التعديلات بنجاح.';
            }
        }

        // 3. حجز مادة لطالب (Booking / Reservation)
        elseif ($action === 'reserve') {
            $id = (int) ($_POST['id'] ?? 0);
            $bookerName = trim($_POST['booker_name'] ?? '');
            $bookerPhone = trim($_POST['booker_phone'] ?? '');
            $bookerGender = $_POST['booker_gender'] ?? 'male';
            $pickupDate = trim($_POST['pickup_date'] ?? '');
            $pickupTime = trim($_POST['pickup_time'] ?? '');
            $assignedCoordinator = $_POST['assigned_coordinator'] ?? ($bookerGender === 'female' ? 'sara' : 'ahmad');
            $notes = trim($_POST['notes'] ?? '');

            if ($bookerName === '' || $bookerPhone === '') {
                $message = 'الرجاء إدخال اسم الطالب الحاجز ورقم الهاتف.';
                $messageType = 'error';
            } else {
                $stmt = $db->prepare('UPDATE material_exchanges SET 
                    status = "reserved", 
                    booker_name = ?, 
                    booker_phone = ?, 
                    booker_gender = ?, 
                    booked_at = CURRENT_TIMESTAMP, 
                    pickup_date = ?, 
                    pickup_time = ?, 
                    assigned_coordinator = ?, 
                    delivery_status = "scheduled", 
                    notes = CASE WHEN ? != "" THEN ? ELSE notes END,
                    updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?');
                $stmt->execute([$bookerName, $bookerPhone, $bookerGender, $pickupDate, $pickupTime, $assignedCoordinator, $notes, $notes, $id]);
                log_activity("حجز المادة #$id للطالب \"$bookerName\" هاتف: $bookerPhone", 'material_exchange');

                // مزامنة الحجز مع Firestore لإخفاء المادة فوراً من الموقع الرسمي
                $stmtMat = $db->prepare('SELECT material_name, firestore_id FROM material_exchanges WHERE id = ? LIMIT 1');
                $stmtMat->execute([$id]);
                $matRow = $stmtMat->fetch(PDO::FETCH_ASSOC);
                if ($matRow && !empty($matRow['firestore_id']) && function_exists('mark_donation_reserved_in_firestore')) {
                    try {
                        mark_donation_reserved_in_firestore(
                            $matRow['firestore_id'],
                            $matRow['material_name'],
                            [
                                'name' => $bookerName,
                                'phone' => $bookerPhone,
                                'gender' => $bookerGender,
                                'bookedAt' => date('c'),
                                'source' => 'admin_panel'
                            ]
                        );
                    } catch (Throwable $e) { /* الفشل في المزامنة لا يوقف العملية */ }
                }

                sync_material_exchanges_to_frontend($db);
                $message = "تم حجز المادة بنجاح للطالب ($bookerName).";
            }
        }

        // 4. تأكيد تسليم المادة للطالب (Mark as Completed / Delivered)
        elseif ($action === 'complete_delivery') {
            $id = (int) ($_POST['id'] ?? 0);
            $deliveryNotes = trim($_POST['delivery_notes'] ?? '');
            $stmt = $db->prepare('UPDATE material_exchanges SET 
                status = "completed", 
                delivery_status = "completed", 
                delivered_at = CURRENT_TIMESTAMP, 
                notes = CASE WHEN ? != "" THEN notes || " | تم التسليم: " || ? ELSE notes END,
                updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?');
            $stmt->execute([$deliveryNotes, $deliveryNotes, $id]);
            log_activity("تأكيد تسليم المادة المتبادلة #$id للطالب المستفيد", 'material_exchange');

            // مزامنة تأكيد التسليم مع Firestore
            $stmtM = $db->prepare('SELECT firestore_id, material_name FROM material_exchanges WHERE id = ? LIMIT 1');
            $stmtM->execute([$id]);
            $matRow = $stmtM->fetch(PDO::FETCH_ASSOC);
            if ($matRow && function_exists('sync_material_update_to_firestore')) {
                try {
                    sync_material_update_to_firestore($id, [
                        'firestore_id' => $matRow['firestore_id'] ?? '',
                        'material_name' => $matRow['material_name'] ?? '',
                        'status' => 'completed',
                        'notes' => $deliveryNotes,
                    ], $db);
                } catch (Throwable $e) {}
            }

            sync_material_exchanges_to_frontend($db);
            $message = '✅ تم تأكيد تسليم المادة بنجاح وأرشفتها كعملية مكتملة.';
        }

        // 5. إلغاء الحجز وإعادة المادة للمستودع لتكون متاحة
        elseif ($action === 'cancel_booking') {
            $id = (int) ($_POST['id'] ?? 0);

            // جلب تفاصيل المادة ومعرف Firestore لإلغاء الحجز سحابياً
            $stmtM = $db->prepare('SELECT id, material_name, firestore_id FROM material_exchanges WHERE id = ? LIMIT 1');
            $stmtM->execute([$id]);
            $matRow = $stmtM->fetch(PDO::FETCH_ASSOC);

            $stmt = $db->prepare('UPDATE material_exchanges SET 
                status = "approved", 
                booker_name = NULL, 
                booker_phone = NULL, 
                booker_gender = NULL, 
                booked_at = NULL, 
                pickup_date = NULL, 
                pickup_time = NULL, 
                delivery_status = "pending_contact", 
                updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?');
            $stmt->execute([$id]);
            log_activity("إلغاء حجز المادة #$id وإعادتها لمستودع المواد المتاحة", 'material_exchange');

            // مزامنة إلغاء الحجز سحابياً مع Firestore فوراً لإعادة المادة كمتاحة للطلاب على الموقع
            if ($matRow && !empty($matRow['firestore_id']) && function_exists('mark_donation_unreserved_in_firestore')) {
                try {
                    mark_donation_unreserved_in_firestore($matRow['firestore_id'], $matRow['material_name']);
                } catch (Throwable $e) {}
            }

            if (function_exists('sync_material_exchanges_to_frontend')) {
                sync_material_exchanges_to_frontend($db);
            }

            $message = 'تم إلغاء الحجز بنجاح وأصبحت المادة متاحة مجدداً لباقي الطلاب.';
        }


        // 6. حذف مادة
        elseif ($action === 'delete') {
            $id = (int) ($_POST['id'] ?? 0);
            // منع المنسقين من حذف المواد المؤرشفة
            $archCheckStmt = $db->prepare('SELECT archive_key, firestore_id, material_name, status FROM material_exchanges WHERE id = ? LIMIT 1');
            $archCheckStmt->execute([$id]);
            $delRow = $archCheckStmt->fetch(PDO::FETCH_ASSOC);
            $isArchivedItem = !empty($delRow['archive_key']);

            if ($isArchivedItem && !$isDonationsAdmin) {
                $message = '⛔ المواد المؤرشفة تابعة لفصول سابقة وهي مخصصة للاطلاع فقط ولا يمكن للمنسقين حذفها.';
                $messageType = 'error';
            } else {
                // مزامنة الحذف مع Firestore فوراً لإخفائها/حذفها من الموقع بالكامل
                if (function_exists('delete_material_from_firestore')) {
                    try {
                        delete_material_from_firestore($delRow['firestore_id'] ?? null, $delRow['material_name'] ?? '', $id, $db);
                    } catch (Throwable $e) {}
                }

                archive_delete('material_exchanges', $id, 'حذف مادة متبادلة');
                log_activity("حذف المادة المتبادلة #$id نهائياً", 'material_exchange');
                if (function_exists('sync_material_exchanges_to_frontend')) {
                    sync_material_exchanges_to_frontend($db);
                }
                $message = 'تم حذف المادة بنجاح.';
            }
        }

        // 7. فرز وتعيين يدوي فوري للمنسق المكلف
        elseif ($action === 'quick_assign_coordinator') {
            $id = (int) ($_POST['id'] ?? 0);
            $newCoord = trim($_POST['assigned_coordinator'] ?? 'shared');
            if ($newCoord !== 'shared' && !isset($coordinatorsList[$newCoord])) {
                $newCoord = 'shared';
            }
            $stmt = $db->prepare('UPDATE material_exchanges SET assigned_coordinator = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $stmt->execute([$newCoord, $id]);
            $coordName = $coordinatorsList[$newCoord]['name'] ?? $newCoord;
            log_activity("فرز وتعيين المادة #$id إلى: $coordName", 'material_exchange');
            $message = "تم فرز وتعيين المادة #$id بنجاح إلى: $coordName";
        }

        // 8. تنفيذ المطابقة الذكية وربط الكتاب بطالب في قائمة الانتظار فوراً
        elseif ($action === 'smart_match_fulfill') {
            $exchangeId = (int) ($_POST['exchange_id'] ?? 0);
            $wishlistId = (int) ($_POST['wishlist_id'] ?? 0);
            $pickupDate = trim($_POST['pickup_date'] ?? date('Y-m-d'));
            $pickupTime = trim($_POST['pickup_time'] ?? '12:00');
            $assignedCoord = trim($_POST['assigned_coordinator'] ?? 'shared');

            $stmtW = $db->prepare('SELECT * FROM material_wishlist WHERE id = ?');
            $stmtW->execute([$wishlistId]);
            $wRow = $stmtW->fetch(PDO::FETCH_ASSOC);

            if ($exchangeId && $wRow) {
                // تحديث حالة المادة إلى محجوزة للطالب
                $stmtBook = $db->prepare("UPDATE material_exchanges SET 
                    status = 'reserved', 
                    booker_name = ?, 
                    booker_phone = ?, 
                    booker_gender = ?, 
                    booked_at = CURRENT_TIMESTAMP, 
                    pickup_date = ?, 
                    pickup_time = ?, 
                    assigned_coordinator = ?, 
                    delivery_status = 'scheduled', 
                    notes = CASE WHEN notes != '' THEN notes || ' | تم الربط الذكي من قائمة الانتظار' ELSE 'تم الربط الذكي من قائمة الانتظار' END,
                    updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?");
                $stmtBook->execute([
                    $wRow['student_name'],
                    $wRow['student_phone'],
                    $wRow['student_gender'] ?? 'male',
                    $pickupDate,
                    $pickupTime,
                    $assignedCoord,
                    $exchangeId
                ]);

                // تحديث حالة الطلب في قائمة الرغبات إلى مكتمل
                $stmtUpdateW = $db->prepare("UPDATE material_wishlist SET status = 'fulfilled', matched_exchange_id = ? WHERE id = ?");
                $stmtUpdateW->execute([$exchangeId, $wishlistId]);

                log_activity("مطابقة ذكية: حجز المادة #$exchangeId للطالب \"{$wRow['student_name']}\" هاتف: {$wRow['student_phone']} من قائمة الانتظار", 'material_exchange');
                $message = "⚡ تمت المطابقة والربط الذكي بنجاح! تم حجز الكتاب للطالب ({$wRow['student_name']}).";
            } else {
                $message = 'تعذر إتمام المطابقة، يرجى التأكد من اختيار الكتاب والطلب.';
                $messageType = 'error';
            }
        }

        // 9. إضافة طالب إلى قائمة انتظار الكتب (Wishlist)
        elseif ($action === 'add_to_wishlist') {
            $studentName = trim($_POST['student_name'] ?? '');
            $studentPhone = trim($_POST['student_phone'] ?? '');
            $studentGender = $_POST['student_gender'] ?? 'male';
            $materialName = trim($_POST['material_name'] ?? '');
            $courseCode = trim($_POST['course_code'] ?? '');
            $faculty = trim($_POST['faculty'] ?? 'عام');
            $notes = trim($_POST['notes'] ?? '');

            if ($studentName === '' || $materialName === '') {
                $message = 'الرجاء إدخال اسم الطالب واسم الكتاب المطلوب.';
                $messageType = 'error';
            } else {
                $stmtAddW = $db->prepare('INSERT INTO material_wishlist (student_name, student_phone, student_gender, material_name, course_code, faculty, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
                $stmtAddW->execute([$studentName, $studentPhone, $studentGender, $materialName, $courseCode, $faculty, $notes]);
                log_activity("إضافة طلب جديد إلى قائمة الانتظار: كتاب \"$materialName\" للطالب \"$studentName\"", 'material_exchange');
                $message = "تمت إضافة الطالب ($studentName) إلى قائمة الانتظار بنجاح.";
            }
        }

        // 10. حذف طلب من قائمة الانتظار
        elseif ($action === 'delete_wishlist') {
            $wId = (int) ($_POST['wishlist_id'] ?? 0);
            $stmtDelW = $db->prepare('DELETE FROM material_wishlist WHERE id = ?');
            $stmtDelW->execute([$wId]);
            $message = 'تم حذف الطلب من قائمة الانتظار بنجاح.';
        }

        // 11. موافقة الإدارة وتوجيه طلب التبرع المعلق
        elseif ($action === 'approve_donation') {
            if (!$isDonationsAdmin) {
                $message = '⛔ عذراً، اعتماد وتوجيه طلبات التبرع مخصص للإدارة العامة فقط.';
                $messageType = 'error';
            } else {
                $id = (int) ($_POST['id'] ?? 0);
                $assignedCoord = trim($_POST['assigned_coordinator'] ?? 'shared');
                $faculty = trim($_POST['faculty'] ?? '');
                $courseCode = trim($_POST['course_code'] ?? '');
                $adminNotes = trim($_POST['notes'] ?? '');

                $stmtM = $db->prepare('SELECT id, material_name, firestore_id, donor_name FROM material_exchanges WHERE id = ? LIMIT 1');
                $stmtM->execute([$id]);
                $mRow = $stmtM->fetch(PDO::FETCH_ASSOC);

                if ($mRow) {
                    $upd = $db->prepare('UPDATE material_exchanges SET 
                        status = "approved",
                        assigned_coordinator = ?,
                        faculty = CASE WHEN ? != "" THEN ? ELSE faculty END,
                        course_code = CASE WHEN ? != "" THEN ? ELSE course_code END,
                        notes = CASE WHEN ? != "" THEN (CASE WHEN notes != "" THEN notes || " | " || ? ELSE ? END) ELSE notes END,
                        updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?');
                    $upd->execute([$assignedCoord, $faculty, $faculty, $courseCode, $courseCode, $adminNotes, $adminNotes, $adminNotes, $id]);

                    if (!empty($mRow['firestore_id']) && function_exists('mark_donation_approved_in_firestore')) {
                        try {
                            mark_donation_approved_in_firestore($mRow['firestore_id'], $mRow['material_name']);
                        } catch (Throwable $e) {}
                    }

                    if (function_exists('sync_material_exchanges_to_frontend')) {
                        sync_material_exchanges_to_frontend($db);
                    }

                    log_activity("موافقة وتوجيه طلب التبرع بالمادة #$id (\"{$mRow['material_name']}\") إلى " . ($assignedCoord === 'shared' ? 'جدول المشترك' : "المنسق #$assignedCoord"), 'material_exchange');
                    $message = "✅ تمت الموافقة على طلب التبرع بالمادة ({$mRow['material_name']}) وتوجيهها بنجاح إلى جدول المواد المتاحة.";
                } else {
                    $message = 'لم يتم العثور على طلب التبرع المحدد.';
                    $messageType = 'error';
                }
            }
        }

        // 12. رفض وحذف طلب التبرع المعلق
        elseif ($action === 'reject_donation') {
            if (!$isDonationsAdmin) {
                $message = '⛔ عذراً، رفض طلبات التبرع مخصص للإدارة العامة فقط.';
                $messageType = 'error';
            } else {
                $id = (int) ($_POST['id'] ?? 0);
                $stmtDel = $db->prepare('DELETE FROM material_exchanges WHERE id = ? AND status = "pending"');
                $stmtDel->execute([$id]);
                $message = 'تم رفض وحذف طلب التبرع بنجاح.';
            }
        }
    }
}

/* ---------- الفلاتر والتبويبات والبحث ---------- */
$activeTab = $_GET['tab'] ?? 'all'; // all | available | reserved | schedule | completed | pending
$archiveFilter = $_GET['archive'] ?? '';
$archiveFilter = $archiveVisibility === '1' ? $archiveFilter : '';
$statusFilter = $_GET['status'] ?? '';
$facultyFilter = $_GET['faculty'] ?? '';
$coordFilter = $_GET['coord'] ?? '';
$search = trim($_GET['q'] ?? '');
$editId = isset($_GET['edit']) ? (int) $_GET['edit'] : null;

$sql = 'SELECT * FROM material_exchanges WHERE 1=1';
$params = [];

if ($activeTab === 'all' && $statusFilter === '') {
    $sql .= " AND status != 'pending'";
} elseif ($activeTab === 'available') {
    $sql .= " AND status = 'approved'";
} elseif ($activeTab === 'reserved') {
    $sql .= " AND status = 'reserved'";
} elseif ($activeTab === 'shared') {
    $sql .= " AND (assigned_coordinator = 'shared' OR assigned_coordinator = 'admin' OR assigned_coordinator = '' OR assigned_coordinator IS NULL) AND status != 'pending'";
} elseif ($activeTab === 'completed') {
    $sql .= " AND status = 'completed'";
} elseif ($activeTab === 'pending') {
    $sql .= " AND status = 'pending'";
} elseif ($activeTab === 'schedule') {
    $sql .= " AND (status = 'reserved' OR pickup_date IS NOT NULL) AND status != 'pending'";
}

if ($statusFilter !== '') {
    $sql .= ' AND status = ?';
    $params[] = $statusFilter;
}
if ($facultyFilter !== '') {
    $sql .= ' AND faculty = ?';
    $params[] = $facultyFilter;
}
if ($coordFilter !== '') {
    if ($coordFilter === 'shared') {
        $sql .= " AND (assigned_coordinator = 'shared' OR assigned_coordinator = 'admin' OR assigned_coordinator = '' OR assigned_coordinator IS NULL)";
    } elseif ($coordFilter === 'male_all') {
        $maleIds = array_keys(array_filter($coordinatorsList, fn($c) => ($c['gender'] ?? '') !== 'female' && $c['id'] !== 'shared'));
        if (!empty($maleIds)) {
            $inClause = implode(',', array_map(fn($i) => "'" . addslashes((string)$i) . "'", $maleIds));
            $sql .= " AND assigned_coordinator IN ($inClause)";
        } else {
            $sql .= " AND 1=0";
        }
    } elseif ($coordFilter === 'female_all') {
        $femaleIds = array_keys(array_filter($coordinatorsList, fn($c) => ($c['gender'] ?? '') === 'female'));
        if (!empty($femaleIds)) {
            $inClause = implode(',', array_map(fn($i) => "'" . addslashes((string)$i) . "'", $femaleIds));
            $sql .= " AND assigned_coordinator IN ($inClause)";
        } else {
            $sql .= " AND 1=0";
        }
    } else {
        $sql .= ' AND assigned_coordinator = ?';
        $params[] = $coordFilter;
    }
}
if ($search !== '') {
    $sql .= ' AND (material_name LIKE ? OR donor_name LIKE ? OR donor_phone LIKE ? OR booker_name LIKE ? OR booker_phone LIKE ? OR course_code LIKE ?)';
    $searchTerm = "%$search%";
    $params[] = $searchTerm;
    $params[] = $searchTerm;
    $params[] = $searchTerm;
    $params[] = $searchTerm;
    $params[] = $searchTerm;
    $params[] = $searchTerm;
}

if ($archiveFilter === 'all') {
    // عرض جميع السجلات عبر كافة الحملات والأرشيف
} elseif ($archiveFilter !== '' && $archiveFilter !== 'current') {
    $sql .= ' AND archive_key = ?';
    $params[] = $archiveFilter;
} else {
    // الحملة الحالية
    $sql .= ' AND archive_key IS NULL';
}

if ($activeTab === 'schedule') {
    $sql .= ' ORDER BY pickup_date ASC, pickup_time ASC, created_at DESC';
} else {
    $sql .= ' ORDER BY created_at DESC';
}

$stmt = $db->prepare($sql);
$stmt->execute($params);
$materials = $stmt->fetchAll(PDO::FETCH_ASSOC);

// توليد رمز QR الآمن لكل مادة
foreach ($materials as &$mItem) {
    $mItem['qr_token'] = hash('sha256', $mItem['id'] . '_makanak_delivery_secure_salt_2026');
}
unset($mItem);

// جلب طلبات قائمة الانتظار (Wishlist) وحساب المطابقة الذكية
$db->exec("CREATE TABLE IF NOT EXISTS material_wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT NOT NULL,
    student_phone TEXT NOT NULL,
    student_gender TEXT DEFAULT 'male',
    material_name TEXT NOT NULL,
    course_code TEXT,
    faculty TEXT,
    notes TEXT,
    status TEXT DEFAULT 'waiting',
    matched_exchange_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
)");
$wishlistItems = $db->query("SELECT * FROM material_wishlist WHERE status = 'waiting' ORDER BY created_at DESC")->fetchAll(PDO::FETCH_ASSOC);

// حساب المطابقات الذكية
$smartMatches = [];
$totalSmartMatchesCount = 0;
foreach ($materials as $mRow) {
    if ($mRow['status'] === 'approved') {
        $mNameClean = trim(mb_strtolower($mRow['material_name']));
        $mCodeClean = trim(mb_strtolower($mRow['course_code'] ?? ''));
        $matchedWishlist = [];
        foreach ($wishlistItems as $wItem) {
            $wClean = trim(mb_strtolower($wItem['material_name']));
            $wCode = trim(mb_strtolower($wItem['course_code'] ?? ''));
            if (mb_stripos($mNameClean, $wClean) !== false || mb_stripos($wClean, $mNameClean) !== false || ($mCodeClean !== '' && $wCode !== '' && $mCodeClean === $wCode)) {
                $matchedWishlist[] = $wItem;
            }
        }
        if (!empty($matchedWishlist)) {
            $smartMatches[$mRow['id']] = $matchedWishlist;
            $totalSmartMatchesCount += count($matchedWishlist);
        }
    }
}

/* ---------- إحصائيات المؤشرات (KPIs) ---------- */
$archiveWhere = "";
if ($archiveFilter === 'all') {
    $archiveWhere = "1=1";
} elseif ($archiveFilter !== '' && $archiveFilter !== 'current') {
    $archiveWhere = "archive_key = " . $db->quote($archiveFilter);
} else {
    $archiveWhere = "archive_key IS NULL";
}

$totalMaterials = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE $archiveWhere AND status != 'pending'")->fetchColumn();
$availableCount = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE $archiveWhere AND status = 'approved'")->fetchColumn();
$reservedCount = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE $archiveWhere AND status = 'reserved'")->fetchColumn();
$sharedCount = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE $archiveWhere AND status != 'pending' AND (assigned_coordinator = 'shared' OR assigned_coordinator = 'admin' OR assigned_coordinator = '' OR assigned_coordinator IS NULL)")->fetchColumn();
$completedCount = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE $archiveWhere AND status = 'completed'")->fetchColumn();
$pendingCount = (int) $db->query("SELECT COUNT(*) FROM material_exchanges WHERE $archiveWhere AND status = 'pending'")->fetchColumn();
$archiveStats = $db->query("SELECT archive_key, archive_label, COUNT(*) AS total, SUM(status = 'completed') AS completed, SUM(status = 'reserved') AS reserved, SUM(status = 'approved') AS available FROM material_exchanges WHERE archive_key IS NOT NULL GROUP BY archive_key, archive_label ORDER BY CASE archive_key WHEN 'second_2025_2026' THEN 1 WHEN 'summer_2025_2026' THEN 2 ELSE 3 END")->fetchAll(PDO::FETCH_ASSOC);

// حساب التسمية النصية للشارة المعروضة للحملة أو الأرشيف مبكراً لمنع أي تحذيرات
$campaignBadgeText = '';
if ($archiveFilter === 'all') {
    $campaignBadgeText = 'كافة الحملات والأرشيف';
} elseif ($archiveFilter !== '' && $archiveFilter !== 'current') {
    foreach ($archiveStats as $arch) {
        if ($arch['archive_key'] === $archiveFilter) {
            $campaignBadgeText = $arch['archive_label'];
            break;
        }
    }
    if ($campaignBadgeText === '') {
        $campaignBadgeText = 'أرشيف: ' . $archiveFilter;
    }
} else {
    $campaignBadgeText = 'الحملة الحالية (' . $currentCampaignLabel . ')';
}

// قائمة الكليات — مأخوذة من مشروع مكانك الرسمي (faculties في coursesData.js + MaterialExchange.jsx)
$facultiesList = [
    'كلية الذكاء الاصطناعي',
    'كلية الأمير عبدالله للاتصالات وتكنولوجيا المعلومات',
    'متطلبات الجامعة الإجبارية والاختيارية',
    'كلية العلوم',
    'كلية الهندسة والتكنولوجيا',
    'كلية الأعمال والاقتصاد',
    'كلية الآداب والعلوم الإنسانية',
    'كلية الشريعة والدراسات الإسلامية',
    'كلية اللغات الأجنبية',
    'كلية التمريض والعلوم الطبية',
    'كلية الصيدلة',
    'كلية الطب البشري',
    'أخرى / عام'
];

$specializationsByFaculty = [
    'كلية الذكاء الاصطناعي' => [
        'التحقيقات الجنائية الرقمية (DF)',
        'أمن المعلومات والفضاء الإلكتروني (Cyber)',
        'الذكاء الاصطناعي والروبوتات (AI)',
        'الواقع الافتراضي والمعزز (VR)',
        'علم البيانات (DS)',
    ],
    'كلية الأمير عبدالله للاتصالات وتكنولوجيا المعلومات' => [
        'علم الحاسوب (CS)',
        'الرسم الحاسوبي والرسوم المتحركة (CGA)',
        'نظم المعلومات الحاسوبية (CIS)',
        'هندسة البرمجيات (SE)',
    ],
];

// بناء قائمة المنسقين ديناميكياً من قاعدة البيانات
// القيمة الخاصة 'shared' = غير مسند / قسم مشترك
$coordinatorsList = [
    'shared' => [
        'id' => 'shared',
        'name' => 'غير مسند / تسليم مشترك',
        'short_name' => 'مشترك',
        'gender' => 'all',
        'badge' => 'مشترك',
        'bg' => '#faf5ff',
        'color' => '#7e22ce',
        'border' => '#e9d5ff',
        'role_type' => 'shared',
    ],
];

// إضافة المنسقين من قاعدة البيانات
$maleColors = ['#0284c7', '#0369a1', '#0e7490', '#047857', '#1d4ed8'];
$femaleColors = ['#db2777', '#be185d', '#9d174d', '#7c3aed', '#b45309'];
$maleColorIdx = 0;
$femaleColorIdx = 0;

foreach ($activeCoordinators as $coord) {
    $coordKey = (string) $coord['id'];
    $isFemale = ($coord['gender'] === 'female');
    $roleLabel = match($coord['role_type'] ?? 'coordinator') {
        'lead_coordinator' => 'منسق رئيسي',
        'coordinator' => 'منسق',
        default => 'منسق'
    };
    if ($isFemale) {
        $color = $femaleColors[$femaleColorIdx % count($femaleColors)];
        $femaleColorIdx++;
        $bg = '#fdf2f8';
        $border = '#fbcfe8';
    } else {
        $color = $maleColors[$maleColorIdx % count($maleColors)];
        $maleColorIdx++;
        $bg = '#f0f9ff';
        $border = '#bae6fd';
    }
    $coordinatorsList[$coordKey] = [
        'id' => $coord['id'],
        'name' => $coord['name'] . ' (' . $roleLabel . ')',
        'short_name' => $coord['name'],
        'gender' => $coord['gender'],
        'badge' => $roleLabel,
        'bg' => $bg,
        'color' => $color,
        'border' => $border,
        'role_type' => $coord['role_type'] ?? 'coordinator',
        'faculty' => $coord['faculty'] ?? '',
    ];
}

$statusLabels = [
    'approved' => ['label' => 'متاح للاستلام', 'class' => 'badge-success'],
    'reserved' => ['label' => 'محجوز للطالب', 'class' => 'badge-warning'],
    'completed' => ['label' => 'تم التسليم بنجاح', 'class' => 'badge-completed'],
    'pending' => ['label' => 'قيد المراجعة', 'class' => 'badge-pending'],
    'cancelled' => ['label' => 'ملغي', 'class' => 'badge-cancelled'],
];

$deliveryStatusLabels = [
    'pending_contact' => ['label' => 'بانتظار التواصل', 'color' => '#64748b'],
    'contacted' => ['label' => 'تم التواصل', 'color' => '#0284c7'],
    'scheduled' => ['label' => 'موعد مؤكد', 'color' => '#d97706'],
    'completed' => ['label' => 'تم التسليم', 'color' => '#16a34a'],
];

/* ---------- سجل التعديل الجاري إن وجد ---------- */
$editRow = null;
if ($editId) {
    $stmtEdit = $db->prepare('SELECT * FROM material_exchanges WHERE id = ?');
    $stmtEdit->execute([$editId]);
    $editRow = $stmtEdit->fetch(PDO::FETCH_ASSOC);
}

// دالة توليد رابط واتساب مع رسالة جاهزة ومهذبة
function buildWhatsAppLink($phone, $message)
{
    if (empty($phone))
        return '#';
    $cleanPhone = preg_replace('/\D/', '', $phone);
    if (str_starts_with($cleanPhone, '07') && strlen($cleanPhone) === 10) {
        $cleanPhone = '962' . substr($cleanPhone, 1);
    } elseif (str_starts_with($cleanPhone, '7') && strlen($cleanPhone) === 9) {
        $cleanPhone = '962' . $cleanPhone;
    }
    return 'https://wa.me/' . $cleanPhone . '?text=' . rawurlencode($message);
}

/* ---------- طباعة كشف المواد الرسمي المنسق للطباعة و PDF ---------- */
if (isset($_GET['action']) && $_GET['action'] === 'print_sheet') {
    $sheetTitle = 'كشف تبادل وتسليم المواد الدراسية';
    if ($activeTab === 'available') $sheetTitle = 'كشف المواد المتاحة للاستلام بالمستودع';
    elseif ($activeTab === 'reserved') $sheetTitle = 'كشف المواد المحجوزة وجداول مواعيد التسليم';
    elseif ($activeTab === 'completed') $sheetTitle = 'كشف المواد المسلّمة رسمياً للطلبة';
    elseif ($activeTab === 'pending') $sheetTitle = 'كشف طلبات التبرع المنتظرة للمراجعة والاعتماد';
    elseif ($activeTab === 'shared') $sheetTitle = 'كشف جدول التسليم المشترك وغير المفرز';
    ?>
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title><?= htmlspecialchars($sheetTitle) ?> — منصة مكانك</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Cairo', sans-serif; padding: 25px 30px; color: #0f172a; background: #fff; line-height: 1.5; font-size: 12px; }
            .no-print-bar { margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; background: #f0f9ff; border: 1.5px solid #bae6fd; padding: 12px 18px; border-radius: 10px; box-shadow: 0 2px 8px rgba(2,132,199,0.08); }
            .btn-prt { background: #0284c7; color: #fff; border: none; border-radius: 8px; padding: 9px 20px; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(2,132,199,0.3); }
            .btn-prt:hover { background: #0369a1; }
            .btn-cls { background: #fff; color: #475569; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 16px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; }
            .btn-cls:hover { background: #f8fafc; color: #0f172a; }
            
            .print-header { border-bottom: 2.5px solid #0284c7; padding-bottom: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
            .brand-title { font-size: 21px; font-weight: 900; color: #0284c7; }
            .sheet-sub { font-size: 13.5px; font-weight: 800; color: #1e293b; margin-top: 3px; }
            .meta-box { font-size: 11.5px; color: #64748b; text-align: left; }
            
            .summary-bar { display: flex; gap: 14px; margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 14px; font-size: 12px; }
            .summary-bar span { font-weight: 800; color: #0284c7; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: right; vertical-align: middle; }
            th { background: #f1f5f9; color: #0f172a; font-weight: 800; font-size: 12px; }
            tr:nth-child(even) { background: #fafbfc; }
            
            .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; }
            .badge-completed { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
            .badge-reserved { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
            .badge-approved { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
            .badge-pending { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
            
            .signatures-block { display: flex; justify-content: space-between; margin-top: 36px; padding-top: 10px; page-break-inside: avoid; }
            .sig-box { text-align: center; width: 200px; }
            .sig-title { font-weight: 800; color: #334155; font-size: 12px; }
            .sig-line { border-bottom: 1.5px dotted #94a3b8; height: 40px; margin-top: 6px; }
            
            @media print {
                .no-print-bar { display: none !important; }
                body { padding: 0 !important; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
            }
        </style>
    </head>
    <body>
        <div class="no-print-bar">
            <div style="font-weight: 800; color: #0369a1; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                <span>📄 كشف المواد والكتب الدراسية — جاهز للطباعة أو التصدير PDF</span>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-prt" onclick="window.print()">🖨️ بدء الطباعة الآن</button>
                <button class="btn-cls" onclick="window.close()">✕ إغلاق النافذة</button>
            </div>
        </div>

        <div class="print-header">
            <div>
                <div class="brand-title">منصة مكانك — مبادرة تبادل المواد والكتب الدراسية</div>
                <div class="sheet-sub"><?= htmlspecialchars($sheetTitle) ?></div>
            </div>
            <div class="meta-box">
                <div>تاريخ الطباعة: <strong><?= date('Y-m-d H:i') ?></strong></div>
                <div>المشرف المنفذ: <strong><?= htmlspecialchars($_donationsCurrentUser['full_name'] ?? $_donationsCurrentUser['username'] ?? 'الإدارة') ?></strong></div>
            </div>
        </div>

        <div class="summary-bar">
            <div>الحملة المعتمدة: <span><?= htmlspecialchars($campaignBadgeText) ?></span></div>
            <div>إجمالي السجلات: <span><?= count($materials) ?> مادة</span></div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width: 40px; text-align: center;">#</th>
                    <th>اسم المادة / الكتاب</th>
                    <th>الكلية والرمز</th>
                    <th>الطالب المتبرع</th>
                    <th>الطالب المستلم</th>
                    <th>المنسق المشرف</th>
                    <th>موعد الاستلام</th>
                    <th style="width: 85px; text-align: center;">الحالة</th>
                    <th style="width: 110px;">توقيع الاستلام</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($materials)): ?>
                    <tr>
                        <td colspan="9" style="text-align: center; padding: 30px; color: #94a3b8;">لا توجد مواد في هذا الكشف حالياً.</td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($materials as $idx => $m): 
                        $statusTxt = $m['status'] === 'completed' ? 'تم التسليم' : ($m['status'] === 'reserved' ? 'محجوز' : ($m['status'] === 'pending' ? 'بانتظار الموافقة' : 'متاح'));
                        $badgeCls = 'badge-' . $m['status'];
                    ?>
                        <tr>
                            <td style="text-align: center; font-weight: 700; color: #64748b;"><?= $idx + 1 ?></td>
                            <td>
                                <strong><?= htmlspecialchars($m['material_name']) ?></strong>
                                <?php if (!empty($m['description'])): ?>
                                    <div style="font-size: 11px; color: #64748b;"><?= htmlspecialchars($m['description']) ?></div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div><?= htmlspecialchars($m['faculty'] ?: 'متطلب عام') ?></div>
                                <?php if (!empty($m['course_code'])): ?>
                                    <small style="color: #64748b;"><?= htmlspecialchars($m['course_code']) ?></small>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div><?= htmlspecialchars($m['donor_name'] ?: '—') ?></div>
                                <?php if (!empty($m['donor_phone'])): ?>
                                    <small dir="ltr" style="color: #64748b;"><?= htmlspecialchars($m['donor_phone']) ?></small>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div><?= htmlspecialchars($m['booker_name'] ?: '—') ?></div>
                                <?php if (!empty($m['booker_phone'])): ?>
                                    <small dir="ltr" style="color: #64748b;"><?= htmlspecialchars($m['booker_phone']) ?></small>
                                <?php endif; ?>
                            </td>
                            <td><?= htmlspecialchars($coordinatorsList[$m['assigned_coordinator']]['name'] ?? ($m['assigned_coordinator'] ?: 'مشترك')) ?></td>
                            <td><?= htmlspecialchars(trim(($m['pickup_date'] ?? '') . ' ' . ($m['pickup_time'] ?? '')) ?: '—') ?></td>
                            <td style="text-align: center;"><span class="badge <?= $badgeCls ?>"><?= $statusTxt ?></span></td>
                            <td></td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>

        <div class="signatures-block">
            <div class="sig-box">
                <div class="sig-title">توقيع المنسق المشرف</div>
                <div class="sig-line"></div>
            </div>
            <div class="sig-box">
                <div class="sig-title">اعتماد إدارة الحملة</div>
                <div class="sig-line"></div>
            </div>
            <div class="sig-box">
                <div class="sig-title">ختم منصة مكانك</div>
                <div class="sig-line"></div>
            </div>
        </div>

        <script>
            window.onload = function() {
                window.print();
            };
        </script>
    </body>
    </html>
    <?php
    exit;
}

require __DIR__ . '/_header.php';
?>

<style>
@media print {
    .sidebar,
    .top-header,
    .stats-grid,
    .semester-archive-panel,
    .tabs-header-wrapper,
    .panel-box,
    .alert-msg,
    .custom-modal-overlay:not(#slipModal),
    .no-print,
    .table-action-btns,
    .whatsapp-quick-btn {
        display: none !important;
    }
    body {
        background: #fff !important;
        color: #000 !important;
        padding: 0 !important;
        margin: 0 !important;
    }
    .main-content {
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
    }
    #slipModal {
        position: static !important;
        display: block !important;
        background: transparent !important;
        padding: 0 !important;
        width: 100% !important;
        box-shadow: none !important;
    }
    #slipModal .custom-modal-box {
        box-shadow: none !important;
        border: none !important;
        max-width: 100% !important;
        padding: 0 !important;
        width: 100% !important;
    }
}
</style>

<!-- تنبيه الرسائل الإجرائية -->
<?php if ($message): ?>
    <div class="alert-msg <?= $messageType === 'success' ? 'alert-success' : 'alert-error' ?>"
        style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
            </svg>
            <span><?= htmlspecialchars($message) ?></span>
        </div>
        <button type="button" onclick="this.parentElement.remove()"
            style="background:none; border:none; color:inherit; cursor:pointer; font-size:16px;">✕</button>
    </div>
<?php endif; ?>

<!-- بنر المطابقة الذكية للكتب في قائمة الانتظار -->
<?php if ($totalSmartMatchesCount > 0): ?>
    <div style="background:linear-gradient(135deg, #fdf4ff, #fae8ff); border:1.5px solid #d8b4fe; border-radius:14px; padding:16px 20px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; box-shadow:0 4px 15px rgba(147, 51, 234, 0.08);">
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:#9333ea; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 4px 12px rgba(147, 51, 234, 0.3);">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
            </div>
            <div>
                <div style="font-weight:800; font-size:15px; color:#581c87; display:flex; align-items:center; gap:8px;">
                    <span>مطابقة ذكية: تم العثور على <?= $totalSmartMatchesCount ?> طلب في قائمة الانتظار لكتب متوفرة بالمستودع!</span>
                    <span style="background:#7e22ce; color:#fff; font-size:11px; font-weight:700; padding:2px 8px; border-radius:9999px;">تنبيه فوري</span>
                </div>
                <div style="font-size:12.5px; color:#7e22ce; margin-top:2px;">يوجد طلاب يبحثون عن كتب متوفرة حالياً. اضغط على شارة "ربط فوري" داخل الجداول أو افتح قائمة الانتظار.</div>
            </div>
        </div>
        <button type="button" class="btn" onclick="openWishlistModal()" style="background:#9333ea; color:#fff; font-size:13px; font-weight:700; border-radius:10px; padding:9px 18px; border:none; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <polyline points="16 11 18 13 22 9" />
            </svg>
            قائمة الانتظار (<?= count($wishlistItems) ?> طلب)
        </button>
    </div>
<?php endif; ?>

<!-- بطاقات المؤشرات الرقمية (KPIs) -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي المواد والكتب</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                    <path d="M6 6h10M6 10h10" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($totalMaterials) ?></div>
        <div class="stats-footer">
            <span class="trend-up">كتب ومواد أكاديمية</span>
            <span>مسجلة بالمنصة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">المواد المتاحة للاستلام</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 14 14" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#16a34a;"><?= number_format($availableCount) ?></div>
        <div class="stats-footer">
            <span style="color:#16a34a; font-weight:700;">جاهزة للحجز الفوري</span>
            <span>بالمستودع</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">المواد المحجوزة</span>
            <div class="stats-icon-box icon-gold">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#d97706;"><?= number_format($reservedCount) ?></div>
        <div class="stats-footer">
            <span style="color:#d97706; font-weight:700;">بانتظار التسليم</span>
            <span>للطلبة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">مواد تم تسليمها بنجاح</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#9333ea;"><?= number_format($completedCount) ?></div>
        <div class="stats-footer">
            <span class="trend-up">مستفيد مكتمل</span>
            <span>عملية تبادل ناجحة</span>
        </div>
    </div>
</div>

<!-- الحملة الحالية -->
<section class="panel-box" style="margin-top:24px;border:1px solid #bfdbfe;background:#f8fbff;">
    <div style="padding:18px;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;">
        <div>
            <h2 class="panel-box-title" style="display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0284c7" stroke-width="2">
                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                    <path d="M6 6h10" />
                    <path d="M6 10h10" />
                </svg>
                <span>حملة تبادل المواد الحالية</span>
            </h2>
            <div style="font-size:12px;color:#64748b;margin-top:4px;"><?= htmlspecialchars($currentCampaignLabel) ?> · الطلبات الجديدة من الموقع تظهر هنا</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <?php if ($isDonationsAdmin): ?>
            <button type="button" class="btn" style="background:#f59e0b;color:#fff;border:1px solid #d97706;" onclick="openArchiveCampaignModal()">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="20" height="5" x="2" y="3" rx="1" />
                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                    <path d="M10 12h4" />
                </svg>
                أرشفة الحملة الحالية
            </button>

            <form method="post" style="margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <input type="hidden" name="action" value="start_new_campaign">
                <input type="text" name="campaign_label" placeholder="اسم الفصل الجديد" aria-label="اسم الفصل الجديد"
                    style="min-width:180px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;">
                <button type="submit" class="btn btn-primary" style="padding:8px 14px;">فتح حملة جديدة</button>
            </form>
            <?php else: ?>
            <span style="font-size:12px;color:#94a3b8;display:flex;align-items:center;gap:6px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                إدارة الحملات والأرشفة مخصصة للإدارة فقط
            </span>
            <?php endif; ?>
        </div>
    </div>
</section>

<!-- أرشيف الحملات حسب الفصل الدراسي (قائمة مطوية) -->
<?php if ($archiveVisibility === '1' && $canViewArchive): ?>
    <?php
    $archiveUrlParam = $archiveFilter !== '' ? '&amp;archive=' . urlencode($archiveFilter) : '';
    $isArchiveSelected = (!empty($archiveFilter) && $archiveFilter !== 'current');
    ?>
    <details class="panel-box semester-archive-panel" style="margin-top:20px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;" <?= $isArchiveSelected ? 'open' : '' ?>>
        <summary style="padding:16px 20px; cursor:pointer; font-weight:800; font-size:15px; display:flex; justify-content:space-between; align-items:center; background:#f8fafc; border-bottom:1px solid #e2e8f0; list-style:none; user-select:none;">
            <div style="display:flex; align-items:center; gap:10px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#475569" stroke-width="2">
                    <rect width="20" height="5" x="2" y="3" rx="1" />
                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                    <path d="M10 12h4" />
                </svg>
                <span style="color:#1e293b;">📂 أرشيف الفصول والحملات السابقة (قائمة مطوية — اضغط للاستعراض)</span>
                <?php if ($isArchiveSelected): ?>
                    <span style="font-size:12px; background:#0284c7; color:#fff; padding:2px 10px; border-radius:999px; font-weight:700;">مستعرض حالياً: <?= htmlspecialchars($campaignBadgeText) ?></span>
                <?php endif; ?>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; color:#64748b;">(<?= count($archiveStats) ?> فصول سابقة)</span>
                <span style="font-size:14px; color:#94a3b8;">▼</span>
            </div>
        </summary>
        
        <div style="padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                <div style="font-size:13px; color:#64748b;">
                    يمكنك استعراض بيانات الفصول السابقة كأرشيف تاريخي (متاح للمنسقين للاطلاع فقط دون تعديل أو حذف).
                </div>
                <div style="display:flex; gap:8px;">
                    <a href="?tab=<?= htmlspecialchars($activeTab) ?>" class="btn <?= (empty($archiveFilter) || $archiveFilter === 'current') ? 'btn-primary' : 'btn-secondary' ?>" style="text-decoration:none; font-size:12.5px;">
                        📌 الحملة الحالية (<?= htmlspecialchars($currentCampaignLabel) ?>)
                    </a>
                    <a href="?tab=<?= htmlspecialchars($activeTab) ?>&amp;archive=all" class="btn <?= $archiveFilter === 'all' ? 'btn-primary' : 'btn-secondary' ?>" style="text-decoration:none; font-size:12.5px;">
                        عرض جميع الفصول
                    </a>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;">
                <?php foreach ($archiveStats as $archive): 
                    $isSelected = ($archiveFilter === $archive['archive_key']);
                ?>
                    <a href="?tab=<?= htmlspecialchars($activeTab) ?>&amp;archive=<?= urlencode($archive['archive_key']) ?>"
                        style="text-decoration:none;color:inherit;border:2px solid <?= $isSelected ? '#0284c7' : '#e2e8f0' ?>;border-radius:12px;padding:16px;background:<?= $isSelected ? '#eff6ff' : '#ffffff' ?>;box-shadow:<?= $isSelected ? '0 0 0 2px rgba(2,132,199,0.2)' : '0 1px 3px rgba(0,0,0,0.05)' ?>;transition:all .2s ease;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div style="font-weight:800;color:#0f172a;font-size:14px;display:flex;align-items:center;gap:6px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#0284c7" stroke-width="2">
                                    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                                </svg>
                                <span><?= htmlspecialchars($archive['archive_label']) ?></span>
                            </div>
                            <?php if ($isSelected): ?>
                                <span style="font-size:11px;background:#0284c7;color:#fff;padding:2px 8px;border-radius:9999px;font-weight:600;">معروض حالياً</span>
                            <?php endif; ?>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px;text-align:center;">
                            <span><b style="display:block;color:#0284c7;font-size:20px;"><?= (int) $archive['total'] ?></b><small style="color:#64748b;">الإجمالي</small></span>
                            <span><b style="display:block;color:#16a34a;font-size:20px;"><?= (int) $archive['available'] ?></b><small style="color:#64748b;">متاحة</small></span>
                            <span><b style="display:block;color:#d97706;font-size:20px;"><?= (int) $archive['reserved'] ?></b><small style="color:#64748b;">محجوزة</small></span>
                            <span><b style="display:block;color:#9333ea;font-size:20px;"><?= (int) $archive['completed'] ?></b><small style="color:#64748b;">مكتملة</small></span>
                        </div>
                    </a>
                <?php endforeach; ?>
            </div>
        </div>
    </details>
<?php endif; ?>

<!-- شريط الإجراءات والتبويبات -->
<?php
$archiveUrlParam = $archiveFilter !== '' ? '&amp;archive=' . urlencode($archiveFilter) : '';
?>
<div class="tabs-header-wrapper">
    <div class="tabs-nav">
        <a href="?tab=all<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'all' ? 'active' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
            كافة المواد (<?= $totalMaterials ?>)
        </a>
        <a href="?tab=pending<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'pending' ? 'active' : '' ?>" style="<?= $pendingCount > 0 ? 'background:#fffbeb;border-color:#f59e0b;color:#b45309;' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
            </svg>
            الطلبات المنتظرة (<?= $pendingCount ?>)
            <?php if ($pendingCount > 0): ?>
                <span style="font-size:10px;font-weight:900;background:#f59e0b;color:#fff;padding:2px 7px;border-radius:999px;margin-right:2px;">جديد</span>
            <?php endif; ?>
        </a>
        <a href="?tab=available<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'available' ? 'active' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
            </svg>
            المتاحة للاستلام (<?= $availableCount ?>)
        </a>
        <a href="?tab=reserved<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'reserved' ? 'active' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
            </svg>
            الحجوزات والتسليم (<?= $reservedCount ?>)
        </a>
        <a href="?tab=shared<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'shared' ? 'active' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            جدول مشترك (<?= $sharedCount ?>)
        </a>
        <a href="?tab=schedule<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'schedule' ? 'active' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
            جدول مواعيد المنسقين
        </a>
        <a href="?tab=completed<?= $archiveUrlParam ?>" class="tab-btn <?= $activeTab === 'completed' ? 'active' : '' ?>">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12" />
            </svg>
            المواد المسلّمة (<?= $completedCount ?>)
        </a>
    </div>

    <div class="tabs-actions" style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <button type="button" class="btn" style="background:#8b5cf6; color:#fff; border:1px solid #7c3aed;" onclick="openWishlistModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <polyline points="16 11 18 13 22 9" />
            </svg>
            قائمة الانتظار والطلبات (<?= count($wishlistItems) ?>)
        </button>
        <button type="button" class="btn btn-primary" onclick="openAddMaterialModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إضافة كتاب / مادة متبادلة
        </button>
        <?php if ($isDonationsAdmin): ?>
        <button type="button" class="btn" style="background:#f59e0b; color:#fff; border:1px solid #d97706;" onclick="openArchiveCampaignModal()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="20" height="5" x="2" y="3" rx="1" />
                <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                <path d="M10 12h4" />
            </svg>
            أرشفة الحملة الحالية
        </button>
        <?php endif; ?>
        <a href="?action=print_sheet&tab=<?= urlencode($activeTab) ?>&archive=<?= urlencode($archiveFilter) ?>&status=<?= urlencode($statusFilter) ?>&faculty=<?= urlencode($facultyFilter) ?>&coord=<?= urlencode($coordFilter) ?>&q=<?= urlencode($search) ?>" target="_blank" class="btn btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px;" title="طباعة كشف المواد والكتب المتبادلة رسمياً">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect width="12" height="8" x="6" y="14" />
            </svg>
            <span>طباعة الكشف</span>
        </a>
    </div>
</div>

<!-- صندوق الفلاتر والبحث -->
<div class="panel-box" style="margin-bottom: 20px;">
    <div class="panel-box-body" style="padding: 16px 20px;">
        <form method="get" class="search-filter-grid" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <input type="hidden" name="tab" value="<?= htmlspecialchars($activeTab) ?>">
            <?php if ($archiveFilter !== ''): ?>
                <input type="hidden" name="archive" value="<?= htmlspecialchars($archiveFilter) ?>">
            <?php endif; ?>

            <div class="filter-field search-input-box" style="flex:1; min-width:260px;">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input type="text" name="q" placeholder="ابحث باسم المادة، المتبرع، المستلم، أو الهاتف..."
                    value="<?= htmlspecialchars($search) ?>" class="form-control">
            </div>

            <div class="filter-field" style="min-width:200px;">
                <select name="coord" onchange="this.form.submit()" class="form-control">
                    <option value="">كافة الأقسام والمنسقين</option>
                    <option value="shared" <?= $coordFilter === 'shared' ? 'selected' : '' ?>>قسم التسليم المشترك (غير المفرز)</option>
                    <option value="male_all" <?= $coordFilter === 'male_all' ? 'selected' : '' ?>>كافة منسقي الذكور</option>
                    <option value="female_all" <?= $coordFilter === 'female_all' ? 'selected' : '' ?>>كافة منسقات الإناث</option>
                    <?php 
                    $hasMale = false;
                    foreach ($coordinatorsList as $cKey => $cData) {
                        if ($cKey !== 'shared' && ($cData['gender'] ?? '') !== 'female') {
                            $hasMale = true;
                            break;
                        }
                    }
                    if ($hasMale):
                    ?>
                    <optgroup label="منسقو الذكور">
                        <?php foreach ($coordinatorsList as $cKey => $cData): ?>
                            <?php if ($cKey !== 'shared' && ($cData['gender'] ?? '') !== 'female'): ?>
                                <option value="<?= htmlspecialchars((string)$cKey) ?>" <?= ((string)$coordFilter === (string)$cKey) ? 'selected' : '' ?>>
                                    <?= htmlspecialchars($cData['name']) ?>
                                </option>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </optgroup>
                    <?php endif; ?>
                    <?php 
                    $hasFemale = false;
                    foreach ($coordinatorsList as $cKey => $cData) {
                        if ($cKey !== 'shared' && ($cData['gender'] ?? '') === 'female') {
                            $hasFemale = true;
                            break;
                        }
                    }
                    if ($hasFemale):
                    ?>
                    <optgroup label="منسقات الإناث">
                        <?php foreach ($coordinatorsList as $cKey => $cData): ?>
                            <?php if ($cKey !== 'shared' && ($cData['gender'] ?? '') === 'female'): ?>
                                <option value="<?= htmlspecialchars((string)$cKey) ?>" <?= ((string)$coordFilter === (string)$cKey) ? 'selected' : '' ?>>
                                    <?= htmlspecialchars($cData['name']) ?>
                                </option>
                            <?php endif; ?>
                        <?php endforeach; ?>
                    </optgroup>
                    <?php endif; ?>
                </select>
            </div>

            <div class="filter-actions" style="display:flex; gap:8px;">
                <button type="submit" class="btn btn-primary" style="padding: 8px 16px;">بحث وتطبيق</button>
                <?php if ($search !== '' || $coordFilter !== '' || $statusFilter !== ''): ?>
                    <a href="?tab=<?= htmlspecialchars($activeTab) ?><?= $archiveUrlParam ?>" class="btn btn-secondary"
                        style="padding: 8px 14px;">إلغاء الفلاتر</a>
                <?php endif; ?>
            </div>
        </form>
    </div>
</div>

<!-- تقسيم المواد إلى 3 مجموعات للفرز اليدوي والتسليم -->
<?php
$sharedMaterials = [];
$maleMaterials = [];
$femaleMaterials = [];

foreach ($materials as $mItem) {
    $cKey = (string)($mItem['assigned_coordinator'] ?? '');
    if ($cKey !== '' && $cKey !== 'shared' && isset($coordinatorsList[$cKey])) {
        $coordGender = $coordinatorsList[$cKey]['gender'] ?? 'male';
        if ($coordGender === 'female') {
            $femaleMaterials[] = $mItem;
        } else {
            $maleMaterials[] = $mItem;
        }
    } else {
        $sharedMaterials[] = $mItem;
    }
}

$currentViewTitle = 'سجل تبادل المواد والكتب الدراسية';
if ($activeTab === 'schedule') {
    $currentViewTitle = 'جدول مواعيد التسليم للمنسقين';
} elseif ($activeTab === 'pending') {
    $currentViewTitle = 'طلبات التبرع المنتظرة (بانتظار موافقة وتوجيه الإدارة)';
} elseif ($activeTab === 'reserved') {
    $currentViewTitle = 'قائمة المواد المحجوزة وجاهزة للتسليم';
} elseif ($activeTab === 'shared') {
    $currentViewTitle = 'جدول التسليم المشترك وبانتظار الفرز';
} elseif ($activeTab === 'available') {
    $currentViewTitle = 'المواد المتاحة بالمستودع';
} elseif ($activeTab === 'completed') {
    $currentViewTitle = 'المواد المسلّمة بنجاح';
}

$campaignBadgeText = '';
if ($archiveFilter === 'all') {
    $campaignBadgeText = 'كافة الحملات والأرشيف';
} elseif ($archiveFilter !== '' && $archiveFilter !== 'current') {
    foreach ($archiveStats as $arch) {
        if ($arch['archive_key'] === $archiveFilter) {
            $campaignBadgeText = $arch['archive_label'];
            break;
        }
    }
    if ($campaignBadgeText === '') {
        $campaignBadgeText = 'أرشيف: ' . $archiveFilter;
    }
} else {
    $campaignBadgeText = 'الحملة الحالية (' . $currentCampaignLabel . ')';
}

/**
 * جدول طلبات التبرع المنتظرة (بانتظار موافقة الإدارة)
 * يطابق تماماً خانات النموذج الواردة من الموقع:
 * (اسم الطالب، هاتف واتساب، هاتف التأكيد/البديل، البريد، الجنس، المادة والمحتويات، أسبوع التسليم)
 * الصلاحيات: موافقة وتوجيه ورفض للأدمن فقط | اطلاع فقط للمنسقين
 */
function renderPendingDonationsTable(array $pendingItems, array $coordinatorsList, bool $isDonationsAdmin, string $csrfToken, array $facultiesList): void
{
?>
<div class="custom-table-card" id="section-pending" style="margin-bottom: 24px; border: 2px solid #fef3c7; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 4px 16px rgba(217,119,6,0.08);">
    <div class="table-card-header" style="background: linear-gradient(135deg, #fffbeb, #fef3c7); border-bottom: 1.5px solid #fde68a; padding: 16px 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: #fef3c7; display: flex; align-items: center; justify-content: center; color: #d97706; border: 1px solid #fcd34d;">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                </div>
                <div>
                    <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #92400e; display: flex; align-items: center; gap: 8px;">
                        <span>طلبات التبرع بالمواد المنتظرة</span>
                        <span style="font-size: 12px; background: #d97706; color: #fff; padding: 2px 10px; border-radius: 9999px;"><?= count($pendingItems) ?></span>
                    </h3>
                    <div style="font-size: 12px; color: #b45309; margin-top: 3px;">
                        الطلبات الواردة مباشرة من نموذج التبرع بالمواد على الموقع — تعتمد وتوجّه من الإدارة فقط، وللمنسقين حق الاطلاع
                    </div>
                </div>
            </div>
            <div>
                <?php if ($isDonationsAdmin): ?>
                    <span style="font-size: 12px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 6px 12px; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        صلاحية الاعتماد والتوجيه: مفعلة للأدمن
                    </span>
                <?php else: ?>
                    <span style="font-size: 12px; background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 8px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        اطلاع فقط — الاعتماد والتوجيه مخصص للمشرف العام
                    </span>
                <?php endif; ?>
            </div>
        </div>
    </div>

    <div class="table-card-body" style="padding: 0; overflow-x: auto;">
        <table class="custom-table" style="width: 100%; border-collapse: collapse; min-width: 960px;">
            <thead>
                <tr style="background: #fffdf5; border-bottom: 2px solid #fef3c7;">
                    <th style="width: 45px; text-align: center;">#</th>
                    <th>اسم الطالب المتبرع</th>
                    <th>أرقام وبيانات التواصل</th>
                    <th>المادة المتبرع بها والمحتويات</th>
                    <th>أسبوع التسليم المقترح</th>
                    <th style="width: 130px;">تاريخ الإرسال</th>
                    <th style="width: 120px; text-align: center;">الحالة</th>
                    <th style="width: 180px; text-align: center;">الإجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($pendingItems)): ?>
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 45px 20px; color: #94a3b8;">
                            <div style="font-size: 34px; margin-bottom: 8px;">🎉</div>
                            <div style="font-weight: 700; font-size: 14.5px; color: #475569;">لا توجد أي طلبات تبرع معلقة حالياً</div>
                            <div style="font-size: 12px; margin-top: 4px;">كافة طلبات التبرع الواردة من الموقع تم اعتمادها أو توجيهها بنجاح</div>
                        </td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($pendingItems as $idx => $item): 
                        $phone = preg_replace('/[^0-9]/', '', (string)($item['donor_phone'] ?? ''));
                        $waUrl = '';
                        if ($phone !== '') {
                            $waNum = str_starts_with($phone, '0') ? '962' . substr($phone, 1) : $phone;
                            $waMsg = urlencode("مرحباً بك زميلنا {$item['donor_name']}، نتواصل معك من فريق مكانك بخصوص طلب التبرع بالمادة ({$item['material_name']}).");
                            $waUrl = "https://wa.me/{$waNum}?text={$waMsg}";
                        }
                    ?>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="text-align: center; font-weight: 700; color: #94a3b8;">
                                <?= $idx + 1 ?>
                            </td>
                            <td>
                                <div style="font-weight: 800; font-size: 14px; color: #0f172a;">
                                    <?= htmlspecialchars($item['donor_name'] ?: 'طالب') ?>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                                    <?php if (($item['donor_gender'] ?? '') === 'female'): ?>
                                        <span style="font-size: 11px; background: #fdf2f8; color: #db2777; border: 1px solid #fbcfe8; padding: 2px 7px; border-radius: 6px; font-weight: 700;">
                                            أنثى
                                        </span>
                                    <?php else: ?>
                                        <span style="font-size: 11px; background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; padding: 2px 7px; border-radius: 6px; font-weight: 700;">
                                            ذكر
                                        </span>
                                    <?php endif; ?>
                                </div>
                            </td>
                            <td>
                                <!-- رقم التواصل الأساسي (واتساب) -->
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-weight: 700; font-size: 13px; color: #1e293b; font-family: monospace;" dir="ltr">
                                        <?= htmlspecialchars($item['donor_phone'] ?: '-') ?>
                                    </span>
                                    <?php if ($waUrl !== ''): ?>
                                        <a href="<?= $waUrl ?>" target="_blank" rel="noopener" title="مراسلة سريعة عبر واتساب" style="display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: #25d366; color: #fff; border-radius: 50%; text-decoration: none;">
                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z"/></svg>
                                        </a>
                                    <?php endif; ?>
                                </div>
                                <!-- رقم التأكيد أو البديل -->
                                <?php if (!empty($item['donor_phone_alt']) && $item['donor_phone_alt'] !== $item['donor_phone']): ?>
                                    <div style="font-size: 11px; color: #64748b; margin-top: 3px;" dir="ltr">
                                        بديل: <?= htmlspecialchars($item['donor_phone_alt']) ?>
                                    </div>
                                <?php endif; ?>
                                <!-- البريد الإلكتروني -->
                                <?php if (!empty($item['donor_email'])): ?>
                                    <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                                        <?= htmlspecialchars($item['donor_email']) ?>
                                    </div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div style="font-weight: 800; font-size: 14px; color: #0f172a;">
                                    <?= htmlspecialchars($item['material_name']) ?>
                                </div>
                                <?php if (!empty($item['description'])): ?>
                                    <div style="font-size: 12px; color: #475569; margin-top: 4px; line-height: 1.4; background: #f8fafc; padding: 4px 8px; border-radius: 6px; border: 1px dashed #cbd5e1;">
                                        <?= htmlspecialchars($item['description']) ?>
                                    </div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if (!empty($item['delivery_week'])): ?>
                                    <span style="font-size: 12px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 3px 8px; border-radius: 6px; font-weight: 600; display: inline-block;">
                                        📅 <?= htmlspecialchars($item['delivery_week']) ?>
                                    </span>
                                <?php else: ?>
                                    <span style="color: #94a3b8; font-size: 12px;">غير محدد</span>
                                <?php endif; ?>
                            </td>
                            <td style="font-size: 11.5px; color: #64748b;">
                                <?= htmlspecialchars(substr((string)($item['created_at'] ?? ''), 0, 16)) ?>
                            </td>
                            <td style="text-align: center;">
                                <span style="font-size: 11.5px; background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 4px 8px; border-radius: 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    بانتظار الموافقة
                                </span>
                            </td>
                            <td style="text-align: center;">
                                <?php if ($isDonationsAdmin): ?>
                                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                                        <button type="button" class="btn btn-sm" style="background: #10b981; color: #fff; border: 1px solid #059669; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;"
                                            onclick='openApproveDonationModal(<?= json_encode($item, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'>
                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                            اعتماد وتوجيه
                                        </button>
                                        <form method="post" style="display: inline;" onsubmit="return confirm('تأكيد رفض وحذف طلب التبرع بالمادة (<?= htmlspecialchars($item['material_name']) ?>)؟');">
                                            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrfToken) ?>">
                                            <input type="hidden" name="action" value="reject_donation">
                                            <input type="hidden" name="id" value="<?= $item['id'] ?>">
                                            <button type="submit" class="btn btn-sm" style="background: #ef4444; color: #fff; border: 1px solid #dc2626; padding: 5px 8px; border-radius: 6px;" title="رفض الطلب">
                                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                            </button>
                                        </form>
                                    </div>
                                <?php else: ?>
                                    <span style="font-size: 11px; color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        اطلاع فقط
                                    </span>
                                <?php endif; ?>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
</div>
<?php
}

function renderDonationMaterialsTable($sectionKey, $title, $subtitle, $items, $theme, $coordinatorsList, $statusLabels, $csrfToken, $smartMatches = [], $readOnly = false) {
    $badgeBg = $theme['badge_bg'];
    $badgeColor = $theme['badge_color'];
    $badgeBorder = $theme['badge_border'];
    $svgIcon = $theme['svg'] ?? '';
    $count = count($items);
?>
<div class="panel-box" id="section-<?= $sectionKey ?>" style="margin-bottom: 24px; border: 1.5px solid <?= $badgeBorder ?>; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.03);">
    <div class="panel-box-header" style="background: <?= $badgeBg ?>; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; border-bottom: 1.5px solid <?= $badgeBorder ?>; padding: 14px 20px;">
        <div>
            <h2 class="panel-box-title" style="color: <?= $badgeColor ?>; font-size: 16px; display: flex; align-items: center; gap: 8px; margin:0;">
                <?= $svgIcon ?>
                <span><?= $title ?></span>
                <span style="background: <?= $badgeColor ?>; color: #fff; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 9999px;"><?= $count ?> مادة</span>
            </h2>
            <div style="font-size: 12px; color: #64748b; margin-top: 3px;"><?= $subtitle ?></div>
        </div>
        <div style="font-size: 12px; font-weight: 700; color: <?= $badgeColor ?>; background: #fff; padding: 5px 12px; border-radius: 8px; border: 1px solid <?= $badgeBorder ?>;">
            <?php if ($sectionKey === 'shared'): ?>
                أولوية الفرز والتوزيع
            <?php elseif ($sectionKey === 'male'): ?>
                إشراف منسق الذكور
            <?php else: ?>
                إشراف منسقات الإناث
            <?php endif; ?>
        </div>
        <?php if ($readOnly): ?>
        <div style="font-size:11px;font-weight:700;color:#64748b;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:4px 10px;display:flex;align-items:center;gap:5px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            اطلاع فقط
        </div>
        <?php endif; ?>
    </div>

    <div style="overflow-x: auto;">
        <table class="data-table" style="margin: 0; width: 100%;">
            <thead>
                <tr>
                    <th style="width: 50px;">#</th>
                    <th>المادة / الكتاب</th>
                    <th>الكلية والرمز</th>
                    <th>المتبرع / صاحب المادة</th>
                    <th>الحاجز / المستلم</th>
                    <th style="min-width: 180px;">الفرز والمنسق المكلف</th>
                    <th>الحالة</th>
                    <th style="text-align:center; width: 220px;">الإجراءات السريعة</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($items)): ?>
                    <tr>
                        <td colspan="8" style="text-align:center; padding: 36px 20px; color:#64748b; background:#fafafa;">
                            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#94a3b8" stroke-width="1.5" style="margin: 0 auto 8px; display:block;">
                                <rect width="18" height="18" x="3" y="3" rx="2" />
                                <path d="M3 9h18" />
                                <path d="M9 21V9" />
                            </svg>
                            <div style="font-size:14px; font-weight:700; color:#334155;">لا توجد مواد في هذا القسم حالياً</div>
                            <div style="font-size:12px; color:#94a3b8; margin-top:2px;">يتم نقل المواد تلقائياً هنا فور فرزها وتعيين المنسق المسؤول.</div>
                        </td>
                    </tr>
                <?php else: ?>
                    <?php foreach ($items as $m): ?>
                        <?php
                        $stBadge = $statusLabels[$m['status']] ?? ['label' => $m['status'], 'class' => 'badge-pending'];
                        $currentCoordKey = $m['assigned_coordinator'] ?? 'shared';
                        if (!isset($coordinatorsList[$currentCoordKey])) {
                            $currentCoordKey = 'shared';
                        }
                        $hasMatch = !empty($smartMatches[$m['id']]);
                        ?>
                        <tr id="row_material_<?= $m['id'] ?>">
                            <td style="font-weight:700; color:#64748b;">#<?= $m['id'] ?></td>

                            <!-- اسم المادة والكتاب والوصف -->
                            <td>
                                <div style="font-weight:700; color:#0f172a; font-size:14px;">
                                    <?= htmlspecialchars($m['material_name']) ?>
                                </div>
                                <?php if (!empty($m['description'])): ?>
                                    <div style="font-size:12px; color:#64748b; margin-top:2px; max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                                        title="<?= htmlspecialchars($m['description']) ?>">
                                        <?= htmlspecialchars($m['description']) ?>
                                    </div>
                                <?php endif; ?>

                                <!-- شارة المطابقة الذكية في حال وجود طلاب بالانتظار -->
                                <?php if ($hasMatch): ?>
                                    <div style="margin-top:6px;">
                                        <button type="button" onclick='openSmartMatchModal(<?= json_encode($m, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>, <?= json_encode($smartMatches[$m['id']], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                                            style="background:linear-gradient(135deg,#fdf4ff,#fae8ff); color:#7e22ce; border:1.5px solid #d8b4fe; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 6px rgba(126,34,206,0.12);"
                                            title="مطابقة ذكية: ربط هذا الكتاب بطالب في قائمة الانتظار">
                                            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                                            <span><?= count($smartMatches[$m['id']]) ?> طالب بالانتظار (ربط فوري ⚡)</span>
                                        </button>
                                    </div>
                                <?php endif; ?>
                            </td>

                            <!-- الكلية والرمز -->
                            <td>
                                <span class="badge-faculty"><?= htmlspecialchars($m['faculty'] ?: 'متطلب عام') ?></span>
                                <?php if (!empty($m['course_code'])): ?>
                                    <div style="margin-top:3px;"><span class="badge-code"><?= htmlspecialchars($m['course_code']) ?></span></div>
                                <?php endif; ?>
                            </td>

                            <!-- المتبرع -->
                            <td>
                                <div style="font-weight:600; color:#1e293b; display:flex; align-items:center; gap:6px;">
                                    <span><?= htmlspecialchars($m['donor_name']) ?></span>
                                    <span class="gender-tag <?= $m['donor_gender'] === 'female' ? 'gender-female' : 'gender-male' ?>">
                                        <?= $m['donor_gender'] === 'female' ? 'أنثى' : 'ذكر' ?>
                                    </span>
                                </div>
                                <?php if (!empty($m['donor_phone'])): ?>
                                    <div style="font-size:12px; color:#475569; display:flex; align-items:center; gap:6px; margin-top:3px;">
                                        <span dir="ltr"><?= htmlspecialchars($m['donor_phone']) ?></span>
                                        <button type="button" class="whatsapp-quick-btn" onclick='openWhatsAppTemplatesModal(<?= json_encode($m, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>, "donor")' title="مراسلة المتبرع بقوالب جاهزة (شكر / تواصل)">
                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                                                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.83 2.41c-1.47 0-2.91-.39-4.17-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.39c0-4.54 3.7-8.25 8.23-8.25z" />
                                            </svg>
                                            واتساب
                                        </button>
                                    </div>
                                <?php endif; ?>
                            </td>

                            <!-- الحاجز / المستلم -->
                            <td>
                                <?php if (!empty($m['booker_name'])): ?>
                                    <div style="font-weight:600; color:#0369a1; display:flex; align-items:center; gap:6px;">
                                        <span><?= htmlspecialchars($m['booker_name']) ?></span>
                                        <span class="gender-tag <?= $m['booker_gender'] === 'female' ? 'gender-female' : 'gender-male' ?>">
                                            <?= $m['booker_gender'] === 'female' ? 'أنثى' : 'ذكر' ?>
                                        </span>
                                    </div>
                                    <?php if (!empty($m['booker_phone'])): ?>
                                        <div style="font-size:12px; color:#475569; display:flex; align-items:center; gap:6px; margin-top:3px;">
                                            <span dir="ltr"><?= htmlspecialchars($m['booker_phone']) ?></span>
                                            <button type="button" class="whatsapp-quick-btn" onclick='openWhatsAppTemplatesModal(<?= json_encode($m, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>, "booker")' title="مراسلة المستلم بقوالب جاهزة (تأكيد / تذكير بالموعد)">
                                                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                                                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.83 2.41c-1.47 0-2.91-.39-4.17-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.39c0-4.54 3.7-8.25 8.23-8.25z" />
                                                </svg>
                                                واتساب
                                            </button>
                                        </div>
                                    <?php endif; ?>
                                <?php else: ?>
                                    <span style="color:#94a3b8; font-size:12.5px;">— لا يوجد حجز</span>
                                <?php endif; ?>
                            </td>

                            <!-- الفرز والمنسق المكلف (تغيير فوري بضغطة زر) -->
                            <td>
                                <form method="post" style="display:flex; flex-direction:column; gap:4px; margin:0;">
                                    <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrfToken) ?>">
                                    <input type="hidden" name="action" value="quick_assign_coordinator">
                                    <input type="hidden" name="id" value="<?= $m['id'] ?>">
                                    <select name="assigned_coordinator" onchange="this.form.submit()" 
                                        style="padding:5px 8px; font-size:12px; font-weight:700; border-radius:6px; border:1.5px solid <?= $coordinatorsList[$currentCoordKey]['border'] ?>; background:<?= $coordinatorsList[$currentCoordKey]['bg'] ?>; color:<?= $coordinatorsList[$currentCoordKey]['color'] ?>; cursor:pointer;"
                                        title="تغيير المنسق المسؤول / فرز يدوي">
                                        <?php foreach ($coordinatorsList as $cKey => $cData): ?>
                                            <option value="<?= htmlspecialchars((string)$cKey) ?>" <?= ((string)$currentCoordKey === (string)$cKey) ? 'selected' : '' ?>>
                                                <?= htmlspecialchars($cData['name']) ?>
                                            </option>
                                        <?php endforeach; ?>
                                    </select>
                                </form>
                                <?php if (!empty($m['pickup_date'])): ?>
                                    <div style="font-size:11.5px; color:#d97706; margin-top:4px; display:flex; align-items:center; gap:3px;">
                                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        <span><?= htmlspecialchars($m['pickup_date']) ?> <?= htmlspecialchars($m['pickup_time']) ?></span>
                                    </div>
                                <?php endif; ?>
                            </td>

                            <!-- الحالة -->
                            <td>
                                <span class="custom-badge <?= $stBadge['class'] ?>" id="badge_status_<?= $m['id'] ?>">
                                    <?= $stBadge['label'] ?>
                                </span>
                            </td>

                            <!-- أزرار الإجراءات السريعة -->
                            <td style="text-align:center;">
                                <div class="table-action-btns">
                                    <?php if ($readOnly): ?>
                                    <!-- وضع الاطلاع فقط — لا يمكن تعديل هذا الجدول -->
                                    <span style="font-size:11px;color:#94a3b8;display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        اطلاع فقط
                                    </span>
                                    <button type="button" class="btn-action btn-print-slip"
                                        onclick='openSlipModal(<?= json_encode($m, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                                        title="باركود وسند التسليم السريع (QR)"
                                        style="display:inline-flex; align-items:center; gap:4px; background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; font-weight:700; padding:4px 8px; border-radius:6px;">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
                                            <rect x="3" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="14" width="7" height="7"></rect>
                                            <rect x="3" y="14" width="7" height="7"></rect>
                                        </svg>
                                        <span style="font-size:11px;">باركود</span>
                                    </button>
                                    <?php else: ?>
                                    <!-- زر الحجز السريع إن كانت المادة متاحة -->
                                    <?php if ($m['status'] === 'approved'): ?>
                                        <button type="button" class="btn-action btn-reserve"
                                            onclick='openReserveModal(<?= json_encode($m) ?>)' title="حجز المادة لطالب">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                                                stroke-width="2">
                                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                                <circle cx="9" cy="7" r="4" />
                                                <line x1="19" y1="8" x2="19" y2="14" />
                                                <line x1="22" y1="11" x2="16" y2="11" />
                                            </svg>
                                            حجز
                                        </button>
                                    <?php endif; ?>

                                    <!-- زر تأكيد التسليم إن كانت المادة محجوزة -->
                                    <?php if ($m['status'] === 'reserved'): ?>
                                        <form method="post" style="display:inline;"
                                            onsubmit="return confirm('هل تم تسليم المادة للطالب بنجاح؟');">
                                            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrfToken) ?>">
                                            <input type="hidden" name="action" value="complete_delivery">
                                            <input type="hidden" name="id" value="<?= $m['id'] ?>">
                                            <button type="submit" class="btn-action btn-deliver" title="تأكيد التسليم بنجاح">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                                                    stroke-width="2">
                                                <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                                تسليم
                                            </button>
                                        </form>

                                        <!-- زر إلغاء الحجز -->
                                        <form method="post" style="display:inline;"
                                            onsubmit="return confirm('إلغاء حجز هذه المادة وإعادتها كـ مادة متاحة؟');">
                                            <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrfToken) ?>">
                                            <input type="hidden" name="action" value="cancel_booking">
                                            <input type="hidden" name="id" value="<?= $m['id'] ?>">
                                            <button type="submit" class="btn-action btn-cancel-book" title="إلغاء الحجز">
                                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                                                    stroke-width="2">
                                                    <circle cx="12" cy="12" r="10" />
                                                    <line x1="15" y1="9" x2="9" y2="15" />
                                                    <line x1="9" y1="9" x2="15" y2="15" />
                                                </svg>
                                            </button>
                                        </form>
                                    <?php endif; ?>

                                    <!-- زر باركود وسند التسليم السريع -->
                                    <button type="button" class="btn-action btn-print-slip"
                                        onclick='openSlipModal(<?= json_encode($m, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                                        title="باركود وسند التسليم السريع (QR)"
                                        style="display:inline-flex; align-items:center; gap:4px; background:#e0f2fe; color:#0284c7; border:1px solid #bae6fd; font-weight:700; padding:4px 8px; border-radius:6px;">
                                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
                                            <rect x="3" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="3" width="7" height="7"></rect>
                                            <rect x="14" y="14" width="7" height="7"></rect>
                                            <rect x="3" y="14" width="7" height="7"></rect>
                                        </svg>
                                        <span style="font-size:11px;">باركود</span>
                                    </button>

                                    <!-- زر التعديل -->
                                    <button type="button" class="btn-action btn-edit"
                                        onclick='openEditModal(<?= json_encode($m, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                                        title="تعديل التفاصيل">
                                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                                            stroke-width="2">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                        </svg>
                                    </button>

                                    <!-- زر الحذف -->
                                    <form method="post" style="display:inline;"
                                        onsubmit="return confirm('تأكيد حذف هذه المادة المتبادلة نهائياً؟');">
                                        <input type="hidden" name="csrf" value="<?= htmlspecialchars($csrfToken) ?>">
                                        <input type="hidden" name="action" value="delete">
                                        <input type="hidden" name="id" value="<?= $m['id'] ?>">
                                        <button type="submit" class="btn-action btn-delete" title="حذف المادة">
                                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                                                stroke-width="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path
                                                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    </form>
                                    <?php endif; // end readOnly check ?>
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
}
?>

<?php if ($activeTab === 'pending'): ?>
    <?php renderPendingDonationsTable($materials, $coordinatorsList, $isDonationsAdmin, csrf_token(), $facultiesList); ?>
<?php else: ?>
    <?php if ($pendingCount > 0): ?>
    <div style="background:linear-gradient(135deg, #fffbeb, #fef3c7); border:1.5px solid #fde68a; border-radius:14px; padding:14px 20px; margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; box-shadow:0 2px 8px rgba(245,158,11,0.08);">
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:10px; background:#fde68a; display:flex; align-items:center; justify-content:center; color:#92400e;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
                <strong style="color:#92400e; font-size:14.5px;">يوجد <?= $pendingCount ?> طلب تبرع جديد بانتظار اعتماد الإدارة وتوجيهها للفرق</strong>
                <div style="color:#b45309; font-size:12px; margin-top:2px;">تم إرسالها حديثاً عبر نموذج الموقع الرسمي — يمكنك مراجعتها واعتمادها وتوجيهها إلى جدول الذكور أو الإناث أو المشترك.</div>
            </div>
        </div>
        <a href="?tab=pending<?= $archiveUrlParam ?>" class="btn" style="background:#d97706; color:#fff; border:none; font-size:12.5px; font-weight:800; padding:9px 18px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(217,119,6,0.2);">
            <span>عرض طلبات التبرع المنتظرة (<?= $pendingCount ?>)</span>
            <span>←</span>
        </a>
    </div>
    <?php endif; ?>

<!-- بطاقات الانتقال السريع وملخص الأقسام الثلاثة -->
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 24px;">
    <a href="#section-shared" style="text-decoration:none; display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-radius:14px; background:linear-gradient(135deg, #fdf4ff, #fae8ff); border:2px solid #e9d5ff; color:#7e22ce; box-shadow:0 2px 8px rgba(126,34,206,0.06); transition:transform .15s ease;">
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:10px; background:#f3e8ff; display:flex; align-items:center; justify-content:center; color:#7e22ce;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            </div>
            <div>
                <div style="font-weight:800; font-size:15px; color:#581c87;">جدول التسليم المشترك</div>
                <div style="font-size:12px; color:#86198f; margin-top:2px;">بانتظار الفرز والتوزيع اليدوي</div>
            </div>
        </div>
        <span style="font-size:20px; font-weight:900; background:#7e22ce; color:#fff; padding:4px 14px; border-radius:9999px;"><?= count($sharedMaterials) ?></span>
    </a>

    <?php 
    $maleCardReadOnly = ($currentCoordGender === 'female' && !$isDonationsAdmin);
    ?>
    <a href="#section-male" style="text-decoration:none; display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-radius:14px; background:<?= $maleCardReadOnly ? '#f8fafc' : 'linear-gradient(135deg, #f0f9ff, #e0f2fe)' ?>; border:2px solid <?= $maleCardReadOnly ? '#cbd5e1' : '#bae6fd' ?>; color:<?= $maleCardReadOnly ? '#64748b' : '#0369a1' ?>; box-shadow:0 2px 8px rgba(3,105,161,0.06); transition:transform .15s ease;">
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:10px; background:<?= $maleCardReadOnly ? '#f1f5f9' : '#e0f2fe' ?>; display:flex; align-items:center; justify-content:center; color:<?= $maleCardReadOnly ? '#64748b' : '#0284c7' ?>;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            </div>
            <div>
                <div style="font-weight:800; font-size:15px; color:<?= $maleCardReadOnly ? '#334155' : '#0c4a6e' ?>;">
                    جدول منسقي الذكور <?= $maleCardReadOnly ? '<span style="font-size:11px;background:#e2e8f0;color:#475569;padding:2px 6px;border-radius:4px;font-weight:700;">اطلاع فقط</span>' : '' ?>
                </div>
                <div style="font-size:12px; color:<?= $maleCardReadOnly ? '#64748b' : '#0369a1' ?>; margin-top:2px;">
                    <?= $maleCardReadOnly ? 'مخصص للذكور — متاح لكِ كقراءة واطلاع فقط' : 'فريق منسقي الذكور' ?>
                </div>
            </div>
        </div>
        <span style="font-size:20px; font-weight:900; background:<?= $maleCardReadOnly ? '#64748b' : '#0284c7' ?>; color:#fff; padding:4px 14px; border-radius:9999px;"><?= count($maleMaterials) ?></span>
    </a>

    <?php 
    $femaleCardReadOnly = ($currentCoordGender === 'male' && !$isDonationsAdmin);
    ?>
    <a href="#section-female" style="text-decoration:none; display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-radius:14px; background:<?= $femaleCardReadOnly ? '#f8fafc' : 'linear-gradient(135deg, #fdf2f8, #fce7f3)' ?>; border:2px solid <?= $femaleCardReadOnly ? '#cbd5e1' : '#fbcfe8' ?>; color:<?= $femaleCardReadOnly ? '#64748b' : '#be185d' ?>; box-shadow:0 2px 8px rgba(190,24,93,0.06); transition:transform .15s ease;">
        <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; border-radius:10px; background:<?= $femaleCardReadOnly ? '#f1f5f9' : '#fce7f3' ?>; display:flex; align-items:center; justify-content:center; color:<?= $femaleCardReadOnly ? '#64748b' : '#db2777' ?>;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            </div>
            <div>
                <div style="font-weight:800; font-size:15px; color:<?= $femaleCardReadOnly ? '#334155' : '#831843' ?>;">
                    جدول منسقات الإناث <?= $femaleCardReadOnly ? '<span style="font-size:11px;background:#e2e8f0;color:#475569;padding:2px 6px;border-radius:4px;font-weight:700;">اطلاع فقط</span>' : '' ?>
                </div>
                <div style="font-size:12px; color:<?= $femaleCardReadOnly ? '#64748b' : '#be185d' ?>; margin-top:2px;">
                    <?= $femaleCardReadOnly ? 'مخصص للإناث — متاح لك كقراءة واطلاع فقط' : 'فريق منسقات الإناث' ?>
                </div>
            </div>
        </div>
        <span style="font-size:20px; font-weight:900; background:<?= $femaleCardReadOnly ? '#64748b' : '#db2777' ?>; color:#fff; padding:4px 14px; border-radius:9999px;"><?= count($femaleMaterials) ?></span>
    </a>
</div>

<!-- عرض الجداول الثلاثة مقسمة (المشترك أولاً، ثم الذكور، ثم الإناث) -->
<?php
/*
 * منطق عرض الجداول مع مراعاة:
 * - جنس المنسق الحالي ($currentCoordGender)
 * - فلتر المنسق من URL ($coordFilter)
 * - إظهار جدول المشترك في كل التبويبات
 */
$sharedSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>';
$maleSvg   = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>';
$femaleSvg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>';

// تحديد ما إذا كان يجب إخفاء جدول الذكور أو الإناث بالنسبة للمنسق الحالي
// null = يرى الكل | 'male' = لا يرى جدول الإناث | 'female' = لا يرى جدول الذكور
$hideMaleTable    = ($currentCoordGender === 'female' && !$isDonationsAdmin);
$hideFemaleTable  = ($currentCoordGender === 'male'   && !$isDonationsAdmin);
// جدول الجنس الآخر للمنسق يظهر للقراءة فقط دون إمكانية التعديل
$showOtherGenderReadOnly = true;

// وضع الأرشيف: إذا كان المستعرض أرشيفاً والمستخدم ليس أدمن، تكون كافة الجداول للاطلاع فقط
$isArchiveMode = (!empty($archiveFilter) && $archiveFilter !== 'current');
$coordArchiveReadOnly = ($isArchiveMode && !$isDonationsAdmin);

if ($coordFilter === 'shared') {
    // فلتر صريح للمشترك
    renderDonationMaterialsTable('shared', 'جدول التسليم المشترك وبانتظار الفرز اليدوي', 'المواد غير المفرزة أو المشتركة بين المنسقين — يرجى تحديد المنسق المسؤول أو متابعتها مشتركاً', $sharedMaterials, ['badge_bg'=>'#faf5ff', 'badge_color'=>'#7e22ce', 'badge_border'=>'#e9d5ff', 'svg'=>$sharedSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, $coordArchiveReadOnly);

} elseif ($coordFilter === 'female_all' || (!empty($coordFilter) && isset($coordinatorsList[$coordFilter]) && ($coordinatorsList[$coordFilter]['gender'] ?? '') === 'female')) {
    // فلتر إناث صريح
    if (!$hideFemaleTable) {
        renderDonationMaterialsTable('female', 'جدول تسليم منسقات الإناث', 'المواد والكتب المسندة لمنسقات الإناث لمتابعتها وتسليمها للطالبات', $femaleMaterials, ['badge_bg'=>'#fdf2f8', 'badge_color'=>'#db2777', 'badge_border'=>'#fbcfe8', 'svg'=>$femaleSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, $coordArchiveReadOnly);
    }

} elseif ($coordFilter === 'male_all' || (!empty($coordFilter) && isset($coordinatorsList[$coordFilter]) && ($coordinatorsList[$coordFilter]['gender'] ?? '') !== 'female')) {
    // فلتر ذكور صريح
    if (!$hideMaleTable) {
        renderDonationMaterialsTable('male', 'جدول تسليم منسقي الذكور', 'المواد والكتب المسندة لمنسقي الذكور لمتابعتها وتسليمها للطلاب', $maleMaterials, ['badge_bg'=>'#f0f9ff', 'badge_color'=>'#0284c7', 'badge_border'=>'#bae6fd', 'svg'=>$maleSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, $coordArchiveReadOnly);
    }

} else {
    // عرض الجداول المناسبة مع مراعاة جنس المنسق

    // ١. جدول المشترك — يظهر دائماً لأي مستخدم في كل التبويبات
    renderDonationMaterialsTable('shared', 'جدول التسليم المشترك وبانتظار الفرز اليدوي', 'المواد غير المفرزة أو المشتركة بين المنسقين — يرجى تحديد المنسق المسؤول أو متابعتها مشتركاً', $sharedMaterials, ['badge_bg'=>'#faf5ff', 'badge_color'=>'#7e22ce', 'badge_border'=>'#e9d5ff', 'svg'=>$sharedSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, $coordArchiveReadOnly);

    // ٢. جدول الذكور
    if (!$hideMaleTable) {
        // المنسق ذكر أو أدمن → أزرار كاملة (إلا إذا كان في وضع أرشيف لمنسق)
        renderDonationMaterialsTable('male', 'جدول تسليم منسقي الذكور', 'المواد والكتب المسندة لمنسقي الذكور لمتابعتها وتسليمها للطلاب', $maleMaterials, ['badge_bg'=>'#f0f9ff', 'badge_color'=>'#0284c7', 'badge_border'=>'#bae6fd', 'svg'=>$maleSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, $coordArchiveReadOnly);
    } elseif ($showOtherGenderReadOnly) {
        // منسقة أنثى → جدول الذكور بالقراءة فقط
        renderDonationMaterialsTable('male', 'جدول تسليم منسقي الذكور (اطلاع)', 'هذا الجدول مخصص لمنسقي الذكور — أنتِ في وضع الاطلاع فقط', $maleMaterials, ['badge_bg'=>'#f8fafc', 'badge_color'=>'#94a3b8', 'badge_border'=>'#e2e8f0', 'svg'=>$maleSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, true);
    }

    // ٣. جدول الإناث
    if (!$hideFemaleTable) {
        // المنسق أنثى أو أدمن → أزرار كاملة (إلا إذا كان في وضع أرشيف لمنسق)
        renderDonationMaterialsTable('female', 'جدول تسليم منسقات الإناث', 'المواد والكتب المسندة لمنسقات الإناث لمتابعتها وتسليمها للطالبات', $femaleMaterials, ['badge_bg'=>'#fdf2f8', 'badge_color'=>'#db2777', 'badge_border'=>'#fbcfe8', 'svg'=>$femaleSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, $coordArchiveReadOnly);
    } elseif ($showOtherGenderReadOnly) {
        // منسق ذكر → جدول الإناث بالقراءة فقط
        renderDonationMaterialsTable('female', 'جدول تسليم منسقات الإناث (اطلاع)', 'هذا الجدول مخصص لمنسقات الإناث — أنت في وضع الاطلاع فقط', $femaleMaterials, ['badge_bg'=>'#fdf8ff', 'badge_color'=>'#94a3b8', 'badge_border'=>'#f3e8ff', 'svg'=>$femaleSvg], $coordinatorsList, $statusLabels, csrf_token(), $smartMatches, true);
    }
}
?>
<?php endif; // end of if activeTab === pending ?>

<!-- ============================================================
     المودالات والنوافذ المنبثقة التفاعلية (Modals)
     ============================================================ -->

<!-- مودال أرشفة الحملة الحالية -->
<div class="custom-modal-overlay" id="archiveCampaignModal">
    <div class="custom-modal-box" style="max-width:500px;">
        <div class="custom-modal-header" style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-bottom:1px solid #fcd34d;">
            <h3 style="color:#92400e;display:flex;align-items:center;gap:8px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="20" height="5" x="2" y="3" rx="1" />
                    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                    <path d="M10 12h4" />
                </svg>
                أرشفة الحملة الحالية
            </h3>
            <button type="button" class="modal-close-btn" onclick="closeModal('archiveCampaignModal')">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
        <form method="post">
            <div class="custom-modal-body" style="padding:20px;">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <input type="hidden" name="action" value="archive_current_campaign">

                <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px;margin-bottom:18px;">
                    <div style="font-weight:700;color:#92400e;margin-bottom:6px;font-size:13px;">الحملة الجارية حالياً:</div>
                    <div style="font-size:16px;font-weight:800;color:#78350f;"><?= htmlspecialchars($currentCampaignLabel) ?></div>
                    <div style="font-size:12px;color:#92400e;margin-top:4px;">سيتم ترحيل جميع المواد والكتب الحالية إلى الأرشيف تحت هذا الفصل الدراسي، وتفريغ الجداول تماماً.</div>
                </div>

                <div style="margin-bottom:16px;">
                    <label style="font-size:13px;font-weight:700;color:#374151;display:block;margin-bottom:6px;">
                        اسم الفصل للأرشفة
                        <span style="font-size:11px;color:#64748b;font-weight:400;">(يمكن تعديله إن أردت)</span>
                    </label>
                    <input type="text" name="archive_semester_name"
                        value="<?= htmlspecialchars($currentCampaignLabel) ?>"
                        style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;"
                        placeholder="مثال: الفصل الأول 2025-2026">
                    <div style="font-size:11px;color:#6b7280;margin-top:4px;">هذا هو الاسم الذي سيظهر في صفحة الأرشيف</div>
                </div>

                <div style="margin-bottom:8px;">
                    <label style="font-size:13px;font-weight:700;color:#374151;display:block;margin-bottom:6px;">
                        اسم الحملة / الفصل الجديد
                        <span style="font-size:11px;color:#64748b;font-weight:400;">(اختياري — يمكن تركه فارغاً)</span>
                    </label>
                    <input type="text" name="next_campaign_label"
                        style="width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;"
                        placeholder="مثال: الفصل الثاني 2025-2026">
                    <div style="font-size:11px;color:#6b7280;margin-top:4px;">إذا تركته فارغاً سيبقى اسم الحملة الحالية كما هو</div>
                </div>
            </div>
            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('archiveCampaignModal')">إلغاء</button>
                <button type="submit" class="btn" style="background:#f59e0b;color:#fff;border:1px solid #d97706;"
                    onclick="return confirm('تأكيد أرشفة الحملة الحالية وترحيل جميع البيانات؟ لا يمكن التراجع عن هذه العملية.')">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                        <rect width="20" height="5" x="2" y="3" rx="1" />
                        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                        <path d="M10 12h4" />
                    </svg>
                    أرشفة الحملة الآن
                </button>
            </div>
        </form>
    </div>
</div>

<!-- 1. مودال إضافة مادة جديدة -->
<div class="custom-modal-overlay" id="addMaterialModal">
    <div class="custom-modal-box">
        <div class="custom-modal-header">
            <h3>إضافة كتاب / مادة للتبرع والتبادل</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('addMaterialModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="create">

            <div class="modal-form-grid">
                <div class="form-group">
                    <label>اسم المادة / الكتاب الدراسي *</label>
                    <input type="text" name="material_name" required placeholder="مثال: Calculus Thomas 14th Edition"
                        class="form-control">
                </div>

                <div class="form-group">
                    <label>رمز المادة (Course Code)</label>
                    <input type="text" name="course_code" placeholder="مثال: MATH101" class="form-control">
                </div>

                <div class="form-group">
                    <label>الكلية أو القسم الأكاديمي</label>
                    <select name="faculty" id="addFacultySelect" class="form-control"
                        onchange="updateSpecializationOptions('add')">
                        <?php foreach ($facultiesList as $fac): ?>
                            <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group" id="addSpecializationGroup" style="display:none;">
                    <label>التخصص</label>
                    <select name="specialization" id="addSpecializationSelect" class="form-control">
                        <option value="">— اختر التخصص —</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>حالة المادة الأولية</label>
                    <select name="status" class="form-control">
                        <option value="approved">متاح وموافق عليه للاستلام الفوري</option>
                        <option value="pending">قيد التدقيق والمراجعة</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>اسم الطالب المتبرع *</label>
                    <input type="text" name="donor_name" required placeholder="الاسم الثنائي أو الثلاثي"
                        class="form-control">
                </div>

                <div class="form-group">
                    <label>رقم هاتف المتبرع</label>
                    <input type="text" name="donor_phone" placeholder="079XXXXXXXX" class="form-control">
                </div>

                <div class="form-group">
                    <label>جنس المتبرع</label>
                    <select name="donor_gender" class="form-control">
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>المنسق المكلف بمتابعة المادة</label>
                    <select name="assigned_coordinator" class="form-control">
                        <?php foreach ($coordinatorsList as $cKey => $cVal): ?>
                            <option value="<?= $cKey ?>"><?= $cVal['name'] ?> (<?= $cVal['badge'] ?>)</option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>وصف الكتاب وحالته الفيزيائية</label>
                    <textarea name="description" rows="2" placeholder="حالة النسخة، النظافة، وجود تظليلات أو حلول..."
                        class="form-control"></textarea>
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>ملاحظات إضافية للمنسق</label>
                    <input type="text" name="notes" placeholder="موقع تسليم مقترح أو تعليمات..." class="form-control">
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('addMaterialModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ وإضافة المادة</button>
            </div>
        </form>
    </div>
</div>

<!-- 2. مودال حجز مادة لطالب (Reserve Modal) -->
<div class="custom-modal-overlay" id="reserveMaterialModal">
    <div class="custom-modal-box">
        <div class="custom-modal-header">
            <h3>حجز مادة دراسية لطالب</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('reserveMaterialModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="reserve">
            <input type="hidden" name="id" id="reserve_id">

            <div
                style="background:#f0f9ff; border:1px solid #bae6fd; padding:12px 16px; border-radius:8px; margin-bottom:16px;">
                <div style="font-size:12px; color:#0369a1; font-weight:700;">المادة المختارة للحجز:</div>
                <div id="reserve_material_title"
                    style="font-size:15px; font-weight:800; color:#0f172a; margin-top:2px;"></div>
                <div id="reserve_donor_info" style="font-size:12px; color:#64748b; margin-top:3px;"></div>
            </div>

            <div class="modal-form-grid">
                <div class="form-group">
                    <label>اسم الطالب الحاجز / المستلم *</label>
                    <input type="text" name="booker_name" id="reserve_booker_name" required
                        placeholder="الاسم الثنائي على الأقل" class="form-control">
                </div>

                <div class="form-group">
                    <label>رقم هاتف الحاجز *</label>
                    <input type="text" name="booker_phone" id="reserve_booker_phone" required placeholder="079XXXXXXXX"
                        class="form-control">
                </div>

                <div class="form-group">
                    <label>جنس الحاجز</label>
                    <select name="booker_gender" id="reserve_booker_gender" class="form-control">
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>المنسق المشرف على التسليم</label>
                    <select name="assigned_coordinator" id="reserve_coordinator" class="form-control">
                        <?php foreach ($coordinatorsList as $cKey => $cVal): ?>
                            <option value="<?= $cKey ?>"><?= $cVal['name'] ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group">
                    <label>تاريخ موعد الاستلام</label>
                    <input type="date" name="pickup_date" id="reserve_pickup_date" class="form-control">
                </div>

                <div class="form-group">
                    <label>توقيت الاستلام</label>
                    <input type="time" name="pickup_time" id="reserve_pickup_time" class="form-control">
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>ملاحظات التنسيق والمكان</label>
                    <input type="text" name="notes" id="reserve_notes"
                        placeholder="مكان اللقاء مثلاً: أمام مكتبة الكلية..." class="form-control">
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary"
                    onclick="closeModal('reserveMaterialModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary" style="background:#0284c7;">تأكيد الحجز وتعيين
                    الموعد</button>
            </div>
        </form>
    </div>
</div>

<!-- 3. مودال تعديل مادة (Edit Modal) -->
<div class="custom-modal-overlay" id="editMaterialModal">
    <div class="custom-modal-box">
        <div class="custom-modal-header">
            <h3>تعديل بيانات المادة المتبادلة</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('editMaterialModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="update">
            <input type="hidden" name="id" id="edit_id">

            <div class="modal-form-grid">
                <div class="form-group">
                    <label>اسم المادة / الكتاب *</label>
                    <input type="text" name="material_name" id="edit_material_name" required class="form-control">
                </div>

                <div class="form-group">
                    <label>رمز المادة</label>
                    <input type="text" name="course_code" id="edit_course_code" class="form-control">
                </div>

                <div class="form-group">
                    <label>الكلية</label>
                    <select name="faculty" id="edit_faculty" class="form-control">
                        <?php foreach ($facultiesList as $fac): ?>
                            <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group">
                    <label>حالة المادة</label>
                    <select name="status" id="edit_status" class="form-control">
                        <option value="approved">متاح للاستلام</option>
                        <option value="reserved">محجوز للطالب</option>
                        <option value="completed">تم التسليم بنجاح</option>
                        <option value="pending">قيد المراجعة</option>
                        <option value="cancelled">ملغي</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>اسم المتبرع *</label>
                    <input type="text" name="donor_name" id="edit_donor_name" required class="form-control">
                </div>

                <div class="form-group">
                    <label>هاتف المتبرع</label>
                    <input type="text" name="donor_phone" id="edit_donor_phone" class="form-control">
                </div>

                <div class="form-group">
                    <label>جنس المتبرع</label>
                    <select name="donor_gender" id="edit_donor_gender" class="form-control">
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>المنسق المكلف</label>
                    <select name="assigned_coordinator" id="edit_assigned_coordinator" class="form-control">
                        <?php foreach ($coordinatorsList as $cKey => $cVal): ?>
                            <option value="<?= $cKey ?>"><?= $cVal['name'] ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- تفاصيل الحجز إن وجدت -->
                <div class="form-group">
                    <label>اسم الحاجز / المستلم</label>
                    <input type="text" name="booker_name" id="edit_booker_name" class="form-control">
                </div>

                <div class="form-group">
                    <label>هاتف الحاجز</label>
                    <input type="text" name="booker_phone" id="edit_booker_phone" class="form-control">
                </div>

                <div class="form-group">
                    <label>جنس الحاجز</label>
                    <select name="booker_gender" id="edit_booker_gender" class="form-control">
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>حالة التواصل وموعد التسليم</label>
                    <select name="delivery_status" id="edit_delivery_status" class="form-control">
                        <option value="pending_contact">بانتظار التواصل</option>
                        <option value="contacted">تم التواصل</option>
                        <option value="scheduled">موعد مؤكد</option>
                        <option value="completed">تم التسليم</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>تاريخ الاستلام المجدول</label>
                    <input type="date" name="pickup_date" id="edit_pickup_date" class="form-control">
                </div>

                <div class="form-group">
                    <label>وقت الاستلام</label>
                    <input type="time" name="pickup_time" id="edit_pickup_time" class="form-control">
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>وصف المادة</label>
                    <textarea name="description" id="edit_description" rows="2" class="form-control"></textarea>
                </div>

                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>الملاحظات</label>
                    <input type="text" name="notes" id="edit_notes" class="form-control">
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('editMaterialModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary">حفظ التعديلات</button>
            </div>
        </form>
    </div>
</div>

<!-- 4. مودال طباعة سند / كشف تسليم إلكتروني (Slip Modal) -->
<div class="custom-modal-overlay" id="slipModal">
    <div class="custom-modal-box" style="max-width: 600px;">
        <div class="custom-modal-header no-print">
            <h3>سند تسليم مادة دراسية إلكتروني</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('slipModal')">✕</button>
        </div>
        <div class="custom-modal-body" id="printableSlipArea">
            <!-- إشعار حي فوري عند مسح الباركود من الهاتف -->
            <div id="slip_live_delivered_banner" class="no-print" style="display:none; margin-bottom:14px; padding:14px 18px; background:linear-gradient(135deg, #ecfdf5, #d1fae5); border:1.5px solid #10b981; border-radius:12px; color:#065f46; font-weight:800; font-size:14px; text-align:center; box-shadow:0 4px 12px rgba(16,185,129,0.2);">
                🎉 تم مسح الباركود وتأكيد استلام المادة بنجاح الآن!
            </div>
            <div class="slip-container">
                <div class="slip-header">
                    <div style="font-family:'Cairo', sans-serif; font-weight:800; font-size:18px; color:#0f172a;">منصة
                        مكانك — حملة تبادل المواد الجامعية</div>
                    <div style="font-size:12px; color:#64748b;">سند تسليم واستلام مادة دراسية رسمي</div>
                </div>

                <div class="slip-meta-grid">
                    <div><strong>رقم السند:</strong> <span id="slip_id"></span></div>
                    <div><strong>تاريخ الطباعة:</strong> <?= date('Y-m-d H:i') ?></div>
                    <div><strong>المنسق المشرف:</strong> <span id="slip_coord"></span></div>
                    <div><strong>حالة المادة:</strong> <span id="slip_status"></span></div>
                </div>

                <div class="slip-box">
                    <div class="slip-box-title">تفاصيل المادة الدراسية</div>
                    <table style="width:100%; font-size:13px; border-collapse:collapse;">
                        <tr>
                            <td style="padding:6px; color:#64748b; width:120px;">اسم المادة:</td>
                            <td style="padding:6px; font-weight:700;" id="slip_material_name"></td>
                        </tr>
                        <tr>
                            <td style="padding:6px; color:#64748b;">رمز المادة:</td>
                            <td style="padding:6px;" id="slip_course_code"></td>
                        </tr>
                        <tr>
                            <td style="padding:6px; color:#64748b;">الكلية:</td>
                            <td style="padding:6px;" id="slip_faculty"></td>
                        </tr>
                    </table>
                </div>

                <div class="slip-box">
                    <div class="slip-box-title">أطراف العملية والتسليم</div>
                    <table style="width:100%; font-size:13px; border-collapse:collapse;">
                        <tr>
                            <td style="padding:6px; color:#64748b; width:120px;">المتبرع:</td>
                            <td style="padding:6px; font-weight:700;" id="slip_donor_name"></td>
                        </tr>
                        <tr>
                            <td style="padding:6px; color:#64748b;">هاتف المتبرع:</td>
                            <td style="padding:6px;" dir="ltr" id="slip_donor_phone"></td>
                        </tr>
                        <tr>
                            <td style="padding:6px; color:#64748b;">الطالب المستلم:</td>
                            <td style="padding:6px; font-weight:700; color:#0284c7;" id="slip_booker_name"></td>
                        </tr>
                        <tr>
                            <td style="padding:6px; color:#64748b;">هاتف المستلم:</td>
                            <td style="padding:6px;" dir="ltr" id="slip_booker_phone"></td>
                        </tr>
                        <tr>
                            <td style="padding:6px; color:#64748b;">موعد التسليم:</td>
                            <td style="padding:6px;" id="slip_pickup_datetime"></td>
                        </tr>
                    </table>
                </div>

                <!-- رمز الاستجابة السريعة (QR Code للتسليم الفوري) -->
                <div style="display:flex; align-items:center; justify-content:space-between; margin:16px 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px;">
                    <div style="text-align:right;">
                        <div style="font-weight:800; font-size:13px; color:#0f172a;">رمز التسليم السريع (QR Code)</div>
                        <div style="font-size:11.5px; color:#64748b; margin-top:2px;">امسح الرمز بكاميرا الهاتف لتأكيد الاستلام المباشر</div>
                        <a id="slip_qr_link" href="#" target="_blank" style="font-size:11px; color:#0284c7; text-decoration:none; display:inline-block; margin-top:4px;">فتح صفحة التأكيد الفوري ↗</a>
                    </div>
                    <div style="background:#fff; padding:6px; border:1px solid #cbd5e1; border-radius:8px; display:inline-block;">
                        <img id="slip_qr_img" src="" alt="QR Code" style="width:85px; height:85px; display:block;">
                    </div>
                </div>

                <div class="slip-signatures">
                    <div class="slip-sign-block">
                        <div>توقيع الطالب المستلم</div>
                        <div class="sign-line"></div>
                    </div>
                    <div class="slip-sign-block">
                        <div>توقيع المنسق المشرف</div>
                        <div class="sign-line"></div>
                    </div>
                </div>

                <div class="slip-footer-note">
                    هذا المستند صادر إلكترونياً لغايات تنظيم عملية تبادل واستعارة الكتب الدراسية بين طلاب الجامعة لخدمة
                    المسيرة التعليمية.
                </div>
            </div>
        </div>
        <div class="custom-modal-footer no-print">
            <button type="button" class="btn btn-secondary" onclick="closeModal('slipModal')">إغلاق</button>
            <button type="button" class="btn btn-primary" onclick="printSlip()">🖨️ طباعة السند الآن</button>
        </div>
    </div>
</div>

<!-- 5. مودال قوالب واتساب الذكية بنقرة واحدة (WhatsApp Templates Modal) -->
<div class="custom-modal-overlay" id="whatsappTemplatesModal">
    <div class="custom-modal-box" style="max-width: 580px;">
        <div class="custom-modal-header" style="background:linear-gradient(135deg, #f0fdf4, #dcfce7); border-bottom:1px solid #bbf7d0;">
            <h3 style="color:#166534; display:flex; align-items:center; gap:8px;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="#16a34a"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.83 2.41c-1.47 0-2.91-.39-4.17-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.39c0-4.54 3.7-8.25 8.23-8.25z" /></svg>
                <span>قوالب واتساب الذكية بنقرة واحدة</span>
            </h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('whatsappTemplatesModal')">✕</button>
        </div>
        <div class="custom-modal-body">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:800; color:#0f172a; font-size:14px;" id="wa_target_name">اسم الطالب</div>
                    <div style="font-size:12px; color:#64748b;" id="wa_target_role">الدور: طالب مستلم</div>
                </div>
                <div style="font-weight:700; color:#0284c7; font-size:13px;" dir="ltr" id="wa_target_phone">07XXXXXXXX</div>
            </div>

            <div style="font-size:13px; font-weight:700; color:#334155; margin-bottom:8px;">اختر نموذج الرسالة الجاهزة:</div>
            
            <div style="display:flex; flex-direction:column; gap:10px;" id="wa_templates_container">
                <!-- أزرار النماذج تملأ عبر JS -->
            </div>

            <div style="margin-top:16px;">
                <label style="font-size:12.5px; font-weight:700; color:#475569; display:block; margin-bottom:6px;">نص الرسالة النهائي (يمكنك التعديل عليه قبل الإرسال):</label>
                <textarea id="wa_custom_text" rows="4" class="form-control" style="font-family:inherit; font-size:13px; line-height:1.6;"></textarea>
            </div>
        </div>
        <div class="custom-modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeModal('whatsappTemplatesModal')">إلغاء</button>
            <button type="button" class="btn" style="background:#16a34a; color:#fff; font-weight:800;" onclick="sendCustomWhatsApp()">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.83 2.41c-1.47 0-2.91-.39-4.17-1.14l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.39c0-4.54 3.7-8.25 8.23-8.25z" /></svg>
                فتح ومراسلة عبر واتساب ↗
            </button>
        </div>
    </div>
</div>

<!-- 6. مودال المطابقة الذكية والربط الفوري (Smart Match Modal) -->
<div class="custom-modal-overlay" id="smartMatchModal">
    <div class="custom-modal-box" style="max-width: 600px;">
        <div class="custom-modal-header" style="background: linear-gradient(135deg, #fdf4ff, #fae8ff); border-bottom: 1px solid #d8b4fe;">
            <h3 style="color:#581c87; display:flex; align-items:center; gap:8px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                <span>المطابقة الذكية والربط الفوري للكتب</span>
            </h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('smartMatchModal')">✕</button>
        </div>
        <form method="post">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="smart_match_fulfill">
            <input type="hidden" name="exchange_id" id="sm_exchange_id">

            <div class="custom-modal-body">
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px; margin-bottom:16px;">
                    <div style="font-size:12px; color:#64748b;">الكتاب المتوفر بالمستودع:</div>
                    <div style="font-weight:800; color:#0f172a; font-size:15px;" id="sm_material_title">اسم المادة</div>
                </div>

                <div class="form-group">
                    <label style="font-weight:700; color:#581c87;">اختر الطالب المراد ربطه من قائمة الانتظار:</label>
                    <select name="wishlist_id" id="sm_wishlist_select" class="form-control" required onchange="updateSmartMatchStudentInfo()">
                        <!-- الخيارات تملأ عبر JS -->
                    </select>
                </div>

                <div id="sm_student_details_box" style="background:#fdf2f8; border:1px solid #fbcfe8; border-radius:10px; padding:10px 14px; margin-bottom:14px; font-size:12.5px; color:#9d174d;">
                    <!-- معاينة تفاصيل الطالب عبر JS -->
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label>المنسق المكلف بالتسليم</label>
                        <select name="assigned_coordinator" id="sm_coordinator" class="form-control">
                            <?php foreach ($coordinatorsList as $cKey => $cVal): ?>
                                <option value="<?= $cKey ?>"><?= $cVal['name'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>تاريخ التسليم المقترح</label>
                        <input type="date" name="pickup_date" id="sm_pickup_date" value="<?= date('Y-m-d') ?>" class="form-control" required>
                    </div>
                    <div class="form-group">
                        <label>وقت التسليم</label>
                        <input type="time" name="pickup_time" id="sm_pickup_time" value="12:00" class="form-control" required>
                    </div>
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('smartMatchModal')">إلغاء</button>
                <button type="submit" class="btn" style="background:#9333ea; color:#fff; font-weight:800;">⚡ تأكيد الربط الذكي والحجز فورا</button>
            </div>
        </form>
    </div>
</div>

<!-- 7. مودال إدارة قائمة انتظار الكتب (Wishlist Modal) -->
<div class="custom-modal-overlay" id="wishlistModal">
    <div class="custom-modal-box" style="max-width: 850px;">
        <div class="custom-modal-header" style="background:linear-gradient(135deg,#f5f3ff,#ede9fe); border-bottom:1px solid #ddd6fe;">
            <h3 style="color:#5b21b6; display:flex; align-items:center; gap:8px;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></svg>
                <span>قائمة الانتظار وطلبات الكتب (Wishlist)</span>
                <span style="background:#7c3aed; color:#fff; font-size:11px; padding:2px 8px; border-radius:9999px;"><?= count($wishlistItems) ?> طلب معلق</span>
            </h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('wishlistModal')">✕</button>
        </div>
        <div class="custom-modal-body">
            <!-- نموذج إضافة طلب جديد -->
            <details style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:20px;">
                <summary style="font-weight:800; color:#0284c7; cursor:pointer; font-size:14px;">+ إضافة طالب جديد إلى قائمة الانتظار</summary>
                <form method="post" style="margin-top:14px;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="add_to_wishlist">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>اسم الطالب *</label>
                            <input type="text" name="student_name" required class="form-control" placeholder="اسم الطالب الثلاثي">
                        </div>
                        <div class="form-group">
                            <label>رقم الهاتف *</label>
                            <input type="text" name="student_phone" required class="form-control" placeholder="07XXXXXXXX">
                        </div>
                        <div class="form-group">
                            <label>الجنس</label>
                            <select name="student_gender" class="form-control">
                                <option value="male">ذكر</option>
                                <option value="female">أنثى</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>اسم الكتاب / المادة المطلوبة *</label>
                            <input type="text" name="material_name" required class="form-control" placeholder="مثال: كالكولس 1">
                        </div>
                        <div class="form-group">
                            <label>رمز المادة (اختياري)</label>
                            <input type="text" name="course_code" class="form-control" placeholder="مثال: MATH101">
                        </div>
                        <div class="form-group">
                            <label>الكلية</label>
                            <select name="faculty" class="form-control">
                                <?php foreach ($facultiesList as $fac): ?>
                                    <option value="<?= $fac ?>"><?= $fac ?></option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                    <div style="text-align:left; margin-top:10px;">
                        <button type="submit" class="btn btn-primary">إضافة إلى قائمة الانتظار</button>
                    </div>
                </form>
            </details>

            <!-- جدول طلبات الانتظار -->
            <div style="overflow-x:auto;">
                <table class="data-table" style="margin:0; width:100%;">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>اسم الطالب</th>
                            <th>الهاتف</th>
                            <th>الكتاب المطلوب</th>
                            <th>الكلية والرمز</th>
                            <th>تاريخ الطلب</th>
                            <th style="text-align:center;">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($wishlistItems)): ?>
                            <tr>
                                <td colspan="7" style="text-align:center; padding:30px; color:#94a3b8;">
                                    لا توجد طلبات معلقة في قائمة الانتظار حالياً.
                                </td>
                            </tr>
                        <?php else: ?>
                            <?php foreach ($wishlistItems as $w): ?>
                                <tr>
                                    <td style="font-weight:700; color:#64748b;">#<?= $w['id'] ?></td>
                                    <td style="font-weight:700; color:#0f172a;">
                                        <?= htmlspecialchars($w['student_name']) ?>
                                        <span class="gender-tag <?= $w['student_gender'] === 'female' ? 'gender-female' : 'gender-male' ?>">
                                            <?= $w['student_gender'] === 'female' ? 'أنثى' : 'ذكر' ?>
                                        </span>
                                    </td>
                                    <td dir="ltr" style="font-size:12.5px;"><?= htmlspecialchars($w['student_phone']) ?></td>
                                    <td style="font-weight:800; color:#7c3aed;"><?= htmlspecialchars($w['material_name']) ?></td>
                                    <td>
                                        <span class="badge-faculty"><?= htmlspecialchars($w['faculty'] ?: 'عام') ?></span>
                                        <?php if (!empty($w['course_code'])): ?>
                                            <span class="badge-code"><?= htmlspecialchars($w['course_code']) ?></span>
                                        <?php endif; ?>
                                    </td>
                                    <td style="font-size:12px; color:#64748b;"><?= htmlspecialchars(substr($w['created_at'], 0, 10)) ?></td>
                                    <td style="text-align:center;">
                                        <form method="post" onsubmit="return confirm('هل أنت متأكد من حذف هذا الطلب؟');" style="display:inline; margin:0;">
                                            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                                            <input type="hidden" name="action" value="delete_wishlist">
                                            <input type="hidden" name="wishlist_id" value="<?= $w['id'] ?>">
                                            <button type="submit" class="btn btn-secondary" style="padding:4px 8px; font-size:11.5px; color:#ef4444;" title="حذف">حذف</button>
                                        </form>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
        </div>
        <div class="custom-modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeModal('wishlistModal')">إغلاق</button>
        </div>
    </div>
</div>

<!-- 8. مودال اعتماد وتوجيه طلب التبرع (Approve & Assign Modal) -->
<div class="custom-modal-overlay" id="approveDonationModal">
    <div class="custom-modal-box" style="max-width: 620px;">
        <div class="custom-modal-header" style="background: linear-gradient(135deg, #ecfdf5, #d1fae5); border-bottom: 1px solid #a7f3d0;">
            <h3 style="color: #065f46; display: flex; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <span>اعتماد وتوجيه طلب التبرع بالمادة</span>
            </h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('approveDonationModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="approve_donation">
            <input type="hidden" name="id" id="approve_donation_id">

            <!-- بطاقة تفاصيل المتبرع والمادة القادمة من نموذج الموقع -->
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 18px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <div style="font-size: 11px; color: #64748b; font-weight: 600;">اسم المادة / الكتاب</div>
                        <div id="approve_mat_name" style="font-size: 16px; font-weight: 800; color: #0f172a;"></div>
                    </div>
                    <span id="approve_donor_gender_badge"></span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px; border-top: 1px dashed #cbd5e1; padding-top: 10px;">
                    <div><strong style="color: #475569;">المتبرع:</strong> <span id="approve_donor_name" style="font-weight: 700; color: #0f172a;"></span></div>
                    <div><strong style="color: #475569;">الهاتف الأساسي:</strong> <span id="approve_donor_phone" dir="ltr" style="font-weight: 700; color: #059669;"></span></div>
                    <div><strong style="color: #475569;">هاتف إضافي:</strong> <span id="approve_donor_phone_alt" dir="ltr" style="color: #64748b;"></span></div>
                    <div><strong style="color: #475569;">البريد الإلكتروني:</strong> <span id="approve_donor_email" style="color: #64748b;"></span></div>
                    <div style="grid-column: span 2;"><strong style="color: #475569;">أسبوع التسليم المقترح:</strong> <span id="approve_delivery_week" style="color: #d97706; font-weight: 700;"></span></div>
                    <div style="grid-column: span 2;" id="approve_desc_wrapper"><strong style="color: #475569;">الوصف / الملاحظات:</strong> <span id="approve_material_desc" style="color: #334155;"></span></div>
                </div>
            </div>

            <!-- خيارات التوجيه والفرز -->
            <div class="modal-form-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                <div class="form-group" style="grid-column: span 2;">
                    <label style="display: block; font-weight: 700; color: #0f172a; margin-bottom: 6px;">
                        توجيه المادة إلى (القسم أو المنسق المسؤول) *
                    </label>
                    <select name="assigned_coordinator" id="approve_assigned_coordinator" required class="form-control" style="border: 2px solid #10b981; font-weight: 700; font-size: 13.5px; padding: 10px;">
                        <optgroup label="تسليم عام / غير مفرز">
                            <option value="shared">🤝 جدول التسليم المشترك (بانتظار الفرز أو مشترك)</option>
                        </optgroup>
                        <optgroup label="فريق منسقي الذكور">
                            <?php foreach ($coordinatorsList as $cKey => $cVal): ?>
                                <?php if ($cKey !== 'shared' && ($cVal['gender'] ?? '') !== 'female'): ?>
                                    <option value="<?= $cKey ?>">👨‍💼 <?= htmlspecialchars($cVal['name']) ?> (<?= htmlspecialchars($cVal['role'] ?? 'منسق') ?>)</option>
                                <?php endif; ?>
                            <?php endforeach; ?>
                        </optgroup>
                        <optgroup label="فريق منسقات الإناث">
                            <?php foreach ($coordinatorsList as $cKey => $cVal): ?>
                                <?php if ($cKey !== 'shared' && ($cVal['gender'] ?? '') === 'female'): ?>
                                    <option value="<?= $cKey ?>">👩‍💼 <?= htmlspecialchars($cVal['name']) ?> (<?= htmlspecialchars($cVal['role'] ?? 'منسقة') ?>)</option>
                                <?php endif; ?>
                            <?php endforeach; ?>
                        </optgroup>
                    </select>
                    <span style="font-size: 11.5px; color: #64748b; margin-top: 5px; display: block;">
                        بناءً على جنس المتبرع ونوع المادة، يمكنك إسنادها فوراً للمنسق المسؤول أو وضعها في الجدول المشترك.
                    </span>
                </div>

                <div class="form-group">
                    <label style="display: block; font-weight: 700; color: #0f172a; margin-bottom: 6px;">الكلية التابعة لها المادة</label>
                    <select name="faculty" id="approve_faculty" class="form-control">
                        <option value="">— اختر الكلية (اختياري) —</option>
                        <?php foreach ($facultiesList as $fac): ?>
                            <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group">
                    <label style="display: block; font-weight: 700; color: #0f172a; margin-bottom: 6px;">رمز المساق (اختياري)</label>
                    <input type="text" name="course_code" id="approve_course_code" class="form-control" placeholder="مثال: ECON101">
                </div>

                <div class="form-group" style="grid-column: span 2;">
                    <label style="display: block; font-weight: 700; color: #0f172a; margin-bottom: 6px;">ملاحظات إدارية إضافية (اختياري)</label>
                    <input type="text" name="notes" id="approve_notes" class="form-control" placeholder="مثال: تم التنسيق مع الطالب للتسليم عند مدخل الكلية">
                </div>
            </div>

            <div class="custom-modal-footer" style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal('approveDonationModal')">إلغاء</button>
                <button type="submit" class="btn" style="background: #10b981; color: #fff; font-weight: 700; border: 1px solid #059669; padding: 9px 22px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    تأكيد الاعتماد والتوجيه للجدول
                </button>
            </div>
        </form>
    </div>
</div>

<script>
    let slipPollTimer = null;
    let slipPollCurrentId = null;

    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.add('show');
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.classList.remove('show');
        if (id === 'slipModal') {
            if (slipPollTimer) { clearInterval(slipPollTimer); slipPollTimer = null; }
            slipPollCurrentId = null;
        }
    }

    function openApproveDonationModal(item) {
        if (!item) return;
        document.getElementById('approve_donation_id').value = item.id || '';
        document.getElementById('approve_mat_name').textContent = item.material_name || 'بدون اسم';
        document.getElementById('approve_donor_name').textContent = item.donor_name || 'غير معروف';
        document.getElementById('approve_donor_phone').textContent = item.donor_phone || '-';
        document.getElementById('approve_donor_phone_alt').textContent = item.donor_phone_alt || '-';
        document.getElementById('approve_donor_email').textContent = item.donor_email || '-';
        document.getElementById('approve_delivery_week').textContent = item.delivery_week || 'غير محدد';
        
        const desc = item.material_description || item.notes || '';
        const descWrap = document.getElementById('approve_desc_wrapper');
        if (desc) {
            document.getElementById('approve_material_desc').textContent = desc;
            if (descWrap) descWrap.style.display = '';
        } else {
            if (descWrap) descWrap.style.display = 'none';
        }

        const genderBadge = document.getElementById('approve_donor_gender_badge');
        const gender = (item.donor_gender || '').toLowerCase();
        if (gender === 'female' || gender === 'أنثى') {
            genderBadge.innerHTML = '<span style="background:#fdf2f8;color:#db2777;border:1px solid #fbcfe8;font-size:11px;font-weight:700;padding:3px 10px;border-radius:9999px;">أنثى 👩</span>';
        } else {
            genderBadge.innerHTML = '<span style="background:#f0f9ff;color:#0284c7;border:1px solid #bae6fd;font-size:11px;font-weight:700;padding:3px 10px;border-radius:9999px;">ذكر 👨</span>';
        }

        const coordSelect = document.getElementById('approve_assigned_coordinator');
        if (coordSelect) {
            // Default: if female, pick female or shared; if male, pick shared or male
            coordSelect.value = 'shared';
        }

        if (document.getElementById('approve_faculty')) {
            document.getElementById('approve_faculty').value = item.faculty || '';
        }
        if (document.getElementById('approve_course_code')) {
            document.getElementById('approve_course_code').value = item.course_code || '';
        }
        if (document.getElementById('approve_notes')) {
            document.getElementById('approve_notes').value = '';
        }

        openModal('approveDonationModal');
    }

    function openArchiveCampaignModal() {
        openModal('archiveCampaignModal');
    }

    function openWishlistModal() {
        openModal('wishlistModal');
    }

    const SPECIALIZATIONS_BY_FACULTY = <?php echo json_encode($specializationsByFaculty, JSON_UNESCAPED_UNICODE); ?>;

    function updateSpecializationOptions(prefix) {
        const facultyEl = document.getElementById(prefix + 'FacultySelect');
        const groupEl = document.getElementById(prefix + 'SpecializationGroup');
        const selectEl = document.getElementById(prefix + 'SpecializationSelect');
        if (!facultyEl || !groupEl || !selectEl) return;

        const chosen = facultyEl.value;
        const specs = SPECIALIZATIONS_BY_FACULTY[chosen];

        if (specs && specs.length > 0) {
            selectEl.innerHTML = '<option value="">— اختر التخصص (اختياري) —</option>';
            specs.forEach(function (sp) {
                const opt = document.createElement('option');
                opt.value = sp;
                opt.textContent = sp;
                selectEl.appendChild(opt);
            });
            groupEl.style.display = '';
        } else {
            selectEl.innerHTML = '<option value="">— اختر التخصص —</option>';
            groupEl.style.display = 'none';
        }
    }

    function openAddMaterialModal() {
        openModal('addMaterialModal');
        setTimeout(function () { updateSpecializationOptions('add'); }, 50);
    }

    const COORDINATORS_MAP = <?php echo json_encode(array_map(fn($c) => $c['name'], $coordinatorsList), JSON_UNESCAPED_UNICODE); ?>;

    function openReserveModal(item) {
        document.getElementById('reserve_id').value = item.id;
        document.getElementById('reserve_material_title').innerText = item.material_name + (item.course_code ? ' (' + item.course_code + ')' : '');
        document.getElementById('reserve_donor_info').innerText = 'المتبرع: ' + item.donor_name + ' | الكلية: ' + (item.faculty || 'عام');
        document.getElementById('reserve_booker_name').value = item.booker_name || '';
        document.getElementById('reserve_booker_phone').value = item.booker_phone || '';
        document.getElementById('reserve_booker_gender').value = item.booker_gender || (item.donor_gender === 'female' ? 'female' : 'male');
        document.getElementById('reserve_coordinator').value = item.assigned_coordinator || 'shared';
        document.getElementById('reserve_pickup_date').value = item.pickup_date || '';
        document.getElementById('reserve_pickup_time').value = item.pickup_time || '';
        document.getElementById('reserve_notes').value = item.notes || '';
        openModal('reserveMaterialModal');
    }

    function openEditModal(item) {
        document.getElementById('edit_id').value = item.id;
        document.getElementById('edit_material_name').value = item.material_name || '';
        document.getElementById('edit_course_code').value = item.course_code || '';
        document.getElementById('edit_faculty').value = item.faculty || '';
        document.getElementById('edit_status').value = item.status || 'approved';
        document.getElementById('edit_donor_name').value = item.donor_name || '';
        document.getElementById('edit_donor_phone').value = item.donor_phone || '';
        document.getElementById('edit_donor_gender').value = item.donor_gender || 'male';
        document.getElementById('edit_assigned_coordinator').value = item.assigned_coordinator || 'shared';
        document.getElementById('edit_booker_name').value = item.booker_name || '';
        document.getElementById('edit_booker_phone').value = item.booker_phone || '';
        document.getElementById('edit_booker_gender').value = item.booker_gender || 'male';
        document.getElementById('edit_delivery_status').value = item.delivery_status || 'pending_contact';
        document.getElementById('edit_pickup_date').value = item.pickup_date || '';
        document.getElementById('edit_pickup_time').value = item.pickup_time || '';
        document.getElementById('edit_description').value = item.description || '';
        document.getElementById('edit_notes').value = item.notes || '';
        openModal('editMaterialModal');
    }

    function openSlipModal(item) {
        document.getElementById('slip_id').innerText = '#' + item.id;
        document.getElementById('slip_material_name').innerText = item.material_name || '—';
        document.getElementById('slip_course_code').innerText = item.course_code || '—';
        document.getElementById('slip_faculty').innerText = item.faculty || '—';
        document.getElementById('slip_donor_name').innerText = item.donor_name || '—';
        document.getElementById('slip_donor_phone').innerText = item.donor_phone || '—';
        document.getElementById('slip_booker_name').innerText = item.booker_name || 'بانتظار المستلم';
        document.getElementById('slip_booker_phone').innerText = item.booker_phone || '—';
        document.getElementById('slip_coord').innerText = COORDINATORS_MAP[item.assigned_coordinator] || item.assigned_coordinator || 'غير مسند / تسليم مشترك';
        document.getElementById('slip_status').innerText = item.status === 'completed' ? 'تم التسليم' : (item.status === 'reserved' ? 'محجوز' : 'متاح');
        document.getElementById('slip_pickup_datetime').innerText = (item.pickup_date || 'غير محدد') + (item.pickup_time ? ' الساعة ' + item.pickup_time : '');

        // توليد رابط ورمز الاستجابة السريعة QR Code للتسليم
        const baseUrl = window.location.href.split('?')[0].replace('donations.php', 'quick_delivery.php');
        const deliveryUrl = baseUrl + '?id=' + item.id + '&token=' + (item.qr_token || '');
        document.getElementById('slip_qr_img').src = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(deliveryUrl);
        document.getElementById('slip_qr_link').href = deliveryUrl;

        // إخفاء بانر التسليم عند الفتح
        const liveBanner = document.getElementById('slip_live_delivered_banner');
        if (liveBanner) liveBanner.style.display = 'none';

        openModal('slipModal');

        // بدء polling مباشر كل 2 ثانية للكشف عن مسح الباركود من الهاتف
        if (slipPollTimer) clearInterval(slipPollTimer);
        slipPollCurrentId = item.id;

        // إذا كانت المادة محجوزة نبدأ المراقبة، إذا كانت مكتملة نظهر البانر مباشرة
        if (item.status === 'completed') {
            if (liveBanner) liveBanner.style.display = 'block';
        } else if (item.status === 'reserved') {
            slipPollTimer = setInterval(function() {
                if (!slipPollCurrentId) { clearInterval(slipPollTimer); return; }
                fetch('donations.php?action=check_delivery_status&id=' + slipPollCurrentId)
                    .then(r => r.json())
                    .then(data => {
                        if (data && data.delivered) {
                            clearInterval(slipPollTimer);
                            slipPollTimer = null;
                            // تحديث بانر التسليم الفوري
                            if (liveBanner) {
                                liveBanner.style.display = 'block';
                                liveBanner.innerHTML = '🎉 تم مسح الباركود وتأكيد استلام المادة بنجاح الآن! <span style="font-size:12px; color:#065f46;">' + (data.delivered_at ? '— ' + data.delivered_at : '') + '</span>';
                            }
                            // تشغيل صوت إشعار بسيط
                            try {
                                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                                const osc = ctx.createOscillator(); osc.connect(ctx.destination);
                                osc.frequency.value = 880; osc.start(); osc.stop(ctx.currentTime + 0.25);
                            } catch(e) {}
                            // تحديث badge الحالة في صف الجدول بدون ريلود
                            const badgeEl = document.getElementById('badge_status_' + slipPollCurrentId);
                            if (badgeEl) {
                                badgeEl.className = 'custom-badge badge-completed';
                                badgeEl.innerText = 'تم التسليم';
                            }
                            // تحديث نص حالة السند
                            document.getElementById('slip_status').innerText = 'تم التسليم';
                        }
                    })
                    .catch(() => {});
            }, 2000);
        }
    }

    function printSlip() {
        window.print();
    }

    /* ---------- محرك قوالب واتساب الذكية (WhatsApp Quick Templates) ---------- */
    let currentWaPhone = '';
    function openWhatsAppTemplatesModal(item, role) {
        const targetName = (role === 'donor') ? item.donor_name : (item.booker_name || 'الطالب');
        const targetPhone = (role === 'donor') ? item.donor_phone : (item.booker_phone || '');
        const bookName = item.material_name || '';
        const pickupDate = item.pickup_date || 'المحدد';
        const pickupTime = item.pickup_time || 'المحددة';
        const coordName = COORDINATORS_MAP[item.assigned_coordinator] || 'فريق التنسيق';

        currentWaPhone = targetPhone;
        document.getElementById('wa_target_name').innerText = targetName;
        document.getElementById('wa_target_role').innerText = (role === 'donor') ? 'الدور: طالب متبرع 🌟' : 'الدور: طالب مستلم 📚';
        document.getElementById('wa_target_phone').innerText = targetPhone || 'لا يوجد هاتف';

        const container = document.getElementById('wa_templates_container');
        container.innerHTML = '';

        let templates = [];

        if (role === 'booker') {
            templates = [
                {
                    title: '📩 تأكيد موعد استلام كتاب',
                    desc: 'إشعار الطالب بتأكيد حجز الكتاب وتحديد موعد اللقاء',
                    text: `السلام عليكم ${targetName}، معك ${coordName} من منصة مكانك بخصوص حجزك لمادة (${bookName}). تم تأكيد حجزك وموعد الاستلام يوم ${pickupDate} الساعة ${pickupTime} في الجامعة. نرجو التواجد بالموعد المحدد للتسليم.`
                },
                {
                    title: '⏰ تذكير بالموعد (قبل اللقاء)',
                    desc: 'تذكير الطالب بالموعد قبل ساعة من موعد التسليم',
                    text: `مرحباً ${targetName} ⏰، تذكير بموعد استلام كتاب (${bookName}) اليوم الساعة ${pickupTime}. المنسق بانتظارك في الحرم الجامعي للتسليم.`
                },
                {
                    title: '💬 محادثة مباشرة عامة',
                    desc: 'بدء محادثة ترحيبية مع الطالب',
                    text: `السلام عليكم ${targetName}، معك ${coordName} من منصة مكانك بخصوص مادة (${bookName}).`
                }
            ];
        } else {
            templates = [
                {
                    title: '💚 شكر وتقدير بعد اكتمال التسليم',
                    desc: 'إشعار المتبرع بأن كتابه وصل بنجاح لطالب مستفيد',
                    text: `السلام عليكم ورحمة الله ${targetName} 🌟\n\nنود إعلامك بأنه تم تسليم كتابك (${bookName}) بنجاح لأحد زملائك الطلاب المستفيدين عبر منصة مكانك.\n\nجزاك الله كل خير وجعله في ميزان حسناتك! 💚`
                },
                {
                    title: '📦 تأكيد استلام الكتاب للتبرع',
                    desc: 'شكر الطالب المتبرع فور تسجيل الكتاب بالمنصة',
                    text: `السلام عليكم ${targetName}، نود شكرك على مبادرتك الكريمة بالتبرع بمادة (${bookName}) عبر منصة مكانك. فريق التنسيق سيتولى فرزها وتسليمها لمن يستحقها.`
                },
                {
                    title: '💬 محادثة مباشرة مع المتبرع',
                    desc: 'مراسلة المتبرع للاستفسار أو التنسيق',
                    text: `السلام عليكم ${targetName}، معك ${coordName} من منصة مكانك بخصوص مادة (${bookName}).`
                }
            ];
        }

        templates.forEach((tpl, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn';
            btn.style.cssText = 'text-align:right; display:flex; flex-direction:column; align-items:flex-start; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:10px; padding:10px 14px; cursor:pointer; width:100%; transition:all .15s;';
            btn.innerHTML = `<div style="font-weight:800; color:#0f172a; font-size:13.5px;">${tpl.title}</div><div style="font-size:11.5px; color:#64748b; margin-top:2px;">${tpl.desc}</div>`;
            btn.onclick = function() {
                container.querySelectorAll('button').forEach(b => {
                    b.style.borderColor = '#e2e8f0';
                    b.style.background = '#f8fafc';
                });
                btn.style.borderColor = '#16a34a';
                btn.style.background = '#f0fdf4';
                document.getElementById('wa_custom_text').value = tpl.text;
            };
            container.appendChild(btn);
        });

        // اختيار النموذج الأول افتراضياً
        if (templates.length > 0) {
            document.getElementById('wa_custom_text').value = templates[0].text;
            container.firstChild.style.borderColor = '#16a34a';
            container.firstChild.style.background = '#f0fdf4';
        }

        openModal('whatsappTemplatesModal');
    }

    function sendCustomWhatsApp() {
        if (!currentWaPhone) {
            alert('لا يتوفر رقم هاتف لهذا الطالب.');
            return;
        }
        let cleanPhone = currentWaPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('07') && cleanPhone.length === 10) {
            cleanPhone = '962' + cleanPhone.substring(1);
        } else if (cleanPhone.startsWith('7') && cleanPhone.length === 9) {
            cleanPhone = '962' + cleanPhone;
        }
        const text = document.getElementById('wa_custom_text').value;
        const url = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(text);
        window.open(url, '_blank');
    }

    /* ---------- محرك المطابقة الذكية للكتب (Smart Match Engine) ---------- */
    let currentSmartMatchedStudents = [];
    function openSmartMatchModal(material, matchedWishlist) {
        document.getElementById('sm_exchange_id').value = material.id;
        document.getElementById('sm_material_title').innerText = material.material_name + (material.course_code ? ' (' + material.course_code + ')' : '') + ' — ' + (material.faculty || 'عام');
        
        currentSmartMatchedStudents = matchedWishlist;
        const select = document.getElementById('sm_wishlist_select');
        select.innerHTML = '';

        matchedWishlist.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.id;
            opt.textContent = `${w.student_name} (${w.student_phone}) — طلب: ${w.material_name}`;
            select.appendChild(opt);
        });

        if (material.assigned_coordinator) {
            document.getElementById('sm_coordinator').value = material.assigned_coordinator;
        }

        updateSmartMatchStudentInfo();
        openModal('smartMatchModal');
    }

    function updateSmartMatchStudentInfo() {
        const select = document.getElementById('sm_wishlist_select');
        const box = document.getElementById('sm_student_details_box');
        if (!select || !box) return;

        const chosenId = parseInt(select.value, 10);
        const student = currentSmartMatchedStudents.find(s => parseInt(s.id, 10) === chosenId);

        if (student) {
            box.innerHTML = `<strong>تفاصيل الطالب المختار:</strong> ${student.student_name} | هاتف: <span dir="ltr">${student.student_phone}</span> | الكلية: ${student.faculty || 'عام'} | تاريخ الطلب: ${student.created_at || 'حديثاً'}`;
            box.style.display = 'block';
        } else {
            box.style.display = 'none';
        }
    }

    // إغلاق المودال بالنقر خارج الصندوق
    document.querySelectorAll('.custom-modal-overlay').forEach(function (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                overlay.classList.remove('show');
            }
        });
    });
</script>

<?php require __DIR__ . '/_footer.php'; ?>