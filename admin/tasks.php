<?php
/**
 * admin/tasks.php — نظام إدارة وتبني المهام والتكليفات الذكي للمنسقين (مع دعم تصنيف الموضوع، النصوص، ورفع الملفات والمستندات والروابط)
 */
$page_key = 'tasks';
$page_title = 'المهام والتكليفات';
require_once __DIR__ . '/../config.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
$db = get_db();

$userId = (int) ($_SESSION['user_id'] ?? 0);
$userStmt = $db->prepare('SELECT * FROM users WHERE id = ?');
$userStmt->execute([$userId]);
$currentUser = $userStmt->fetch(PDO::FETCH_ASSOC) ?: [];

$isAdmin = (($currentUser['role'] ?? '') === 'admin' || ($currentUser['role'] ?? '') === 'super_admin' || $userId === 1 || ($currentUser['username'] ?? '') === 'HUSSIEN');
$isTasksViewOnly = user_has_capability('tasks.view_only', $currentUser) && !$isAdmin;
$canViewAllTasks = $isTasksViewOnly || user_has_capability('tasks.view_all', $currentUser);
$canCreateTasks = !$isTasksViewOnly && user_has_capability('tasks.create', $currentUser);
$canEditTasks = !$isTasksViewOnly && user_has_capability('tasks.edit', $currentUser);
$canDeleteTasks = !$isTasksViewOnly && user_has_capability('tasks.delete', $currentUser);

// معرف المنسق المرتبط بحساب المستخدم الحالي (إن وجد)
$coordStmt = $db->prepare('SELECT * FROM coordinators WHERE user_id = ?');
$coordStmt->execute([$userId]);
$currentCoord = $coordStmt->fetch(PDO::FETCH_ASSOC);
$currentCoordId = $currentCoord ? (int) $currentCoord['id'] : 0;

$facultiesList = [
    'كلية الذكاء الاصطناعي',
    'كلية عبدالله بن غازي للاتصالات وتكنولوجيا المعلومات'
];

$taskCategories = [
    'field_work' => ['label' => 'ميداني وتوزيع كتب', 'icon' => '', 'bg' => '#eff6ff', 'color' => '#0284c7'],
    'academic' => ['label' => 'أكاديمي وتدقيق مواد', 'icon' => '', 'bg' => '#f0fdf4', 'color' => '#15803d'],
    'media_design' => ['label' => 'تصميم وإعلام ومرئيات', 'icon' => '', 'bg' => '#fdf4ff', 'color' => '#a855f7'],
    'video_photo' => ['label' => 'تصوير وفيديو توضيحي', 'icon' => '', 'bg' => '#fff1f2', 'color' => '#e11d48'],
    'tech_data' => ['label' => 'تقني وإدخال بيانات', 'icon' => '', 'bg' => '#f8fafc', 'color' => '#334155'],
    'admin_org' => ['label' => 'إداري وتنظيم فعاليات', 'icon' => '', 'bg' => '#fffbeb', 'color' => '#b45309'],
    'general' => ['label' => 'عام وخدمات طلابية', 'icon' => '', 'bg' => '#f1f5f9', 'color' => '#475569'],
];

$priorityLabels = [
    'urgent' => ['label' => 'عاجل جداً', 'bg' => '#fee2e2', 'color' => '#b91c1c'],
    'medium' => ['label' => 'أولوية متوسطة', 'bg' => '#fef3c7', 'color' => '#b45309'],
    'normal' => ['label' => 'أولوية عادية', 'bg' => '#f1f5f9', 'color' => '#475569'],
];

$statusLabels = [
    'available' => ['label' => 'متاحة للتبني', 'bg' => '#e0f2fe', 'color' => '#0369a1'],
    'in_progress' => ['label' => 'قيد التنفيذ (متبناة)', 'bg' => '#fef3c7', 'color' => '#b45309'],
    'completed' => ['label' => 'مكتملة بنجاح', 'bg' => '#dcfce7', 'color' => '#15803d'],
    'cancelled' => ['label' => 'ملغاة ✕', 'bg' => '#fee2e2', 'color' => '#b91c1c'],
];

/* دالة مساعدة لمعالجة رفع الملفات والمستندات والوسائط بشكل آمن ومحصن ضد الثغرات */
function handleTaskMediaUpload(): array
{
    if (!empty($_FILES['media_file'])) {
        $err = $_FILES['media_file']['error'];
        if ($err === UPLOAD_ERR_INI_SIZE || $err === UPLOAD_ERR_FORM_SIZE) {
            return ['error' => 'حجم ملف الفيديو المرفوع كبير جداً ويتجاوز الحد المسموح به في إعدادات السيرفر. تم رفع الحد إلى 100MB.'];
        }
        if ($err !== UPLOAD_ERR_OK && $err !== UPLOAD_ERR_NO_FILE) {
            return ['error' => 'حدث خطأ أثناء رفع الملف من جهازك (رمز الخطأ: ' . $err . ').'];
        }

        if ($err === UPLOAD_ERR_OK) {
            $fileTmp = $_FILES['media_file']['tmp_name'];
            $fileName = basename($_FILES['media_file']['name']);
            $fileSize = $_FILES['media_file']['size'];
            $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

            // حظر الملفات التنفيذية والبرمجية نهائياً
            $dangerousExts = ['php', 'phtml', 'php3', 'php4', 'php5', 'php7', 'phps', 'phar', 'sh', 'pl', 'py', 'cgi', 'exe', 'bat', 'cmd', 'js', 'html', 'htm', 'vbs', 'scr', 'svg'];
            if (in_array($ext, $dangerousExts, true)) {
                return ['error' => 'نوع الملف المرفوع غير مسموح به لأسباب أمنية.'];
            }

            // الحد الأقصى للحجم: 100MB
            if ($fileSize > 100 * 1024 * 1024) {
                return ['error' => 'الحد الأقصى لحجم الفيديو أو المستند هو 100 ميجابايت.'];
            }

            $allowedImages = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
            $allowedVideos = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'ogg'];
            $allowedDocs = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar'];

            if (!in_array($ext, $allowedImages) && !in_array($ext, $allowedVideos) && !in_array($ext, $allowedDocs)) {
                return ['error' => 'امتداد الملف غير مدعوم. الصيغ المدعومة: الصور (JPG, PNG)، الفيديوهات (MP4, MOV, WEBM)، والمستندات (PDF, Word, Excel).'];
            }

            // التحقق من نوع الـ MIME الحقيقي للملف
            if (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mime = finfo_file($finfo, $fileTmp);
                finfo_close($finfo);

                if (stripos($mime, 'php') !== false || stripos($mime, 'script') !== false || stripos($mime, 'text/html') !== false) {
                    return ['error' => 'تم رفض الملف: محتوى الملف غير صالح أمنياً.'];
                }
            }

            $uploadDir = __DIR__ . '/../uploads/tasks/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            // اسم عشوائي آمن غير قابل للتخمين
            $newFileName = 'task_' . time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
            $targetPath = $uploadDir . $newFileName;

            if (move_uploaded_file($fileTmp, $targetPath)) {
                if (in_array($ext, $allowedVideos)) {
                    $type = 'video';
                } elseif (in_array($ext, $allowedDocs)) {
                    $type = 'document';
                } else {
                    $type = 'image';
                }
                return ['type' => $type, 'url' => '../uploads/tasks/' . $newFileName, 'name' => htmlspecialchars($fileName)];
            } else {
                return ['error' => 'تعذر حفظ وتخزين الملف في مجلد uploads/tasks على السيرفر.'];
            }
        }
    }
    return ['type' => null, 'url' => null, 'name' => null];
}

/* ================================================================
   معالجة POST
   ================================================================ */
