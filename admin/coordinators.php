<?php
/**
 * admin/coordinators.php — إدارة المنسقين المتطوعين، حسابات النظام، والصلاحيات الدقيقة
 */
$page_key = 'coordinators';
$page_title = 'المنسقون المتطوعون وحسابات النظام';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/totp.php';
require_once __DIR__ . '/../sync_official_live.php';

/**
 * يرسل بيانات منسق واحد إلى Firestore (upsert بناءً على local_id).
 * يُستدعى بعد كل إضافة أو تعديل أو تغيير حالة.
 */
function pushCoordinatorToFirestore(array $row): void
{
    $docId = 'coord_' . (int) $row['id'];
    liveFirestoreSet('coordinators', $docId, [
        'local_id' => (int) $row['id'],
        'name' => (string) ($row['name'] ?? ''),
        'phone' => (string) ($row['phone'] ?? ''),
        'gender' => (string) ($row['gender'] ?? 'male'),
        'faculty' => (string) ($row['faculty'] ?? ''),
        'major' => (string) ($row['major'] ?? ''),
        'role_type' => (string) ($row['role_type'] ?? 'coordinator'),
        'bio' => (string) ($row['bio'] ?? ''),
        'tasks_count' => (int) ($row['tasks_count'] ?? 0),
        'tasks_completed' => (int) ($row['tasks_completed'] ?? 0),
        'is_active' => (int) ($row['is_active'] ?? 1),
        'joined_at' => (string) ($row['joined_at'] ?? ''),
        'notes' => (string) ($row['notes'] ?? ''),
        'updated_at' => date('Y-m-d H:i:s'),
    ]);
}

/**
 * يحذف وثيقة منسق من Firestore بناءً على local_id.
 */
function deleteCoordinatorFromFirestore(int $id): bool
{
    return liveFirestoreDelete('coordinators', 'coord_' . $id);
}
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();
$officialCoordinatorsSynced = pull_official_coordinators($db);
$currentUserId = (int) ($_SESSION['user_id'] ?? 0);
$currentUserStmt = $db->prepare('SELECT id, username, role FROM users WHERE id = ? LIMIT 1');
$currentUserStmt->execute([$currentUserId]);
$currentUser = $currentUserStmt->fetch(PDO::FETCH_ASSOC) ?: [];
$canManageAccounts = in_array($currentUser['role'] ?? '', ['admin', 'super_admin'], true)
    || $currentUserId === 1
    || strtoupper((string) ($currentUser['username'] ?? '')) === 'HUSSIEN';

$coordinatorRoleLabels = [
    'lead_coordinator' => ['label' => 'منسق رئيسي', 'class' => 'role-lead'],
    'general_coordinator' => ['label' => 'منسق عام', 'class' => 'role-lead'],
    'coordinator' => ['label' => 'منسق', 'class' => 'role-coord'],
    'assistant' => ['label' => 'مساعد منسق', 'class' => 'role-asst'],
    'field_officer' => ['label' => 'مسؤول ميداني', 'class' => 'role-coord'],
    'assistant_field_officer' => ['label' => 'مساعد مسؤول ميداني', 'class' => 'role-asst'],
    'observer' => ['label' => 'مراقب', 'class' => 'role-obs'],
];

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

$facultiesList = [
    'كلية الذكاء الاصطناعي',
    'كلية الأمير عبدالله بن غازي',
];

// قائمة الصفحات والأقسام المتاحة لتحديد الصلاحيات
$systemSections = [
    'tasks' => ['label' => 'المهام والتكليفات', 'icon' => '', 'desc' => 'إدارة ونشر وتبني المهام والتكليفات'],
    'rewards' => ['label' => 'النقاط والمكافآت', 'icon' => '', 'desc' => 'إدارة نقاط المنسقين، الرتب، ومتجر المكافآت'],
    'donations' => ['label' => 'إدارة تبادل المواد', 'icon' => '', 'desc' => 'إدارة طلبات الكتب والمواد وتسليمها'],
    'materials' => ['label' => 'المواد الدراسية والملفات', 'icon' => '', 'desc' => 'رفع وإدارة وتنسيق دوسيات ومواد المواد'],
    'tests' => ['label' => 'الاختبارات والاستبيانات', 'icon' => '', 'desc' => 'إنشاء وإدارة الكويزات ونماذج Forms'],
    'services' => ['label' => 'طلبات الخدمات الطلابية', 'icon' => '', 'desc' => 'معالجة الخدمات والتكاليف والطلبات'],
    'ads' => ['label' => 'الإعلانات والبانرات', 'icon' => '', 'desc' => 'نشر وتحديث إعلانات المنصة'],
    'membership' => ['label' => 'طلبات الانضمام والتطوع', 'icon' => '', 'desc' => 'مراجعة طلبات الراغبين بالانضمام للفريق'],
    'stats' => ['label' => 'الإحصائيات والتقارير', 'icon' => '', 'desc' => 'الاطلاع على أرقام ومؤشرات المنصة'],
    'coordinators' => ['label' => 'المنسقون وحسابات النظام', 'icon' => '', 'desc' => 'إدارة فريق العمل وحسابات الدخول'],
    'general' => ['label' => 'الإدارة العامة وإعدادات الموقع', 'icon' => '', 'desc' => 'إعدادات المنصة، الهوية، الأمان'],
    'reviews' => ['label' => 'الآراء والتقييمات', 'icon' => '', 'desc' => 'تقييمات وتجارب المستفيدين'],
    'reports' => ['label' => 'البلاغات والشكاوى', 'icon' => '', 'desc' => 'متابعة البلاغات ومعالجتها'],
    'contributions' => ['label' => 'المساهمات الجامعية', 'icon' => '', 'desc' => 'سجل المبادرات والأنشطة'],
    'activity' => ['label' => 'سجل النشاط والأمان', 'icon' => '', 'desc' => 'سجل العمليات وتسجيلات الدخول'],
    'faq' => ['label' => 'نشمي والأسئلة الشائعة', 'icon' => '', 'desc' => 'بنك الأسئلة والمساعد الذكي'],
];

$systemCapabilities = [
    'tasks.view_only' => ['label' => 'الرؤية والاطلاع فقط على كل المهام', 'page' => 'tasks'],
    'tasks.view_all' => ['label' => 'رؤية كل المهام ومحتوى الفريق', 'page' => 'tasks'],
    'tasks.create' => ['label' => 'إضافة مهمة', 'page' => 'tasks'],
    'tasks.edit' => ['label' => 'تعديل مهمة', 'page' => 'tasks'],
    'tasks.delete' => ['label' => 'حذف مهمة', 'page' => 'tasks'],
    'donations.archive_view' => ['label' => 'الاطلاع على أرشيف الحملات السابقة (تبادل المواد)', 'page' => 'donations'],
    'donations.archive_manage' => ['label' => 'أرشفة الحملة الحالية (تبادل المواد)', 'page' => 'donations'],
    'donations.create_campaign' => ['label' => 'فتح وبدء حملة جديدة (تبادل المواد)', 'page' => 'donations'],
];

/* ================================================================
   معالجة POST
   ================================================================ */
