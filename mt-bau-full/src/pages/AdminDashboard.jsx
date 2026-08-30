import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../config/firebase';
import {
  collection, query, orderBy, limit, getDocs, addDoc,
  doc, getDoc, updateDoc, deleteDoc, where, onSnapshot,
  setDoc, serverTimestamp
} from 'firebase/firestore';
import { auth } from '../config/firebase';
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { useLanguage } from '../contexts/LanguageContext';
import toast from 'react-hot-toast';
import FileUploader from '../components/FileUploader';
import { subscribeToContributions, approveContribution, deleteContribution } from '../services/contributionsService';
import { quizCategories, quizData as staticBaseQuizData } from '../data/quizData';
import { extraQuizData as staticExtraQuizData } from '../data/quizDataExtra';
import { createWorker } from 'tesseract.js';
import AdminAnalytics from '../components/admin/AdminAnalytics';
import AdminGeneral from '../components/admin/AdminGeneral';
import AdminFeedback from '../components/admin/AdminFeedback';
import AdminCourses from '../components/admin/AdminCourses';
import AdminReports from '../components/admin/AdminReports';
import AdminContributions from '../components/admin/AdminContributions';
import AdminActivityLog from '../components/admin/AdminActivityLog';
import AdminChatFAQ from '../components/admin/AdminChatFAQ';
import AdminCoordinators from '../components/admin/AdminCoordinators';
import AdminVolunteers from '../components/admin/AdminVolunteers';
import AdminCoordinatorApplications from '../components/admin/AdminCoordinatorApplications';
import AdminCourseStatusManager from '../components/AdminCourseStatusManager';
import AdminNotices from '../components/admin/AdminNotices';
import AdminServiceRequests from '../components/admin/AdminServiceRequests';
import AdminDeletedItems from '../components/admin/AdminDeletedItems';
import AdminNotificationBell from '../components/AdminNotificationBell';
import AdminQuestionBankTools from '../components/admin/AdminQuestionBankTools';
import MaterialExchange from './MaterialExchange';
import { archiveItem } from '../services/deletedItemsService';
import './AdminDashboard.css';

