import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import './NoticeBoard.css';

const TYPE_ICONS = {
    info: { icon: 'ℹ️', color: '#3b82f6', bg: 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(59,130,246,0.04))', labelAr: 'إعلان من الفريق', labelEn: 'Team Notice' },
    warning: { icon: '⚠️', color: '#f59e0b', bg: 'linear-gradient(135deg,rgba(245,158,11,0.12),rgba(245,158,11,0.04))', labelAr: 'تحذير أكاديمي', labelEn: 'Academic Warning' },
    success: { icon: '✅', color: '#10b981', bg: 'linear-gradient(135deg,rgba(16,185,129,0.12),rgba(16,185,129,0.04))', labelAr: 'خبر سار', labelEn: 'Good News' },
    alert: { icon: '🔔', color: '#e02b20', bg: 'linear-gradient(135deg,rgba(224,43,32,0.12),rgba(224,43,32,0.04))', labelAr: 'تنبيه هام', labelEn: 'Important Alert' },
    urgent: { icon: '🚨', color: '#ef4444', bg: 'linear-gradient(135deg,rgba(239,68,68,0.16),rgba(220,38,38,0.06))', labelAr: 'إعلان اضطراري وعاجل', labelEn: 'Urgent Announcement' },
    survey: { icon: '⭐', color: '#8b5cf6', bg: 'linear-gradient(135deg,rgba(139,92,246,0.15),rgba(217,70,239,0.05))', labelAr: 'استطلاع رأي وتقييم زوار', labelEn: 'Visitor Feedback Survey' },
};

/**
 * NoticeBoard – popup modal for general announcements, urgent alerts, & interactive surveys.
 */