$flash = null;
$resetTotpData = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$canManageAccounts) {
        http_response_code(403);
        exit('غير مصرح: إدارة الحسابات والصلاحيات متاحة للأدمن فقط.');
    } elseif (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني'];
    } else {
        $action = $_POST['action'] ?? '';

        // ───── 1. إضافة منسق جديد ─────
        if ($action === 'create') {
            $db->prepare("INSERT INTO coordinators (name,phone,gender,faculty,major,role_type,bio,tasks_count,tasks_completed,is_active,joined_at,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
                ->execute([
                    trim($_POST['name']),
                    trim($_POST['phone'] ?? ''),
                    $_POST['gender'] ?? 'male',
                    trim($_POST['faculty'] ?? ''),
                    trim($_POST['major'] ?? ''),
                    $_POST['role_type'] ?? 'coordinator',
                    trim($_POST['bio'] ?? ''),
                    (int) ($_POST['tasks_count'] ?? 0),
                    (int) ($_POST['tasks_completed'] ?? 0),
                    (int) ($_POST['is_active'] ?? 1),
                    !empty($_POST['joined_at']) ? $_POST['joined_at'] : date('Y-m-d'),
                    trim($_POST['notes'] ?? '')
                ]);
            $newCoordId = (int) $db->lastInsertId();

            // إنشاء حساب دخول إن طُلب ذلك
            if (!empty($_POST['create_system_account']) && !empty($_POST['username']) && !empty($_POST['password'])) {
                $username = strtolower(trim($_POST['username']));
                $email = trim($_POST['email'] ?? '');
                $role = $_POST['system_role'] ?? 'coordinator';
                $passHash = password_hash($_POST['password'], PASSWORD_DEFAULT);
                $mustChange = !empty($_POST['must_change_password']) ? 1 : 0;
                $permissions = ($role === 'admin') ? json_encode(array_keys($systemSections)) : json_encode($_POST['permissions'] ?? ['donations', 'materials']);

                try {
                    $stmtUser = $db->prepare("INSERT INTO users (username, full_name, email, role, permissions, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
                    $stmtUser->execute([$username, trim($_POST['name']), $email, $role, $permissions, $passHash, $mustChange]);
                    $userId = (int) $db->lastInsertId();
                    $db->prepare("UPDATE coordinators SET user_id = ? WHERE id = ?")->execute([$userId, $newCoordId]);
                    log_activity("أنشأ حساب دخول للمنسق: $username بالصلاحيات المحددة", 'security');
                } catch (Exception $e) {
                    $flash = ['type' => 'error', 'msg' => 'تم حفظ المنسق لكن اسم المستخدم للحساب مستخدم بالفعل!'];
                }
            }

            log_activity("أضاف منسقاً جديداً: " . trim($_POST['name']), 'coordinator');
            // ← مزامنة فورية مع Firestore
            $newRow = $db->query("SELECT * FROM coordinators WHERE id = $newCoordId")->fetch(PDO::FETCH_ASSOC);
            if ($newRow)
                pushCoordinatorToFirestore($newRow);
            if (!$flash)
                $flash = ['type' => 'success', 'msg' => 'تم إضافة المنسق بنجاح'];
        }

        // ───── 2. تعديل منسق ─────
        elseif ($action === 'edit') {
            $db->prepare("UPDATE coordinators SET name=?,phone=?,gender=?,faculty=?,major=?,role_type=?,bio=?,tasks_count=?,tasks_completed=?,is_active=?,joined_at=?,notes=? WHERE id=?")
                ->execute([
                    trim($_POST['name']),
                    trim($_POST['phone'] ?? ''),
                    $_POST['gender'] ?? 'male',
                    trim($_POST['faculty'] ?? ''),
                    trim($_POST['major'] ?? ''),
                    $_POST['role_type'] ?? 'coordinator',
                    trim($_POST['bio'] ?? ''),
                    (int) ($_POST['tasks_count'] ?? 0),
                    (int) ($_POST['tasks_completed'] ?? 0),
                    (int) ($_POST['is_active'] ?? 1),
                    !empty($_POST['joined_at']) ? $_POST['joined_at'] : null,
                    trim($_POST['notes'] ?? ''),
                    (int) $_POST['id']
                ]);
            log_activity("عدّل بيانات المنسق ID " . (int) $_POST['id'], 'coordinator');
            // ← مزامنة فورية مع Firestore
            $editedId = (int) $_POST['id'];
            $editedRow = $db->query("SELECT * FROM coordinators WHERE id = $editedId")->fetch(PDO::FETCH_ASSOC);
            if ($editedRow)
                pushCoordinatorToFirestore($editedRow);
            $flash = ['type' => 'success', 'msg' => 'تم حفظ التعديلات'];
        }


        // ───── 3. تجديد باركود تطبيق المصادقة لحساب مرتبط ─────
        if ($action === 'reset_coordinator_totp') {
            $coordId = (int) ($_POST['coord_id'] ?? 0);
            $coordStmt = $db->prepare('SELECT c.name, c.user_id, u.username, u.email, u.is_official FROM coordinators c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?');
            $coordStmt->execute([$coordId]);
            $coord = $coordStmt->fetch(PDO::FETCH_ASSOC);
            if (!$coord || empty($coord['user_id'])) {
                $flash = ['type' => 'error', 'msg' => 'لا يوجد حساب دخول مرتبط بهذا المنسق.'];
            } else {
                $secret = TOTP::generateSecret();
                $db->prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')->execute([$secret, (int) $coord['user_id']]);
                $accountLabel = $coord['username'] . ' (' . ($coord['email'] ?: 'Makanak') . ')';
                $otpauthUri = TOTP::provisioningUri($secret, $accountLabel, 'منصة مكانك');
                $resetTotpData = [
                    'name' => $coord['name'],
                    'secret' => implode(' ', str_split($secret, 4)),
                    'qr_url' => 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' . urlencode($otpauthUri),
                ];
                log_activity("جدد باركود المصادقة الثنائية لحساب المنسق {$coord['name']}", 'security');
                $flash = ['type' => 'success', 'msg' => 'تم تجديد باركود تطبيق المصادقة. امسح الرمز الجديد ثم فعّل المصادقة من حساب المنسق.'];
            }
        }

        // ───── 4. حفظ أو تعديل حساب الدخول والصلاحيات المحددة ─────
        elseif ($action === 'save_system_account') {
            $coordId = (int) $_POST['coord_id'];
            $coordName = trim($_POST['coord_name'] ?? '');
            if ($coordName !== '') {
                $db->prepare("UPDATE coordinators SET name=?,phone=?,gender=?,faculty=?,major=?,role_type=?,bio=?,is_active=?,joined_at=?,notes=? WHERE id=?")
                    ->execute([
                        $coordName,
                        trim($_POST['coord_phone'] ?? ''),
                        $_POST['coord_gender'] ?? 'male',
                        trim($_POST['coord_faculty'] ?? ''),
                        trim($_POST['coord_major'] ?? ''),
                        $_POST['coord_role_type'] ?? 'coordinator',
                        trim($_POST['coord_bio'] ?? ''),
                        (int) ($_POST['coord_is_active'] ?? 1),
                        !empty($_POST['coord_joined_at']) ? $_POST['coord_joined_at'] : null,
                        trim($_POST['coord_notes'] ?? ''),
                        $coordId
                    ]);
                log_activity("عدّل بيانات المنسق ID $coordId مع بيانات الحساب", 'coordinator');
            }
            $username = strtolower(trim($_POST['username']));
            $email = trim($_POST['email'] ?? '');
            $role = $_POST['system_role'] ?? 'coordinator';
            $password = trim($_POST['password'] ?? '');
            $mustChange = !empty($_POST['must_change_password']) ? 1 : 0;

            // تجهيز مصفوفة الصلاحيات المسموحة
            if ($role === 'admin') {
                $permissions = json_encode(array_keys($systemSections));
            } else {
                $selectedPerms = $_POST['permissions'] ?? [];
                $permissions = json_encode(array_values($selectedPerms));
            }

            $coord = $db->prepare("SELECT name, user_id FROM coordinators WHERE id = ?");
            $coord->execute([$coordId]);
            $cRow = $coord->fetch(PDO::FETCH_ASSOC);

            if ($cRow) {
                if (!empty($cRow['user_id'])) {
                    // تحديث حساب المستخدم الموجود
                    $userId = (int) $cRow['user_id'];
                    if (!empty($password)) {
                        $passHash = password_hash($password, PASSWORD_DEFAULT);
                        $db->prepare("UPDATE users SET username=?, email=?, role=?, permissions=?, password_hash=?, must_change_password=? WHERE id=?")
                            ->execute([$username, $email, $role, $permissions, $passHash, $mustChange, $userId]);
                        log_activity("حدّث كلمة مرور وصلاحيات حساب المنسق: $username", 'security');
                    } else {
                        $db->prepare("UPDATE users SET username=?, email=?, role=?, permissions=?, must_change_password=? WHERE id=?")
                            ->execute([$username, $email, $role, $permissions, $mustChange, $userId]);
                        log_activity("حدّث صلاحيات وبيانات حساب المنسق: $username", 'security');
                    }
                    $flash = ['type' => 'success', 'msg' => 'تم حفظ بيانات الحساب وتعيين الصلاحيات المحددة بنجاح'];
                } else {
                    // إنشاء حساب جديد
                    if (empty($password)) {
                        $flash = ['type' => 'error', 'msg' => 'يرجى إدخال كلمة مرور لإنشاء الحساب'];
                    } else {
                        try {
                            $passHash = password_hash($password, PASSWORD_DEFAULT);
                            $stmtUser = $db->prepare("INSERT INTO users (username, full_name, email, role, permissions, password_hash, must_change_password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
                            $stmtUser->execute([$username, $cRow['name'], $email, $role, $permissions, $passHash, $mustChange]);
                            $newUserId = (int) $db->lastInsertId();
                            $db->prepare("UPDATE coordinators SET user_id = ? WHERE id = ?")->execute([$newUserId, $coordId]);
                            log_activity("أنشأ حساب دخول للمنسق {$cRow['name']} باسم: $username بالصلاحيات المحددة", 'security');
                            $flash = ['type' => 'success', 'msg' => 'تم إنشاء حساب الدخول وتعيين الصلاحيات بنجاح'];
                        } catch (Exception $e) {
                            $flash = ['type' => 'error', 'msg' => 'اسم المستخدم مستخدم بالفعل، يرجى اختيار اسم آخر'];
                        }
                    }
                }
            }
        }

        // ───── 3.1 تجديد كلمة مرور حساب المنسق (Admin) ─────
        elseif ($action === 'reset_coordinator_password') {
            $coordId = (int) ($_POST['coord_id'] ?? 0);
            $coordStmt = $db->prepare('SELECT c.name, c.user_id, u.username FROM coordinators c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?');
            $coordStmt->execute([$coordId]);
            $coord = $coordStmt->fetch(PDO::FETCH_ASSOC);
            if (!$coord || empty($coord['user_id'])) {
                $flash = ['type' => 'error', 'msg' => 'لا يوجد حساب دخول مرتبط بهذا المنسق.'];
            } else {
                $characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
                $newPassword = '';
                for ($index = 0; $index < 16; $index++) {
                    $newPassword .= $characters[random_int(0, strlen($characters) - 1)];
                }
                $db->prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
                    ->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int) $coord['user_id']]);
                log_activity("جدد كلمة مرور حساب المنسق {$coord['name']}", 'security');
                $flash = ['type' => 'success', 'msg' => "تم تجديد كلمة المرور للحساب {$coord['username']}. كلمة المرور الجديدة (تظهر الآن فقط): {$newPassword}"];
            }
        }

        // ───── 4. سحب / إلغاء حساب الدخول ─────
        elseif ($action === 'revoke_system_account') {
            $coordId = (int) $_POST['coord_id'];
            $userId = (int) $_POST['user_id'];
            $db->prepare("UPDATE coordinators SET user_id = NULL WHERE id = ?")->execute([$coordId]);
            archive_delete('users', $userId, 'إلغاء حساب دخول منسق');
            log_activity("ألغى حساب الدخول المرتبط بالمنسق ID $coordId", 'security');
            $flash = ['type' => 'success', 'msg' => 'تم إلغاء حساب الوصول للنظام بنجاح'];
        }

        // ───── 5. تبديل نشاط المنسق ─────
        elseif ($action === 'toggle_active') {
            $newStatus = ((int) $_POST['current_active'] === 1) ? 0 : 1;
            $toggleId = (int) $_POST['id'];
            $db->prepare("UPDATE coordinators SET is_active=? WHERE id=?")->execute([$newStatus, $toggleId]);
            log_activity("غيّر حالة المنسق ID " . $toggleId . " إلى " . ($newStatus ? 'نشط' : 'غير نشط'), 'coordinator');
            // ← مزامنة فورية مع Firestore
            $toggleRow = $db->query("SELECT * FROM coordinators WHERE id = $toggleId")->fetch(PDO::FETCH_ASSOC);
            if ($toggleRow)
                pushCoordinatorToFirestore($toggleRow);
            $flash = ['type' => 'success', 'msg' => $newStatus ? 'تم تنشيط المنسق' : 'تم إيقاف نشاط المنسق'];
        }

        // ───── 6. حذف المنسق نهائياً ─────
        elseif ($action === 'delete') {
            $deleteId = (int) $_POST['id'];
            $n = $db->prepare("SELECT c.name, c.user_id, u.is_official FROM coordinators c LEFT JOIN users u ON u.id = c.user_id WHERE c.id=?");
            $n->execute([$deleteId]);
            $cRow = $n->fetch(PDO::FETCH_ASSOC);
            if ($cRow) {
                if (!empty($cRow['user_id']) && (int) ($cRow['is_official'] ?? 0) === 1) {
                    $flash = ['type' => 'error', 'msg' => 'لا يمكن حذف منسق يملك حساب فريق رسمي. اسحب حساب الدخول صراحة أولاً إذا كان ذلك مقصوداً.'];
                } else {
                    try {
                        $db->beginTransaction();
                        archive_record('coordinators', $deleteId, 'حذف منسق نهائي');
                        if (!empty($cRow['user_id'])) {
                            archive_delete('users', (int) $cRow['user_id'], 'حذف حساب منسق محذوف');
                        }
                        $db->prepare("DELETE FROM coordinators WHERE id=?")->execute([$deleteId]);
                        $db->commit();

                        // إزالة النسخة المنشورة حتى لا تعيدها المزامنة إلى القاعدة المحلية.
                        $remoteDeleted = deleteCoordinatorFromFirestore($deleteId);
                        log_activity("حذف المنسق {$cRow['name']} نهائياً", 'coordinator');
                        $flash = [
                            'type' => 'success',
                            'msg' => $remoteDeleted
                                ? 'تم حذف المنسق وحساب الدخول المرتبط به نهائياً'
                                : 'تم حذف المنسق محلياً نهائياً، وتعذر الاتصال بالمزامنة حالياً',
                        ];
                    } catch (Throwable $e) {
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                        $flash = ['type' => 'error', 'msg' => 'تعذر حذف المنسق: ' . $e->getMessage()];
                    }
                }
            }
        }

    }
}

