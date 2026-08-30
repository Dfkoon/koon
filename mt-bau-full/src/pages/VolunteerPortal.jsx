import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../config/firebase';
import {
  collection, doc, getDoc, getDocs, updateDoc, serverTimestamp, onSnapshot, query, where
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { deleteField } from 'firebase/firestore';
import { useLanguage } from '../contexts/LanguageContext';
import AdminCourses from '../components/admin/AdminCourses';
import AdminNotices from '../components/admin/AdminNotices';
import AdminChatFAQ from '../components/admin/AdminChatFAQ';
import AdminContributions from '../components/admin/AdminContributions';
import AdminAnalytics from '../components/admin/AdminAnalytics';
import MaterialExchange from './MaterialExchange';
import toast from 'react-hot-toast';
import './AdminDashboard.css';

import {
  checkRateLimit, recordFailedAttempt, clearAttempts,
  sanitizeInput, sanitizeUsername, sanitizeEmail,
  getTOTPToken, verifyTOTP, generateBase32Secret,
  buildOtpAuthUri, buildQRCodeUrl,
} from '../utils/volunteerSecurity';
import { PERMISSION_GROUPS, sanitizePermissionsForVolunteer } from '../config/permissions';

// ─── Captcha helpers ───────────────────────────────────────────────────────────
function genCaptchaText() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 5; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}
function drawCaptcha(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.stroke();
  }
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const fontSize = Math.floor(canvas.height * 0.52);
  ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
  for (let i = 0; i < text.length; i++) {
    const x = 14 + i * (canvas.width - 28) / text.length;
    const y = canvas.height / 2 + fontSize * 0.35 + (Math.random() - 0.5) * 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.4);
    ctx.fillStyle = `hsl(${200 + Math.random() * 60},80%,75%)`;
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
}

// ─── Available tabs based on permissions ──────────────────────────────────────
const TABS_MAP = [
  { id: 'analytics', icon: '📊', labelAr: 'الإحصائيات', labelEn: 'Analytics', perm: 'canViewAnalytics' },
  { id: 'quizzes', icon: '📝', labelAr: 'الاختبارات', labelEn: 'Quizzes', perm: ['canAddExams', 'canEditExams'] },
  { id: 'courses', icon: '📚', labelAr: 'المواد الدراسية', labelEn: 'Courses', perm: ['canAddCourses', 'canEditCourses'] },
  { id: 'exchange', icon: '🔄', labelAr: 'تبادل المواد', labelEn: 'Exchange', perm: 'canManageSwap' },
  { id: 'notices', icon: '📢', labelAr: 'الإعلانات', labelEn: 'Notices', perm: 'canManageNotices' },
  { id: 'chatfaq', icon: '💬', labelAr: 'الأسئلة الشائعة', labelEn: 'FAQ', perm: 'canManageFAQ' },
  { id: 'contributions', icon: '📥', labelAr: 'المساهمات', labelEn: 'Contributions', perm: 'canApproveContributions' },
  { id: 'notifications', icon: '🔔', labelAr: 'إشعارات الإدارة', labelEn: 'Admin Notifications', perm: null },
  { id: 'account', icon: '👤', labelAr: 'حسابي', labelEn: 'My Account', perm: null }, // always visible
];

function getAvailableTabs(perms) {
  return TABS_MAP.filter(t => {
    if (!t.perm) return true; // always show (e.g. account)
    if (Array.isArray(t.perm)) return t.perm.some(k => perms?.[k]);
    return Boolean(perms?.[t.perm]);
  });
}

