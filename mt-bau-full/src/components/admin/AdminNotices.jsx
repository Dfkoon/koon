import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, orderBy, query, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { useLanguage } from '../../contexts/LanguageContext';

const TYPE_OPTIONS = [
    { value: 'info', labelAr: 'معلومات عامة ℹ️', labelEn: 'Info ℹ️' },
    { value: 'warning', labelAr: 'تحذير أكاديمي ⚠️', labelEn: 'Warning ⚠️' },
    { value: 'success', labelAr: 'خبر سار ✅', labelEn: 'Success ✅' },
    { value: 'alert', labelAr: 'تنبيه 🔔', labelEn: 'Alert 🔔' },
    { value: 'urgent', labelAr: '🚨 إعلان اضطراري / عاجل', labelEn: '🚨 Urgent Emergency' },
    { value: 'survey', labelAr: '⭐ إعلان تقييم واستطلاع رأي إجباري', labelEn: '⭐ Rating & Feedback Survey' },
];

const EMPTY_FORM = {
    titleAr: '', titleEn: '',
    bodyAr: '', bodyEn: '',
    type: 'info', targetPath: '',
    actionTextAr: '', actionTextEn: '',
    isMandatory: false,
    pinned: false, active: true,
    expiresIn: '', // days from now, optional
};

const TARGET_OPTIONS = [
    { value: '/materials', ar: 'المواد الدراسية', en: 'Study Materials' },
    { value: '/plans', ar: 'الخطط الدراسية', en: 'Academic Plans' },
    { value: '/quiz', ar: 'الاختبارات', en: 'Quizzes' },
    { value: '/calendar', ar: 'التقويم الأكاديمي', en: 'Academic Calendar' },
    { value: '/grading', ar: 'نظام العلامات', en: 'Grading System' },
    { value: '/exchange', ar: 'تبادل المواد', en: 'Material Exchange' },
    { value: '/faq', ar: 'الأسئلة الشائعة', en: 'FAQ' },
    { value: '/about', ar: 'عن الموقع', en: 'About Us' },
];