/* ================================================================
   قراءة البيانات مع بيانات الحسابات والصلاحيات (LEFT JOIN)
   ================================================================ */
$tabFilter = $_GET['tab'] ?? 'all';
$facultyFilter = $_GET['faculty'] ?? '';
$roleFilter = $_GET['role'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = [];
if ($tabFilter === 'active') {
    $where[] = "c.is_active = 1";
} elseif ($tabFilter === 'inactive') {
    $where[] = "c.is_active = 0";
} elseif ($tabFilter === 'system_access') {
    $where[] = "c.user_id IS NOT NULL";
}

if ($facultyFilter) {
    $where[] = "c.faculty = ?";
    $params[] = $facultyFilter;
}
if ($roleFilter) {
    $where[] = "c.role_type = ?";
    $params[] = $roleFilter;
}
if ($search) {
    $where[] = "(c.name LIKE ? OR c.phone LIKE ? OR c.faculty LIKE ? OR c.major LIKE ? OR u.username LIKE ? OR u.email LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT c.*, 
               u.username, u.email, u.role AS user_role, u.permissions, u.totp_enabled, 
               u.must_change_password, u.last_active_at AS user_last_login,
               u.last_device, u.last_ip, u.locked_until
        FROM coordinators c
        LEFT JOIN users u ON c.user_id = u.id"
    . ($where ? " WHERE " . implode(" AND ", $where) : "")
    . " ORDER BY c.is_active DESC, c.tasks_count DESC";

$stmt = $db->prepare($sql);
$stmt->execute($params);
$coordinators = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات
$stats = $db->query("SELECT 
    COUNT(*) AS total,
    SUM(is_active) AS active_count,
    SUM(1-is_active) AS inactive_count,
    SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS system_access_count,
    SUM(tasks_count) AS total_tasks,
    SUM(tasks_completed) AS completed_tasks 
    FROM coordinators")->fetch(PDO::FETCH_ASSOC);

$tabCounts = $db->query("SELECT 
    COUNT(*) AS all_count,
    SUM(is_active) AS active_count,
    SUM(1-is_active) AS inactive_count,
    SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS system_access_count
    FROM coordinators")->fetch(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>
<datalist id="faculty_options">
    <?php foreach ($facultiesList as $faculty): ?>
        <option value="<?= htmlspecialchars($faculty) ?>"></option>
    <?php endforeach; ?>
</datalist>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<?php if ($resetTotpData): ?>
    <div class="panel-box" style="margin-bottom:16px;border:1px solid #86efac;background:#f0fdf4;">
        <div class="panel-box-body" style="display:flex;align-items:center;gap:22px;flex-wrap:wrap;">
            <img src="<?= htmlspecialchars($resetTotpData['qr_url']) ?>" alt="QR المصادقة الثنائية" width="180" height="180"
                style="background:#fff;padding:8px;border-radius:10px;border:1px solid #bbf7d0;">
            <div>
                <h3 style="margin:0 0 8px;color:#166534;">باركود جديد للمنسق:
                    <?= htmlspecialchars($resetTotpData['name']) ?>
                </h3>
                <p style="margin:0 0 10px;color:#365314;font-size:13px;">امسح الرمز في تطبيق المصادقة، ثم سجّل الدخول بالرمز
                    الجديد.</p>
                <code
                    style="display:inline-block;padding:9px 12px;background:#fff;color:#166534;border:1px dashed #86efac;border-radius:8px;font-size:16px;letter-spacing:2px;direction:ltr;"><?= htmlspecialchars($resetTotpData['secret']) ?></code>
                <div style="margin-top:8px;color:#92400e;font-size:11px;">الرمز النصي بديل عند تعذر مسح QR. المصادقة معطلة
                    حتى يتم ربط الرمز الجديد.</div>
            </div>
        </div>
    </div>
<?php endif; ?>

<!-- ================================================================
     KPI بطاقات الإحصاء بتنسيق وتصميم جذاب
     ================================================================ -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي المنسقين</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format((int) ($stats['total'] ?? 0)) ?></div>
        <div class="stats-footer">
            <span class="trend-up">فريق التطوع</span>
            <span>المعتمد</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">منسقون نشطون</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9 12l2 2 4-4" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#16a34a;"><?= number_format((int) ($stats['active_count'] ?? 0)) ?></div>
        <div class="stats-footer">
            <span style="color:#16a34a; font-weight:700;">جاهزون للخدمة</span>
            <span>بمختلف الكليات</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">حسابات وصول للنظام</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#0284c7;">
            <?= number_format((int) ($stats['system_access_count'] ?? 0)) ?>
        </div>
        <div class="stats-footer">
            <span style="color:#0284c7; font-weight:700;">صلاحيات وصول</span>
            <span>محددة بدقة</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">المهام المنجزة</span>
            <div class="stats-icon-box icon-gold">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#d97706;"><?= number_format((int) ($stats['completed_tasks'] ?? 0)) ?>
            <span style="font-size:16px; color:#64748b; font-weight:600;">/
                <?= number_format((int) ($stats['total_tasks'] ?? 0)) ?></span>
        </div>
        <div class="stats-footer">
            <span
                style="color:#d97706; font-weight:700;"><?= (int) ($stats['total_tasks'] ?? 0) > 0 ? round((int) ($stats['completed_tasks'] ?? 0) / (int) $stats['total_tasks'] * 100) : 0 ?>%</span>
            <span>نسبة إنجاز المهام</span>
        </div>
    </div>
</div>

<!-- ================================================================
     تبويبات + زر إضافة
     ================================================================ -->
<div class="tabs-header-wrapper">
    <nav class="tabs-nav">
        <a href="?tab=all" class="tab-btn <?= $tabFilter === 'all' ? 'active' : '' ?>">الكل <span
                style="font-size:11px;opacity:.7">(<?= $tabCounts['all_count'] ?>)</span></a>
        <a href="?tab=active" class="tab-btn <?= $tabFilter === 'active' ? 'active' : '' ?>">نشطون <span
                style="font-size:11px;opacity:.7">(<?= $tabCounts['active_count'] ?>)</span></a>
        <a href="?tab=system_access" class="tab-btn <?= $tabFilter === 'system_access' ? 'active' : '' ?>">🔐 حسابات
            دخول
            النظام <span style="font-size:11px;opacity:.7">(<?= $tabCounts['system_access_count'] ?>)</span></a>
        <a href="?tab=inactive" class="tab-btn <?= $tabFilter === 'inactive' ? 'active' : '' ?>">⏸ غير نشطين <span
                style="font-size:11px;opacity:.7">(<?= $tabCounts['inactive_count'] ?>)</span></a>
    </nav>
    <div class="tabs-actions">
        <button class="btn btn-primary" onclick="openModal('addCoordModal')">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            إضافة منسق متطوع
        </button>
    </div>
</div>

<!-- ================================================================
     فلاتر البحث
     ================================================================ -->
<div class="panel-box" style="margin-bottom:16px;padding:14px 20px;">
    <form method="get" class="search-filter-grid">
        <input type="hidden" name="tab" value="<?= htmlspecialchars($tabFilter) ?>">
        <div class="search-input-box">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" name="q" value="<?= htmlspecialchars($search) ?>"
                placeholder="ابحث باسم المنسق، الكلية، أو اسم المستخدم..." class="form-control">
        </div>
        <select name="role" class="form-control">
            <option value="">كل الأدوار</option>
            <?php foreach ($coordinatorRoleLabels as $k => $v): ?>
                <option value="<?= $k ?>" <?= $roleFilter === $k ? 'selected' : '' ?>><?= $v['label'] ?></option>
            <?php endforeach; ?>
        </select>
        <div class="filter-actions">
            <button type="submit" class="btn btn-secondary">🔍 فلترة</button>
            <?php if ($search || $facultyFilter || $roleFilter): ?><a href="?tab=<?= $tabFilter ?>"
                    class="btn btn-secondary">✕ مسح</a><?php endif; ?>
        </div>
    </form>
</div>

<!-- ================================================================
     عرض جدول الحسابات إن كان التبويب system_access
     ================================================================ -->
<?php if ($tabFilter === 'system_access'): ?>
    <div class="panel-box" style="margin-bottom: 20px;">
        <div class="panel-box-header">
            <h3 class="panel-box-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                جدول حسابات الدخول المعتمدة والصلاحيات الممنوحة
            </h3>
            <span class="panel-box-count"><?= count($coordinators) ?> حساب</span>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
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
                        <th>الإجراءات</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($coordinators)): ?>
                        <tr>
                            <td colspan="9" style="text-align:center;padding:40px;color:#94a3b8;">لا يوجد منسقون يملكون حسابات
                                دخول للنظام حالياً</td>
                        </tr>
                    <?php endif; ?>
                    <?php foreach ($coordinators as $idx => $c):
                        $userPerms = json_decode($c['permissions'] ?? '[]', true) ?: [];
                        $isAdmin = ($c['user_role'] === 'admin');
                        $systemRoleLabel = $systemRoleLabels[$c['user_role'] ?? 'coordinator'] ?? 'منسق نظام';
                        ?>
                        <tr>
                            <td style="color:#94a3b8;font-size:12px;"><?= $idx + 1 ?></td>
                            <td>
                                <div style="font-weight:800;color:#0f172a;"><?= htmlspecialchars($c['name']) ?></div>
                                <div style="font-size:11.5px;color:#64748b;">كلية الذكاء الاصطناعي</div>
                            </td>
                            <td>
                                <span
                                    style="font-family:'IBM Plex Mono',monospace;font-weight:700;background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:6px;font-size:12px;">
                                    @<?= htmlspecialchars($c['username'] ?? '') ?>
                                </span>
                            </td>
                            <td style="font-size:12.5px;color:#475569;dir:ltr;text-align:right;">
                                <?= htmlspecialchars($c['email'] ?? '—') ?>
                            </td>
                            <td>
                                <span class="custom-badge <?= $isAdmin ? 'badge-warning' : 'badge-success' ?>">
                                    <?= htmlspecialchars($systemRoleLabel) ?>
                                </span>
                            </td>
                            <td>
                                <?php if ($isAdmin): ?>
                                    <span
                                        style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;font-size:11.5px;font-weight:800;">
                                        وصول كامل (كافة الأقسام)</span>
                                <?php else: ?>
                                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;max-width:240px;">
                                        <?php if (empty($userPerms)): ?>
                                            <span style="color:#94a3b8;font-size:11.5px;">لا توجد صفحات مخصصة</span>
                                        <?php else: ?>
                                            <span
                                                style="font-weight:800;font-size:12px;color:#0f172a;background:#f1f5f9;padding:2px 8px;border-radius:10px;">
                                                <?= count($userPerms) ?> قسم مسموح
                                            </span>
                                            <?php foreach (array_slice($userPerms, 0, 2) as $pKey): ?>
                                                <?php if (isset($systemSections[$pKey])): ?>
                                                    <span
                                                        style="font-size:11px;background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:4px;">
                                                        <?= $systemSections[$pKey]['icon'] ?>                         <?= $systemSections[$pKey]['label'] ?>
                                                    </span>
                                                <?php endif; ?>
                                            <?php endforeach; ?>
                                            <?php if (count($userPerms) > 2): ?>
                                                <span style="font-size:10.5px;color:#64748b;">+<?= count($userPerms) - 2 ?> آخرين</span>
                                            <?php endif; ?>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            </td>
                            <td>
                                <?php if (!empty($c['totp_enabled'])): ?>
                                    <span
                                        style="display:inline-flex;align-items:center;gap:3px;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;">
                                        مفعّل
                                    </span>
                                <?php else: ?>
                                    <span style="color:#94a3b8;font-size:11.5px;">غير مفعّل</span>
                                <?php endif; ?>
                            </td>
                            <td>
                                <div style="font-size:12px;color:#0f172a;font-weight:700;">
                                    <?= !empty($c['user_last_login']) ? date('Y-m-d H:i', strtotime($c['user_last_login'])) : 'لم يدخل بعد' ?>
                                </div>
                            </td>
                            <td>
                                <div class="table-action-btns">
                                    <button type="button" class="btn-action btn-edit"
                                        onclick='openSystemAccountModal(<?= json_encode($c, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                                        title="تعديل الصلاحيات والحساب">
                                        تعديل الصلاحيات
                                    </button>
                                    <form method="post" style="display:inline;"
                                        onsubmit="return confirm('هل أنت متأكد من إلغاء حساب الوصول للنظام لهذا المنسق؟');">
                                        <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                                        <input type="hidden" name="action" value="revoke_system_account">
                                        <input type="hidden" name="coord_id" value="<?= $c['id'] ?>">
                                        <input type="hidden" name="user_id" value="<?= $c['user_id'] ?>">
                                        <button type="submit" class="btn-action btn-delete" title="إلغاء حساب الدخول">✕ سحب
                                            الوصول</button>
                                    </form>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
    </div>
<?php endif; ?>

<!-- ================================================================
     بطاقات المنسقين (Coordinators Cards Grid)
     ================================================================ -->
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;">
    <?php if (empty($coordinators)): ?>
        <div style="grid-column:1/-1;text-align:center;padding:60px;color:#94a3b8;font-size:14px;">لا يوجد منسقون يطابقون
            الفلتر الحالي</div>
    <?php endif; ?>
    <?php foreach ($coordinators as $c):
        $roleMeta = $coordinatorRoleLabels[$c['role_type']] ?? ['label' => $c['role_type'], 'class' => 'role-coord'];
        $initial = mb_substr($c['name'], 0, 1, 'UTF-8');
        $colors = ['#0284c7', '#7c3aed', '#059669', '#dc2626', '#d97706', '#db2777'];
        $color = $colors[abs(crc32($c['name'])) % count($colors)];
        $tasksPct = $c['tasks_count'] > 0 ? round($c['tasks_completed'] / $c['tasks_count'] * 100) : 0;
        $lastActive = $c['last_active_at'] ? date('Y-m-d', strtotime($c['last_active_at'])) : 'غير معروف';
        $hasAccess = !empty($c['user_id']);
        $userPerms = json_decode($c['permissions'] ?? '[]', true) ?: [];
        $isAdmin = ($c['user_role'] === 'admin');
        $systemRoleLabel = $systemRoleLabels[$c['user_role'] ?? 'coordinator'] ?? 'منسق نظام';
        ?>
        <div class="coord-card <?= $c['is_active'] ? '' : 'coord-inactive' ?>">
            <!-- رأس البطاقة -->
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                <div
                    style="width:52px;height:52px;border-radius:50%;background:<?= $color ?>;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;font-family:'Cairo',sans-serif;flex-shrink:0;">
                    <?= $initial ?>
                </div>
                <div style="flex:1;min-width:0;">
                    <div
                        style="font-weight:900;font-size:15px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        <?= htmlspecialchars($c['name']) ?>
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;">
                        <span class="coord-role-badge <?= $roleMeta['class'] ?>"><?= $roleMeta['label'] ?></span>
                        <?php if ($c['gender'] === 'female'): ?>
                            <span class="gender-tag gender-female">أنثى</span>
                        <?php else: ?>
                            <span class="gender-tag gender-male">ذكر</span>
                        <?php endif; ?>
                        <?php if (!$c['is_active']): ?>
                            <span
                                style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:10px;font-size:10.5px;font-weight:700;">غير
                                نشط</span>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <!-- قسم حساب الدخول والصلاحيات -->
            <div
                style="background:<?= $hasAccess ? '#f0fdf4' : '#f8fafc' ?>;border:1px solid <?= $hasAccess ? '#bbf7d0' : '#e2e8f0' ?>;border-radius:10px;padding:10px 14px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <div
                        style="display:flex;align-items:center;gap:5px;font-size:12px;font-weight:800;color:<?= $hasAccess ? '#15803d' : '#64748b' ?>;">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <?= $hasAccess ? 'حساب وصول للنظام مفعّل' : 'لا يملك حساب دخول للنظام' ?>
                    </div>
                    <?php if (!$hasAccess): ?>
                        <button type="button"
                            onclick='openSystemAccountModal(<?= json_encode($c, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                            style="background:#10b981;color:#fff;border:none;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">
                            إنشاء حساب
                        </button>
                    <?php endif; ?>
                </div>
                <?php if ($hasAccess): ?>
                    <div style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:4px;flex-wrap:wrap;">
                        <span
                            style="font-family:'IBM Plex Mono',monospace;font-weight:700;color:#0369a1;background:#e0f2fe;padding:1px 6px;border-radius:4px;">@<?= htmlspecialchars($c['username'] ?? '') ?></span>
                        <span style="color:#64748b;font-size:11px;"><?= htmlspecialchars($systemRoleLabel) ?></span>
                        <?php if ($isAdmin): ?>
                            <span
                                style="font-size:10.5px;color:#b45309;background:#fef3c7;padding:1px 6px;border-radius:4px;font-weight:700;">وصول
                                لكافة الصفحات</span>
                        <?php else: ?>
                            <span
                                style="font-size:10.5px;color:#15803d;background:#dcfce7;padding:1px 6px;border-radius:4px;font-weight:700;">مسموح:
                                <?= count($userPerms) ?> أقسام</span>
                        <?php endif; ?>
                    </div>
                <?php else: ?>
                    <div style="font-size:11px;color:#94a3b8;margin-top:2px;">يمكنك تعيين حساب وتحديد الصفحات المسموحة له فقط
                    </div>
                <?php endif; ?>
            </div>

            <!-- آخر نشاط + الاتصال -->
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
                <?php if ($c['phone']): ?>
                    </a>
                <?php endif; ?>
                <span style="font-size:11px;color:#94a3b8;margin-right:auto;">آخر نشاط: <?= $lastActive ?></span>
            </div>

            <!-- أزرار التحكم -->
            <div
                style="display:flex;align-items:center;gap:8px;padding-top:12px;border-top:1px solid #f1f5f9;margin-top:auto;">
                <!-- تبديل النشاط -->
                <form method="post" style="display:inline;">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="toggle_active">
                    <input type="hidden" name="id" value="<?= $c['id'] ?>">
                    <input type="hidden" name="current_active" value="<?= $c['is_active'] ?>">
                    <button type="submit" class="btn-action <?= $c['is_active'] ? 'btn-toggle-off' : 'btn-toggle-on' ?>">
                        <?= $c['is_active'] ? 'إيقاف' : 'تنشيط' ?>
                    </button>
                </form>

                <!-- تعديل -->
                <?php if ($hasAccess): ?>
                    <button type="button" class="btn-action btn-edit"
                        onclick='openSystemAccountModal(<?= json_encode($c, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                        تعديل
                    </button>
                <?php endif; ?>

                <!-- حذف -->
                <form method="post" style="display:inline;margin-right:auto;"
                    onsubmit="return confirm('هل أنت متأكد من حذف هذا المنسق نهائياً؟');">
                    <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                    <input type="hidden" name="action" value="delete">
                    <input type="hidden" name="id" value="<?= $c['id'] ?>">
                    <button type="submit" class="btn-action btn-delete" title="حذف">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </button>
                </form>

                <!-- تاريخ الانضمام -->
                <?php if ($c['joined_at']): ?>
                    <span style="font-size:10.5px;color:#94a3b8;">منذ <?= date('Y-m', strtotime($c['joined_at'])) ?></span>
                <?php endif; ?>
            </div>
        </div>
    <?php endforeach; ?>
</div>

<!-- ================================================================
     المودالات والنوافذ المنبثقة
     ================================================================ -->

<!-- 1. مودال إدارة / إنشاء حساب دخول للنظام وتعيين الصلاحيات -->
<div class="custom-modal-overlay" id="systemAccountModal">
    <div class="custom-modal-box" style="max-width:640px;">
        <div class="custom-modal-header">
            <h3 id="sys_modal_title">🔐 إدارة حساب دخول المنسق وتعيين الصلاحيات</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('systemAccountModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="save_system_account">
            <input type="hidden" name="coord_id" id="sys_coord_id">

            <div
                style="background:#f8fafc;padding:12px 16px;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:16px;">
                <div style="font-size:12px;color:#64748b;">المنسق المرتبط:</div>
                <div style="font-size:15px;font-weight:800;color:#0f172a;" id="sys_coord_name">—</div>
            </div>

            <div class="modal-form-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px;">
                <div class="form-group"><label>الاسم الكامل *</label><input type="text" name="coord_name"
                        id="sys_coord_name_input" required class="form-control"></div>
                <div class="form-group"><label>رقم الجوال</label><input type="text" name="coord_phone"
                        id="sys_coord_phone" class="form-control" dir="ltr"></div>
                <div class="form-group"><label>الجنس</label><select name="coord_gender" id="sys_coord_gender"
                        class="form-control">
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select></div>
                <div class="form-group"><label>الدور / المسمى</label><select name="coord_role_type"
                        id="sys_coord_role_type"
                        class="form-control"><?php foreach ($coordinatorRoleLabels as $k => $v): ?>
                            <option value="<?= $k ?>"><?= $v['label'] ?></option><?php endforeach; ?>
                    </select></div>
                <div class="form-group"><label>الكلية</label><input type="text" name="coord_faculty"
                        id="sys_coord_faculty" class="form-control" list="faculty_options"
                        placeholder="اكتب اسم الكلية أو اختر من القائمة"></div>
                <div class="form-group"><label>التخصص</label><input type="text" name="coord_major" id="sys_coord_major"
                        class="form-control"></div>
                <div class="form-group"><label>تاريخ الانضمام</label><input type="date" name="coord_joined_at"
                        id="sys_coord_joined" class="form-control"></div>
                <div class="form-group"><label>الحالة</label><select name="coord_is_active" id="sys_coord_active"
                        class="form-control">
                        <option value="1">نشط</option>
                        <option value="0">غير نشط</option>
                    </select></div>
                <div class="form-group" style="grid-column:1/-1;"><label>نبذة عن المنسق</label><textarea
                        name="coord_bio" id="sys_coord_bio" rows="2" class="form-control"></textarea></div>
                <div class="form-group" style="grid-column:1/-1;"><label>ملاحظات داخلية</label><input type="text"
                        name="coord_notes" id="sys_coord_notes" class="form-control"></div>
            </div>

            <div class="modal-form-grid" style="grid-template-columns:1fr 1fr;">
                <div class="form-group">
                    <label>اسم المستخدم (Login Username) *</label>
                    <input type="text" name="username" id="sys_username" required class="form-control" dir="ltr"
                        style="text-align:left;" placeholder="مثال: ahmad_coord">
                </div>
                <div class="form-group">
                    <label>البريد الإلكتروني</label>
                    <input type="email" name="email" id="sys_email" class="form-control" dir="ltr"
                        style="text-align:left;" placeholder="coord@university.edu.jo">
                </div>
                <div class="form-group">
                    <label>صلاحية النظام</label>
                    <select name="system_role" id="sys_role" class="form-control"
                        onchange="handleRoleChange(this.value)">
                        <?php foreach ($systemRoleLabels as $roleKey => $roleLabel): ?>
                            <option value="<?= htmlspecialchars($roleKey) ?>"><?= htmlspecialchars($roleLabel) ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label>كلمة المرور <span id="pass_hint" style="font-size:11px;color:#64748b;">(اتركها فارغة للإبقاء
                            على الحالية)</span></label>
                    <div style="display:flex;gap:6px;">
                        <div class="password-input-wrap" style="flex:1;">
                            <input type="password" name="password" id="sys_password" class="form-control" dir="ltr"
                                placeholder="أدخل كلمة المرور">
                            <button type="button" class="toggle-password-btn"
                                onclick="togglePasswordVisibility(this, 'sys_password')"
                                title="إظهار / إخفاء كلمة المرور">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </button>
                        </div>
                        <button type="button" onclick="generateRandomPass()"
                            style="background:#f1f5f9;border:1px solid #cbd5e1;padding:0 10px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;">توليد</button>
                    </div>
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <button type="button" class="btn btn-secondary"
                        style="color:#b45309;border-color:#fde68a;background:#fffbeb;"
                        onclick="resetCoordinatorPassword()" title="توليد كلمة مرور جديدة للحساب الحالي">
                        🔄 تجديد كلمة المرور الحالية
                    </button>
                    <small style="display:block;color:#92400e;font-size:11px;margin-top:5px;">سيتم توليد كلمة مرور جديدة
                        وإلزام المنسق بتغييرها عند أول تسجيل دخول.</small>
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <button type="submit" name="action" value="reset_coordinator_totp" class="btn btn-secondary"
                        style="color:#166534;border-color:#86efac;background:#f0fdf4;"
                        onclick="return confirm('سيتم إلغاء الباركود القديم وإنشاء باركود جديد. هل تريد المتابعة؟');">
                        🔐 تجديد باركود تطبيق المصادقة
                    </button>
                    <small style="display:block;color:#166534;font-size:11px;margin-top:5px;">سيتم إيقاف الرمز القديم
                        وعرض QR جديد لربطه بتطبيق المصادقة.</small>
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label
                        style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:700;font-size:13px;background:#f8fafc;padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;">
                        <input type="checkbox" name="must_change_password" id="sys_must_change" value="1"
                            style="width:16px;height:16px;accent-color:#0284c7;">
                        إلزام المنسق بتغيير كلمة المرور فور تسجيل الدخول الأول
                    </label>
                </div>

                <!-- قسم الصلاحيات الدقيقة للصفحات المسموحة -->
                <div class="form-group" id="permissions_section" style="grid-column:1/-1;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <label style="font-weight:800;font-size:13.5px;color:#0f172a;margin:0;">
                            الصفحات والأقسام المسموح للمنسق بالوصول إليها:
                        </label>
                        <div style="display:flex;gap:6px;">
                            <button type="button" onclick="selectAllPerms(true)"
                                style="background:#e0f2fe;color:#0369a1;border:none;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;">تحديد
                                الكل</button>
                            <button type="button" onclick="selectAllPerms(false)"
                                style="background:#f1f5f9;color:#64748b;border:none;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;">إلغاء
                                التحديد</button>
                        </div>
                    </div>

                    <div
                        style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:240px;overflow-y:auto;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                        <?php foreach ($systemSections as $secKey => $secMeta): ?>
                            <label
                                style="display:flex;align-items:flex-start;gap:8px;background:#fff;padding:8px 10px;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer;font-size:12.5px;">
                                <input type="checkbox" name="permissions[]" value="<?= $secKey ?>" class="perm-checkbox"
                                    style="width:16px;height:16px;margin-top:2px;accent-color:#0284c7;">
                                <div>
                                    <div style="font-weight:800;color:#0f172a;"><?= $secMeta['icon'] ?>
                                        <?= $secMeta['label'] ?>
                                    </div>
                                    <div style="font-size:11px;color:#64748b;margin-top:1px;"><?= $secMeta['desc'] ?></div>
                                </div>
                            </label>
                        <?php endforeach; ?>
                    </div>

                    <div
                        style="margin-top:12px;padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
                        <div style="font-weight:800;font-size:12.5px;color:#9a3412;margin-bottom:7px;">صلاحيات حصرية
                            داخل الصفحة</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            <?php foreach ($systemCapabilities as $capabilityKey => $capability): ?>
                                <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#7c2d12;">
                                    <input type="checkbox" name="permissions[]" value="<?= $capabilityKey ?>"
                                        class="perm-checkbox" style="accent-color:#ea580c;">
                                    <?= htmlspecialchars($capability['label']) ?>
                                </label>
                            <?php endforeach; ?>
                        </div>
                        <div style="font-size:11px;color:#9a3412;margin-top:6px;">امتلاك الصفحة وحده لا يمنح هذه
                            الإجراءات.</div>
                    </div>
                </div>

                <div id="admin_full_access_notice"
                    style="display:none;grid-column:1/-1;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;color:#92400e;font-size:12.5px;font-weight:700;">
                    المشرف العام (Administrator) يملك وصولاً كاملاً وغير مقيد لجميع صفحات وأقسام لوحة التحكم
                    تلقائياً.
                </div>

                <div id="observer_read_only_notice"
                    style="display:none;grid-column:1/-1;background:#e0f2fe;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;color:#075985;font-size:12.5px;font-weight:700;">
                    حساب الزائر / المراقب يستطيع مشاهدة جميع الأقسام فقط، وتُمنع عنه جميع عمليات الإضافة والتعديل
                    والحذف.
                </div>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary"
                    onclick="closeModal('systemAccountModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary" id="sys_submit_btn">حفظ بيانات الحساب والصلاحيات</button>
            </div>
        </form>
    </div>
</div>

<!-- 2. مودال إضافة منسق -->
<div class="custom-modal-overlay" id="addCoordModal">
    <div class="custom-modal-box" style="max-width:680px;">
        <div class="custom-modal-header">
            <h3>إضافة منسق متطوع جديد</h3><button type="button" class="close-modal-btn"
                onclick="closeModal('addCoordModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="create">
            <div class="modal-form-grid">
                <div class="form-group"><label>الاسم الكامل *</label><input type="text" name="name" required
                        class="form-control" placeholder="مثال: أحمد محمود الرواشدة"></div>
                <div class="form-group"><label>رقم الجوال</label><input type="text" name="phone" class="form-control"
                        dir="ltr" placeholder="07XXXXXXXX"></div>
                <div class="form-group">
                    <label>الجنس</label>
                    <select name="gender" class="form-control">
                        <option value="male">ذكر</option>
                        <option value="female">أنثى</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>الدور / المسمى التطوعي</label>
                    <select name="role_type" class="form-control">
                        <?php foreach ($coordinatorRoleLabels as $k => $v): ?>
                            <option value="<?= $k ?>"><?= $v['label'] ?></option><?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label>الكلية</label>
                    <input type="text" name="faculty" class="form-control" list="faculty_options"
                        placeholder="اكتب اسم الكلية أو اختر من القائمة">
                </div>
                <div class="form-group"><label>التخصص الدقيق</label><input type="text" name="major" class="form-control"
                        placeholder="مثال: علم الحاسوب"></div>
                <div class="form-group"><label>تاريخ الانضمام</label><input type="date" name="joined_at"
                        class="form-control" value="<?= date('Y-m-d') ?>"></div>
                <div class="form-group">
                    <label>الحالة</label>
                    <select name="is_active" class="form-control">
                        <option value="1">نشط</option>
                        <option value="0">غير نشط</option>
                    </select>
                </div>
                <div class="form-group" style="grid-column:1/-1;"><label>نبذة عن المنسق</label><textarea name="bio"
                        rows="2" class="form-control" placeholder="وصف مختصر عن المنسق وتخصصاته ومهامه..."></textarea>
                </div>

                <!-- خيار إنشاء حساب دخول للنظام مباشرة -->
                <div class="form-group" style="grid-column:1/-1;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;">
                        <label
                            style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:800;color:#15803d;margin-bottom:8px;">
                            <input type="checkbox" name="create_system_account" value="1" id="toggle_create_user"
                                onchange="toggleNewUserFields(this)"
                                style="width:16px;height:16px;accent-color:#16a34a;">
                            إنشاء حساب دخول وتعيين الصلاحيات فوراً لهذا المنسق
                        </label>
                        <div id="new_user_fields"
                            style="display:none;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
                            <div>
                                <label style="font-size:12px;font-weight:700;">اسم المستخدم *</label>
                                <input type="text" name="username" id="new_username" class="form-control" dir="ltr"
                                    placeholder="سيتم التوليد تلقائيا">
                            </div>
                            <div>
                                <label style="font-size:12px;font-weight:700;">البريد الإلكتروني</label>
                                <input type="email" name="email" class="form-control" dir="ltr"
                                    placeholder="email@domain.com">
                            </div>
                            <div>
                                <label style="font-size:12px;font-weight:700;">كلمة المرور *</label>
                                <div style="display:flex;gap:6px;">
                                    <input type="password" name="password" id="new_password" class="form-control"
                                        dir="ltr" placeholder="سيتم التوليد تلقائيا" required>
                                    <button type="button" class="btn btn-secondary" onclick="toggleNewPassword()"
                                        title="إظهار أو إخفاء كلمة المرور">👁️</button>
                                    <button type="button" class="btn btn-secondary" onclick="generateNewCredentials()"
                                        title="توليد اسم مستخدم وكلمة مرور جديدين">توليد</button>
                                </div>
                            </div>
                            <div style="grid-column:1/-1;">
                                <label style="font-size:12px;font-weight:700;display:block;margin-bottom:6px;">صلاحيات
                                    النظام</label>
                                <select name="system_role" class="form-control" style="margin-bottom:8px;">
                                    <?php foreach ($systemRoleLabels as $roleKey => $roleLabel): ?>
                                        <option value="<?= htmlspecialchars($roleKey) ?>">
                                            <?= htmlspecialchars($roleLabel) ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                                <div
                                    style="display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#fff;border:1px solid #bbf7d0;border-radius:8px;padding:10px;">
                                    <?php foreach ($systemSections as $secKey => $secMeta): ?>
                                        <label
                                            style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#334155;">
                                            <input type="checkbox" name="permissions[]" value="<?= $secKey ?>"
                                                <?= in_array($secKey, ['donations', 'materials'], true) ? 'checked' : '' ?>
                                                style="accent-color:#0284c7;">
                                            <?= htmlspecialchars($secMeta['label']) ?>
                                        </label>
                                    <?php endforeach; ?>
                                    <?php foreach ($systemCapabilities as $capabilityKey => $capability): ?>
                                        <label
                                            style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#9a3412;">
                                            <input type="checkbox" name="permissions[]" value="<?= $capabilityKey ?>"
                                                style="accent-color:#ea580c;">
                                            <?= htmlspecialchars($capability['label']) ?>
                                        </label>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="custom-modal-footer"><button type="button" class="btn btn-secondary"
                    onclick="closeModal('addCoordModal')">إلغاء</button><button type="submit"
                    class="btn btn-primary">إضافة المنسق</button></div>
        </form>
    </div>
</div>

<script>
    function openModal(id) {
        document.getElementById(id).classList.add('show');
        if (id === 'addCoordModal') {
            generateNewCredentials();
            document.getElementById('new_password').type = 'password';
            document.getElementById('toggle_create_user').checked = false;
            toggleNewUserFields(document.getElementById('toggle_create_user'));
        }
    }
    function closeModal(id) { document.getElementById(id).classList.remove('show'); }

    function resetCoordinatorPassword() {
        const coordId = document.getElementById('sys_coord_id').value;
        if (!coordId || !confirm('سيتم إلغاء كلمة المرور الحالية وتوليد كلمة مرور جديدة. متابعة؟')) return;
        const form = document.createElement('form');
        form.method = 'post';
        form.innerHTML = `<input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>"><input type="hidden" name="action" value="reset_coordinator_password"><input type="hidden" name="coord_id" value="${coordId}">`;
        document.body.appendChild(form);
        form.submit();
    }

    function toggleNewUserFields(toggle) {
        const fields = document.getElementById('new_user_fields');
        const username = document.getElementById('new_username');
        const password = document.getElementById('new_password');
        fields.style.display = toggle.checked ? 'grid' : 'none';
        username.required = toggle.checked;
        password.required = toggle.checked;
    }

    function toggleNewPassword() {
        const input = document.getElementById('new_password');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    }

    function randomCharacters(length, characters) {
        const values = new Uint32Array(length);
        crypto.getRandomValues(values);
        return Array.from(values, value => characters[value % characters.length]).join('');
    }

    function generateNewCredentials() {
        const username = 'coord_' + randomCharacters(8, 'abcdefghjkmnpqrstuvwxyz23456789');
        const password = randomCharacters(5, 'ABCDEFGHJKLMNPQRSTUVWXYZ')
            + randomCharacters(5, 'abcdefghijkmnopqrstuvwxyz')
            + randomCharacters(3, '23456789')
            + randomCharacters(2, '!@#$%&*');
        document.getElementById('new_username').value = username;
        document.getElementById('new_password').value = password;
    }

    function openSystemAccountModal(c) {
        document.getElementById('sys_coord_id').value = c.id;
        document.getElementById('sys_coord_name').innerText = c.name + ' — كلية الذكاء الاصطناعي';
        document.getElementById('sys_coord_name_input').value = c.name || '';
        document.getElementById('sys_coord_phone').value = c.phone || '';
        document.getElementById('sys_coord_gender').value = c.gender || 'male';
        document.getElementById('sys_coord_role_type').value = c.role_type || 'coordinator';
        document.getElementById('sys_coord_faculty').value = c.faculty || '';
        document.getElementById('sys_coord_major').value = c.major || '';
        document.getElementById('sys_coord_joined').value = c.joined_at || '';
        document.getElementById('sys_coord_active').value = c.is_active ?? 1;
        document.getElementById('sys_coord_bio').value = c.bio || '';
        document.getElementById('sys_coord_notes').value = c.notes || '';
        document.getElementById('sys_username').value = c.username || '';
        document.getElementById('sys_email').value = c.email || '';
        document.getElementById('sys_role').value = c.user_role || 'coordinator';
        document.getElementById('sys_password').value = '';
        document.getElementById('sys_must_change').checked = (c.must_change_password == 1);

        // تفريغ وتحديد الصلاحيات
        const perms = c.permissions ? JSON.parse(c.permissions) : ['donations', 'materials'];
        const checkboxes = document.querySelectorAll('.perm-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = (c.user_role === 'admin') || (Array.isArray(perms) && perms.includes(cb.value));
        });

        handleRoleChange(c.user_role || 'coordinator');

        if (c.user_id) {
            document.getElementById('sys_modal_title').innerText = 'تعديل حساب دخول المنسق وتعيين الصلاحيات';
            document.getElementById('pass_hint').innerText = '(اتركها فارغة للإبقاء على كلمة المرور الحالية)';
            document.getElementById('sys_submit_btn').innerText = 'حفظ التعديلات والصلاحيات';
        } else {
            document.getElementById('sys_modal_title').innerText = 'إنشاء حساب دخول جديد وتعيين الصلاحيات';
            document.getElementById('pass_hint').innerText = '(أدخل كلمة مرور قوية للمنسق)';
            document.getElementById('sys_submit_btn').innerText = 'إنشاء وتفعيل الحساب';
            if (!c.username) {
                document.getElementById('sys_username').value = 'coord_' + c.id;
            }
        }
        openModal('systemAccountModal');
    }

    function handleRoleChange(role) {
        const permSection = document.getElementById('permissions_section');
        const adminNotice = document.getElementById('admin_full_access_notice');
        const observerNotice = document.getElementById('observer_read_only_notice');
        if (role === 'admin') {
            permSection.style.display = 'none';
            adminNotice.style.display = 'block';
            observerNotice.style.display = 'none';
        } else if (role === 'observer') {
            permSection.style.display = 'none';
            adminNotice.style.display = 'none';
            observerNotice.style.display = 'block';
        } else {
            permSection.style.display = 'block';
            adminNotice.style.display = 'none';
            observerNotice.style.display = 'none';
        }
    }

    function selectAllPerms(select) {
        document.querySelectorAll('.perm-checkbox').forEach(cb => { cb.checked = select; });
    }

    function generateRandomPass() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
        let pass = '';
        for (let i = 0; i < 10; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        document.getElementById('sys_password').value = pass;
        document.getElementById('sys_password').type = 'text';
    }

    function togglePasswordVisibility(btn, inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.innerHTML = isPass ?
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' :
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }

    document.querySelectorAll('.custom-modal-overlay').forEach(o => { o.addEventListener('click', e => { if (e.target === o) o.classList.remove('show'); }); });
</script>

<?php require __DIR__ . '/_footer.php'; ?>