</main>

<!-- ════════════════════════════════════════════════════════════
     شريط حقوق الملكية — لوحة مكانك الجامعي
     ════════════════════════════════════════════════════════════ -->
<footer class="site-copyright-bar" role="contentinfo" aria-label="حقوق الملكية">
    <div class="copyright-inner">

        <div class="copyright-brand">
            <svg class="copyright-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                aria-hidden="true">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <div class="copyright-text-group">
                <span class="copyright-platform-name">لوحة مكانك الجامعي</span>
                <span class="copyright-legal">
                    &copy; <?= date('Y') ?> جميع الحقوق محفوظة &mdash; يُحظر النسخ أو التوزيع بدون إذن مسبق.
                </span>
            </div>
        </div>

        <div class="copyright-meta">
            <span class="copyright-badge cb-shield">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"
                    aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                محمي بموجب قوانين الملكية
            </span>
            <span class="copyright-badge cb-lock">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"
                    aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                للاستخدام الداخلي فقط
            </span>
        </div>

    </div>
</footer>

<style>
    /* ════════════════════════════════════════════════════════════
   شريط حقوق الملكية — White Glassmorphism
   ════════════════════════════════════════════════════════════ */
    .site-copyright-bar {
        margin-top: auto;
        background: rgba(255, 255, 255, 0.72);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-top: 1px solid rgba(203, 213, 225, 0.55);
        padding: 11px 28px;
        font-family: 'IBM Plex Sans Arabic', 'Noto Kufi Arabic', sans-serif;
        direction: rtl;
    }

    .copyright-inner {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
    }

    .copyright-brand {
        display: flex;
        align-items: center;
        gap: 9px;
        flex: 1;
        min-width: 0;
    }

    .copyright-logo-icon {
        width: 18px;
        height: 18px;
        color: #1B3A8A;
        flex-shrink: 0;
        opacity: 0.75;
    }

    .copyright-text-group {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
    }

    .copyright-platform-name {
        font-family: 'Noto Kufi Arabic', sans-serif;
        font-size: 12.5px;
        font-weight: 800;
        color: #1B3A8A;
        white-space: nowrap;
    }

    .copyright-legal {
        font-size: 10.5px;
        color: #94a3b8;
        line-height: 1.4;
        font-weight: 400;
    }

    .copyright-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
    }

    .copyright-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 10px;
        font-weight: 600;
        padding: 3px 9px;
        border-radius: 20px;
        white-space: nowrap;
        font-family: 'IBM Plex Sans Arabic', sans-serif;
    }

    .cb-shield {
        background: rgba(27, 58, 138, 0.07);
        color: #1B3A8A;
        border: 1px solid rgba(27, 58, 138, 0.18);
    }

    .cb-lock {
        background: rgba(100, 116, 139, 0.07);
        color: #64748b;
        border: 1px solid rgba(100, 116, 139, 0.18);
    }

    /* التوافق مع الوضع الليلي عند التفعيل */
    body.admin-dark-mode .site-copyright-bar {
        background: rgba(15, 23, 42, 0.82);
        border-top: 1px solid rgba(51, 65, 85, 0.6);
    }

    body.admin-dark-mode .copyright-platform-name {
        color: #60a5fa;
    }

    body.admin-dark-mode .copyright-logo-icon {
        color: #60a5fa;
    }

    body.admin-dark-mode .copyright-legal {
        color: #94a3b8;
    }

    body.admin-dark-mode .cb-shield {
        background: rgba(96, 165, 250, 0.12);
        color: #93c5fd;
        border-color: rgba(96, 165, 250, 0.25);
    }

    body.admin-dark-mode .cb-lock {
        background: rgba(148, 163, 184, 0.12);
        color: #cbd5e1;
        border-color: rgba(148, 163, 184, 0.25);
    }

    @media (max-width: 768px) {
        .site-copyright-bar {
            padding: 10px 16px;
        }

        .copyright-inner {
            gap: 8px;
        }

        .copyright-text-group {
            flex-direction: column;
            gap: 2px;
            align-items: flex-start;
        }
    }
</style>

</div>
</div>

<!-- ============================================================
     نافذة البحث السريع السحرية (Command Palette - Ctrl+K)
     ============================================================ -->
