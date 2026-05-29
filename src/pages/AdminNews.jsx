import React, { useState, useEffect } from 'react';
import { getNews, addNewsItem, deleteNewsItem } from '../services/adminService';
import { Plus, Trash2, Megaphone, CheckSquare } from 'lucide-react';
import toast from 'react-hot-toast';

const AdminNews = () => {
    const [newsList, setNewsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [formData, setFormData] = useState({
        titleAr: '',
        titleEn: '',
        contentAr: '',
        contentEn: '',
        type: 'general',
        icon: 'fas fa-info-circle',
        isMarquee: false
    });

    const newsTypes = [
        { id: 'urgent', label: 'Urgent (عاجل)', color: '#ef4444' },
        { id: 'important', label: 'Important (هام)', color: '#f59e0b' },
        { id: 'general', label: 'General (عام)', color: '#3b82f6' },
        { id: 'new', label: 'New Feature (جديد)', color: '#10b981' }
    ];

    useEffect(() => {
        fetchNews();
    }, []);

    const fetchNews = async () => {
        setLoading(true);
        const data = await getNews();
        setNewsList(data);
        setLoading(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.titleAr || !formData.contentAr) {
            toast.error('Arabic Title and Content are required!');
            return;
        }

        const toastId = toast.loading('Publishing news...');
        const result = await addNewsItem({
            ...formData,
            date: new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
        });

        if (result.success) {
            toast.success('News published successfully', { id: toastId });
            setIsModalOpen(false);
            setFormData({
                titleAr: '', titleEn: '', contentAr: '', contentEn: '',
                type: 'general', icon: 'fas fa-info-circle', isMarquee: false
            });
            fetchNews();
        } else {
            toast.error('Failed to publish: ' + result.error, { id: toastId });
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this news item?')) {
            const toastId = toast.loading('Deleting...');
            const result = await deleteNewsItem(id);
            if (result.success) {
                toast.success('Deleted successfully', { id: toastId });
                fetchNews();
            } else {
                toast.error('Failed to delete: ' + result.error, { id: toastId });
            }
        }
    };

    return (
        <div className="admin-page-container">
            <div className="admin-page-header admin-header-flex">
                <div>
                    <h1>الأخبار والإعلانات</h1>
                    <p>قم بنشر الأخبار العاجلة، التنبيهات، وتحديث شريط الأخبار العلوي.</p>
                </div>
                <button className="admin-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setIsModalOpen(true)}>
                    <Plus size={18} /> نشر خبر جديد
                </button>
            </div>

            <div className="admin-card">
                <div className="table-wrapper">
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '60px', borderRadius: '12px' }}></div>)}
                        </div>
                    ) : newsList.length === 0 ? (
                        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--admin-text-muted)' }}>لا توجد أخبار منشورة حالياً. يعتمد النظام على الإعدادات الأساسية.</p>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>التاريخ</th>
                                    <th>النوع</th>
                                    <th>العنوان (عربي)</th>
                                    <th>شريط التمرير</th>
                                    <th>الإجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {newsList.map((news, index) => (
                                    <tr key={news.id} className="stagger-item" style={{ animationDelay: `${index * 0.05}s` }}>
                                        <td style={{ color: 'var(--admin-text-muted)' }}>{news.date}</td>
                                        <td>
                                            <span style={{
                                                padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                                                background: `${newsTypes.find(t => t.id === news.type)?.color}20`,
                                                color: newsTypes.find(t => t.id === news.type)?.color
                                            }}>
                                                {newsTypes.find(t => t.id === news.type)?.label.split(' ')[1].replace(/[()]/g, '')}
                                            </span>
                                        </td>
                                        <td>{news.titleAr}</td>
                                        <td>
                                            {news.isMarquee ? <CheckSquare size={18} color="#10b981" /> : '-'}
                                        </td>
                                        <td>
                                            <button onClick={() => handleDelete(news.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-content">
                        <h2>نشر خبر أو إعلان جديد</h2>

                        <form onSubmit={handleSubmit}>
                            <div className="admin-form-grid">
                                <div className="admin-form-group">
                                    <label>العنوان (باللغة العربية) *</label>
                                    <input required className="admin-input" value={formData.titleAr} onChange={e => setFormData({ ...formData, titleAr: e.target.value })} />
                                </div>
                                <div className="admin-form-group">
                                    <label>العنوان (باللغة الإنجليزية)</label>
                                    <input className="admin-input" value={formData.titleEn} onChange={e => setFormData({ ...formData, titleEn: e.target.value })} />
                                </div>
                            </div>

                            <div className="admin-form-grid">
                                <div className="admin-form-group">
                                    <label>المحتوى (باللغة العربية) *</label>
                                    <textarea required className="admin-input admin-textarea" value={formData.contentAr} onChange={e => setFormData({ ...formData, contentAr: e.target.value })} />
                                </div>
                                <div className="admin-form-group">
                                    <label>المحتوى (باللغة الإنجليزية)</label>
                                    <textarea className="admin-input admin-textarea" value={formData.contentEn} onChange={e => setFormData({ ...formData, contentEn: e.target.value })} />
                                </div>
                            </div>

                            <div className="admin-form-grid">
                                <div className="admin-form-group">
                                    <label>نوع الخبر</label>
                                    <select className="admin-input" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                        {newsTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                </div>
                                <div className="admin-form-group">
                                    <label>أيقونة (FontAwesome)</label>
                                    <input className="admin-input" value={formData.icon} onChange={e => setFormData({ ...formData, icon: e.target.value })} placeholder="fas fa-bell" />
                                </div>
                            </div>

                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                                background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px',
                                marginBottom: '1.5rem'
                            }}>
                                <input
                                    type="checkbox"
                                    id="marqueeToggle"
                                    checked={formData.isMarquee}
                                    onChange={e => setFormData({ ...formData, isMarquee: e.target.checked })}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="marqueeToggle" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600', color: 'var(--admin-text)' }}>
                                    <Megaphone size={20} color="#3b82f6" />
                                    عرض في شريط الإعلانات العلوي (تنبيه عاجل)
                                </label>
                            </div>

                            <div className="admin-modal-actions">
                                <button type="button" className="admin-btn-secondary" onClick={() => setIsModalOpen(false)}>إلغاء</button>
                                <button type="submit" className="admin-btn">نشر الخبر الآن</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminNews;