const NoticeBoard = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [notices, setNotices] = useState([]);
    const [dismissed, setDismissed] = useState(() => {
        try { return JSON.parse(localStorage.getItem('koon_dismissed_notices') || '[]'); }
        catch { return []; }
    });
    const [open, setOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    // Interactive Survey / Rating state
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [surveyText, setSurveyText] = useState('');
    const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
    const [surveySubmitted, setSurveySubmitted] = useState(false);
    const [surveyError, setSurveyError] = useState('');

    useEffect(() => {
        const q = query(
            collection(db, 'notices'),
            where('active', '==', true)
        );
        const unsub = onSnapshot(q, snap => {
            const now = Date.now();
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(n => !n.expiresAt || n.expiresAt.toMillis?.() > now || n.expiresAt > now)
                .sort((a, b) => {
                    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
                    const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime();
                    const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime();
                    return bTime - aTime;
                });
            setNotices(list);
            setLoading(false);
        }, (error) => {
            console.error('NoticeBoard: failed to load active notices:', error);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Open popup automatically after loading if there are un-dismissed notices
    useEffect(() => {
        if (!loading && notices.length > 0) {
            const visible = notices.filter(n => !dismissed.includes(n.id));
            if (visible.length > 0) {
                const timer = setTimeout(() => setOpen(true), 600);
                return () => clearTimeout(timer);
            }
        }
    }, [loading, notices]);

    const dismissCurrent = () => {
        const visible = notices.filter(n => !dismissed.includes(n.id));
        if (visible[currentIndex]) {
            const next = [...dismissed, visible[currentIndex].id];
            setDismissed(next);
            try { localStorage.setItem('koon_dismissed_notices', JSON.stringify(next)); } catch { /**/ }
        }
        // Move to next or close
        const remaining = visible.length - 1;
        if (remaining > currentIndex) {
            setCurrentIndex(i => i);
        } else if (remaining > 0) {
            setCurrentIndex(0);
        } else {
            setOpen(false);
        }
        // Reset survey state
        setRating(0);
        setSurveyText('');
        setSurveySubmitted(false);
        setSurveyError('');
    };

    const dismissAll = () => {
        const visible = notices.filter(n => !dismissed.includes(n.id));
        const ids = visible.map(n => n.id);
        const next = [...dismissed, ...ids];
        setDismissed(next);
        try { localStorage.setItem('koon_dismissed_notices', JSON.stringify(next)); } catch { /**/ }
        setOpen(false);
    };

    const skipCurrent = () => {
        dismissCurrent();
    };

    const goToSection = () => {
        if (!notice.targetPath) return;
        dismissCurrent();
        window.location.hash = notice.targetPath;
    };

    const handleSurveySubmit = async (e) => {
        e.preventDefault();
        setSurveyError('');
        if (rating === 0) {
            setSurveyError(isAr ? 'يرجى تحديد التقييم بالنجوم أولاً ⭐' : 'Please select a star rating');
            return;
        }
        setIsSubmittingSurvey(true);
        try {
            await addDoc(collection(db, 'suggestions'), {
                type: 'announcement_survey',
                rating: Number(rating),
                message: surveyText.trim() || 'بدون تعليق إضافي',
                noticeId: notice.id,
                noticeTitle: notice.titleAr || notice.titleEn || '',
                status: 'new',
                read: false,
                timestamp: serverTimestamp(),
            });
            setSurveySubmitted(true);
            setTimeout(() => {
                dismissCurrent();
            }, 1400);
        } catch (err) {
            console.error('Failed to submit notice survey:', err);
            setSurveyError(isAr ? 'حدث خطأ في الإرسال، يرجى المحاولة لاحقاً' : 'Submission failed');
        } finally {
            setIsSubmittingSurvey(false);
        }
    };

    const visible = notices.filter(n => !dismissed.includes(n.id));

    if (loading || !open || visible.length === 0) return null;

    const notice = visible[currentIndex] || visible[0];
    const tConfig = TYPE_ICONS[notice.type] || TYPE_ICONS.info;
    const hasMultiple = visible.length > 1;
    const isSurvey = notice.type === 'survey';
    const isUrgent = notice.type === 'urgent';
    const isMandatory = notice.isMandatory;

    return (
        <div className={`nb-overlay ${isUrgent ? 'nb-overlay-urgent' : ''}`} role="dialog" aria-modal="true"
            onClick={(e) => { if (e.target === e.currentTarget && !isMandatory) dismissAll(); }}>
            <div className={`nb-modal ${isUrgent ? 'nb-modal-urgent' : ''} ${isSurvey ? 'nb-modal-survey' : ''}`}
                style={{ '--nb-color': tConfig.color, '--nb-bg': tConfig.bg }}>

                {/* Header strip */}
                <div className="nb-header" style={{ background: tConfig.color }}>
                    <span className={`nb-header-icon ${isUrgent ? 'nb-pulse-icon' : ''}`}>{tConfig.icon}</span>
                    <span className="nb-header-label">
                        {isAr ? (tConfig.labelAr) : (tConfig.labelEn)}
                    </span>
                    {notice.pinned && <span className="nb-pin">📌</span>}
                    {isMandatory && <span className="nb-mandatory-badge">🔒 {isAr ? 'إجباري' : 'Required'}</span>}
                    {!isMandatory && (
                        <button className="nb-close" onClick={dismissAll} aria-label={isAr ? 'إغلاق' : 'Close'}>✕</button>
                    )}
                </div>

                {/* Body */}
                <div className="nb-body" style={{ background: tConfig.bg }}>
                    {(isAr ? notice.titleAr : notice.titleEn) && (
                        <h3 className="nb-title" style={{ color: tConfig.color }}>{isAr ? notice.titleAr : notice.titleEn}</h3>
                    )}
                    {(isAr ? notice.bodyAr : notice.bodyEn) && (
                        <p className="nb-text">{isAr ? notice.bodyAr : notice.bodyEn}</p>
                    )}

                    {/* Interactive Survey Component */}
                    {isSurvey && (
                        <div className="nb-survey-container">
                            {surveySubmitted ? (
                                <div className="nb-survey-success">
                                    <span className="nb-success-icon">🎉</span>
                                    <h4>{isAr ? 'شكرًا لتقييمك ورأيك القّيم!' : 'Thank you for your feedback!'}</h4>
                                    <p>{isAr ? 'تم استلام تقييمك بنجاح ومشاركته مع فريق مكانك' : 'Your review has been recorded'}</p>
                                </div>
                            ) : (
                                <form onSubmit={handleSurveySubmit} className="nb-survey-form">
                                    <div className="nb-stars-wrapper">
                                        <span className="nb-stars-label">{isAr ? 'ما تقييمك للموقع وتجربتك؟' : 'How would you rate your experience?'}</span>
                                        <div className="nb-stars-list">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <button
                                                    key={star}
                                                    type="button"
                                                    className={`nb-star-btn ${(hoverRating || rating) >= star ? 'filled' : ''}`}
                                                    onClick={() => setRating(star)}
                                                    onMouseEnter={() => setHoverRating(star)}
                                                    onMouseLeave={() => setHoverRating(0)}
                                                >
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea
                                        className="nb-survey-textarea"
                                        rows={3}
                                        value={surveyText}
                                        onChange={(e) => setSurveyText(e.target.value)}
                                        placeholder={isAr ? 'اكتب ملاحظاتك أو اقتراحاتك لتطوير مكانك (اختياري)...' : 'Write your notes or feedback (optional)...'}
                                        dir={isAr ? 'rtl' : 'ltr'}
                                    />
                                    {surveyError && <div className="nb-survey-error">{surveyError}</div>}
                                    <button type="submit" className="nb-survey-submit-btn" disabled={isSubmittingSurvey} style={{ background: tConfig.color }}>
                                        {isSubmittingSurvey ? (isAr ? 'جاري إرسال رأيك...' : 'Submitting...') : (isAr ? '🚀 إرسال رأيي وتفاعلي' : 'Submit Feedback')}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!isSurvey && (
                    <div className="nb-footer">
                        {hasMultiple && (
                            <div className="nb-pagination">
                                {visible.map((_, i) => (
                                    <button
                                        key={i}
                                        className={`nb-dot ${i === currentIndex ? 'active' : ''}`}
                                        onClick={() => setCurrentIndex(i)}
                                        style={{ background: i === currentIndex ? tConfig.color : undefined }}
                                    />
                                ))}
                            </div>
                        )}
                        <div className="nb-actions">
                            {!isMandatory && (
                                <button className="nb-btn-skip" onClick={skipCurrent}>
                                    {isAr ? 'تخطي' : 'Skip'}
                                </button>
                            )}
                            {notice.targetPath && (
                                <button className="nb-btn-dismiss" onClick={goToSection} style={{ '--btn-color': tConfig.color }}>
                                    {isAr ? (notice.actionTextAr || 'الذهاب إلى القسم المذكور') : (notice.actionTextEn || 'Go to section')}
                                </button>
                            )}
                            {hasMultiple && currentIndex < visible.length - 1 && (
                                <button className="nb-btn-next" onClick={() => setCurrentIndex(i => i + 1)}>
                                    {isAr ? 'التالي ←' : 'Next →'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NoticeBoard;
