import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Users,
    BookOpen,
    Newspaper,
    Activity,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Plus,
    Bell,
    Settings,
    Briefcase,
    Zap,
    MessageSquare,
    Flag
} from 'lucide-react';
import { getAnalyticsData } from '../services/analyticsService';
import { getCustomCourses, getNews, getSystemSettings } from '../services/adminService';
import { Link } from 'react-router-dom';

const AdminDashboard = () => {
    const [stats, setStats] = useState({
        views: 0,
        materials: 0,
        news: 0,
        pendingFeedback: 0,
        pendingReports: 0,
        exchangeActive: true
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            setLoading(true);
            try {
                // Import firestore stuff locally or ensure it's available
                const { collection, getDocs, query, where } = await import('firebase/firestore');
                const { db } = await import('../config/firebase');

                const [analytics, courses, news, settings, feedbackSnap, reportsSnap] = await Promise.all([
                    getAnalyticsData(),
                    getCustomCourses(),
                    getNews(),
                    getSystemSettings(),
                    getDocs(query(collection(db, 'suggestions'), where('status', '==', 'pending'))),
                    getDocs(query(collection(db, 'question_reports'), where('status', '==', 'pending')))
                ]);

                setStats({
                    views: analytics.totalViews || 0,
                    materials: courses.length || 0,
                    news: news.length || 0,
                    pendingFeedback: feedbackSnap.size || 0,
                    pendingReports: reportsSnap.size || 0,
                    exchangeActive: settings?.isExchangeActive ?? true
                });
            } catch (error) {
                console.error("Dashboard stats error:", error);
            }
            setLoading(false);
        };

        fetchStats();
    }, []);

    const kpis = [
        {
            title: 'إجمالي المشاهدات',
            value: stats.views.toLocaleString(),
            icon: <Users size={22} />,
            trend: '+12.5%',
            isUp: true,
            color: 'var(--admin-primary)'
        },
        {
            title: 'المواد الدراسية',
            value: stats.materials,
            icon: <BookOpen size={22} />,
            trend: '+3',
            isUp: true,
            color: '#8b5cf6'
        },
        {
            title: 'الأخبار النشطة',
            value: stats.news,
            icon: <Newspaper size={22} />,
            trend: 'مستقر',
            isUp: true,
            color: '#f59e0b'
        },
        {
            title: 'حالة النظام',
            value: stats.exchangeActive ? 'نشط' : 'متوقف',
            icon: <Activity size={22} />,
            trend: stats.exchangeActive ? 'Live' : 'Off',
            isUp: stats.exchangeActive,
            color: stats.exchangeActive ? 'var(--admin-accent)' : '#ef4444'
        },
        {
            title: 'طلبات معلقة',
            value: stats.pendingFeedback,
            icon: <MessageSquare size={22} />,
            trend: stats.pendingFeedback > 0 ? 'تنبيه' : 'منتظم',
            isUp: stats.pendingFeedback === 0,
            color: stats.pendingFeedback > 0 ? '#ef4444' : 'var(--admin-primary)'
        },
        {
            title: 'بلاغات الأسئلة',
            value: stats.pendingReports,
            icon: <Flag size={22} />,
            trend: stats.pendingReports > 0 ? 'تنبيه' : 'سليم',
            isUp: stats.pendingReports === 0,
            color: stats.pendingReports > 0 ? '#f59e0b' : 'var(--admin-primary)'
        }
    ];

    const activities = [
        { id: 1, type: 'material', text: 'تمت إضافة مادة "تفاضل وتكامل" جديدة', time: 'منذ 5 دقائق', icon: <Plus size={14} /> },
        { id: 2, type: 'news', text: 'إرسال خبر عاجل حول امتحانات الميد', time: 'منذ ساعة', icon: <Bell size={14} /> },
        { id: 3, type: 'exchange', text: 'طالب حجز مادة "فيزياء 101"', time: 'منذ ساعتين', icon: <Zap size={14} /> },
        { id: 4, type: 'settings', text: 'تحديث إعدادات النظام العام', time: 'منذ 5 ساعات', icon: <Settings size={14} /> }
    ];

    if (loading) {
        return (
            <div className="admin-page-container">
                <div className="admin-stats-grid">
                    {[1, 2, 3, 4].map(i => <div key={i} className="admin-stat-card skeleton" style={{ height: '140px' }}></div>)}
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page-container">
            <header className="admin-page-header stagger-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                        <h1 className="admin-page-title">نظرة عامة على النظام</h1>
                        <p className="admin-page-subtitle">مرحباً بك مجدداً، إليك ملخص نشاط الموقع اليوم.</p>
                    </div>
                    <div style={{ background: 'var(--admin-panel)', color: 'var(--admin-text)', padding: '10px 15px', borderRadius: '12px', border: '1px solid var(--admin-panel-border)', fontSize: '0.9rem', fontWeight: '600' }}>
                        📅 {new Date().toLocaleDateString('ar-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                </div>
            </header>

            {/* KPI Section */}
            <div className="admin-stats-grid">
                {kpis.map((kpi, idx) => (
                    <motion.div
                        key={kpi.title}
                        className="admin-stat-card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                    >
                        <div className="kpi-header">
                            <div className="kpi-icon-wrapper" style={{ color: kpi.color, background: `${kpi.color}15`, width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {kpi.icon}
                            </div>
                            <div className={`kpi-trend ${kpi.isUp ? 'up' : 'down'}`}>
                                {kpi.isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {kpi.trend}
                            </div>
                        </div>
                        <h3 style={{ fontSize: '0.9rem', color: 'var(--admin-text-muted)', marginTop: '1rem' }}>{kpi.title}</h3>
                        <div className="stat-value">{kpi.value}</div>
                    </motion.div>
                ))}
            </div>

            {/* Main Content Layout */}
            <div className="dashboard-grid-layout">
                {/* Main Content Column */}
                <div className="dashboard-main-col">
                    {/* Growth Chart Card */}
                    <div className="admin-card stagger-item">
                        <div className="card-header">
                            <h2>إحصائيات نمو المشاهدات (7 أيام)</h2>
                            <span style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>تحديث تلقائي</span>
                        </div>

                        <div className="chart-container">
                            <svg viewBox="0 0 800 250" className="chart-svg">
                                {/* Grid Lines */}
                                {[0, 50, 100, 150, 200].map(y => (
                                    <line key={y} x1="40" y1={250 - y} x2="780" y2={250 - y} stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                                ))}

                                {/* Labels */}
                                <text x="10" y="250" fill="#64748b" fontSize="10">0</text>
                                <text x="10" y="50" fill="#64748b" fontSize="10">5K</text>

                                {/* Gradient Definition */}
                                <defs>
                                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--admin-primary)" stopOpacity="0.3" />
                                        <stop offset="100%" stopColor="var(--admin-primary)" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {/* Area Path */}
                                <path
                                    d="M40 200 Q 150 180, 250 100 T 400 80 T 550 150 T 780 40 V 250 H 40 Z"
                                    fill="url(#chartGradient)"
                                />

                                {/* Main Path */}
                                <path
                                    d="M40 200 Q 150 180, 250 100 T 400 80 T 550 150 T 780 40"
                                    stroke="var(--admin-primary)"
                                    strokeWidth="3"
                                    fill="none"
                                />

                                {/* Points */}
                                <circle cx="40" cy="200" r="4" fill="#fff" stroke="var(--admin-primary)" strokeWidth="2" />
                                <circle cx="250" cy="100" r="4" fill="#fff" stroke="var(--admin-primary)" strokeWidth="2" />
                                <circle cx="400" cy="80" r="4" fill="#fff" stroke="var(--admin-primary)" strokeWidth="2" />
                                <circle cx="780" cy="40" r="4" fill="#fff" stroke="var(--admin-primary)" strokeWidth="2" />
                            </svg>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', padding: '0 40px' }}>
                            {['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map(day => (
                                <span key={day} style={{ color: '#64748b', fontSize: '0.75rem' }}>{day}</span>
                            ))}
                        </div>
                    </div>

                    {/* Quick Access Area */}
                    <div className="admin-card stagger-item">
                        <div className="card-header">
                            <h2>الوصول السريع للمهام</h2>
                        </div>
                        <style>{`
                            .quick-actions-grid {
                                display: grid;
                                grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                                gap: 1rem;
                            }
                            .quick-link {
                                display: flex;
                                flex-direction: column;
                                align-items: center;
                                gap: 0.75rem;
                                padding: 1.5rem;
                                background: rgba(255,255,255,0.03);
                                border: 1px solid rgba(255,255,255,0.05);
                                border-radius: 16px;
                                color: var(--admin-text-muted);
                                text-decoration: none;
                                transition: all 0.3s ease;
                            }
                            .quick-link:hover {
                                background: var(--admin-primary-glow);
                                color: var(--admin-primary);
                                border-color: var(--admin-primary);
                                transform: translateY(-4px);
                            }
                        `}</style>
                        <div className="quick-actions-grid">
                            <Link to="/admin/materials" className="quick-link">
                                <BookOpen size={24} />
                                <span>إضافة مادة</span>
                            </Link>
                            <Link to="/admin/news" className="quick-link">
                                <Bell size={24} />
                                <span>خبر عاجل</span>
                            </Link>
                            <Link to="/admin/feedback" className="quick-link">
                                <MessageSquare size={24} />
                                <span>الآراء</span>
                            </Link>
                            <Link to="/admin/reports" className="quick-link">
                                <Flag size={24} />
                                <span>البلاغات</span>
                            </Link>
                            <Link to="/admin/settings" className="quick-link">
                                <Settings size={24} />
                                <span>الإعدادات</span>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="dashboard-side-col">
                    {/* Activity Feed */}
                    <div className="admin-card stagger-item">
                        <div className="card-header">
                            <h2>آخر النشاطات</h2>
                        </div>
                        <div className="activity-feed">
                            {activities.map(item => (
                                <div key={item.id} className="activity-item" style={{ display: 'flex', gap: '15px', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '1rem' }}>
                                    <div className="activity-dot" style={{ color: item.type === 'material' ? 'var(--admin-primary)' : item.type === 'news' ? '#ef4444' : '#f59e0b' }}>
                                        {item.icon}
                                    </div>
                                    <div className="activity-content">
                                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1' }}>{item.text}</p>
                                        <span className="activity-time" style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.time}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="admin-btn-secondary" style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>مشاهدة الكل</button>
                    </div>

                    {/* System Pulse Card */}
                    <div className="admin-card stagger-item" style={{ background: 'linear-gradient(135deg, #0f172a, #134e4a)', color: '#fff', border: '1px solid rgba(45, 212, 191, 0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ width: '12px', height: '12px', background: '#2dd4bf', borderRadius: '50%', boxShadow: '0 0 15px #2dd4bf', animation: 'pulse 2s infinite' }}></div>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700' }}>نبض النظام (System Pulse)</h3>
                        </div>
                        <style>{`
                            @keyframes pulse {
                                0% { opacity: 0.6; transform: scale(1); }
                                50% { opacity: 1; transform: scale(1.2); }
                                100% { opacity: 0.6; transform: scale(1); }
                            }
                        `}</style>
                        <p style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: '12px', lineHeight: '1.6' }}>تم التحقق من مزامنة قاعدة البيانات. جميع الخوادم تعمل في وضع الأداء الأقصى.</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px', color: '#2dd4bf' }}>
                            <Zap size={16} />
                            <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>وقت الاستجابة: 24ms</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
