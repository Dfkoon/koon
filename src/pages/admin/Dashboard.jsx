import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import StatsCard from '../../components/StatsCard';
import './Dashboard.css';

export default function Dashboard() {
    const [stats, setStats] = useState({
        subscribers: 0,
        questions: 0,
        pendingQuestions: 0,
        donations: 0,
        pendingDonations: 0,
        testimonials: 0
    });
    const [recentActivity, setRecentActivity] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // 1. Subscribers
                const subscribersSnap = await getDocs(collection(db, "subscribers"));

                // 2. Q&A
                const qnaSnap = await getDocs(collection(db, "qna"));
                const pendingQna = qnaSnap.docs.filter(doc => !doc.data().answer).length;

                // 3. Donations (Material Exchange)
                const donationsSnap = await getDocs(collection(db, "materialDonations"));
                const pendingDonations = donationsSnap.docs.filter(doc => doc.data().status === 'pending').length;

                // 4. Testimonials
                const testimonialsSnap = await getDocs(collection(db, "testimonials"));

                setStats({
                    subscribers: subscribersSnap.size,
                    questions: qnaSnap.size,
                    pendingQuestions: pendingQna,
                    donations: donationsSnap.size,
                    pendingDonations: pendingDonations,
                    testimonials: testimonialsSnap.size
                });

                // Fetch recent activity
                const activity = [];

                // Recent suggestions (last 5)
                const qnaQuery = query(collection(db, "qna"), orderBy("createdAt", "desc"), limit(5));
                const qnaRecent = await getDocs(qnaQuery);
                qnaRecent.docs.forEach(doc => {
                    const data = doc.data();
                    activity.push({
                        type: 'suggestion',
                        icon: '💬',
                        title: data.type || 'اقتراح',
                        message: (data.message || data.text || '').substring(0, 60) + '...',
                        time: data.createdAt,
                        status: data.reply ? 'answered' : 'pending'
                    });
                });

                // Recent donations (last 3)
                const donationsQuery = query(collection(db, "materialDonations"), orderBy("createdAt", "desc"), limit(3));
                const donationsRecent = await getDocs(donationsQuery);
                donationsRecent.docs.forEach(doc => {
                    const data = doc.data();
                    activity.push({
                        type: 'donation',
                        icon: '📦',
                        title: 'تبرع جديد',
                        message: `${data.itemName || 'مادة'} - ${data.condition || ''} `,
                        time: data.createdAt,
                        status: data.status || 'pending'
                    });
                });

                // Recent testimonials (last 2)
                const testimonialsQuery = query(collection(db, "testimonials"), orderBy("createdAt", "desc"), limit(2));
                const testimonialsRecent = await getDocs(testimonialsQuery);
                testimonialsRecent.docs.forEach(doc => {
                    const data = doc.data();
                    activity.push({
                        type: 'testimonial',
                        icon: '⭐',
                        title: 'رأي جديد',
                        message: (data.message || data.text || '').substring(0, 60) + '...',
                        time: data.createdAt,
                        status: data.approved ? 'approved' : 'pending'
                    });
                });

                // Sort by time and take top 8
                activity.sort((a, b) => {
                    const timeA = a.time?.seconds || 0;
                    const timeB = b.time?.seconds || 0;
                    return timeB - timeA;
                });
                setRecentActivity(activity.slice(0, 8));

                // Generate alerts
                const newAlerts = [];
                if (pendingQna > 0) {
                    newAlerts.push({
                        type: 'warning',
                        icon: '⚠️',
                        message: `لديك ${pendingQna} رسائل تحتاج رد`
                    });
                }
                if (pendingDonations > 0) {
                    newAlerts.push({
                        type: 'info',
                        icon: 'ℹ️',
                        message: `${pendingDonations} تبرعات قيد المراجعة`
                    });
                }
                if (subscribersSnap.size > 100) {
                    newAlerts.push({
                        type: 'success',
                        icon: '🎉',
                        message: `تجاوزت ${subscribersSnap.size} مشترك!`
                    });
                }
                setAlerts(newAlerts);

            } catch (error) {
                console.error("Error fetching stats:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const cards = [
        {
            title: 'إجمالي المشتركين',
            value: stats.subscribers,
            icon: '👥',
            color: 'primary',
            change: '+12% هذا الشهر',
            changeType: 'positive'
        },
        {
            title: 'تبرعات المواد',
            value: stats.donations,
            icon: '📦',
            color: 'success',
            change: `${stats.pendingDonations} قيد المراجعة`,
            changeType: stats.pendingDonations > 0 ? 'warning' : 'neutral'
        },
        {
            title: 'أسئلة واستفسارات',
            value: stats.questions,
            icon: '💬',
            color: 'warning',
            change: `${stats.pendingQuestions} بانتظار الرد`,
            changeType: stats.pendingQuestions > 0 ? 'negative' : 'positive'
        },
        {
            title: 'آراء الزوار',
            value: stats.testimonials,
            icon: '⭐',
            color: 'info',
            change: 'تم التحقق',
            changeType: 'neutral'
        }
    ];

    if (loading) {
        return (
            <div className="dashboard-loading">
                <div className="spinner">⏳</div>
                <p>جاري تحديث البيانات...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header animate-fade-in">
                <h1>مكانك الجامعي - لوحة القيادة 📊</h1>
                <p>مرحباً بك مجدداً، إليك ملخص لأهم النشاطات اليوم</p>
            </div>

            <div className="stats-grid">
                {cards.map((card, index) => (
                    <StatsCard
                        key={index}
                        {...card}
                    />
                ))}
            </div>

            <div className="dashboard-content">
                {/* Smart Alerts */}
                {alerts.length > 0 && (
                    <div className="alerts-section animate-slide-up">
                        <h3>🔔 تنبيهات ذكية</h3>
                        <div className="alerts-grid">
                            {alerts.map((alert, index) => (
                                <div key={index} className={`alert - card alert - ${alert.type} `}>
                                    <span className="alert-icon">{alert.icon}</span>
                                    <span className="alert-message">{alert.message}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Activity */}
                <div className="activity-section glass-card animate-slide-up">
                    <h3>📋 النشاط الحديث</h3>
                    <div className="activity-list">
                        {recentActivity.length === 0 ? (
                            <p className="no-activity">لا يوجد نشاط حديث</p>
                        ) : (
                            recentActivity.map((item, index) => (
                                <div key={index} className="activity-item">
                                    <div className="activity-icon">{item.icon}</div>
                                    <div className="activity-content">
                                        <div className="activity-header">
                                            <span className="activity-title">{item.title}</span>
                                            <span className={`activity - status status - ${item.status} `}>
                                                {item.status === 'pending' ? 'معلق' :
                                                    item.status === 'answered' ? 'مجاب' :
                                                        item.status === 'approved' ? 'موافق عليه' : item.status}
                                            </span>
                                        </div>
                                        <p className="activity-message">{item.message}</p>
                                        <span className="activity-time">
                                            {item.time ? new Date(item.time.seconds * 1000).toLocaleString('ar-EG', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            }) : 'الآن'}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="welcome-card glass-card animate-slide-up">
                    <div className="welcome-text">
                        <h2>بوابة إدارة مكانك الجامعي 👋</h2>
                        <p>
                            نظام متطور لإدارة التفاعلات، الشكاوى، وتبرعات المواد.
                            استخدم الأدوات الجانبية لمتابعة الإحصائيات والرد على استفسارات المستخدمين بشكل فوري.
                        </p>
                        <div className="welcome-stats">
                            <div className="mini-stat"><span>🔒</span> نظام محمي بالكامل</div>
                            <div className="mini-stat"><span>⚡</span> استجابة فورية</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
