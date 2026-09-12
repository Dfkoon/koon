<?php
/**
 * captcha_image.php
 * يولّد صورة كابتشا ويخزّن النص الصحيح في الجلسة تحت $_SESSION['captcha']
 * يُستدعى من داخل <img src="captcha_image.php?...">
 */
require __DIR__ . '/config.php';

if (!extension_loaded('gd')) {
    http_response_code(500);
    die('GD extension غير مفعّلة على السيرفر.');
}

$chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون أحرف/أرقام ملتبسة
$length = 5;
$code = '';
for ($i = 0; $i < $length; $i++) {
    $code .= $chars[random_int(0, strlen($chars) - 1)];
}
$_SESSION['captcha'] = $code;
$_SESSION['captcha_time'] = time();

$width = 160;
$height = 60;
$image = imagecreatetruecolor($width, $height);

$bg = imagecolorallocate($image, 255, 255, 255);
imagefill($image, 0, 0, $bg);

// خطوط تشويش
for ($i = 0; $i < 6; $i++) {
    $lineColor = imagecolorallocate($image, random_int(150, 200), random_int(150, 200), random_int(150, 200));
    imageline($image, random_int(0, $width), random_int(0, $height), random_int(0, $width), random_int(0, $height), $lineColor);
}

$colors = [
    imagecolorallocate($image, 220, 50, 50),
    imagecolorallocate($image, 40, 90, 200),
    imagecolorallocate($image, 30, 150, 90),
    imagecolorallocate($image, 200, 130, 30),
];

$fontSize = 6;
$x = 15;
foreach (str_split($code) as $ch) {
    $color = $colors[array_rand($colors)];
    $y = random_int(15, 25);
    imagestring($image, $fontSize, $x, $y, $ch, $color);
    $x += 25;
}

// نقاط تشويش إضافية
for ($i = 0; $i < 150; $i++) {
    $dotColor = imagecolorallocate($image, random_int(180, 220), random_int(180, 220), random_int(180, 220));
    imagesetpixel($image, random_int(0, $width), random_int(0, $height), $dotColor);
}

header('Content-Type: image/png');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
imagepng($image);