<div class="quick-search-overlay" id="quickSearchOverlay" onclick="closeQuickSearchOnBackdrop(event)">
    <div class="quick-search-box" id="quickSearchBox">
        <div class="quick-search-header">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#0284c7" stroke-width="2.2"
                stroke-linecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" id="quickSearchInput" class="quick-search-input"
                placeholder="ابحث عن مادة، كتاب، طالب، منسق، أو صفحة في النظام..." autocomplete="off"
                spellcheck="false">
            <button type="button" class="quick-search-clear-btn" onclick="closeQuickSearchModal()" title="إغلاق (Esc)">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>

        <div class="quick-search-results" id="quickSearchResults">
            <!-- سيتم ملؤها عبر JavaScript -->
            <div style="padding:20px; text-align:center; color:#94a3b8; font-size:13px;">
                جاري تحميل النتائج السريعة...
            </div>
        </div>

        <div class="quick-search-footer">
            <div class="quick-search-keys">
                <span class="quick-search-key-item"><kbd>↑</kbd> <kbd>↓</kbd> للتنقل</span>
                <span class="quick-search-key-item"><kbd>↵</kbd> للفتح</span>
                <span class="quick-search-key-item"><kbd>Esc</kbd> للإغلاق</span>
            </div>
            <div style="font-weight:700; color:#0284c7; font-size:11.5px;">منصة مكانك ⚡</div>
        </div>
    </div>
</div>

