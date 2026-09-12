<?php
$page_key = 'deleted';
$page_title = 'المحذوفات والأرشيف';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../includes/sync_frontend_live.php';

if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}

$db = get_db();
$currentUser = $db->prepare('SELECT * FROM users WHERE id = ?');
$currentUser->execute([(int) ($_SESSION['user_id'] ?? 0)]);
$user = $currentUser->fetch(PDO::FETCH_ASSOC) ?: [];
$isAdmin = in_array($user['role'] ?? '', ['admin', 'super_admin'], true) || (int) ($user['id'] ?? 0) === 1;

if (!$isAdmin) {
    http_response_code(403);
    exit('غير مصرح');
}

$flash = null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && csrf_check($_POST['csrf'] ?? '')) {
    $id = (int) ($_POST['id'] ?? 0);
    $action = $_POST['action'] ?? '';
    $itemStmt = $db->prepare('SELECT * FROM deleted_records WHERE id = ?');
    $itemStmt->execute([$id]);
    $item = $itemStmt->fetch(PDO::FETCH_ASSOC);

    if ($item && $action === 'restore') {
        $record = json_decode($item['record_json'], true);
        if (is_array($record) && isset($record['id'])) {
            $columns = array_keys($record);
            $quoted = implode(', ', array_map(static fn($column) => '"' . str_replace('"', '""', $column) . '"', $columns));
            $placeholders = implode(', ', array_fill(0, count($columns), '?'));
            $db->prepare("INSERT OR REPLACE INTO \"{$item['source_table']}\" ({$quoted}) VALUES ({$placeholders})")->execute(array_values($record));
            $cloudOk = true;
            if ($item['source_table'] === 'quiz_questions') {
                $cloudOk = sync_quiz_question_to_firestore($db, (int) $record['id']);
            } elseif ($item['source_table'] === 'quiz_parts') {
                $cloudOk = sync_quiz_part_to_firestore($db, (string) ($record['slug'] ?? $record['id']));
            } elseif ($item['source_table'] === 'quiz_subjects') {
                $cloudOk = sync_quiz_subject_to_firestore($db, (string) $record['id']);
            }
            if (!$cloudOk && in_array($item['source_table'], ['quiz_questions', 'quiz_parts', 'quiz_subjects'], true)) {
                $db->prepare("DELETE FROM \"{$item['source_table']}\" WHERE id = ?")->execute([(int) $record['id']]);
                $flash = ['type' => 'danger', 'msg' => 'تعذر استعادة السجل إلى الموقع الرسمي؛ بقي في الأرشيف.'];
            } else {
                if (in_array($item['source_table'], ['quiz_questions', 'quiz_parts', 'quiz_subjects'], true)) {
                    sync_quizzes_to_frontend($db);
                }
                $db->prepare('DELETE FROM deleted_records WHERE id = ?')->execute([$id]);
                log_activity("استعادة السجل المحذوف #{$id} من {$item['source_table']}", 'deleted_records');
                $flash = ['type' => 'success', 'msg' => 'تمت استعادة السجل محليًا وعلى الموقع الرسمي.'];
            }
        }
    } elseif ($item && $action === 'purge') {
        $record = json_decode($item['record_json'], true) ?: [];
        $cloudOk = true;
        if ($item['source_table'] === 'quiz_questions') {
            $cloudOk = firestoreDeleteQuizQuestionFromRecord($record);
        } elseif ($item['source_table'] === 'quiz_parts') {
            $cloudOk = firestoreDeleteDoc('quiz_parts', (string) ($record['slug'] ?? $record['id'] ?? ''));
        } elseif ($item['source_table'] === 'quiz_subjects') {
            $cloudOk = firestoreDeleteDoc('quiz_subjects', (string) ($record['id'] ?? ''));
        }
        if (!$cloudOk && in_array($item['source_table'], ['quiz_questions', 'quiz_parts', 'quiz_subjects'], true)) {
            $flash = ['type' => 'danger', 'msg' => 'تعذر التأكد من الحذف من الموقع الرسمي؛ بقي السجل في الأرشيف.'];
        } else {
            $db->prepare('DELETE FROM deleted_records WHERE id = ?')->execute([$id]);
            log_activity("حذف نهائي للسجل المؤرشف #{$id} من {$item['source_table']}", 'deleted_records');
            $flash = ['type' => 'success', 'msg' => 'تم الحذف النهائي من الأرشيف والموقع الرسمي.'];
        }
    }
}

