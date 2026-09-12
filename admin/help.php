<?php
$page_key = '';
$page_title = 'مركز المساعدة';
require __DIR__ . '/_header.php';
?>

<div class="panel-box help-page">
    <div class="panel-box-header">
        <h2 class="panel-box-title">مركز المساعدة</h2>
    </div>
    <div class="panel-box-body">
        <p class="help-intro">مرجع سريع لإنجاز أهم العمليات داخل لوحة التحكم.</p>
        <div class="help-grid">
            <article class="help-card">
                <h3>البلاغات</h3>
                <p>افتح البلاغ، راجع سبب المشكلة، ثم حدّث الحالة إلى تم الحل أو مستبعد بعد التحقق.</p>
                <a href="reports.php">فتح البلاغات</a>
            </article>
            <article class="help-card">
                <h3>التبرعات والحجوزات</h3>
                <p>راجع المواد الجديدة، تابع حالة الحجز، وسجّل مواعيد التسليم من قسم تبادل المواد.</p>
                <a href="donations.php">فتح تبادل المواد</a>
            </article>
            <article class="help-card">
                <h3>الاختبارات</h3>
                <p>استخدم بنك الاختبارات لإضافة الأسئلة وتعديلها ومراجعة سجل التغييرات.</p>
                <a href="tests.php">فتح الاختبارات</a>
            </article>
            <article class="help-card">
                <h3>الأمان</h3>
                <p>حدّث كلمة المرور وفعّل المصادقة الثنائية لحماية حساب الإدارة.</p>
                <a href="two_factor.php">إدارة 2FA</a>
            </article>
        </div>
    </div>
</div>

<?php require __DIR__ . '/_footer.php'; ?>