$flash = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_check($_POST['csrf'] ?? '')) {
        $flash = ['type' => 'error', 'msg' => 'خطأ في التحقق الأمني CSRF'];
    } else {
        $action = $_POST['action'] ?? '';

        $requiredCapability = [
            'create' => 'tasks.create',
            'edit' => 'tasks.edit',
            'delete' => 'tasks.delete',
        ][$action] ?? null;
        if ($isTasksViewOnly) {
            http_response_code(403);
            exit('غير مصرح: هذا الحساب مخصص للرؤية والاطلاع فقط.');
        }
        if ($requiredCapability !== null && !user_has_capability($requiredCapability, $currentUser)) {
            http_response_code(403);
            exit('غير مصرح: هذا الإجراء يحتاج وصولاً حصرياً من مدير النظام.');
        }

        // ───── 1. إنشاء مهمة جديدة (Admin) ─────
        if ($action === 'create' && $canCreateTasks) {
            $title = trim($_POST['title'] ?? '');
            $category = $_POST['category'] ?? 'general';
            $desc = trim($_POST['description'] ?? '');
            $faculty = $_POST['faculty'] ?? 'all';
            $priority = $_POST['priority'] ?? 'medium';
            $points = (int) ($_POST['points'] ?? 10);
            $dueDate = !empty($_POST['due_date']) ? $_POST['due_date'] : null;
            $assignCoordId = !empty($_POST['assigned_coord_id']) ? (int) $_POST['assigned_coord_id'] : null;

            // معالجة الوسائط (ملف مرفوع أو رابط مدخل)
            $uploaded = handleTaskMediaUpload();
            if (!empty($uploaded['error'])) {
                $flash = ['type' => 'error', 'msg' => $uploaded['error']];
            } else {
                if (!empty($uploaded['url'])) {
                    $mediaType = $uploaded['type'];
                    $mediaUrl = $uploaded['url'];
                    $attachmentName = $uploaded['name'];
                } else {
                    $mediaType = $_POST['media_type'] ?? 'none';
                    $mediaUrl = trim($_POST['media_url'] ?? '');
                    $attachmentName = trim($_POST['attachment_name'] ?? '');
                    if (empty($mediaUrl))
                        $mediaType = 'none';
                }

                $status = 'available';
                $claimedUserId = null;
                $claimedCoordId = null;
                $claimedAt = null;

                if ($assignCoordId) {
                    $status = 'in_progress';
                    $claimedCoordId = $assignCoordId;
                    $claimedAt = date('Y-m-d H:i:s');
                    $uStmt = $db->prepare("SELECT user_id FROM coordinators WHERE id = ?");
                    $uStmt->execute([$assignCoordId]);
                    $claimedUserId = $uStmt->fetchColumn() ?: null;

                    $db->prepare("UPDATE coordinators SET tasks_count = tasks_count + 1 WHERE id = ?")->execute([$assignCoordId]);
                }

                $stmt = $db->prepare("INSERT INTO coordinator_tasks (title, category, description, media_type, media_url, attachment_name, faculty, priority, points, due_date, status, claimed_by_user_id, claimed_by_coord_id, claimed_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
                $stmt->execute([$title, $category, $desc, $mediaType, $mediaUrl, $attachmentName, $faculty, $priority, $points, $dueDate, $status, $claimedUserId, $claimedCoordId, $claimedAt, $currentUser['username'] ?? 'المدير']);

                log_activity("أنشأ مهمة وتكليفاً جديداً: $title", 'tasks');
                $flash = ['type' => 'success', 'msg' => 'تم نشر المهمة والمستندات في النظام بنجاح 🚀'];
            }
        }

        // ───── 2. تعديل مهمة (Admin) ─────
        elseif ($action === 'edit' && $canEditTasks) {
            $taskId = (int) $_POST['id'];
            $title = trim($_POST['title'] ?? '');
            $category = $_POST['category'] ?? 'general';
            $desc = trim($_POST['description'] ?? '');
            $faculty = $_POST['faculty'] ?? 'all';
            $priority = $_POST['priority'] ?? 'medium';
            $points = (int) ($_POST['points'] ?? 10);
            $dueDate = !empty($_POST['due_date']) ? $_POST['due_date'] : null;

            $oldStmt = $db->prepare("SELECT media_type, media_url, attachment_name FROM coordinator_tasks WHERE id = ?");
            $oldStmt->execute([$taskId]);
            $oldTask = $oldStmt->fetch(PDO::FETCH_ASSOC) ?: [];
            $mediaType = $oldTask['media_type'] ?? 'none';
            $mediaUrl = $oldTask['media_url'] ?? '';
            $attachmentName = $oldTask['attachment_name'] ?? '';

            $uploaded = handleTaskMediaUpload();
            if (!empty($uploaded['error'])) {
                $flash = ['type' => 'error', 'msg' => $uploaded['error']];
            } else {
                if (!empty($uploaded['url'])) {
                    $mediaType = $uploaded['type'];
                    $mediaUrl = $uploaded['url'];
                    $attachmentName = $uploaded['name'];
                } elseif (isset($_POST['media_source_type']) && $_POST['media_source_type'] === 'url') {
                    $mediaType = $_POST['media_type'] ?? 'none';
                    $mediaUrl = trim($_POST['media_url'] ?? '');
                    $attachmentName = trim($_POST['attachment_name'] ?? '');
                    if (empty($mediaUrl))
                        $mediaType = 'none';
                } elseif (isset($_POST['remove_media']) && $_POST['remove_media'] === '1') {
                    $mediaType = 'none';
                    $mediaUrl = null;
                    $attachmentName = null;
                }

                $stmt = $db->prepare("UPDATE coordinator_tasks SET title = ?, category = ?, description = ?, media_type = ?, media_url = ?, attachment_name = ?, faculty = ?, priority = ?, points = ?, due_date = ? WHERE id = ?");
                $stmt->execute([$title, $category, $desc, $mediaType, $mediaUrl, $attachmentName, $faculty, $priority, $points, $dueDate, $taskId]);

                log_activity("عدّل بيانات ومرفقات المهمة ID $taskId", 'tasks');
                $flash = ['type' => 'success', 'msg' => 'تم حفظ تعديلات المهمة والفيديو/المرفقات بنجاح'];
            }
        }

        // ───── 3. تبني المهمة (Claim Task) ─────
        elseif ($action === 'claim') {
            $taskId = (int) $_POST['task_id'];
            $tStmt = $db->prepare("SELECT * FROM coordinator_tasks WHERE id = ? AND status = 'available'");
            $tStmt->execute([$taskId]);
            $task = $tStmt->fetch(PDO::FETCH_ASSOC);

            if (!$task) {
                $flash = ['type' => 'error', 'msg' => 'عذراً، هذه المهمة لم تعد متاحة للتبني أو تم تبنيها من زميل آخر'];
            } else {
                $coordIdToAssign = $currentCoordId;
                if ($isAdmin && !empty($_POST['manual_coord_id'])) {
                    $coordIdToAssign = (int) $_POST['manual_coord_id'];
                }

                $now = date('Y-m-d H:i:s');
                $db->prepare("UPDATE coordinator_tasks SET status = 'in_progress', claimed_by_user_id = ?, claimed_by_coord_id = ?, claimed_at = ? WHERE id = ?")
                    ->execute([$userId, $coordIdToAssign, $now, $taskId]);

                if ($coordIdToAssign) {
                    $db->prepare("UPDATE coordinators SET tasks_count = tasks_count + 1 WHERE id = ?")->execute([$coordIdToAssign]);
                }

                log_activity("تبنى المهمة: {$task['title']}", 'tasks');
                $flash = ['type' => 'success', 'msg' => 'تم تبني المهمة بنجاح وانتقلت إلى تبويب "مهامي"'];
            }
        }

        // ───── 4. إفلات المهمة (Release / Drop Task) ─────
        elseif ($action === 'release') {
            $taskId = (int) $_POST['task_id'];
            $tStmt = $db->prepare("SELECT * FROM coordinator_tasks WHERE id = ?");
            $tStmt->execute([$taskId]);
            $task = $tStmt->fetch(PDO::FETCH_ASSOC);

            if ($task && ($isAdmin || $task['claimed_by_user_id'] == $userId || $task['claimed_by_coord_id'] == $currentCoordId)) {
                $prevCoordId = $task['claimed_by_coord_id'];

                $db->prepare("UPDATE coordinator_tasks SET status = 'available', claimed_by_user_id = NULL, claimed_by_coord_id = NULL, claimed_at = NULL, completed_at = NULL, completion_notes = NULL WHERE id = ?")
                    ->execute([$taskId]);

                if ($prevCoordId) {
                    $db->prepare("UPDATE coordinators SET tasks_count = MAX(0, tasks_count - 1) WHERE id = ?")->execute([$prevCoordId]);
                }

                log_activity("أفلت المهمة: {$task['title']} وأعادها للبنك العام", 'tasks');
                $flash = ['type' => 'success', 'msg' => 'تم إفلات المهمة وأصبحت متاحة لزملائك المنسقين مجدداً'];
            }
        }

        // ───── 5. تأكيد إنجاز المهمة (Complete Task) ─────
        elseif ($action === 'complete') {
            $taskId = (int) $_POST['task_id'];
            $notes = trim($_POST['completion_notes'] ?? '');

            $tStmt = $db->prepare("SELECT * FROM coordinator_tasks WHERE id = ?");
            $tStmt->execute([$taskId]);
            $task = $tStmt->fetch(PDO::FETCH_ASSOC);

            if ($task && ($isAdmin || $task['claimed_by_user_id'] == $userId || $task['claimed_by_coord_id'] == $currentCoordId)) {
                $now = date('Y-m-d H:i:s');
                $db->prepare("UPDATE coordinator_tasks SET status = 'completed', completed_at = ?, completion_notes = ? WHERE id = ?")
                    ->execute([$now, $notes, $taskId]);

                $coordIdToReward = $task['claimed_by_coord_id'] ?: $currentCoordId;
                $pointsAwarded = (int) ($task['points'] ?? 10);
                if ($coordIdToReward) {
                    $db->prepare("UPDATE coordinators SET tasks_completed = tasks_completed + 1 WHERE id = ?")->execute([$coordIdToReward]);
                    add_coordinator_points($coordIdToReward, $pointsAwarded, "إنجاز المهمة: {$task['title']}", 'task_completion', $taskId, $currentUser['username'] ?? 'المدير');
                }

                log_activity("أنجز بنجاح المهمة: {$task['title']} وحصل على $pointsAwarded نقطة", 'tasks');
                $flash = ['type' => 'success', 'msg' => "أحسنت! تم تسجيل إنجاز المهمة بنجاح وحصلت على +{$pointsAwarded} نقطة مكافأة 🌟"];
            }
        }

        // ───── 6. إعادة فتح مهمة منجزة (Admin Reopen) ─────
        elseif ($action === 'reopen' && $canEditTasks) {
            $taskId = (int) $_POST['task_id'];
            $tStmt = $db->prepare("SELECT * FROM coordinator_tasks WHERE id = ?");
            $tStmt->execute([$taskId]);
            $task = $tStmt->fetch(PDO::FETCH_ASSOC);

            if ($task) {
                if ($task['claimed_by_coord_id']) {
                    $db->prepare("UPDATE coordinators SET tasks_completed = MAX(0, tasks_completed - 1) WHERE id = ?")->execute([$task['claimed_by_coord_id']]);
                    $pointsToDeduct = (int) ($task['points'] ?? 10);
                    add_coordinator_points($task['claimed_by_coord_id'], -$pointsToDeduct, "إعادة فتح المهمة: {$task['title']}", 'admin_adjustment', $taskId, $currentUser['username'] ?? 'المدير');
                }
                $db->prepare("UPDATE coordinator_tasks SET status = 'in_progress', completed_at = NULL WHERE id = ?")->execute([$taskId]);
                log_activity("أعاد فتح المهمة: {$task['title']}", 'tasks');
                $flash = ['type' => 'success', 'msg' => 'تمت إعادة فتح المهمة وتحديث رصيد النقاط بنجاح'];
            }
        }

        // ───── 7. حذف مهمة (Admin) ─────
        elseif ($action === 'delete' && $canDeleteTasks) {
            $taskId = (int) $_POST['id'];
            archive_delete('coordinator_tasks', $taskId, 'حذف مهمة');
            log_activity("حذف المهمة ID $taskId", 'tasks');
            $flash = ['type' => 'success', 'msg' => 'تم حذف المهمة نهائياً'];
        }
    }
}

