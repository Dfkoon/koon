import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../config/firebase';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    writeBatch
} from 'firebase/firestore';
import {
    CheckCircle,
    XCircle,
    ExternalLink,
    FileText,
    Image as ImageIcon,
    Clock,
    Search,
    Filter,
    Trash2,
    CheckSquare,
    Square,
    Eye,
    ChevronLeft,
    ChevronRight,
    X,
    FileCheck,
    AlertCircle,
    BarChart3,
    Database,
    ArrowDown,
    FileEdit,
    Download,
    LayoutGrid,
    LayoutList,
    Layers,
    RotateCcw,
    Zap,
    ShieldCheck,
    Cpu,
    Maximize2,
    Calendar,
    User,
    Mail,
    Link as LinkIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Admin.css';

const AdminContributions = () => {
    // 1. States
    const [contributions, setContributions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [previewItem, setPreviewItem] = useState(null); // Used for the Detail Drawer
    const [fullScreenPreview, setFullScreenPreview] = useState(null); // Used for the large centered modal
    const [viewMode, setViewMode] = useState('grid');

    // Advanced Filters
    const [activeStatus, setActiveStatus] = useState('all');
    const [activeType, setActiveType] = useState('all');
    const [sortBy, setSortBy] = useState('newest');

    // 2. Memos for Filtered Data
    const filteredData = useMemo(() => {
        let result = contributions.filter(item => {
            const matchesStatus = activeStatus === 'all' || item.status === activeStatus;
            const matchesType = activeType === 'all' || item.contributionType === activeType;
            const matchesSearch =
                (item.subjectName || item.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.fileName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.contributionType || '').toLowerCase().includes(searchTerm.toLowerCase());

            return matchesStatus && matchesType && matchesSearch;
        });

        return [...result].sort((a, b) => {
            if (sortBy === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            if (sortBy === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
            if (sortBy === 'subject') return (a.subjectName || '').localeCompare(b.subjectName || '');
            if (sortBy === 'size') return (b.fileSize || 0) - (a.fileSize || 0);
            return 0;
        });
    }, [contributions, activeStatus, activeType, searchTerm, sortBy]);

    const stats = useMemo(() => {
        const total = contributions.length;
        const pending = contributions.filter(c => c.status === 'pending').length;
        const approved = contributions.filter(c => c.status === 'approved').length;
        const totalSize = contributions.reduce((acc, curr) => acc + (curr.fileSize || 0), 0);
        const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
        return { total, pending, approved, sizeInMB };
    }, [contributions]);

    // 3. Effects
    useEffect(() => {
        const q = query(
            collection(db, 'quizContributions'),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setContributions(data);
            setLoading(false);
        }, (error) => {
            console.error("Fetch error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // 4. Handlers
    const handleStatusUpdate = async (id, newStatus) => {
        try {
            await updateDoc(doc(db, 'quizContributions', id), {
                status: newStatus,
                updatedAt: new Date()
            });
            toast.success(newStatus === 'approved' ? 'تمت الموافقة بنجاح ✨' : 'تم رفض المساهمة');
            if (previewItem?.id === id) {
                setPreviewItem(prev => ({ ...prev, status: newStatus }));
            }
        } catch (error) {
            toast.error("خطأ في التحديث");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('هل أنت متأكد من الحذف النهائي لهذه المساهمة؟')) return;
        try {
            await deleteDoc(doc(db, 'quizContributions', id));
            toast.success('تم الحذف بنجاح');
            if (previewItem?.id === id) setPreviewItem(null);
        } catch (error) {
            toast.error("خطأ في الحذف");
        }
    };

    const handleBulkAction = async (action) => {
        if (selectedIds.size === 0) return;
        const batch = writeBatch(db);
        const toastId = toast.loading('جاري تنفيذ الإجراء الجماعي...');

        selectedIds.forEach(id => {
            const ref = doc(db, 'quizContributions', id);
            if (action === 'approve') batch.update(ref, { status: 'approved', updatedAt: new Date() });
            else if (action === 'delete') batch.delete(ref);
        });

        try {
            await batch.commit();
            setSelectedIds(new Set());
            toast.success('تمت العملية الجماعية بنجاح', { id: toastId });
        } catch (error) {
            toast.error("فشلت العملية", { id: toastId });
        }
    };

    const toggleSelect = (e, id) => {
        e.stopPropagation();
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) newSelected.delete(id);
        else newSelected.add(id);
        setSelectedIds(newSelected);
    };

    const getContributionLabel = (type) => {
        const labels = {
            'past_papers': 'أسئلة سنوات',
            'quizzes': 'كويزات',
            'summaries': 'ملخصات',
            'material_pdf': 'مادة PDF',
            'external_link': 'رابط خارجي'
        };
        return labels[type] || 'أخرى';
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '---';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    if (loading) return (
        <div className="admin-page-container">
            <div className="nexus-health-metrics">
                {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '100px', borderRadius: '24px' }}></div>)}
            </div>
        </div>
    );

    return (
        <div className="admin-page-container fade-in">
            {/* Health Metrics Header */}
            <div className="nexus-health-metrics">
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">إجمالي المساهمات</span>
                        <span className="metric-value">{stats.total}</span>
                    </div>
                    <div className="metric-icon-box blue">
                        <Database size={24} />
                    </div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">تنتظر المراجعة</span>
                        <span className="metric-value">{stats.pending}</span>
                    </div>
                    <div className="metric-icon-box red pulsing">
                        <Zap size={24} />
                    </div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">الحجم الإجمالي</span>
                        <span className="metric-value">{stats.sizeInMB} MB</span>
                    </div>
                    <div className="metric-icon-box orange">
                        <Cpu size={24} />
                    </div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">معدل القبول</span>
                        <span className="metric-value">
                            {stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%
                        </span>
                    </div>
                    <div className="metric-icon-box green">
                        <ShieldCheck size={24} />
                    </div>
                </div>
            </div>

            <div className="admin-header" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                        <h1 className="admin-page-title">مركز المساهمات والطلبات (Nexus)</h1>
                        <p className="admin-page-subtitle">إدارة الموارد الأكاديمية المقدمة من الطلاب بشكل حيّ</p>
                    </div>

                    <div className="topbar-search" style={{ margin: 0, width: '350px' }}>
                        <input
                            type="text"
                            placeholder="بحث في المواد، الملفات، أو الأنواع..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Filter Pills Header */}
            <div className="nexus-filters-bar" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="command-filter-group">
                    {['all', 'pending', 'approved'].map(s => (
                        <button
                            key={s}
                            className={`command-filter-btn ${activeStatus === s ? 'active' : ''}`}
                            onClick={() => setActiveStatus(s)}
                        >
                            {s === 'all' ? 'الكل' : s === 'pending' ? 'بانتظار الإجراء' : 'مقبول'}
                        </button>
                    ))}
                </div>
                <div className="command-filter-group" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>
                    {['all', 'past_papers', 'quizzes', 'summaries', 'material_pdf'].map(t => (
                        <button
                            key={t}
                            className={`command-filter-btn ${activeType === t ? 'active' : ''}`}
                            onClick={() => setActiveType(t)}
                        >
                            {t === 'all' ? 'جميع الأنواع' : getContributionLabel(t)}
                        </button>
                    ))}
                </div>

                <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem' }}>
                    <select className="nexus-select-mini" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                        <option value="newest">الأحدث أولاً</option>
                        <option value="oldest">الأقدم أولاً</option>
                        <option value="subject">حسب اسم المادة</option>
                        <option value="size">حسب الحجم</option>
                    </select>
                </div>
            </div>

            {/* Contribution Grid */}
            <div className="feedback-content-grid">
                <AnimatePresence mode='popLayout'>
                    {filteredData.map((item) => (
                        <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={`nexus-card contribution ${item.status} ${item.contributionType}`}
                            onClick={() => setPreviewItem(item)}
                        >
                            <div className="nexus-card-header">
                                <div className="nexus-author">
                                    <div className="nexus-avatar" onClick={(e) => toggleSelect(e, item.id)}>
                                        {selectedIds.has(item.id) ? <CheckSquare size={20} /> : <FileText size={20} />}
                                    </div>
                                    <div className="nexus-meta">
                                        <h3>{item.subjectName || 'مادة غير معروفة'}</h3>
                                        <div className="nexus-badges">
                                            <span className={`nexus-badge type-${item.contributionType}`}>
                                                {getContributionLabel(item.contributionType)}
                                            </span>
                                            <span className={`nexus-badge status-${item.status}`}>
                                                {item.status === 'pending' ? 'جديد' : 'مقبول'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="nexus-date">
                                    <Clock size={12} />
                                    {formatDate(item.createdAt)}
                                </div>
                            </div>

                            <div className="nexus-content">
                                <p style={{ fontSize: '0.9rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                    {item.fileName || 'رابط خارجي'}
                                </p>
                                {item.fileType === 'link' ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--admin-primary)', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                        <LinkIcon size={14} />
                                        <span>رابط مساهمة خارجي</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                        <Download size={14} />
                                        <span>{(item.fileSize / 1024).toFixed(1)} KB</span>
                                    </div>
                                )}
                            </div>

                            <div className="nexus-footer">
                                <div className="nexus-contact">
                                    <User size={14} />
                                    <span>{item.studentName || 'مساهمة مجهولة'}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="nexus-delete-btn"
                                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <button
                                        className={`nexus-action-btn ${item.status === 'approved' ? 'active' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleStatusUpdate(item.id, item.status === 'approved' ? 'pending' : 'approved');
                                        }}
                                    >
                                        <CheckCircle size={16} />
                                    </button>
                                </div>
                            </div>

                            {item.status === 'pending' && <div className="nexus-card-glow red"></div>}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {filteredData.length === 0 && (
                <div className="no-results-box" style={{ marginTop: '4rem', textAlign: 'center' }}>
                    <div className="no-results-icon" style={{ fontSize: '4rem', opacity: 0.2 }}>📁</div>
                    <h3 style={{ color: '#94a3b8' }}>لا توجد مساهمات مطابقة لهذا البحث</h3>
                </div>
            )}

            {/* Bulk Actions Power Bar */}
            <AnimatePresence>
                {selectedIds.size > 0 && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="bulk-editor-bar"
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                            <div className="bulk-count">
                                <span className="count-pill">{selectedIds.size}</span>
                                <span style={{ color: '#fff', fontWeight: '700' }}>عناصر مختارة</span>
                            </div>
                            <div className="bulk-actions-group">
                                <button className="nexus-btn primary" onClick={() => handleBulkAction('approve')}>
                                    موافقة جماعية ✨
                                </button>
                                <button className="nexus-btn secondary" onClick={() => handleBulkAction('delete')} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                                    حذف نهائي 🗑️
                                </button>
                            </div>
                        </div>
                        <button className="drawer-close" onClick={() => setSelectedIds(new Set())}>
                            <X size={20} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cinematic Resource Detail Drawer */}
            <AnimatePresence>
                {previewItem && (
                    <motion.div
                        className="nexus-drawer-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setPreviewItem(null)}
                    >
                        <motion.div
                            className="nexus-detail-drawer"
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="drawer-header">
                                <div className="drawer-title-box">
                                    <div className={`metric-icon-box ${previewItem.contributionType === 'external_link' ? 'blue' : 'green'}`} style={{ width: '40px', height: '40px' }}>
                                        {previewItem.contributionType === 'external_link' ? <LinkIcon size={20} /> : <FileText size={20} />}
                                    </div>
                                    <h2>تفاصيل المساهمة الأكاديمية</h2>
                                </div>
                                <button className="drawer-close" onClick={() => setPreviewItem(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="drawer-content luxe-scroll">
                                <div className="drawer-user-section">
                                    <div className="drawer-avatar">
                                        {previewItem.subjectName?.charAt(0) || '؟'}
                                    </div>
                                    <div className="drawer-user-info">
                                        <h3>{previewItem.subjectName}</h3>
                                        <p>{getContributionLabel(previewItem.contributionType)}</p>
                                    </div>
                                    <div className={`nexus-badge status-${previewItem.status}`} style={{ marginRight: 'auto' }}>
                                        {previewItem.status === 'pending' ? 'قيد المراجعة' : 'تم القبول ✅'}
                                    </div>
                                </div>

                                <div className="drawer-info-grid">
                                    <div className="info-box">
                                        <label>تاريخ الإرسال</label>
                                        <span>{formatDate(previewItem.createdAt)}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>حجم الملف</label>
                                        <span>{previewItem.fileType === 'link' ? '---' : `${(previewItem.fileSize / 1024).toFixed(1)} KB`}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>نوع الملف</label>
                                        <span>{previewItem.fileType?.toUpperCase()}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>كلمات مفتاحية</label>
                                        <span>{getContributionLabel(previewItem.contributionType)}</span>
                                    </div>
                                </div>

                                <div className="drawer-message-section">
                                    <label>اسم الملف / المرجع</label>
                                    <div className="message-content" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                        {previewItem.fileName || 'رابط خارجي بدون اسم ملف'}
                                    </div>
                                </div>

                                <div className="drawer-action-section" style={{ marginTop: '1.5rem' }}>
                                    <label style={{ color: 'var(--admin-primary)', marginBottom: '10px', display: 'block' }}>استعراض المحتوى</label>
                                    <div className="message-content" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px' }}>
                                        {/\.(jpg|jpeg|png|webp|gif)$/i.test(previewItem.fileUrl) ? (
                                            <div
                                                style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', width: '100%', textAlign: 'center' }}
                                                onClick={() => setFullScreenPreview(previewItem)}
                                                title="تكبير للصورة كاملة"
                                            >
                                                <img
                                                    src={previewItem.fileUrl}
                                                    alt="Preview"
                                                    style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', transition: 'transform 0.2s' }}
                                                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                />
                                                <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', pointerEvents: 'none' }}>
                                                    اضغط للتكبير
                                                </div>
                                            </div>
                                        ) : previewItem.fileType === 'application/pdf' || previewItem.fileType?.includes('pdf') || previewItem.fileUrl?.toLowerCase().endsWith('.pdf') ? (
                                            <div
                                                style={{ width: '100%', height: '400px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#fff', position: 'relative', cursor: 'pointer' }}
                                            >
                                                {/* Invisible overlay to catch clicks on the iframe */}
                                                <div
                                                    style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }}
                                                    onClick={() => setFullScreenPreview(previewItem)}
                                                    title="تكبير للملف كاملاً"
                                                />
                                                <iframe
                                                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewItem.fileUrl)}&embedded=true`}
                                                    width="100%"
                                                    height="100%"
                                                    title="PDF Preview"
                                                    style={{ border: 'none', pointerEvents: 'none' }}
                                                    tabIndex={-1}
                                                />
                                                <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 11 }}>
                                                    اضغط للتكبير
                                                </div>
                                            </div>

                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                                                <FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                                <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>ملف أو رابط خارجي لا يدعم المعاينة المباشرة</p>
                                            </div>
                                        )}
                                        <a
                                            href={previewItem.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="nexus-btn secondary"
                                            style={{ width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '0.5rem' }}
                                        >
                                            <ExternalLink size={16} /> فتح في نافذة جديدة / تحميل
                                        </a>
                                    </div>
                                </div>
                                <button
                                    className="nexus-btn secondary"
                                    onClick={() => handleDelete(previewItem.id)}
                                    style={{ flex: '0 0 50px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
                                >
                                    <Trash2 size={20} />
                                </button>
                                {previewItem.status === 'pending' ? (
                                    <button
                                        className="nexus-btn primary"
                                        onClick={() => handleStatusUpdate(previewItem.id, 'approved')}
                                    >
                                        الموافقة على النشر ✨
                                    </button>
                                ) : (
                                    <button
                                        className="nexus-btn secondary"
                                        onClick={() => handleStatusUpdate(previewItem.id, 'pending')}
                                    >
                                        إلغاء الموافقة
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- Full Screen Image/PDF Preview Modal --- */}
            <AnimatePresence>
                {fullScreenPreview && (
                    <motion.div
                        className="full-screen-preview-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setFullScreenPreview(null)}
                    >
                        <button className="full-screen-close" onClick={() => setFullScreenPreview(null)}>
                            <X size={32} />
                        </button>
                        <motion.div
                            className="full-screen-preview-content"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()} // Prevent click from closing overlay
                        >
                            {/\.(jpg|jpeg|png|webp|gif)$/i.test(fullScreenPreview.fileUrl) ? (
                                <img
                                    src={fullScreenPreview.fileUrl}
                                    alt="Full Size Preview"
                                    className="full-screen-img"
                                />
                            ) : fullScreenPreview.fileType === 'application/pdf' || fullScreenPreview.fileType?.includes('pdf') || fullScreenPreview.fileUrl?.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(fullScreenPreview.fileUrl)}&embedded=true`}
                                    className="full-screen-iframe"
                                    title="Full Screen PDF Preview"
                                />
                            ) : null}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminContributions;
