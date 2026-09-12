<?php
// نقطة دخول قديمة تبقى للتوافق: تحوّل مباشرة إلى لوحة التحكم الداخلية
require __DIR__ . '/config.php';
if (empty($_SESSION['authenticated'])) {
    redirect('login.php');
}
redirect('admin/donations.php');
