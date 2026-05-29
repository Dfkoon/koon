import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore';
import {
    Rocket,
    Trash2,
    CheckCircle2,
    Calendar,
    ExternalLink,
    AlertCircle,
    X,
    LayoutGrid,
    LayoutList,
    Search,
    User,
    Eye,
    Maximize2,
    Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Admin.css';

const AdminProjects = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [selectedItem, setSelectedItem] = useState(null); // For Detail Drawer
    const [fullScreenImage, setFullScreenImage] = useState(null);

    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, 'student_projects'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snap) => {
            setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Fetch projects error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا المشروع نهائياً؟')) return;
        try {
            await deleteDoc(doc(db, 'student_projects', id));
            toast.success('تم حذف المشروع');
            if (selectedItem?.id === id) setSelectedItem(null);
        } catch (error) {
            toast.error('حدث خطأ أثناء الحذف');
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            await updateDoc(doc(db, 'student_projects', id), {
                status: newStatus,
                updatedAt: serverTimestamp()
            });
            toast.success(newStatus === 'approved' ? 'تمت الموافقة على المشروع ✨' : 'تم تحديث الحالة');
            if (selectedItem?.id === id) setSelectedItem(prev => ({ ...prev, status: newStatus }));
        } catch (error) {
            toast.error('فشل تحديث الحالة');
        }
    };

    const filteredProjects = projects.filter(p =>
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Metrics
    const totalPending = projects.filter(p => p.status === 'pending' || !p.status).length;
    const totalApproved = projects.filter(p => p.status === 'approved').length;

    if (loading) return (
        <div className="admin-page-container">
            <div className="admin-stats-grid">
                {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '200px' }}></div>)}
            </div>
        </div>
    );

    return (
        <div className="admin-page-container fade-in">
            <div className="admin-header" style={{ marginBottom: '1.5rem' }}>
                <h1 className="admin-page-title">إدارة مشاريع الطلاب 🚀</h1>
                <p className="admin-page-subtitle">استعراض والموافقة على المشاريع التقنية والهندسية التي يرفعها الطلاب.</p>
            </div>

            {/* --- Health Metrics --- */}
            <section className="nexus-health-metrics">
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">إجمالي المشاريع</span>
                        <span className="metric-value">{projects.length}</span>
                    </div>
                    <div className="metric-icon-box blue"><Rocket size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">تنتظر المراجعة</span>
                        <span className="metric-value">{totalPending}</span>
                    </div>
                    <div className="metric-icon-box orange pulsing"><AlertCircle size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">مشاريع منشورة</span>
                        <span className="metric-value">{totalApproved}</span>
                    </div>
                    <div className="metric-icon-box green"><CheckCircle2 size={24} /></div>
                </div>
            </section>

            <div className="command-center-layout">
                {/* --- Horizontal Command Bar --- */}
                <section className="horizontal-command-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderLeft: '1px solid rgba(255,255,255,0.05)', paddingLeft: '1.5rem' }}>
                        <div className="search-box">
                            <Search size={18} />
                            <input
                                type="text"
                                placeholder="بحث في المشاريع..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className={`admin-btn-secondary ${viewMode === 'grid' ? 'active' : ''}`} style={{ padding: '0.6rem' }} onClick={() => setViewMode('grid')}>
                                <LayoutGrid size={18} />
                            </button>
                            <button className={`admin-btn-secondary ${viewMode === 'list' ? 'active' : ''}`} style={{ padding: '0.6rem' }} onClick={() => setViewMode('list')}>
                                <LayoutList size={18} />
                            </button>
                        </div>
                    </div>
                </section>

                <main className="main-explorer-grid">
                    <div className={viewMode === 'grid' ? 'feedback-content-grid' : 'feedback-list-view'}>
                        {filteredProjects.length > 0 ? (
                            filteredProjects.map((item) => (
                                <motion.div
                                    key={item.id}
                                    className={`nexus-card suggestion ${item.status === 'pending' || !item.status ? 'is-new' : ''}`}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => setSelectedItem(item)}
                                >
                                    {item.imageUrl && (
                                        <div className="nexus-card-image" style={{ height: '140px', overflow: 'hidden', borderRadius: '12px', marginBottom: '12px' }}>
                                            <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                    )}
                                    <div className="nexus-card-header">
                                        <div className="nexus-author">
                                            <div className="nexus-avatar" style={{ background: 'var(--admin-primary)' }}>
                                                <Rocket size={18} color="#fff" />
                                            </div>
                                            <div className="nexus-meta">
                                                <h3>{item.name}</h3>
                                                <div className="nexus-badges">
                                                    <span className={`nexus-badge status-${item.status || 'pending'}`}>
                                                        {item.status === 'approved' ? 'منشور' : 'بانتظار المراجعة'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            className="nexus-delete-btn"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div className="nexus-content">
                                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                            {item.description}
                                        </p>
                                    </div>

                                    <div className="nexus-footer">
                                        <div className="nexus-contact">
                                            <Calendar size={12} />
                                            <span>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('ar-EG') : '-'}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button className={`nexus-action-btn ${item.status === 'approved' ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); handleUpdateStatus(item.id, item.status === 'approved' ? 'pending' : 'approved'); }}>
                                                <CheckCircle2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        ) : <div className="admin-no-data">لا توجد مشاريع حالياً</div>}
                    </div>
                </main>
            </div>

            {/* Detail Drawer */}
            <AnimatePresence>
                {selectedItem && (
                    <motion.div
                        className="nexus-drawer-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedItem(null)}
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
                                    <Rocket size={20} color="var(--admin-primary)" />
                                    <h2>تفاصيل المشروع الطلابي</h2>
                                </div>
                                <button className="drawer-close" onClick={() => setSelectedItem(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="drawer-content luxe-scroll">
                                {selectedItem.imageUrl && (
                                    <div className="drawer-hero-image" style={{ marginBottom: '1.5rem', borderRadius: '16px', overflow: 'hidden', cursor: 'pointer', position: 'relative' }} onClick={() => setFullScreenImage(selectedItem.imageUrl)}>
                                        <img src={selectedItem.imageUrl} alt="" style={{ width: '100%', height: '220px', objectFit: 'cover' }} />
                                        <div style={{ position: 'absolute', bottom: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem' }}>
                                            <Maximize2 size={12} style={{ display: 'inline', marginInlineEnd: '4px' }} />
                                            تكبير الصورة
                                        </div>
                                    </div>
                                )}

                                <div className="drawer-user-section">
                                    <div className="drawer-avatar">🚀</div>
                                    <div className="drawer-user-info">
                                        <h3>{selectedItem.name}</h3>
                                        <p>مشروع مرفوع بواسطة طالب</p>
                                    </div>
                                    <div className={`nexus-badge status-${selectedItem.status || 'pending'}`} style={{ marginRight: 'auto' }}>
                                        {selectedItem.status === 'approved' ? 'تم النشر' : 'قيد المراجعة'}
                                    </div>
                                </div>

                                <div className="drawer-info-grid">
                                    <div className="info-box">
                                        <label>تاريخ الإرسال</label>
                                        <span>{selectedItem.createdAt?.toDate ? selectedItem.createdAt.toDate().toLocaleString('ar-EG') : '-'}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>الحالة الحالية</label>
                                        <span>{selectedItem.status === 'approved' ? 'منشور (Approved)' : 'معلق (Pending)'}</span>
                                    </div>
                                </div>

                                <div className="drawer-message-section">
                                    <label>وصف المشروع</label>
                                    <div className="message-content">
                                        {selectedItem.description}
                                    </div>
                                </div>

                                {selectedItem.link && (
                                    <div className="drawer-action-section" style={{ marginTop: '1rem' }}>
                                        <label>رابط المشروع الخارجي</label>
                                        <a href={selectedItem.link} target="_blank" rel="noopener noreferrer" className="nexus-btn secondary" style={{ width: '100%', justifyContent: 'center', marginTop: '8px' }}>
                                            <ExternalLink size={16} style={{ marginInlineEnd: '8px' }} />
                                            زيارة الرابط / معاينة المشروع
                                        </a>
                                    </div>
                                )}

                                <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.1)' }}>
                                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', gap: '8px' }}>
                                        <Info size={16} style={{ color: 'var(--admin-primary)', flexShrink: 0 }} />
                                        عند الضغط على "الموافقة على النشر"، سيظهر هذا المشروع فوراً لجميع زوار موقع "مكانك الجامعي" في معرض مشاريع الطلاب.
                                    </p>
                                </div>
                            </div>

                            <div className="drawer-footer">
                                <button className="nexus-btn secondary" onClick={() => setSelectedItem(null)}>إلغاء</button>
                                {selectedItem.status !== 'approved' ? (
                                    <button className="nexus-btn primary" onClick={() => handleUpdateStatus(selectedItem.id, 'approved')}>
                                        الموافقة على النشر ✨
                                    </button>
                                ) : (
                                    <button className="nexus-btn secondary" onClick={() => handleUpdateStatus(selectedItem.id, 'pending')} style={{ color: 'var(--admin-warning)' }}>
                                        إلغاء النشر
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Full Screen Image Preview */}
            <AnimatePresence>
                {fullScreenImage && (
                    <motion.div
                        className="full-screen-preview-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setFullScreenImage(null)}
                    >
                        <button className="full-screen-close" onClick={() => setFullScreenImage(null)}>
                            <X size={32} />
                        </button>
                        <motion.img
                            src={fullScreenImage}
                            alt="Project Full View"
                            className="full-screen-img"
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminProjects;
