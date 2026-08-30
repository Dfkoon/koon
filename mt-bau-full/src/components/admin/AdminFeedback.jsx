import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { archiveItem } from '../../services/deletedItemsService';

const fmtDate = (ts) => {
    if (!ts) return '—';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('ar-JO') + ' ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
};

const AdminFeedback = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    // Suggestions state
    const [suggestions, setSuggestions] = useState([]);
    const [suggestionsLoading, setSuggestionsLoading] = useState(true);
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // Testimonials state
    const [testimonials, setTestimonials] = useState([]);
    const [testimonialsLoading, setTestimonialsLoading] = useState(true);

    // Load suggestions
    useEffect(() => {
        const qSug = query(collection(db, 'suggestions'), orderBy('timestamp', 'desc'), limit(150));
        const unsub = onSnapshot(qSug, (snap) => {
            setSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => !item.deleted));
            setSuggestionsLoading(false);
        }, (err) => {
            console.error("Failed to load suggestions:", err);
            setSuggestionsLoading(false);
        });
        return () => unsub();
    }, []);

    // Load testimonials
    useEffect(() => {
        const qTest = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'), limit(100));
        const unsub = onSnapshot(qTest, (snap) => {
            setTestimonials(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(item => !item.deleted));
            setTestimonialsLoading(false);
        }, (err) => {
            console.error("Failed to load testimonials:", err);
            setTestimonialsLoading(false);
        });
        return () => unsub();
    }, []);

    // Suggestion actions
    const resolveSuggestion = async (id) => {
        try {
            await updateDoc(doc(db, 'suggestions', id), { status: 'resolved', read: true });
            toast.success(isAr ? 'تم حل الاقتراح / الشكوى' : 'Marked as resolved');
        } catch {
            toast.error(isAr ? 'خطأ في التحديث' : 'Update failed');
        }
    };

    const deleteSuggestion = async (id) => {
        if (!window.confirm(isAr ? 'هل تريد حذف هذه الرسالة؟' : 'Delete this message?')) return;
        try {
            const suggestion = suggestions.find(item => item.id === id);
            await archiveItem({ originalCollection: 'suggestions', originalId: id, itemData: suggestion || { id }, reason: 'suggestion-deletion' });
            setSuggestions(current => current.filter(item => item.id !== id));
            toast.success(isAr ? 'تم نقل الرسالة إلى المحذوفات' : 'Message moved to deleted items');
        } catch {
            toast.error(isAr ? 'خطأ' : 'Error');
        }
    };

    // Testimonial actions
    const toggleTestimonialApproval = async (id, current) => {
        try {
            await updateDoc(doc(db, 'testimonials', id), { approved: !current });
            toast.success(isAr ? (!current ? 'تم التفعيل والظهور' : 'تم إلغاء التفعيل') : (!current ? 'Approved' : 'Unapproved'));
        } catch {
            toast.error(isAr ? 'خطأ في التحديث' : 'Update failed');
        }
    };

    const deleteTestimonial = async (id) => {
        if (!window.confirm(isAr ? 'هل تريد حذف هذا التقييم؟' : 'Delete this review?')) return;
        try {
            const testimonial = testimonials.find(item => item.id === id);
            await archiveItem({ originalCollection: 'testimonials', originalId: id, itemData: testimonial || { id }, reason: 'testimonial-deletion' });
            setTestimonials(current => current.filter(item => item.id !== id));
            toast.success(isAr ? 'تم نقل التقييم إلى المحذوفات' : 'Review moved to deleted items');
        } catch {
            toast.error(isAr ? 'خطأ في الحذف' : 'Error deleting');
        }
    };

    const filteredSuggestions = suggestions.filter(s => {
        const matchesType = filterType === 'all' || s.type === filterType;
        const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
        return matchesType && matchesStatus;
    });

    if (suggestionsLoading || testimonialsLoading) {
        return (
            <div className="admin-loading-container">
                <div className="admin-spinner" />
                <p>{isAr ? 'جاري تحميل الآراء والتقييمات...' : 'Loading feedback & reviews...'}</p>
            </div>
        );
    }

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <h3 className="admin-section-title">
                <span>{isAr ? 'الآراء والتقييمات' : 'Feedback & Testimonials'}</span>
            </h3>

            {/* ── SECTION 1: Suggestions & Feedback ── */}
            <div className="admin-glass-card" style={{ marginBottom: '2.5rem', padding: '1.5rem' }}>
                <h4 className="admin-card-header-title" style={{
                    fontSize: '1.05rem',
                    marginBottom: '1.2rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--adm-divider)',
                    color: 'var(--adm-text)'
                }}>
                    {isAr ? 'الاقتراحات والشكاوى والآراء' : 'Suggestions, Complaints & Feedback'}
                </h4>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="filter-group">
                        <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.3rem' }}>
                            {isAr ? 'النوع:' : 'Type:'}
                        </label>
                        <select className="admin-input-field" value={filterType} onChange={e => setFilterType(e.target.value)}>
                            <option value="all">{isAr ? 'كل الأنواع' : 'All Types'}</option>
                            <option value="suggestion">{isAr ? 'اقتراح' : 'Suggestion'}</option>
                            <option value="complaint">{isAr ? 'شكوى' : 'Complaint'}</option>
                            <option value="question">{isAr ? 'سؤال' : 'Question'}</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.3rem' }}>
                            {isAr ? 'الحال:' : 'Status:'}
                        </label>
                        <select className="admin-input-field" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                            <option value="all">{isAr ? 'كل الحالات' : 'All'}</option>
                            <option value="new">{isAr ? 'جديد' : 'New'}</option>
                            <option value="resolved">{isAr ? 'محلول' : 'Resolved'}</option>
                        </select>
                    </div>
                </div>

                {filteredSuggestions.length === 0 ? (
                    <div className="admin-empty-state" style={{ padding: '2.5rem 1rem' }}>
                        <p>{isAr ? 'لا توجد رسائل بهذا التصنيف' : 'No messages found with these filters'}</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filteredSuggestions.map(s => (
                            <div
                                key={s.id}
                                className={`suggestion-admin-card ${s.status === 'resolved' ? 'resolved' : 'new'}`}
                            >
                                <div className="suggestion-admin-header">
                                    <span className="suggestion-admin-name">
                                        {s.name || (isAr ? 'طالب مجهول' : 'Anonymous Student')}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <span className={`badge ${s.type === 'complaint' ? 'badge-complaint' : s.type === 'question' ? 'badge-question' : 'badge-suggestion'}`}>
                                            {s.type === 'complaint' ? (isAr ? 'شكوى' : 'Complaint') : s.type === 'question' ? (isAr ? 'سؤال' : 'Question') : (isAr ? 'اقتراح' : 'Suggestion')}
                                        </span>
                                        <span className={`badge ${s.status === 'resolved' ? 'badge-resolved' : 'badge-pending'}`}>
                                            {s.status === 'resolved' ? (isAr ? 'محلول' : 'Resolved') : (isAr ? 'جديد' : 'New')}
                                        </span>
                                    </div>
                                    <span className="suggestion-admin-date">{fmtDate(s.timestamp)}</span>
                                </div>

                                <div className="suggestion-admin-message">{s.message}</div>

                                {s.contact && (
                                    <p className="suggestion-admin-contact" style={{ fontSize: '0.8rem', color: 'var(--adm-muted)', margin: '0.4rem 0' }}>
                                        <strong>{isAr ? 'طريق التواصل:' : 'Contact Info:'}</strong> {s.contact}
                                    </p>
                                )}

                                <div className="suggestion-card-actions" style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
                                    {s.status !== 'resolved' && (
                                        <button className="admin-action-btn approve" onClick={() => resolveSuggestion(s.id)}>
                                            {isAr ? 'تمييز كمحلول' : 'Mark Resolved'}
                                        </button>
                                    )}
                                    <button className="admin-action-btn delete" onClick={() => deleteSuggestion(s.id)}>
                                        {isAr ? 'حذف الرسالة' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── SECTION 2: Student Reviews & Testimonials ── */}
            <div className="admin-glass-card" style={{ padding: '1.5rem' }}>
                <h4 className="admin-card-header-title" style={{
                    fontSize: '1.05rem',
                    marginBottom: '1.2rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--adm-divider)',
                    color: 'var(--adm-text)'
                }}>
                    {isAr ? 'تقييمات وآراء الطلاب للموقع' : 'Student Testimonials & Reviews'}
                </h4>

                {testimonials.length === 0 ? (
                    <div className="admin-empty-state" style={{ padding: '2.5rem 1rem' }}>
                        <p>{isAr ? 'لا توجد تقييمات مضاف بعد' : 'No testimonials added yet'}</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {testimonials.map(t => (
                            <div key={t.id} className="suggestion-admin-card">
                                <div className="suggestion-admin-header">
                                    <span className="suggestion-admin-name">
                                        {t.author || (isAr ? 'طالب مجهول' : 'Anonymous Student')}
                                        {t.major ? <span style={{ fontWeight: 400, color: 'var(--adm-muted)', marginRight: '0.4rem' }}> — {t.major}</span> : ''}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <span className={`badge ${t.approved ? 'badge-resolved' : 'badge-pending'}`}>
                                            {t.approved ? (isAr ? 'نشط وظاهر' : 'Approved') : (isAr ? 'معطل ومفي' : 'Pending')}
                                        </span>
                                        {t.language && (
                                            <span style={{
                                                background: 'var(--adm-surface-card)',
                                                border: '1px solid var(--adm-border)',
                                                padding: '2px 7px',
                                                borderRadius: '6px',
                                                fontSize: '0.7rem',
                                                color: 'var(--adm-muted)',
                                                fontWeight: 700
                                            }}>
                                                {t.language.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="suggestion-admin-date">{fmtDate(t.createdAt || t.timestamp)}</span>
                                </div>

                                <div className="suggestion-admin-message" style={{ fontStyle: 'italic' }}>
                                    "{t.quote || t.message || t.feedback}"
                                </div>

                                <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem' }}>
                                    <button
                                        className={`admin-action-btn ${t.approved ? 'decline' : 'approve'}`}
                                        onClick={() => toggleTestimonialApproval(t.id, t.approved)}
                                    >
                                        {t.approved ? (isAr ? 'إلغاء التفعيل' : 'Disable') : (isAr ? 'تفعيل وإظهار' : 'Approve')}
                                    </button>
                                    <button
                                        className="admin-action-btn delete"
                                        onClick={() => deleteTestimonial(t.id)}
                                    >
                                        {isAr ? 'حذف التقييم' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminFeedback;
