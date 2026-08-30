import React, { useState, useEffect, useRef } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';

const fmtDate = (ts) => {
    if (!ts) return '—';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('ar-JO') + ' ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
};

const AdminReports = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    // Edit Question Modal states
    const [editingReport, setEditingReport] = useState(null);
    const [editForm, setEditForm] = useState({ questionAr: '', questionEn: '', options: [], correctAnswer: '', image: '' });
    const [editSaving, setEditSaving] = useState(false);
    const [imageUploading, setImageUploading] = useState(false);
    const [imageUploadProgress, setImageUploadProgress] = useState(0);
    const imageInputRef = useRef(null);

    useEffect(() => {
        const qRep = query(collection(db, 'question_reports'), orderBy('createdAt', 'desc'), limit(100));
        const unsub = onSnapshot(qRep, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Failed to load reports:", err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const resolveReport = async (id) => {
        try {
            await updateDoc(doc(db, 'question_reports', id), { status: 'resolved' });
            toast.success(isAr ? 'تم تمييز البلاغ كمحلول' : 'Marked report resolved');
        } catch (err) {
            console.error('Error resolving report:', err);
            toast.error((isAr ? 'تعذر تعديل البلاغ: ' : 'Failed to resolve report: ') + (err.message || err));
        }
    };

    const deleteReport = async (id) => {
        if (!window.confirm(isAr ? 'هل تريد حذف هذا البلاغ؟' : 'Delete this report?')) return;
        try {
            await deleteDoc(doc(db, 'question_reports', id));
            toast.success(isAr ? 'تم حذف البلاغ بنجاح' : 'Report deleted');
        } catch (err) {
            console.error('Error deleting report:', err);
            toast.error((isAr ? 'تعذر حذف البلاغ: ' : 'Failed to delete report: ') + (err.message || err));
        }
    };

    // Modal helpers
    const openEditModal = (r) => {
        setEditingReport(r);
        setEditForm({
            questionAr: r.questionAr || '',
            questionEn: r.questionEn || '',
            options: r.options ? r.options.map(o => ({ ...o })) : [],
            correctAnswer: r.correctAnswer || '',
            image: r.image || '',
        });
    };

    const closeEditModal = () => setEditingReport(null);

    const updateOption = (idx, field, val) => {
        setEditForm(prev => ({
            ...prev,
            options: prev.options.map((o, i) => i === idx ? { ...o, [field]: val } : o),
        }));
    };

    const deleteOption = (idx) => {
        setEditForm(prev => {
            const opt = prev.options[idx];
            return {
                ...prev,
                options: prev.options.filter((_, i) => i !== idx),
                correctAnswer: prev.correctAnswer === opt?.id ? '' : prev.correctAnswer,
            };
        });
    };

    const addOption = () => {
        const newId = `opt_${Date.now()}`;
        setEditForm(prev => ({
            ...prev,
            options: [...prev.options, { id: newId, textAr: '', textEn: '' }]
        }));
    };

    const saveQuestionEdit = async () => {
        if (!editingReport) return;
        setEditSaving(true);
        try {
            const editKey = `${editingReport.quizId}_${editingReport.questionId}`;
            const payload = {
                quizId: editingReport.quizId,
                questionId: editingReport.questionId,
                questionAr: editForm.questionAr,
                questionEn: editForm.questionEn,
                options: editForm.options,
                correctAnswer: editForm.correctAnswer,
                updatedAt: serverTimestamp(),
            };
            if (editForm.image) payload.image = editForm.image;
            else payload.image = null;

            await setDoc(doc(db, 'question_edits', editKey), payload);
            await updateDoc(doc(db, 'question_reports', editingReport.id), {
                status: 'resolved',
                questionAr: editForm.questionAr,
                questionEn: editForm.questionEn,
                options: editForm.options,
                correctAnswer: editForm.correctAnswer,
                ...(editForm.image ? { image: editForm.image } : { image: null }),
            });
            toast.success(isAr ? '✅ تم حفظ تعديل السؤال وإغلاق البلاغ' : '✅ Question edit saved & report resolved');
            closeEditModal();
        } catch (e) {
            console.error(e);
            toast.error(isAr ? 'خطأ في الحفظ' : 'Save failed');
        } finally {
            setEditSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-loading-container">
                <div className="admin-spinner" />
                <p>{isAr ? 'جاري تحميل بلاغات الأسئلة...' : 'Loading flagged reports...'}</p>
            </div>
        );
    }

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <h3 className="admin-section-title"> <span>{isAr ? 'بلاغات الأطاء في الأسئلة' : 'Flagged Questions Reports'}</span></h3>

            {reports.length === 0 ? (
                <div className="admin-empty-state">
                    <div className="empty-icon"></div>
                    <p>{isAr ? 'لا توجد بلاغات معلق حالياً' : 'No flagged questions reports'}</p>
                </div>
            ) : (
                <div className="reports-list-container">
                    {reports.map(r => (
                        <div key={r.id} className={`report-card ${r.status === 'resolved' ? 'resolved' : 'pending'}`}>
                            <div className="report-card-header">
                                <span className="report-card-quiz-title">🎯 {r.quizTitle || r.quizId}</span>
                                {r.subjectName && <span className="report-card-subject">📁 {r.subjectName}</span>}
                                <span className={`badge ${r.status === 'resolved' ? 'badge-resolved' : 'badge-pending'}`}>
                                    {r.status === 'resolved' ? (isAr ? 'محلول' : 'Resolved') : (isAr ? 'معلّق' : 'Pending')}
                                </span>
                                <span className="report-card-date">📅 {fmtDate(r.createdAt)}</span>
                            </div>
                            
                            {r.questionAr && (
                                <div className="report-card-question">
                                    <strong>{isAr ? 'السؤال (عربي):' : 'Question (AR):'}</strong>
                                    <p>{r.questionAr}</p>
                                </div>
                            )}
                            
                            {r.questionEn && (
                                <div className="report-card-question">
                                    <strong>{isAr ? 'السؤال (إنجليزي):' : 'Question (EN):'}</strong>
                                    <p>{r.questionEn}</p>
                                </div>
                            )}

                            {(r.studentNote || r.note || r.userComment || r.comment) && (
                                <div className="report-card-note" style={{
                                    background: 'rgba(156, 39, 176, 0.08)',
                                    borderRight: '4px solid #9c27b0',
                                    borderLeft: 'none',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    marginTop: '12px',
                                    marginBottom: '12px'
                                }}>
                                    <strong style={{ color: '#7b1fa2', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', marginBottom: '4px' }}>
                                        💡 {isAr ? 'ملاحظ الطالب المكتوب:' : 'Student Note:'}
                                    </strong>
                                    <span style={{ fontSize: '0.92rem', color: '#2c3e50', fontWeight: 600, display: 'block', lineHeight: 1.5 }}>
                                        {r.studentNote || r.note || r.userComment || r.comment}
                                    </span>
                                </div>
                            )}

                            <div className="report-card-actions">
                                <button className="admin-action-btn edit-q" onClick={() => openEditModal(r)}>
                                    ✏️ {isAr ? 'تعديل السؤال وتصحيحه' : 'Edit Question'}
                                </button>
                                {r.status !== 'resolved' && (
                                    <button className="admin-action-btn resolve" onClick={() => resolveReport(r.id)}>
                                        ✅ {isAr ? 'حل بدون تعديل' : 'Resolve Directly'}
                                    </button>
                                )}
                                <button className="admin-action-btn reject" onClick={() => deleteReport(r.id)}>
                                    🗑️ {isAr ? 'حذف البلاغ' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* EDIT QUESTION DIALOG */}
            {editingReport && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-card">
                        <div className="admin-modal-header">
                            <h4>✏️ {isAr ? 'تعديل وتصحيح السؤال' : 'Edit & Correct Question'}</h4>
                            <button className="close-btn" onClick={closeEditModal}>&times;</button>
                        </div>
                        <div className="admin-modal-body">
                            <div className="qedit-field">
                                <label className="qedit-label">{isAr ? 'نص السؤال (عربي):' : 'Question Text (AR):'}</label>
                                <textarea
                                    className="admin-textarea-field"
                                    value={editForm.questionAr}
                                    onChange={e => setEditForm({ ...editForm, questionAr: e.target.value })}
                                />
                            </div>

                            <div className="qedit-field" style={{ marginTop: '1rem' }}>
                                <label className="qedit-label">{isAr ? 'نص السؤال (إنجليزي):' : 'Question Text (EN):'}</label>
                                <textarea
                                    className="admin-textarea-field"
                                    value={editForm.questionEn}
                                    onChange={e => setEditForm({ ...editForm, questionEn: e.target.value })}
                                    dir="ltr"
                                />
                            </div>

                            {/* Options */}
                            <div className="qedit-options-section" style={{ marginTop: '1.5rem' }}>
                                <label className="qedit-label" style={{ fontWeight: 'bold' }}>🎯 {isAr ? 'الخيارات المتاح:' : 'Options:'}</label>
                                <div className="qedit-options-list">
                                    {editForm.options.map((opt, idx) => (
                                        <div key={opt.id} className="qedit-option-row">
                                            <input
                                                type="radio"
                                                name="correctAnswer"
                                                checked={editForm.correctAnswer === opt.id}
                                                onChange={() => setEditForm({ ...editForm, correctAnswer: opt.id })}
                                                title={isAr ? 'تحديد كإجاب صحيح' : 'Mark as correct'}
                                            />
                                            <input
                                                type="text"
                                                className="admin-input-field option-input"
                                                value={opt.textAr || ''}
                                                onChange={e => updateOption(idx, 'textAr', e.target.value)}
                                                placeholder={isAr ? 'الخيار بالعربي' : 'Option (AR)'}
                                            />
                                            <input
                                                type="text"
                                                className="admin-input-field option-input"
                                                value={opt.textEn || ''}
                                                onChange={e => updateOption(idx, 'textEn', e.target.value)}
                                                placeholder="Option (EN)"
                                                dir="ltr"
                                            />
                                            <button type="button" className="admin-action-btn reject mini" onClick={() => deleteOption(idx)}>🗑️</button>
                                        </div>
                                    ))}
                                </div>
                                <button type="button" className="admin-action-btn approve" style={{ marginTop: '0.8rem', fontSize: '0.82rem' }} onClick={addOption}>
                                    + {isAr ? 'إضافة يار جديد' : 'Add Option'}
                                </button>
                            </div>

                            {/* Image Upload Zone */}
                            <div className="qedit-field" style={{ marginTop: '1.5rem' }}>
                                <label className="qedit-label">🖼️ {isAr ? 'صور السؤال (اختياري):' : 'Question Image (optional):'}</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (file.size > 10 * 1024 * 1024) {
                                            toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 10 ميجا بايت' : 'Image must be under 10MB');
                                            return;
                                        }
                                        setImageUploading(true);
                                        setImageUploadProgress(20);
                                        try {
                                            const compressed = await new Promise((resolve, reject) => {
                                                const img = new Image();
                                                const url = URL.createObjectURL(file);
                                                img.onload = () => {
                                                    URL.revokeObjectURL(url);
                                                    const MAX = 800;
                                                    let w = img.width, h = img.height;
                                                    if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                                                    const canvas = document.createElement('canvas');
                                                    canvas.width = w; canvas.height = h;
                                                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                                                    resolve(canvas.toDataURL('image/jpeg', 0.78));
                                                };
                                                img.onerror = reject;
                                                img.src = url;
                                            });
                                            setImageUploadProgress(100);
                                            setEditForm(prev => ({ ...prev, image: compressed }));
                                        } catch (err) {
                                            console.error(err);
                                            toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
                                        } finally {
                                            setImageUploading(false);
                                            setImageUploadProgress(0);
                                        }
                                    }}
                                />

                                {!editForm.image && !imageUploading && (
                                    <div className="image-dropzone" onClick={() => imageInputRef.current?.click()}>
                                        <span>📷</span>
                                        <p>{isAr ? 'اضغط لاختيار صور من جهازك' : 'Click to select image'}</p>
                                    </div>
                                )}

                                {imageUploading && (
                                    <div className="image-uploading-bar-container">
                                        <div className="upload-progress-fill" style={{ width: `${imageUploadProgress}%` }} />
                                        <span>{isAr ? 'جاري التحميل...' : 'Uploading...'}</span>
                                    </div>
                                )}

                                {editForm.image && !imageUploading && (
                                    <div className="image-preview-container">
                                        <img src={editForm.image} alt="Question preview" />
                                        <button type="button" className="admin-action-btn reject" onClick={() => setEditForm({ ...editForm, image: '' })}>
                                            {isAr ? 'حذف الصور' : 'Remove Image'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="admin-modal-footer">
                            <button type="button" className="admin-action-btn approve" onClick={saveQuestionEdit} disabled={editSaving}>
                                {editSaving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ التغييرات' : 'Save Changes')}
                            </button>
                            <button type="button" className="admin-action-btn decline" onClick={closeEditModal} disabled={editSaving}>
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminReports;