// ── CAPTCHA helpers ──────────────────────────────────────────────────
function generateText() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 5; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function drawCanvas(canvas, text) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  ctx.fillStyle = isDark ? '#1f2937' : '#f3f4f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
    ctx.stroke();
  }
  const fontSize = Math.floor(canvas.height * 0.55);
  ctx.font = `bold ${fontSize}px Courier New, monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const colors = isDark
    ? ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#ff9ff3']
    : ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#6c5ce7', '#db0a5b'];
  const spacing = canvas.width / (text.length + 1);
  for (let i = 0; i < text.length; i++) {
    ctx.save();
    ctx.fillStyle = colors[i % colors.length];
    const x = spacing * 0.85 + i * spacing + (Math.random() - 0.5) * 8;
    const y = canvas.height / 2 + (Math.random() - 0.5) * 6;
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.35);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }
}

// ── Path label helper ─────────────────────────────────────────────────
const PATH_LABELS = {
  '/': 'الرئيسي',
  '/materials': 'المواد الدراسية',
  '/plans': 'الخطط الدراسي',
  '/quiz': 'الاختبارات',
  '/calendar': 'التقويم',
  '/grading': 'الدرجات',
  '/exchange': 'تبادل المواد',
  '/about': 'من نحن',
  '/faq': 'الأسئلة الشائعة',
  '/materials/click': 'مواد (تحميل)',
  '/quiz/complete': 'اختبار (إتمام)',
};
const getPathLabel = (path, lang) => {
  if (lang === 'ar') {
    return PATH_LABELS[path] || path;
  }
  const en = {
    '/': 'Home', '/materials': 'Study Materials', '/plans': 'Academic Plans',
    '/quiz': 'Quizzes', '/calendar': 'Calendar', '/grading': 'Grading',
    '/exchange': 'Exchange', '/about': 'About', '/faq': 'FAQ',
    '/materials/click': 'Materials (Download)', '/quiz/complete': 'Quiz (Completed)',
  };
  return en[path] || path;
};

// ── Type badge ────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const map = {
    visit: { label: 'زيارة', cls: 'badge-visit', en: 'Visit' },
    material_view: { label: 'مادة', cls: 'badge-material', en: 'Material' },
    quiz_completed: { label: 'اختبار', cls: 'badge-quiz', en: 'Quiz' },
  };
  const b = map[type] || { label: type, cls: 'badge-visit', en: type };
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
}

// ── Date formatter ────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('ar-JO') + ' ' + d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
}

// ══════════════════════════════════════════════════════════════════════

const AdminDashboard = ({ isEmbedded = false }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  // ── Auth state ──
  // Always start as false — Firebase Auth must be established each session
  const [loggedIn, setLoggedIn] = useState(false);
  const [feedbackPopupEnabled, setFeedbackPopupEnabled] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const settingsRef = doc(db, 'system_configs', 'global_settings');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setFeedbackPopupEnabled(data.feedbackPopupEnabled ?? true);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const toggleFeedbackPopupEnabled = async () => {
    try {
      const newValue = !feedbackPopupEnabled;
      await setDoc(doc(db, 'system_configs', 'global_settings'), {
        feedbackPopupEnabled: newValue,
      }, { merge: true });
      setFeedbackPopupEnabled(newValue);
      toast.success(isAr ? 'تم تحديث إعداد نافذة التقييم' : 'Feedback popup setting updated');
    } catch (err) {
      console.error('Failed to update feedback popup setting', err);
      toast.error(isAr ? 'فشل تحديث إعدادات النظام' : 'Failed to update system setting');
    }
  };

  // Generate captcha
  const genCaptcha = useCallback(() => {
    const t = generateText();
    setCaptchaText(t);
    setCaptchaInput('');
    setCaptchaErr(false);
    setTimeout(() => drawCanvas(canvasRef.current, t), 50);
  }, []);

  useEffect(() => { if (!loggedIn) genCaptcha(); }, [loggedIn, genCaptcha]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (captchaInput.trim().toUpperCase() !== captchaText) {
      setCaptchaErr(true);
      genCaptcha();
      return;
    }

    // Secure dynamic credential check from Firestore at login attempt time
    let expectedPass = 'admin2024';
    try {
      const settingsRef = doc(db, 'system_configs', 'global_settings');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data.adminPassword) expectedPass = data.adminPassword;
      }
    } catch (err) {
      console.error("Failed to fetch settings for authentication check", err);
    }

    if (adminUsername.trim().toLowerCase() !== 'admin' || adminPwd !== expectedPass) {
      setLoginErr(isAr ? 'اسم المستخدم أو كود التحقق غير صحيح' : 'Incorrect username or access code');
      genCaptcha();
      return;
    }

    setLoginErr('');

    // Attempt Firebase anonymous authentication gracefully (non-blocking)
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    } catch (authErr) {
      console.warn('Firebase auth sign-in skipped (non-critical):', authErr?.code || authErr?.message);
    }

    sessionStorage.setItem('exchange_staff', JSON.stringify({ role: 'admin', username: 'admin' }));
    setLoggedIn(true);
  };

  const [adminUsername, setAdminUsername] = useState('');
  const [adminPwd, setAdminPwd] = useState('');
  const [showAdminPwd, setShowAdminPwd] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaErr, setCaptchaErr] = useState(false);
  const canvasRef = useRef(null);

  const [resetRequestPending, setResetRequestPending] = useState(false);
  const [resetRequestSent, setResetRequestSent] = useState(false);





  // ── Dashboard data state ──
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState(() => searchParams.get('tab') || 'analytics');

  const setActiveTab = (tabId) => {
    setActiveTabState(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };
  const [pageViews, setPageViews] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [contributions, setContributions] = useState([]);
  const [contributionsLoading, setContributionsLoading] = useState(true);
  const [showAdminUploader, setShowAdminUploader] = useState(false);
  const [previewFile, setPreviewFile] = useState(null); // { url, type, name }
  const [selectedGeneralPage, setSelectedGeneralPage] = useState('system_settings');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // ── Question-edit modal ──
  const [editingReport, setEditingReport] = useState(null);
  const [editForm, setEditForm] = useState({ questionAr: '', questionEn: '', options: [], correctAnswer: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const imageInputRef = useRef(null);

  const [isAuthed, setIsAuthed] = useState(false);

  // ── Quiz Management States ──
  const [qManageSubjects, setQManageSubjects] = useState([]);
  const [qManageParts, setQManageParts] = useState([]);
  const [qManageQuestions, setQManageQuestions] = useState([]);
  const [quizExportData, setQuizExportData] = useState({ subjects: [], parts: [], questions: [] });
  const [quizAuditLogs, setQuizAuditLogs] = useState([]);
  const [quizView, setQuizView] = useState('bank');
  const [quizAuditPeriod, setQuizAuditPeriod] = useState('all');
  const [subjectRefreshKey, setSubjectRefreshKey] = useState(0);

  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');

  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ id: '', name: '', nameAr: '', icon: '', color: '#6366F1', languageMode: 'both' });
  const [editingSubjectOriginalId, setEditingSubjectOriginalId] = useState(null); // null = add mode, string = edit mode

  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const [partForm, setPartForm] = useState({ id: '', title: '', titleAr: '', isGroup: false, subParts: [], durationMinutes: 30, passMark: '' });
  const [selectedSubPartId, setSelectedSubPartId] = useState(''); // for drilling into group sub-parts in column 3

  const [editingQuestion, setEditingQuestion] = useState(null);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showQuestionBankTools, setShowQuestionBankTools] = useState(false);
  const [questionForm, setQuestionForm] = useState({ id: '', type: 'mcq', questionAr: '', questionEn: '', options: [], correctAnswer: '', marks: 1.0, image: '', image2: '', codeBlock: '' });

  // Hidden file inputs for question image upload from device inside quizzes tab
  const quizImageInputRef = useRef(null);
  const [quizImageUploading, setQuizImageUploading] = useState(false);
  const [quizImageProgress, setQuizImageProgress] = useState(0);

  const quizImage2InputRef = useRef(null);
  const [quizImage2Uploading, setQuizImage2Uploading] = useState(false);
  const [quizImage2Progress, setQuizImage2Progress] = useState(0);

  const ocrInputRef = useRef(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  // Persist last-used marks value so new questions inherit it instead of defaulting to 1
  const lastMarksRef = useRef(1.0);

  const getQuizOperator = () => {
    try {
      const staff = JSON.parse(sessionStorage.getItem('exchange_staff') || '{}');
      return {
        id: staff.username || staff.id || auth.currentUser?.uid || 'admin',
        name: staff.name || staff.fullName || staff.username || 'admin'
      };
    } catch {
      return { id: auth.currentUser?.uid || 'admin', name: 'admin' };
    }
  };

  const logQuizAudit = async ({ action, entity, entityId, subjectId = '', partId = '', details = '' }) => {
    try {
      const operator = getQuizOperator();
      await addDoc(collection(db, 'quiz_audit_logs'), {
        action,
        entity,
        entityId: String(entityId || ''),
        subjectId,
        partId,
        details,
        operatorId: operator.id,
        operatorName: operator.name,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.warn('Quiz audit log failed:', error);
    }
  };

  // ── Per-option undo history (Ctrl+Z) ──
  const optionHistories = useRef({}); // { idx: ['val0','val1',...] }
  const pushOptionHistory = (idx, value) => {
    if (!optionHistories.current[idx]) optionHistories.current[idx] = [];
    const hist = optionHistories.current[idx];
    if (hist[hist.length - 1] !== value) {
      hist.push(value);
      if (hist.length > 80) hist.shift();
    }
  };
  const undoOptionChange = (idx, field) => {
    const hist = optionHistories.current[idx] || [];
    if (hist.length > 1) {
      hist.pop();
      updateQuestionOption(idx, field, hist[hist.length - 1]);
    } else if (hist.length === 1) {
      hist.pop();
      updateQuestionOption(idx, field, '');
    }
  };

  // ── Listen to Firebase Auth state changes ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthed(true);
      } else {
        setIsAuthed(false);
        setLoggedIn(false);
      }
    });
    return () => unsub();
  }, []);

  // ── Load general data on login ──
  useEffect(() => {
    if (!loggedIn) return;

    // Page views (latest 10000 for highly accurate statistics)
    const pv = query(collection(db, 'page_views'), orderBy('timestamp', 'desc'), limit(10000));
    getDocs(pv).then(s => {
      setPageViews(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(console.error);

    // Suggestions (realtime)
    const unsubSug = onSnapshot(
      query(collection(db, 'suggestions'), orderBy('timestamp', 'desc'), limit(100)),
      s => setSuggestions(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('suggestions read error:', err.code)
    );

    // Testimonials (realtime)
    const unsubTest = onSnapshot(
      query(collection(db, 'testimonials'), orderBy('createdAt', 'desc'), limit(100)),
      s => setTestimonials(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('testimonials read error:', err.code)
    );

    return () => { unsubSug(); unsubTest(); };
  }, [loggedIn]);

  // ── Load quiz management audit history ──
  useEffect(() => {
    if (!loggedIn) return;
    const auditQuery = query(collection(db, 'quiz_audit_logs'), orderBy('createdAt', 'desc'), limit(250));
    const unsubscribe = onSnapshot(auditQuery, (snapshot) => {
      setQuizAuditLogs(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, error => {
      console.error('quiz_audit_logs read error:', error);
      setQuizAuditLogs([]);
    });
    return () => unsubscribe();
  }, [loggedIn]);

  // ── Load question reports on auth ──
  useEffect(() => {
    if (!loggedIn) return;

    setLoading(true);

    const unsubRep = onSnapshot(
      query(collection(db, 'question_reports'), orderBy('createdAt', 'desc'), limit(100)),
      s => {
        const data = s.docs.map(d => ({ id: d.id, ...d.data() }));
        setReports(data);
        setLoading(false);
      },
      err => {
        console.error('question_reports read error:', err.code, err.message);
        toast.error(isAr ? `خطأ في تحميل البلاغات: ${err.code}` : `Reports load error: ${err.code}`);
        setLoading(false);
      }
    );

    return () => unsubRep();
  }, [loggedIn]);

  // ── Load quiz subjects and parts for management ──
  useEffect(() => {
    if (!loggedIn) return;

    const getLocalSubs = () => {
      try {
        const raw = localStorage.getItem('koon_local_quiz_subjects');
        return raw ? Object.values(JSON.parse(raw)) : [];
      } catch (e) { return []; }
    };

    const getLocalParts = () => {
      try {
        const raw = localStorage.getItem('koon_local_quiz_parts');
        return raw ? Object.values(JSON.parse(raw)) : [];
      } catch (e) { return []; }
    };

    const unsubSubjects = onSnapshot(collection(db, 'quiz_subjects'), (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      const localSubs = getLocalSubs();
      localSubs.forEach(lSub => {
        if (!list.some(s => s.id === lSub.id)) list.push(lSub);
      });
      quizExportData.subjects.forEach(exportedSubject => {
        if (!list.some(s => s.id === exportedSubject.id)) list.push(exportedSubject);
      });
      setQManageSubjects(list);
    }, err => {
      console.warn('Subjects read error:', err);
      setQManageSubjects(getLocalSubs());
    });

    const unsubParts = onSnapshot(collection(db, 'quiz_parts'), (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      const localParts = getLocalParts();
      localParts.forEach(lPart => {
        if (!list.some(p => p.id === lPart.id)) list.push(lPart);
      });
      quizExportData.parts.forEach(exportedPart => {
        if (!list.some(p => p.id === exportedPart.id)) list.push(exportedPart);
      });
      setQManageParts(list);
    }, err => {
      console.warn('Parts read error:', err);
      setQManageParts(getLocalParts());
    });

    return () => {
      unsubSubjects();
      unsubParts();
    };
  }, [loggedIn, quizExportData]);

  // ── Load transferred koon.quiz data once as a Firestore fallback ──
  useEffect(() => {
    if (!loggedIn) return;
    Promise.all([
      fetch('/data/firestore/quiz_subjects.json').then(response => response.ok ? response.json() : []),
      fetch('/data/firestore/quiz_parts.json').then(response => response.ok ? response.json() : []),
      fetch('/data/firestore/quiz_questions.json').then(response => response.ok ? response.json() : [])
    ]).then(([subjects, parts, questions]) => {
      setQuizExportData({ subjects, parts, questions });
    }).catch(error => console.warn('Quiz export fallback unavailable:', error));
  }, [loggedIn]);

  // ── Load questions for selected part (also load sub-parts if group) ──
  useEffect(() => {
    setSelectedSubPartId(''); // reset sub-part selection when part changes
    if (!selectedPartId || !loggedIn) {
      setQManageQuestions([]);
      return;
    }
    // Listen for Firestore questions (for this part AND any sub-parts)
    const q = query(collection(db, 'quiz_questions'), where('partId', '==', selectedPartId));
    const unsubQuestions = onSnapshot(q, async (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      quizExportData.questions
        .filter(exportedQuestion => exportedQuestion.partId === selectedPartId)
        .forEach(exportedQuestion => {
          if (!list.some(question => question.id === exportedQuestion.id)) list.push(exportedQuestion);
        });

      // Also load question_edits deleted markers for this part
      try {
        const editsSnap = await getDocs(query(collection(db, 'question_edits'), where('partId', '==', selectedPartId)));
        const deletedIds = new Set();
        editsSnap.forEach(d => { if (d.data().deleted) deletedIds.add(String(d.data().questionId)); });
        // Add deleted markers so allQuestions can filter them out
        deletedIds.forEach(qid => {
          if (!list.some(q => String(q.id) === qid)) {
            list.push({ id: qid, partId: selectedPartId, deleted: true });
          } else {
            const idx = list.findIndex(q => String(q.id) === qid);
            list[idx] = { ...list[idx], deleted: true };
          }
        });
      } catch (e) { /* ignore edits load error */ }

      setQManageQuestions(list);
    }, err => console.error('Questions read error:', err));

    return () => unsubQuestions();
  }, [selectedPartId, loggedIn, quizExportData.questions]);

  // ── Load questions for selected sub-part ──
  useEffect(() => {
    if (!selectedSubPartId || !loggedIn) return;
    const q = query(collection(db, 'quiz_questions'), where('partId', '==', selectedSubPartId));
    const unsubSubQ = onSnapshot(q, async (snap) => {
      const list = [];
      snap.forEach(d => list.push(d.data()));
      quizExportData.questions
        .filter(exportedQuestion => exportedQuestion.partId === selectedSubPartId)
        .forEach(exportedQuestion => {
          if (!list.some(question => question.id === exportedQuestion.id)) list.push(exportedQuestion);
        });
      try {
        const editsSnap = await getDocs(query(collection(db, 'question_edits'), where('partId', '==', selectedSubPartId)));
        const deletedIds = new Set();
        editsSnap.forEach(d => { if (d.data().deleted) deletedIds.add(String(d.data().questionId)); });
        deletedIds.forEach(qid => {
          if (!list.some(q => String(q.id) === qid)) {
            list.push({ id: qid, partId: selectedSubPartId, deleted: true });
          } else {
            const idx = list.findIndex(q => String(q.id) === qid);
            list[idx] = { ...list[idx], deleted: true };
          }
        });
      } catch (e) { /* ignore */ }
      setQManageQuestions(list);
    }, err => console.error('Sub-questions read error:', err));
    return () => unsubSubQ();
  }, [selectedSubPartId, loggedIn, quizExportData.questions]);

  useEffect(() => {
    if (!loggedIn) return;
    setContributionsLoading(true);
    const unsubContributions = subscribeToContributions((data) => {
      setContributions(data);
      setContributionsLoading(false);
    });
    return () => unsubContributions();
  }, [loggedIn]);

  // ── KPI calculations ──
  const totalVisits = pageViews.filter(v => v.type === 'visit').length;
  const materialViews = pageViews.filter(v => v.type === 'material_view').length;
  const quizCompletions = pageViews.filter(v => v.type === 'quiz_completed').length;

  // ── Path frequency for charts ──
  const pathCounts = {};
  pageViews.filter(v => v.type === 'visit').forEach(v => {
    pathCounts[v.path] = (pathCounts[v.path] || 0) + 1;
  });
  const sortedPaths = Object.entries(pathCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxPathCount = sortedPaths[0]?.[1] || 1;

  // ── Popular courses ──
  const courseCounts = {};
  pageViews.filter(v => v.type === 'material_view' && v.courseName).forEach(v => {
    courseCounts[v.courseName] = (courseCounts[v.courseName] || 0) + 1;
  });
  const sortedCourses = Object.entries(courseCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCourseCount = sortedCourses[0]?.[1] || 1;

  // ── Actions ──
  const resolveSuggestion = async (id) => {
    try {
      await updateDoc(doc(db, 'suggestions', id), { status: 'resolved', read: true });
      toast.success(isAr ? 'تم حل الشكوى' : 'Marked as resolved');
    } catch { toast.error(isAr ? 'خطأ في التحديث' : 'Update failed'); }
  };

  const deleteSuggestion = async (id) => {
    if (!window.confirm(isAr ? 'هل تريد حذف هذه الرسالة؟' : 'Delete this message?')) return;
    try {
      const suggestion = suggestions.find(item => item.id === id);
      await archiveItem({ originalCollection: 'suggestions', originalId: id, itemData: suggestion || { id }, reason: 'suggestion-deletion' });
      toast.success(isAr ? 'تم نقل الرسالة إلى المحذوفات' : 'Message moved to deleted items');
    } catch { toast.error(isAr ? 'خطأ في الأرشفة' : 'Archive error'); }
  };

  const toggleTestimonialApproval = async (id, current) => {
    try {
      await updateDoc(doc(db, 'testimonials', id), { approved: !current });
      toast.success(isAr ? (current ? 'تم إلغاء الظهور' : 'تمت الموافقة') : (current ? 'Hidden' : 'Approved'));
    } catch { toast.error(isAr ? 'خطأ في التحديث' : 'Update failed'); }
  };

  const resolveReport = async (id) => {
    try {
      await updateDoc(doc(db, 'question_reports', id), { status: 'resolved' });
      toast.success(isAr ? 'تم وضع علامة محلول' : 'Marked resolved');
    } catch (err) {
      console.error('Error resolving report:', err);
      toast.error((isAr ? 'تعذر الحفظ: ' : 'Error: ') + (err.message || err));
    }
  };

  const deleteReport = async (id) => {
    if (!window.confirm(isAr ? 'حذف هذا البلاغ؟' : 'Delete this report?')) return;
    try {
      const report = reports.find(item => item.id === id);
      await archiveItem({ originalCollection: 'question_reports', originalId: id, itemData: report || { id }, reason: 'question-report-deletion' });
      toast.success(isAr ? 'تم نقل البلاغ إلى المحذوفات' : 'Report moved to deleted items');
    } catch (err) {
      console.error('Error deleting report:', err);
      toast.error((isAr ? 'تعذر الحذف: ' : 'Error: ') + (err.message || err));
    }
  };

  // ── Question edit modal helpers ──
  const openEditModal = (r) => {
    setEditingReport(r);
    setEditForm({
      questionAr: r.questionAr || '',
      questionEn: r.questionEn || '',
      options: r.options ? r.options.map(o => ({ ...o })) : [],
      correctAnswer: r.correctAnswer || '',
      image: r.image || '',
    });
  };
  const closeEditModal = () => setEditingReport(null);

  const updateOption = (idx, field, val) =>
    setEditForm(prev => ({
      ...prev,
      options: prev.options.map((o, i) => i === idx ? { ...o, [field]: val } : o),
    }));

  const deleteOption = (idx) =>
    setEditForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== idx),
      // If deleted option was correct answer, clear correctAnswer
      correctAnswer: prev.correctAnswer === (prev.options[idx]?.id) ? '' : prev.correctAnswer,
    }));

  const addOption = () => {
    const newId = `opt_${Date.now()}`;
    setEditForm(prev => ({
      ...prev,
      options: [
        ...prev.options,
        { id: newId, textAr: '', textEn: '' }
      ],
    }));
  };

  const saveQuestionEdit = async () => {
    if (!editingReport) return;
    setEditSaving(true);
    try {
      const editKey = `${editingReport.quizId}_${editingReport.questionId}`;
      const payload = {
        quizId: editingReport.quizId,
        questionId: editingReport.questionId,
        partId: editingReport.partId || editingReport.quizId || '',
        questionAr: editForm.questionAr,
        questionEn: editForm.questionEn,
        options: editForm.options,
        correctAnswer: editForm.correctAnswer,
        updatedAt: serverTimestamp(),
      };
      if (editForm.image) payload.image = editForm.image;
      else payload.image = null;

      await setDoc(doc(db, 'question_edits', editKey), payload);
      await updateDoc(doc(db, 'question_reports', editingReport.id), {
        status: 'resolved',
        questionAr: editForm.questionAr,
        questionEn: editForm.questionEn,
        options: editForm.options,
        correctAnswer: editForm.correctAnswer,
        ...(editForm.image ? { image: editForm.image } : { image: null }),
      });
      await logQuizAudit({
        action: 'update',
        entity: 'question',
        entityId: editingReport.questionId,
        partId: editingReport.partId || editingReport.quizId || '',
        details: isAr ? 'تعديل سؤال من البلاغات' : 'Question updated from report'
      });
      toast.success(isAr ? ' تم حفظ تعديل السؤال' : ' Question edit saved');
      closeEditModal();
    } catch (e) {
      console.error(e);
      toast.error(isAr ? 'خطأ في الحفظ' : 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Quiz Management Helpers & Memos ──
  const allSubjects = useMemo(() => {
    // Start with static base categories
    const map = new Map();
    quizCategories.forEach(cat => map.set(cat.id, { ...cat }));

    // Apply Firestore subjects — update existing OR add new ones
    qManageSubjects.forEach(sub => {
      if (map.has(sub.id)) {
        // Merge Firestore data over static data (so edits like nameAr, icon etc. apply)
        map.set(sub.id, { ...map.get(sub.id), ...sub, isDynamic: true });
      } else {
        map.set(sub.id, { ...sub, isDynamic: true });
      }
    });

    // Also merge localStorage subjects (offline fallback)
    try {
      const raw = localStorage.getItem('koon_local_quiz_subjects');
      if (raw) {
        Object.values(JSON.parse(raw)).forEach(lSub => {
          if (map.has(lSub.id)) {
            map.set(lSub.id, { ...map.get(lSub.id), ...lSub, isDynamic: true });
          } else {
            map.set(lSub.id, { ...lSub, isDynamic: true });
          }
        });
      }
    } catch (e) { }

    return Array.from(map.values()).filter(sub => !sub.deleted && !sub.hidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qManageSubjects, subjectRefreshKey]);

  const activeSubject = allSubjects.find(s => s.id === selectedSubjectId);

  const allParts = useMemo(() => {
    if (!selectedSubjectId) return [];
    const staticParts = activeSubject?.parts || [];
    const map = new Map();
    staticParts.forEach(p => map.set(p.id, { ...p }));

    qManageParts.forEach(dp => {
      if (map.has(dp.id)) {
        map.set(dp.id, { ...map.get(dp.id), ...dp, isDynamic: true });
      } else if (dp.subjectId === selectedSubjectId) {
        map.set(dp.id, { ...dp, isDynamic: true });
      }
    });

    return Array.from(map.values()).filter(p => !p.hidden && !p.deleted);
  }, [selectedSubjectId, activeSubject, qManageParts]);

  // Determine if selected part is a group (has sub-parts in quizData or Firestore)
  const selectedPartData = selectedPartId
    ? (staticBaseQuizData[selectedPartId] || staticExtraQuizData[selectedPartId] || null)
    : null;
  const staticSubParts = selectedPartData?.parts || []; // sub-parts defined in quizData.js
  const dbPartObj = qManageParts.find(p => p.id === selectedPartId);
  const dbSubParts = (dbPartObj?.isGroup && dbPartObj?.subParts) ? dbPartObj.subParts : [];

  const subPartsMap = new Map();
  staticSubParts.forEach(sp => subPartsMap.set(sp.id, { ...sp }));
  dbSubParts.forEach(sp => {
    if (subPartsMap.has(sp.id)) {
      subPartsMap.set(sp.id, { ...subPartsMap.get(sp.id), ...sp });
    } else {
      subPartsMap.set(sp.id, sp);
    }
  });
  const allSubPartsList = Array.from(subPartsMap.values()).filter(sp => !sp.hidden && !sp.deleted);
  const isGroupPart = allSubPartsList.length > 0 || (dbPartObj?.isGroup);

  // The effective part ID for questions (either the selected sub-part, or the part itself)
  const effectivePartId = isGroupPart ? (selectedSubPartId || '') : selectedPartId;

  const allQuestions = useMemo(() => {
    if (!effectivePartId) return [];
    const staticQuizObj = staticBaseQuizData[effectivePartId] || staticExtraQuizData[effectivePartId] || {};
    const staticQs = (staticQuizObj.questions || []).map(q => ({ ...q, isStatic: true }));
    const list = [...staticQs];

    qManageQuestions.forEach(dbQ => {
      const idx = list.findIndex(q => String(q.id) === String(dbQ.id));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...dbQ, isDynamic: true };
      } else {
        list.push({ ...dbQ, isDynamic: true });
      }
    });
    // Filter out questions marked as deleted
    return list.filter(q => !q.deleted);
  }, [effectivePartId, qManageQuestions]);

  const saveSubject = async () => {
    if (!subjectForm.id || !subjectForm.name || !subjectForm.nameAr) {
      toast.error(isAr ? 'يرجى ملء جميع الحقول الإلزاميةة' : 'Please fill all required fields');
      return;
    }

    const isEditing = editingSubjectOriginalId !== null;
    // When editing, always keep the original ID to avoid creating a duplicate
    const subId = isEditing
      ? editingSubjectOriginalId
      : subjectForm.id.toLowerCase().trim().replace(/\s+/g, '_');

    const payload = {
      id: subId,
      name: subjectForm.name.trim(),
      nameAr: subjectForm.nameAr.trim(),
      icon: subjectForm.icon || '📘',
      color: subjectForm.color || '#6366F1',
      languageMode: subjectForm.languageMode || 'both',
      isNew: true,
      createdAt: new Date().toISOString()
    };

    // Local cache save as fallback
    try {
      const localSubjects = JSON.parse(localStorage.getItem('koon_local_quiz_subjects') || '{}');
      localSubjects[subId] = payload;
      localStorage.setItem('koon_local_quiz_subjects', JSON.stringify(localSubjects));
    } catch (e) { }

    // Update state & selection immediately, then force memo refresh
    setQManageSubjects(prev => {
      const exists = prev.some(s => s.id === subId);
      if (exists) return prev.map(s => s.id === subId ? payload : s);
      return [...prev, payload];
    });
    setSubjectRefreshKey(k => k + 1);
    setSelectedSubjectId(subId);

    setShowAddSubjectModal(false);
    setEditingSubjectOriginalId(null);
    setSubjectForm({ id: '', name: '', nameAr: '', icon: '', color: '#6366F1', languageMode: 'both' });

    // Cloud Save to Firestore (awaited)
    try {
      await setDoc(doc(db, 'quiz_subjects', subId), payload);
      await logQuizAudit({
        action: isEditing ? 'update' : 'create',
        entity: 'subject',
        entityId: subId,
        subjectId: subId,
        details: isAr ? (isEditing ? 'تعديل مادة' : 'إضافة مادة') : (isEditing ? 'Subject updated' : 'Subject created')
      });
      toast.success(isEditing
        ? (isAr ? ' تم تحديث المادة بنجاح!' : ' Subject updated successfully!')
        : (isAr ? ' تم حفظ المادة ونشرها في السحاب بنجاح!' : ' Subject saved and published to cloud successfully!'));
    } catch (cloudErr) {
      console.error('Cloud save failed for quiz_subjects:', cloudErr);
      toast.error(isAr ? `تنبيه: تم الحفظ محلياً فقط! لم تحفظ بالسحاب بسبب: ${cloudErr?.message || cloudErr}` : `Warning: Saved locally only! Cloud sync failed: ${cloudErr?.message || cloudErr}`);
    }
  };

  const deleteSubject = async (subId) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذه المادة؟ سيتم حذف كافة الأجزاء والأسئلة التابعة لها!' : 'Are you sure? This will delete all parts and questions in this subject!')) return;

    setQManageSubjects(prev => [...prev.filter(s => s.id !== subId), { id: subId, deleted: true, hidden: true }]);
    if (selectedSubjectId === subId) {
      setSelectedSubjectId('');
      setSelectedPartId('');
      setSelectedSubPartId('');
      setQManageQuestions([]);
    }

    try {
      const localSubjects = JSON.parse(localStorage.getItem('koon_local_quiz_subjects') || '{}');
      delete localSubjects[subId];
      localStorage.setItem('koon_local_quiz_subjects', JSON.stringify(localSubjects));
    } catch (e) { }

    toast.success(isAr ? 'تم حذف المادة بنجاح' : 'Subject deleted successfully');

    try {
      // Soft-hide static subject or hard-delete dynamic subject in Firestore
      await setDoc(doc(db, 'quiz_subjects', subId), { id: subId, deleted: true, hidden: true }, { merge: true });
      const partsSnap = await getDocs(query(collection(db, 'quiz_parts'), where('subjectId', '==', subId)));
      const promises = [];
      partsSnap.forEach(d => promises.push(deleteDoc(d.ref)));
      const qSnap = await getDocs(query(collection(db, 'quiz_questions'), where('subjectId', '==', subId)));
      qSnap.forEach(d => promises.push(deleteDoc(d.ref)));
      await Promise.all(promises);
      await logQuizAudit({
        action: 'delete',
        entity: 'subject',
        entityId: subId,
        subjectId: subId,
        details: isAr ? 'حذف مادة وكافة الاختبارات والأسئلة التابعة' : 'Subject and related quizzes/questions deleted'
      });
    } catch (e) {
      console.warn('Cloud delete subject warning:', e);
    }
  };

  const savePart = async () => {
    if (!selectedSubjectId) {
      toast.error(isAr ? ' يرجى اختيار المادة أولاً' : ' Please select a subject first');
      return;
    }
    if (!partForm.id || !partForm.title || !partForm.titleAr) {
      toast.error(isAr ? ' يرجى ملء جميع الحقول الإلزامية' : ' Please fill all required fields');
      return;
    }
    const partId = partForm.id.toLowerCase().trim().replace(/\s+/g, '_');
    const payload = {
      id: partId,
      subjectId: selectedSubjectId,
      title: partForm.title.trim(),
      titleAr: partForm.titleAr.trim(),
      isGroup: partForm.isGroup || false,
      subParts: partForm.isGroup ? (partForm.subParts || []) : null,
      durationMinutes: partForm.durationMinutes ? Number(partForm.durationMinutes) : null,
      passMark: partForm.passMark !== '' ? Number(partForm.passMark) : null,
      createdAt: new Date().toISOString()
    };

    // Save to localStorage
    try {
      const localParts = JSON.parse(localStorage.getItem('koon_local_quiz_parts') || '{}');
      localParts[partId] = payload;
      localStorage.setItem('koon_local_quiz_parts', JSON.stringify(localParts));
    } catch (e) { }

    // Update state immediately
    setQManageParts(prev => {
      const exists = prev.some(p => p.id === partId);
      if (exists) return prev.map(p => p.id === partId ? payload : p);
      return [...prev, payload];
    });
    setSelectedPartId(partId);

    setShowAddPartModal(false);
    setPartForm({ id: '', title: '', titleAr: '', isGroup: false, durationMinutes: 30, passMark: '' });

    // Cloud save to Firestore (awaited)
    try {
      await setDoc(doc(db, 'quiz_parts', partId), payload);
      await logQuizAudit({
        action: qManageParts.some(part => part.id === partId) ? 'update' : 'create',
        entity: 'quiz',
        entityId: partId,
        subjectId: selectedSubjectId,
        partId,
        details: isAr ? 'حفظ اختبار' : 'Quiz saved'
      });
      toast.success(isAr ? 'تم حفظ الجزء ونشره في السحاب بنجاح!' : 'Quiz part saved and published to cloud successfully!');
    } catch (cloudErr) {
      console.error('Cloud save failed for quiz_parts:', cloudErr);
      toast.error(isAr ? `تنبيه: تم الحفظ محلياً فقط! لم يحفظ بالسحاب: ${cloudErr?.message || cloudErr}` : `Warning: Saved locally only! Cloud sync failed: ${cloudErr?.message || cloudErr}`);
    }
  };

  const deletePart = async (partId) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا الجزء؟ سيتم حذف جميع الأسئلة التابعة له!' : 'Are you sure? This will delete all questions in this part!')) return;

    const partSubjectId = selectedSubjectId || (activeSubject ? activeSubject.id : '');

    // Remove / mark hidden in state immediately so UI updates instantly
    setQManageParts(prev => [...prev.filter(p => p.id !== partId), { id: partId, subjectId: partSubjectId, hidden: true, deleted: true }]);
    if (selectedPartId === partId) {
      setSelectedPartId('');
      setSelectedSubPartId('');
      setQManageQuestions([]);
    }

    // Remove from localStorage
    try {
      const localParts = JSON.parse(localStorage.getItem('koon_local_quiz_parts') || '{}');
      delete localParts[partId];
      localStorage.setItem('koon_local_quiz_parts', JSON.stringify(localParts));
    } catch (e) { }

    toast.success(isAr ? ' تم حذف الجزء وكافة أسئلته' : ' Part and questions deleted');

    // Cloud delete / soft-hide in background
    try {
      await setDoc(doc(db, 'quiz_parts', partId), { hidden: true, deleted: true, id: partId, subjectId: partSubjectId }, { merge: true });
      const qSnap = await getDocs(query(collection(db, 'quiz_questions'), where('partId', '==', partId)));
      const promises = [];
      qSnap.forEach(d => promises.push(deleteDoc(d.ref)));
      await Promise.all(promises);
      await logQuizAudit({
        action: 'delete',
        entity: 'quiz',
        entityId: partId,
        subjectId: partSubjectId,
        partId,
        details: isAr ? 'حذف اختبار وكافة أسئلته' : 'Quiz and its questions deleted'
      });
    } catch (e) {
      console.warn('Cloud delete part warning:', e);
    }
  };

  // Helper to translate text using MyMemory Translation API
  const translateText = async (text, direction) => {
    if (!text || !text.trim()) return '';
    const langpair = direction === 'ar2en' ? 'ar|en' : 'en|ar';
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data.responseData?.translatedText) {
        // MyMemory can return HTML character references sometimes
        const parser = new DOMParser();
        const dom = parser.parseFromString(data.responseData.translatedText, 'text/html');
        return dom.body.textContent;
      }
      return '';
    } catch (err) {
      console.error('Translation failed:', err);
      return '';
    }
  };

  const handleQuestionTypeChange = (newType) => {
    setQuestionForm(prev => {
      let options = [...prev.options];
      let correctAnswer = prev.correctAnswer;
      let subQuestions = prev.subQuestions || [];
      if (newType === 'true_false') {
        options = [
          { id: 'a', textAr: 'صح', textEn: 'True' },
          { id: 'b', textAr: 'خطأ', textEn: 'False' }
        ];
        if (correctAnswer !== 'a' && correctAnswer !== 'b') correctAnswer = 'a';
        subQuestions = [];
      } else if (newType === 'matching') {
        // Keep existing options as the answer pool, add initial subQuestions if empty
        if (!subQuestions.length) {
          subQuestions = [
            { id: 'sq1', textAr: '', textEn: '', correctAnswer: '' },
            { id: 'sq2', textAr: '', textEn: '', correctAnswer: '' },
          ];
        }
        if (!options.length || (prev.type === 'true_false')) {
          options = [
            { id: 'a', textAr: '', textEn: '' },
            { id: 'b', textAr: '', textEn: '' },
            { id: 'c', textAr: '', textEn: '' },
          ];
        }
        correctAnswer = '';
      } else if (newType === 'multi_select') {
        // Multi-select: keep or init options, clear correctAnswer (will be comma-separated)
        if (prev.type === 'true_false' || prev.type === 'matching' || !options.length) {
          options = [
            { id: 'a', textAr: '', textEn: '' },
            { id: 'b', textAr: '', textEn: '' },
            { id: 'c', textAr: '', textEn: '' },
            { id: 'd', textAr: '', textEn: '' }
          ];
        }
        correctAnswer = '';
        subQuestions = [];
      } else if (prev.type === 'true_false' || prev.type === 'matching' || prev.type === 'multi_select') {
        // Switching back to MCQ/short_answer/text
        options = [
          { id: 'a', textAr: '', textEn: '' },
          { id: 'b', textAr: '', textEn: '' },
          { id: 'c', textAr: '', textEn: '' },
          { id: 'd', textAr: '', textEn: '' }
        ];
        correctAnswer = 'a';
        subQuestions = [];
      }
      return { ...prev, type: newType, options, correctAnswer, subQuestions };
    });
  };

  const openQuestionModal = (q = null) => {
    if (q) {
      setEditingQuestion(q);
      setQuestionForm({
        id: q.id || '',
        type: q.type || 'mcq',
        questionAr: q.questionAr || '',
        questionEn: q.questionEn || '',
        options: q.options ? q.options.map(o => ({ ...o })) : [],
        subQuestions: q.subQuestions ? q.subQuestions.map(s => ({ ...s })) : [],
        correctAnswer: q.correctAnswer || '',
        marks: q.marks || 1.0,
        image: q.image || '',
        image2: q.image2 || '',
        codeBlock: q.codeBlock || '',
      });
    } else {
      setEditingQuestion(null);
      const baseTs = Date.now();
      const initialOptions = [
        { id: `opt_${baseTs}_1`, textAr: '', textEn: '' },
        { id: `opt_${baseTs}_2`, textAr: '', textEn: '' },
        { id: `opt_${baseTs}_3`, textAr: '', textEn: '' },
        { id: `opt_${baseTs}_4`, textAr: '', textEn: '' }
      ];
      setQuestionForm({
        id: '',
        type: 'mcq',
        questionAr: '',
        questionEn: '',
        options: initialOptions,
        subQuestions: [],
        correctAnswer: initialOptions[0].id,
        marks: lastMarksRef.current,
        image: '',
        image2: '',
        codeBlock: '',
      });
    }
    setShowQuestionModal(true);
  };

  const updateQuestionOption = (idx, field, val) => {
    // Debug log to verify input changes reach this handler
    try {
      // eslint-disable-next-line no-console
      console.debug('updateQuestionOption ->', { idx, field, val });
    } catch (e) { }
    setQuestionForm(prev => ({
      ...prev,
      options: prev.options.map((o, i) => i === idx ? { ...o, [field]: val } : o)
    }));
  };

  const deleteQuestionOption = (idx) => {
    setQuestionForm(prev => {
      const options = prev.options.filter((_, i) => i !== idx);
      const deletedOptId = prev.options[idx]?.id;
      const correctAnswer = prev.correctAnswer === deletedOptId ? '' : prev.correctAnswer;
      return { ...prev, options, correctAnswer };
    });
  };

  const addQuestionOption = () => {
    const newId = `opt_${Date.now()}`;
    setQuestionForm(prev => ({
      ...prev,
      options: [...prev.options, { id: newId, textAr: '', textEn: '', image: '' }]
    }));
  };

  // Ref map for option textEn inputs so we can read selectionStart/End
  const optionInputRefs = useRef({});

  const insertFormatIntoOption = (idx, field, tagType, extra) => {
    const el = optionInputRefs.current[`${idx}-${field}`];
    const currentVal = questionForm.options[idx]?.[field] || '';

    // For table, no selection needed — just append
    if (tagType === 'table') {
      const relName = prompt(isAr ? 'أدخل اسم الجدول / العلاقة (مثال: B):' : 'Enter relation name (e.g. B):');
      if (relName === null) return;
      const attrsInput = prompt(isAr ? 'أدخل الحقول مفصولة بفاصلة. ضع نجمة (*) قبل الحقل لتسطيره كمفتاح أساسي (مثال: *s1, b1, x, y):' : 'Enter attributes separated by commas. Put an asterisk (*) before an attribute to underline it (e.g., *s1, b1, x, y):');
      if (attrsInput === null) return;
      const cells = attrsInput.split(',').map(attr => {
        const trimmed = attr.trim();
        return trimmed.startsWith('*')
          ? `<td><u>${trimmed.substring(1)}</u></td>`
          : `<td>${trimmed}</td>`;
      });
      const tableTag = `<table class="relation-table"><tr><td>${relName || 'Relation'}</td>${cells.join('')}</tr></table>`;
      pushOptionHistory(idx, currentVal);
      updateQuestionOption(idx, field, currentVal + tableTag);
      return;
    }

    // Read selection from the real DOM input element
    const start = el ? el.selectionStart : currentVal.length;
    const end = el ? el.selectionEnd : currentVal.length;
    const selected = currentVal.substring(start, end);
    const placeholder = tagType === 'code' ? 'code' : 'نص';
    const text = selected || placeholder;

    let wrapped = '';
    if (tagType === 'bold') wrapped = `<strong>${text}</strong>`;
    else if (tagType === 'italic') wrapped = `<em>${text}</em>`;
    else if (tagType === 'underline') wrapped = `<u>${text}</u>`;
    else if (tagType === 'code') wrapped = `<code>${text}</code>`;
    else if (tagType === 'color') wrapped = `<span style="color:${extra};">${text}</span>`;
    else if (tagType === 'highlight') wrapped = `<mark style="background:${extra};color:#000;">${text}</mark>`;
    else return;

    const newVal = currentVal.substring(0, start) + wrapped + currentVal.substring(end);
    pushOptionHistory(idx, currentVal);
    updateQuestionOption(idx, field, newVal);

    // Restore caret after React re-render
    setTimeout(() => {
      if (!el) return;
      el.focus();
      const newCaret = start + wrapped.length;
      el.selectionStart = newCaret;
      el.selectionEnd = newCaret;
    }, 0);
  };

  // ── Format selected text in question textarea (bold, italic, color, etc.) ──
  const questionArRef = React.useRef(null);
  const questionEnRef = React.useRef(null);

  const insertFormatIntoQuestion = (field, tagType, extra) => {
    const ref = field === 'questionAr' ? questionArRef : questionEnRef;
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const currentVal = field === 'questionAr' ? questionForm.questionAr : questionForm.questionEn;
    const selected = currentVal.substring(start, end);

    let wrapped = '';
    if (tagType === 'bold') wrapped = `<strong>${selected || 'نص'}</strong>`;
    else if (tagType === 'italic') wrapped = `<em>${selected || 'نص'}</em>`;
    else if (tagType === 'underline') wrapped = `<u>${selected || 'نص'}</u>`;
    else if (tagType === 'color') wrapped = `<span style="color:${extra};">${selected || 'نص'}</span>`;
    else if (tagType === 'highlight') wrapped = `<mark style="background:${extra};color:#000;">${selected || 'نص'}</mark>`;
    else if (tagType === 'code') wrapped = `<code>${selected || 'code'}</code>`;

    const newVal = currentVal.substring(0, start) + wrapped + currentVal.substring(end);
    setQuestionForm(prev => ({ ...prev, [field]: newVal }));

    // restore caret after React re-render
    setTimeout(() => {
      el.focus();
      el.selectionStart = start + wrapped.length;
      el.selectionEnd = start + wrapped.length;
    }, 0);
  };

  const insertTextIntoQuestion = (field, text) => {
    const ref = field === 'questionAr' ? questionArRef : questionEnRef;
    const el = ref.current;
    if (!el) return;

    const start = el.selectionStart ?? (field === 'questionAr' ? questionForm.questionAr.length : questionForm.questionEn.length);
    const end = el.selectionEnd ?? start;
    const currentVal = field === 'questionAr' ? questionForm.questionAr : questionForm.questionEn;
    const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);

    setQuestionForm(prev => ({ ...prev, [field]: newVal }));

    setTimeout(() => {
      el.focus();
      const caret = start + text.length;
      el.selectionStart = caret;
      el.selectionEnd = caret;
    }, 0);
  };

  const handlePasteInTextarea = async (e, field) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    for (const item of clipboardItems) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        toast(isAr ? 'جاري رفع الصورة الملصق...' : 'Uploading pasted image...');
        try {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'zkqqznab');
          fd.append('folder', 'quiz_images');

          const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'yp11vyap'}/image/upload`, {
            method: 'POST',
            body: fd
          });
          const data = await res.json();

          if (data.secure_url) {
            setQuestionForm(prev => {
              if (!prev.image) {
                return { ...prev, image: data.secure_url };
              } else {
                return { ...prev, image2: data.secure_url };
              }
            });
            toast.success(isAr ? ' تم رفع ولصق الصورة بنجاح!' : ' Image uploaded and pasted!');
          } else {
            toast.error(isAr ? 'فشل رفع الصورة' : 'Image upload failed');
          }
        } catch (err) {
          console.error(err);
          toast.error(isAr ? 'حدث خطأ أثناء رفع الصورة' : 'Error uploading image');
        }
        break;
      }
    }
  };

  const renderCodeBlock = (code) => {
    if (!code) return null;
    const lines = code.trim().split('\n');
    return (
      <div className="code-ide-container" style={{
        backgroundColor: '#18181c',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        fontFamily: '"Fira Code", Consolas, Monaco, "Courier New", Courier, monospace',
        fontSize: '0.88rem',
        lineHeight: '1.5',
        color: '#e3e3e6',
        overflow: 'hidden',
        direction: 'ltr',
        textAlign: 'left',
        margin: '0.8rem 0',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        {/* Header bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 0.8rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.03)'
        }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
          </div>
          <span style={{ fontSize: '0.65rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IDE View</span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', overflowX: 'auto' }}>
          <div style={{
            padding: '0.8rem 0.5rem 0.8rem 0.8rem',
            backgroundColor: '#111113',
            color: '#55555d',
            textAlign: 'right',
            userSelect: 'none',
            borderRight: '1px solid rgba(255, 255, 255, 0.06)',
            minWidth: '2.2rem',
            flexShrink: 0
          }}>
            {lines.map((_, i) => (
              <div key={i} style={{ height: '1.4rem', fontSize: '0.8rem' }}>{i + 1}</div>
            ))}
          </div>
          <pre style={{
            margin: 0,
            padding: '0.8rem 0.8rem 0.8rem 0.6rem',
            flexGrow: 1,
            whiteSpace: 'pre',
            overflowX: 'visible',
            fontFamily: 'inherit',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none'
          }}>
            {lines.map((line, i) => (
              <div key={i} style={{ height: '1.4rem', color: '#e3e3e6' }}>
                {line || ' '}
              </div>
            ))}
          </pre>
        </div>
      </div>
    );
  };

  // Colors available in the question text color picker
  const QUESTION_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];
  const HIGHLIGHT_COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fca5a5', '#e9d5ff', '#fed7aa'];

  const handleOcrImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 10 ميجا بايت' : 'Image must be under 10MB');
      e.target.value = '';
      return;
    }
    setOcrScanning(true);
    setOcrProgress(5);
    try {
      const worker = await createWorker('eng+ara', 1, {
        logger: m => {
          if (m.status === 'recognizing text') setOcrProgress(Math.round(m.progress * 100));
        }
      });
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      setOcrProgress(100);
      const parsed = parseOcrText(text);
      if (!parsed) {
        toast.error(isAr ? 'لم يتم استخراج نص واضح من الصورة' : 'Could not extract clear text from the image');
        return;
      }
      const isArabic = /[\u0600-\u06FF]/.test(parsed.question);
      setQuestionForm(prev => ({
        ...prev,
        questionAr: isArabic ? parsed.question : prev.questionAr,
        questionEn: isArabic ? prev.questionEn : parsed.question,
        options: parsed.options.length ? parsed.options.map((opt, idx) => ({
          id: prev.options[idx]?.id || `opt_${Date.now()}_${idx}`,
          textAr: isArabic ? opt : '',
          textEn: isArabic ? '' : opt,
        })) : prev.options,
      }));
      toast.success(isAr ? ' تم استخراج السؤال بنجاح' : ' Question scanned successfully');
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'فشل مسح الصورة ضوئياً' : 'OCR scan failed');
    } finally {
      setOcrScanning(false);
      setOcrProgress(0);
      e.target.value = '';
    }
  };

  const parseOcrText = (raw) => {
    if (!raw) return null;
    const cleaned = raw.replace(/[\u2028\u2029]/g, '\n');
    const lines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const filtered = lines.filter(l => !/^(select one|choose|اتر|select|answer|إجابة)/i.test(l));
    if (filtered.length < 2) return null;
    const question = filtered[0];
    const optionLines = filtered.slice(1).map(l => l.replace(/^[a-d][\).\-\s]+/i, '').trim()).filter(Boolean);
    const options = optionLines.slice(0, 4);
    if (options.length === 0) return null;
    return { question, options };
  };

  const handleOptionImageChange = async (idx, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 5 ميجا بايت' : 'Image must be under 5MB');
      return;
    }
    try {
      const compressed = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const MAX = 600;
          let w = img.width, h = img.height;
          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = url;
      });
      updateQuestionOption(idx, 'image', compressed);
      toast.success(isAr ? ' تم تحميل صورة الخيار' : ' Option image loaded');
    } catch (err) {
      console.error(err);
      toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
    }
    e.target.value = '';
  };

  const handlePasteInOption = async (e, idx) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    for (const item of clipboardItems) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        if (file.size > 5 * 1024 * 1024) {
          toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 5 ميجا بايت' : 'Image must be under 5MB');
          return;
        }

        toast(isAr ? 'جاري معالجة ولصق صور الخيار...' : 'Processing and pasting option image...');
        try {
          const compressed = await new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
              URL.revokeObjectURL(url);
              const MAX = 600;
              let w = img.width, h = img.height;
              if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = reject;
            img.src = url;
          });
          updateQuestionOption(idx, 'image', compressed);
          toast.success(isAr ? ' تم لصق صور الخيار بنجاح!' : ' Option image pasted successfully!');
        } catch (err) {
          console.error(err);
          toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
        }
        break;
      }
    }
  };

  const saveQuestion = async () => {
    if (!selectedPartId) return;
    if (!questionForm.questionAr && !questionForm.questionEn) {
      toast.error(isAr ? 'يرجى إدخال نص السؤال (عربي أو إنجليزي)' : 'Please enter question text');
      return;
    }
    if (questionForm.type !== 'matching' && questionForm.options.length < 2) {
      toast.error(isAr ? 'يجب إدخال خيارين على الأقل' : 'Please add at least 2 options');
      return;
    }
    if (questionForm.type === 'matching') {
      if (questionForm.options.length < 2) {
        toast.error(isAr ? 'يجب إدخال خيارين على الأقل في قائمة الإجابات' : 'Please add at least 2 answer options');
        return;
      }
      if (questionForm.subQuestions.length < 1) {
        toast.error(isAr ? 'يجب إدخال جملة فرعية واحد على الأقل' : 'Please add at least 1 sub-question');
        return;
      }
    } else if (questionForm.type === 'multi_select') {
      const selectedCorrect = (questionForm.correctAnswer || '').split(',').filter(Boolean);
      if (selectedCorrect.length < 2) {
        toast.error(isAr ? 'يرجى تحديد إجابتين صحيحتين على الأقل' : 'Please select at least 2 correct answers');
        return;
      }
    } else if (!questionForm.correctAnswer && questionForm.type !== 'text') {
      toast.error(isAr ? 'يرجى اختيار الإجابة الصحيحة' : 'Please select the correct answer');
      return;
    }

    try {
      const qId = questionForm.id || `q_${Date.now()}`;
      const targetPartId = effectivePartId || selectedPartId;
      const docRef = doc(db, 'quiz_questions', `${targetPartId}_${qId}`);
      const docData = {
        id: qId,
        partId: targetPartId,
        subjectId: selectedSubjectId,
        type: questionForm.type,
        questionAr: questionForm.questionAr.trim(),
        questionEn: questionForm.questionEn.trim(),
        options: questionForm.options,
        marks: Number(questionForm.marks) || 1,
        image: questionForm.image || null,
        image2: questionForm.image2 || null,
        codeBlock: questionForm.codeBlock ? questionForm.codeBlock.trim() : null,
        createdAt: serverTimestamp()
      };
      if (questionForm.type === 'matching') {
        docData.subQuestions = questionForm.subQuestions;
        docData.correctAnswer = null;
      } else if (questionForm.type === 'multi_select') {
        // Store as array for easy lookup in Quiz.jsx
        docData.correctAnswers = (questionForm.correctAnswer || '').split(',').filter(Boolean);
        docData.correctAnswer = questionForm.correctAnswer; // keep string too for backwards compat
      } else {
        docData.correctAnswer = questionForm.correctAnswer;
      }
      await setDoc(docRef, docData);
      await logQuizAudit({
        action: questionForm.id ? 'update' : 'create',
        entity: 'question',
        entityId: qId,
        subjectId: selectedSubjectId,
        partId: targetPartId,
        details: isAr ? (questionForm.id ? 'تعديل سؤال' : 'إضافة سؤال') : (questionForm.id ? 'Question updated' : 'Question added')
      });
      toast.success(isAr ? ' تم حفظ السؤال بنجاح' : ' Question saved successfully');
      setShowQuestionModal(false);
      setEditingQuestion(null);
    } catch (e) {
      console.error(e);
      toast.error(isAr ? ` فشل حفظ السؤال: ${e.message || e}` : ` Failed to save question: ${e.message || e}`);
    }
  };

  const deleteQuestion = async (qId, isStatic = false) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا السؤال؟' : 'Are you sure you want to delete this question?')) return;
    const partIdForQuery = effectivePartId || selectedPartId;
    try {
      if (isStatic) {
        // Soft-delete static question via question_edits marker
        const editRef = doc(db, 'question_edits', `${partIdForQuery}_${qId}`);
        await setDoc(editRef, { deleted: true, partId: partIdForQuery, quizId: partIdForQuery, questionId: String(qId) }, { merge: true });
        // Also mark in qManageQuestions state so UI updates immediately
        setQManageQuestions(prev => {
          const exists = prev.some(q => String(q.id) === String(qId));
          if (exists) return prev.map(q => String(q.id) === String(qId) ? { ...q, deleted: true } : q);
          return [...prev, { id: qId, partId: partIdForQuery, deleted: true }];
        });
        await logQuizAudit({
          action: 'delete',
          entity: 'question',
          entityId: qId,
          subjectId: selectedSubjectId,
          partId: partIdForQuery,
          details: isAr ? 'حذف سؤال ثابت' : 'Static question deleted'
        });
        toast.success(isAr ? ' تم حذف السؤال' : ' Question deleted');
      } else {
        // Hard-delete dynamic question
        await deleteDoc(doc(db, 'quiz_questions', `${partIdForQuery}_${qId}`));
        await logQuizAudit({
          action: 'delete',
          entity: 'question',
          entityId: qId,
          subjectId: selectedSubjectId,
          partId: partIdForQuery,
          details: isAr ? 'حذف سؤال' : 'Question deleted'
        });
        toast.success(isAr ? ' تم حذف السؤال' : ' Question deleted');
      }
    } catch (e) {
      console.error(e);
      toast.error(isAr ? 'فشل حذف السؤال' : 'Failed to delete question');
    }
  };

  // ── Filtered suggestions ──
  const filteredSuggestions = suggestions.filter(s => {
    if (filterType !== 'all' && s.type !== filterType) return false;
    if (filterStatus !== 'all' && s.status !== filterStatus) return false;
    return true;
  });

  // ── Filtered activity ──
  const filteredActivity = pageViews.filter(v => {
    if (filterType === 'all') return true;
    return v.type === filterType;
  });

  const filteredQuizAuditLogs = quizAuditLogs.filter(log => {
    if (quizAuditPeriod === 'all') return true;
    const timestamp = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt || 0);
    if (Number.isNaN(timestamp.getTime())) return false;
    const now = new Date();
    const start = new Date(now);
    if (quizAuditPeriod === 'today') start.setHours(0, 0, 0, 0);
    if (quizAuditPeriod === 'week') {
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
    }
    if (quizAuditPeriod === 'month') {
      start.setHours(0, 0, 0, 0);
      start.setDate(1);
    }
    return timestamp >= start;
  });

  const formatQuizAuditDate = (timestamp) => {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp || 0);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(isAr ? 'ar-JO' : 'en-JO');
  };

  const quizAuditActionLabel = (action) => ({
    create: isAr ? 'إضافة' : 'Created',
    update: isAr ? 'تعديل' : 'Updated',
    delete: isAr ? 'حذف' : 'Deleted'
  }[action] || action);

  const quizAuditEntityLabel = (entity) => ({
    subject: isAr ? 'مادة' : 'Subject',
    quiz: isAr ? 'اختبار' : 'Quiz',
    question: isAr ? 'سؤال' : 'Question'
  }[entity] || entity);

  const generalAdminPages = [
    {
      id: 'system_settings',
      titleAr: 'إعدادات النظام',
      titleEn: 'System Settings',
      descAr: 'ضبط الإعدادات العامة للموقع والتطبيق.',
      descEn: 'Configure general site and app settings.',
    },
    {
      id: 'user_management',
      titleAr: 'إدارة المستخدمين',
      titleEn: 'User Management',
      descAr: 'عرض وتعديل صلاحيات الموظفين والمستدمين.',
      descEn: 'View and edit staff and user permissions.',
    },
    {
      id: 'content_management',
      titleAr: 'إدارة المحتوى',
      titleEn: 'Content Management',
      descAr: 'إدارة الصفحات الدالي والمحتوى العام.',
      descEn: 'Manage internal pages and general content.',
    },
    {
      id: 'student_contributions',
      titleAr: 'مساهمات الطلاب',
      titleEn: 'Student Contributions',
      descAr: 'عرض وإدار المساهمةات الوارد من قسم إثراء محتوى مكانك.',
      descEn: 'View and manage contributions submitted through the content enrichment section.',
    },
    {
      id: 'reports_archive',
      titleAr: 'التقارير والأرشيف',
      titleEn: 'Reports & Archive',
      descAr: 'مراجع سجل النظام والتقارير الهام.',
      descEn: 'Review system logs and important reports.',
    },
  ];

  const selectedGeneralPageData = generalAdminPages.find(p => p.id === selectedGeneralPage) || generalAdminPages[0];

  // ────────────────────────────────────────────────────────────────────
  // LOGIN SCREEN
  // ────────────────────────────────────────────────────────────────────
  if (!loggedIn) return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        <div className="admin-login-logo"></div>
        <h1 className="admin-login-title">{isAr ? 'لوحة التحكم' : 'Admin Dashboard'}</h1>
        <>
          <p className="admin-login-subtitle">{isAr ? 'أدخل اسم المستخدم وكود الوصول للمتابع' : 'Enter username and access code to continue'}</p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{isAr ? 'اسم المستخدم' : 'Username'}</label>
              <input
                type="text"
                className={`form-input${loginErr ? ' input-error-shake' : ''}`}
                value={adminUsername}
                onChange={e => { setAdminUsername(e.target.value); setLoginErr(''); }}
                placeholder={isAr ? 'أدخل اسم المستخدم' : 'Enter username'}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{isAr ? 'كود الوصول' : 'Access Code'}</label>
              <div className="admin-pwd-wrapper">
                <input
                  type={showAdminPwd ? 'text' : 'password'}
                  className={`form-input${loginErr ? ' input-error-shake' : ''}`}
                  value={adminPwd}
                  onChange={e => { setAdminPwd(e.target.value); setLoginErr(''); }}
                  placeholder={isAr ? 'أدخل كود الوصول' : 'Enter access code'}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="admin-pwd-toggle"
                  onClick={() => setShowAdminPwd(p => !p)}
                  title={showAdminPwd ? (isAr ? 'إفاء' : 'Hide') : (isAr ? 'إظهار' : 'Show')}
                >
                  {showAdminPwd ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {loginErr && <p style={{ color: '#f87171', fontSize: '0.82rem', marginTop: '0.3rem' }}>{loginErr}</p>}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{isAr ? 'رمز التحقق (Captcha)' : 'Verification Code (Captcha)'}</label>
              <div className="captcha-wrapper">
                <div className="captcha-canvas-container">
                  <canvas ref={canvasRef} width="240" height="70" className="captcha-canvas" />
                  <button type="button" className="captcha-refresh-btn" onClick={genCaptcha} title={isAr ? 'تحديث الرمز' : 'Refresh'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="captcha-refresh-svg">
                      <path d="M23 4v6h-6"></path>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                  </button>
                </div>
                <input
                  type="text"
                  className={`form-input captcha-input-field${captchaErr ? ' input-error-shake' : ''}`}
                  value={captchaInput}
                  onChange={e => { setCaptchaInput(e.target.value); setCaptchaErr(false); }}
                  placeholder={isAr ? 'أدخل الرمز أعلاه' : 'Enter the code above'}
                  autoComplete="off"
                  maxLength="5"
                  required
                />
              </div>
            </div>

            <button type="submit" className="submit-btn full-width" style={{ marginTop: '0.5rem' }}>
              {isAr ? 'التالي' : 'Next'}
            </button>
          </form>

          <a
            href="https://dfkoon.github.io/mt.bau/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block',
              marginTop: '0.9rem',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '0.82rem',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '12px',
              padding: '0.55rem 1rem',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
          >
            {isAr ? 'الذهاب إلى الموقع الرئيسي' : 'Go to Main Website'}
          </a>
        </>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ────────────────────────────────────────────────────────────────────
  const tabGroups = [
    {
      groupLabel: isAr ? 'الرئيسية والمؤشرات' : 'Main & Metrics',
      items: [
        { id: 'analytics', icon: '📊', label: isAr ? 'لوحة الإحصائيات' : 'Analytics Dashboard' },
        { id: 'activity', icon: '⚡', label: isAr ? 'سجل النشاط المباشر' : 'Live Activity Log' },
        { id: 'notices', icon: '📢', label: isAr ? 'لوحة الإعلانات' : 'Notice Board' },
      ]
    },
    {
      groupLabel: isAr ? 'الشؤون الأكاديمية والمحتوى' : 'Academic & Content',
      items: [
        { id: 'courses', icon: '📚', label: isAr ? 'إدارة المواد الدراسية' : 'Manage Courses' },
        { id: 'quizzes', icon: '📝', label: isAr ? 'بنك الاختبارات' : 'Quizzes Bank' },
        { id: 'contributions', icon: '📥', label: isAr ? 'مساهمات الطلاب' : 'Student Contributions' },
      ]
    },
    {
      groupLabel: isAr ? 'فريق العمل والتطوع' : 'Staff & Volunteers',
      items: [
        { id: 'volunteers', icon: '🤝', label: isAr ? 'بوابة المتطوعين (RBAC)' : 'Volunteers (RBAC)' },
        { id: 'coordinators', icon: '👔', label: isAr ? 'إدارة المنسقين' : 'Coordinators' },
        { id: 'coordinator_apps', icon: '📋', label: isAr ? 'طلبات الانضمام' : 'Join Applications' },
      ]
    },
    {
      groupLabel: isAr ? 'الخدمات والعمليات' : 'Services & Operations',
      items: [
        { id: 'donations', icon: '🔄', label: isAr ? 'تبادل الكتب والمواد' : 'Book Exchange' },
        { id: 'service_requests', icon: '🛠️', label: isAr ? 'طلبات الخدمات' : 'Service Requests' },
        { id: 'chatfaq', icon: '💬', label: isAr ? 'نشمي والأسئلة الشائعة' : 'Nashmi & FAQ' },
      ]
    },
    {
      groupLabel: isAr ? 'النظام والملاحظات' : 'System & Feedback',
      items: [
        { id: 'reports', icon: '🚩', label: isAr ? 'بلاغات الأسئلة' : 'Question Reports' },
        { id: 'feedback', icon: '⭐', label: isAr ? 'التقييمات والآراء' : 'Feedback & Reviews' },
        { id: 'deleted_items', icon: '🗑️', label: isAr ? 'المحذوفات والأرشيف' : 'Deleted Items & Archive' },
        { id: 'general', icon: '⚙️', label: isAr ? 'الإعدادات العامة' : 'General Settings' },
      ]
    },
  ];

  const allFlatTabs = tabGroups.flatMap(g => g.items);
  const currentTabObj = allFlatTabs.find(t => t.id === activeTab);

  return (
    <>
      <div className={isEmbedded ? "admin-dashboard-embedded" : "admin-dashboard-page"} style={isEmbedded ? { paddingTop: 0 } : {}}>

        {/* ── Fixed Top Admin Header Bar ── */}
        {!isEmbedded && (
          <nav className="admin-top-navbar" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '72px', background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.1)', zIndex: 1000, display: 'flex', alignItems: 'center' }}>
            <div className="admin-navbar-container" style={{ width: '100%', maxWidth: '1600px', margin: '0 auto', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', direction: 'rtl' }}>
              <div className="admin-navbar-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <button
                  className="admin-sidebar-toggle"
                  onClick={() => setSidebarOpen(prev => !prev)}
                  style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title={sidebarOpen ? (isAr ? 'تصغير القائمة' : 'Collapse') : (isAr ? 'توسيع القائمة' : 'Expand')}
                >
                  ☰
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                  <div>
                    <span style={{ fontWeight: 900, fontSize: '1.1rem', color: '#ffffff' }}>{isAr ? 'مكانك الجامعي' : 'Makanak Al-Jamii'}</span>
                    <span style={{ fontSize: '0.72rem', color: '#93c5fd', marginRight: '0.5rem', background: 'rgba(59,130,246,0.2)', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.4)', fontWeight: 700 }}>
                      Enterprise v2.5
                    </span>
                  </div>
                </div>
              </div>

              {/* Middle Breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94a3b8', fontSize: '0.9rem' }} className="admin-breadcrumb-hide-mobile">
                <span>{isAr ? 'لوحة التحكم' : 'Dashboard'}</span>
                <span>/</span>
                <span style={{ color: '#60a5fa', fontWeight: 700 }}>
                  {currentTabObj?.icon} {currentTabObj?.label || (isAr ? 'الرئيسية' : 'Home')}
                </span>
              </div>

              {/* Right Profile, Live Notifications & Logout */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <AdminNotificationBell />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
                  <span style={{ fontSize: '0.8rem', color: '#f8fafc', fontWeight: 700 }}>{isAr ? 'المدير العام (Admin)' : 'System Admin'}</span>
                </div>

                <button
                  className="admin-navbar-logout-btn"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)', padding: '0.5rem 1.1rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={() => {
                    sessionStorage.removeItem('exchange_staff');
                    setAdminUsername('');
                    setAdminPwd('');
                    setLoginErr('');
                    genCaptcha();
                    setLoggedIn(false);
                  }}
                >
                  <span>🚪</span>
                  <span>{isAr ? 'تسجيل الخروج' : 'Logout'}</span>
                </button>
              </div>
            </div>
          </nav>
        )}

        <div className={isEmbedded ? "" : "admin-dashboard-container"}>
          {!isEmbedded && (
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
              <div className="admin-sidebar-header">
                <h3>{isAr ? 'نظام التحكم الشامل' : 'Navigation'}</h3>
                <button className="admin-sidebar-close" onClick={() => setSidebarOpen(false)}>×</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {tabGroups.map((group, gIdx) => (
                  <div key={gIdx} className="admin-sidebar-group">
                    <div className="admin-sidebar-group-title">
                      {group.groupLabel}
                    </div>
                    <ul className="admin-sidebar-links">
                      {group.items.map(t => {
                        const isActive = activeTab === t.id;
                        return (
                          <li key={t.id}>
                            <button
                              className={`admin-sidebar-btn ${isActive ? 'active' : ''}`}
                              onClick={() => setActiveTab(t.id)}
                            >
                              <span style={{ fontSize: '1.15rem' }}>{t.icon}</span>
                              <span style={{ flex: 1 }}>{t.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Sidebar footer info */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--adm-divider)', textAlign: 'center', fontSize: '0.72rem', color: 'var(--adm-muted)' }}>
                <span>Makanak Al-Jamii Engine © 2026</span>
              </div>
            </aside>
          )}

          {/* ── Main Tab Content Container ── */}
          <main className="admin-main-canvas">
            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Analytics */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'analytics' && <AdminAnalytics />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Notice Board */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'notices' && <AdminNotices />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Service Requests */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'coordinator_apps' && <AdminCoordinatorApplications />}
            {activeTab === 'service_requests' && <AdminServiceRequests />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Feedback & Suggestions */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'feedback' && <AdminFeedback />}
            {activeTab === 'deleted_items' && <AdminDeletedItems />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Academic Courses */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'courses' && <AdminCourses />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Question Reports */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'reports' && <AdminReports />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Student Contributions */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'contributions' && <AdminContributions />}

            {/* TAB: Student Activity Log */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'activity' && <AdminActivityLog />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Nashmi Chat & FAQ Management */}
            {activeTab === 'chatfaq' && <AdminChatFAQ />}

            {activeTab === 'coordinators' && <AdminCoordinators />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Volunteers Management */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'volunteers' && <AdminVolunteers />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Donations — Full MaterialExchange embedded */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'donations' && (
              <div className="admin-donations-embed">
                <MaterialExchange isEmbedded={true} />
              </div>
            )}

            {activeTab === 'general' && <AdminGeneral />}

            {/* ══════════════════════════════════════════════════════ */}
            {/* TAB: Quizzes Management */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === 'quizzes' && (

              <div className="admin-panel-section quizzes-management-section">
                <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '0.7rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <button
                      className="qmanage-add-btn"
                      style={{ opacity: quizView === 'bank' ? 1 : 0.65 }}
                      onClick={() => setQuizView('bank')}
                    >
                      {isAr ? 'بنك الأسئلة' : 'Question Bank'}
                    </button>
                    <button
                      className="qmanage-add-btn"
                      style={{ opacity: quizView === 'audit' ? 1 : 0.65 }}
                      onClick={() => setQuizView('audit')}
                    >
                      {isAr ? `سجل التعديلات (${quizAuditLogs.length})` : `Change Log (${quizAuditLogs.length})`}
                    </button>
                  </div>

                  <button
                    className="qmanage-add-btn"
                    style={{
                      background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                      borderColor: 'transparent',
                      color: '#ffffff',
                      boxShadow: '0 2px 10px rgba(14,165,233,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 800
                    }}
                    onClick={() => setShowQuestionBankTools(true)}
                  >
                    <span>✨</span>
                    <span>{isAr ? 'مساعد الذكاء واستيراد الاختبارات (Bulk AI & Audit)' : 'AI Assistant & Bulk Import / Audit'}</span>
                  </button>
                </div>

                {quizView === 'audit' ? (
                  <div style={{ background: 'var(--card-bg, #fff)', borderRadius: '10px', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{isAr ? 'آخر تعديلات الاختبارات وبنك الأسئلة' : 'Recent quiz and question changes'}</h3>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                          {isAr ? 'يعرض من قام بالتعديل ومتى وأي عنصر تأثر' : 'Who changed what and when'}
                        </span>
                      </div>
                      <select value={quizAuditPeriod} onChange={e => setQuizAuditPeriod(e.target.value)} style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #dbe3ee' }}>
                        <option value="all">{isAr ? 'كل الفترات' : 'All time'}</option>
                        <option value="today">{isAr ? 'اليوم' : 'Today'}</option>
                        <option value="week">{isAr ? 'هذا الأسبوع' : 'This week'}</option>
                        <option value="month">{isAr ? 'هذا الشهر' : 'This month'}</option>
                      </select>
                    </div>
                    {filteredQuizAuditLogs.length === 0 ? (
                      <div className="qmanage-empty">{isAr ? 'لا توجد تعديلات في الفترة المحددة' : 'No changes in the selected period'}</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                          <thead>
                            <tr style={{ textAlign: isAr ? 'right' : 'left', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '0.65rem' }}>{isAr ? 'التاريخ' : 'Date'}</th>
                              <th style={{ padding: '0.65rem' }}>{isAr ? 'المنسق' : 'Coordinator'}</th>
                              <th style={{ padding: '0.65rem' }}>{isAr ? 'العملية' : 'Action'}</th>
                              <th style={{ padding: '0.65rem' }}>{isAr ? 'العنصر' : 'Item'}</th>
                              <th style={{ padding: '0.65rem' }}>{isAr ? 'التفاصيل' : 'Details'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredQuizAuditLogs.map(log => (
                              <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.65rem', whiteSpace: 'nowrap' }}>{formatQuizAuditDate(log.createdAt)}</td>
                                <td style={{ padding: '0.65rem', fontWeight: 600 }}>{log.operatorName || log.operatorId || 'admin'}</td>
                                <td style={{ padding: '0.65rem' }}>{quizAuditActionLabel(log.action)}</td>
                                <td style={{ padding: '0.65rem' }}>{quizAuditEntityLabel(log.entity)} · {log.entityId || '—'}</td>
                                <td style={{ padding: '0.65rem', color: 'var(--text-muted)' }}>{log.details || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="qmanage-layout">

                    {/* Column 1: Subjects List */}
                    <div className="qmanage-column subjects-col">
                      <div className="qmanage-col-header">
                        <h4> {isAr ? 'المواد الدراسية' : 'Subjects'}</h4>
                        <button className="qmanage-add-btn" onClick={() => {
                          // Reset to add-mode before opening modal
                          setEditingSubjectOriginalId(null);
                          setSubjectForm({ id: '', name: '', nameAr: '', icon: '', color: '#6366F1', languageMode: 'both' });
                          setShowAddSubjectModal(true);
                        }}>
                          {isAr ? 'مادة جديدة' : 'New Subject'}
                        </button>
                      </div>
                      <div className="qmanage-list">
                        {allSubjects.map(sub => (
                          <div
                            key={sub.id}
                            className={`qmanage-item-card ${selectedSubjectId === sub.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedSubjectId(sub.id);
                              setSelectedPartId('');
                            }}
                          >
                            <span className="qmanage-item-icon">{sub.icon || ''}</span>
                            <div className="qmanage-item-info">
                              <span className="qmanage-item-name">{isAr ? sub.nameAr : sub.name}</span>
                              <span className="qmanage-item-id">ID: {sub.id}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {/* Edit subject */}
                              <button
                                className="qmanage-q-action-btn"
                                title={isAr ? 'تعديل المادة' : 'Edit Subject'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSubjectOriginalId(sub.id); // track original ID for edit mode
                                  setSubjectForm({
                                    id: sub.id,
                                    name: sub.name || '',
                                    nameAr: sub.nameAr || '',
                                    icon: sub.icon || '',
                                    color: sub.color || '#6366F1',
                                    languageMode: sub.languageMode || 'both',
                                  });
                                  setShowAddSubjectModal(true);
                                }}
                              >✏️</button>
                              {/* Delete subject — available for ALL subjects */}
                              <button
                                className="qmanage-item-delete-btn"
                                onClick={(e) => { e.stopPropagation(); deleteSubject(sub.id); }}
                                title={isAr ? 'حذف المادة بالكامل' : 'Delete entire subject'}
                              >

                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Column 2: Quiz Parts */}
                    <div className="qmanage-column parts-col">
                      <div className="qmanage-col-header">
                        <h4> {isAr ? 'الأجزاء / الاختبارات' : 'Quizzes / Parts'}</h4>
                        {selectedSubjectId ? (
                          <button className="qmanage-add-btn" onClick={() => setShowAddPartModal(true)}>
                            {isAr ? 'اختبار جديد' : 'New Quiz'}
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {isAr ? 'اختر مادة أولاً' : 'Select a subject first'}
                          </span>
                        )}
                      </div>
                      <div className="qmanage-list">
                        {selectedSubjectId ? (
                          allParts.length === 0 ? (
                            <div className="qmanage-empty">{isAr ? 'لا توجد اختبارات مضاف بعد' : 'No quiz parts yet'}</div>
                          ) : (
                            allParts.map(part => (
                              <div
                                key={part.id}
                                className={`qmanage-item-card ${selectedPartId === part.id ? 'active' : ''}`}
                                onClick={() => setSelectedPartId(part.id)}
                              >
                                <div className="qmanage-item-info">
                                  <span className="qmanage-item-name">{isAr ? part.titleAr : part.title}</span>
                                  <span className="qmanage-item-id">ID: {part.id}</span>
                                  {part.durationMinutes && <span className="qmanage-item-id">⏱ {part.durationMinutes} {isAr ? 'د' : 'min'}</span>}
                                  {part.passMark != null && <span className="qmanage-item-id">🎯 {part.passMark}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                  {/* Edit part */}
                                  <button
                                    className="qmanage-q-action-btn"
                                    title={isAr ? 'تعديل الجزء' : 'Edit Part'}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPartForm({
                                        id: part.id,
                                        title: part.title || '',
                                        titleAr: part.titleAr || '',
                                        isGroup: part.isGroup || false,
                                        durationMinutes: part.durationMinutes || 30,
                                        passMark: part.passMark != null ? part.passMark : '',
                                      });
                                      setShowAddPartModal(true);
                                    }}
                                  >✏️</button>
                                  {/* Delete part — allow for any part (soft-hide for static, hard-delete for dynamic) */}
                                  <button
                                    className="qmanage-item-delete-btn"
                                    onClick={(e) => { e.stopPropagation(); deletePart(part.id); }}
                                    title={isAr ? 'حذف الجزء بالكامل' : 'Delete entire part'}
                                  >

                                  </button>
                                </div>
                              </div>
                            ))
                          )
                        ) : (
                          <div className="qmanage-empty">{isAr ? 'يرجى اختيار مادة من اليمين' : 'Please select a subject from left'}</div>
                        )}
                      </div>
                    </div>

                    {/* Column 3: Questions List / Sub-parts navigator */}
                    <div className="qmanage-column questions-col">
                      <div className="qmanage-col-header">
                        <h4>
                          {isGroupPart && !selectedSubPartId
                            ? (isAr ? '📂 الأجزاء المصغرة' : '📂 Sub-parts')
                            : isGroupPart && selectedSubPartId
                              ? <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <button
                                  onClick={() => setSelectedSubPartId('')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--adm-accent)', padding: 0 }}
                                  title={isAr ? 'العودة للأجزاء' : 'Back to sub-parts'}
                                >← </button>
                                {isAr ? 'أسئلة الجزء' : 'Part Questions'}
                              </span>
                              : (isAr ? 'أسئلة الاختبار' : 'Questions List')
                          }
                        </h4>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <button
                            className="qmanage-add-btn"
                            style={{
                              background: 'rgba(14,165,233,0.12)',
                              color: '#0284c7',
                              borderColor: 'rgba(14,165,233,0.3)',
                              fontSize: '0.78rem',
                              padding: '0.3rem 0.65rem'
                            }}
                            onClick={() => setShowQuestionBankTools(true)}
                            title={isAr ? 'استيراد نماذج كاملة أو تدقيق الأسئلة بالذكاء الاصطناعي' : 'Bulk Import or AI Audit'}
                          >
                            ⚡ {isAr ? 'استيراد ذكي / تدقيق' : 'AI Bulk / Audit'}
                          </button>

                          {/* Add Question button — shown when we have an effective part for questions */}
                          {effectivePartId ? (
                            <button className="qmanage-add-btn" onClick={() => openQuestionModal()}>
                              {isAr ? 'إضافة سؤال' : 'New Question'}
                            </button>
                          ) : selectedPartId && !isGroupPart ? (
                            <button className="qmanage-add-btn" onClick={() => openQuestionModal()}>
                              {isAr ? 'إضافة سؤال' : 'New Question'}
                            </button>
                          ) : !selectedPartId ? (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {isAr ? 'اختر اختباراً أولاً' : 'Select a quiz first'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="qmanage-list">
                        {selectedPartId ? (
                          isGroupPart && !selectedSubPartId ? (
                            // ── Group part: show sub-parts navigator ──
                            allSubPartsList.length === 0 ? (
                              <div className="qmanage-empty">{isAr ? 'لا توجد أجزاء مصغرة' : 'No sub-parts yet'}</div>
                            ) : (
                              allSubPartsList.map(sp => {
                                const spData = staticBaseQuizData[sp.id] || staticExtraQuizData[sp.id] || {};
                                const spStaticCount = spData.questions?.length || 0;
                                return (
                                  <div
                                    key={sp.id}
                                    className={`qmanage-item-card ${selectedSubPartId === sp.id ? 'active' : ''}`}
                                    onClick={() => setSelectedSubPartId(sp.id)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <span className="qmanage-item-icon">📄</span>
                                    <div className="qmanage-item-info">
                                      <span className="qmanage-item-name">{isAr ? (sp.titleAr || sp.title) : (sp.title || sp.titleAr)}</span>
                                      <span className="qmanage-item-id">
                                        {spStaticCount} {isAr ? 'سؤال' : 'questions'} • ID: {sp.id}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--adm-accent)' }}>→</span>
                                  </div>
                                );
                              })
                            )
                          ) : allQuestions.length === 0 ? (
                            <div className="qmanage-empty">{isAr ? 'لا توجد أسئلة في هذا الجزء بعد' : 'No questions in this part yet'}</div>
                          ) : (
                            allQuestions.map((q, idx) => (
                              <div key={q.id || idx} className="qmanage-question-card">
                                <div className="qmanage-question-card-header">
                                  <span className="qmanage-q-badge">Q{idx + 1}</span>
                                  <span className="qmanage-q-badge badge-points">{q.marks || 1} pt</span>
                                  {q.isDynamic && <span className="qmanage-q-badge badge-db">Db</span>}

                                  <div style={{ marginRight: isAr ? 'auto' : '0', marginLeft: isAr ? '0' : 'auto', display: 'flex', gap: '0.4rem' }}>
                                    <button className="qmanage-q-action-btn" onClick={() => openQuestionModal(q)} title={isAr ? 'تعديل السؤال' : 'Edit Question'}></button>
                                    {/* Delete button for ALL questions — static uses soft-delete, dynamic uses hard-delete */}
                                    <button
                                      className="qmanage-q-action-btn delete"
                                      onClick={() => deleteQuestion(q.id, q.isStatic && !q.isDynamic)}
                                      title={isAr ? 'حذف السؤال' : 'Delete Question'}
                                    ></button>
                                  </div>
                                </div>
                                <div className="qmanage-question-card-body">
                                  {q.codeBlock && renderCodeBlock(q.codeBlock)}
                                  <p className="qmanage-q-text text-ar">{q.questionAr || '—'}</p>
                                  <p className="qmanage-q-text text-en">{q.questionEn || '—'}</p>
                                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem', marginBottom: '0.4rem' }}>
                                    {q.image && (
                                      <div className="qmanage-q-img-preview" style={{ flex: '1 1 auto', maxWidth: '200px', margin: 0 }}>
                                        <img src={q.image} alt="Question visual 1" style={{ width: '100%', borderRadius: '6px' }} />
                                      </div>
                                    )}
                                    {q.image2 && (
                                      <div className="qmanage-q-img-preview" style={{ flex: '1 1 auto', maxWidth: '200px', margin: 0 }}>
                                        <img src={q.image2} alt="Question visual 2" style={{ width: '100%', borderRadius: '6px' }} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="qmanage-q-options">
                                    {q.options?.map(opt => (
                                      <div key={opt.id} className={`qmanage-q-option ${q.correctAnswer === opt.id ? 'correct' : ''}`}>
                                        <span className="opt-marker">{opt.id.toUpperCase()}</span>
                                        <span className="opt-text" dangerouslySetInnerHTML={{ __html: isAr ? (opt.textAr || opt.textEn) : opt.textEn }} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            ))
                          )
                        ) : (
                          <div className="qmanage-empty">{isAr ? 'يرجى اختيار جزء/اختبار لعرض أسئلته' : 'Please select a quiz to see questions'}</div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ══ Question Edit Modal ══ */}
      {editingReport && (
        <div className="qedit-overlay" onClick={closeEditModal}>
          <div className="qedit-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="qedit-header">
              <div className="qedit-header-info">
                <span className="qedit-badge-quiz">{editingReport.quizTitle || editingReport.quizId}</span>
                {editingReport.subjectName && <span className="qedit-badge-sub">• {editingReport.subjectName}</span>}
                <span className="qedit-badge-id"> Q{editingReport.questionId}</span>
              </div>
              <button className="qedit-close" onClick={closeEditModal}></button>
            </div>

            <div className="qedit-title">
              {isAr ? 'تعديل السؤال والخيارات' : 'Edit Question & Options'}
            </div>

            <div className="qedit-body">

              {/* Question text Arabic */}
              <div className="qedit-field">
                <label className="qedit-label">
                  {isAr ? 'نص السؤال — عربي' : 'Question Text — Arabic'}
                </label>
                <textarea
                  className="qedit-textarea"
                  value={editForm.questionAr}
                  onChange={e => setEditForm(prev => ({ ...prev, questionAr: e.target.value }))}
                  dir="rtl"
                  rows={3}
                  placeholder={isAr ? 'اكتب السؤال بالعربي...' : 'Arabic question text...'}
                />
              </div>

              {/* Question text English */}
              <div className="qedit-field">
                <label className="qedit-label">
                  {isAr ? 'نص السؤال — إنجليزي' : 'Question Text — English'}
                </label>
                <textarea
                  className="qedit-textarea"
                  value={editForm.questionEn}
                  onChange={e => setEditForm(prev => ({ ...prev, questionEn: e.target.value }))}
                  dir="ltr"
                  rows={3}
                  placeholder="English question text..."
                />
              </div>

              {/* Image device upload zone */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                {/* Image 1 */}
                <div className="qedit-field" style={{ flex: '1 1 200px', margin: 0 }}>
                  <label className="qedit-label"> {isAr ? 'صور السؤال الأولى (اختياري)' : 'Question Image 1 (optional)'}</label>
                  <input
                    ref={quizImageInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 10 ميجا بايت' : 'Image must be under 10MB');
                        return;
                      }
                      setQuizImageUploading(true);
                      setQuizImageProgress(20);
                      try {
                        const compressed = await new Promise((resolve, reject) => {
                          const img = new Image();
                          const url = URL.createObjectURL(file);
                          img.onload = () => {
                            URL.revokeObjectURL(url);
                            const MAX = 800;
                            let w = img.width, h = img.height;
                            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                            const canvas = document.createElement('canvas');
                            canvas.width = w; canvas.height = h;
                            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                            resolve(canvas.toDataURL('image/jpeg', 0.78));
                          };
                          img.onerror = reject;
                          img.src = url;
                        });
                        setQuizImageProgress(100);
                        setQuestionForm(prev => ({ ...prev, image: compressed }));
                        toast.success(isAr ? ' تم تحميل الصور الأولى بنجاح' : ' Image 1 loaded successfully');
                      } catch (err) {
                        console.error(err);
                        toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
                      } finally {
                        setQuizImageUploading(false);
                        setQuizImageProgress(0);
                      }
                      e.target.value = '';
                    }}
                  />
                  {!questionForm.image && !quizImageUploading && (
                    <div className="qedit-image-dropzone" onClick={() => quizImageInputRef.current?.click()}>
                      <span style={{ fontSize: '1.5rem' }}></span>
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>{isAr ? 'اضغط لاختيار صور 1' : 'Click to choose image 1'}</p>
                    </div>
                  )}
                  {quizImageUploading && (
                    <div className="qedit-image-uploading">
                      <div className="qedit-upload-bar">
                        <div className="qedit-upload-bar-fill" style={{ width: `${quizImageProgress}%` }} />
                      </div>
                      <span>{isAr ? `جاري الرفع... ${quizImageProgress}%` : `Uploading... ${quizImageProgress}%`}</span>
                    </div>
                  )}
                  {questionForm.image && !quizImageUploading && (
                    <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
                      <img src={questionForm.image} alt="preview" style={{ maxHeight: '140px', maxWidth: '100%', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }} />
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button type="button" className="qedit-add-option" style={{ width: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.75rem', margin: 0 }} onClick={() => quizImageInputRef.current?.click()}> {isAr ? 'تغيير' : 'Change'}</button>
                        <button type="button" className="qedit-opt-delete" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', margin: 0 }} onClick={() => setQuestionForm(prev => ({ ...prev, image: '' }))}>{isAr ? 'حذف ' : 'Remove'}</button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Image 2 */}
                <div className="qedit-field" style={{ flex: '1 1 200px', margin: 0 }}>
                  <label className="qedit-label"> {isAr ? 'صور السؤال الثاني (اختياري)' : 'Question Image 2 (optional)'}</label>
                  <input
                    ref={quizImage2InputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) {
                        toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 10 ميجا بايت' : 'Image must be under 10MB');
                        return;
                      }
                      setQuizImage2Uploading(true);
                      setQuizImage2Progress(20);
                      try {
                        const compressed = await new Promise((resolve, reject) => {
                          const img = new Image();
                          const url = URL.createObjectURL(file);
                          img.onload = () => {
                            URL.revokeObjectURL(url);
                            const MAX = 800;
                            let w = img.width, h = img.height;
                            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                            const canvas = document.createElement('canvas');
                            canvas.width = w; canvas.height = h;
                            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                            resolve(canvas.toDataURL('image/jpeg', 0.78));
                          };
                          img.onerror = reject;
                          img.src = url;
                        });
                        setQuizImage2Progress(100);
                        setQuestionForm(prev => ({ ...prev, image2: compressed }));
                        toast.success(isAr ? ' تم تحميل الصور الثاني بنجاح' : ' Image 2 loaded successfully');
                      } catch (err) {
                        console.error(err);
                        toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
                      } finally {
                        setQuizImage2Uploading(false);
                        setQuizImage2Progress(0);
                      }
                      e.target.value = '';
                    }}
                  />
                  {!questionForm.image2 && !quizImage2Uploading && (
                    <div className="qedit-image-dropzone" onClick={() => quizImage2InputRef.current?.click()}>
                      <span style={{ fontSize: '1.5rem' }}></span>
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.82rem' }}>{isAr ? 'اضغط لاختيار صور 2' : 'Click to choose image 2'}</p>
                    </div>
                  )}
                  {quizImage2Uploading && (
                    <div className="qedit-image-uploading">
                      <div className="qedit-upload-bar">
                        <div className="qedit-upload-bar-fill" style={{ width: `${quizImage2Progress}%` }} />
                      </div>
                      <span>{isAr ? `جاري الرفع... ${quizImage2Progress}%` : `Uploading... ${quizImage2Progress}%`}</span>
                    </div>
                  )}
                  {questionForm.image2 && !quizImage2Uploading && (
                    <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
                      <img src={questionForm.image2} alt="preview 2" style={{ maxHeight: '140px', maxWidth: '100%', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }} />
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button type="button" className="qedit-add-option" style={{ width: 'auto', padding: '0.2rem 0.6rem', fontSize: '0.75rem', margin: 0 }} onClick={() => quizImage2InputRef.current?.click()}> {isAr ? 'تغيير' : 'Change'}</button>
                        <button type="button" className="qedit-opt-delete" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', margin: 0 }} onClick={() => setQuestionForm(prev => ({ ...prev, image2: '' }))}>{isAr ? 'حذف ' : 'Remove'}</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Options — with add/delete */}
              <div className="qedit-field">
                <label className="qedit-label">
                  {isAr ? 'الخيارات — اختر الإجابة الصحيحة' : 'Options — select the correct answer'}
                </label>
                <div className="qedit-options-list">
                  {editForm.options.map((opt, idx) => (
                    <div
                      key={opt.id || idx}
                      className={`qedit-option ${editForm.correctAnswer === opt.id ? 'qedit-option--correct' : ''}`}
                    >
                      {/* Option label + correct radio + delete */}
                      <div className="qedit-option-top">
                        <span className="qedit-opt-id">{(() => {
                          const txt = isAr ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr);
                          if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                          return String(idx + 1);
                        })()}</span>
                        <label className="qedit-correct-label">
                          <input
                            type="radio"
                            name="correctAnswer"
                            checked={editForm.correctAnswer === opt.id}
                            onChange={() => setEditForm(prev => ({ ...prev, correctAnswer: opt.id }))}
                          />
                          {isAr ? 'الإجابة الصحيحة ' : 'Correct Answer '}
                        </label>
                        <button
                          className="qedit-opt-delete"
                          onClick={() => deleteOption(idx)}
                          title={isAr ? 'حذف الخيار' : 'Delete option'}
                        ></button>
                      </div>
                      {/* Arabic option text */}
                      {(opt.textAr !== undefined || editForm.questionAr) && (
                        <input
                          className="qedit-opt-input"
                          value={opt.textAr || ''}
                          onChange={e => updateOption(idx, 'textAr', e.target.value)}
                          placeholder={isAr ? 'نص الخيار (عربي)' : 'Option text (AR)'}
                          dir="rtl"
                        />
                      )}
                      {/* English option text */}
                      <input
                        className="qedit-opt-input"
                        value={opt.textEn || ''}
                        onChange={e => updateOption(idx, 'textEn', e.target.value)}
                        placeholder="Option text (EN)"
                        dir="ltr"
                      />
                    </div>
                  ))}
                </div>
                {/* Add Option Button */}
                <button className="qedit-add-option" onClick={addOption}>
                  + {isAr ? 'إضافة يار جديد' : 'Add New Option'}
                </button>
              </div>

              {/* Question Image — file upload from device */}
              <div className="qedit-field">
                <label className="qedit-label">
                  {isAr ? 'صور السؤال (اختياري)' : 'Question Image (optional)'}
                </label>

                {/* Hidden file input — compresses and stores as base64 */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 10 ميجا بايت' : 'Image must be under 10MB');
                      return;
                    }
                    setImageUploading(true);
                    setImageUploadProgress(20);
                    try {
                      // Compress image client-side using Canvas
                      const compressed = await new Promise((resolve, reject) => {
                        const img = new Image();
                        const url = URL.createObjectURL(file);
                        img.onload = () => {
                          URL.revokeObjectURL(url);
                          const MAX = 800;
                          let w = img.width, h = img.height;
                          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                          const canvas = document.createElement('canvas');
                          canvas.width = w; canvas.height = h;
                          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                          resolve(canvas.toDataURL('image/jpeg', 0.78));
                        };
                        img.onerror = reject;
                        img.src = url;
                      });
                      setImageUploadProgress(100);
                      setEditForm(prev => ({ ...prev, image: compressed }));
                      toast.success(isAr ? ' تم تحميل الصور بنجاح' : ' Image loaded successfully');
                    } catch (err) {
                      console.error(err);
                      toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
                    } finally {
                      setImageUploading(false);
                      setImageUploadProgress(0);
                    }
                    e.target.value = '';
                  }}
                />

                {/* Upload Zone */}
                {!editForm.image && !imageUploading && (
                  <div
                    className="qedit-image-dropzone"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <span style={{ fontSize: '2rem' }}></span>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>
                      {isAr ? 'اضغط لاختيار صور من جهازك' : 'Click to choose an image from your device'}
                    </p>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', opacity: 0.5 }}>
                      {isAr ? 'حد أقصى 5 ميجابايت' : 'Max 5MB'}
                    </p>
                  </div>
                )}

                {/* Upload progress */}
                {imageUploading && (
                  <div className="qedit-image-uploading">
                    <div className="qedit-upload-bar">
                      <div className="qedit-upload-bar-fill" style={{ width: `${imageUploadProgress}%` }} />
                    </div>
                    <span>{isAr ? `جاري الرفع... ${imageUploadProgress}%` : `Uploading... ${imageUploadProgress}%`}</span>
                  </div>
                )}

                {/* Image preview */}
                {editForm.image && !imageUploading && (
                  <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
                    <img
                      src={editForm.image}
                      alt="preview"
                      style={{ maxHeight: '180px', maxWidth: '100%', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button
                        className="qedit-add-option"
                        style={{ width: 'auto', padding: '0.3rem 0.8rem' }}
                        onClick={() => imageInputRef.current?.click()}
                      >
                        {isAr ? 'تغيير الصور' : 'Change Image'}
                      </button>
                      <button
                        className="qedit-opt-delete"
                        onClick={() => setEditForm(prev => ({ ...prev, image: '' }))}
                      >
                        {isAr ? 'حذف ' : 'Remove '}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="qedit-footer">
              <button className="qedit-btn-cancel" onClick={closeEditModal} disabled={editSaving}>
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button className="qedit-btn-save" onClick={saveQuestionEdit} disabled={editSaving}>
                {editSaving ? <span className="qedit-spinner" /> : ''}
                {isAr ? 'حفظ التعديل' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Subject Modal ══ */}
      {showAddSubjectModal && (
        <div className="qedit-overlay" onClick={() => { setShowAddSubjectModal(false); setEditingSubjectOriginalId(null); }}>
          <div className="qedit-modal" onClick={e => e.stopPropagation()}>
            <div className="qedit-header">
              <span className="qedit-badge-quiz">
                {editingSubjectOriginalId !== null
                  ? (isAr ? '✏️ تعديل المادة' : '✏️ Edit Subject')
                  : (isAr ? '➕ إضافة مادة جديدة' : '➕ Add New Subject')}
              </span>
              <button className="qedit-close" onClick={() => { setShowAddSubjectModal(false); setEditingSubjectOriginalId(null); }}></button>
            </div>
            <div className="qedit-body">
              <div className="qedit-field">
                <label className="qedit-label">
                  {isAr ? 'رمز المادة (ID فريد بالإنجليزي)' : 'Subject ID (unique, e.g. networks_2)'}
                  {editingSubjectOriginalId !== null && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--adm-muted)', marginRight: '0.4rem' }}>
                      {isAr ? '(لا يمكن تغييره عند التعديل)' : '(cannot change when editing)'}
                    </span>
                  )}
                </label>
                <input
                  className="qedit-opt-input"
                  value={subjectForm.id}
                  onChange={e => {
                    if (editingSubjectOriginalId !== null) return; // lock ID when editing
                    setSubjectForm(prev => ({ ...prev, id: e.target.value }));
                  }}
                  placeholder="e.g. data_science"
                  readOnly={editingSubjectOriginalId !== null}
                  style={editingSubjectOriginalId !== null ? { opacity: 0.6, cursor: 'not-allowed', background: 'rgba(255,255,255,0.03)' } : {}}
                />
              </div>
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'اسم المادة بالاللغة العربية' : 'Subject Name (Arabic)'}</label>
                <input
                  className="qedit-opt-input"
                  value={subjectForm.nameAr}
                  onChange={e => setSubjectForm(prev => ({ ...prev, nameAr: e.target.value }))}
                  placeholder="مثال: علم البيانات"
                  dir="rtl"
                />
              </div>
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'اسم المادة بالاللغة الإنجليزية' : 'Subject Name (English)'}</label>
                <input
                  className="qedit-opt-input"
                  value={subjectForm.name}
                  onChange={e => setSubjectForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Data Science"
                />
              </div>
              <div className="qedit-field" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="qedit-label">{isAr ? 'أيقون (Emoji)' : 'Icon (Emoji)'}</label>
                  <input
                    className="qedit-opt-input"
                    value={subjectForm.icon}
                    onChange={e => setSubjectForm(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="e.g. "
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="qedit-label">{isAr ? 'اللون (Hex)' : 'Color (Hex)'}</label>
                  <input
                    className="qedit-opt-input"
                    type="color"
                    value={subjectForm.color}
                    onChange={e => setSubjectForm(prev => ({ ...prev, color: e.target.value }))}
                    style={{ height: '42px', padding: '2px' }}
                  />
                </div>
              </div>
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'لغ الاختبار للمساق' : 'Quiz Language Mode'}</label>
                <select
                  className="qedit-opt-input"
                  value={subjectForm.languageMode || 'both'}
                  onChange={e => setSubjectForm(prev => ({ ...prev, languageMode: e.target.value }))}
                >
                  <option value="both">{isAr ? 'ثنائي اللغة (عربي + إنجليزي)' : 'Bilingual (Arabic + English)'}</option>
                  <option value="en">{isAr ? 'إنجليزي فقط' : 'English Only'}</option>
                  <option value="ar">{isAr ? 'عربي فقط' : 'Arabic Only'}</option>
                </select>
              </div>
            </div>
            <div className="qedit-footer">
              <button className="qedit-btn-cancel" onClick={() => { setShowAddSubjectModal(false); setEditingSubjectOriginalId(null); }}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              <button className="qedit-btn-save" onClick={saveSubject}>
                {editingSubjectOriginalId !== null ? (isAr ? '💾 حفظ التعديل' : '💾 Save Changes') : (isAr ? '➕ إضافة المادة' : '➕ Add Subject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add Quiz/Part Modal ══ */}
      {showAddPartModal && (
        <div className="qedit-overlay" onClick={() => setShowAddPartModal(false)}>
          <div className="qedit-modal" onClick={e => e.stopPropagation()}>
            <div className="qedit-header">
              <span className="qedit-badge-quiz">{isAr ? 'إضافة اختبار/جزء جديد' : 'Add New Quiz / Part'}</span>
              <button className="qedit-close" onClick={() => setShowAddPartModal(false)}></button>
            </div>
            <div className="qedit-body">
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'رمز الجزء (ID فريد بالإنجليزي)' : 'Quiz ID (unique, e.g. networks_2_quiz1)'}</label>
                <input
                  className="qedit-opt-input"
                  value={partForm.id}
                  onChange={e => setPartForm(prev => ({ ...prev, id: e.target.value }))}
                  placeholder="e.g. data_science_mid"
                />
              </div>
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'عنوان الاختبار بالاللغة العربية' : 'Quiz Title (Arabic)'}</label>
                <input
                  className="qedit-opt-input"
                  value={partForm.titleAr}
                  onChange={e => setPartForm(prev => ({ ...prev, titleAr: e.target.value }))}
                  placeholder="مثال: أسئلة سنوات ميد"
                  dir="rtl"
                />
              </div>
              <div className="qedit-field">
                <label className="qedit-label">{isAr ? 'عنوان الاختبار بالاللغة الإنجليزية' : 'Quiz Title (English)'}</label>
                <input
                  className="qedit-opt-input"
                  value={partForm.title}
                  onChange={e => setPartForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Midterm Exams"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <div className="qedit-field" style={{ flex: 1 }}>
                  <label className="qedit-label">⏱ {isAr ? 'مدة الاختبار (دقائق)' : 'Duration (minutes)'}</label>
                  <input
                    type="number"
                    min="1"
                    className="qedit-opt-input"
                    value={partForm.durationMinutes}
                    onChange={e => setPartForm(prev => ({ ...prev, durationMinutes: e.target.value }))}
                    placeholder="30"
                  />
                </div>
                <div className="qedit-field" style={{ flex: 1 }}>
                  <label className="qedit-label">🎯 {isAr ? 'درجة النجاح (اختياري)' : 'Pass Mark (optional)'}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="qedit-opt-input"
                    value={partForm.passMark}
                    onChange={e => setPartForm(prev => ({ ...prev, passMark: e.target.value }))}
                    placeholder={isAr ? 'مثال: 10' : 'e.g. 10'}
                  />
                </div>
              </div>
            </div>
            <div className="qedit-footer">
              <button className="qedit-btn-cancel" onClick={() => setShowAddPartModal(false)}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              <button className="qedit-btn-save" onClick={savePart}> {isAr ? 'حفظ الاختبار' : 'Save Quiz'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Add/Edit Question Modal ══ */}
      {showQuestionModal && (
        <div className="qedit-overlay" onClick={() => setShowQuestionModal(false)}>
          <div className="qedit-modal" onClick={e => e.stopPropagation()}>
            <div className="qedit-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <span className="qedit-badge-quiz">
                  {editingQuestion ? (isAr ? 'تعديل سؤال' : 'Edit Question') : (isAr ? 'إضافة سؤال جديد' : 'Add New Question')}
                </span>
                {editingQuestion && (() => {
                  const qIdx = allQuestions.findIndex(q => q.id === editingQuestion.id);
                  return qIdx !== -1 ? (
                    <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '6px', padding: '0.1rem 0.5rem', color: 'var(--primary-light, #a5b4fc)' }}>
                      Q{qIdx + 1} / {allQuestions.length}
                    </span>
                  ) : null;
                })()}
              </div>
              {/* Prev / Next navigation */}
              {editingQuestion && (() => {
                const qIdx = allQuestions.findIndex(q => q.id === editingQuestion.id);
                return (
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      type="button"
                      disabled={qIdx <= 0}
                      onClick={() => { if (qIdx > 0) openQuestionModal(allQuestions[qIdx - 1]); }}
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: qIdx <= 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)', cursor: qIdx <= 0 ? 'not-allowed' : 'pointer', opacity: qIdx <= 0 ? 0.4 : 1 }}
                      title={isAr ? 'السؤال السابق' : 'Previous question'}
                    >◀</button>
                    <button
                      type="button"
                      disabled={qIdx >= allQuestions.length - 1}
                      onClick={() => { if (qIdx < allQuestions.length - 1) openQuestionModal(allQuestions[qIdx + 1]); }}
                      style={{ padding: '0.2rem 0.55rem', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.15)', background: qIdx >= allQuestions.length - 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)', cursor: qIdx >= allQuestions.length - 1 ? 'not-allowed' : 'pointer', opacity: qIdx >= allQuestions.length - 1 ? 0.4 : 1 }}
                      title={isAr ? 'السؤال التالي' : 'Next question'}
                    >▶</button>
                  </div>
                );
              })()}
              <button className="qedit-close" onClick={() => setShowQuestionModal(false)}></button>
            </div>
            <div className="qedit-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="qedit-field" style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="qedit-label">{isAr ? 'الدرجات/العلامات' : 'Marks/Points'}</label>
                  <input
                    className="qedit-opt-input"
                    type="number"
                    step="0.5"
                    value={questionForm.marks}
                    onChange={e => {
                      const v = e.target.value;
                      lastMarksRef.current = v;
                      setQuestionForm(prev => ({ ...prev, marks: v }));
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="qedit-label">{isAr ? 'نوع السؤال' : 'Question Type'}</label>
                  <select
                    className="qedit-opt-input"
                    value={questionForm.type}
                    onChange={e => handleQuestionTypeChange(e.target.value)}
                  >
                    <option value="mcq">{isAr ? 'اختيار من متعدد (MCQ)' : 'Multiple Choice (MCQ)'}</option>
                    <option value="multi_select">{isAr ? ' اختيار متعدد الإجابات (Multi-Select)' : ' Multi-Select (Multiple Correct)'}</option>
                    <option value="true_false">{isAr ? 'صح أم خطأ (True/False)' : 'True / False'}</option>
                    <option value="matching">{isAr ? 'تعبئ الفراغات بقائم (Matching)' : 'Fill in the Blank (Matching)'}</option>
                    <option value="short_answer">{isAr ? 'إجابة قصير (Short Answer)' : 'Short Answer'}</option>
                    <option value="text">{isAr ? 'مقالي (Essay)' : 'Essay / Text'}</option>
                  </select>
                </div>
              </div>
              <div className="qedit-field" style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                {isAr ? 'استدم $...$ أو $$...$$ للرياضيات. أمثل: $x^2$, $\sqrt{x}$, $\cos x$, $\frac{a}{b}$، ويمكن كتاب القسم الطويل بنمط الكسر.' : 'Use $...$ or $$...$$ for math. Examples: $x^2$, $\sqrt{x}$, $\cos x$, $\frac{a}{b}$, and long division can be written as a fraction.'}
              </div>
              <div className="qedit-field">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginBottom: '0.55rem' }}>
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleOcrImageChange}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    className="qmanage-add-btn"
                    onClick={() => ocrInputRef.current?.click()}
                    disabled={ocrScanning}
                    style={{ padding: '0.28rem 0.6rem', fontSize: '0.75rem' }}
                  >
                    {ocrScanning ? (isAr ? 'جاري المسح...' : 'Scanning...') : (isAr ? ' مسح من صور' : ' Scan from image')}
                  </button>
                  {ocrScanning && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {ocrProgress}%
                    </span>
                  )}
                  {/* ── Paste image from clipboard ── */}
                  <button
                    type="button"
                    className="qmanage-add-btn"
                    style={{ padding: '0.28rem 0.6rem', fontSize: '0.75rem', background: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.4)', color: '#c4b5fd' }}
                    title={isAr ? 'الصق صور من الحافظ (Ctrl+V)' : 'Paste image from clipboard (Ctrl+V)'}
                    onClick={async () => {
                      try {
                        const items = await navigator.clipboard.read();
                        let found = false;
                        for (const item of items) {
                          const imageType = item.types.find(t => t.startsWith('image/'));
                          if (imageType) {
                            found = true;
                            const blob = await item.getType(imageType);
                            const file = new File([blob], `paste_${Date.now()}.png`, { type: imageType });
                            const fd = new FormData();
                            fd.append('file', file);
                            fd.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'zkqqznab');
                            fd.append('folder', 'quiz_images');
                            toast(isAr ? 'جاري رفع الصورة...' : 'Uploading image...');
                            const res = await fetch(`https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'yp11vyap'}/image/upload`, { method: 'POST', body: fd });
                            const data = await res.json();
                            if (data.secure_url) {
                              setQuestionForm(prev => ({ ...prev, image: data.secure_url }));
                              toast.success(isAr ? ' تم لصق الصورة!' : ' Image pasted!');
                            } else {
                              toast.error(isAr ? 'فشل رفع الصورة' : 'Image upload failed');
                            }
                            break;
                          }
                        }
                        if (!found) toast.error(isAr ? 'لا توجد صور في الحافظ' : 'No image found in clipboard');
                      } catch {
                        toast.error(isAr ? 'تعذّر قراء الحافظ — جرّب Ctrl+V في حقل السؤال' : 'Cannot read clipboard — try Ctrl+V in the question field');
                      }
                    }}
                  >
                    {isAr ? 'لصق صور' : 'Paste image'}
                  </button>
                  {/* ── Paste text from clipboard ── */}
                  <button
                    type="button"
                    className="qmanage-add-btn"
                    style={{ padding: '0.28rem 0.6rem', fontSize: '0.75rem', background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.35)', color: '#6ee7b7' }}
                    title={isAr ? 'الصق نص من الحافظ في حقل السؤال' : 'Paste text from clipboard into question field'}
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (!text) { toast.error(isAr ? 'الحافظ فارغ' : 'Clipboard is empty'); return; }
                        setQuestionForm(prev => ({
                          ...prev,
                          questionAr: prev.questionAr ? prev.questionAr + '\n' + text : text
                        }));
                        toast.success(isAr ? ' تم لصق النص في حقل السؤال العربي' : ' Text pasted into Arabic question field');
                      } catch {
                        toast.error(isAr ? 'تعذّر قراء الحافظ' : 'Cannot read clipboard');
                      }
                    }}
                  >
                    {isAr ? 'لصق نص' : 'Paste text'}
                  </button>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  {isAr ? 'ارفع صور للسؤال أو الخيارات وسيتم استخراج النص وإدخاله تلقائيًا في الحقول.' : 'Upload a photo of the question or options and the text will be filled in automatically.'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="qedit-label" style={{ margin: 0 }}> {isAr ? 'نص السؤال — عربي' : 'Question Text — Arabic'}</label>
                  <button
                    type="button"
                    className="qmanage-add-btn"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                    onClick={async () => {
                      if (!questionForm.questionAr) { toast.error(isAr ? 'يرجى كتاب النص بالعربي أولاً' : 'Please type Arabic text first'); return; }
                      toast(isAr ? 'جاري الترجم...' : 'Translating...');
                      const trans = await translateText(questionForm.questionAr, 'ar2en');
                      if (trans) {
                        setQuestionForm(prev => ({ ...prev, questionEn: trans }));
                        toast.success(isAr ? 'تمت الترجم!' : 'Translated!');
                      } else {
                        toast.error(isAr ? 'فشلت الترجم' : 'Translation failed');
                      }
                    }}
                  >
                    {isAr ? 'ترجم إلى الإنجليزي' : 'Translate to English'}
                  </button>
                </div>
                {/* ── Formatting toolbar for Arabic question ── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                  {[['B', 'bold', '<strong>'], ['I', 'italic', '<em>'], ['U', 'underline', '<u>'], ['</>', 'code', '<code>']].map(([label, tag]) => (
                    <button key={tag} type="button"
                      onMouseDown={e => { e.preventDefault(); insertFormatIntoQuestion('questionAr', tag); }}
                      style={{
                        fontWeight: tag === 'bold' ? 'bold' : 'normal', fontStyle: tag === 'italic' ? 'italic' : 'normal',
                        textDecoration: tag === 'underline' ? 'underline' : 'none', fontFamily: tag === 'code' ? 'monospace' : 'inherit',
                        fontSize: '0.75rem', padding: '0.15rem 0.4rem', border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', color: 'inherit'
                      }}>
                      {label}
                    </button>
                  ))}
                  <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                  {QUESTION_COLORS.map(c => (
                    <button key={c} type="button"
                      onMouseDown={e => { e.preventDefault(); insertFormatIntoQuestion('questionAr', 'color', c); }}
                      title={`Color ${c}`}
                      style={{ width: '16px', height: '16px', borderRadius: '50%', background: c, border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                  {HIGHLIGHT_COLORS.map(c => (
                    <button key={c} type="button"
                      onMouseDown={e => { e.preventDefault(); insertFormatIntoQuestion('questionAr', 'highlight', c); }}
                      title={`Highlight ${c}`}
                      style={{ width: '16px', height: '16px', borderRadius: '3px', background: c, border: '2px solid rgba(0,0,0,0.2)', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                  {[
                    { label: 'x²', value: '$x^2$' },
                    { label: '√x', value: '$\\sqrt{x}$' },
                    { label: 'a/b', value: '$\\frac{a}{b}$' }
                  ].map(item => (
                    <button key={item.label} type="button"
                      onMouseDown={e => { e.preventDefault(); insertTextIntoQuestion('questionAr', item.value); }}
                      style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={questionArRef}
                  className="qedit-textarea"
                  value={questionForm.questionAr}
                  onChange={e => setQuestionForm(prev => ({ ...prev, questionAr: e.target.value }))}
                  onPaste={e => handlePasteInTextarea(e, 'questionAr')}
                  dir="rtl"
                  rows={3}
                  placeholder="اكتب السؤال هنا..."
                />
                {/* Live preview when HTML tags present */}
                {/[<]/.test(questionForm.questionAr) && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    <span style={{ opacity: 0.6 }}> معاين: </span>
                    <span dangerouslySetInnerHTML={{ __html: questionForm.questionAr }} dir="rtl" />
                  </div>
                )}
              </div>
              <div className="qedit-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="qedit-label" style={{ margin: 0 }}> {isAr ? 'نص السؤال — إنجليزي' : 'Question Text — English'}</label>
                  <button
                    type="button"
                    className="qmanage-add-btn"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                    onClick={async () => {
                      if (!questionForm.questionEn) { toast.error(isAr ? 'يرجى كتاب النص بالإنجليزي أولاً' : 'Please type English text first'); return; }
                      toast(isAr ? 'جاري الترجم...' : 'Translating...');
                      const trans = await translateText(questionForm.questionEn, 'en2ar');
                      if (trans) {
                        setQuestionForm(prev => ({ ...prev, questionAr: trans }));
                        toast.success(isAr ? 'تمت الترجم!' : 'Translated!');
                      } else {
                        toast.error(isAr ? 'فشلت الترجم' : 'Translation failed');
                      }
                    }}
                  >
                    {isAr ? 'ترجم إلى العربي' : 'Translate to Arabic'}
                  </button>
                </div>
                {/* ── Formatting toolbar for English question ── */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                  {[['B', 'bold'], ['I', 'italic'], ['U', 'underline'], ['</>', 'code']].map(([label, tag]) => (
                    <button key={tag} type="button"
                      onMouseDown={e => { e.preventDefault(); insertFormatIntoQuestion('questionEn', tag); }}
                      style={{
                        fontWeight: tag === 'bold' ? 'bold' : 'normal', fontStyle: tag === 'italic' ? 'italic' : 'normal',
                        textDecoration: tag === 'underline' ? 'underline' : 'none', fontFamily: tag === 'code' ? 'monospace' : 'inherit',
                        fontSize: '0.75rem', padding: '0.15rem 0.4rem', border: '1px solid rgba(255,255,255,0.15)',
                        background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', color: 'inherit'
                      }}>
                      {label}
                    </button>
                  ))}
                  <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                  {QUESTION_COLORS.map(c => (
                    <button key={c} type="button"
                      onMouseDown={e => { e.preventDefault(); insertFormatIntoQuestion('questionEn', 'color', c); }}
                      title={`Color ${c}`}
                      style={{ width: '16px', height: '16px', borderRadius: '50%', background: c, border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                  {HIGHLIGHT_COLORS.map(c => (
                    <button key={c} type="button"
                      onMouseDown={e => { e.preventDefault(); insertFormatIntoQuestion('questionEn', 'highlight', c); }}
                      title={`Highlight ${c}`}
                      style={{ width: '16px', height: '16px', borderRadius: '3px', background: c, border: '2px solid rgba(0,0,0,0.2)', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <span style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                  {[
                    { label: 'x²', value: '$x^2$' },
                    { label: '√x', value: '$\\sqrt{x}$' },
                    { label: 'a/b', value: '$\\frac{a}{b}$' }
                  ].map(item => (
                    <button key={item.label} type="button"
                      onMouseDown={e => { e.preventDefault(); insertTextIntoQuestion('questionEn', item.value); }}
                      style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>
                      {item.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={questionEnRef}
                  className="qedit-textarea"
                  value={questionForm.questionEn}
                  onChange={e => setQuestionForm(prev => ({ ...prev, questionEn: e.target.value }))}
                  onPaste={e => handlePasteInTextarea(e, 'questionEn')}
                  dir="ltr"
                  rows={3}
                  placeholder="Type question here..."
                />
              </div>

              {/* Code Block (Optional) */}
              <div className="qedit-field">
                <label className="qedit-label"> {isAr ? 'كود برمجي مرافق للسؤال (اختياري)' : 'Associated Code Block (optional)'}</label>
                <textarea
                  className="qedit-textarea"
                  value={questionForm.codeBlock || ''}
                  onChange={e => setQuestionForm(prev => ({ ...prev, codeBlock: e.target.value }))}
                  dir="ltr"
                  rows={5}
                  style={{
                    fontFamily: '"Fira Code", Consolas, Monaco, "Courier New", Courier, monospace',
                    fontSize: '0.85rem',
                    backgroundColor: '#18181c',
                    color: '#e3e3e6',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    padding: '0.5rem 0.8rem',
                    marginTop: '0.3rem'
                  }}
                  placeholder={isAr ? 'أدخل الكود البرمجي هنا...' : 'Enter the source code here...'}
                />
                {/* Live preview when HTML tags present */}
                {/[<]/.test(questionForm.questionEn) && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    <span style={{ opacity: 0.6 }}> Preview: </span>
                    <span dangerouslySetInnerHTML={{ __html: questionForm.questionEn }} dir="ltr" />
                  </div>
                )}
              </div>

              {/* ── Matching: Sub-Questions (terms/prompts) editor ── */}
              {questionForm.type === 'matching' && (
                <div className="qedit-field" style={{ background: 'rgba(99,102,241,0.06)', borderRadius: '10px', padding: '0.8rem', border: '1px solid rgba(99,102,241,0.25)', marginBottom: '0.5rem' }}>
                  <label className="qedit-label" style={{ color: '#a5b4fc' }}>
                    📝 {isAr ? 'الجمل / المصطلحات (تظهر بجانب الأرقام 1 ، 2 ، 3 ...)' : 'Terms / Prompts (shown next to numbers 1, 2, 3...)'}
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.4rem' }}>
                    {(questionForm.subQuestions || []).map((sq, sqIdx) => (
                      <div key={sq.id || sqIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: '7px', padding: '0.4rem 0.6rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <span style={{ minWidth: '22px', fontWeight: 700, color: '#a5b4fc', fontSize: '0.9rem' }}>{sqIdx + 1}.</span>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <input
                            className="qedit-opt-input"
                            value={sq.textAr || ''}
                            onChange={e => {
                              const updated = [...(questionForm.subQuestions || [])];
                              updated[sqIdx] = { ...updated[sqIdx], textAr: e.target.value };
                              setQuestionForm(prev => ({ ...prev, subQuestions: updated }));
                            }}
                            placeholder={isAr ? 'نص المصطلح / الجملة (عربي)' : 'Term text Arabic (optional)'}
                            dir="rtl"
                            style={{ margin: 0 }}
                          />
                          <input
                            className="qedit-opt-input"
                            value={sq.textEn || ''}
                            onChange={e => {
                              const updated = [...(questionForm.subQuestions || [])];
                              updated[sqIdx] = { ...updated[sqIdx], textEn: e.target.value };
                              setQuestionForm(prev => ({ ...prev, subQuestions: updated }));
                            }}
                            placeholder="Term text English"
                            dir="ltr"
                            style={{ margin: 0 }}
                          />
                        </div>
                        {/* Correct answer for this sub-question */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '130px' }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{isAr ? 'الإجابة الصحيحة' : 'Correct answer'}</span>
                          <select
                            value={sq.correctAnswer || ''}
                            onChange={e => {
                              const updated = [...(questionForm.subQuestions || [])];
                              updated[sqIdx] = { ...updated[sqIdx], correctAnswer: e.target.value };
                              setQuestionForm(prev => ({ ...prev, subQuestions: updated }));
                            }}
                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.4rem', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.35)', color: 'inherit', cursor: 'pointer' }}
                          >
                            <option value="">{isAr ? '-- اختر --' : '-- pick --'}</option>
                            {(questionForm.options || []).map(opt => (
                              <option key={opt.id} value={opt.id}>
                                {(isAr ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr)) || opt.id}
                              </option>
                            ))}
                          </select>
                        </div>
                        {/* Marks per sub-question */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '64px' }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{isAr ? 'علامة' : 'Marks'}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={sq.marks !== undefined ? sq.marks : 1}
                            onChange={e => {
                              const updated = [...(questionForm.subQuestions || [])];
                              updated[sqIdx] = { ...updated[sqIdx], marks: parseFloat(e.target.value) || 0 };
                              setQuestionForm(prev => ({ ...prev, subQuestions: updated }));
                            }}
                            style={{ fontSize: '0.82rem', padding: '0.2rem 0.4rem', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.35)', color: 'inherit', width: '60px', textAlign: 'center' }}
                          />
                        </div>
                        {/* Remove sub-question */}
                        {(questionForm.subQuestions || []).length > 1 && (
                          <button
                            type="button"
                            className="qedit-opt-delete"
                            style={{ margin: 0, flexShrink: 0 }}
                            onClick={() => {
                              const updated = (questionForm.subQuestions || []).filter((_, i) => i !== sqIdx);
                              setQuestionForm(prev => ({ ...prev, subQuestions: updated }));
                            }}
                          >
                            {isAr ? 'حذف' : 'Remove'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="qedit-add-option"
                    style={{ marginTop: '0.5rem', background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.4)', color: '#a5b4fc' }}
                    onClick={() => {
                      const existing = questionForm.subQuestions || [];
                      const newId = `sq${Date.now()}`;
                      setQuestionForm(prev => ({
                        ...prev,
                        subQuestions: [...existing, { id: newId, textAr: '', textEn: '', correctAnswer: '', marks: 1 }]
                      }));
                    }}
                  >
                    + {isAr ? 'إضافة جمل / مصطلح' : 'Add Term / Prompt'}
                  </button>
                </div>
              )}

              {/* Options list */}
              {questionForm.type !== 'short_answer' && questionForm.type !== 'text' ? (
                <div className="qedit-field">
                  <label className="qedit-label">
                    {questionForm.type === 'matching'
                      ? ` ${isAr ? 'قائمة الإجابات المشترك (يتار الطالب منها لكل فراغ)' : 'Shared Answer Pool (student picks for each blank)'}`
                      : questionForm.type === 'multi_select'
                        ? ` ${isAr ? 'الخيارات — ضع على كل إجابة صحيح (يمكن أكثر من واحد)' : 'Options — check ALL correct answers (can be multiple)'}`
                        : ` ${isAr ? 'الخيارات — حدد الإجابة الصحيحة' : 'Options — select correct answer'}`
                    }
                  </label>
                  <div className="qedit-options-list">
                    {questionForm.options.map((opt, idx) => (
                      <div key={opt.id || idx} className={`qedit-option ${questionForm.type === 'multi_select'
                        ? ((questionForm.correctAnswer || '').split(',').filter(Boolean).includes(opt.id) ? 'qedit-option--correct' : '')
                        : (questionForm.correctAnswer === opt.id ? 'qedit-option--correct' : '')
                        }`}>
                        <div className="qedit-option-top">
                          <span className="qedit-opt-id">{(() => {
                            const txt = isAr ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr);
                            if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                            return String(idx + 1);
                          })()}</span>
                          {questionForm.type === 'multi_select' ? (
                            <label className="qedit-correct-label">
                              <input
                                type="checkbox"
                                checked={(questionForm.correctAnswer || '').split(',').filter(Boolean).includes(opt.id)}
                                onChange={() => {
                                  const current = (questionForm.correctAnswer || '').split(',').filter(Boolean);
                                  const updated = current.includes(opt.id)
                                    ? current.filter(id => id !== opt.id)
                                    : [...current, opt.id];
                                  setQuestionForm(prev => ({ ...prev, correctAnswer: updated.join(',') }));
                                }}
                              />
                              {isAr ? 'صحيح ' : 'Correct '}
                            </label>
                          ) : questionForm.type !== 'matching' ? (
                            <label className="qedit-correct-label">
                              <input
                                type="radio"
                                name="quizCorrectAnswer"
                                checked={questionForm.correctAnswer === opt.id}
                                onChange={() => setQuestionForm(prev => ({ ...prev, correctAnswer: opt.id }))}
                              />
                              {isAr ? 'صحيح ' : 'Correct '}
                            </label>
                          ) : null}
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginRight: isAr ? 'auto' : '0', marginLeft: isAr ? '0' : 'auto' }}>
                            <button
                              type="button"
                              className="qmanage-add-btn"
                              style={{ padding: '0.15rem 0.4rem', fontSize: '0.68rem' }}
                              onClick={async () => {
                                if (opt.textAr) {
                                  toast(isAr ? 'جاري الترجم...' : 'Translating...');
                                  const res = await translateText(opt.textAr, 'ar2en');
                                  if (res) { updateQuestionOption(idx, 'textEn', res); toast.success(isAr ? 'تمت الترجم!' : 'Translated!'); }
                                } else if (opt.textEn) {
                                  toast(isAr ? 'جاري الترجم...' : 'Translating...');
                                  const res = await translateText(opt.textEn, 'en2ar');
                                  if (res) { updateQuestionOption(idx, 'textAr', res); toast.success(isAr ? 'تمت الترجم!' : 'Translated!'); }
                                } else {
                                  toast.error(isAr ? 'اكتب نص الخيار أولاً' : 'Type option text first');
                                }
                              }}
                            >
                              {isAr ? 'ترجم' : 'Translate'}
                            </button>
                            {questionForm.type !== 'true_false' && questionForm.type !== 'matching' && (
                              <button className="qedit-opt-delete" style={{ margin: 0 }} onClick={() => deleteQuestionOption(idx)}></button>
                            )}
                          </div>
                        </div>
                        <input
                          className="qedit-opt-input"
                          value={opt.textAr || ''}
                          onChange={e => updateQuestionOption(idx, 'textAr', e.target.value)}
                          onPaste={e => handlePasteInOption(e, idx)}
                          placeholder={isAr ? 'نص الخيار عربي (اختياري)' : 'Arabic option text (optional)'}
                          dir="rtl"
                        />
                        <input
                          className="qedit-opt-input"
                          ref={el => { optionInputRefs.current[`${idx}-textEn`] = el; }}
                          value={opt.textEn || ''}
                          onChange={e => {
                            pushOptionHistory(idx, opt.textEn || '');
                            updateQuestionOption(idx, 'textEn', e.target.value);
                          }}
                          onPaste={e => handlePasteInOption(e, idx)}
                          onKeyDown={e => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                              e.preventDefault();
                              undoOptionChange(idx, 'textEn');
                            }
                          }}
                          placeholder="English option text"
                          dir="ltr"
                        />
                        {/* Live preview when HTML table is present */}
                        {(opt.textEn || '').includes('relation-table') && (
                          <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>{isAr ? ' معاين:' : ' Preview:'}</span>
                            <span dangerouslySetInnerHTML={{ __html: opt.textEn }} style={{ direction: 'ltr' }} />
                            <button
                              type="button"
                              className="qedit-opt-delete"
                              style={{ padding: '0.1rem 0.35rem', fontSize: '0.68rem', margin: 0, width: 'auto' }}
                              onClick={() => updateQuestionOption(idx, 'textEn', '')}
                            >
                              {isAr ? 'حذف الجدول' : 'Clear Table'}
                            </button>
                          </div>
                        )}
                        {/* ── Option formatting toolbar — all question types ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.4rem' }}>
                          <div className="qedit-opt-toolbar" style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* Undo */}
                            <button type="button"
                              onMouseDown={e => { e.preventDefault(); undoOptionChange(idx, 'textEn'); }}
                              title={isAr ? 'تراجع (Ctrl+Z)' : 'Undo (Ctrl+Z)'}
                              style={{ fontSize: '0.8rem', padding: '0.15rem 0.38rem', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>

                            </button>
                            <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                            {/* Bold / Italic / Underline / Code */}
                            {[['B', 'bold'], ['I', 'italic'], ['U', 'underline'], ['</>', 'code']].map(([lbl, tag]) => (
                              <button key={tag} type="button"
                                onMouseDown={e => { e.preventDefault(); insertFormatIntoOption(idx, 'textEn', tag); }}
                                style={{
                                  fontWeight: tag === 'bold' ? 'bold' : 'normal', fontStyle: tag === 'italic' ? 'italic' : 'normal',
                                  textDecoration: tag === 'underline' ? 'underline' : 'none', fontFamily: tag === 'code' ? 'monospace' : 'inherit',
                                  fontSize: '0.72rem', padding: '0.15rem 0.38rem', border: '1px solid rgba(255,255,255,0.15)',
                                  background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer', color: 'inherit'
                                }}>
                                {lbl}
                              </button>
                            ))}
                            <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                            {/* Text colors */}
                            {QUESTION_COLORS.map(c => (
                              <button key={c} type="button"
                                className="color-dot"
                                onMouseDown={e => { e.preventDefault(); insertFormatIntoOption(idx, 'textEn', 'color', c); }}
                                title={`Color ${c}`}
                                style={{ width: '14px', height: '14px', borderRadius: '50%', background: c, border: '2px solid rgba(255,255,255,0.3)', cursor: 'pointer', padding: 0 }} />
                            ))}
                            <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                            {/* Highlight colors */}
                            {HIGHLIGHT_COLORS.map(c => (
                              <button key={c} type="button"
                                className="color-dot"
                                onMouseDown={e => { e.preventDefault(); insertFormatIntoOption(idx, 'textEn', 'highlight', c); }}
                                title={`Highlight ${c}`}
                                style={{ width: '14px', height: '14px', borderRadius: '3px', background: c, border: '2px solid rgba(0,0,0,0.25)', cursor: 'pointer', padding: 0 }} />
                            ))}
                            <span style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)', margin: '0 0.1rem' }} />
                            {/* Relation table */}
                            <button type="button"
                              onClick={() => insertFormatIntoOption(idx, 'textEn', 'table')}
                              style={{ fontSize: '0.68rem', padding: '0.15rem 0.38rem', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer' }}>

                            </button>
                            {/* Image upload */}
                            <button type="button"
                              onClick={() => document.getElementById(`opt-file-input-${idx}`).click()}
                              style={{ fontSize: '0.68rem', padding: '0.15rem 0.38rem', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', cursor: 'pointer' }}>

                            </button>
                            <input type="file" id={`opt-file-input-${idx}`} accept="image/*"
                              style={{ display: 'none' }} onChange={(e) => handleOptionImageChange(idx, e)} />
                          </div>
                          {opt.image && (
                            <div className="qedit-opt-img-preview" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                              <img src={opt.image} alt="Option preview" style={{ maxHeight: '60px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
                              <button
                                type="button"
                                className="qedit-opt-delete"
                                style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', margin: 0, width: 'auto' }}
                                onClick={() => updateQuestionOption(idx, 'image', '')}
                              >
                                {isAr ? 'إزال الصور' : 'Remove Image'}
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Delete button for matching pool items */}
                        {questionForm.type === 'matching' && (
                          <button
                            type="button"
                            className="qedit-opt-delete"
                            style={{ margin: '0.2rem 0 0', alignSelf: 'flex-end' }}
                            onClick={() => deleteQuestionOption(idx)}
                          >
                            {isAr ? 'حذف' : 'Remove'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {questionForm.type !== 'true_false' && (
                    <button className="qedit-add-option" onClick={addQuestionOption}>
                      + {isAr
                        ? (questionForm.type === 'matching' ? 'إضافة للقائم' : 'إضافة يار')
                        : (questionForm.type === 'matching' ? 'Add to Pool' : 'Add Option')
                      }
                    </button>
                  )}
                </div>
              ) : questionForm.type === 'short_answer' ? (
                <div className="qedit-field" style={{ background: 'rgba(16,185,129,0.06)', borderRadius: '10px', padding: '0.8rem', border: '1px solid rgba(16,185,129,0.2)' }}>
                  <label className="qedit-label"> {isAr ? 'الإجابة الصحيحة المقبول' : 'Correct Accepted Answer'}</label>
                  <input
                    className="qedit-opt-input"
                    value={questionForm.correctAnswer || ''}
                    onChange={e => setQuestionForm(prev => ({ ...prev, correctAnswer: e.target.value }))}
                    placeholder={isAr ? 'اكتب الإجابة المطلوب هنا (مثال: عمان)' : 'Type accepted answer (e.g. Amman)'}
                    style={{ border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(0,0,0,0.15)' }}
                  />
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.4rem 0 0' }}>
                    {isAr ? 'ملاحظ: يمكنك فصل الإجابات البديل المقبول بفاصل عربي أو إنجليزي (مثال: عمان، عمان، عَمّان).' : 'Note: Separate alternative accepted spellings with commas.'}
                  </p>
                </div>
              ) : (
                <div className="qedit-field" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '10px', padding: '0.8rem', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                    {isAr ? 'هذا سؤال مقالي (Essay). لا يتطلب إعداد إجابة صحيح مسبق حيث يكتب الطالب فقر حر بيده ويتم تقييمها يدوياً.' : 'This is an Essay/Text question. No predefined correct answer is required, students type free text.'}
                  </p>
                </div>
              )}

              {/* Image device upload zone */}
              <div className="qedit-field">
                <label className="qedit-label"> {isAr ? 'صور السؤال (اختياري)' : 'Question Image (optional)'}</label>
                <input
                  ref={quizImageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      toast.error(isAr ? 'حجم الصورة يجب أن يكون أقل من 10 ميجا بايت' : 'Image must be under 10MB');
                      return;
                    }
                    setQuizImageUploading(true);
                    setQuizImageProgress(20);
                    try {
                      const compressed = await new Promise((resolve, reject) => {
                        const img = new Image();
                        const url = URL.createObjectURL(file);
                        img.onload = () => {
                          URL.revokeObjectURL(url);
                          const MAX = 800;
                          let w = img.width, h = img.height;
                          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                          const canvas = document.createElement('canvas');
                          canvas.width = w; canvas.height = h;
                          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                          resolve(canvas.toDataURL('image/jpeg', 0.78));
                        };
                        img.onerror = reject;
                        img.src = url;
                      });
                      setQuizImageProgress(100);
                      setQuestionForm(prev => ({ ...prev, image: compressed }));
                      toast.success(isAr ? ' تم تحميل الصور بنجاح' : ' Image loaded successfully');
                    } catch (err) {
                      console.error(err);
                      toast.error(isAr ? 'خطأ في معالجة الصورة' : 'Image processing error');
                    } finally {
                      setQuizImageUploading(false);
                      setQuizImageProgress(0);
                    }
                    e.target.value = '';
                  }}
                />
                {!questionForm.image && !quizImageUploading && (
                  <div className="qedit-image-dropzone" onClick={() => quizImageInputRef.current?.click()}>
                    <span style={{ fontSize: '2rem' }}></span>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem' }}>{isAr ? 'اضغط لاختيار صور من جهازك' : 'Click to choose an image from your device'}</p>
                  </div>
                )}
                {quizImageUploading && (
                  <div className="qedit-image-uploading">
                    <div className="qedit-upload-bar">
                      <div className="qedit-upload-bar-fill" style={{ width: `${quizImageProgress}%` }} />
                    </div>
                    <span>{isAr ? `جاري الرفع... ${quizImageProgress}%` : `Uploading... ${quizImageProgress}%`}</span>
                  </div>
                )}
                {questionForm.image && !quizImageUploading && (
                  <div style={{ marginTop: '0.6rem', textAlign: 'center' }}>
                    <img src={questionForm.image} alt="preview" style={{ maxHeight: '180px', maxWidth: '100%', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }} />
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                      <button className="qedit-add-option" style={{ width: 'auto', padding: '0.3rem 0.8rem' }} onClick={() => quizImageInputRef.current?.click()}> {isAr ? 'تغيير الصور' : 'Change Image'}</button>
                      <button className="qedit-opt-delete" onClick={() => setQuestionForm(prev => ({ ...prev, image: '' }))}>{isAr ? 'حذف ' : 'Remove '}</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="qedit-footer">
              <button className="qedit-btn-cancel" onClick={() => setShowQuestionModal(false)}>{isAr ? 'إلغاء' : 'Cancel'}</button>
              <button className="qedit-btn-save" onClick={saveQuestion}> {isAr ? 'حفظ السؤال' : 'Save Question'}</button>
            </div>
          </div>
        </div>
      {/* ══ Question Bank AI Assistant & Auditor Modal ══ */}
      {showQuestionBankTools && (
        <AdminQuestionBankTools
          allSubjects={allSubjects}
          allParts={allParts}
          selectedSubjectId={selectedSubjectId}
          selectedPartId={selectedPartId}
          onClose={() => setShowQuestionBankTools(false)}
          onQuestionsImported={() => {
            fetchDynamicQuizzes();
          }}
          isAr={isAr}
        />
      )}
    </>
  );
};

export default AdminDashboard;