$records = $db->query('SELECT * FROM deleted_records ORDER BY deleted_at DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC);
require __DIR__ . '/_header.php';
?>
<div class="panel-box">
    <div class="panel-box-header" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div>
            <h3 class="panel-box-title">🗑️ المحذوفات والأرشيف</h3>
            <p style="margin:6px 0 0;color:#64748b;font-size:13px;">كل ما يتم حذفه من النظام يحفظ هنا أولا. الاستعادة
                متاحة للمدير العام، والحذف النهائي غير قابل للتراجع.</p>
        </div>
        <span class="badge badge-warning"><?= count($records) ?> سجل</span>
    </div>
    <?php if ($flash): ?>
        <div class="alert alert-<?= htmlspecialchars($flash['type']) ?>" style="margin:16px;">
            <?= htmlspecialchars($flash['msg']) ?>
        </div><?php endif; ?>
    <div class="panel-box-body" style="padding:0;overflow-x:auto;">
        <table class="data-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>نوع السجل</th>
                    <th>المعرّف</th>
                    <th>سبب الحذف</th>
                    <th>بواسطة</th>
                    <th>تاريخ الحذف</th>
                    <th>التفاصيل</th>
                    <th>الإجراءات</th>
                </tr>
            </thead>
            <tbody>
                <?php if (!$records): ?>
                    <tr>
                        <td colspan="8" style="text-align:center;padding:40px;color:#64748b;">لا توجد سجلات محذوفة حاليا.
                        </td>
                    </tr><?php endif; ?>
                <?php foreach ($records as $record): ?>
                    <tr>
                        <td>#<?= (int) $record['id'] ?></td>
                        <td><strong><?= htmlspecialchars($record['source_table']) ?></strong></td>
                        <td><?= htmlspecialchars((string) ($record['source_id'] ?? '')) ?></td>
                        <td><?= htmlspecialchars($record['reason'] ?? 'حذف') ?></td>
                        <td><?= htmlspecialchars($record['deleted_by_name'] ?? 'system') ?></td>
                        <td><?= htmlspecialchars($record['deleted_at']) ?></td>
                        <td>
                            <details>
                                <summary style="cursor:pointer;color:#2563eb;">عرض السجل</summary>
                                <pre
                                    style="max-width:420px;max-height:180px;overflow:auto;white-space:pre-wrap;direction:ltr;text-align:left;font-size:11px;"><?= htmlspecialchars(json_encode(json_decode($record['record_json'], true), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)) ?></pre>
                            </details>
                        </td>
                        <td style="white-space:nowrap;">
                            <form method="post" style="display:inline" onsubmit="return confirm('استعادة هذا السجل؟');">
                                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>"><input
                                    type="hidden" name="id" value="<?= (int) $record['id'] ?>"><input type="hidden"
                                    name="action" value="restore">
                                <button class="btn btn-primary" type="submit">استعادة</button>
                            </form>
                            <form method="post" style="display:inline"
                                onsubmit="return confirm('تحذير: سيتم حذف السجل نهائيا ولا يمكن استعادته. متابعة؟');">
                                <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token()) ?>"><input
                                    type="hidden" name="id" value="<?= (int) $record['id'] ?>"><input type="hidden"
                                    name="action" value="purge">
                                <button class="btn btn-danger" type="submit">حذف نهائي</button>
                            </form>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
</div>
<?php require __DIR__ . '/_footer.php'; ?>