import React, { useState, useEffect } from 'react';
import { getAnalyticsData } from '../services/analyticsService';
import { BarChart, Users, Eye, Clock, Activity } from 'lucide-react';

const AdminAnalytics = () => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const data = await getAnalyticsData();
        setAnalytics(data);
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="admin-page-container">
                <div className="admin-stats-grid">
                    {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '120px' }}></div>)}
                </div>
            </div>
        );
    }


    const { totalViews, viewsByPage, viewsByHour } = analytics;

    // Find peak hour
    const peakHourIndex = viewsByHour.indexOf(Math.max(...viewsByHour));
    const peakHourStr = `${peakHourIndex}:00 - ${peakHourIndex + 1}:00`;

    // Draw simple pure CSS bar chart for hours
    const maxHourValue = Math.max(...viewsByHour, 1);

    return (
        <div className="admin-page-container">
            <div className="admin-page-header admin-header-flex">
                <div>
                    <h1>الإحصائيات التفصيلية</h1>
                    <p>تتبع عدد الزوار، الصفحات الأكثر زيارة، وأوقات الذروة في الموقع.</p>
                </div>
            </div>

            <div className="admin-stats-grid">
                <div className="admin-stat-card stagger-item">
                    <div className="stat-header">
                        <Eye size={18} className="admin-accent-icon" />
                        <h3>إجمالي المشاهدات</h3>
                    </div>
                    <div className="stat-value">{totalViews.toLocaleString()}</div>
                </div>
                <div className="admin-stat-card stagger-item">
                    <div className="stat-header">
                        <Activity size={18} className="admin-primary-icon" />
                        <h3>عدد الصفحات الفريدة</h3>
                    </div>
                    <div className="stat-value">{viewsByPage.length}</div>
                </div>
                <div className="admin-stat-card stagger-item">
                    <div className="stat-header">
                        <Clock size={18} className="admin-warning-icon" />
                        <h3>ساعة الذروة</h3>
                    </div>
                    <div className="stat-value" style={{ fontSize: '1.8rem' }}>{peakHourStr}</div>
                </div>
            </div>


            <div className="analytics-layout-grid">
                {/* Pages Breakdown */}
                <div className="admin-card stagger-item" style={{ animationDelay: '0.4s' }}>
                    <div className="admin-card-header">
                        <BarChart size={20} className="admin-primary-icon" />
                        <h2>الصفحات الأكثر زيارة</h2>
                    </div>

                    {viewsByPage.length === 0 ? (
                        <div className="admin-no-data">لا توجد بيانات مسجلة حالياً.</div>
                    ) : (
                        <div className="table-wrapper">
                            <table className="admin-table mini">
                                <thead>
                                    <tr>
                                        <th>الصفحة (المسار)</th>
                                        <th style={{ textAlign: 'left' }}>المشاهدات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewsByPage.slice(0, 10).map((page, idx) => (
                                        <tr key={idx}>
                                            <td className="monospace-cell">{page.path}</td>
                                            <td style={{ textAlign: 'left', fontWeight: 'bold' }}>{page.count}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Hourly Activity Bar Chart */}
                <div className="admin-card stagger-item" style={{ animationDelay: '0.5s' }}>
                    <div className="admin-card-header">
                        <Activity size={20} className="admin-accent-icon" />
                        <h2>نشاط الزوار بالساعة</h2>
                    </div>

                    <div className="hourly-chart-container">
                        {viewsByHour.map((count, hour) => {
                            const heightPct = (count / maxHourValue) * 100;
                            return (
                                <div key={hour} className="chart-bar-group">
                                    <div
                                        className={`chart-bar ${count === Math.max(...viewsByHour) ? 'peak' : ''}`}
                                        style={{ height: `${heightPct}%`, opacity: count > 0 ? 1 : 0.2 }}
                                        title={`${count} مشاهدة في الساعة ${hour}:00`}
                                    />
                                    <span className="chart-label">{hour}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="chart-info-text">
                        المخطط يوضح توزيع المشاهدات على مدار 24 ساعة
                    </div>
                </div>
            </div>

        </div>
    );
};

export default AdminAnalytics;
