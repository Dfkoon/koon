import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

const ReportModal = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [reportDetails, setReportDetails] = useState(null);

    // Helpers
    const normalizePhoneNumber = (raw) => {
        if (!raw) return '';
        return String(raw).replace(/\D/g, '');
    };

    const matchesPhone = (phone1, phone2) => {
        if (!phone1 || !phone2) return false;
        const clean1 = String(phone1).replace(/\D/g, '');
        const clean2 = String(phone2).replace(/\D/g, '');
        if (clean1 === clean2) return true;
        
        const suffix1 = clean1.startsWith('962') ? clean1.substring(3) : clean1.startsWith('0') ? clean1.substring(1) : clean1;
        const suffix2 = clean2.startsWith('962') ? clean2.substring(3) : clean2.startsWith('0') ? clean2.substring(1) : clean2;
        return suffix1 === suffix2;
    };

    const formatReportDate = (value) => {
        if (!value || value === '—') return '—';
        try {
            const date = typeof value === 'object' && value.seconds
                ? new Date(value.seconds * 1000)
                : new Date(value);
            
            if (isNaN(date.getTime())) return String(value);

            return date.toLocaleDateString('ar-JO', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
        } catch {
            return String(value);
        }
    };

    const formatReportDateTime = (value) => {
        if (!value || value === '—') return '—';
        try {
            const date = typeof value === 'object' && value.seconds
                ? new Date(value.seconds * 1000)
                : new Date(value);
            
            if (isNaN(date.getTime())) return String(value);
            
            let hours = date.getHours();
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'م' : 'ص';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const timeStr = `${hours}:${minutes} ${ampm}`;
            
            const dateStr = date.toLocaleDateString('ar-JO', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            return `${dateStr} - ${timeStr}`;
        } catch {
            return String(value);
        }
    };

    const hashCode = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return Math.abs(hash) % 1000000;
    };

    useEffect(() => {
        const fetchReportData = async () => {
            setLoading(true);
            try {
                // Parse query parameters from hash URL
                const hash = window.location.hash;
                const queryString = hash.includes('?') ? hash.split('?')[1] : '';
                const searchParams = new URLSearchParams(queryString);
                const rawPhone = searchParams.get('phone') || '';
                const reportType = searchParams.get('type') || 'donor';

                const targetPhone = normalizePhoneNumber(rawPhone);

                // Fetch all donations from Firebase
                const querySnapshot = await getDocs(collection(db, 'materialDonations'));
                const allDonations = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                let donatedCount = 0;
                let reservedCount = 0;
                let deliveredCount = 0;
                const items = [];
                let earliestDate = null;
                let studentName = '—';
                let hasActiveBooking = false;

                allDonations.forEach(donation => {
                    const isDonor = matchesPhone(donation.phoneNumber, targetPhone);

                    if (isDonor) {
                        if (studentName === '—' && donation.studentName) {
                            studentName = donation.studentName;
                        }
                        const donDate = donation.createdAt;
                        if (donDate) {
                            const dateObj = donDate.seconds ? new Date(donDate.seconds * 1000) : new Date(donDate);
                            if (!earliestDate || dateObj < earliestDate) {
                                earliestDate = dateObj;
                            }
                        }

                        if (donation.materials && Array.isArray(donation.materials)) {
                            donation.materials.forEach((m) => {
                                const status = m.status || donation.status;
                                const actionDate = donation.createdAt;
                                
                                if (status === 'pending' || status === 'approved') {
                                    donatedCount++;
                                    items.push({
                                        name: m.name,
                                        classification: 'مادة مختبرع بها',
                                        actionDate: actionDate,
                                        deliveryDate: '—',
                                        statusText: 'متاح',
                                        badgeClass: 'donated'
                                    });
                                } else if (status === 'reserved') {
                                    reservedCount++;
                                    items.push({
                                        name: m.name,
                                        classification: 'مادة مختبرع بها',
                                        actionDate: m.takerInfo?.bookedAt || donation.lastUpdated || actionDate,
                                        deliveryDate: '—',
                                        statusText: 'بانتظار التسليم',
                                        badgeClass: 'reserved'
                                    });
                                } else if (status === 'completed') {
                                    deliveredCount++;
                                    items.push({
                                        name: m.name,
                                        classification: 'مادة مختبرع بها',
                                        actionDate: m.takerInfo?.bookedAt || actionDate,
                                        deliveryDate: m.takerInfo?.deliveredAt || donation.lastUpdated || actionDate,
                                        statusText: 'تم التسليم',
                                        badgeClass: 'delivered'
                                    });
                                }
                            });
                        }
                    }

                    // Check if student is the taker/booker
                    if (donation.materials && Array.isArray(donation.materials)) {
                        donation.materials.forEach((m) => {
                            if (m.takerInfo && matchesPhone(m.takerInfo.phone, targetPhone)) {
                                if (studentName === '—' && m.takerInfo.name) {
                                    studentName = m.takerInfo.name;
                                }
                                const bookedDate = m.takerInfo.bookedAt || donation.lastUpdated || donation.createdAt;
                                if (bookedDate) {
                                    const dateObj = bookedDate.seconds ? new Date(bookedDate.seconds * 1000) : new Date(bookedDate);
                                    if (!earliestDate || dateObj < earliestDate) {
                                        earliestDate = dateObj;
                                    }
                                }

                                const status = m.status;
                                if (status === 'reserved') {
                                    reservedCount++;
                                    hasActiveBooking = true;
                                    items.push({
                                        name: m.name,
                                        classification: 'مادة محجوز',
                                        actionDate: bookedDate,
                                        deliveryDate: '—',
                                        statusText: 'بانتظار التسليم',
                                        badgeClass: 'reserved'
                                    });
                                } else if (status === 'completed') {
                                    deliveredCount++;
                                    items.push({
                                        name: m.name,
                                        classification: 'مادة مسلَّم',
                                        actionDate: bookedDate,
                                        deliveryDate: m.takerInfo.deliveredAt || donation.lastUpdated || donation.createdAt,
                                        statusText: 'تم التسليم',
                                        badgeClass: 'delivered'
                                    });
                                }
                            }
                        });
                    }
                });

                let statusText = 'لا يوجد حجز نشط';
                if (hasActiveBooking) {
                    statusText = 'لديه حجز نشط';
                } else if (donatedCount > 0) {
                    statusText = 'مختبرع نششط';
                }

                const reportNo = rawPhone || targetPhone;
                
                setReportDetails({
                    reportNo,
                    studentName,
                    phone: rawPhone,
                    registrationDate: earliestDate ? formatReportDate(earliestDate) : '—',
                    statusText,
                    donatedCount,
                    reservedCount,
                    deliveredCount,
                    items
                });
            } catch (error) {
                console.error('Error loading report details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchReportData();
    }, [location]);

    const handlePrint = () => {
        window.print();
    };

    const handleClose = () => {
        if (window.history.length > 1) {
            navigate(-1);
        } else {
            window.close();
        }
    };

    // Build WhatsApp URL with simplified message
    const buildWhatsAppUrl = (details) => {
        if (!details) return '#';
        const phone = String(details.phone).replace(/\D/g, '');
        const normalized = phone.startsWith('0')
            ? '962' + phone.substring(1)
            : phone.startsWith('962')
            ? phone
            : '962' + phone;
        const msg = `مرحباً ${details.studentName}، معك فريق مكانك الجامعي 🎓\nنتواصل معك بصوص حمل تبادل المواد\nليك كشف بالمواد 📋\nشكراً لتعاملك معنا 💙`;
        return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F6F4EE', fontFamily: 'Tajawal, sans-serif' }}>
                <div style={{ textAlign: 'center', color: '#1B2A3C' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 12 }}>جاري تحميل الكشف...</div>
                    <div style={{ fontSize: 16, opacity: 0.7 }}>يرجى الانتظار قليلاً</div>
                </div>
            </div>
        );
    }

    if (!reportDetails) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F6F4EE', fontFamily: 'Tajawal, sans-serif' }}>
                <div style={{ textAlign: 'center', color: '#1B2A3C' }}>
                    <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 12 }}>عذراً، لم يتم العثور على بيانات الكشف</div>
                    <button className="btn primary" onClick={handleClose} style={{ marginTop: 16 }}>العود</button>
                </div>
            </div>
        );
    }

    return (
        <div className="report-container">
            <style>{`
                :root {
                    --ink: #1B2A3C;
                    --ink-light: #2E4258;
                    --gold: #C0302E;
                    --gold-soft: #FFE4E4;
                    --bg: #F6F4EE;
                    --card: #FFFFFF;
                    --slate: #5C6B7A;
                    --line: #E4E0D4;
                    --status-donated-bg: #E8F1F1;
                    --status-donated-text: #155E68;
                    --status-reserved-bg: #FBF0DC;
                    --status-reserved-text: #8A5E14;
                    --status-delivered-bg: #E9F3EB;
                    --status-delivered-text: #2E6B3F;
                }
                body {
                    background: var(--bg);
                    font-family: 'IBM Plex Sans Arabic', sans-serif;
                    color: var(--ink);
                    margin: 0;
                    padding: 0;
                }
                .report-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 36px 16px;
                    background: var(--bg);
                    min-height: 100vh;
                    direction: rtl;
                    box-sizing: border-box;
                    width: 100%;
                }
                .sheet {
                    width: 100%;
                    max-width: 880px;
                    background: var(--card);
                    border-radius: 14px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(27,42,60,0.08), 0 12px 34px rgba(27,42,60,0.10);
                    position: relative;
                    box-sizing: border-box;
                }
                .accent-bar { height: 6px; background: linear-gradient(90deg, #8B0000 0%, #C0302E 50%, rgba(192,48,46,0.25) 100%); }
                .whatsapp-link {
                    color: var(--ink);
                    text-decoration: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    transition: color 0.2s;
                }
                .whatsapp-link:hover {
                    color: #25D366;
                    text-decoration: underline;
                }
                .whatsapp-link .wa-icon {
                    font-size: 15px;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }
                .whatsapp-link:hover .wa-icon { opacity: 1; }
                
                header {
                    background: var(--ink) !important;
                    color: #fff !important;
                    padding: 28px 36px 24px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 20px;
                }
                header * {
                    color: #fff !important;
                }
                header .title-block {
                    text-align: right;
                }
                header .title-block h1 {
                    font-family: 'Tajawal', sans-serif !important;
                    font-weight: 700 !important;
                    font-size: 24px !important;
                    margin: 0 0 6px !important;
                    letter-spacing: 0.2px !important;
                    text-align: right !important;
                    color: #FFFFFF !important;
                }
                header .title-block p {
                    margin: 0 !important;
                    font-size: 13px !important;
                    color: #C7D0DA !important;
                    text-align: right !important;
                }
                header .meta {
                    text-align: left !important;
                    font-size: 12.5px !important;
                    color: #C7D0DA !important;
                    line-height: 1.9 !important;
                    white-space: nowrap !important;
                }
                header .meta div {
                    text-align: left !important;
                }
                header .meta b { color: #fff !important; font-weight: 600 !important; }
                header .meta .report-no {
                    display: inline-block !important;
                    background: rgba(255,255,255,0.08) !important;
                    border: 1px solid rgba(255,255,255,0.18) !important;
                    border-radius: 6px !important;
                    padding: 3px 10px !important;
                    font-family: 'IBM Plex Sans Arabic', sans-serif !important;
                    font-weight: 600 !important;
                    color: var(--gold-soft) !important;
                }
                .pilgrim {
                    padding: 24px 36px 8px;
                    display: flex;
                    gap: 28px;
                    flex-wrap: wrap;
                }
                .pilgrim-field { min-width: 150px; text-align: right; }
                .pilgrim-field span {
                    display: block;
                    font-size: 11.5px;
                    color: var(--slate);
                    margin-bottom: 4px;
                }
                .pilgrim-field b {
                    font-family: 'Tajawal', sans-serif;
                    font-weight: 700;
                    font-size: 17px;
                    color: var(--ink);
                }
                .stats {
                    display: grid;
                    grid-template-columns: repeat(3,1fr);
                    gap: 14px;
                    padding: 20px 36px 4px;
                }
                .stat-card {
                    border: 1px solid var(--line);
                    border-radius: 10px;
                    padding: 14px 16px;
                    text-align: center;
                    background: #FCFBF8;
                }
                .stat-card .num {
                    font-family: 'Tajawal', sans-serif;
                    font-weight: 900;
                    font-size: 26px;
                    line-height: 1;
                    margin-bottom: 6px;
                }
                .stat-card.donated .num { color: var(--status-donated-text); }
                .stat-card.reserved .num { color: var(--status-reserved-text); }
                .stat-card.delivered .num { color: var(--status-delivered-text); }
                .stat-card .lbl { font-size: 12.5px; color: var(--slate); }

                .section-title {
                    padding: 22px 36px 10px;
                    font-family: 'Tajawal', sans-serif;
                    font-weight: 700;
                    font-size: 15.5px;
                    color: var(--ink);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .section-title::before {
                    content: "";
                    width: 4px;
                    height: 16px;
                    background: var(--gold);
                    border-radius: 2px;
                    display: inline-block;
                }
                table {
                    width: calc(100% - 72px);
                    margin: 0 36px 8px;
                    border-collapse: collapse;
                    font-size: 13.5px;
                }
                thead th {
                    background: #F1EFE7;
                    color: var(--ink);
                    font-family: 'Tajawal', sans-serif;
                    font-weight: 700;
                    text-align: right;
                    padding: 11px 12px;
                    border-bottom: 2px solid var(--line);
                    white-space: nowrap;
                }
                thead th:first-child { text-align: center; width: 40px; }
                tbody td {
                    padding: 11px 12px;
                    border-bottom: 1px solid var(--line);
                    color: var(--ink-light);
                    vertical-align: middle;
                    text-align: right;
                }
                tbody td:first-child { text-align: center; color: var(--slate); font-weight: 600; }
                tbody tr:last-child td { border-bottom: none; }
                tbody tr:nth-child(even) { background: #FCFBF8; }

                .badge {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 600;
                    white-space: nowrap;
                }
                .badge.donated { background: var(--status-donated-bg); color: var(--status-donated-text); }
                .badge.reserved { background: var(--status-reserved-bg); color: var(--status-reserved-text); }
                .badge.delivered { background: var(--status-delivered-bg); color: var(--status-delivered-text); }

                .empty-row td {
                    text-align: center;
                    color: var(--slate);
                    font-style: normal;
                    padding: 16px;
                }
                .perforation {
                    margin: 22px 36px 0;
                    border-top: 1.5px dashed var(--line);
                    position: relative;
                }
                .perforation::before, .perforation::after {
                    content: "";
                    position: absolute;
                    top: -9px;
                    width: 18px; height: 18px;
                    background: var(--bg);
                    border-radius: 50%;
                }
                .perforation::before { right: -27px; }
                .perforation::after { left: -27px; }

                footer {
                    padding: 18px 36px 26px;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                footer .note {
                    font-size: 12px;
                    color: var(--slate);
                    line-height: 1.8;
                    max-width: 480px;
                    text-align: right;
                }
                footer .system {
                    font-size: 11.5px;
                    color: var(--slate);
                    text-align: left;
                }
                footer .system b { color: var(--ink); font-family: 'Tajawal', sans-serif; }

                .ribbon {
                    position: absolute;
                    top: 18px;
                    left: -42px;
                    transform: rotate(-45deg);
                    background: linear-gradient(135deg, #8B0000, #C0302E);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 4px 46px;
                    font-family: 'Tajawal', sans-serif;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                }
                .actions {
                    max-width: 880px;
                    width: 100%;
                    margin: 16px auto 0;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                .btn {
                    font-family: 'IBM Plex Sans Arabic', sans-serif;
                    font-weight: 600;
                    font-size: 13.5px;
                    padding: 10px 20px;
                    border-radius: 8px;
                    border: 1px solid var(--line);
                    background: var(--card);
                    color: var(--ink);
                    cursor: pointer;
                }
                .btn.primary {
                    background: var(--ink);
                    color: #fff;
                    border-color: var(--ink);
                }
                
                @media print {
                    @page {
                        margin: 0 !important;
                    }
                    /* Hide everything else on the page */
                    body * {
                        visibility: hidden !important;
                    }
                    .report-container, .report-container * {
                        visibility: visible !important;
                    }
                    .report-container {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        padding: 1.5cm !important;
                        margin: 0 !important;
                        background: #fff !important;
                        box-sizing: border-box !important;
                    }
                    .sheet {
                        box-shadow: none !important;
                        border-radius: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        border: none !important;
                    }
                    .actions {
                        display: none !important;
                    }
                    /* Reset parent containers */
                    html, body, #root, .app-container, main {
                        height: auto !important;
                        min-height: 0 !important;
                        overflow: visible !important;
                        position: static !important;
                        background: #fff !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .perforation::before, .perforation::after {
                        background: #fff !important;
                    }
                }

                
                @media (max-width: 640px) {
                    header { flex-direction: column; }
                    header .meta { text-align: right; }
                    .stats { grid-template-columns: 1fr; }
                    table { font-size: 12px; }
                }
            `}</style>

            <div className="sheet">
                <div className="ribbon">إلكتروني</div>
                <div className="accent-bar"></div>

                <header>
                    <div className="title-block">
                        <h1>كشف حرك المواد</h1>
                        <p>تقرير تفصيلي بالمواد المختبرع بها والمحجوز والمسلم لهذا الحاجز</p>
                    </div>
                    <div className="meta">
                        <div>رقم الكشف&nbsp; <span className="report-no">{reportDetails.reportNo}</span></div>
                        <div>تاريخخ الإصدار: &nbsp;<b>{formatReportDateTime(new Date())}</b></div>
                        <div>المنسق: &nbsp;<b>فريق مكاتك</b></div>
                    </div>
                </header>

                <div className="pilgrim">
                    <div className="pilgrim-field">
                        <span>اسم الحاجز</span>
                        <b>{reportDetails.studentName}</b>
                    </div>
                    <div className="pilgrim-field">
                        <span>رقم الهاتف</span>
                        <b>
                            <a
                                className="whatsapp-link"
                                href={buildWhatsAppUrl(reportDetails)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="فتح واتساب"
                            >
                                <span className="wa-icon">💬</span>
                                {reportDetails.phone}
                            </a>
                        </b>
                    </div>
                    <div className="pilgrim-field">
                        <span>تاريخخ التسجيل</span>
                        <b>{reportDetails.registrationDate}</b>
                    </div>
                    <div className="pilgrim-field">
                        <span>حال الحاجز</span>
                        <b style={{ color: reportDetails.reservedCount > 0 ? '#8A5E14' : '#1B2A3C' }}>{reportDetails.statusText}</b>
                    </div>
                </div>

                <div className="stats">
                    <div className="stat-card donated">
                        <div className="num">{reportDetails.donatedCount}</div>
                        <div className="lbl">مواد مختبرع بها متاح</div>
                    </div>
                    <div className="stat-card reserved">
                        <div className="num">{reportDetails.reservedCount}</div>
                        <div className="lbl">مواد محجوز</div>
                    </div>
                    <div className="stat-card delivered">
                        <div className="num">{reportDetails.deliveredCount}</div>
                        <div className="lbl">مواد مسلَّم</div>
                    </div>
                </div>

                <div className="section-title">تفاصيل المواد</div>

                <table>
                    <thead>
                        <tr>
                            <th>م</th>
                            <th>اسم المادة</th>
                            <th>التصنيف</th>
                            <th>تاريخخ الإجراء</th>
                            <th>تاريخخ التسليم</th>
                            <th>الحال</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reportDetails.items.length > 0 ? (
                            reportDetails.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td>{idx + 1}</td>
                                    <td>{item.name}</td>
                                    <td>{item.classification}</td>
                                    <td>{formatReportDate(item.actionDate)}</td>
                                    <td>{formatReportDate(item.deliveryDate)}</td>
                                    <td>
                                        <span className={`badge ${item.badgeClass}`}>{item.statusText}</span>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr className="empty-row">
                                <td colSpan="6">لا توجد مواد مسجل على هذا الرقم حتى الآن</td>
                            </tr>
                        )}

                        {/* Extra informational row if there are no donated available or delivered materials */}
                        {reportDetails.items.length > 0 && reportDetails.donatedCount === 0 && reportDetails.deliveredCount === 0 && (
                            <tr className="empty-row">
                                <td colSpan="6">لا توجد مواد مختبرع بها أو مسلَّم مسجّل على هذا الرقم حتى الآن</td>
                            </tr>
                        )}
                    </tbody>
                </table>

                <div className="perforation"></div>

                <footer>
                    <div className="note">
                        يرجى الاحتفاظ بهذا الكشف ومشاركته عند التواصل مع فريق التنسيق.
                        هذا المستند صادر إلكترونيًا من نظام مكاتك، ولا يحتاج إلى تم أو توقيع لاعتماده.
                    </div>
                    <div className="system">
                        <div><b>نظام مكاتك</b></div>
                        <div>تقرير آلي — لا يُعتد به كوثيق رسمي بديل عن السجل الأصلي</div>
                    </div>
                </footer>
            </div>

            <div className="actions">
                <button className="btn primary" onClick={handlePrint}>🖶 طباع / حفظ PDF</button>
                <button className="btn" onClick={handleClose}>إغلاق</button>
            </div>
        </div>
    );
};

export default ReportModal;
