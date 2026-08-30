import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../config/firebase';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';

// Helper to generate a base32 TOTP secret
const generateBase32Secret = (len = 20) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    arr.forEach(b => { secret += chars[b % 32]; });
    return secret;
};

const AdminGeneral = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 2FA reset request state
    const [resetRequest, setResetRequest] = useState(null);
    const [resetLoading, setResetLoading] = useState(true);
    const [resetProcessing, setResetProcessing] = useState(false);

    // Global settings state
    const [settings, setSettings] = useState({
        feedbackPopupEnabled: true,
        secretGatewayCode: 'makanak2025',
        adminPassword: 'adminPassword',
        campaignPhase: 'suspended',
        exchangeSuspendedMessageAr: '',
        exchangeSuspendedMessageEn: '',
    });

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settingsRef = doc(db, 'system_configs', 'global_settings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setSettings({
                        feedbackPopupEnabled: data.feedbackPopupEnabled ?? true,
                        secretGatewayCode: data.secretGatewayCode || 'makanak2025',
                        adminPassword: data.adminPassword || 'admin2024',
                        campaignPhase: data.campaignPhase === 'booking' ? 'exchange' : (data.campaignPhase === 'donation' ? 'collection' : (data.campaignPhase || 'suspended')),
                        exchangeSuspendedMessageAr: data.exchangeSuspendedMessageAr || '',
                        exchangeSuspendedMessageEn: data.exchangeSuspendedMessageEn || '',
                    });
                }
            } catch (err) {
                console.error("Failed to load global settings:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const fetchResetRequest = useCallback(async () => {
        setResetLoading(true);
        try {
            const reqRef = doc(db, 'system_configs', 'admin_2fa_reset_request');
            const snap = await getDoc(reqRef);
            setResetRequest(snap.exists() ? snap.data() : null);
        } catch (err) {
            console.error('Failed to load 2FA reset request:', err);
        } finally {
            setResetLoading(false);
        }
    }, []);

    useEffect(() => { fetchResetRequest(); }, [fetchResetRequest]);

    const handleSave = async (updatedFields) => {
        setSaving(true);
        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, updatedFields, { merge: true });
            setSettings(prev => ({ ...prev, ...updatedFields }));
            toast.success(isAr ? 'تم حفظ التغييرات بنجاح!' : 'Changes saved successfully!');
        } catch (err) {
            console.error("Failed to update general settings:", err);
            toast.error(isAr ? 'فشل حفظ الإعدادات' : 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleApproveReset = async () => {
        setResetProcessing(true);
        try {
            const secret = generateBase32Secret();
            const issuer = 'Makanak Al-Jamii';
            const qrData = `otpauth://totp/${encodeURIComponent(issuer)}:admin?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;

            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, {
                admin2faSecret: secret,
                adminQrConfirmed: false,
            }, { merge: true });

            const reqRef = doc(db, 'system_configs', 'admin_2fa_reset_request');
            await deleteDoc(reqRef);
            setResetRequest(null);

            toast.success(
                isAr
                    ? 'تمت الموافق! سيظهر الباركود الجديد عند دخول المشرف في المرة القادمة.'
                    : 'Approved! The new QR code will appear on next admin login.'
            );
        } catch (err) {
            console.error('Failed to approve 2FA reset:', err);
            toast.error(isAr ? 'فشل الموافقة' : 'Approval failed');
        } finally {
            setResetProcessing(false);
        }
    };

    const handleRejectReset = async () => {
        setResetProcessing(true);
        try {
            const reqRef = doc(db, 'system_configs', 'admin_2fa_reset_request');
            await deleteDoc(reqRef);
            setResetRequest(null);
            toast.success(isAr ? 'تم رفض الطلب وحذفه.' : 'Request rejected and removed.');
        } catch (err) {
            console.error('Failed to reject 2FA reset request:', err);
            toast.error(isAr ? 'فشل رفض الطلب' : 'Failed to reject');
        } finally {
            setResetProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-loading-container">
                <div className="admin-spinner" />
                <p>{isAr ? 'جاري تحميل الإعدادات العامةة...' : 'Loading general settings...'}</p>
            </div>
        );
    }

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <h3 className="admin-section-title"><span>{isAr ? 'الإدارة العامة' : 'General Settings'}</span></h3>

            {/* ── 2FA Reset Request Banner ── */}
            {!resetLoading && resetRequest && resetRequest.status === 'pending' && (
                <div style={{
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(220,38,38,0.10))',
                    border: '1.5px solid rgba(239,68,68,0.45)',
                    borderRadius: '16px',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                }}>
                    <div>
                        <p style={{ margin: 0, fontWeight: 700, color: '#fca5a5', fontSize: '0.95rem' }}>
                            {isAr ? 'طلب إعادة تعيين باركود 2FA معلق' : 'Pending 2FA QR Reset Request'}
                        </p>
                        <p style={{ margin: '0.3rem 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem' }}>
                            {isAr
                                ? `تم إرسال الطلب بتاريخخ: ${new Date(resetRequest.requestedAt).toLocaleString('ar-SA')}`
                                : `Requested at: ${new Date(resetRequest.requestedAt).toLocaleString('en-US')}`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button
                            className="admin-action-btn approve"
                            onClick={handleApproveReset}
                            disabled={resetProcessing}
                        >
                            {isAr ? 'موافق وتوليد باركود جديد' : 'Approve & Generate New QR'}
                        </button>
                        <button
                            className="admin-action-btn decline"
                            onClick={handleRejectReset}
                            disabled={resetProcessing}
                        >
                            {isAr ? 'رفض الطلب' : 'Reject'}
                        </button>
                    </div>
                </div>
            )}

            <div className="admin-general-layout">
                {/* 1. System Configs Card */}
                <div className="admin-glass-card">
                    <h4 className="admin-card-header-title">{isAr ? 'إعدادات النظام الأساسية' : 'Base System Configurations'}</h4>
                    
                    <div className="admin-setting-item">
                        <div className="setting-details">
                            <h5>{isAr ? 'نافذة التقييم بعد 3 دقائق' : 'Feedback Rating Popup (3 min)'}</h5>
                            <p>{isAr ? 'تفعيل أو إيقاف نافذة التقييم التلقائي للزوار الجدد.' : 'Enable/disable rating popup for new visitors.'}</p>
                        </div>
                        <button 
                            className={`admin-action-btn ${settings.feedbackPopupEnabled ? 'approve' : 'decline'}`}
                            onClick={() => handleSave({ feedbackPopupEnabled: !settings.feedbackPopupEnabled })}
                            disabled={saving}
                        >
                            {settings.feedbackPopupEnabled ? (isAr ? 'مفعّل' : 'Enabled') : (isAr ? 'معطّل' : 'Disabled')}
                        </button>
                    </div>

                    <hr className="setting-divider" />

                    <div className="admin-setting-item">
                        <div className="setting-details">
                            <h5>{isAr ? 'كود بوابة المنسقين (Gateway Code)' : 'Secret Gateway Code'}</h5>
                            <p>{isAr ? 'الكود السري للدخول إلى البوابة الخارجية.' : 'Secret entry code for portal gateway.'}</p>
                        </div>
                        <div className="setting-input-action">
                            <input 
                                type="text" 
                                className="admin-input-field" 
                                value={settings.secretGatewayCode}
                                onChange={(e) => setSettings({ ...settings, secretGatewayCode: e.target.value })}
                                dir="ltr"
                            />
                            <button 
                                className="admin-action-btn approve"
                                onClick={() => handleSave({ secretGatewayCode: settings.secretGatewayCode })}
                                disabled={saving}
                            >
                                {isAr ? 'تحديث الكود' : 'Update Code'}
                            </button>
                        </div>
                    </div>

                    <hr className="setting-divider" />

                    <div className="admin-setting-item">
                        <div className="setting-details">
                            <h5>{isAr ? 'كلمة مرور المشرف (Admin Password)' : 'Admin Dashboard Password'}</h5>
                            <p>{isAr ? 'كلمة المرور الخاصة بلوحة التحكم للأدمن.' : 'Admin account password.'}</p>
                        </div>
                        <div className="setting-input-action">
                            <input 
                                type="text" 
                                className="admin-input-field" 
                                value={settings.adminPassword}
                                onChange={(e) => setSettings({ ...settings, adminPassword: e.target.value })}
                                dir="ltr"
                            />
                            <button 
                                className="admin-action-btn approve"
                                onClick={() => handleSave({ adminPassword: settings.adminPassword })}
                                disabled={saving}
                            >
                                {isAr ? 'تحديث كلمة المرور' : 'Update Password'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Campaign Phase Card */}
                <div className="admin-glass-card" style={{ marginTop: '1.5rem' }}>
                    <h4 className="admin-card-header-title">{isAr ? 'حملة تبادل الكتب والمواد' : 'Book Exchange Campaign Settings'}</h4>
                    
                    <div className="admin-setting-item">
                        <div className="setting-details">
                            <h5>{isAr ? 'حالة الحملة الحالية' : 'Campaign Current Status'}</h5>
                            <p>{isAr ? 'تحديد المرحلة النشطة لحملةة تبادل الكتب.' : 'Set current campaign phase.'}</p>
                        </div>
                        <select 
                            className="admin-filter-select"
                            value={settings.campaignPhase}
                            onChange={(e) => handleSave({ campaignPhase: e.target.value })}
                            disabled={saving}
                        >
                            <option value="suspended">{isAr ? 'معطّل / متوقف مؤقتاً' : 'Suspended'}</option>
                            <option value="collection">{isAr ? 'مرحلة التبرع بالمواد' : 'Donation Phase'}</option>
                            <option value="exchange">{isAr ? 'مرحلة حجز الكتب والمواد' : 'Booking Phase'}</option>
                        </select>
                    </div>

                    <hr className="setting-divider" />

                    <div className="admin-setting-item-block">
                        <h5>{isAr ? 'رسالة توقف الحملة (بالعربي)' : 'Suspended Message (Arabic)'}</h5>
                        <textarea
                            className="admin-textarea-field"
                            value={settings.exchangeSuspendedMessageAr}
                            onChange={(e) => setSettings({ ...settings, exchangeSuspendedMessageAr: e.target.value })}
                            placeholder="تظهر هذه الرسالةة عند إيقاف الحملة للطلاب..."
                        />
                        <button 
                            className="admin-action-btn approve"
                            style={{ alignSelf: 'flex-end', marginTop: '8px' }}
                            onClick={() => handleSave({ exchangeSuspendedMessageAr: settings.exchangeSuspendedMessageAr })}
                            disabled={saving}
                        >
                            {isAr ? 'حفظ الرسالةة بالعربية' : 'Save Message'}
                        </button>
                    </div>

                    <hr className="setting-divider" />

                    <div className="admin-setting-item-block">
                        <h5>{isAr ? 'رسالة توقف الحملة (بالإنجليزي)' : 'Suspended Message (English)'}</h5>
                        <textarea
                            className="admin-textarea-field"
                            value={settings.exchangeSuspendedMessageEn}
                            onChange={(e) => setSettings({ ...settings, exchangeSuspendedMessageEn: e.target.value })}
                            placeholder="This message is shown to users when campaign is suspended..."
                        />
                        <button 
                            className="admin-action-btn approve"
                            style={{ alignSelf: 'flex-end', marginTop: '8px' }}
                            onClick={() => handleSave({ exchangeSuspendedMessageEn: settings.exchangeSuspendedMessageEn })}
                            disabled={saving}
                        >
                            {isAr ? 'حفظ الرسالةة بالإنجليزية' : 'Save Message'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminGeneral;

