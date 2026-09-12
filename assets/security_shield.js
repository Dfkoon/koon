/**
 * assets/security_shield.js
 * درع الحماية المتقدم ومنع التسريب والتقاط الشاشة — منصة مكانك
 * Advanced DLP: Dynamic Forensic Watermark + Screen Capture Shield + Anti-Copy/Print
 */

(function () {
    'use strict';

    // قراءة بيانات المستخدم الممررة من الصفحة
    const secConfig = window.__SECURITY_SHIELD_CONFIG || {
        username: 'User',
        fullName: 'Member',
        ip: '127.0.0.1',
        time: new Date().toLocaleString('ar-JO'),
        watermarkEnabled: true,
        antiCaptureEnabled: true
    };

    /* ============================================================
       1. إنشاء العلامة المائية الديناميكية الجنائية (Forensic Watermark)
       ============================================================ */
    function injectSecurityWatermark() {
        if (!secConfig.watermarkEnabled) return;

        // إزالة أي علامة سابقة إن وجدت
        const old = document.getElementById('security-watermark-overlay');
        if (old) old.remove();

        const watermarkDiv = document.createElement('div');
        watermarkDiv.id = 'security-watermark-overlay';

        const watermarkText = `${secConfig.fullName} (@${secConfig.username}) · IP: ${secConfig.ip} · ${secConfig.time}`;

        // إنشاء SVG مكرر بنمط مائل
        const svgPattern = `
            <svg xmlns='http://www.w3.org/2000/svg' width='360' height='160' viewBox='0 0 360 160'>
                <text x='20' y='80' fill='rgba(15, 23, 42, 0.045)' font-size='11.5' font-family='Tajawal, sans-serif' font-weight='700' transform='rotate(-18 180 80)' text-anchor='middle'>
                    ${watermarkText}
                </text>
            </svg>
        `;
        const encodedSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgPattern);

        watermarkDiv.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            pointer-events: none !important;
            z-index: 999998 !important;
            background-image: url("${encodedSvg}") !important;
            background-repeat: repeat !important;
            opacity: 1 !important;
            display: block !important;
        `;

        document.body.appendChild(watermarkDiv);

        // حماية طبقة العلامة المائية من الحذف أو التعديل عبر أدوات الفحص
        const observer = new MutationObserver(() => {
            const el = document.getElementById('security-watermark-overlay');
            if (!el || el.style.display === 'none' || el.style.opacity === '0') {
                injectSecurityWatermark();
            }
        });
        observer.observe(document.body, { childList: true, attributes: true, subtree: true });
    }

    /* ============================================================
       2. درع الطمس الفوري عند محاولة لقطة الشاشة (Screen Blur Shield)
       ============================================================ */
    let isShieldActive = false;
    let shieldOverlay = null;

    function createShieldOverlay() {
        if (shieldOverlay) return shieldOverlay;
        shieldOverlay = document.createElement('div');
        shieldOverlay.id = 'screen-capture-blocker-overlay';
        shieldOverlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background: rgba(15, 23, 42, 0.96) !important;
            backdrop-filter: blur(28px) !important;
            -webkit-backdrop-filter: blur(28px) !important;
            z-index: 999999 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: center !important;
            color: #ffffff !important;
            text-align: center !important;
            padding: 24px !important;
            transition: opacity 0.2s ease !important;
            opacity: 0;
            pointer-events: auto !important;
        `;

        shieldOverlay.innerHTML = `
            <div style="width:72px; height:72px; background:rgba(239, 68, 68, 0.18); border:2px solid #ef4444; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#ef4444" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h2 style="font-family:'Cairo',sans-serif; font-size:22px; font-weight:900; margin:0 0 8px; color:#ffffff;">
                ⚠️ محتوى محمي ضد الالتقاط والتصوير
            </h2>
            <p style="font-size:13.5px; color:#cbd5e1; max-width:440px; margin:0 0 16px; line-height:1.6;">
                تم حجب الشاشة لحماية سرية وخصوصية البيانات الأكاديمية بالمنصة بموجب سياسات الأمان.
            </p>
            <div style="font-size:11.5px; background:rgba(255,255,255,0.08); padding:6px 14px; border-radius:20px; color:#94a3b8; font-family:'IBM Plex Mono',monospace;">
                USER: ${secConfig.username} · SESSION LOGGED
            </div>
        `;

        document.body.appendChild(shieldOverlay);
        return shieldOverlay;
    }

    function triggerCaptureShield(durationMs = 2800) {
        if (!secConfig.antiCaptureEnabled) return;
        const shield = createShieldOverlay();
        shield.style.opacity = '1';
        isShieldActive = true;

        // مسح الحافظة Clipboard لمنع لصق أي صورة مأخوذة
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('Security Protected Screen — Makanak Platform').catch(() => {});
        }

        setTimeout(() => {
            shield.style.opacity = '0';
            setTimeout(() => {
                shield.remove();
                shieldOverlay = null;
                isShieldActive = false;
            }, 250);
        }, durationMs);
    }

    /* ============================================================
       3. رصد واعتراض اختصارات التقاط الشاشة والمطورين والطباعة
       ============================================================ */
    function initKeyboardGuards() {
        window.addEventListener('keydown', function (e) {
            const key = e.key ? e.key.toLowerCase() : '';
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;

            // 1. زر PrintScreen على ويندوز
            if (e.key === 'PrintScreen' || e.keyCode === 44) {
                e.preventDefault();
                triggerCaptureShield(3000);
                return false;
            }

            // 2. اختصارات لقطة الشاشة على ماك (Cmd+Shift+3 / 4 / 5)
            if (e.metaKey && e.shiftKey && ['3', '4', '5', '#', '$', '%'].includes(e.key)) {
                triggerCaptureShield(3500);
                return;
            }

            // 3. اختصار قص الشاشة على ويندوز (Windows + Shift + S)
            if (e.shiftKey && isCtrlOrCmd && key === 's') {
                e.preventDefault();
                triggerCaptureShield(3000);
                return false;
            }

            // 4. منع الطباعة (Ctrl+P / Cmd+P)
            if (isCtrlOrCmd && key === 'p') {
                e.preventDefault();
                alert('⚠️ طباعة محتوى لوحة التحكم غير مصرح بها لحماية خصوصية البيانات.');
                return false;
            }

            // 5. منع حفظ الصفحة (Ctrl+S / Cmd+S)
            if (isCtrlOrCmd && key === 's') {
                e.preventDefault();
                return false;
            }

            // 6. منع عرض السورس كود (Ctrl+U / Cmd+U)
            if (isCtrlOrCmd && key === 'u') {
                e.preventDefault();
                return false;
            }

            // 7. منع فتح أدوات المطورين (F12 أو Ctrl+Shift+I / J / C)
            if (
                e.key === 'F12' ||
                (isCtrlOrCmd && e.shiftKey && ['i', 'j', 'c'].includes(key)) ||
                (e.altKey && isCtrlOrCmd && key === 'i')
            ) {
                e.preventDefault();
                return false;
            }
        }, true);

        // رصد محاولة PrintScreen عبر keyup أيضاً
        window.addEventListener('keyup', function (e) {
            if (e.key === 'PrintScreen' || e.keyCode === 44) {
                triggerCaptureShield(3000);
            }
        });
    }

    /* ============================================================
       4. حظر زر الفأرة الأيمن ومنع النسخ والتحديد
       ============================================================ */
    function initContextMenuAndCopyGuards() {
        // حظر زر الفأرة الأيمن
        document.addEventListener('contextmenu', function (e) {
            // السماح في حقول الإدخال لتسهيل الكتابة، ومنعه في باقي الصفحة
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                return true;
            }
            e.preventDefault();
            return false;
        });

        // حظر سحب الصور أو النصوص
        document.addEventListener('dragstart', function (e) {
            e.preventDefault();
            return false;
        });
    }

    /* ============================================================
       5. طمس الشاشة عند الطباعة أو مغادرة التبويب (Tab Focus Switch)
       ============================================================ */
    function initBlurGuards() {
        window.addEventListener('beforeprint', function () {
            document.body.style.display = 'none';
        });
        window.addEventListener('afterprint', function () {
            document.body.style.display = 'block';
        });
    }

    /* ============================================================
       تشغيل وحدات الحماية عند تحميل الصفحة
       ============================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            injectSecurityWatermark();
            initKeyboardGuards();
            initContextMenuAndCopyGuards();
            initBlurGuards();
        });
    } else {
        injectSecurityWatermark();
        initKeyboardGuards();
        initContextMenuAndCopyGuards();
        initBlurGuards();
    }

})();
