import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { subscribeToContributions, approveContribution } from '../../services/contributionsService';
import FileUploader from '../FileUploader';
import toast from 'react-hot-toast';
import { archiveItem } from '../../services/deletedItemsService';

const fmtDate = (ts) => {
    if (!ts) return '—';
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleDateString('ar-JO') + ' ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
};

const AdminContributions = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [contributions, setContributions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');
    const [showUploader, setShowUploader] = useState(false);
    const [previewFile, setPreviewFile] = useState(null); // { url, type, name }

    useEffect(() => {
        const unsub = subscribeToContributions((list) => {
            setContributions(list.filter(item => !item.deleted));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleApprove = async (id) => {
        const res = await approveContribution(id);
        if (res.success) {
            toast.success(isAr ? 'تمت الموافق على المساهمة' : 'Contribution approved');
        } else {
            toast.error(isAr ? 'خطأ في التحديث' : 'Update failed');
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm(isAr ? 'هل تريد حذف هذه المساهمة نهائياً؟' : 'Delete this contribution permanently?')) return;
        const contribution = contributions.find(item => item.id === id);
        try {
            await archiveItem({ originalCollection: 'quizContributions', originalId: id, itemData: contribution || { id }, reason: 'contribution-deletion' });
            setContributions(current => current.filter(item => item.id !== id));
            toast.success(isAr ? 'تم نقل المساهمة إلى المحذوفات' : 'Contribution moved to deleted items');
        } catch {
            toast.error(isAr ? 'خطأ في الأرشفة' : 'Archive error');
        }
    };

    if (loading) {
        return (
            <div className="admin-loading-container">
                <div className="admin-spinner" />
                <p>{isAr ? 'جاري تحميل مساهمات الطلاب...' : 'Loading student contributions...'}</p>
            </div>
        );
    }

    const filtered = contributions.filter(c => filterStatus === 'all' ? true : c.status === filterStatus);

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
                <h3 className="admin-section-title" style={{ margin: 0 }}>📁 <span>{isAr ? 'مساهمات الطلاب الوارد' : 'Student Contributions'}</span></h3>
                <button
                    className="admin-action-btn approve"
                    onClick={() => setShowUploader(true)}
                    style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.9rem' }}
                >
                    📤 {isAr ? 'رفع مساهم جديد' : 'Upload Contribution'}
                </button>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                {isAr ? 'هذه المساهمةات تأتي من قسم "ساهم في إثراء محتوى مكانك" في صفحات المواد والاختبارات.' : 'These contributions come from the "Share & Enrich Makanak Content" section.'}
            </p>

            <div className="admin-filter-row" style={{ marginBottom: '1.5rem' }}>
                <div className="filter-group">
                    <label>{isAr ? 'حال المساهمة:' : 'Contribution Status:'}</label>
                    <select className="admin-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                        <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                        <option value="pending">{isAr ? 'قيد الانتظار' : 'Pending'}</option>
                        <option value="approved">{isAr ? 'مُوافق عليها' : 'Approved'}</option>
                    </select>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="admin-empty-state">
                    <div className="empty-icon">📭</div>
                    <p>{isAr ? 'لا توجد مساهمات بهذه الحال حالياً' : 'No contributions for this status yet'}</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    {filtered.map(contribution => {
                        const ft = (contribution.fileType || '').toLowerCase();
                        const fu = (contribution.fileUrl || '').toLowerCase();
                        const isImage = /^(png|jpg|jpeg|gif|webp|svg)$/.test(ft) || /image\//.test(ft) || /\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/.test(fu);
                        const isPdf = ft === 'pdf' || /application\/pdf/.test(ft) || /\.pdf(\?|$)/.test(fu);
                        const isLink = ft === 'link';

                        return (
                            <div key={contribution.id} className={`contribution-card ${contribution.status === 'approved' ? 'approved' : 'pending'}`}>
                                <div className="contribution-card-header">
                                    <div>
                                        <strong>{contribution.studentName || (isAr ? 'طالب مجهول' : 'Anonymous Student')}</strong>
                                        <span className="contribution-meta">{contribution.subjectName || (isAr ? 'عام' : 'General')} · {contribution.contributionType || (isAr ? 'نوع غير محدد' : 'Unspecified')}</span>
                                    </div>
                                    <span className={`badge ${contribution.status === 'approved' ? 'badge-approved' : 'badge-pending'}`}>
                                        {contribution.status === 'approved' ? (isAr ? 'مُوافق عليها' : 'Approved') : (isAr ? 'قيد الانتظار' : 'Pending')}
                                    </span>
                                </div>

                                <div className="contribution-card-body">
                                    {isLink ? (
                                        <a href={contribution.fileUrl} target="_blank" rel="noopener noreferrer" className="contribution-link-anchor">
                                            🔗 {contribution.fileUrl}
                                        </a>
                                    ) : isImage ? (
                                        <div
                                            className="contribution-media-preview zoomable"
                                            onClick={() => setPreviewFile({ url: contribution.fileUrl, type: ft || 'image', name: contribution.fileName })}
                                            title={isAr ? 'اضغط للمعاين الكامل' : 'Click for full preview'}
                                        >
                                            <img
                                                src={contribution.fileUrl}
                                                alt={contribution.fileName || 'preview'}
                                            />
                                            <div className="preview-overlay">
                                                🔍 {isAr ? 'تكبير الصور' : 'Zoom Image'}
                                            </div>
                                        </div>
                                    ) : isPdf ? (
                                        <div
                                            className="contribution-media-preview pdf-preview"
                                            onClick={() => setPreviewFile({ url: contribution.fileUrl, type: 'pdf', name: contribution.fileName })}
                                            title={isAr ? 'اضغط للمعاين الكامل' : 'Click for full preview'}
                                        >
                                            <iframe
                                                src={`${contribution.fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                                title={contribution.fileName || 'PDF'}
                                                style={{ width: '100%', height: '160px', border: 'none', pointerEvents: 'none', background: '#fff' }}
                                            />
                                            <div className="preview-overlay">
                                                📄 {isAr ? 'اضغط لفتح ملف PDF' : 'Open PDF'}
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className="contribution-media-preview unknown-preview"
                                            onClick={() => setPreviewFile({ url: contribution.fileUrl, type: ft, name: contribution.fileName })}
                                        >
                                            <span style={{ fontSize: '2rem' }}>📎</span>
                                            <span>{contribution.fileName || (isAr ? 'ملف مرفق' : 'Attached file')}</span>
                                        </div>
                                    )}
                                    <p className="contribution-date">{fmtDate(contribution.createdAt)}</p>
                                </div>

                                <div className="contribution-card-actions">
                                    {contribution.status !== 'approved' && (
                                        <button className="admin-action-btn approve" onClick={() => handleApprove(contribution.id)}>
                                            ✅ {isAr ? 'موافق وقبول' : 'Approve'}
                                        </button>
                                    )}
                                    <button className="admin-action-btn reject" onClick={() => handleDelete(contribution.id)}>
                                        🗑️ {isAr ? 'رفض وحذف' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* File Zoom Overlay */}
            {previewFile && (
                <div className="admin-modal-overlay" onClick={() => setPreviewFile(null)}>
                    <div className="admin-modal-card preview-modal-card" onClick={e => e.stopPropagation()}>
                        <div className="admin-modal-header">
                            <h4>🔍 {previewFile.name || (isAr ? 'معاينة الملف' : 'File Preview')}</h4>
                            <button className="close-btn" onClick={() => setPreviewFile(null)}>&times;</button>
                        </div>
                        <div className="admin-modal-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '350px' }}>
                            {previewFile.type === 'pdf' ? (
                                <iframe src={previewFile.url} title="PDF Preview" style={{ width: '100%', height: '60vh', border: 'none' }} />
                            ) : (
                                <img src={previewFile.url} alt="Preview" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }} />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Uploader Popup Modal */}
            {showUploader && <FileUploader onClose={() => setShowUploader(false)} />}
        </div>
    );
};

export default AdminContributions;