// ─── Main Component ────────────────────────────────────────────────────────────
const VolunteerPortal = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  // ── Session ──
  const [loggedIn, setLoggedIn] = useState(false);
  const [volunteer, setVolunteer] = useState(null);
  const [activeTab, setActiveTab] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ── Login ──
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  // ── Captcha ──
  const captchaRef = useRef(null);
  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');

  // ── 2FA (TOTP) flow ──
  const [twoFARequired, setTwoFARequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState(false);
  const [pendingVolunteer, setPendingVolunteer] = useState(null);
  const [verifyingTotp, setVerifyingTotp] = useState(false);

  // ── Account tab state ──
  const [accForm, setAccForm] = useState({ nameAr: '', nameEn: '', email: '' });
  const [accSaving, setAccSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNext, setShowPwNext] = useState(false);
  const [adminNotifications, setAdminNotifications] = useState([]);
  const authEmailForUsername = (value) => `${value.toLowerCase()}@makanak.local`;

  // ── 2FA management (in account tab) ──
  const [tfaSetupMode, setTfaSetupMode] = useState(false); // showing QR setup
  const [tfaSecret, setTfaSecret] = useState('');
  const [tfaConfirmCode, setTfaConfirmCode] = useState('');
  const [tfaConfirming, setTfaConfirming] = useState(false);
  const [tfaDisabling, setTfaDisabling] = useState(false);
  const [tfaDisableCode, setTfaDisableCode] = useState('');

  // ─── Captcha init ──────────────────────────────────────────────────────────
  const refreshCaptcha = useCallback(() => {
    const text = genCaptchaText();
    setCaptchaText(text);
    setCaptchaInput('');
    setTimeout(() => drawCaptcha(captchaRef.current, text), 30);
  }, []);

  useEffect(() => {
    if (!loggedIn) refreshCaptcha();
  }, [loggedIn, refreshCaptcha]);

  useEffect(() => {
    if (!loggedIn && captchaRef.current && captchaText) {
      drawCaptcha(captchaRef.current, captchaText);
    }
  }, [captchaText, loggedIn]);

  // ─── Restore session ─────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('volunteer_session');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.username && parsed?.permissions) {
          setVolunteer(parsed);
          setLoggedIn(true);
          const first = getAvailableTabs(parsed.permissions)[0];
          if (first) setActiveTab(first.id);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Sync account form when volunteer loaded
  useEffect(() => {
    if (volunteer) {
      setAccForm({
        nameAr: volunteer.nameAr || '',
        nameEn: volunteer.nameEn || '',
        email: volunteer.email || '',
      });
    }
  }, [volunteer]);

  // إشعارات الإدارة الموجهة لهذا المنسق فقط
  useEffect(() => {
    if (!loggedIn || !volunteer?.username) return undefined;
    const notificationsQuery = query(
      collection(db, 'coordinatorNotifications'),
      where('recipientUsername', '==', volunteer.username)
    );
    return onSnapshot(notificationsQuery, (snapshot) => {
      const rows = snapshot.docs.map((notificationDoc) => ({ id: notificationDoc.id, ...notificationDoc.data() }));
      rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setAdminNotifications(rows);
    }, (error) => {
      console.warn('Coordinator notifications unavailable:', error?.message || error);
    });
  }, [loggedIn, volunteer?.username]);

  const markAdminNotificationRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'coordinatorNotifications', notificationId), { isRead: true });
    } catch (error) {
      console.warn('Could not mark coordinator notification as read:', error?.message || error);
    }
  };

  // ─── LOGIN ───────────────────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginErr('');

    // Sanitize inputs first
    const cleanUser = sanitizeUsername(username);
    const cleanPass = sanitizeInput(password, { allowSpaces: false, maxLength: 100 });

    if (!cleanUser || !cleanPass) {
      setLoginErr(isAr ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please enter username and password');
      return;
    }

    // Captcha check
    if (captchaInput.toUpperCase().trim() !== captchaText) {
      setLoginErr(isAr ? 'رمز التحقق غير صحيح' : 'Incorrect CAPTCHA');
      refreshCaptcha();
      return;
    }

    // Rate limit check
    const rateCheck = checkRateLimit(cleanUser);
    if (!rateCheck.allowed) {
      setLoginErr(isAr ? rateCheck.message : rateCheck.messageEn);
      return;
    }

    setLoggingIn(true);
    try {
      let found = null;
      try {
        const credential = await signInWithEmailAndPassword(auth, authEmailForUsername(cleanUser), cleanPass);
        const volSnap = await getDocs(query(collection(db, 'volunteers'), where('username', '==', cleanUser)));
        const volunteerDoc = volSnap.docs.find((entry) => entry.id === credential.user.uid) || volSnap.docs[0];
        if (volunteerDoc) found = { id: volunteerDoc.id, ...volunteerDoc.data() };
      } catch {
        const volSnap = await getDocs(collection(db, 'volunteers'));
        let legacyFound = null;
        volSnap.forEach(d => {
          const data = d.data();
          if (data.username === cleanUser && data.password === cleanPass) legacyFound = { id: d.id, ...data };
        });
        if (legacyFound) {
          try {
            await createUserWithEmailAndPassword(auth, authEmailForUsername(cleanUser), cleanPass);
          } catch (authError) {
            if (authError?.code !== 'auth/email-already-in-use') throw authError;
            await signInWithEmailAndPassword(auth, authEmailForUsername(cleanUser), cleanPass);
          }
          await updateDoc(doc(db, 'volunteers', legacyFound.id), { authUid: auth.currentUser.uid, password: deleteField(), updatedAt: serverTimestamp() });
          found = legacyFound;
        }
      }

      if (!found) {
        recordFailedAttempt(cleanUser);
        const { remaining } = checkRateLimit(cleanUser);
        setLoginErr(isAr ? `اسم المستخدم أو كلمة المرور غير صحيحة. (${remaining} محاولات متبقية)` : `Incorrect username or password. (${remaining} attempts left)`);
        refreshCaptcha();
        setLoggingIn(false);
        return;
      }


      if (found.active === false) {
        setLoginErr(isAr ? 'هذا الحساب موقوف. تواصل مع المسؤول.' : 'Account deactivated. Contact admin.');
        setLoggingIn(false);
        return;
      }

      clearAttempts(cleanUser);

      // Check if 2FA is enabled
      if (found.twoFAEnabled && found.twoFASecret) {
        setPendingVolunteer(found);
        setTwoFARequired(true);
        setLoggingIn(false);
        return;
      }

      // No 2FA — log in directly
      finalizeLogin(found);
    } catch (err) {
      console.error(err);
      setLoginErr(isAr ? 'خطأ في الاتصال. حاول مجدداً.' : 'Connection error. Try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  const finalizeLogin = (found) => {
    const session = {
      id: found.id,
      username: found.username,
      nameAr: found.nameAr,
      nameEn: found.nameEn,
      email: found.email || '',
      gender: found.gender || 'male',
      twoFAEnabled: found.twoFAEnabled || false,
      // Permissions sanitized — no delete keys ever
      permissions: sanitizePermissionsForVolunteer(found.permissions || {}),
    };
    sessionStorage.setItem('volunteer_session', JSON.stringify(session));
    setVolunteer(session);
    setLoggedIn(true);
    const first = getAvailableTabs(session.permissions)[0];
    if (first) setActiveTab(first.id);
    toast.success(isAr ? `مرحباً ${session.nameAr} 👋` : `Welcome ${session.nameEn || session.nameAr} 👋`);
  };

  // ─── 2FA Verify ──────────────────────────────────────────────────────────────
  const handleVerifyTOTP = async (e) => {
    e.preventDefault();
    if (!totpCode || totpCode.length !== 6) return;
    setVerifyingTotp(true);
    setTotpError(false);
    try {
      const ok = await verifyTOTP(pendingVolunteer.twoFASecret, totpCode);
      if (ok) {
        finalizeLogin(pendingVolunteer);
        setTwoFARequired(false);
        setPendingVolunteer(null);
        setTotpCode('');
      } else {
        setTotpError(true);
        setTotpCode('');
        toast.error(isAr ? 'رمز التحقق غير صحيح' : 'Invalid code');
      }
    } catch {
      toast.error(isAr ? 'خطأ في التحقق' : 'Verification error');
    } finally {
      setVerifyingTotp(false);
    }
  };

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    signOut(auth).catch(() => { });
    sessionStorage.removeItem('volunteer_session');
    setLoggedIn(false);
    setVolunteer(null);
    setUsername('');
    setPassword('');
    setLoginErr('');
    setActiveTab('');
    setTwoFARequired(false);
    setPendingVolunteer(null);
    setTotpCode('');
    refreshCaptcha();
  };

  // ─── ACCOUNT: Save Profile ───────────────────────────────────────────────────
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const nameAr = sanitizeInput(accForm.nameAr, { maxLength: 60 });
    const nameEn = sanitizeInput(accForm.nameEn, { maxLength: 60 });
    const email = sanitizeEmail(accForm.email);
    if (!nameAr) { toast.error(isAr ? 'الاسم بالعربي مطلوب' : 'Arabic name required'); return; }
    setAccSaving(true);
    try {
      await updateDoc(doc(db, 'volunteers', volunteer.id), {
        nameAr, nameEn: nameEn || nameAr, email, updatedAt: serverTimestamp(),
      });
      const updated = { ...volunteer, nameAr, nameEn: nameEn || nameAr, email };
      sessionStorage.setItem('volunteer_session', JSON.stringify(updated));
      setVolunteer(updated);
      toast.success(isAr ? 'تم حفظ البيانات ✅' : 'Profile saved ✅');
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشل الحفظ' : 'Save failed');
    } finally {
      setAccSaving(false);
    }
  };

  // ─── ACCOUNT: Change Password ─────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    const current = sanitizeInput(pwForm.current, { allowSpaces: false, maxLength: 100 });
    const next = sanitizeInput(pwForm.next, { allowSpaces: false, maxLength: 100 });
    const confirm = sanitizeInput(pwForm.confirm, { allowSpaces: false, maxLength: 100 });

    if (!current || !next || !confirm) {
      toast.error(isAr ? 'أكمل جميع الحقول' : 'Fill all fields'); return;
    }
    if (next.length < 8) {
      toast.error(isAr ? 'كلمة المرور الجديدة 8 أحرف على الأقل' : 'New password must be at least 8 characters'); return;
    }
    if (next !== confirm) {
      toast.error(isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'); return;
    }

    setPwSaving(true);
    try {
      if (!auth.currentUser) throw new Error('AUTH_REQUIRED');
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, next);
      } else {
        const snap = await getDoc(doc(db, 'volunteers', volunteer.id));
        if (!snap.exists() || snap.data().password !== current) {
          toast.error(isAr ? 'كلمة المرور الحالية غير صحيحة' : 'Current password is incorrect');
          setPwSaving(false);
          return;
        }
        await updateDoc(doc(db, 'volunteers', volunteer.id), { password: next, updatedAt: serverTimestamp() });
      }
      setPwForm({ current: '', next: '', confirm: '' });
      toast.success(isAr ? 'تم تغيير كلمة المرور بنجاح 🔐' : 'Password changed successfully 🔐');
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشل التغيير' : 'Change failed');
    } finally {
      setPwSaving(false);
    }
  };

  // ─── 2FA SETUP: Start ────────────────────────────────────────────────────────
  const handleStart2FASetup = () => {
    const secret = generateBase32Secret();
    setTfaSecret(secret);
    setTfaConfirmCode('');
    setTfaSetupMode(true);
  };

  // ─── 2FA SETUP: Confirm & Enable ────────────────────────────────────────────
  const handleConfirm2FA = async (e) => {
    e.preventDefault();
    if (tfaConfirmCode.length !== 6) {
      toast.error(isAr ? 'أدخل رمز الـ 6 أرقام' : 'Enter 6-digit code'); return;
    }
    setTfaConfirming(true);
    try {
      const ok = await verifyTOTP(tfaSecret, tfaConfirmCode);
      if (!ok) {
        toast.error(isAr ? 'الرمز غير صحيح، تأكد من تطبيق Authenticator' : 'Incorrect code. Check your Authenticator app.');
        setTfaConfirming(false);
        return;
      }
      await updateDoc(doc(db, 'volunteers', volunteer.id), {
        twoFAEnabled: true, twoFASecret: tfaSecret, updatedAt: serverTimestamp(),
      });
      const updated = { ...volunteer, twoFAEnabled: true };
      sessionStorage.setItem('volunteer_session', JSON.stringify(updated));
      setVolunteer(updated);
      setTfaSetupMode(false);
      setTfaSecret('');
      toast.success(isAr ? '✅ تم تفعيل المصادقة الثنائية بنجاح!' : '✅ Two-factor authentication enabled!');
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشل التفعيل' : 'Setup failed');
    } finally {
      setTfaConfirming(false);
    }
  };

  // ─── 2FA DISABLE ─────────────────────────────────────────────────────────────
  const handleDisable2FA = async (e) => {
    e.preventDefault();
    if (tfaDisableCode.length !== 6) {
      toast.error(isAr ? 'أدخل رمز التحقق أولاً' : 'Enter verification code first'); return;
    }
    setTfaDisabling(true);
    try {
      // Re-fetch secret from Firestore to verify
      const snap = await getDoc(doc(db, 'volunteers', volunteer.id));
      const secret = snap.data()?.twoFASecret || '';
      const ok = await verifyTOTP(secret, tfaDisableCode);
      if (!ok) {
        toast.error(isAr ? 'الرمز غير صحيح' : 'Incorrect code');
        setTfaDisabling(false);
        return;
      }
      await updateDoc(doc(db, 'volunteers', volunteer.id), {
        twoFAEnabled: false, twoFASecret: '', updatedAt: serverTimestamp(),
      });
      const updated = { ...volunteer, twoFAEnabled: false };
      sessionStorage.setItem('volunteer_session', JSON.stringify(updated));
      setVolunteer(updated);
      setTfaDisableCode('');
      toast.success(isAr ? 'تم تعطيل المصادقة الثنائية' : '2FA disabled');
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشل التعطيل' : 'Disable failed');
    } finally {
      setTfaDisabling(false);
    }
  };

  // ─── SCREENS ─────────────────────────────────────────────────────────────────

  // ── 2FA Screen ──
  if (twoFARequired && pendingVolunteer) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card" style={{ maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔐</div>
            <h1 className="admin-login-title" style={{ fontSize: '1.4rem' }}>
              {isAr ? 'المصادقة الثنائية' : 'Two-Factor Auth'}
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '0.88rem', marginTop: '0.4rem' }}>
              {isAr
                ? `مرحباً ${pendingVolunteer.nameAr} — أدخل رمز تطبيق Authenticator`
                : `Hi ${pendingVolunteer.nameEn || pendingVolunteer.nameAr} — Enter your Authenticator code`}
            </p>
          </div>

          <form onSubmit={handleVerifyTOTP} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* 6 OTP boxes */}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={totpCode[i] || ''}
                  onChange={ev => {
                    const val = ev.target.value.replace(/\D/, '');
                    const arr = totpCode.split('');
                    arr[i] = val;
                    const joined = arr.join('').slice(0, 6);
                    setTotpCode(joined);
                    setTotpError(false);
                    if (val && i < 5) {
                      const next = ev.target.parentElement.children[i + 1];
                      if (next) next.focus();
                    }
                  }}
                  onKeyDown={ev => {
                    if (ev.key === 'Backspace' && !totpCode[i] && i > 0) {
                      const prev = ev.target.parentElement.children[i - 1];
                      if (prev) prev.focus();
                    }
                  }}
                  style={{
                    width: '46px', height: '54px',
                    textAlign: 'center', fontSize: '1.4rem', fontWeight: 800,
                    background: totpError ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)',
                    border: totpError ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.15)',
                    borderRadius: '10px', color: '#f8fafc',
                    outline: 'none', transition: 'all 0.2s',
                  }}
                />
              ))}
            </div>

            {totpError && (
              <p style={{ textAlign: 'center', color: '#f87171', fontSize: '0.85rem' }}>
                ⚠️ {isAr ? 'رمز خاطئ. حاول مجدداً.' : 'Wrong code. Try again.'}
              </p>
            )}

            <button
              type="submit"
              className="submit-btn full-width"
              disabled={verifyingTotp || totpCode.length < 6}
              style={{ opacity: totpCode.length < 6 ? 0.6 : 1 }}
            >
              {verifyingTotp ? (isAr ? 'جاري التحقق...' : 'Verifying...') : (isAr ? 'تحقق ودخول' : 'Verify & Sign In')}
            </button>

            <button
              type="button"
              onClick={() => { setTwoFARequired(false); setPendingVolunteer(null); setTotpCode(''); refreshCaptcha(); }}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem', textDecoration: 'underline' }}
            >
              {isAr ? '← الرجوع إلى تسجيل الدخول' : '← Back to login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Login Screen ──
  if (!loggedIn) {
    return (
      <div className="admin-login-screen">
        <div className="admin-login-card">
          <div className="admin-login-logo"></div>
          <h1 className="admin-login-title">{isAr ? 'بوابة المتطوعين' : 'Volunteer Portal'}</h1>
          <p className="admin-login-subtitle">
            {isAr ? 'مكانك الجامعي — تسجيل دخول فريق المتطوعين' : 'Makanak Al-Jamii — Volunteer Team Sign In'}
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{isAr ? 'اسم المستخدم:' : 'Username:'}</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={e => { setUsername(e.target.value); setLoginErr(''); }}
                placeholder={isAr ? 'مثال: hussien0' : 'e.g. hussien0'}
                dir="ltr"
                autoComplete="username"
                maxLength={40}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{isAr ? 'كلمة المرور:' : 'Password:'}</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={e => { setPassword(e.target.value); setLoginErr(''); }}
                placeholder={isAr ? 'أدخل كلمة المرور' : 'Enter your password'}
                dir="ltr"
                autoComplete="current-password"
                maxLength={100}
                required
              />
            </div>

            {/* Captcha */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <canvas
                  ref={captchaRef}
                  width={160}
                  height={48}
                  style={{ borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                  onClick={refreshCaptcha}
                  title={isAr ? 'انقر لتحديث الصورة' : 'Click to refresh'}
                />
                <button
                  type="button"
                  onClick={refreshCaptcha}
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', borderRadius: '8px', padding: '0.4rem 0.7rem', cursor: 'pointer', fontSize: '1rem' }}
                  title={isAr ? 'تحديث' : 'Refresh'}
                >
                  🔄
                </button>
              </div>
              <input
                type="text"
                className="form-input"
                value={captchaInput}
                onChange={e => setCaptchaInput(e.target.value.toUpperCase())}
                placeholder={isAr ? 'أدخل رمز التحقق أعلاه' : 'Enter code shown above'}
                dir="ltr"
                maxLength={5}
                required
              />
            </div>

            {loginErr && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.75rem 1rem', fontSize: '0.85rem', color: '#f87171', direction: 'rtl', textAlign: 'right' }}>
                ⚠️ {loginErr}
              </div>
            )}

            <button type="submit" className="submit-btn full-width" style={{ marginTop: '0.5rem' }} disabled={loggingIn}>
              {loggingIn ? (isAr ? 'جاري تسجيل الدخول...' : 'Signing in...') : (isAr ? 'تسجيل الدخول' : 'Sign In')}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', margin: '0.5rem 0 0' }}>
            {isAr ? '🔒 للحصول على حساب متطوع تواصل مع إدارة الموقع' : '🔒 Contact system administrator for credentials'}
          </p>
        </div>
      </div>
    );
  }

  // ── No permissions ──
  const availableTabs = getAvailableTabs(volunteer.permissions);
  if (availableTabs.length <= 1) { // only "account" tab
    return (
      <div className="admin-dashboard-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="admin-glass-card" style={{ padding: '3rem 2.5rem', textAlign: 'center', maxWidth: '480px', margin: '1rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔒</div>
          <h3 style={{ color: 'var(--adm-text)', fontSize: '1.3rem', fontWeight: 800 }}>
            {isAr ? 'لا توجد صلاحيات محددة' : 'No Permissions Assigned'}
          </h3>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginTop: '0.5rem' }}>
            {isAr ? 'حسابك مفعل ولكن لم يتم تعيين صلاحيات وصول لك بعد.' : 'Account active but no permissions assigned yet.'}
          </p>
          <button className="admin-action-btn decline" style={{ marginTop: '1.5rem', padding: '0.6rem 1.4rem' }} onClick={handleLogout}>
            🚪 {isAr ? 'تسجيل الخروج' : 'Logout'}
          </button>
        </div>
      </div>
    );
  }

  // ── Account Tab Content ──
  const AccountTab = () => {
    const qrUri = tfaSecret ? buildOtpAuthUri(tfaSecret, volunteer.username) : '';
    const qrUrl = tfaSecret ? buildQRCodeUrl(qrUri, 200) : '';

    return (
      <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 className="admin-section-title">👤 {isAr ? 'حسابي الشخصي' : 'My Account'}</h3>
          <p style={{ color: 'var(--adm-muted)', fontSize: '0.88rem' }}>
            {isAr ? 'تعديل بياناتك الشخصية وإدارة أمان حسابك' : 'Edit your personal data and manage account security'}
          </p>
        </div>

        {/* Profile Info Card */}
        <div className="admin-glass-card" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--adm-text)', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ✏️ {isAr ? 'المعلومات الشخصية' : 'Personal Information'}
          </h4>
          <form onSubmit={handleSaveProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {isAr ? 'الاسم بالعربي *' : 'Arabic Name *'}
              </label>
              <input
                type="text"
                className="admin-input-field"
                value={accForm.nameAr}
                onChange={e => setAccForm(p => ({ ...p, nameAr: e.target.value }))}
                placeholder={isAr ? 'الاسم الكامل' : 'Full name in Arabic'}
                maxLength={60}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {isAr ? 'الاسم بالإنجليزي' : 'English Name'}
              </label>
              <input
                type="text"
                className="admin-input-field"
                value={accForm.nameEn}
                onChange={e => setAccForm(p => ({ ...p, nameEn: e.target.value }))}
                placeholder="Full name in English"
                dir="ltr"
                maxLength={60}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {isAr ? 'البريد الإلكتروني' : 'Email Address'}
              </label>
              <input
                type="email"
                className="admin-input-field"
                value={accForm.email}
                onChange={e => setAccForm(p => ({ ...p, email: e.target.value }))}
                placeholder="email@example.com"
                dir="ltr"
                maxLength={100}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" className="admin-action-btn approve" style={{ width: '100%', padding: '0.65rem' }} disabled={accSaving}>
                {accSaving ? '...' : (isAr ? '💾 حفظ التعديلات' : '💾 Save Changes')}
              </button>
            </div>
          </form>
          <div style={{ marginTop: '1rem', padding: '0.6rem 1rem', background: 'rgba(100,116,139,0.06)', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--adm-muted)' }}>
            🔒 {isAr ? `اسم المستخدم: @${volunteer.username} (غير قابل للتغيير)` : `Username: @${volunteer.username} (cannot be changed)`}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="admin-glass-card" style={{ marginBottom: '1.5rem' }}>
          <h4 style={{ color: 'var(--adm-text)', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🔑 {isAr ? 'تغيير كلمة المرور' : 'Change Password'}
          </h4>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxWidth: '420px' }}>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {isAr ? 'كلمة المرور الحالية' : 'Current Password'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwCurrent ? 'text' : 'password'}
                  className="admin-input-field"
                  value={pwForm.current}
                  onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                  dir="ltr"
                  maxLength={100}
                  required
                />
                <button type="button" onClick={() => setShowPwCurrent(p => !p)}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }}>
                  {showPwCurrent ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {isAr ? 'كلمة المرور الجديدة (8+ أحرف)' : 'New Password (8+ chars)'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwNext ? 'text' : 'password'}
                  className="admin-input-field"
                  value={pwForm.next}
                  onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))}
                  dir="ltr"
                  maxLength={100}
                  minLength={8}
                  required
                />
                <button type="button" onClick={() => setShowPwNext(p => !p)}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }}>
                  {showPwNext ? '🙈' : '👁️'}
                </button>
              </div>
              {pwForm.next && (
                <div style={{ marginTop: '0.35rem', display: 'flex', gap: '4px' }}>
                  {[...Array(4)].map((_, i) => {
                    const strength = [pwForm.next.length >= 8, /[A-Z]/.test(pwForm.next), /\d/.test(pwForm.next), /[^a-zA-Z0-9]/.test(pwForm.next)];
                    const filled = strength.filter(Boolean).length;
                    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
                    return (
                      <div key={i} style={{ height: '4px', flex: 1, borderRadius: '4px', background: i < filled ? colors[filled - 1] : 'rgba(255,255,255,0.1)', transition: 'all 0.3s' }} />
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
              </label>
              <input
                type="password"
                className="admin-input-field"
                value={pwForm.confirm}
                onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                dir="ltr"
                maxLength={100}
                required
              />
              {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                <p style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                  {isAr ? '⚠️ كلمتا المرور غير متطابقتين' : '⚠️ Passwords do not match'}
                </p>
              )}
            </div>
            <button type="submit" className="admin-action-btn edit-q" style={{ width: 'fit-content', padding: '0.65rem 1.5rem' }} disabled={pwSaving}>
              {pwSaving ? '...' : (isAr ? '🔐 تغيير كلمة المرور' : '🔐 Change Password')}
            </button>
          </form>
        </div>

        {/* 2FA Card */}
        <div className="admin-glass-card" style={{ border: volunteer.twoFAEnabled ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <h4 style={{ color: 'var(--adm-text)', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🛡️ {isAr ? 'المصادقة الثنائية (2FA)' : 'Two-Factor Authentication (2FA)'}
            </h4>
            <span style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 800,
              background: volunteer.twoFAEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.12)',
              color: volunteer.twoFAEnabled ? '#34d399' : '#fbbf24',
              border: volunteer.twoFAEnabled ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
            }}>
              {volunteer.twoFAEnabled ? (isAr ? '✅ مفعّلة' : '✅ Enabled') : (isAr ? '⚠️ غير مفعّلة' : '⚠️ Disabled')}
            </span>
          </div>

          <p style={{ color: 'var(--adm-muted)', fontSize: '0.88rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            {isAr
              ? 'المصادقة الثنائية تضيف طبقة أمان إضافية لحسابك. بعد التفعيل، ستحتاج لإدخال رمز من تطبيق Google Authenticator أو Authy عند كل تسجيل دخول.'
              : 'Two-factor authentication adds an extra security layer. After enabling, you\'ll need a code from Google Authenticator or Authy on each login.'}
          </p>

          {!volunteer.twoFAEnabled && !tfaSetupMode && (
            <button className="admin-action-btn approve" onClick={handleStart2FASetup} style={{ padding: '0.65rem 1.5rem' }}>
              🔑 {isAr ? 'تفعيل المصادقة الثنائية' : 'Enable 2FA'}
            </button>
          )}

          {/* 2FA Setup Mode */}
          {tfaSetupMode && !volunteer.twoFAEnabled && (
            <div style={{ marginTop: '0.5rem' }}>
              <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 700, color: '#93c5fd', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  {isAr ? '📱 الخطوة 1: افتح تطبيق Google Authenticator أو Authy وامسح الكود' : '📱 Step 1: Open Google Authenticator or Authy and scan the QR code'}
                </p>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ background: '#fff', borderRadius: '12px', padding: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
                    <img src={qrUrl} alt="2FA QR Code" width={160} height={160} style={{ display: 'block' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <p style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', marginBottom: '0.5rem' }}>
                      {isAr ? 'أو أدخل السر يدوياً في التطبيق:' : 'Or enter the secret manually:'}
                    </p>
                    <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', color: '#93c5fd', letterSpacing: '2px', display: 'block', wordBreak: 'break-all', direction: 'ltr', userSelect: 'all' }}>
                      {tfaSecret}
                    </code>
                  </div>
                </div>
              </div>

              <form onSubmit={handleConfirm2FA} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '340px' }}>
                <label style={{ fontSize: '0.88rem', color: 'var(--adm-text)', fontWeight: 700 }}>
                  {isAr ? '📱 الخطوة 2: أدخل الرمز المكون من 6 أرقام من التطبيق:' : '📱 Step 2: Enter the 6-digit code from the app:'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="admin-input-field"
                  value={tfaConfirmCode}
                  onChange={e => setTfaConfirmCode(e.target.value.replace(/\D/, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  dir="ltr"
                  style={{ letterSpacing: '6px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800 }}
                  required
                />
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="admin-action-btn approve" disabled={tfaConfirming || tfaConfirmCode.length < 6} style={{ flex: 1 }}>
                    {tfaConfirming ? '...' : (isAr ? '✅ تفعيل' : '✅ Activate')}
                  </button>
                  <button type="button" className="admin-action-btn decline" onClick={() => { setTfaSetupMode(false); setTfaSecret(''); }} style={{ flex: 1 }}>
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Disable 2FA */}
          {volunteer.twoFAEnabled && (
            <form onSubmit={handleDisable2FA} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxWidth: '340px', marginTop: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', color: '#f87171', fontWeight: 700 }}>
                ⚠️ {isAr ? 'لتعطيل 2FA أدخل رمز Authenticator الحالي:' : 'To disable 2FA, enter your current Authenticator code:'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="admin-input-field"
                value={tfaDisableCode}
                onChange={e => setTfaDisableCode(e.target.value.replace(/\D/, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                dir="ltr"
                style={{ letterSpacing: '6px', textAlign: 'center', fontSize: '1.4rem', fontWeight: 800 }}
              />
              <button type="submit" className="admin-action-btn decline" disabled={tfaDisabling || tfaDisableCode.length < 6} style={{ width: 'fit-content', padding: '0.6rem 1.2rem' }}>
                {tfaDisabling ? '...' : (isAr ? '🚫 تعطيل المصادقة الثنائية' : '🚫 Disable 2FA')}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  };

  // ── Authenticated Dashboard ──
  return (
    <>
      <div className="admin-dashboard-page">
        {/* Top Navbar */}
        <nav className="admin-top-navbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '72px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.1)', zIndex: 1000, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: '1600px', margin: '0 auto', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <button
                onClick={() => setSidebarOpen(p => !p)}
                style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >☰</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.4rem' }}>🤝</span>
                <div>
                  <span style={{ fontWeight: 900, fontSize: '1.05rem', color: '#ffffff' }}>
                    {isAr ? 'بوابة المتطوعين' : 'Volunteer Portal'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#93c5fd', marginRight: '0.5rem', background: 'rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.4)', fontWeight: 700 }}>
                    RBAC
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* 2FA badge */}
              <span title={isAr ? 'حالة المصادقة الثنائية' : '2FA status'}
                style={{ fontSize: '0.78rem', color: volunteer.twoFAEnabled ? '#34d399' : '#fbbf24', background: volunteer.twoFAEnabled ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', padding: '3px 10px', borderRadius: '12px', border: `1px solid ${volunteer.twoFAEnabled ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, fontWeight: 700, cursor: 'default' }}>
                {volunteer.twoFAEnabled ? '🔐 2FA' : '⚠️ 2FA'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.06)', padding: '5px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span>{volunteer.gender === 'female' ? '👩' : '👨'}</span>
                <span style={{ fontSize: '0.82rem', color: '#f8fafc', fontWeight: 600 }}>
                  {isAr ? volunteer.nameAr : (volunteer.nameEn || volunteer.nameAr)}
                </span>
              </div>
              <button
                onClick={handleLogout}
                style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '0.5rem 1.1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>🚪</span>
                <span>{isAr ? 'خروج' : 'Logout'}</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Dashboard body */}
        <div className="admin-dashboard-container">
          {/* Sidebar */}
          <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
            <div className="admin-sidebar-header">
              <h3>{isAr ? 'القائمة المتاحة' : 'Navigation'}</h3>
              <button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)}>×</button>
            </div>

            {/* Volunteer badge */}
            <div style={{ padding: '0.75rem', marginBottom: '1rem', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '12px' }}>
              <div style={{ fontSize: '0.82rem', color: '#93c5fd', fontWeight: 700 }}>
                {volunteer.gender === 'female' ? '👩' : '👨'} {isAr ? volunteer.nameAr : (volunteer.nameEn || volunteer.nameAr)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--adm-muted)', marginTop: '0.15rem' }}>@{volunteer.username}</div>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.65rem', color: '#f87171', padding: '1px 7px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px' }}>🚫 {isAr ? 'بدون حذف' : 'No Delete'}</span>
                {volunteer.twoFAEnabled && (
                  <span style={{ fontSize: '0.65rem', color: '#34d399', padding: '1px 7px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px' }}>🔐 2FA</span>
                )}
              </div>
            </div>

            <ul className="admin-sidebar-links">
              {availableTabs.map(t => {
                const active = activeTab === t.id;
                return (
                  <li key={t.id}>
                    <button
                      className={`admin-sidebar-btn ${active ? 'active' : ''}`}
                      onClick={() => setActiveTab(t.id)}
                    >
                      <span style={{ fontSize: '1.15rem' }}>{t.icon}</span>
                      <span style={{ flex: 1 }}>{isAr ? t.labelAr : t.labelEn}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* Main Content */}
          <main className="admin-main-canvas">
            {/* Restriction banner */}
            {activeTab !== 'account' && (
              <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '10px', padding: '0.65rem 1.1rem', marginBottom: '0.5rem', fontSize: '0.82rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🛡️ {isAr
                  ? 'أنت مسجل كمتطوع — الإضافة والتعديل فقط، الحذف محظور لحماية البيانات'
                  : 'Volunteer mode — add & edit only, deletion disabled for data protection'}
              </div>
            )}

            {activeTab === 'account' && <AccountTab />}
            {activeTab === 'analytics' && volunteer.permissions?.canViewAnalytics && <AdminAnalytics />}
            {activeTab === 'courses' && (volunteer.permissions?.canAddCourses || volunteer.permissions?.canEditCourses) && (
              <AdminCourses volunteerMode canDelete={false} canEdit={!!volunteer.permissions?.canEditCourses} canAdd={!!volunteer.permissions?.canAddCourses} />
            )}
            {activeTab === 'notices' && volunteer.permissions?.canManageNotices && <AdminNotices volunteerMode />}
            {activeTab === 'chatfaq' && volunteer.permissions?.canManageFAQ && <AdminChatFAQ volunteerMode />}
            {activeTab === 'contributions' && volunteer.permissions?.canApproveContributions && <AdminContributions volunteerMode />}
            {activeTab === 'notifications' && (
              <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl' }}>
                <div className="admin-glass-card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <h3 className="admin-section-title" style={{ margin: 0 }}>🔔 {isAr ? 'إشعارات الإدارة' : 'Admin Notifications'}</h3>
                      <p style={{ color: 'var(--adm-muted)', fontSize: '0.85rem', margin: '0.35rem 0 0' }}>{isAr ? 'رسائل خاصة موجهة إليك من الإدارة.' : 'Private messages from the administration.'}</p>
                    </div>
                    <span style={{ color: '#34d399', fontWeight: 800 }}>{adminNotifications.filter(notification => !notification.isRead).length}</span>
                  </div>
                  {adminNotifications.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--adm-muted)' }}>{isAr ? 'لا توجد إشعارات جديدة.' : 'No notifications yet.'}</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {adminNotifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => markAdminNotificationRead(notification.id)}
                          style={{ textAlign: 'right', padding: '1rem', borderRadius: '12px', border: `1px solid ${notification.isRead ? 'rgba(148,163,184,0.2)' : 'rgba(52,211,153,0.45)'}`, background: notification.isRead ? 'rgba(255,255,255,0.04)' : 'rgba(16,185,129,0.1)', color: 'var(--adm-text)', cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <strong>{notification.title || (isAr ? 'إشعار من الإدارة' : 'Admin notification')}</strong>
                            {!notification.isRead && <span style={{ color: '#34d399', fontSize: '0.75rem', fontWeight: 800 }}>{isAr ? 'جديد' : 'NEW'}</span>}
                          </div>
                          <div style={{ color: 'var(--adm-muted)', marginTop: '0.45rem', lineHeight: 1.7 }}>{notification.message}</div>
                          {notification.createdAt && <time style={{ display: 'block', color: 'var(--adm-muted)', fontSize: '0.7rem', marginTop: '0.45rem' }}>{String(notification.createdAt).slice(0, 16)}</time>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'exchange' && volunteer.permissions?.canManageSwap && (
              <div className="admin-donations-embed"><MaterialExchange isEmbedded volunteerMode /></div>
            )}
            {activeTab === 'quizzes' && (volunteer.permissions?.canAddExams || volunteer.permissions?.canEditExams) && (
              <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl' }}>
                <div className="admin-glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
                  <h3 style={{ color: 'var(--adm-text)' }}>{isAr ? 'إدارة الاختبارات' : 'Quiz Management'}</h3>
                  <p style={{ color: 'var(--adm-muted)', fontSize: '0.9rem' }}>
                    {isAr ? 'هذه الميزة ستُضاف قريباً مباشرة للمتطوعين.' : 'This feature will be added for volunteers soon.'}
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
};

export default VolunteerPortal;
