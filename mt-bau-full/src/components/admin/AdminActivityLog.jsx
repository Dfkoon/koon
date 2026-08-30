import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';

const PATH_LABELS = {
    '/': 'الرئيسي',
    '/materials': 'المواد الدراسية',
    '/plans': 'الخطط الدراسي',
    '/quiz': 'الاختبارات',
    '/calendar': 'التقويم الأكاديمي',
    '/grading': 'حساب المعدل والدرجات',
    '/exchange': 'سوق تبادل المواد',
    '/about': 'من نحن',
    '/faq': 'الأسئلة الشائعة',
    '/materials/click': 'مواد دراسية (تحميل)',
    '/quiz/complete': 'اختبار (إتمام)',
};

const getPathLabel = (path, lang) => {
    if (!path) return '—';
    if (lang === 'ar') {
        if (PATH_LABELS[path]) return PATH_LABELS[path];
        if (path.startsWith('/quiz/')) return `اختبار: ${path.replace('/quiz/', '')}`;
        return path;
    }
    const en = {
        '/': 'Home', '/materials': 'Study Materials', '/plans': 'Academic Plans',
        '/quiz': 'Quizzes', '/calendar': 'Academic Calendar', '/grading': 'Grading Calculator',
        '/exchange': 'Material Exchange', '/about': 'About Us', '/faq': 'FAQ',
        '/materials/click': 'Materials (Download)', '/quiz/complete': 'Quiz (Completed)',
    };
    if (en[path]) return en[path];
    if (path.startsWith('/quiz/')) return `Quiz: ${path.replace('/quiz/', '')}`;
    return path;
};

const fmtDate = (ts, lang) => {
    if (!ts) return '—';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const locale = lang === 'ar' ? 'ar-JO' : 'en-US';
    const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const dateStr = d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    return { dateStr, timeStr, rawDate: d };
};

const getRelativeTime = (d, lang) => {
    if (!d || isNaN(d.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now - d) / 1000);
    if (diffSec < 60) return lang === 'ar' ? 'الآن' : 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return lang === 'ar' ? `قبل ${diffMin} د` : `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return lang === 'ar' ? `قبل ${diffHr} س` : `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return lang === 'ar' ? `قبل ${diffDays} يوم` : `${diffDays}d ago`;
    return '';
};

const TypeBadge = ({ type, lang }) => {
    const isAr = lang === 'ar';
    const map = {
        visit: { label: isAr ? 'زيارة صفح' : 'Page Visit', icon: '🌐', cls: 'log-badge-visit' },
        material_view: { label: isAr ? 'مادة دراسي' : 'Study Material', icon: '📂', cls: 'log-badge-material' },
        quiz_completed: { label: isAr ? 'إتمام اختبار' : 'Quiz Result', icon: '🎯', cls: 'log-badge-quiz' },
        download: { label: isAr ? 'تنزيل ملف' : 'Download', icon: '📥', cls: 'log-badge-download' },
    };
    const b = map[type] || { label: type, icon: '⚡', cls: 'log-badge-visit' };
    return (
        <span className={`log-activity-badge ${b.cls}`}>
            <span className="badge-icon">{b.icon}</span>
            <span>{b.label}</span>
        </span>
    );
};

// Parse score like "8.00/10.00" → { earned, total, pct }
const parseScore = (scoreStr) => {
    if (!scoreStr) return null;
    const match = String(scoreStr).match(/^([\d.]+)\/([\d.]+)$/);
    if (!match) return null;
    const earned = parseFloat(match[1]);
    const total = parseFloat(match[2]);
    if (!total) return null;
    return { earned, total, pct: Math.round((earned / total) * 100) };
};

const ScorePill = ({ scoreStr }) => {
    const parsed = parseScore(scoreStr);
    if (!parsed) return <span style={{ color: 'var(--adm-muted)' }}>{scoreStr || '—'}</span>;
    const { earned, total, pct } = parsed;
    const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
            background: `${color}22`, border: `1px solid ${color}55`,
            borderRadius: '999px', padding: '0.2rem 0.7rem',
            fontWeight: 700, fontSize: '0.83rem', color,
        }}>
            {earned}/{total}
            <span style={{ opacity: 0.75, fontWeight: 500, fontSize: '0.74rem' }}>({pct}%)</span>
        </span>
    );
};

