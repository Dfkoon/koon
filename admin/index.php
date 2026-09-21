<?php
require_once __DIR__ . '/../config.php';
if (empty($_SESSION['authenticated'])) {
    redirect('../login.php');
}
redirect('stats.php');
