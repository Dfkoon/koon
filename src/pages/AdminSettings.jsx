import React, { useState, useEffect } from 'react';
import { getSystemSettings, updateSystemSettings } from '../services/adminService';
import { Save, Settings as SettingsIcon, Globe, Bell, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const AdminSettings = () => {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        const data = await getSystemSettings();
        setSettings(data);
        setLoading(false);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        const result = await updateSystemSettings(settings);
        if (result.success) {
            toast.success('تم حفظ الإعدادات بنجاح');
        } else {
            toast.error('فشل في حفظ الإعدادات');
        }
        setSaving(false);
    };

    if (loading) return (
        <div className="admin-page-container">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {[1, 2].map(i => <div key={i} className="skeleton" style={{ height: '300px', background: '#f8fafc', borderRadius: '16px' }}></div>)}
            </div>
        </div>
    );

    return (
        <div className="admin-page-container">
            <div className="admin-page-header">
                <h1>إعدادات النظام</h1>
                <p>تخصيص الخيارات العامة وإدارة تنبيهات الموقع.</p>
            </div>

            <form onSubmit={handleSave} className="admin-form">
                <div className="admin-card stagger-item">
                    <div className="admin-card-header">
                        <Globe size={20} className="admin-accent-icon" />
                        <h2>الإعدادات العامة</h2>
                    </div>

                    <div className="admin-form-grid">
                        <div className="admin-form-group">
                            <label>اسم الموقع</label>
                            <input
                                type="text"
                                className="admin-input disabled"
                                value="موقع مكانك - جامعة البلقاء"
                                disabled
                            />
                        </div>

                        <div className="admin-form-group">
                            <label>رابط واتساب للدعم</label>
                            <input
                                type="text"
                                className="admin-input"
                                value={settings?.supportWhatsapp || '9620000000'}
                                onChange={e => setSettings({ ...settings, supportWhatsapp: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                <div className="admin-card stagger-item" style={{ animationDelay: '0.2s' }}>
                    <div className="admin-card-header">
                        <Bell size={20} className="admin-warning-icon" />
                        <h2>تنبيهات النظام</h2>
                    </div>

                    <div className="admin-info-banner warning">
                        <input
                            type="checkbox"
                            id="maintenanceMode"
                            checked={settings?.maintenanceMode || false}
                            onChange={e => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                        />
                        <label htmlFor="maintenanceMode" style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                            تفعيل وضع الصيانة (إيقاف الموقع مؤقتاً)
                        </label>
                    </div>
                </div>

                <div className="admin-actions-footer">
                    <button type="submit" className="admin-btn" disabled={saving}>
                        <Save size={20} /> {saving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
                    </button>
                </div>
            </form>

        </div>
    );
};

export default AdminSettings;