const AdminActivityLog = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedWrong, setExpandedWrong] = useState({}); // { logId: bool }
    const pageSize = 15;

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const qLogs = query(collection(db, 'page_views'), orderBy('timestamp', 'desc'), limit(500));
                const snap = await getDocs(qLogs);
                setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (err) {
                console.error("Failed to load activity logs:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchLogs();
    }, []);

    const stats = useMemo(() => {
        const total = logs.length;
        const visits = logs.filter(l => l.type === 'visit').length;
        const quizzes = logs.filter(l => l.type === 'quiz_completed').length;
        const materials = logs.filter(l => l.type === 'material_view').length;
        return { total, visits, quizzes, materials };
    }, [logs]);

    const filteredLogs = useMemo(() => {
        return logs.filter(item => {
            const matchesType = filterType === 'all' || item.type === filterType;
            if (!matchesType) return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                (item.studentName || '').toLowerCase().includes(q) ||
                (item.studentPhone || '').toLowerCase().includes(q) ||
                getPathLabel(item.path, language).toLowerCase().includes(q) ||
                (item.quizTitle || item.quizId || '').toLowerCase().includes(q) ||
                (item.courseName || '').toLowerCase().includes(q) ||
                (item.partTitle || '').toLowerCase().includes(q)
            );
        });
    }, [logs, filterType, searchQuery, language]);

    useEffect(() => { setCurrentPage(1); }, [filterType, searchQuery]);

    const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
    const paginatedLogs = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredLogs.slice(start, start + pageSize);
    }, [filteredLogs, currentPage, pageSize]);

    if (loading) {
        return (
            <div className="admin-loading-container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
                <div className="admin-spinner" style={{ margin: '0 auto 1rem' }} />
                <p style={{ color: 'var(--adm-muted)', fontWeight: 600 }}>
                    {isAr ? 'جارٍ تحميل سجل التفاعلات والأنشط...' : 'Loading activity log...'}
                </p>
            </div>
        );
    }

    return (
        <div className="admin-panel-section admin-fade-in log-section-wrapper" dir={isAr ? 'rtl' : 'ltr'}>

            {/* Header */}
            <div className="log-header-title-bar">
                <div>
                    <h3 className="admin-section-title" style={{ margin: 0 }}>
                        📋 <span>{isAr ? 'سجل الطلاب والأنشط' : 'Student Activity Log'}</span>
                    </h3>
                    <p className="log-subtitle">
                        {isAr
                            ? 'متابع تفاعلات الطلاب، زيارات الصفحات، ونتائج الاختبارات مباشر'
                            : 'Real-time overview of student page visits, quizzes, and downloads'}
                    </p>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="log-stats-grid">
                <div className="log-stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>📊</div>
                    <div className="stat-card-data">
                        <span className="stat-card-value">{stats.total}</span>
                        <span className="stat-card-label">{isAr ? 'إجمالي الأنشط' : 'Total Activities'}</span>
                    </div>
                </div>
                <div className="log-stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>🌐</div>
                    <div className="stat-card-data">
                        <span className="stat-card-value">{stats.visits}</span>
                        <span className="stat-card-label">{isAr ? 'زيارات الصفحات' : 'Page Visits'}</span>
                    </div>
                </div>
                <div className="log-stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7' }}>🎯</div>
                    <div className="stat-card-data">
                        <span className="stat-card-value">{stats.quizzes}</span>
                        <span className="stat-card-label">{isAr ? 'اختبارات مكتمل' : 'Quizzes Completed'}</span>
                    </div>
                </div>
                <div className="log-stat-card">
                    <div className="stat-card-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#fcd34d' }}>📂</div>
                    <div className="stat-card-data">
                        <span className="stat-card-value">{stats.materials}</span>
                        <span className="stat-card-label">{isAr ? 'تفاعلات المواد' : 'Material Views'}</span>
                    </div>
                </div>
            </div>

            {/* Filter & Search */}
            <div className="log-controls-bar">
                <div className="log-search-box">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        placeholder={isAr ? 'ابحث باسم الطالب، رقم الهاتف، اسم المادة...' : 'Search student, phone, or course...'}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="log-search-input"
                    />
                    {searchQuery && <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>}
                </div>
                <div className="log-filter-box">
                    <label className="filter-label">{isAr ? 'نوع النشاط:' : 'Type:'}</label>
                    <select className="log-select-input" value={filterType} onChange={e => setFilterType(e.target.value)}>
                        <option value="all">{isAr ? '⚡ كل الأنشط' : 'All Activities'}</option>
                        <option value="visit">{isAr ? '🌐 زيارات الصفحات' : 'Page Visits'}</option>
                        <option value="quiz_completed">{isAr ? '🎯 نتائج الاختبارات' : 'Quiz Completions'}</option>
                        <option value="material_view">{isAr ? '📂 فتح المواد الدراسية' : 'Study Materials'}</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="log-table-card">
                <table className="log-custom-table">
                    <thead>
                        <tr>
                            <th style={{ width: '130px' }}>{isAr ? 'النوع' : 'Type'}</th>
                            <th style={{ minWidth: '180px' }}>{isAr ? 'المستخدم/الطالب' : 'Student'}</th>
                            <th>{isAr ? 'تفاصيل النشاط' : 'Activity Details'}</th>
                            <th style={{ width: '190px' }}>{isAr ? 'التاريخخ والتوقيت' : 'Date & Time'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedLogs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="log-empty-state">
                                    <div className="empty-icon">🔍</div>
                                    <p>{isAr ? 'لا توجد سجلات مطابق للبحث' : 'No matching logs found'}</p>
                                </td>
                            </tr>
                        ) : paginatedLogs.map(v => {
                            const datetime = fmtDate(v.timestamp, language);
                            const relTime = datetime.rawDate ? getRelativeTime(datetime.rawDate, language) : '';
                            const isGuest = !v.studentName || v.studentName === 'Guest' || v.studentName === 'مجهول';
                            const wrongQs = Array.isArray(v.wrongQuestions) ? v.wrongQuestions : [];
                            const isWrongExpanded = !!expandedWrong[v.id];

                            return (
                                <tr key={v.id} className="log-table-row">

                                    {/* Type */}
                                    <td className="log-cell-type">
                                        <TypeBadge type={v.type} lang={language} />
                                    </td>

                                    {/* Student */}
                                    <td className="log-cell-student">
                                        <div className="student-profile-item">
                                            <div className={`student-avatar ${isGuest ? 'guest' : 'registered'}`}>
                                                {isGuest ? '👤' : (v.studentName?.[0] || '🎓')}
                                            </div>
                                            <div className="student-details-meta">
                                                <span className="student-name">
                                                    {isGuest ? (isAr ? 'زائر مجهول' : 'Anonymous Guest') : v.studentName}
                                                </span>
                                                {v.studentPhone && <span className="student-phone">📞 {v.studentPhone}</span>}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Details */}
                                    <td className="log-cell-details">

                                        {/* PAGE VISIT */}
                                        {v.type === 'visit' && (
                                            <div className="detail-item visit-detail">
                                                <span className="detail-label">{isAr ? 'زار صفح:' : 'Visited:'}</span>
                                                <span className="detail-tag">{getPathLabel(v.path, language)}</span>
                                            </div>
                                        )}

                                        {/* QUIZ COMPLETED */}
                                        {v.type === 'quiz_completed' && (
                                            <div className="detail-item quiz-detail" style={{ display: 'flex', flexDirection: 'column', gap: '0.38rem' }}>

                                                {/* Course name badge */}
                                                {v.courseName && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                        <span style={{
                                                            fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                                                            color: 'var(--adm-muted)', textTransform: 'uppercase',
                                                        }}>
                                                            {isAr ? 'المادة:' : 'Course:'}
                                                        </span>
                                                        <span style={{
                                                            background: 'rgba(99,102,241,0.14)', color: '#a5b4fc',
                                                            border: '1px solid rgba(99,102,241,0.25)',
                                                            borderRadius: '7px', padding: '0.13rem 0.55rem',
                                                            fontWeight: 700, fontSize: '0.8rem',
                                                        }}>
                                                            📚 {v.courseName}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Part/Chapter */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                                                        color: 'var(--adm-muted)', textTransform: 'uppercase',
                                                    }}>
                                                        {isAr ? 'الجزء:' : 'Part:'}
                                                    </span>
                                                    <span style={{ fontWeight: 600, fontSize: '0.87rem' }}>
                                                        🎯 {v.partTitle || v.quizTitle || v.quizId}
                                                    </span>
                                                </div>

                                                {/* Score */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em',
                                                        color: 'var(--adm-muted)', textTransform: 'uppercase',
                                                    }}>
                                                        {isAr ? 'النتيج:' : 'Score:'}
                                                    </span>
                                                    <ScorePill scoreStr={v.score} />
                                                </div>

                                                {/* Wrong answers button */}
                                                {wrongQs.length > 0 && (
                                                    <div style={{ marginTop: '0.15rem' }}>
                                                        <button
                                                            onClick={() => setExpandedWrong(prev => ({ ...prev, [v.id]: !prev[v.id] }))}
                                                            style={{
                                                                background: isWrongExpanded ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.09)',
                                                                border: '1px solid rgba(239,68,68,0.32)',
                                                                borderRadius: '8px', padding: '0.22rem 0.7rem',
                                                                color: '#fca5a5', fontSize: '0.77rem', fontWeight: 700,
                                                                cursor: 'pointer',
                                                                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                                transition: 'background 0.18s',
                                                            }}
                                                        >
                                                            ❌ {wrongQs.length} {isAr ? 'إجابة اطئ' : 'wrong answers'}
                                                            <span style={{ fontSize: '0.65rem' }}>{isWrongExpanded ? '▲' : '▼'}</span>
                                                        </button>

                                                        {isWrongExpanded && (
                                                            <div style={{
                                                                marginTop: '0.45rem',
                                                                background: 'rgba(239,68,68,0.06)',
                                                                border: '1px solid rgba(239,68,68,0.15)',
                                                                borderRadius: '10px',
                                                                padding: '0.6rem 0.85rem',
                                                                display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                                            }}>
                                                                {wrongQs.map((wq, i) => (
                                                                    <div key={i} style={{
                                                                        borderBottom: i < wrongQs.length - 1 ? '1px solid rgba(239,68,68,0.12)' : 'none',
                                                                        paddingBottom: i < wrongQs.length - 1 ? '0.45rem' : 0,
                                                                    }}>
                                                                        <div style={{ fontSize: '0.79rem', fontWeight: 600, color: 'var(--adm-text)', marginBottom: '0.22rem' }}>
                                                                            ❓ {wq.questionText}
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.74rem' }}>
                                                                            <span style={{ color: '#34d399' }}>
                                                                                ✅ {isAr ? 'الصواب:' : 'Correct:'} <strong>{wq.correctAnswer}</strong>
                                                                            </span>
                                                                            <span style={{ color: '#f87171' }}>
                                                                                ✗ {isAr ? 'أجاب:' : 'Answered:'} <strong>{wq.studentAnswer || (isAr ? 'لم يجب' : 'No answer')}</strong>
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* All correct */}
                                                {wrongQs.length === 0 && v.score && (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                                                        fontSize: '0.75rem', color: '#10b981', fontWeight: 700,
                                                        background: 'rgba(16,185,129,0.1)',
                                                        border: '1px solid rgba(16,185,129,0.25)',
                                                        borderRadius: '7px', padding: '0.15rem 0.55rem',
                                                    }}>
                                                        ✅ {isAr ? 'جميع الإجابات صحيح' : 'All answers correct'}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* MATERIAL VIEW */}
                                        {v.type === 'material_view' && (
                                            <div className="detail-item material-detail">
                                                <div className="material-course">📂 {v.courseName}</div>
                                                {v.materialName && <div className="material-name">📄 {v.materialName}</div>}
                                            </div>
                                        )}

                                        {/* OTHER */}
                                        {v.type !== 'visit' && v.type !== 'quiz_completed' && v.type !== 'material_view' && (
                                            <div className="detail-item generic-detail">
                                                <span>{v.details || v.path || '—'}</span>
                                            </div>
                                        )}
                                    </td>

                                    {/* Timestamp */}
                                    <td className="log-cell-time">
                                        <div className="time-display-box">
                                            <span className="time-exact">{datetime.dateStr} — {datetime.timeStr}</span>
                                            {relTime && <span className="time-relative">{relTime}</span>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Pagination */}
                {filteredLogs.length > 0 && (
                    <div className="log-pagination-footer">
                        <span className="pagination-info">
                            {isAr
                                ? `عرض ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredLogs.length)} من أصل ${filteredLogs.length} سجل`
                                : `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredLogs.length)} of ${filteredLogs.length} logs`}
                        </span>
                        <div className="pagination-btn-group">
                            <button className="pag-btn" disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}>
                                {isAr ? 'السابق' : 'Previous'}
                            </button>
                            <span className="pag-page-num">{currentPage} / {totalPages}</span>
                            <button className="pag-btn" disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}>
                                {isAr ? 'التالي' : 'Next'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminActivityLog;
