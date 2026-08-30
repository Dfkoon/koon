import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import {
  collection, onSnapshot, setDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { PERMISSION_GROUPS, sanitizePermissionsForVolunteer } from '../../config/permissions';

// Flatten all non-adminOnly permissions for the modal
const VOLUNTEER_PERMISSIONS = PERMISSION_GROUPS.flatMap(g =>
  g.permissions
    .filter(p => !p.adminOnly)
    .map(p => ({ ...p, groupLabel: g.labelAr, groupLabelEn: g.labelEn }))
);

const EMPTY_FORM = {
  username: '', nameAr: '', nameEn: '', email: '',
  password: '', gender: 'male', permissions: {}
};

const fmtDate = (ts) => {
  if (!ts) return '—';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('ar-JO') + ' ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
};

const AdminVolunteers = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingV, setEditingV] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resetting2FA, setResetting2FA] = useState(null); // volunteer id being reset

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'volunteers'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setVolunteers(list);
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const openAdd = () => { setEditingV(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (v) => {
    setEditingV(v);
    setForm({
      username: v.username || '',
      nameAr: v.nameAr || '',
      nameEn: v.nameEn || '',
      email: v.email || '',
      password: v.password || '',
      gender: v.gender || 'male',
      permissions: { ...(v.permissions || {}) },
    });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditingV(null); setForm(EMPTY_FORM); };

  const togglePerm = (key) =>
    setForm(p => ({ ...p, permissions: { ...p.permissions, [key]: !p.permissions[key] } }));

  const handleSave = async () => {
    if (!form.nameAr.trim() || !form.username.trim() || (!editingV && !form.password.trim())) {
      toast.error(isAr ? 'يرجى ملء الاسم واسم المستخدم وكلمة المرور' : 'Fill name, username, and password');
      return;
    }
    if (!editingV && volunteers.some(v => v.username === form.username.toLowerCase().trim())) {
      toast.error(isAr ? 'اسم المستخدم مستخدم بالفعل' : 'Username already exists');
      return;
    }
    setSaving(true);
    try {
      const docId = editingV
        ? editingV.id
        : 'vol_' + form.username.toLowerCase().trim() + '_' + Date.now();
      const cleanPerms = sanitizePermissionsForVolunteer(form.permissions);
      const payload = {
        username: form.username.toLowerCase().trim(),
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || form.nameAr.trim(),
        email: form.email.trim(),
        gender: form.gender,
        permissions: cleanPerms,
        updatedAt: serverTimestamp(),
      };
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }
      if (!editingV) {
        payload.createdAt = serverTimestamp();
        payload.active = true;
        payload.twoFAEnabled = false;
        payload.twoFASecret = '';
      }
      await setDoc(doc(db, 'volunteers', docId), payload, { merge: true });
      toast.success(isAr ? (editingV ? 'تم التحديث ✅' : 'تمت الإضافة ✅') : (editingV ? 'Updated ✅' : 'Added ✅'));
      closeModal();
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشل الحفظ' : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (v) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'volunteers', v.id), { active: !v.active, updatedAt: serverTimestamp() });
      toast.success(isAr ? (v.active ? 'تم الإيقاف' : 'تم التفعيل') : (v.active ? 'Paused' : 'Activated'));
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (v) => {
    if (!window.confirm(isAr ? 'حذف المتطوع نهائياً؟' : 'Delete this volunteer permanently?')) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'volunteers', v.id));
      toast.success(isAr ? 'تم الحذف' : 'Deleted');
    } catch (err) { console.error(err); toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const handleReset2FA = async (v) => {
    if (!window.confirm(isAr ? `إعادة تعيين 2FA لـ ${v.nameAr}؟ سيُضطر لإعادة إعداده.` : `Reset 2FA for ${v.nameEn || v.nameAr}? They will need to set it up again.`)) return;
    setResetting2FA(v.id);
    try {
      await updateDoc(doc(db, 'volunteers', v.id), {
        twoFAEnabled: false, twoFASecret: '', updatedAt: serverTimestamp(),
      });
      toast.success(isAr ? `تمت إعادة تعيين 2FA لـ ${v.nameAr} ✅` : `2FA reset for ${v.nameEn || v.nameAr} ✅`);
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشلت إعادة التعيين' : 'Reset failed');
    } finally {
      setResetting2FA(null);
    }
  };

  if (loading) return (
    <div className="admin-loading-container">
      <div className="admin-spinner" />
      <p>{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
    </div>
  );

  return (
    <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.8rem' }}>
        <div>
          <h3 className="admin-section-title" style={{ marginBottom: '0.3rem' }}>
            🤝 {isAr ? 'إدارة المتطوعين' : 'Volunteers Management'}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--adm-muted)', margin: 0 }}>
            {isAr
              ? 'أضف المتطوعين وحدد صلاحياتهم — الحذف محظور نهائياً على جميع المتطوعين'
              : 'Add volunteers and assign permissions — deletion is never granted to volunteers'}
          </p>
        </div>
        <button className="admin-action-btn approve" style={{ padding: '0.6rem 1.4rem' }} onClick={openAdd}>
          + {isAr ? 'إضافة متطوع' : 'Add Volunteer'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '10px', padding: '0.8rem 1.2rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#a5b4fc' }}>
        {isAr
          ? 'المتطوعون يصلون للوحة تحكم مخصصة مع حساب شخصي وإمكانية تفعيل المصادقة الثنائية (2FA). الصلاحية الوحيدة الممنوعة نهائياً هي الحذف.'
          : 'Volunteers access a dedicated portal with a personal account and 2FA support. Deletion is strictly forbidden.'}
        <br />
        <code style={{ fontSize: '0.8rem', marginTop: '0.3rem', display: 'inline-block' }}>/volunteer-portal</code>
      </div>

      {volunteers.length === 0 ? (
        <div className="admin-glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤝</div>
          <p style={{ color: 'var(--adm-muted)' }}>
            {isAr ? 'لا يوجد متطوعون، أضف أول متطوع!' : 'No volunteers yet!'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '1.2rem' }}>
          {volunteers.map(v => {
            const isActive = v.active !== false;
            const has2FA = v.twoFAEnabled && v.twoFASecret;
            const grantedPerms = VOLUNTEER_PERMISSIONS.filter(p => v.permissions?.[p.key]);
            return (
              <div
                key={v.id}
                className="admin-glass-card"
                style={{
                  padding: '1.4rem',
                  border: isActive
                    ? `1px solid ${has2FA ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.2)'}`
                    : '1px solid rgba(239,68,68,0.3)',
                  opacity: isActive ? 1 : 0.75,
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Top row: name + status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.8rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.3rem' }}>{v.gender === 'female' ? '👩' : '👨'}</span>
                      <strong style={{ fontSize: '1rem', color: 'var(--adm-text)' }}>
                        {isAr ? v.nameAr : (v.nameEn || v.nameAr)}
                      </strong>
                    </div>
                    <code style={{ fontSize: '0.75rem', color: 'var(--adm-muted)', display: 'block', marginTop: '0.2rem' }}>
                      @{v.username}
                    </code>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'flex-end' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                      background: isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: isActive ? '#34d399' : '#f87171',
                      border: isActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
                    }}>
                      {isActive ? (isAr ? '● نشط' : '● Active') : (isAr ? '● موقوف' : '● Paused')}
                    </span>
                    <span style={{
                      padding: '2px 8px', borderRadius: '12px', fontSize: '0.67rem', fontWeight: 700,
                      background: has2FA ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                      color: has2FA ? '#34d399' : '#fbbf24',
                      border: has2FA ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(245,158,11,0.25)',
                    }}>
                      {has2FA ? '🔐 2FA مفعّل' : '⚠️ 2FA معطّل'}
                    </span>
                  </div>
                </div>

                {/* Email */}
                {v.email && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)', marginBottom: '0.6rem' }}>
                    ✉️ {v.email}
                  </div>
                )}

                {/* Permissions */}
                <div style={{ marginBottom: '0.8rem' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>
                    {isAr ? 'الصلاحيات:' : 'Permissions:'}
                  </div>
                  {grantedPerms.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: '#f87171' }}>
                      {isAr ? 'لا صلاحيات محددة' : 'No permissions assigned'}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {grantedPerms.map(p => (
                        <span key={p.key} style={{
                          background: 'rgba(99,102,241,0.12)', color: '#a5b4fc',
                          border: '1px solid rgba(99,102,241,0.25)',
                          padding: '2px 7px', borderRadius: '10px', fontSize: '0.68rem',
                        }}>
                          {isAr ? p.labelAr : p.labelEn}
                        </span>
                      ))}
                    </div>
                  )}
                  <span style={{
                    display: 'inline-block', marginTop: '0.35rem',
                    background: 'rgba(239,68,68,0.1)', color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.25)',
                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.67rem',
                  }}>
                    🚫 {isAr ? 'بدون حذف (محظور)' : 'No Delete (Forbidden)'}
                  </span>
                </div>

                {/* Date */}
                <div style={{ fontSize: '0.72rem', color: 'var(--adm-muted)', marginBottom: '0.85rem' }}>
                  {isAr ? 'تاريخ الإضافة:' : 'Added:'} {fmtDate(v.createdAt)}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.45rem', paddingTop: '0.75rem', borderTop: '1px solid var(--adm-divider)', flexWrap: 'wrap' }}>
                  <button
                    className="admin-action-btn edit-q"
                    style={{ flex: 1, minWidth: '70px' }}
                    onClick={() => openEdit(v)}
                    disabled={saving}
                  >
                    ✏️ {isAr ? 'تعديل' : 'Edit'}
                  </button>
                  <button
                    className={`admin-action-btn ${isActive ? 'resolve' : 'approve'}`}
                    style={{ flex: 1, minWidth: '70px' }}
                    onClick={() => handleToggleActive(v)}
                    disabled={saving}
                  >
                    {isActive ? (isAr ? '⏸ إيقاف' : '⏸ Pause') : (isAr ? '▶ تفعيل' : '▶ Activate')}
                  </button>
                  {has2FA && (
                    <button
                      className="admin-action-btn resolve"
                      style={{ flex: 1, minWidth: '90px', background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' }}
                      onClick={() => handleReset2FA(v)}
                      disabled={resetting2FA === v.id}
                      title={isAr ? 'إعادة تعيين المصادقة الثنائية' : 'Reset 2FA'}
                    >
                      {resetting2FA === v.id ? '...' : (isAr ? '🔄 2FA' : '🔄 2FA')}
                    </button>
                  )}
                  <button
                    className="admin-action-btn decline"
                    style={{ padding: '0.5rem 0.75rem' }}
                    onClick={() => handleDelete(v)}
                    disabled={saving}
                    title={isAr ? 'حذف المتطوع' : 'Delete volunteer'}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card" style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="admin-modal-header">
              <h4>
                {editingV
                  ? (isAr ? '✏️ تعديل المتطوع' : '✏️ Edit Volunteer')
                  : (isAr ? '➕ إضافة متطوع جديد' : '➕ Add New Volunteer')}
              </h4>
              <button className="close-btn" onClick={closeModal} disabled={saving}>&times;</button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {/* Username */}
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'اسم المستخدم (ID):' : 'Username (ID):'}</label>
                <input
                  type="text"
                  className="admin-input-field"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  dir="ltr"
                  disabled={!!editingV}
                  maxLength={40}
                  placeholder="hussien0"
                />
                {editingV && <p style={{ fontSize: '0.78rem', color: 'var(--adm-muted)', marginTop: '0.3rem' }}>⚠️ {isAr ? 'لا يمكن تغيير اسم المستخدم' : 'Username cannot be changed'}</p>}
              </div>

              {/* Names */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <div className="qedit-field">
                  <label className="qedit-label">{isAr ? 'الاسم بالعربي: *' : 'Arabic Name: *'}</label>
                  <input type="text" className="admin-input-field" value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} maxLength={60} required />
                </div>
                <div className="qedit-field">
                  <label className="qedit-label">{isAr ? 'الاسم بالإنجليزي:' : 'English Name:'}</label>
                  <input type="text" className="admin-input-field" value={form.nameEn} onChange={e => setForm({ ...form, nameEn: e.target.value })} dir="ltr" maxLength={60} />
                </div>
              </div>

              {/* Email */}
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'البريد الإلكتروني:' : 'Email:'}</label>
                <input type="email" className="admin-input-field" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} dir="ltr" maxLength={100} />
              </div>

              {/* Password */}
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'كلمة المرور: *' : 'Password: *'}</label>
                <input
                  type="text"
                  className="admin-input-field"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  dir="ltr"
                  maxLength={100}
                  placeholder={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
                />
              </div>

              {/* Gender */}
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'الجنس:' : 'Gender:'}</label>
                <select className="admin-input-field" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
                  <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                  <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                </select>
              </div>

              {/* Permissions grouped by section */}
              <div style={{ marginTop: '0.5rem', padding: '1rem', borderRadius: '12px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <label className="qedit-label" style={{ marginBottom: '0.8rem', display: 'block', fontWeight: 800, fontSize: '0.88rem' }}>
                  🔐 {isAr ? 'الصلاحيات (للأقسام المتاحة فقط):' : 'Permissions (Available sections only):'}
                </label>
                {PERMISSION_GROUPS.map(group => {
                  const groupPerms = group.permissions.filter(p => !p.adminOnly);
                  if (groupPerms.length === 0) return null;
                  return (
                    <div key={group.id} style={{ marginBottom: '0.9rem' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.4rem' }}>
                        {group.icon} {isAr ? group.labelAr : group.labelEn}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                        {groupPerms.map(p => (
                          <label
                            key={p.key}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.45rem',
                              fontSize: '0.82rem', cursor: 'pointer',
                              padding: '0.4rem 0.6rem', borderRadius: '8px',
                              background: form.permissions[p.key] ? 'rgba(99,102,241,0.15)' : 'transparent',
                              border: form.permissions[p.key] ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.05)',
                              transition: 'all 0.15s',
                              color: form.permissions[p.key] ? '#a5b4fc' : 'var(--adm-muted)',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={!!form.permissions[p.key]}
                              onChange={() => togglePerm(p.key)}
                              style={{ accentColor: '#6366f1' }}
                            />
                            {isAr ? p.labelAr : p.labelEn}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.8rem', color: '#f87171' }}>
                  🚫 {isAr ? 'الحذف: محظور دائماً على المتطوعين ولا يمكن منحه' : 'Delete: Always forbidden for volunteers — cannot be granted'}
                </div>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="admin-action-btn approve" onClick={handleSave} disabled={saving}>
                {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? '💾 حفظ' : '💾 Save')}
              </button>
              <button type="button" className="admin-action-btn decline" onClick={closeModal} disabled={saving}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminVolunteers;