/* ================================================================
   قراءة البيانات والفلاتر
   ================================================================ */
$tabFilter = $_GET['tab'] ?? 'all';
$visibleTaskScope = [];
$visibleTaskParams = [];
if (!$canViewAllTasks) {
    $visibleTaskScope[] = "(t.status = 'available' OR t.claimed_by_user_id = ? OR t.claimed_by_coord_id = ?)";
    $visibleTaskParams = [$userId, $currentCoordId];
    if ($tabFilter === 'all' || in_array($tabFilter, ['in_progress', 'completed'], true)) {
        $tabFilter = 'available';
    }
}
$facultyFilter = $_GET['faculty'] ?? '';
$categoryFilter = $_GET['category'] ?? '';
$priorityFilter = $_GET['priority'] ?? '';
$search = trim($_GET['q'] ?? '');

$where = [];
$params = $visibleTaskParams;

if ($visibleTaskScope) {
    $where[] = $visibleTaskScope[0];
}

if ($tabFilter === 'available') {
    $where[] = "t.status = 'available'";
} elseif ($tabFilter === 'my_tasks') {
    if ($currentCoordId > 0 || $userId > 0) {
        $where[] = "(t.claimed_by_user_id = ? OR t.claimed_by_coord_id = ?)";
        $params[] = $userId;
        $params[] = $currentCoordId;
    }
} elseif ($tabFilter === 'in_progress') {
    $where[] = "t.status = 'in_progress'";
} elseif ($tabFilter === 'completed') {
    $where[] = "t.status = 'completed'";
}

if ($facultyFilter && $facultyFilter !== 'all') {
    $where[] = "(t.faculty = ? OR t.faculty = 'all')";
    $params[] = $facultyFilter;
}
if ($categoryFilter) {
    $where[] = "t.category = ?";
    $params[] = $categoryFilter;
}
if ($priorityFilter) {
    $where[] = "t.priority = ?";
    $params[] = $priorityFilter;
}
if ($search) {
    $where[] = "(t.title LIKE ? OR t.description LIKE ? OR c.name LIKE ? OR t.attachment_name LIKE ?)";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
    $params[] = "%$search%";
}

$sql = "SELECT t.*, 
               c.name AS coord_name, c.faculty AS coord_faculty, c.phone AS coord_phone,
               u.username AS coord_username
        FROM coordinator_tasks t
        LEFT JOIN coordinators c ON t.claimed_by_coord_id = c.id
        LEFT JOIN users u ON t.claimed_by_user_id = u.id"
    . ($where ? " WHERE " . implode(" AND ", $where) : "")
    . " ORDER BY 
            CASE t.priority WHEN 'urgent' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
            t.created_at DESC";

$stmt = $db->prepare($sql);
$stmt->execute($params);
$tasksList = $stmt->fetchAll(PDO::FETCH_ASSOC);

// إحصائيات عامة
$statsSql = "SELECT 
    COUNT(*) AS total,
    SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available_count,
    SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
    SUM(points) AS total_points
    FROM coordinator_tasks t" . ($visibleTaskScope ? " WHERE " . $visibleTaskScope[0] : '');
$statsStmt = $db->prepare($statsSql);
$statsStmt->execute($visibleTaskParams);
$stats = $statsStmt->fetch(PDO::FETCH_ASSOC);
$stats = array_map(static fn($value) => $value === null ? 0 : $value, $stats ?: []);

$tabCounts = [
    'all' => (int) $stats['total'],
    'available' => (int) $stats['available_count'],
    'in_progress' => (int) $stats['in_progress_count'],
    'completed' => (int) $stats['completed_count'],
];

$myTasksCount = 0;
if ($userId > 0 || $currentCoordId > 0) {
    $myStmt = $db->prepare("SELECT COUNT(*) FROM coordinator_tasks WHERE (claimed_by_user_id = ? OR claimed_by_coord_id = ?) AND status = 'in_progress'");
    $myStmt->execute([$userId, $currentCoordId]);
    $myTasksCount = (int) $myStmt->fetchColumn();
}