const AdminNotices = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [notices, setNotices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'notices'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, snap => {
            setNotices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, []);

    const openNew = () => {
        setForm(EMPTY_FORM);
        setEditId(null);
        setShowForm(true);
    };

    const openEdit = (n) => {
        setForm({
            titleAr: n.titleAr || '', titleEn: n.titleEn || '',
            bodyAr: n.bodyAr || '', bodyEn: n.bodyEn || '',
            type: n.type || 'info', targetPath: n.targetPath || '',
            actionTextAr: n.actionTextAr || '', actionTextEn: n.actionTextEn || '',
            isMandatory: !!n.isMandatory,
            pinned: !!n.pinned, active: n.active !== false,
            expiresIn: '',
        });
        setEditId(n.id);
        setShowForm(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.titleAr && !form.titleEn) return;
        setSaving(true);
        try {
            const payload = {
                titleAr: form.titleAr,
                titleEn: form.titleEn,
                bodyAr: form.bodyAr,
                bodyEn: form.bodyEn,
                type: form.type,
                targetPath: form.targetPath,
                actionTextAr: form.actionTextAr,
                actionTextEn: form.actionTextEn,
                isMandatory: form.isMandatory,
                pinned: form.pinned,
                active: form.active,
                expiresAt: form.expiresIn
                    ? Timestamp.fromDate(new Date(Date.now() + parseInt(form.expiresIn) * 86400000))
                    : null,
            };
            if (editId) {
                await updateDoc(doc(db, 'notices', editId), payload);
            } else {
                await addDoc(collection(db, 'notices'), { ...payload, createdAt: serverTimestamp() });
            }
            setShowForm(false);
            setForm(EMPTY_FORM);
            setEditId(null);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(isAr ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete?')) return;
        await deleteDoc(doc(db, 'notices', id));
    };

    const toggleActive = async (n) => {
        await updateDoc(doc(db, 'notices', n.id), { active: !n.active });
    };

    const TYPE_COLOR = {
        info: '#3b82f6',
        warning: '#f59e0b',
        success: '#10b981',
        alert: '#e02b20',
        urgent: '#ef4444',
        survey: '#8b5cf6',
    };

    return (
        <div className="admin-panel-section admin-fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
                <h2 className="admin-section-title">
                    📢 <span>{isAr ? 'لوح الإعلانات' : 'Notice Board'}</span>
                </h2>
                <button className="admin-btn-primary" onClick={openNew}>
                    + {isAr ? 'إعلان جديد' : 'New Notice'}
                </button>
            </div>

            {/* ── FORM ── */}
            {showForm && (
                <div className="admin-glass-card" style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontWeight: 800, fontSize: '1rem' }}>
                        {editId ? (isAr ? '✏️ تعديل الإعلان' : '✏️ Edit Notice') : (isAr ? '➕ إضافة إعلان جديد' : '➕ Add New Notice')}
                    </h3>
                    <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>العنوان (عربي)</label>
                                <input value={form.titleAr} onChange={e => setForm(f => ({ ...f, titleAr: e.target.value }))}
                                    placeholder="عنوان الإعلان بالعربي" className="admin-input" dir="rtl" />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>Title (English)</label>
                                <input value={form.titleEn} onChange={e => setForm(f => ({ ...f, titleEn: e.target.value }))}
                                    placeholder="Notice title in English" className="admin-input" dir="ltr" />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>النص (عربي)</label>
                                <textarea value={form.bodyAr} onChange={e => setForm(f => ({ ...f, bodyAr: e.target.value }))}
                                    placeholder="نص الإعلان بالعربي" className="admin-input" rows={3} dir="rtl" style={{ resize: 'vertical' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>Body (English)</label>
                                <textarea value={form.bodyEn} onChange={e => setForm(f => ({ ...f, bodyEn: e.target.value }))}
                                    placeholder="Notice body in English" className="admin-input" rows={3} dir="ltr" style={{ resize: 'vertical' }} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>{isAr ? 'نص زر الإجراء (عربي - اختياري)' : 'Action Button Text (Arabic)'}</label>
                                <input value={form.actionTextAr} onChange={e => setForm(f => ({ ...f, actionTextAr: e.target.value }))}
                                    placeholder={isAr ? 'مثال: تقديم رأيي / انتقل الآن' : 'e.g. Submit Opinion'} className="admin-input" dir="rtl" />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>{isAr ? 'Action Button Text (English)' : 'Action Button Text (English)'}</label>
                                <input value={form.actionTextEn} onChange={e => setForm(f => ({ ...f, actionTextEn: e.target.value }))}
                                    placeholder="e.g. Go to section" className="admin-input" dir="ltr" />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>{isAr ? 'النوع' : 'Type'}</label>
                                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="admin-input" style={{ minWidth: '170px' }}>
                                    {TYPE_OPTIONS.map(t => (
                                        <option key={t.value} value={t.value}>{isAr ? t.labelAr : t.labelEn}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>{isAr ? 'القسم المستهدف' : 'Target section'}</label>
                                <select value={form.targetPath} onChange={e => setForm(f => ({ ...f, targetPath: e.target.value }))} className="admin-input" style={{ minWidth: '180px' }}>
                                    <option value="">{isAr ? 'بدون انتقال' : 'No destination'}</option>
                                    {TARGET_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{isAr ? option.ar : option.en}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 4 }}>{isAr ? 'ينتهي بعد (أيام)' : 'Expires in (days)'}</label>
                                <input type="number" min="1" max="365" value={form.expiresIn}
                                    onChange={e => setForm(f => ({ ...f, expiresIn: e.target.value }))}
                                    placeholder={isAr ? 'اختياري' : 'optional'} className="admin-input" style={{ width: '120px' }} />
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', marginTop: '18px', color: '#e11d48' }}>
                                <input type="checkbox" checked={form.isMandatory} onChange={e => setForm(f => ({ ...f, isMandatory: e.target.checked }))} />
                                🔒 {isAr ? 'إعلان/استطلاع إجباري (يمنع التخطي)' : 'Forced / Mandatory'}
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', marginTop: '18px' }}>
                                <input type="checkbox" checked={form.pinned} onChange={e => setForm(f => ({ ...f, pinned: e.target.checked }))} />
                                📌 {isAr ? 'مثبت' : 'Pinned'}
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', marginTop: '18px' }}>
                                <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                                ✅ {isAr ? 'نشط' : 'Active'}
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                            <button type="submit" className="admin-btn-primary" disabled={saving}>
                                {saving ? '⏳' : (editId ? (isAr ? '💾 حفظ التعديلات' : '💾 Save Changes') : (isAr ? '📢 نشر الإعلان' : '📢 Publish Notice'))}
                            </button>
                            <button type="button" onClick={() => setShowForm(false)}
                                style={{ padding: '8px 18px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── NOTICES LIST ── */}
            {loading ? (
                <div className="admin-loading-container"><div className="admin-spinner" /></div>
            ) : notices.length === 0 ? (
                <div className="admin-glass-card" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                    <p style={{ fontSize: '2rem', marginBottom: '8px' }}>📭</p>
                    <p>{isAr ? 'لا توجد إعلانات حتى الآن' : 'No notices yet'}</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {notices.map(n => (
                        <div key={n.id} className="admin-glass-card" style={{
                            display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '14px 18px',
                            borderLeft: `4px solid ${TYPE_COLOR[n.type] || '#ccc'}`,
                            opacity: n.active ? 1 : 0.45
                        }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                                    <strong style={{ fontSize: '0.95rem' }}>
                                        {n.titleAr || n.titleEn || '—'}
                                    </strong>
                                    {n.pinned && <span style={{ fontSize: '0.7rem', background: '#f59e0b22', color: '#f59e0b', padding: '1px 8px', borderRadius: '8px', fontWeight: 800 }}>📌 {isAr ? 'مثبت' : 'Pinned'}</span>}
                                    {n.isMandatory && <span style={{ fontSize: '0.7rem', background: '#e11d4822', color: '#e11d48', padding: '1px 8px', borderRadius: '8px', fontWeight: 800 }}>🔒 {isAr ? 'إجباري' : 'Mandatory'}</span>}
                                    <span style={{ fontSize: '0.7rem', background: (TYPE_COLOR[n.type] || '#ccc') + '22', color: TYPE_COLOR[n.type] || '#ccc', padding: '1px 8px', borderRadius: '8px', fontWeight: 800 }}>
                                        {n.type === 'survey' ? (isAr ? '⭐ استطلاع رأي وتقييم' : '⭐ Rating Survey') : n.type === 'urgent' ? (isAr ? '🚨 إعلان اضطراري' : '🚨 Urgent') : n.type}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', background: n.active ? '#10b98122' : '#9ca3af22', color: n.active ? '#10b981' : '#9ca3af', padding: '1px 8px', borderRadius: '8px', fontWeight: 800 }}>
                                        {n.active ? (isAr ? 'نشط' : 'Active') : (isAr ? 'متوقف' : 'Inactive')}
                                    </span>
                                </div>
                                {(n.bodyAr || n.bodyEn) && (
                                    <p style={{ fontSize: '0.82rem', opacity: 0.7, margin: 0, lineHeight: 1.5 }}>
                                        {n.bodyAr || n.bodyEn}
                                    </p>
                                )}
                                {n.expiresAt && (
                                    <p style={{ fontSize: '0.75rem', opacity: 0.45, margin: '4px 0 0' }}>
                                        ⏰ {isAr ? 'ينتهي:' : 'Expires:'} {new Date(n.expiresAt?.toMillis?.() || n.expiresAt).toLocaleDateString('ar-JO')}
                                    </p>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <button onClick={() => toggleActive(n)}
                                    title={n.active ? (isAr ? 'إيقاف' : 'Deactivate') : (isAr ? 'تفعيل' : 'Activate')}
                                    style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', background: n.active ? '#f97316' : '#10b981', color: '#fff' }}>
                                    {n.active ? '⏸' : '▶'}
                                </button>
                                <button onClick={() => openEdit(n)}
                                    style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', background: 'transparent' }}>
                                    ✏️
                                </button>
                                <button onClick={() => handleDelete(n.id)}
                                    style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', background: '#e02b20', color: '#fff' }}>
                                    🗑
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AdminNotices;
