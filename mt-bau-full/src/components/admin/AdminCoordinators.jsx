import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { doc, getDoc, updateDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';

const fmtDate = (timestamp) => {
    if (!timestamp) return '—';
    const d = new Date(timestamp);
    return d.toLocaleDateString('ar-JO') + ' ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
};

const AdminCoordinators = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Global configurations
    const [settings, setSettings] = useState({});
    const [coordinatorsList, setCoordinatorsList] = useState([]);

    // Live staff online status from Firestore staff_status collection
    const [staffStatus, setStaffStatus] = useState({});

    // Editing & Adding Modal States
    const [selectedStaffKey, setSelectedStaffKey] = useState(null); // 'admin' or coordinator id/key
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    const [editForm, setEditForm] = useState({
        key: '',
        nameAr: '',
        nameEn: '',
        email: '',
        password: '',
        gender: 'male',
        permissions: {
            editDonation: false,
            deleteDonation: false,
            completeBooking: false,
            cancelBooking: false
        }
    });

    const [addForm, setAddForm] = useState({
        key: '',
        nameAr: '',
        nameEn: '',
        email: '',
        password: '',
        gender: 'male',
        permissions: {
            editDonation: false,
            deleteDonation: false,
            completeBooking: false,
            cancelBooking: false
        }
    });

    // Helper to get resolved dynamic coordinators array
    const getResolvedCoordinators = (data) => {
        if (data.coordinators && Array.isArray(data.coordinators) && data.coordinators.length > 0) {
            return data.coordinators;
        }
        // Default fallback coordinators (Ahmad and Sara)
        return [
            {
                key: 'ahmad',
                nameAr: data.ahmadNameAr || 'أحمد',
                nameEn: data.ahmadNameEn || 'Ahmad',
                email: data.ahmadEmail || 'makanak.ahmad@gmail.com',
                password: data.ahmadPassword || 'ahmad2024',
                gender: 'male',
                permissions: data.coordinatorPermissions?.ahmad || { editDonation: false, deleteDonation: false, completeBooking: false, cancelBooking: false }
            },
            {
                key: 'sara',
                nameAr: data.saraNameAr || 'سار',
                nameEn: data.saraNameEn || 'Sara',
                email: data.saraEmail || 'makanak.sara@gmail.com',
                password: data.saraPassword || 'sara2024',
                gender: 'female',
                permissions: data.coordinatorPermissions?.sara || { editDonation: false, deleteDonation: false, completeBooking: false, cancelBooking: false }
            }
        ];
    };

    // Load static details & passwords on mount
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const docRef = doc(db, 'system_configs', 'global_settings');
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setSettings(data);
                    setCoordinatorsList(getResolvedCoordinators(data));
                }
            } catch (err) {
                console.error("Failed to load staff settings:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();

        // Listen to live staff status real-time
        const unsubStatus = onSnapshot(collection(db, 'staff_status'), (snap) => {
            const statusMap = {};
            snap.docs.forEach(d => {
                statusMap[d.id] = d.data();
            });
            setStaffStatus(statusMap);
        });

        return () => unsubStatus();
    }, []);

    // 2FA Reset Handler
    const handleReset2fa = async (staffKey) => {
        if (!window.confirm(isAr 
            ? `هل تريد بالتأكيد إلغاء وإعاد تعيين رمز التحقق الثنائي (2FA) لـ ${staffKey}؟` 
            : `Are you sure you want to reset 2FA for ${staffKey}?`
        )) return;

        setSaving(true);
        try {
            const secretField = `${staffKey}2faSecret`;
            const confirmedField = `${staffKey}QrConfirmed`;
            const requestField = `${staffKey}ResetRequest`;

            const updateData = {
                [secretField]: '',
                [confirmedField]: false,
                [requestField]: false
            };

            await updateDoc(doc(db, 'system_configs', 'global_settings'), updateData);
            setSettings(prev => ({ ...prev, ...updateData }));
            toast.success(isAr ? 'تم إعاد تعيين الـ 2FA بنجاح. سيُطلب من الموظف مسح الكود مجدداً عند أول تسجيل دول.' : '2FA Reset successfully.');
        } catch (err) {
            console.error("Failed to reset 2FA:", err);
            toast.error(isAr ? 'فشل إعاد التعيين' : 'Reset failed');
        } finally {
            setSaving(false);
        }
    };

    // Open Edit Modal
    const handleOpenEdit = (staff) => {
        setSelectedStaffKey(staff.key);
        if (staff.key === 'admin') {
            setEditForm({
                key: 'admin',
                nameAr: 'الأدمن الرئيسي',
                nameEn: 'Main Admin',
                email: 'admin@koon.bau.jo',
                password: settings.adminPassword || 'admin2024',
                gender: 'male',
                permissions: { editDonation: true, deleteDonation: true, completeBooking: true, cancelBooking: true }
            });
        } else {
            setEditForm({
                key: staff.key,
                nameAr: staff.nameAr || '',
                nameEn: staff.nameEn || '',
                email: staff.email || '',
                password: staff.password || '',
                gender: staff.gender || 'male',
                permissions: staff.permissions || { editDonation: false, deleteDonation: false, completeBooking: false, cancelBooking: false }
            });
        }
    };

    // Save Edit Form
    const handleSaveEdit = async () => {
        if (!selectedStaffKey) return;
        setSaving(true);
        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            if (selectedStaffKey === 'admin') {
                await updateDoc(settingsRef, { adminPassword: editForm.password });
                setSettings(prev => ({ ...prev, adminPassword: editForm.password }));
            } else {
                const updatedList = coordinatorsList.map(c => {
                    if (c.key === selectedStaffKey) {
                        return {
                            ...c,
                            nameAr: editForm.nameAr,
                            nameEn: editForm.nameEn,
                            email: editForm.email,
                            password: editForm.password,
                            gender: editForm.gender,
                            permissions: editForm.permissions
                        };
                    }
                    return c;
                });
                
                const updatePayload = {
                    coordinators: updatedList,
                    // Backward compatibility update for legacy keys
                    [`${selectedStaffKey}NameAr`]: editForm.nameAr,
                    [`${selectedStaffKey}NameEn`]: editForm.nameEn,
                    [`${selectedStaffKey}Email`]: editForm.email,
                    [`${selectedStaffKey}Password`]: editForm.password
                };

                await setDoc(settingsRef, updatePayload, { merge: true });
                setCoordinatorsList(updatedList);
            }
            toast.success(isAr ? 'تم تحديث بيانات المنسق بنجاح!' : 'Coordinator details updated!');
            setSelectedStaffKey(null);
        } catch (err) {
            console.error(err);
            toast.error(isAr ? 'فشل حفظ التعديلات' : 'Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    // Add New Coordinator
    const handleAddCoordinator = async () => {
        if (!addForm.nameAr.trim() || !addForm.password.trim()) {
            toast.error(isAr ? 'يرجى إدخال اسم المنسق وكلم المرور' : 'Please enter coordinator name and password');
            return;
        }

        const newKey = addForm.key.trim().toLowerCase() || `coord_${Date.now()}`;
        if (coordinatorsList.some(c => c.key === newKey) || newKey === 'admin') {
            toast.error(isAr ? 'معرف المنسق موجود بالفعل، يرجى اختيار اسم آر' : 'Coordinator ID already exists');
            return;
        }

        setSaving(true);
        try {
            const newCoord = {
                key: newKey,
                nameAr: addForm.nameAr.trim(),
                nameEn: addForm.nameEn.trim() || addForm.nameAr.trim(),
                email: addForm.email.trim(),
                password: addForm.password.trim(),
                gender: addForm.gender,
                permissions: addForm.permissions
            };

            const updatedList = [...coordinatorsList, newCoord];
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, { coordinators: updatedList }, { merge: true });

            setCoordinatorsList(updatedList);
            toast.success(isAr ? `✅ تم إضافة المنسق (${newCoord.nameAr}) بنجاح!` : `✅ Added coordinator (${newCoord.nameAr})!`);
            setIsAddModalOpen(false);
            setAddForm({
                key: '',
                nameAr: '',
                nameEn: '',
                email: '',
                password: '',
                gender: 'male',
                permissions: { editDonation: false, deleteDonation: false, completeBooking: false, cancelBooking: false }
            });
        } catch (err) {
            console.error('Error adding coordinator:', err);
            toast.error(isAr ? 'فشلت إضافة المنسق' : 'Failed to add coordinator');
        } finally {
            setSaving(false);
        }
    };

    // Delete Coordinator
    const handleDeleteCoordinator = async (coordKey, coordName) => {
        if (!window.confirm(isAr 
            ? `هل أنت تأكد من حذف المنسق (${coordName}) نهائياً؟` 
            : `Are you sure you want to delete coordinator (${coordName})?`
        )) return;

        setSaving(true);
        try {
            const updatedList = coordinatorsList.filter(c => c.key !== coordKey);
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, { coordinators: updatedList }, { merge: true });

            setCoordinatorsList(updatedList);
            toast.success(isAr ? 'تم حذف المنسق بنجاح' : 'Coordinator deleted successfully');
        } catch (err) {
            console.error('Error deleting coordinator:', err);
            toast.error(isAr ? 'فشل حذف المنسق' : 'Failed to delete coordinator');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="admin-loading-container">
                <div className="admin-spinner" />
                <p>{isAr ? 'جاري تحميل لوح إدارة المنسقين...' : 'Loading coordinator panel...'}</p>
            </div>
        );
    }

    const adminStaff = {
        key: 'admin',
        role: 'admin',
        nameAr: 'الأدمن الرئيسي',
        nameEn: 'Administrator',
        name: isAr ? 'الأدمن (لوحة التحكم)' : 'Administrator',
        email: 'admin@koon.bau.jo',
        totpEnabled: !!settings.admin2faSecret,
        resetRequested: !!settings.adminResetRequest,
    };

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <h3 className="admin-section-title" style={{ margin: 0 }}>👥 <span>{isAr ? 'إدارة المنسقين والصلاحيات' : 'Coordinators & Permissions'}</span></h3>
                <button 
                    className="admin-action-btn approve"
                    onClick={() => setIsAddModalOpen(true)}
                    style={{ padding: '0.6rem 1.2rem', fontSize: '0.95rem', fontWeight: 600 }}
                >
                    ➕ {isAr ? 'إضافة منسق جديد' : 'Add New Coordinator'}
                </button>
            </div>
            
            <div className="coordinators-grid">
                {/* Admin Profile Card */}
                <div className="coordinator-profile-card admin-glass-card">
                    <div className="profile-header">
                        <div className={`status-indicator ${staffStatus.admin?.online ? 'online' : 'offline'}`} />
                        <div className="profile-titles">
                            <h4>{adminStaff.name}</h4>
                            <span className="role-tag">{isAr ? 'مشرف رئيسي' : 'Admin'}</span>
                        </div>
                    </div>

                    <hr className="profile-divider" />

                    <div className="profile-body">
                        <div className="meta-row">
                            <span>📧 {isAr ? 'البريد الإلكتروني:' : 'Email:'}</span>
                            <strong>{adminStaff.email}</strong>
                        </div>
                        <div className="meta-row">
                            <span>🔒 {isAr ? 'التحقق الثنائي (2FA):' : '2FA Status:'}</span>
                            <strong style={{ color: adminStaff.totpEnabled ? '#55efc4' : '#ff7675' }}>
                                {adminStaff.totpEnabled ? (isAr ? 'مفعّل ونشط' : 'Enabled') : (isAr ? 'غير مفعّل' : 'Disabled')}
                            </strong>
                        </div>
                        <div className="meta-row">
                            <span>⏳ {isAr ? 'آر تسجيل دول:' : 'Last Login:'}</span>
                            <strong>{fmtDate(staffStatus.admin?.lastLogin)}</strong>
                        </div>
                    </div>

                    <hr className="profile-divider" />

                    <div className="profile-actions-row">
                        <button 
                            className="admin-action-btn edit-q" 
                            onClick={() => handleOpenEdit(adminStaff)}
                            disabled={saving}
                        >
                            ✏️ {isAr ? 'تعديل البيانات' : 'Edit'}
                        </button>
                        <button 
                            className="admin-action-btn resolve"
                            onClick={() => handleReset2fa('admin')}
                            disabled={saving}
                        >
                            🔄 {isAr ? 'إعاد تعيين 2FA' : 'Reset 2FA'}
                        </button>
                    </div>
                </div>

                {/* Coordinators Cards */}
                {coordinatorsList.map((coord) => {
                    const status = staffStatus[coord.key] || {};
                    const isOnline = status.online && (Date.now() - (status.lastSeen || 0) < 60000);
                    const totpSecret = settings[`${coord.key}2faSecret`] || coord.totpSecret;
                    const resetReq = settings[`${coord.key}ResetRequest`] || coord.resetRequested;

                    return (
                        <div key={coord.key} className="coordinator-profile-card admin-glass-card">
                            <div className="profile-header">
                                <div className={`status-indicator ${isOnline ? 'online' : 'offline'}`} />
                                <div className="profile-titles">
                                    <h4>{isAr ? (coord.nameAr || coord.key) : (coord.nameEn || coord.key)}</h4>
                                    <span className="role-tag" style={{ background: coord.gender === 'female' ? 'rgba(253, 121, 168, 0.2)' : 'rgba(9, 132, 227, 0.2)', color: coord.gender === 'female' ? '#fd79a8' : '#74b9ff' }}>
                                        {coord.gender === 'female' ? (isAr ? '♀️ منسق ميداني' : '♀️ Female Coordinator') : (isAr ? '♂️ منسق ميداني' : '♂️ Male Coordinator')}
                                    </span>
                                </div>
                            </div>

                            <hr className="profile-divider" />

                            <div className="profile-body">
                                <div className="meta-row">
                                    <span>🔑 {isAr ? 'اسم الدخول (ID):' : 'Username (ID):'}</span>
                                    <strong style={{ color: '#ffeaa7' }}>{coord.key}</strong>
                                </div>
                                <div className="meta-row">
                                    <span>📧 {isAr ? 'البريد الإلكتروني:' : 'Email:'}</span>
                                    <strong>{coord.email || '—'}</strong>
                                </div>
                                <div className="meta-row">
                                    <span>🔒 {isAr ? 'التحقق الثنائي (2FA):' : '2FA Status:'}</span>
                                    <strong style={{ color: totpSecret ? '#55efc4' : '#ff7675' }}>
                                        {totpSecret ? (isAr ? 'مفعّل ونشط' : 'Enabled') : (isAr ? 'غير مفعّل' : 'Disabled')}
                                    </strong>
                                </div>
                                <div className="meta-row">
                                    <span>🔑 {isAr ? 'كلم السر الحالي:' : 'Current Password:'}</span>
                                    <strong style={{ color: '#74b9ff' }}>{coord.password || '—'}</strong>
                                </div>
                                <div className="meta-row">
                                    <span>⏳ {isAr ? 'آر تسجيل دول:' : 'Last Login:'}</span>
                                    <strong>{fmtDate(status.lastLogin)}</strong>
                                </div>

                                <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.3rem' }}>
                                        🛡️ {isAr ? 'الصلاحيات المحدد:' : 'Permissions:'}
                                    </span>
                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                        <span className={`status-badge ${coord.permissions?.editDonation ? 'status-approved' : 'status-pending'}`} style={{ fontSize: '0.7rem' }}>
                                            {coord.permissions?.editDonation ? (isAr ? '✏️ التعديل' : 'Edit') : (isAr ? '🚫 التعديل' : 'No Edit')}
                                        </span>
                                        <span className={`status-badge ${coord.permissions?.deleteDonation ? 'status-approved' : 'status-pending'}`} style={{ fontSize: '0.7rem' }}>
                                            {coord.permissions?.deleteDonation ? (isAr ? '🗑️ الحذف' : 'Delete') : (isAr ? '🚫 الحذف' : 'No Delete')}
                                        </span>
                                        <span className={`status-badge ${coord.permissions?.completeBooking ? 'status-approved' : 'status-pending'}`} style={{ fontSize: '0.7rem' }}>
                                            {coord.permissions?.completeBooking ? (isAr ? '✅ تسليم الحجز' : 'Deliver') : (isAr ? '🚫 التسليم' : 'No Deliver')}
                                        </span>
                                        <span className={`status-badge ${coord.permissions?.cancelBooking ? 'status-approved' : 'status-pending'}`} style={{ fontSize: '0.7rem' }}>
                                            {coord.permissions?.cancelBooking ? (isAr ? '✖ إلغاء الحجز' : 'Cancel') : (isAr ? '🚫 الإلغاء' : 'No Cancel')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <hr className="profile-divider" />

                            {resetReq && (
                                <div className="reset-alert-box">
                                    ⚠️ {isAr ? 'طلب إعادة تعيين رمز 2FA معلق!' : '2FA reset requested!'}
                                </div>
                            )}

                            <div className="profile-actions-row">
                                <button 
                                    className="admin-action-btn edit-q" 
                                    onClick={() => handleOpenEdit(coord)}
                                    disabled={saving}
                                >
                                    ✏️ {isAr ? 'تعديل' : 'Edit'}
                                </button>
                                <button 
                                    className="admin-action-btn resolve"
                                    onClick={() => handleReset2fa(coord.key)}
                                    disabled={saving}
                                >
                                    🔄 {isAr ? '2FA' : '2FA'}
                                </button>
                                <button 
                                    className="admin-action-btn decline"
                                    onClick={() => handleDeleteCoordinator(coord.key, coord.nameAr || coord.key)}
                                    disabled={saving}
                                >
                                    🗑️ {isAr ? 'حذف' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* EDIT COORDINATOR MODAL */}
            {selectedStaffKey && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-card" style={{ maxWidth: '540px' }}>
                        <div className="admin-modal-header">
                            <h4>✏️ {isAr ? `تحديث بيانات: ${editForm.nameAr || selectedStaffKey}` : `Edit: ${editForm.nameAr || selectedStaffKey}`}</h4>
                            <button className="close-btn" onClick={() => setSelectedStaffKey(null)}>&times;</button>
                        </div>
                        <div className="admin-modal-body">
                            {selectedStaffKey !== 'admin' && (
                                <>
                                    <div className="qedit-field">
                                        <label className="qedit-label">{isAr ? 'الاسم بالعربي:' : 'Name (Arabic):'}</label>
                                        <input
                                            type="text"
                                            className="admin-input-field"
                                            value={editForm.nameAr}
                                            onChange={e => setEditForm({ ...editForm, nameAr: e.target.value })}
                                        />
                                    </div>
                                    <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                        <label className="qedit-label">{isAr ? 'الاسم بالإنجليزي:' : 'Name (English):'}</label>
                                        <input
                                            type="text"
                                            className="admin-input-field"
                                            value={editForm.nameEn}
                                            onChange={e => setEditForm({ ...editForm, nameEn: e.target.value })}
                                            dir="ltr"
                                        />
                                    </div>
                                    <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                        <label className="qedit-label">{isAr ? 'البريد الإلكتروني:' : 'Email Address:'}</label>
                                        <input
                                            type="email"
                                            className="admin-input-field"
                                            value={editForm.email}
                                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                                            dir="ltr"
                                        />
                                    </div>
                                    <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                        <label className="qedit-label">{isAr ? 'الجنس:' : 'Gender:'}</label>
                                        <select
                                            className="admin-input-field"
                                            value={editForm.gender}
                                            onChange={e => setEditForm({ ...editForm, gender: e.target.value })}
                                        >
                                            <option value="male">{isAr ? '♂️ ذكر' : 'Male'}</option>
                                            <option value="female">{isAr ? '♀️ أنثى' : 'Female'}</option>
                                        </select>
                                    </div>

                                    {/* Permissions checkboxes */}
                                    <div style={{ marginTop: '1rem', padding: '0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <label className="qedit-label" style={{ marginBottom: '0.6rem', display: 'block', fontWeight: 600 }}>
                                            🛡️ {isAr ? 'صلاحيات المنسق:' : 'Coordinator Permissions:'}
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!editForm.permissions?.editDonation} 
                                                    onChange={e => setEditForm({ ...editForm, permissions: { ...editForm.permissions, editDonation: e.target.checked } })}
                                                />
                                                {isAr ? 'تعديل التبرعات' : 'Edit Donations'}
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!editForm.permissions?.deleteDonation} 
                                                    onChange={e => setEditForm({ ...editForm, permissions: { ...editForm.permissions, deleteDonation: e.target.checked } })}
                                                />
                                                {isAr ? 'حذف التبرعات' : 'Delete Donations'}
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!editForm.permissions?.completeBooking} 
                                                    onChange={e => setEditForm({ ...editForm, permissions: { ...editForm.permissions, completeBooking: e.target.checked } })}
                                                />
                                                {isAr ? 'إكمال وتسليم الحجز' : 'Complete Booking'}
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!editForm.permissions?.cancelBooking} 
                                                    onChange={e => setEditForm({ ...editForm, permissions: { ...editForm.permissions, cancelBooking: e.target.checked } })}
                                                />
                                                {isAr ? 'إلغاء الحجز' : 'Cancel Booking'}
                                            </label>
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                <label className="qedit-label">{isAr ? 'كلم المرور الجديد:' : 'New Password:'}</label>
                                <input
                                    type="text"
                                    className="admin-input-field"
                                    value={editForm.password}
                                    onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                                    dir="ltr"
                                />
                            </div>
                        </div>
                        <div className="admin-modal-footer">
                            <button type="button" className="admin-action-btn approve" onClick={handleSaveEdit} disabled={saving}>
                                {isAr ? 'حفظ البيانات' : 'Save'}
                            </button>
                            <button type="button" className="admin-action-btn decline" onClick={() => setSelectedStaffKey(null)} disabled={saving}>
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ADD COORDINATOR MODAL */}
            {isAddModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-card" style={{ maxWidth: '540px' }}>
                        <div className="admin-modal-header">
                            <h4>➕ {isAr ? 'إضافة منسق جديد' : 'Add New Coordinator'}</h4>
                            <button className="close-btn" onClick={() => setIsAddModalOpen(false)}>&times;</button>
                        </div>
                        <div className="admin-modal-body">
                            <div className="qedit-field">
                                <label className="qedit-label">{isAr ? 'اسم المستخدم للدول (ID / Username):' : 'Username (ID):'}</label>
                                <input
                                    type="text"
                                    className="admin-input-field"
                                    placeholder="e.g. omar"
                                    value={addForm.key}
                                    onChange={e => setAddForm({ ...addForm, key: e.target.value.toLowerCase().trim() })}
                                    dir="ltr"
                                />
                            </div>
                            <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                <label className="qedit-label">{isAr ? 'الاسم بالعربي:' : 'Name (Arabic):'}</label>
                                <input
                                    type="text"
                                    className="admin-input-field"
                                    placeholder="مثال: عمر العبادي"
                                    value={addForm.nameAr}
                                    onChange={e => setAddForm({ ...addForm, nameAr: e.target.value })}
                                />
                            </div>
                            <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                <label className="qedit-label">{isAr ? 'الاسم بالإنجليزي:' : 'Name (English):'}</label>
                                <input
                                    type="text"
                                    className="admin-input-field"
                                    placeholder="e.g. Omar Al-Abbadi"
                                    value={addForm.nameEn}
                                    onChange={e => setAddForm({ ...addForm, nameEn: e.target.value })}
                                    dir="ltr"
                                />
                            </div>
                            <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                <label className="qedit-label">{isAr ? 'البريد الإلكتروني:' : 'Email Address:'}</label>
                                <input
                                    type="email"
                                    className="admin-input-field"
                                    placeholder="e.g. omar@gmail.com"
                                    value={addForm.email}
                                    onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                                    dir="ltr"
                                />
                            </div>
                            <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                <label className="qedit-label">{isAr ? 'كلم المرور:' : 'Password:'}</label>
                                <input
                                    type="text"
                                    className="admin-input-field"
                                    placeholder="كلم مرور المنسق"
                                    value={addForm.password}
                                    onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                                    dir="ltr"
                                />
                            </div>
                            <div className="qedit-field" style={{ marginTop: '0.8rem' }}>
                                <label className="qedit-label">{isAr ? 'الجنس:' : 'Gender:'}</label>
                                <select
                                    className="admin-input-field"
                                    value={addForm.gender}
                                    onChange={e => setAddForm({ ...addForm, gender: e.target.value })}
                                >
                                    <option value="male">{isAr ? '♂️ ذكر' : 'Male'}</option>
                                    <option value="female">{isAr ? '♀️ أنثى' : 'Female'}</option>
                                </select>
                            </div>

                            {/* Permissions checkboxes */}
                            <div style={{ marginTop: '1rem', padding: '0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <label className="qedit-label" style={{ marginBottom: '0.6rem', display: 'block', fontWeight: 600 }}>
                                    🛡️ {isAr ? 'صلاحيات المنسق الأوليّ:' : 'Initial Permissions:'}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={!!addForm.permissions?.editDonation} 
                                            onChange={e => setAddForm({ ...addForm, permissions: { ...addForm.permissions, editDonation: e.target.checked } })}
                                        />
                                        {isAr ? 'تعديل التبرعات' : 'Edit Donations'}
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={!!addForm.permissions?.deleteDonation} 
                                            onChange={e => setAddForm({ ...addForm, permissions: { ...addForm.permissions, deleteDonation: e.target.checked } })}
                                        />
                                        {isAr ? 'حذف التبرعات' : 'Delete Donations'}
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={!!addForm.permissions?.completeBooking} 
                                            onChange={e => setAddForm({ ...addForm, permissions: { ...addForm.permissions, completeBooking: e.target.checked } })}
                                        />
                                        {isAr ? 'إكمال وتسليم الحجز' : 'Complete Booking'}
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={!!addForm.permissions?.cancelBooking} 
                                            onChange={e => setAddForm({ ...addForm, permissions: { ...addForm.permissions, cancelBooking: e.target.checked } })}
                                        />
                                        {isAr ? 'إلغاء الحجز' : 'Cancel Booking'}
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="admin-modal-footer">
                            <button type="button" className="admin-action-btn approve" onClick={handleAddCoordinator} disabled={saving}>
                                {isAr ? 'إضافة المنسق' : 'Add Coordinator'}
                            </button>
                            <button type="button" className="admin-action-btn decline" onClick={() => setIsAddModalOpen(false)} disabled={saving}>
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminCoordinators;
