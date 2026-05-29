import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../config/firebase';
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot, 
    doc, 
    deleteDoc,
    limit
} from 'firebase/firestore';
import { 
    MessageSquare, 
    Search, 
    Clock, 
    Filter, 
    Trash2, 
    X, 
    Cpu, 
    Layout,
    ChevronLeft,
    ChevronRight,
    User,
    Bot,
    RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Admin.css';

const AdminChatLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLog, setSelectedLog] = useState(null);
    const [activeModel, setActiveModel] = useState('all');
    
    // 1. Fetch Logs
    useEffect(() => {
        const q = query(
            collection(db, 'nashmi_logs'),
            orderBy('timestamp', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setLogs(data);
            setLoading(false);
        }, (error) => {
            console.error("Fetch logs error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // 2. Filter Logic
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch = 
                (log.userMessage || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (log.nashmiResponse || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (log.pageContext || '').toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesModel = activeModel === 'all' || log.model === activeModel;

            return matchesSearch && matchesModel;
        });
    }, [logs, searchTerm, activeModel]);

    // 3. Handlers
    const handleDelete = async (id, e) => {
        e?.stopPropagation();
        if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
        try {
            await deleteDoc(doc(db, 'nashmi_logs', id));
            toast.success('تم حذف السجل');
            if (selectedLog?.id === id) setSelectedLog(null);
        } catch (error) {
            toast.error("خطأ في الحذف");
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '---';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('ar-EG', { 
            day: 'numeric', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    if (loading) return (
        <div className="admin-page-container">
            <div className="nexus-health-metrics">
                {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '100px', borderRadius: '24px' }}></div>)}
            </div>
        </div>
    );

    return (
        <div className="admin-page-container fade-in">
            {/* Header section */}
            <div className="admin-header" style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                        <h1 className="admin-page-title">سجلات محادثات نشمي 🤖</h1>
                        <p className="admin-page-subtitle">مراقبة وتحليل أداء الذكاء الاصطناعي وتفاعل الطلاب</p>
                    </div>

                    <div className="topbar-search" style={{ margin: 0, width: '350px' }}>
                        <input
                            type="text"
                            placeholder="بحث في الرسائل أو السياق..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="nexus-filters-bar" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <div className="command-filter-group">
                    {['all', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].map(m => (
                        <button
                            key={m}
                            className={`command-filter-btn ${activeModel === m ? 'active' : ''}`}
                            onClick={() => setActiveModel(m)}
                        >
                            {m === 'all' ? 'جميع الموديلات' : m.includes('70b') ? 'Nashmi Ultra' : 'Nashmi Stable'}
                        </button>
                    ))}
                </div>
                
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.9rem' }}>
                    <MessageSquare size={16} />
                    <span>آخر 100 محادثة</span>
                </div>
            </div>

            {/* Logs List Section */}
            <div className="feedback-content-grid">
                <AnimatePresence mode='popLayout'>
                    {filteredLogs.map((log) => (
                        <motion.div
                            key={log.id}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="nexus-card chat-log-card"
                            onClick={() => setSelectedLog(log)}
                        >
                            <div className="nexus-card-header">
                                <div className="nexus-author">
                                    <div className="nexus-avatar chat">
                                        <MessageSquare size={18} />
                                    </div>
                                    <div className="nexus-meta">
                                        <h3 className="line-clamp-1">{log.userMessage}</h3>
                                        <div className="nexus-badges">
                                            <span className={`nexus-badge model-${log.model?.includes('70b') ? 'ultra' : 'stable'}`}>
                                                {log.model?.includes('70b') ? 'Nashmi Ultra' : 'Nashmi Stable'}
                                            </span>
                                            <span className="nexus-badge context">
                                                {log.pageContext || 'Home'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="nexus-date">
                                    <Clock size={12} />
                                    {formatDate(log.timestamp)}
                                </div>
                            </div>

                            <div className="nexus-content chat-preview">
                                <p className="line-clamp-2" style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                                    {log.nashmiResponse}
                                </p>
                            </div>

                            <div className="nexus-footer">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--admin-primary)', fontSize: '0.8rem' }}>
                                    <Layout size={14} />
                                    <span>{log.pageContext || 'العامة'}</span>
                                </div>
                                <button
                                    className="nexus-delete-btn"
                                    onClick={(e) => handleDelete(log.id, e)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Empty State */}
            {filteredLogs.length === 0 && (
                <div className="no-results-box" style={{ marginTop: '4rem', textAlign: 'center' }}>
                    <div className="no-results-icon" style={{ fontSize: '4rem', opacity: 0.2 }}>💬</div>
                    <h3 style={{ color: '#94a3b8' }}>لا توجد سجلات محادثات حالياً</h3>
                </div>
            )}

            {/* Detail Drawer */}
            <AnimatePresence>
                {selectedLog && (
                    <motion.div
                        className="nexus-drawer-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setSelectedLog(null)}
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
                                    <div className="metric-icon-box blue" style={{ width: '40px', height: '40px' }}>
                                        <Bot size={20} />
                                    </div>
                                    <h2>تفاصيل المحادثة الذكية</h2>
                                </div>
                                <button className="drawer-close" onClick={() => setSelectedLog(null)}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="drawer-content luxe-scroll">
                                {/* Context Information */}
                                <div className="drawer-info-grid" style={{ marginBottom: '2rem' }}>
                                    <div className="info-box">
                                        <label>الموديل المستخدم</label>
                                        <span className={`model-tag ${selectedLog.model?.includes('70b') ? 'ultra' : 'stable'}`}>
                                            {selectedLog.model}
                                        </span>
                                    </div>
                                    <div className="info-box">
                                        <label>الصفحة المصدر</label>
                                        <span>{selectedLog.pageContext || 'Home / Global'}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>التوقيت</label>
                                        <span>{formatDate(selectedLog.timestamp)}</span>
                                    </div>
                                    <div className="info-box">
                                        <label>معرف السجل</label>
                                        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{selectedLog.id}</span>
                                    </div>
                                </div>

                                {/* Chat View Section */}
                                <div className="chat-view-container">
                                    {/* User Message */}
                                    <div className="chat-bubble user">
                                        <div className="bubble-header">
                                            <User size={14} />
                                            <span>الطالب</span>
                                        </div>
                                        <div className="bubble-content">
                                            {selectedLog.userMessage}
                                        </div>
                                    </div>

                                    {/* Nashmi Response */}
                                    <div className="chat-bubble bot">
                                        <div className="bubble-header">
                                            <Bot size={14} />
                                            <span>نشمي Ultra</span>
                                        </div>
                                        <div className="bubble-content">
                                            {selectedLog.nashmiResponse}
                                        </div>
                                    </div>
                                </div>

                                <div className="drawer-action-section" style={{ marginTop: '2rem' }}>
                                    <button
                                        className="nexus-btn secondary"
                                        onClick={(e) => handleDelete(selectedLog.id, e)}
                                        style={{ width: '100%', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                    >
                                        <Trash2 size={16} /> حذف هـذا السجل نهائياً
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
                .chat-log-card {
                    border-right: 4px solid var(--admin-primary);
                }
                .chat-log-card.stable {
                    border-right-color: #f59e0b;
                }
                .nexus-avatar.chat {
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }
                .chat-preview {
                    border-top: 1px solid rgba(255,255,255,0.05);
                    padding-top: 1rem;
                }
                .nexus-badge.model-ultra { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
                .nexus-badge.model-stable { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
                
                .chat-view-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .chat-bubble {
                    padding: 1.25rem;
                    border-radius: 18px;
                    max-width: 90%;
                }
                .chat-bubble.user {
                    align-self: flex-start;
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-bottom-left-radius: 4px;
                }
                .chat-bubble.bot {
                    align-self: flex-end;
                    background: rgba(59, 130, 246, 0.05);
                    border: 1px solid rgba(59, 130, 246, 0.1);
                    border-bottom-right-radius: 4px;
                    direction: rtl;
                }
                .bubble-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.75rem;
                    color: #94a3b8;
                    margin-bottom: 8px;
                }
                .bubble-content {
                    font-size: 0.95rem;
                    line-height: 1.6;
                    color: #e2e8f0;
                    white-space: pre-wrap;
                }
                .model-tag {
                    display: inline-block;
                    padding: 4px 12px;
                    border-radius: 100px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                .model-tag.ultra { background: #3b82f620; color: #3b82f6; }
                .model-tag.stable { background: #f59e0b20; color: #f59e0b; }
                
                .line-clamp-1 {
                    display: -webkit-box;
                    -webkit-line-clamp: 1;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .line-clamp-2 {
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
            `}</style>
        </div>
    );
};

export default AdminChatLogs;