<script>
    function toggleUserDropdown(e) {
        e.stopPropagation();
        const dropdown = document.getElementById('userDropdownMenu');
        if (dropdown) {
            dropdown.classList.toggle('show');
        }
    }

    function applyAdminTheme(theme) {
        const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.adminTheme = resolvedTheme;
        document.body.classList.toggle('admin-dark-mode', resolvedTheme === 'dark');
        document.body.classList.toggle('admin-light-mode', resolvedTheme === 'light');
        const label = document.getElementById('adminThemeLabel');
        if (label) label.textContent = resolvedTheme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
        const toggle = document.getElementById('adminThemeToggle');
        if (toggle) toggle.setAttribute('aria-pressed', resolvedTheme === 'dark' ? 'true' : 'false');
    }

    function toggleAdminTheme(event) {
        if (event) event.stopPropagation();
        const nextTheme = document.body.classList.contains('admin-dark-mode') ? 'light' : 'dark';
        localStorage.setItem('makanak-admin-theme', nextTheme);
        applyAdminTheme(nextTheme);
    }

    (function initializeAdminTheme() {
        const savedTheme = localStorage.getItem('makanak-admin-theme');
        const preferredTheme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
        applyAdminTheme(preferredTheme);
    })();

    document.addEventListener('click', function (e) {
        const dropdown = document.getElementById('userDropdownMenu');
        const btn = document.querySelector('.topbar-user-btn');
        if (dropdown && !dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });

    /* ---------- محرك البحث السريع السحري (Command Palette Engine) ---------- */
    let quickSearchDebounceTimer = null;
    let currentSearchSelectedIndex = 0;
    let currentSearchItems = [];

    function openQuickSearchModal() {
        const overlay = document.getElementById('quickSearchOverlay');
        const input = document.getElementById('quickSearchInput');
        if (!overlay || !input) return;

        overlay.classList.add('show');
        input.value = '';
        input.focus();
        fetchQuickSearchResults('');
    }

    function closeQuickSearchModal() {
        const overlay = document.getElementById('quickSearchOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    function closeQuickSearchOnBackdrop(e) {
        if (e.target.id === 'quickSearchOverlay') {
            closeQuickSearchModal();
        }
    }

    // الاستماع لاختصارات لوحة المفاتيح العالمية (Ctrl+K / Cmd+K / Esc)
    document.addEventListener('keydown', function (e) {
        // فتح المودال عند الضغط على Ctrl+K أو Cmd+K
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            const overlay = document.getElementById('quickSearchOverlay');
            if (overlay && overlay.classList.contains('show')) {
                closeQuickSearchModal();
            } else {
                openQuickSearchModal();
            }
            return;
        }

        const overlay = document.getElementById('quickSearchOverlay');
        if (!overlay || !overlay.classList.contains('show')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            closeQuickSearchModal();
            return;
        }

        // التنقل بالأسهم داخل النتائج
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigateSearchResults(1);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigateSearchResults(-1);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const activeItem = document.querySelector('.quick-search-item.active');
            if (activeItem && activeItem.getAttribute('href')) {
                window.location.href = activeItem.getAttribute('href');
            }
            return;
        }
    });

    const searchInputEl = document.getElementById('quickSearchInput');
    if (searchInputEl) {
        searchInputEl.addEventListener('input', function () {
            const q = this.value.trim();
            clearTimeout(quickSearchDebounceTimer);
            quickSearchDebounceTimer = setTimeout(() => {
                fetchQuickSearchResults(q);
            }, 150);
        });
    }

    function fetchQuickSearchResults(query) {
        const resultsContainer = document.getElementById('quickSearchResults');
        if (!resultsContainer) return;

        fetch('api_quick_search.php?q=' + encodeURIComponent(query))
            .then(res => res.json())
            .then(data => {
                renderQuickSearchResults(data.results || [], query);
            })
            .catch(err => {
                resultsContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#ef4444; font-size:13px;">تعذر تحميل نتائج البحث.</div>';
            });
    }

    function renderQuickSearchResults(items, query) {
        const container = document.getElementById('quickSearchResults');
        if (!container) return;

        currentSearchItems = items;
        currentSearchSelectedIndex = 0;

        if (items.length === 0) {
            container.innerHTML = `
            <div style="padding:32px 20px; text-align:center; color:#94a3b8;">
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#cbd5e1" stroke-width="1.8" style="margin:0 auto 10px; display:block;">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <div style="font-weight:700; color:#64748b; font-size:14px;">لم يتم العثور على نتائج تطابق "${escapeHtml(query)}"</div>
                <div style="font-size:12px; margin-top:4px;">جرّب البحث باسم مادة أخرى، أو رقم هاتف، أو اسم منسق</div>
            </div>`;
            return;
        }

        // تجميع النتائج حسب التصنيف
        const grouped = {};
        items.forEach((item, index) => {
            const cat = item.category || 'عام';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push({ item, globalIndex: index });
        });

        let html = '';
        let flatIdx = 0;

        for (const [catName, catItems] of Object.entries(grouped)) {
            html += `<div class="quick-search-category-title">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            ${escapeHtml(catName)}
        </div>`;

            catItems.forEach(({ item, globalIndex }) => {
                const isActive = (globalIndex === 0) ? 'active' : '';
                html += `
            <a href="${escapeHtml(item.url)}" class="quick-search-item ${isActive}" data-index="${globalIndex}">
                <div class="quick-search-item-info">
                    <div class="quick-search-item-title">${escapeHtml(item.title)}</div>
                    <div class="quick-search-item-sub">${escapeHtml(item.subtitle)}</div>
                </div>
                ${item.badge ? `<span class="quick-search-item-badge">${escapeHtml(item.badge)}</span>` : ''}
            </a>`;
            });
        }

        container.innerHTML = html;

        // إضافة أحداث الماوس لتحديد العنصر النشط
        container.querySelectorAll('.quick-search-item').forEach(el => {
            el.addEventListener('mouseenter', function () {
                container.querySelectorAll('.quick-search-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                currentSearchSelectedIndex = parseInt(this.getAttribute('data-index') || '0', 10);
            });
        });
    }

    function navigateSearchResults(direction) {
        const items = document.querySelectorAll('.quick-search-item');
        if (items.length === 0) return;

        items[currentSearchSelectedIndex]?.classList.remove('active');

        currentSearchSelectedIndex += direction;
        if (currentSearchSelectedIndex < 0) {
            currentSearchSelectedIndex = items.length - 1;
        } else if (currentSearchSelectedIndex >= items.length) {
            currentSearchSelectedIndex = 0;
        }

        const nextActive = items[currentSearchSelectedIndex];
        if (nextActive) {
            nextActive.classList.add('active');
            nextActive.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /* ============================================================
       محرك الإشعارات الحية والتنبيه الصوتي (Real-Time Audio Notifications)
       ============================================================ */
    let lastKnownNotificationId = null;
    let liveNotificationsTimer = null;

    // نغمة تنبيه صوتية لطيفة ونقية عبر Web Audio API
    function playNotificationChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            if (ctx.state === 'suspended') {
                ctx.resume();
            }

            const now = ctx.currentTime;

            // النغمة الأولى (Tone 1: 587.33 Hz - D5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.15, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.35);

            // النغمة الثانية المرتفعة (Tone 2: 880 Hz - A5)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880, now + 0.12);
            gain2.gain.setValueAtTime(0.18, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.55);
        } catch (e) {
            console.log('Audio chime error:', e);
        }
    }

    // عرض إشعار عائم Toast في زاوية الشاشة
    function showNotificationToast(notification) {
        let container = document.getElementById('liveToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'liveToastContainer';
            container.style.cssText = 'position:fixed; bottom:24px; left:24px; z-index:99999; display:flex; flex-direction:column; gap:10px; max-width:360px; width:calc(100vw - 48px); pointer-events:none;';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.style.cssText = 'background:#ffffff; border-right:4px solid #0284c7; border-radius:14px; padding:14px 16px; box-shadow:0 12px 30px rgba(0,0,0,0.16), 0 0 0 1px rgba(226,232,240,0.8); pointer-events:auto; display:flex; align-items:flex-start; gap:12px; transform:translateY(20px); opacity:0; transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1); cursor:pointer;';

        toast.innerHTML = `
        <div style="width:36px; height:36px; border-radius:10px; background:#e0f2fe; color:#0284c7; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
        </div>
        <div style="flex:1; min-width:0;">
            <div style="font-weight:800; font-size:13.5px; color:#0f172a;">${escapeHtml(notification.title)}</div>
            <div style="font-size:12px; color:#64748b; margin-top:2px; line-height:1.4;">${escapeHtml(notification.message)}</div>
        </div>
        <button type="button" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:0;" onclick="event.stopPropagation(); this.closest('div[style]').remove();">✕</button>
    `;

        toast.onclick = function () {
            if (notification.target_url) {
                window.location.href = notification.target_url;
            }
        };

        container.appendChild(toast);

        // تفعيل الظهور بالحركة
        setTimeout(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        }, 20);

        // الإخفاء التلقائي بعد 7 ثوانٍ
        setTimeout(() => {
            toast.style.transform = 'translateY(20px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 350);
        }, 7000);
    }

    // دالة فحص الإشعارات الحية في الخلفية
    function pollLiveNotifications() {
        fetch('api_live_notifications.php')
            .then(res => res.json())
            .then(data => {
                if (data.status !== 'success') return;

                const list = document.getElementById('adminNotificationsList');

                // تحديث قائمة الإشعارات في الدروب داون
                if (list && data.notifications) {
                    if (data.notifications.length === 0) {
                        list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#94a3b8;font-size:13px;">لا توجد إشعارات حتى الآن</div>';
                    } else {
                        list.innerHTML = data.notifications.map(n => `
                        <a href="${escapeHtml(n.target_url)}"
                            style="display:block;padding:12px 16px;text-decoration:none;border-bottom:1px solid #f1f5f9;background:${n.is_read ? '#fff' : '#f0f9ff'};transition:background .15s;">
                            <div style="font-weight:700;color:#1e293b;font-size:13px;display:flex;align-items:center;justify-content:space-between;">
                                <span>${escapeHtml(n.title)}</span>
                                ${!n.is_read ? '<span style="width:7px;height:7px;border-radius:50%;background:#0284c7;display:inline-block;"></span>' : ''}
                            </div>
                            <div style="margin-top:3px;color:#64748b;font-size:12px;line-height:1.4;">
                                ${escapeHtml(n.message)}
                            </div>
                        </a>
                    `).join('');
                    }
                }

                // إذا ورد إشعار جديد لم يكن معروفاً من قبل
                if (lastKnownNotificationId !== null && data.latest_id > lastKnownNotificationId) {
                    const newItems = (data.notifications || []).filter(n => n.id > lastKnownNotificationId && !n.is_read);
                    if (newItems.length > 0) {
                        playNotificationChime();
                        newItems.slice(0, 2).forEach(item => showNotificationToast(item));
                    }
                }
                lastKnownNotificationId = data.latest_id;
            })
            .catch(err => { });
    }

    function markAllNotificationsRead(event) {
        if (event) event.stopPropagation();
        fetch('api_live_notifications.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=mark_all_read&csrf=<?= rawurlencode(csrf_token()) ?>'
        })
            .then(res => res.json())
            .then(() => {
                pollLiveNotifications();
            });
    }

    // بدء الفحص الحي كل 15 ثانية
    document.addEventListener('DOMContentLoaded', function () {
        pollLiveNotifications();
        liveNotificationsTimer = setInterval(pollLiveNotifications, 15000);
    });
</script>
</body>

</html>