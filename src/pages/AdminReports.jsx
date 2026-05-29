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
    Flag,
    Trash2,
    CheckCircle2,
    Calendar,
    MessageSquare,
    AlertCircle,
    X,
    LayoutGrid,
    LayoutList,
    Search,
    User,
    CheckSquare,
    MoreHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Admin.css';

const AdminReports = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [selectedItem, setSelectedItem] = useState(null); // For Note/Response Modal
    const [processingStatus, setProcessingStatus] = useState('pending');

    useEffect(() => {
        setLoading(true);
        const qS = query(collection(db, 'question_reports'), orderBy('createdAt', 'desc'));
        const unsubS = onSnapshot(qS, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Fetch reports error:", error);
            setLoading(false);
        });

        return () => { unsubS(); };
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('هل أنت متأكد من الحذف النهائي للبلاغ؟')) return;
        try {
            await deleteDoc(doc(db, 'question_reports', id));
            toast.success('تم الحذف بنجاح');
            if (selectedItem?.id === id) setSelectedItem(null);
        } catch (error) {
            toast.error('حدث خطأ أثناء الحذف');
        }
    };

    const handleUpdateProcessing = async (id) => {
        try {
            await updateDoc(doc(db, 'question_reports', id), {
                status: processingStatus,
                updatedAt: serverTimestamp()
            });
            toast.success('تم تحديث حالة البلاغ');
            setSelectedItem(null);
        } catch (error) {
            toast.error('فشل التحديث');
        }
    };

    const filteredReports = reports.filter(r =>
        (r.questionAr || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.questionEn || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.userComment || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.reportType || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const openResponseModal = (item) => {
        setSelectedItem(item);
        setProcessingStatus(item.status || 'pending');
    };

    // Metrics calculation
    const totalPending = reports.filter(s => s.status === 'pending' || !s.status).length;
    const totalResolved = reports.filter(s => s.status === 'resolved').length;
    const totalRejected = reports.filter(s => s.status === 'rejected').length;

    const getReportTypeLabel = (type) => {
        const labels = {
            'incorrect_answer': 'إجابة خاطئة',
            'typo': 'خطأ إملائي / صياغة',
            'not_working': 'السؤال لا يظهر جيداً',
            'other': 'أخرى'
        };
        return labels[type] || type || 'غير محدد';
    };

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
                <h1 className="admin-page-title">إدارة بلاغات الأسئلة (تعليم السؤال 🚩)</h1>
                <p className="admin-page-subtitle">مراجعة الشكاوى المرفوعة من الطلاب عن الأسئلة الخاطئة في الاختبارات.</p>
            </div>

            {/* --- Health Metrics Nexus Header --- */}
            <section className="nexus-health-metrics">
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">إجمالي البلاغات</span>
                        <span className="metric-value">{reports.length}</span>
                    </div>
                    <div className="metric-icon-box blue"><Flag size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">قيد المراجعة</span>
                        <span className="metric-value">{totalPending}</span>
                    </div>
                    <div className="metric-icon-box orange pulsing"><AlertCircle size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">تم تصحيحها</span>
                        <span className="metric-value">{totalResolved}</span>
                    </div>
                    <div className="metric-icon-box green"><CheckCircle2 size={24} /></div>
                </div>
                <div className="metric-nexus-card">
                    <div className="metric-info">
                        <span className="metric-label">بلاغات مرفوضة</span>
                        <span className="metric-value">{totalRejected}</span>
                    </div>
                    <div className="metric-icon-box red"><X size={24} /></div>
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
                                placeholder="بحث في البلاغات أو الأسئلة..."
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
                        {filteredReports.length > 0 ? (
                            filteredReports.map((item) => (
                                <motion.div
                                    key={item.id}
                                    className={`nexus-card suggestion ${item.reportType} ${item.status === 'pending' || !item.status ? 'is-new' : ''}`}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ duration: 0.4 }}
                                    onClick={() => openResponseModal(item)}
                                >
                                    {item.status === 'pending' && <div className="nexus-card-glow orange"></div>}
                                    <div className="nexus-card-header">
                                        <div className="nexus-author">
                                            <div className="nexus-avatar" style={{ background: 'var(--admin-warning)' }}>
                                                <Flag size={18} color="#fff" />
                                            </div>
                                            <div className="nexus-meta">
                                                <h3 style={{ fontSize: '0.95rem' }}>
                                                    {getReportTypeLabel(item.reportType)}
                                                </h3>
                                                <div className="nexus-badges">
                                                    <span className={`nexus-badge status-${item.status || 'pending'}`}>
                                                        {item.status === 'resolved' ? 'مصوب' : item.status === 'rejected' ? 'مرفوض' : 'معلق'}
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

                                    <div className="nexus-content" style={{ marginTop: '0.5rem' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--admin-primary)', marginBottom: '4px', fontWeight: 'bold' }}>
                                            {item.subjectName || (item.quizId ? 'اختبار' : 'عام')} {item.quizTitle ? `> ${item.quizTitle}` : ''}
                                        </div>
                                        <p style={{ fontWeight: '500', color: '#cbd5e1', marginBottom: '8px' }}>
                                            السؤال: {item.questionAr || item.questionEn || 'بدون نص'}
                                        </p>
                                        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                                            <MessageSquare size={12} style={{ display: 'inline', marginInlineEnd: '5px' }}/>
                                            {item.userComment || 'لا توجد ملاحظات إضافية من الطالب'}
                                        </p>
                                    </div>

                                    <div className="nexus-footer">
                                        <div className="nexus-contact">
                                            <Calendar size={12} />
                                            <span>{item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString('ar-EG') : '-'}</span>
                                        </div>
                                        <div className="nexus-date">
                                            <CheckSquare size={12} />
                                            <span>التحقق من صحتها</span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        ) : <div className="admin-no-data">لا توجد بلاغات تناسب بحثك</div>}
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
                                    <Flag size={20} color="var(--admin-warning)" />
                                    <h2>تفاصيل البلاغ عن السؤال</h2>
                                </div>
                                <button className="drawer-close" onClick={() => setSelectedItem(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="drawer-content luxe-scroll">
                                <div className="drawer-user-section">
                                    <div className="drawer-avatar" style={{ background: 'var(--admin-warning)' }}>🚩</div>
                                    <div className="drawer-user-info">
                                        <h3>{getReportTypeLabel(selectedItem.reportType)}</h3>
                                        <p>{selectedItem.subjectName || 'مادة غير محددة'} {selectedItem.quizTitle ? ` | ${selectedItem.quizTitle}` : ''}</p>
                                        <p style={{ fontSize: '0.75rem', opacity: 0.6 }}>معرف الاختبار: {selectedItem.quizId || 'غير متوفر'}</p>
                                    </div>
                                    <div className={`nexus-badge status-${selectedItem.status || 'pending'}`} style={{ marginRight: 'auto' }}>
                                        {selectedItem.status === 'resolved' ? 'تم الحل' : selectedItem.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                                    </div>
                                </div>

                                <div className="drawer-info-grid">
                                    <div className="info-box">
                                        <label>تاريخ البلاغ</label>
                                        <span>{selectedItem.createdAt?.toDate ? selectedItem.createdAt.toDate().toLocaleString('ar-EG') : '-'}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>رقم السؤال</label>
                                        <span>{selectedItem.questionId || 'غير متوفر'}</span>
                                    </div>
                                </div>

                                <div className="drawer-message-section">
                                    <label>نص السؤال المبلّغ عنه</label>
                                    <div className="message-content" style={{ fontWeight: '500', color: '#fff' }}>
                                        {selectedItem.questionAr || selectedItem.questionEn || 'غير متوفر'}
                                    </div>
                                </div>

                                {selectedItem.userComment && (
                                    <div className="drawer-message-section" style={{ marginTop: '1rem' }}>
                                        <label>تعليق وتوضيح الطالب المستحدم</label>
                                        <div className="message-content" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                            {selectedItem.userComment}
                                        </div>
                                    </div>
                                )}

                                <div className="drawer-action-section" style={{ marginTop: '2rem' }}>
                                    <label>تحديث حالة البلاغ والتصحيح</label>
                                    <select
                                        className="nexus-select"
                                        value={processingStatus}
                                        onChange={(e) => setProcessingStatus(e.target.value)}
                                        style={{ fontSize: '1.05rem', padding: '12px' }}
                                    >
                                        <option value="pending">⏳ قيد المراجعة والمعالجة</option>
                                        <option value="resolved">✅ تم التأكد والحل</option>
                                        <option value="rejected">❌ رفض البلاغ (السؤال صحيح)</option>
                                    </select>
                                </div>

                                <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.6' }}>
                                        <span style={{ color: 'var(--admin-warning)', fontWeight: 'bold' }}>تنبيه مهم:</span> عند التأكد من وجود خطأ في السؤال، يرجى الذهاب إلى ملفات الأسئلة (أو الإكسل) وتصحيح الخطأ هناك لضمان عدم ظهوره للطلاب مستقبلاً. هنا يمكنك فقط متابعة البلاغ وإدارته لتوثيق الحل.
                                    </p>
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

export default AdminReports;
