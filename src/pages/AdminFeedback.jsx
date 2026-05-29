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
    MessageCircle,
    Star,
    Trash2,
    CheckCircle2,
    Calendar,
    User,
    Mail,
    Phone,
    Filter,
    Search,
    Clock,
    LayoutGrid,
    LayoutList,
    MoreHorizontal,
    Edit3,
    CheckSquare,
    AlertCircle,
    X,
    MessageSquare,
    Library
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Admin.css';

const AdminFeedback = () => {
    const [activeTab, setActiveTab] = useState('suggestions'); // suggestions, testimonials, resources
    const [suggestions, setSuggestions] = useState([]);
    const [testimonials, setTestimonials] = useState([]);
    const [resourceSuggestions, setResourceSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [selectedItem, setSelectedItem] = useState(null); // For Note/Response Modal
    const [responseNote, setResponseNote] = useState('');
    const [processingStatus, setProcessingStatus] = useState('pending');

    useEffect(() => {
        setLoading(true);
        // Suggestions Listener
        const qS = query(collection(db, 'suggestions'), orderBy('timestamp', 'desc'));
        const unsubS = onSnapshot(qS, (snap) => {
            setSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Testimonials Listener
        const qT = query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'));
        const unsubT = onSnapshot(qT, (snap) => {
            setTestimonials(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Resource Suggestions Listener
        const qR = query(collection(db, 'resource_suggestions'), orderBy('createdAt', 'desc'));
        const unsubR = onSnapshot(qR, (snap) => {
            setResourceSuggestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        setLoading(false);
        return () => { unsubS(); unsubT(); unsubR(); };
    }, []);

    const handleDelete = async (collectionName, id) => {
        if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
        try {
            await deleteDoc(doc(db, collectionName, id));
            toast.success('تم الحذف بنجاح');
        } catch (error) {
            toast.error('حدث خطأ أثناء الحذف');
        }
    };

    const handleUpdateProcessing = async (id) => {
        try {
            await updateDoc(doc(db, 'suggestions', id), {
                status: processingStatus,
                adminResponse: responseNote,
                respondedAt: serverTimestamp()
            });
            toast.success('تم تحديث حالة المعالجة');
            setSelectedItem(null);
        } catch (error) {
            toast.error('فشل تحديث المعالجة');
        }
    };

    const handleToggleTestimonial = async (id, currentStatus) => {
        try {
            await updateDoc(doc(db, 'testimonials', id), {
                status: currentStatus === 'approved' ? 'pending' : 'approved',
                approved: currentStatus !== 'approved'
            });
            toast.success('تم تحديث حالة العرض');
        } catch (error) {
            toast.error('فشل التحديث');
        }
    };

    const filteredSuggestions = suggestions.filter(s =>
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.type || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredTestimonials = testimonials.filter(t =>
        (t.studentName || t.author || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.feedback || t.quote || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredResources = resourceSuggestions.filter(r =>
        (r.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.subject || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openResponseModal = (item) => {
        setSelectedItem(item);
        setResponseNote(item.adminResponse || '');
        setProcessingStatus(item.status || 'pending');
        // If it's new and we open it, mark as processing automatically? 
        // Let's keep it manual for now but maybe mark it as 'read' if we had a read flag.
    };

    // Metrics calculation
    const totalRequests = suggestions.length + testimonials.length + resourceSuggestions.length;
    const totalNew = suggestions.filter(s => s.status === 'new' || !s.status).length + resourceSuggestions.filter(r => r.status === 'pending' || !r.status).length;
    const totalProcessing = suggestions.filter(s => s.status === 'processing').length;
    const totalResolved = suggestions.filter(s => s.status === 'resolved').length + resourceSuggestions.filter(r => r.status === 'resolved').length;
    const resolutionRate = totalRequests > 0 ? Math.round((totalResolved / totalRequests) * 100) : 0;

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
                <h1 className="admin-page-title">إدارة التفاعل والآراء</h1>
                <p className="admin-page-subtitle">مركز قيادة آراء الطلاب والشكاوى التقنية</p>
            </div>

            {/* --- Health Metrics Nexus Header --- */}
            <section className="nexus-health-metrics">
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">إجمالي الطلبات</span>
                        <span className="metric-value">{totalRequests}</span>
                    </div>
                    <div className="metric-icon-box blue"><MessageCircle size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">طلبات معلقة</span>
                        <span className="metric-value">{totalNew}</span>
                    </div>
                    <div className="metric-icon-box red pulsing"><AlertCircle size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">قيد المعالجة</span>
                        <span className="metric-value">{totalProcessing}</span>
                    </div>
                    <div className="metric-icon-box orange"><Clock size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">معدل الإنجاز</span>
                        <span className="metric-value">{resolutionRate}%</span>
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
                                placeholder="بحث في الملاحظات..."
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

                    <div className="filter-sections-wrapper">
                        <div className="filter-section">
                            <span className="filter-section-title">التبويب الحالي</span>
                            <div className="command-filter-group">
                                <button
                                    className={`command-filter-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('suggestions')}
                                >
                                    <MessageCircle size={16} /> المقترحات ({suggestions.length})
                                </button>
                                <button
                                    className={`command-filter-btn ${activeTab === 'testimonials' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('testimonials')}
                                >
                                    <Star size={16} /> آراء الطلاب ({testimonials.length})
                                </button>
                                <button
                                    className={`command-filter-btn ${activeTab === 'resources' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('resources')}
                                >
                                    <Library size={16} /> اقتراحات المصادر ({resourceSuggestions.length})
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <main className="main-explorer-grid">
                    <div className={viewMode === 'grid' ? 'feedback-content-grid' : 'feedback-list-view'}>
                        {activeTab === 'suggestions' ? (
                            filteredSuggestions.length > 0 ? (
                                filteredSuggestions.map((item, index) => (
                                    <motion.div
                                        key={item.id}
                                        className={`nexus-card suggestion ${item.type} ${item.status === 'new' || !item.status ? 'is-new' : ''}`}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.4 }}
                                        onClick={() => openResponseModal(item)}
                                    >
                                        <div className="nexus-card-glow"></div>
                                        <div className="nexus-card-header">
                                            <div className="nexus-author">
                                                <div className="nexus-avatar" data-type={item.type}>
                                                    {item.name?.charAt(0) || 'S'}
                                                </div>
                                                <div className="nexus-meta">
                                                    <h3>{item.name || 'مجهول'}</h3>
                                                    <div className="nexus-badges">
                                                        <span className={`nexus-badge type-${item.type}`}>
                                                            {item.type === 'complaint' ? 'شكوى' : item.type === 'technical' ? 'عطل' : 'اقتراح'}
                                                        </span>
                                                        <span className={`nexus-badge status-${item.status || 'new'}`}>
                                                            {item.status === 'resolved' ? 'منتهي' : item.status === 'processing' ? 'معالجة' : 'جديد'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                className="nexus-delete-btn"
                                                onClick={(e) => { e.stopPropagation(); handleDelete('suggestions', item.id); }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>

                                        <div className="nexus-content">
                                            <p>{item.message}</p>
                                        </div>

                                        <div className="nexus-footer">
                                            <div className="nexus-contact">
                                                <Mail size={12} />
                                                <span>{item.contact || 'N/A'}</span>
                                            </div>
                                            <div className="nexus-date">
                                                <Calendar size={12} />
                                                <span>{item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString('ar-EG') : '-'}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            ) : <div className="admin-no-data">لا توجد رسائل تناسب بحثك</div>
                        ) : activeTab === 'resources' ? (
                            filteredResources.length > 0 ? (
                                filteredResources.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        className={`nexus-card suggestion resource ${item.status === 'pending' || !item.status ? 'is-new' : ''}`}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        onClick={() => openResponseModal(item)}
                                    >
                                        <div className="nexus-card-header">
                                            <div className="nexus-author">
                                                <div className="nexus-avatar" style={{ background: 'var(--admin-secondary)' }}>
                                                    <Library size={18} color="#fff" />
                                                </div>
                                                <div className="nexus-meta">
                                                    <h3>{item.title || item.name || 'بدون عنوان'}</h3>
                                                    <div className="nexus-badges">
                                                        <span className="nexus-badge type-technical">{item.subject || 'اقتراح مادة'}</span>
                                                        <span className={`nexus-badge status-${item.status || 'pending'}`}>
                                                            {item.status === 'resolved' ? 'تم الحل' : 'قيد المراجعة'}
                                                        </span>
                                                        {item.type && (
                                                            <span className="nexus-badge type-suggestion">
                                                                {item.type === 'suggestion' ? 'اقتراح' : item.type}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                className="nexus-delete-btn"
                                                onClick={(e) => { e.stopPropagation(); handleDelete('resource_suggestions', item.id); }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="nexus-content">
                                            <p>{item.description || item.message}</p>
                                        </div>
                                        <div className="nexus-footer">
                                            <div className="nexus-date">
                                                <Calendar size={12} />
                                                <span>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('ar-EG') : '-'}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))
                            ) : <div className="admin-no-data">لا توجد اقتراحات حالياً</div>
                        ) : (
                            filteredTestimonials.length > 0 ? (
                                filteredTestimonials.map((item, index) => (
                                    <motion.div
                                        key={item.id}
                                        className={`nexus-card testimonial ${item.status === 'approved' ? 'approved' : ''}`}
                                        layout
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        transition={{ duration: 0.4 }}
                                    >
                                        <div className="nexus-card-glow"></div>
                                        <div className="nexus-card-header">
                                            <div className="nexus-author">
                                                <img src={item.avatar} alt="" className="nexus-avatar rounded" />
                                                <div className="nexus-meta">
                                                    <h3>{item.studentName || item.author}</h3>
                                                    <span className="nexus-subtitle">{item.specialization || item.major}</span>
                                                </div>
                                            </div>
                                            <div className="nexus-actions">
                                                <button
                                                    className={`nexus-action-btn ${item.status === 'approved' ? 'active' : ''}`}
                                                    onClick={() => handleToggleTestimonial(item.id, item.status)}
                                                    title={item.status === 'approved' ? 'إخفاء' : 'عرض'}
                                                >
                                                    <CheckCircle2 size={16} />
                                                </button>
                                                <button className="nexus-action-btn delete" onClick={() => handleDelete('testimonials', item.id)}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="nexus-quote">"{item.feedback || item.quote}"</p>
                                        <div className="nexus-footer">
                                            <div className="nexus-date">
                                                <Calendar size={12} />
                                                <span>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('ar-EG') : '-'}</span>
                                            </div>
                                            <span className={`nexus-badge-status ${item.status === 'approved' ? 'approved' : 'pending'}`}>
                                                {item.status === 'approved' ? 'ظاهر' : 'مخفي'}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))
                            ) : <div className="admin-no-data">لا توجد آراء طلاب حالياً</div>
                        )}
                    </div>
                </main>
            </div>

            {/* Cinematic Detail Drawer */}
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
                                    <MessageSquare size={20} />
                                    <h2>تفاصيل الطلب</h2>
                                </div>
                                <button className="drawer-close" onClick={() => setSelectedItem(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="drawer-content">
                                <div className="drawer-user-section">
                                    <div className="drawer-avatar">{selectedItem.name?.charAt(0)}</div>
                                    <div className="drawer-user-info">
                                        <h3>{selectedItem.name}</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                            {selectedItem.contact && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                    <Mail size={14} /> {selectedItem.contact}
                                                </div>
                                            )}
                                            {selectedItem.phone && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
                                                    <Phone size={14} /> {selectedItem.phone}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                                {selectedItem.contact && (
                                                    <a 
                                                        href={`mailto:${selectedItem.contact}`} 
                                                        className="nexus-btn secondary mini"
                                                        style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    >
                                                        <Mail size={12} /> مراسلة
                                                    </a>
                                                )}
                                                {selectedItem.phone && (
                                                    <a 
                                                        href={`https://wa.me/${selectedItem.phone.replace(/\+/g, '').replace(/\s+/g, '')}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="nexus-btn secondary mini"
                                                        style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}
                                                    >
                                                        <Phone size={12} /> واتساب
                                                    </a>
                                                )}
                                            </div>
                                            {!selectedItem.contact && !selectedItem.phone && (
                                                <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>لا توجد بيانات اتصال</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="drawer-info-grid">
                                    <div className="info-box">
                                        <label>النوع</label>
                                        <span className={`nexus-badge type-${selectedItem.type}`}>
                                            {selectedItem.type === 'complaint' ? 'شكوى' : selectedItem.type === 'technical' ? 'عطل' : 'اقتراح'}
                                        </span>
                                    </div>
                                    <div className="info-box">
                                        <label>تاريخ الإرسال</label>
                                        <span>{selectedItem.timestamp?.toDate ? selectedItem.timestamp.toDate().toLocaleString('ar-EG') : '-'}</span>
                                    </div>
                                </div>

                                <div className="drawer-message-section">
                                    <label>نص الرسالة</label>
                                    <div className="message-content">
                                        {selectedItem.message}
                                    </div>
                                </div>

                                <div className="drawer-action-section">
                                    <label>تحديث حالة الطلب</label>
                                    <select
                                        className="nexus-select"
                                        value={processingStatus}
                                        onChange={(e) => setProcessingStatus(e.target.value)}
                                    >
                                        <option value="pending">جديد (New)</option>
                                        <option value="processing">قيد المعالجة (In Progress)</option>
                                        <option value="resolved">تم الحل (Resolved)</option>
                                    </select>
                                </div>

                                <div className="drawer-response-section">
                                    <label>ملاحظات إدارية / مسودة رد</label>
                                    <textarea
                                        className="nexus-textarea"
                                        placeholder="اكتب ملاحظاتك هنا للهودة إليها لاحقاً..."
                                        value={responseNote}
                                        onChange={(e) => setResponseNote(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="drawer-footer">
                                <button className="nexus-btn secondary" onClick={() => setSelectedItem(null)}>إلغاء</button>
                                <button className="nexus-btn primary" onClick={() => handleUpdateProcessing(selectedItem.id)}>
                                    حفظ التغييرات
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AdminFeedback;