$allCoordinators = $db->query("SELECT id, name, faculty FROM coordinators WHERE is_active = 1 ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);

require __DIR__ . '/_header.php';
?>

<?php if ($flash): ?>
    <div
        style="margin-bottom:16px;padding:12px 20px;border-radius:10px;font-weight:700;background:<?= $flash['type'] === 'success' ? '#dcfce7' : '#fee2e2' ?>;color:<?= $flash['type'] === 'success' ? '#15803d' : '#b91c1c' ?>;border:1px solid <?= $flash['type'] === 'success' ? '#bbf7d0' : '#fecaca' ?>;">
        <?= htmlspecialchars($flash['msg']) ?>
    </div>
<?php endif; ?>

<!-- ================================================================
     KPI بطاقات المؤشرات الرقمية
     ================================================================ -->
<div class="stats-kpi-grid">
    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">إجمالي المهام</span>
            <div class="stats-icon-box icon-blue">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <path d="m9 12 2 2 4-4" />
                </svg>
            </div>
        </div>
        <div class="stats-number"><?= number_format($stats['total']) ?></div>
        <div class="stats-footer">
            <span class="trend-up"><?= number_format($stats['total_points'] ?? 0) ?></span>
            <span>نقطة إجمالية</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">متاحة للتبني</span>
            <div class="stats-icon-box icon-gold">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#d97706;"><?= number_format($stats['available_count']) ?></div>
        <div class="stats-footer">
            <span style="color:#d97706; font-weight:700;">جاهزة للمنسقين</span>
            <span>بانتظار التبني</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">قيد التنفيذ (متبناة)</span>
            <div class="stats-icon-box icon-purple">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#7c3aed;"><?= number_format($stats['in_progress_count']) ?></div>
        <div class="stats-footer">
            <span style="color:#7c3aed; font-weight:700;">يعمل عليها الفريق</span>
            <span>ميدانياً وإلكترونياً</span>
        </div>
    </div>

    <div class="stats-card">
        <div class="stats-card-header">
            <span class="stats-card-title">المهام المكتملة</span>
            <div class="stats-icon-box icon-green">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
            </div>
        </div>
        <div class="stats-number" style="color:#16a34a;"><?= number_format($stats['completed_count']) ?></div>
        <div class="stats-footer">
            <span
                style="color:#16a34a; font-weight:700;"><?= $stats['total'] > 0 ? round($stats['completed_count'] / $stats['total'] * 100) : 0 ?>%</span>
            <span>نسبة الإنجاز</span>
        </div>
    </div>
</div>

<!-- ================================================================
     التبويبات + زر إضافة مهمة
     ================================================================ -->
<div class="tabs-header-wrapper">
    <nav class="tabs-nav">
        <?php if ($canViewAllTasks): ?>
            <a href="?tab=all" class="tab-btn <?= $tabFilter === 'all' ? 'active' : '' ?>">👥 كافة المهام <span
                    style="font-size:11px;opacity:.7">(<?= $tabCounts['all'] ?>)</span></a>
        <?php endif; ?>
        <a href="?tab=available" class="tab-btn <?= $tabFilter === 'available' ? 'active' : '' ?>">⚡ بنك المهام المتاحة
            <span style="font-size:11px;opacity:.7">(<?= $tabCounts['available'] ?>)</span></a>
        <a href="?tab=my_tasks" class="tab-btn <?= $tabFilter === 'my_tasks' ? 'active' : '' ?>"
            style="background:<?= $myTasksCount > 0 ? '#eff6ff' : '' ?>;color:<?= $myTasksCount > 0 ? '#0284c7' : '' ?>;font-weight:800;">
            📌 مهامي النشطة <span
                style="background:#0284c7;color:#fff;padding:1px 7px;border-radius:10px;font-size:11px;"><?= $myTasksCount ?></span>
        </a>
        <?php if ($canViewAllTasks): ?>
            <a href="?tab=in_progress" class="tab-btn <?= $tabFilter === 'in_progress' ? 'active' : '' ?>">🔄 قيد التنفيذ
                <span style="font-size:11px;opacity:.7">(<?= $tabCounts['in_progress'] ?>)</span></a>
            <a href="?tab=completed" class="tab-btn <?= $tabFilter === 'completed' ? 'active' : '' ?>">✅ المكتملة <span
                    style="font-size:11px;opacity:.7">(<?= $tabCounts['completed'] ?>)</span></a>
        <?php endif; ?>
    </nav>
    <div class="tabs-actions">
        <?php if ($canCreateTasks): ?>
            <button class="btn btn-primary" onclick="openModal('addTaskModal')">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                طرح مهمة / تكليف جديد
            </button>
        <?php endif; ?>
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
                placeholder="ابحث بعنوان المهمة، الشرح، المستند، أو اسم المنسق..." class="form-control">
        </div>
        <select name="category" class="form-control">
            <option value="">كل موضوعات وتصنيفات المهام</option>
            <?php foreach ($taskCategories as $ckey => $cmeta): ?>
                <option value="<?= $ckey ?>" <?= $categoryFilter === $ckey ? 'selected' : '' ?>><?= $cmeta['icon'] ?>
                    <?= $cmeta['label'] ?>
                </option>
            <?php endforeach; ?>
        </select>
        <select name="priority" class="form-control">
            <option value="">كل الأولويات</option>
            <option value="urgent" <?= $priorityFilter === 'urgent' ? 'selected' : '' ?>>عاجل جداً 🔥</option>
            <option value="medium" <?= $priorityFilter === 'medium' ? 'selected' : '' ?>>متوسطة ⚡</option>
            <option value="normal" <?= $priorityFilter === 'normal' ? 'selected' : '' ?>>عادية ☕</option>
        </select>
        <div class="filter-actions">
            <button type="submit" class="btn btn-secondary">🔍 بحث</button>
            <?php if ($search || $categoryFilter || $facultyFilter || $priorityFilter): ?><a
                    href="?tab=<?= $tabFilter ?>" class="btn btn-secondary">✕ مسح</a><?php endif; ?>
        </div>
    </form>
</div>

<!-- ================================================================
     شبكة بطاقات المهام والتكليفات (Tasks Grid)
     ================================================================ -->
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:18px;">
    <?php if (empty($tasksList)): ?>
        <div
            style="grid-column:1/-1;text-align:center;padding:60px 20px;background:#fff;border-radius:12px;border:1px solid #e2e8f0;">
            <div
                style="width:64px;height:64px;border-radius:50%;background:#f1f5f9;display:inline-flex;align-items:center;justify-content:center;color:#94a3b8;margin-bottom:12px;">
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            </div>
            <h3 style="font-weight:800;color:#0f172a;margin-bottom:6px;">لا توجد مهام في هذا التبويب</h3>
            <p style="color:#64748b;font-size:13px;">يمكنك الاطلاع على تبويب بنك المهام المتاحة لتبني مهام جديدة أو تعديل
                الفلاتر</p>
        </div>
    <?php endif; ?>

    <?php foreach ($tasksList as $t):
        $catMeta = $taskCategories[$t['category'] ?? 'general'] ?? $taskCategories['general'];
        $prio = $priorityLabels[$t['priority']] ?? $priorityLabels['normal'];
        $st = $statusLabels[$t['status']] ?? $statusLabels['available'];
        $isMyTask = ($t['claimed_by_user_id'] == $userId || ($currentCoordId > 0 && $t['claimed_by_coord_id'] == $currentCoordId));
        ?>
        <div
            style="background:#fff;border-radius:14px;border:1px solid <?= $t['status'] === 'in_progress' && $isMyTask ? '#93c5fd' : ($t['status'] === 'completed' ? '#bbf7d0' : '#e2e8f0') ?>;padding:18px;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,0.03);position:relative;">

            <!-- رأس بطاقة المهمة -->
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <!-- شارة موضوع وتصنيف المهمة -->
                    <span
                        style="background:<?= $catMeta['bg'] ?>;color:<?= $catMeta['color'] ?>;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;border:1px solid rgba(0,0,0,0.05);">
                        <?= $catMeta['icon'] ?>     <?= $catMeta['label'] ?>
                    </span>
                    <span
                        style="background:<?= $prio['bg'] ?>;color:<?= $prio['color'] ?>;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;">
                        <?= $prio['label'] ?>
                    </span>
                    <span
                        style="background:<?= $st['bg'] ?>;color:<?= $st['color'] ?>;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800;">
                        <?= $st['label'] ?>
                    </span>
                    <?php if ($t['faculty'] === 'all'): ?>
                        <span
                            style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;">🌐
                            عامة</span>
                    <?php else: ?>
                        <span
                            style="background:#eff6ff;color:#0284c7;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;">🏛️
                            <?= htmlspecialchars($t['faculty']) ?></span>
                    <?php endif; ?>
                </div>

                <!-- نقاط المهمة -->
                <div
                    style="background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:12px;font-size:12px;font-weight:900;display:flex;align-items:center;gap:3px;flex-shrink:0;">
                    <span>🪙</span> <?= $t['points'] ?> نقطة
                </div>
            </div>

            <!-- عنوان المهمة -->
            <h4
                style="font-family:'Cairo',sans-serif;font-size:15px;font-weight:800;color:#0f172a;margin:0 0 8px;line-height:1.4;">
                <?= htmlspecialchars($t['title']) ?>
            </h4>

            <!-- وصف وموضوع وشرح المهمة -->
            <p style="font-size:12.8px;color:#475569;line-height:1.6;margin:0 0 14px;flex:1;">
                <?= nl2br(htmlspecialchars($t['description'] ?? '')) ?>
            </p>

            <!-- قسم المرفقات والشروحات (فيديو / صورة / مستند ملف PDF/Word/Excel) -->
            <?php if ($t['media_type'] !== 'none' && !empty($t['media_url'])): ?>
                <div
                    style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <?php if ($t['media_type'] === 'image'): ?>
                            <div
                                style="width:36px;height:36px;border-radius:6px;background:#e0f2fe;color:#0284c7;display:flex;align-items:center;justify-content:center;font-size:16px;">
                                🖼️</div>
                            <div>
                                <div style="font-size:12px;font-weight:800;color:#0f172a;">صورة توضيحية / نموذج</div>
                                <div style="font-size:11px;color:#64748b;">اضغط للمعاينة المباشرة</div>
                            </div>
                        <?php elseif ($t['media_type'] === 'video'): ?>
                            <div
                                style="width:36px;height:36px;border-radius:6px;background:#fee2e2;color:#ef4444;display:flex;align-items:center;justify-content:center;font-size:16px;">
                                🎥</div>
                            <div>
                                <div style="font-size:12px;font-weight:800;color:#0f172a;">فيديو شرح لطريقة التنفيذ</div>
                                <div style="font-size:11px;color:#64748b;">شاهد الشرح التوضيحي</div>
                            </div>
                        <?php elseif ($t['media_type'] === 'document'): ?>
                            <div
                                style="width:36px;height:36px;border-radius:6px;background:#fef3c7;color:#b45309;display:flex;align-items:center;justify-content:center;font-size:16px;">
                                📄</div>
                            <div>
                                <div style="font-size:12px;font-weight:800;color:#0f172a;">
                                    <?= htmlspecialchars($t['attachment_name'] ?: 'مستند عمل مرفق (PDF / Doc)') ?>
                                </div>
                                <div style="font-size:11px;color:#64748b;">معاينة ملف المهمة</div>
                            </div>
                        <?php endif; ?>
                    </div>
                    <button type="button" class="btn btn-secondary" style="padding:4px 10px;font-size:11.5px;"
                        onclick='openMediaModal(<?= json_encode($t, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'>
                        👁️ <?= $t['media_type'] === 'document' ? 'معاينة الملف' : 'مشاهدة الشرح' ?>
                    </button>
                </div>
            <?php endif; ?>

            <!-- معلومات التبني والمنسق المسؤول -->
            <?php if ($t['status'] !== 'available'): ?>
                <div
                    style="background:<?= $t['status'] === 'completed' ? '#f0fdf4' : '#fffbeb' ?>;border:1px solid <?= $t['status'] === 'completed' ? '#bbf7d0' : '#fde68a' ?>;border-radius:10px;padding:10px 12px;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                        <span
                            style="font-size:11.5px;font-weight:700;color:<?= $t['status'] === 'completed' ? '#15803d' : '#92400e' ?>;">
                            <?= $t['status'] === 'completed' ? '✅ تم الإنجاز بواسطة:' : '🤝 المنسق المتبني للمهمة:' ?>
                        </span>
                        <?php if ($t['claimed_at']): ?>
                            <span
                                style="font-size:10.5px;color:#64748b;"><?= date('Y-m-d H:i', strtotime($t['claimed_at'])) ?></span>
                        <?php endif; ?>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div
                            style="width:28px;height:28px;border-radius:50%;background:#0284c7;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;">
                            <?= mb_substr($t['coord_name'] ?? 'م', 0, 1, 'UTF-8') ?>
                        </div>
                        <div>
                            <div style="font-size:13px;font-weight:800;color:#0f172a;">
                                <?= htmlspecialchars($t['coord_name'] ?? 'منسق غير معروف') ?>
                            </div>
                            <div style="font-size:11px;color:#64748b;"><?= htmlspecialchars($t['coord_faculty'] ?? '') ?></div>
                        </div>
                    </div>
                    <?php if (!empty($t['completion_notes'])): ?>
                        <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #bbf7d0;font-size:11.5px;color:#166534;">
                            <strong>ملاحظات الإنجاز:</strong> <?= htmlspecialchars($t['completion_notes']) ?>
                        </div>
                    <?php endif; ?>
                </div>
            <?php endif; ?>

            <!-- موعد التسليم + تاريخ النشر -->
            <div
                style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#64748b;margin-bottom:14px;padding-top:8px;border-top:1px solid #f1f5f9;">
                <div>
                    <?php if ($t['due_date']): ?>
                        <span>⏰ موعد التسليم: <strong
                                style="color:#0f172a;"><?= htmlspecialchars($t['due_date']) ?></strong></span>
                    <?php else: ?>
                        <span>⏰ موعد التسليم: مفتوح</span>
                    <?php endif; ?>
                </div>
                <div>نشرت: <?= date('m/d', strtotime($t['created_at'])) ?></div>
            </div>

            <!-- أزرار الإجراءات التفاعلية -->
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:auto;">
                <!-- 1. زر تبني المهمة (إذا كانت متاحة) -->
                <?php if (!$isTasksViewOnly && $t['status'] === 'available'): ?>
                    <form method="post" style="flex:1;">
                        <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                        <input type="hidden" name="action" value="claim">
                        <input type="hidden" name="task_id" value="<?= $t['id'] ?>">
                        <button type="submit" class="btn btn-primary"
                            style="width:100%;justify-content:center;padding:8px 12px;font-size:12.5px;background:#0284c7;">
                            🤝 تبني المهمة فوراً
                        </button>
                    </form>
                <?php endif; ?>

                <!-- 2. أزرار المنسق المتبني (قيد التنفيذ) -->
                <?php if (!$isTasksViewOnly && $t['status'] === 'in_progress' && ($isMyTask || $isAdmin)): ?>
                    <!-- زر إنجاز المهمة -->
                    <button type="button" class="btn btn-primary"
                        style="flex:1;justify-content:center;padding:8px 12px;font-size:12.5px;background:#16a34a;"
                        onclick='openCompleteModal(<?= json_encode($t, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'>
                        ✅ تم إنجاز المهمة
                    </button>

                    <!-- زر إفلات المهمة -->
                    <form method="post"
                        onsubmit="return confirm('هل أنت متأكد من رغبتك في إفلات المهمة وإعادتها للبنك العام للمنسقين الآخرين؟');">
                        <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                        <input type="hidden" name="action" value="release">
                        <input type="hidden" name="task_id" value="<?= $t['id'] ?>">
                        <button type="submit" class="btn btn-secondary" style="padding:8px 12px;font-size:12px;color:#dc2626;"
                            title="إفلات المهمة وإعادتها للجميع">
                            🔄 إفلات
                        </button>
                    </form>
                <?php endif; ?>

                <!-- 3. زر إعادة الفتح للمدير (إذا كانت مكتملة) -->
                <?php if ($t['status'] === 'completed' && $canEditTasks): ?>
                    <form method="post" style="flex:1;"
                        onsubmit="return confirm('هل تريد إعادة فتح هذه المهمة للعمل عليها من جديد؟');">
                        <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                        <input type="hidden" name="action" value="reopen">
                        <input type="hidden" name="task_id" value="<?= $t['id'] ?>">
                        <button type="submit" class="btn btn-secondary"
                            style="width:100%;justify-content:center;padding:7px 10px;font-size:12px;">
                            🔁 إعادة فتح المهمة
                        </button>
                    </form>
                <?php endif; ?>

                <!-- أزرار الإدارة (تعديل وحذف) للمدير -->
                <?php if ($canEditTasks || $canDeleteTasks): ?>
                    <?php if ($canEditTasks): ?>
                        <button type="button" class="btn-action btn-edit"
                            onclick='openEditTaskModal(<?= json_encode($t, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT) ?>)'
                            title="تعديل المهمة والمرفقات">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                        </button>
                    <?php endif; ?>
                    <?php if ($canDeleteTasks): ?>
                        <form method="post" style="display:inline;"
                            onsubmit="return confirm('هل أنت متأكد من حذف هذه المهمة نهائياً؟');">
                            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                            <input type="hidden" name="action" value="delete">
                            <input type="hidden" name="id" value="<?= $t['id'] ?>">
                            <button type="submit" class="btn-action btn-delete" title="حذف المهمة">
                                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                            </button>
                        </form>
                    <?php endif; ?>
                <?php endif; ?>
            </div>

        </div>
    <?php endforeach; ?>
</div>

<!-- ================================================================
     النوافذ المنبثقة (Modals)
     ================================================================ -->

<!-- 1. مودال إضافة مهمة جديدة (Admin) -->
<?php if ($canCreateTasks): ?>
    <div class="custom-modal-overlay" id="addTaskModal">
        <div class="custom-modal-box" style="max-width:660px;">
            <div class="custom-modal-header">
                <h3>🚀 طرح مهمة وتكليف جديد للمنسقين</h3>
                <button type="button" class="close-modal-btn" onclick="closeModal('addTaskModal')">✕</button>
            </div>
            <form method="post" enctype="multipart/form-data" class="custom-modal-body"
                onsubmit="showFormLoading(this, 'جاري نشر المهمة والمرفقات...')">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <input type="hidden" name="action" value="create">

                <div class="modal-form-grid" style="grid-template-columns:1fr 1fr;">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>عنوان المهمة والتكليف *</label>
                        <input type="text" name="title" required class="form-control"
                            placeholder="مثال: استلام وتدقيق الكتب من المستودع">
                    </div>

                    <div class="form-group">
                        <label>موضوع وتصنيف المهمة</label>
                        <select name="category" class="form-control">
                            <?php foreach ($taskCategories as $ckey => $cmeta): ?>
                                <option value="<?= $ckey ?>"><?= $cmeta['icon'] ?>         <?= $cmeta['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>الكلية المستهدفة</label>
                        <select name="faculty" class="form-control">
                            <option value="all">🌐 عامة لجميع الكليات</option>
                            <?php foreach ($facultiesList as $fac): ?>
                                <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="form-group" style="grid-column:1/-1;">
                        <label>نص موضوع المهمة والشرح والتعليمات التفصيلية *</label>
                        <textarea name="description" rows="3" required class="form-control"
                            placeholder="اكتب تعليمات المهمة وموضوعها بدقة، خطوات التنفيذ، الروابط، وما هو مطلوب من المنسق..."></textarea>
                    </div>

                    <div class="form-group">
                        <label>درجة الأولوية</label>
                        <select name="priority" class="form-control">
                            <option value="urgent">عاجل جداً 🔥</option>
                            <option value="medium" selected>أولوية متوسطة ⚡</option>
                            <option value="normal">أولوية عادية ☕</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>النقاط والمكافأة (Points)</label>
                        <input type="number" name="points" value="15" min="1" max="500" class="form-control">
                    </div>

                    <div class="form-group" style="grid-column:1/-1;">
                        <label>موعد التسليم النهائي (اختياري)</label>
                        <input type="date" name="due_date" class="form-control">
                        <small style="display:block;color:#64748b;margin-top:5px;">اتركه فارغًا لتكون المهمة مفتوحة
                            المدة.</small>
                    </div>

                    <!-- إرفاق وسائط وشروحات ومستندات: سحب وإفلات أو رابط -->
                    <div class="form-group" style="grid-column:1/-1;">
                        <label style="font-weight:800;color:#0f172a;margin-bottom:6px;">المرفقات والوسائط (صور، فيديو، أو
                            مستندات PDF/Word/Excel/روابط)</label>
                        <div class="media-upload-tabs">
                            <button type="button" class="media-tab-btn active" id="tab_btn_upload_new"
                                onclick="switchMediaMode('new', 'upload')">📁 رفع / سحب وإفلات ملف من جهازك</button>
                            <button type="button" class="media-tab-btn" id="tab_btn_url_new"
                                onclick="switchMediaMode('new', 'url')">🔗 إدخال رابط ملف / فيديو يوتيوب / Drive</button>
                        </div>

                        <!-- صندوق الرفع بالسحب والإفلات -->
                        <div id="media_upload_box_new">
                            <div class="file-dropzone-box" onclick="document.getElementById('file_input_new').click()"
                                ondragover="handleDragOver(event, this)" ondragleave="handleDragLeave(event, this)"
                                ondrop="handleFileDrop(event, this, 'file_input_new', 'preview_new')">
                                <input type="file" name="media_file" id="file_input_new"
                                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                    style="display:none;" onchange="handleFileSelect(this, 'preview_new')">
                                <div class="file-dropzone-icon">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </div>
                                <div style="font-weight:800;color:#0f172a;font-size:13px;">اضغط لاختيار صورة، فيديو، أو
                                    مستند عمل، أو اسحبه وأفلته هنا</div>
                                <div style="font-size:11px;color:#64748b;margin-top:3px;">يدعم ملفات PDF، Word، Excel، الصور
                                    والفيديوهات</div>
                            </div>
                            <div class="dropzone-file-preview" id="preview_new"></div>
                        </div>

                        <!-- صندوق إدخال الرابط المباشر / ملف خارجي -->
                        <div id="media_url_box_new" style="display:none;">
                            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;">
                                <select name="media_type" class="form-control">
                                    <option value="video">🎥 فيديو يوتيوب</option>
                                    <option value="document">📄 رابط ملف / Drive</option>
                                    <option value="image">🖼️ رابط صورة</option>
                                </select>
                                <input type="url" name="media_url" class="form-control" dir="ltr"
                                    placeholder="https://drive.google.com/... أو https://youtube.com/...">
                            </div>
                            <div style="margin-top:8px;">
                                <input type="text" name="attachment_name" class="form-control"
                                    placeholder="اسم ووصف الملف المرفق (مثال: جدول توزيع الكتب - ملف إكسل)">
                            </div>
                        </div>
                    </div>

                    <!-- خيار تعيين مباشر لمنسق محدد -->
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>تكليف منسق محدد مباشرة (اختياري - اتركه فارغاً لتبني الجميع)</label>
                        <select name="assigned_coord_id" class="form-control">
                            <option value="">— مهمة عامة مفتوحة للتبني لجميع المنسقين —</option>
                            <?php foreach ($allCoordinators as $c): ?>
                                <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['name']) ?>
                                    (<?= htmlspecialchars($c['faculty']) ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                </div>

                <div class="custom-modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('addTaskModal')">إلغاء</button>
                    <button type="submit" class="btn btn-primary" id="btn_submit_add">🚀 نشر المهمة والمستندات</button>
                </div>
            </form>
        </div>
    </div>

    <!-- 2. مودال تعديل مهمة (Admin) -->
    <div class="custom-modal-overlay" id="editTaskModal">
        <div class="custom-modal-box" style="max-width:660px;">
            <div class="custom-modal-header">
                <h3>✏️ تعديل بيانات ومرفقات المهمة</h3>
                <button type="button" class="close-modal-btn" onclick="closeModal('editTaskModal')">✕</button>
            </div>
            <form method="post" enctype="multipart/form-data" class="custom-modal-body"
                onsubmit="showFormLoading(this, 'جاري حفظ وتخزين التعديلات...')">
                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
                <input type="hidden" name="action" value="edit">
                <input type="hidden" name="id" id="edit_task_id">
                <input type="hidden" name="media_source_type" id="edit_media_source_type" value="upload">
                <input type="hidden" name="remove_media" id="edit_remove_media" value="0">

                <div class="modal-form-grid" style="grid-template-columns:1fr 1fr;">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>عنوان المهمة *</label>
                        <input type="text" name="title" id="edit_task_title" required class="form-control">
                    </div>

                    <div class="form-group">
                        <label>موضوع وتصنيف المهمة</label>
                        <select name="category" id="edit_task_category" class="form-control">
                            <?php foreach ($taskCategories as $ckey => $cmeta): ?>
                                <option value="<?= $ckey ?>"><?= $cmeta['icon'] ?>         <?= $cmeta['label'] ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>الكلية المستهدفة</label>
                        <select name="faculty" id="edit_task_faculty" class="form-control">
                            <option value="all">🌐 عامة لجميع الكليات</option>
                            <?php foreach ($facultiesList as $fac): ?>
                                <option value="<?= htmlspecialchars($fac) ?>"><?= htmlspecialchars($fac) ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <div class="form-group" style="grid-column:1/-1;">
                        <label>نص موضوع المهمة والشرح والتعليمات *</label>
                        <textarea name="description" id="edit_task_desc" rows="3" required class="form-control"></textarea>
                    </div>

                    <div class="form-group">
                        <label>درجة الأولوية</label>
                        <select name="priority" id="edit_task_priority" class="form-control">
                            <option value="urgent">عاجل جداً 🔥</option>
                            <option value="medium">أولوية متوسطة ⚡</option>
                            <option value="normal">أولوية عادية ☕</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>النقاط</label>
                        <input type="number" name="points" id="edit_task_points" min="1" max="500" class="form-control">
                    </div>

                    <div class="form-group" style="grid-column:1/-1;">
                        <label>موعد التسليم النهائي (اختياري)</label>
                        <input type="date" name="due_date" id="edit_task_due" class="form-control">
                        <small style="display:block;color:#64748b;margin-top:5px;">اتركه فارغًا لتكون المهمة مفتوحة
                            المدة.</small>
                    </div>

                    <!-- إرفاق أو تعديل وسائط ومستندات -->
                    <div class="form-group" style="grid-column:1/-1;">
                        <label style="font-weight:800;color:#0f172a;margin-bottom:6px;">المرفقات والوسائط ومستندات
                            العمل</label>

                        <div id="current_media_box"
                            style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-bottom:10px;align-items:center;justify-content:space-between;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <span id="current_media_icon" style="font-size:16px;">📎</span>
                                <div>
                                    <div style="font-size:12px;font-weight:800;color:#15803d;" id="current_media_title">يوجد
                                        ملف/رابط مرفق حالياً</div>
                                    <div style="font-size:11px;color:#166534;" id="current_media_desc">سيتم الإبقاء عليه ما
                                        لم ترفع ملفاً أو رابطاً جديداً</div>
                                </div>
                            </div>
                            <button type="button" class="btn btn-secondary"
                                style="color:#dc2626;padding:2px 8px;font-size:11px;" onclick="removeCurrentMedia()">حذف
                                المرفق</button>
                        </div>

                        <div class="media-upload-tabs">
                            <button type="button" class="media-tab-btn active" id="tab_btn_upload_edit"
                                onclick="switchMediaMode('edit', 'upload')">📁 رفع / استبدال بملف جديد</button>
                            <button type="button" class="media-tab-btn" id="tab_btn_url_edit"
                                onclick="switchMediaMode('edit', 'url')">🔗 إدخال رابط خارجي</button>
                        </div>

                        <!-- صندوق الرفع بالسحب والإفلات -->
                        <div id="media_upload_box_edit">
                            <div class="file-dropzone-box" onclick="document.getElementById('file_input_edit').click()"
                                ondragover="handleDragOver(event, this)" ondragleave="handleDragLeave(event, this)"
                                ondrop="handleFileDrop(event, this, 'file_input_edit', 'preview_edit')">
                                <input type="file" name="media_file" id="file_input_edit"
                                    accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                                    style="display:none;" onchange="handleFileSelect(this, 'preview_edit')">
                                <div class="file-dropzone-icon">
                                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                                        stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </div>
                                <div style="font-weight:800;color:#0f172a;font-size:13px;">اضغط لاختيار ملف من جهازك أو
                                    اسحبه وأفلته هنا</div>
                                <div style="font-size:11px;color:#64748b;margin-top:3px;">ملفات PDF، Word، Excel، صور، أو
                                    فيديوهات</div>
                            </div>
                            <div class="dropzone-file-preview" id="preview_edit"></div>
                        </div>

                        <!-- صندوق إدخال الرابط المباشر -->
                        <div id="media_url_box_edit" style="display:none;">
                            <div style="display:grid;grid-template-columns:140px 1fr;gap:8px;">
                                <select name="media_type" id="edit_media_type" class="form-control">
                                    <option value="video">🎥 فيديو يوتيوب</option>
                                    <option value="document">📄 رابط مستند / Drive</option>
                                    <option value="image">🖼️ رابط صورة</option>
                                </select>
                                <input type="url" name="media_url" id="edit_media_url" class="form-control" dir="ltr"
                                    placeholder="https://...">
                            </div>
                            <div style="margin-top:8px;">
                                <input type="text" name="attachment_name" id="edit_attachment_name" class="form-control"
                                    placeholder="اسم ووصف الملف المرفق">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="custom-modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="closeModal('editTaskModal')">إلغاء</button>
                    <button type="submit" class="btn btn-primary" id="btn_submit_edit">حفظ التعديلات</button>
                </div>
            </form>
        </div>
    </div>
<?php endif; ?>

<!-- 3. مودال تسجيل إنجاز المهمة (Complete Task Modal) -->
<div class="custom-modal-overlay" id="completeTaskModal">
    <div class="custom-modal-box" style="max-width:540px;">
        <div class="custom-modal-header">
            <h3>🎉 تأكيد إنجاز المهمة والتكليف</h3>
            <button type="button" class="close-modal-btn" onclick="closeModal('completeTaskModal')">✕</button>
        </div>
        <form method="post" class="custom-modal-body">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>">
            <input type="hidden" name="action" value="complete">
            <input type="hidden" name="task_id" id="complete_task_id">

            <div
                style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin-bottom:16px;">
                <div style="font-size:12px;color:#15803d;">المهمة المنجزة:</div>
                <div style="font-size:15px;font-weight:800;color:#0f172a;margin-top:2px;" id="complete_task_title">—
                </div>
            </div>

            <div class="form-group">
                <label>تقرير / ملاحظات الإنجاز أو رابط الإثبات (اختياري)</label>
                <textarea name="completion_notes" rows="3" class="form-control"
                    placeholder="اكتب نبذة عن كيفية تنفيذ المهمة، هل تم تسليم الكتب، أو رابط المستند..."></textarea>
            </div>

            <div class="custom-modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeModal('completeTaskModal')">إلغاء</button>
                <button type="submit" class="btn btn-primary" style="background:#16a34a;">✅ تأكيد إتمام المهمة</button>
            </div>
        </form>
    </div>
</div>

<!-- 4. مودال عرض الوسائط والشروحات والمستندات المحمية -->
<div class="custom-modal-overlay" id="mediaPreviewModal">
    <div class="custom-modal-box" style="max-width:760px;background:#ffffff;">
        <div class="custom-modal-header" style="border-bottom:1px solid #e2e8f0;padding:14px 20px;">
            <div style="display:flex;align-items:center;gap:10px;">
                <h3 id="media_modal_title" style="margin:0;font-size:16px;">🎥 الشرح التوضيحي للمهمة</h3>
                <span
                    style="background:#fee2e2;color:#b91c1c;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;gap:4px;">
                    🔒 للاطلاع الداخلي فقط
                </span>
            </div>
            <button type="button" class="close-modal-btn" onclick="closeModal('mediaPreviewModal')">✕</button>
        </div>
        <div class="custom-modal-body" style="padding:16px;text-align:center;">

            <!-- شريط الأمان والحماية -->
            <div
                style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#92400e;">
                <div style="display:flex;align-items:center;gap:6px;font-weight:700;">
                    <span>🛡️</span>
                    <span>عرض ذاتي مقيد ومحمي ضد التنزيل أو المشاركة الخارجية</span>
                </div>
                <span
                    style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#b45309;"><?= htmlspecialchars($currentUser['username'] ?? 'User') ?>
                    · VIEW ONLY</span>
            </div>

            <div id="media_container"
                style="min-height:260px;display:flex;align-items:center;justify-content:center;background:#0b1120;border-radius:10px;overflow:hidden;position:relative;user-select:none;-webkit-user-select:none;"
                oncontextmenu="return false;">
                <!-- سيتم حقن الفيديو المقيد أو الصورة المحمية أو معاينة المستند هنا -->
            </div>

            <div id="media_task_desc"
                style="margin-top:14px;font-size:13px;color:#475569;text-align:right;background:#f8fafc;padding:12px 14px;border-radius:8px;border:1px solid #e2e8f0;line-height:1.6;">
            </div>
        </div>
        <div class="custom-modal-footer" style="padding:12px 20px;">
            <button type="button" class="btn btn-secondary" onclick="closeModal('mediaPreviewModal')">إغلاق
                المعاينة</button>
        </div>
    </div>
</div>

<script>
    function openModal(id) {
        const modal = document.getElementById(id);
        if (id === 'addTaskModal') {
            const assignedCoordinator = modal.querySelector('select[name="assigned_coord_id"]');
            if (assignedCoordinator) assignedCoordinator.value = '';
        }
        modal.classList.add('show');
    }
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('show');
        if (id === 'mediaPreviewModal') {
            const container = document.getElementById('media_container');
            if (container) container.innerHTML = '';
        }
    }

    function switchMediaMode(prefix, mode) {
        const uploadBox = document.getElementById('media_upload_box_' + prefix);
        const urlBox = document.getElementById('media_url_box_' + prefix);
        const tabUpload = document.getElementById('tab_btn_upload_' + prefix);
        const tabUrl = document.getElementById('tab_btn_url_' + prefix);

        if (prefix === 'edit') {
            document.getElementById('edit_media_source_type').value = mode;
        }

        if (mode === 'upload') {
            uploadBox.style.display = 'block';
            urlBox.style.display = 'none';
            tabUpload.classList.add('active');
            tabUrl.classList.remove('active');
        } else {
            uploadBox.style.display = 'none';
            urlBox.style.display = 'block';
            tabUpload.classList.remove('active');
            tabUrl.classList.add('active');
        }
    }

    function handleDragOver(e, dropzone) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
    }

    function handleDragLeave(e, dropzone) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
    }

    function handleFileDrop(e, dropzone, inputId, previewId) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const input = document.getElementById(inputId);
            input.files = e.dataTransfer.files;
            handleFileSelect(input, previewId);
        }
    }

    function handleFileSelect(input, previewId) {
        const preview = document.getElementById(previewId);
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
            const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i.test(file.name);
            const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

            let mediaPreviewHtml = '';
            let typeBadge = '<span style="background:#e0f2fe;color:#0284c7;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:800;">📄 مستند</span>';

            if (isVideo) {
                typeBadge = '<span style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:800;">🎥 فيديو شرح</span>';
                mediaPreviewHtml = `
                <div style="margin-top:8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;display:flex;align-items:center;gap:10px;">
                    <div style="font-size:22px;">🎬</div>
                    <div>
                        <div style="font-size:12px;font-weight:800;color:#15803d;">تم إرفاق مقطع الفيديو بنجاح وجاهز للحفظ ✅</div>
                        <div style="font-size:11px;color:#166534;">سيتم تشفيره وتشغيله في مشغل الفيديو المحمي تلقائياً بمجرد الضغط على حفظ.</div>
                    </div>
                </div>
            `;
            } else if (isImage) {
                typeBadge = '<span style="background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:800;">🖼️ صورة</span>';
                const blobUrl = URL.createObjectURL(file);
                mediaPreviewHtml = `
                <div style="margin-top:8px;text-align:center;">
                    <img src="${blobUrl}" style="max-height:140px;max-width:100%;border-radius:6px;border:1px solid #e2e8f0;">
                </div>
            `;
            }

            preview.style.display = 'block';
            preview.innerHTML = `
            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        ${typeBadge}
                        <div>
                            <div style="font-weight:800;font-size:12.5px;color:#0f172a;direction:ltr;text-align:right;">${file.name}</div>
                            <div style="font-size:11px;color:#64748b;">الحجم: ${sizeMb} ميجابايت (MB)</div>
                        </div>
                    </div>
                    <button type="button" onclick="clearFile('${input.id}', '${previewId}')" style="background:#fee2e2;color:#b91c1c;border:none;padding:4px 10px;border-radius:6px;font-size:11.5px;font-weight:700;cursor:pointer;">إلغاء الملف ✕</button>
                </div>
                ${mediaPreviewHtml}
            </div>
        `;
        } else {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
    }

    function clearFile(inputId, previewId) {
        const input = document.getElementById(inputId);
        input.value = '';
        const preview = document.getElementById(previewId);
        preview.style.display = 'none';
        preview.innerHTML = '';
    }

    function showFormLoading(form, msg) {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
            btn.innerHTML = '⏳ ' + msg;
            btn.style.opacity = '0.75';
            btn.style.pointerEvents = 'none';
        }
        const cancelBtn = form.querySelector('button.btn-secondary');
        if (cancelBtn) {
            cancelBtn.style.display = 'none';
        }
    }

    function openEditTaskModal(t) {
        document.getElementById('edit_task_id').value = t.id;
        document.getElementById('edit_task_title').value = t.title || '';
        document.getElementById('edit_task_category').value = t.category || 'general';
        document.getElementById('edit_task_desc').value = t.description || '';
        document.getElementById('edit_task_faculty').value = t.faculty || 'all';
        document.getElementById('edit_task_priority').value = t.priority || 'medium';
        document.getElementById('edit_task_points').value = t.points || 10;
        document.getElementById('edit_task_due').value = t.due_date || '';
        document.getElementById('edit_media_type').value = t.media_type || 'none';
        document.getElementById('edit_media_url').value = (t.media_url && !t.media_url.startsWith('../uploads/')) ? t.media_url : '';
        document.getElementById('edit_attachment_name').value = t.attachment_name || '';
        document.getElementById('edit_remove_media').value = '0';

        const curMediaBox = document.getElementById('current_media_box');
        if (t.media_type !== 'none' && t.media_url) {
            curMediaBox.style.display = 'flex';
            let icon = '🖼️';
            let title = 'صورة مرفقة حالياً';
            if (t.media_type === 'video') { icon = '🎥'; title = 'فيديو شرح مرفق حالياً'; }
            if (t.media_type === 'document') { icon = '📄'; title = 'مستند/ملف مرفق: ' + (t.attachment_name || ''); }
            document.getElementById('current_media_icon').innerText = icon;
            document.getElementById('current_media_title').innerText = title;
        } else {
            curMediaBox.style.display = 'none';
        }

        clearFile('file_input_edit', 'preview_edit');
        switchMediaMode('edit', 'upload');
        openModal('editTaskModal');
    }

    function removeCurrentMedia() {
        document.getElementById('current_media_box').style.display = 'none';
        document.getElementById('edit_remove_media').value = '1';
        document.getElementById('edit_media_url').value = '';
        document.getElementById('edit_attachment_name').value = '';
    }

    function openCompleteModal(t) {
        document.getElementById('complete_task_id').value = t.id;
        document.getElementById('complete_task_title').innerText = t.title || '';
        openModal('completeTaskModal');
    }

    function openMediaModal(t) {
        let typeTitle = '🖼️ صورة توضيحية: ';
        if (t.media_type === 'video') typeTitle = '🎥 فيديو توضيحي: ';
        if (t.media_type === 'document') typeTitle = '📄 مستند وملف المهمة: ';

        document.getElementById('media_modal_title').innerText = typeTitle + t.title;
        document.getElementById('media_task_desc').innerText = t.description || '';
        const container = document.getElementById('media_container');
        container.innerHTML = '';

        if (t.media_type === 'image') {
            const wrap = document.createElement('div');
            wrap.style.position = 'relative';
            wrap.style.display = 'inline-block';
            wrap.style.maxWidth = '100%';
            wrap.oncontextmenu = () => false;

            const img = document.createElement('img');
            img.src = t.media_url;
            img.draggable = false;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '500px';
            img.style.borderRadius = '8px';
            img.style.display = 'block';
            img.oncontextmenu = () => false;

            const watermarkBadge = document.createElement('div');
            watermarkBadge.style.cssText = 'position:absolute;bottom:10px;left:10px;background:rgba(15,23,42,0.85);color:#cbd5e1;padding:4px 10px;border-radius:6px;font-size:10.5px;font-family:monospace;pointer-events:none;';
            watermarkBadge.innerText = '🔒 PROTECTED · MAKANAK ACADEMIC';

            wrap.appendChild(img);
            wrap.appendChild(watermarkBadge);
            container.appendChild(wrap);
        } else if (t.media_type === 'video') {
            const url = t.media_url;
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                let vidId = '';
                if (url.includes('v=')) {
                    vidId = url.split('v=')[1].split('&')[0];
                } else if (url.includes('youtu.be/')) {
                    vidId = url.split('youtu.be/')[1].split('?')[0];
                }
                container.innerHTML = `
                <div style="position:relative;width:100%;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px;">
                    <iframe style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px;" 
                            src="https://www.youtube-nocookie.com/embed/${vidId}?autoplay=1&rel=0&modestbranding=1&controls=1&showinfo=0&iv_load_policy=3" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope;" 
                            allowfullscreen="false"></iframe>
                </div>
            `;
            } else {
                const vidWrap = document.createElement('div');
                vidWrap.style.cssText = 'position:relative;width:100%;max-width:100%;';
                vidWrap.oncontextmenu = () => false;

                const video = document.createElement('video');
                video.src = url;
                video.controls = true;
                video.autoplay = true;
                video.playsInline = true;
                video.disablePictureInPicture = true;
                video.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen noremoteplayback');
                video.style.cssText = 'width:100%;max-height:480px;border-radius:8px;background:#000;outline:none;';
                video.oncontextmenu = () => false;

                const watermarkBadge = document.createElement('div');
                watermarkBadge.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(15,23,42,0.8);color:#94a3b8;padding:3px 8px;border-radius:4px;font-size:10px;font-family:monospace;pointer-events:none;';
                watermarkBadge.innerText = '🔒 MAKANAK DRM';

                vidWrap.appendChild(video);
                vidWrap.appendChild(watermarkBadge);
                container.appendChild(vidWrap);
            }
        } else if (t.media_type === 'document') {
            const url = t.media_url;
            if (url.endsWith('.pdf')) {
                container.innerHTML = `
                <div style="width:100%;height:460px;border-radius:8px;overflow:hidden;background:#fff;">
                    <iframe src="${url}#toolbar=0" style="width:100%;height:100%;border:none;"></iframe>
                </div>
            `;
            } else {
                container.innerHTML = `
                <div style="padding:40px 20px;color:#fff;text-align:center;">
                    <div style="font-size:48px;margin-bottom:12px;">📄</div>
                    <h4 style="font-size:16px;color:#fff;margin-bottom:6px;">${t.attachment_name || 'مستند عمل مرفق للمهمة'}</h4>
                    <p style="color:#94a3b8;font-size:12px;margin-bottom:16px;">مستند عمل مخصص للاطلاع والتنفيذ الداخلي</p>
                    <a href="${url}" target="_blank" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:6px;">
                        🔗 فتح واستعراض المستند
                    </a>
                </div>
            `;
            }
        }
        openModal('mediaPreviewModal');
    }

    document.querySelectorAll('.custom-modal-overlay').forEach(o => { o.addEventListener('click', e => { if (e.target === o) closeModal(o.id); }); });
</script>

<?php require __DIR__ . '/_footer.php'; ?>