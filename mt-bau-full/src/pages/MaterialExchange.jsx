import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { db, storage } from '../config/firebase';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, updateDoc, setDoc, deleteDoc, limit, arrayUnion, onSnapshot, increment } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import toast from 'react-hot-toast';
import exchangeHero from '../assets/heros/exchange_hero.png';
import { sendDonationToSheets, sendBookingToSheets } from '../services/googleSheetsService';
import { saveCourseDonation, saveCourseBooking } from '../services/courseStatusService';
import emailjs from '@emailjs/browser';
import QRBookingCard from '../components/QRBookingCard';
import MaterialStatusChecker from '../components/MaterialStatusChecker';
import { sendAdminNotification } from '../services/notificationService';
import './MaterialExchange.css';



// Campaign timing is now dynamic — loaded from Firestore system_configs/global_settings

// ─── 2FA (TOTP) Helpers ───────────────────────────────────────────────────
function base32tohex(base32) {
    const base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    let hex = "";
    base32 = base32.replace(/=+$/, "");
    for (let i = 0; i < base32.length; i++) {
        const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
        if (val === -1) throw new Error("Invalid Base32 character");
        bits += val.toString(2).padStart(5, '0');
    }
    for (let i = 0; i + 4 <= bits.length; i += 4) {
        const chunk = bits.substr(i, 4);
        hex = hex + parseInt(chunk, 2).toString(16);
    }
    return hex;
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let c = 0; c < hex.length; c += 2) {
        bytes[c / 2] = parseInt(hex.substr(c, 2), 16);
    }
    return bytes;
}

async function getTOTPToken(secret, timeOffset = 0) {
    try {
        const secretClean = secret.replace(/\s+/g, '').toUpperCase();
        const keyBytes = hexToBytes(base32tohex(secretClean));

        const cryptoKey = await window.crypto.subtle.importKey(
            "raw",
            keyBytes,
            { name: "HMAC", hash: { name: "SHA-1" } },
            false,
            ["sign"]
        );

        const counter = Math.floor((Date.now() / 1000 + timeOffset) / 30);
        const counterBytes = new Uint8Array(8);
        let temp = counter;
        for (let i = 7; i >= 0; i--) {
            counterBytes[i] = temp & 0xff;
            temp = Math.floor(temp / 256);
        }

        const signature = await window.crypto.subtle.sign(
            "HMAC",
            cryptoKey,
            counterBytes
        );

        const digest = new Uint8Array(signature);
        const offset = digest[digest.length - 1] & 0xf;

        const binary =
            ((digest[offset] & 0x7f) << 24) |
            ((digest[offset + 1] & 0xff) << 16) |
            ((digest[offset + 2] & 0xff) << 8) |
            (digest[offset + 3] & 0xff);

        const otp = binary % 1000000;
        return otp.toString().padStart(6, '0');
    } catch (e) {
        console.error("Error generating TOTP token:", e);
        return "";
    }
}

function generateBase32Secret() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let secret = "";
    for (let i = 0; i < 16; i++) {
        secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
}

const STAFF_USERS = {
    admin: { role: 'admin', nameAr: 'الأدمن', nameEn: 'Admin', gender: null },
    ahmad: { role: 'coordinator', nameAr: 'أحمد', nameEn: 'Ahmad', gender: 'male' },
    sara: { role: 'coordinator', nameAr: 'سار', nameEn: 'Sara', gender: 'female' }
};

const DEMO_EXCHANGE_MATERIAL_PATTERNS = [
    /three easy pieces/i,
    /pfleeger/i,
    /tanenbaum/i,
    /artificial intelligence.*modern approach/i,
    /calculus.*early transcendentals/i,
    /physics for scientists and engineers/i,
    /oop.*java/i
];

function isDemoExchangeMaterial(materialName) {
    const name = String(materialName || '').trim();
    return DEMO_EXCHANGE_MATERIAL_PATTERNS.some((pattern) => pattern.test(name));
}

const MaterialExchange = ({ isEmbedded = false }) => {
    const { language, t } = useLanguage();
    const isAr = language === 'ar';

    // ── PUBLIC STATE ─────────────────────────────────────────────
    const [formData, setFormData] = useState({ studentName: '', phoneNumber: '', email: '', studentGender: '', materials: [] });
    const [currentMaterial, setCurrentMaterial] = useState({ name: '', description: '' });
    const [allMaterials, setAllMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [agreedToTerms, setAgreedToTerms] = useState(false);

    const [systemSettings, setSystemSettings] = useState({
        allowRegistration: true,
        campaignPhase: 'exchange',
        secretGatewayCode: 'makanak2025',
        exchangeSuspendedMessageAr: 'تفتح الحمل أبوابها مع بداي كل فصل دراسي جديد تزامناً مع فتر السحب والإضاف.',
        exchangeSuspendedMessageEn: 'It resumes at the start of each new semester during the add and drop period.',
        adminPassword: 'admin2024',
        ahmadPassword: 'ahmad2024',
        saraPassword: 'sara2024',
        ahmadNameAr: 'أحمد',
        ahmadNameEn: 'Ahmad',
        saraNameAr: 'سار',
        saraNameEn: 'Sara',
        ahmadEmail: '',
        saraEmail: '',
        ahmad2faSecret: '',
        sara2faSecret: '',
        admin2faSecret: '',
        ahmad2faEnabled: false,
        sara2faEnabled: false,
        admin2faEnabled: false,
        ahmadQrConfirmed: false,
        saraQrConfirmed: false,
        adminQrConfirmed: false,
        ahmadResetRequest: false,
        saraResetRequest: false,
        adminResetRequest: false,
        allowCoordinatorEditDelete: false,
        coordinatorPermissions: {
            ahmad: {
                editDonation: false,
                deleteDonation: false,
                completeBooking: false,
                cancelBooking: false
            },
            sara: {
                editDonation: false,
                deleteDonation: false,
                completeBooking: false,
                cancelBooking: false
            }
        },
        coordinatorMaleTasks: '',
        coordinatorFemaleTasks: '',
        sharedCoordinatorTasks: '',
        coordinatorMaleTasksV2: [],
        coordinatorFemaleTasksV2: [],
        sharedCoordinatorTasksV2: [],
        taskAutoDeleteHours: 24,
        donationEndTime: '',   // ISO datetime string — end of collection/donation period
        bookingStartTime: '',   // ISO datetime string — start of booking/exchange period
        workdayEnabled: false,
        workdayStart: '08:00',
        workdayEnd: '16:00',
        workdayNoticeAr: 'ارج أوقات الشغل اليومي، الطلبات تُراجع لاحقاً.',
        workdayNoticeEn: 'Outside working hours, requests are reviewed later.',
        isExchangeActive: true,
        donationFormFrozen: false,
        donationEnabled: true

    });
    const [showMaterialReportModal, setShowMaterialReportModal] = useState(false);
    const [materialReportData, setMaterialReportData] = useState(null);
    const [materialReportType, setMaterialReportType] = useState(null);
    const [reportPrinted, setReportPrinted] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [permissionsSelection, setPermissionsSelection] = useState('ahmad');
    const [bookingOpen, setBookingOpen] = useState(false);
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState(null);
    const [bookingData, setBookingData] = useState({ name: '', phone: '', gender: '' });
    const [preRequestForm, setPreRequestForm] = useState({ type: 'donate', studentName: '', phoneNumber: '', materialName: '', notes: '', agreedToPreRequestTerms: false });
    const [hasViewedTerms, setHasViewedTerms] = useState(false);
    const [preRequests, setPreRequests] = useState([]);
    const [preRequestLoading, setPreRequestLoading] = useState(false);

    const [coordinatorApplicationForm, setCoordinatorApplicationForm] = useState({ name: '', phoneNumber: '', email: '', motivation: '', agreedToCoordinatorTerms: false });
    const [coordinatorApplicationLoading, setCoordinatorApplicationLoading] = useState(false);

    // ── ADMIN / COORDINATOR FILTERS ──────────────────────────────
    const [adminSubFilter, setAdminSubFilter] = useState('all'); // 'all' | 'ahmad' | 'sara'
    const [coordinatorSubTab, setCoordinatorSubTab] = useState('delegated'); // 'main' | 'delegated'
    const [staffSubTab, setStaffSubTab] = useState('donations'); // 'donations' | 'bookings' | 'schedule'
    const [staffSearchQuery, setStaffSearchQuery] = useState('');

    // ── TASK MANAGEMENT STATE ──────────────────────────────────────
    // editTasksV2: local editable copies of the V2 task arrays while in settings
    const [editTasksV2, setEditTasksV2] = useState({
        shared: [],
        male: [],
        female: []
    });
    // newTaskDraft: text + image for the task currently being typed
    const [newTaskDraft, setNewTaskDraft] = useState({ shared: '', male: '', female: '' });
    const [newTaskImageDraft, setNewTaskImageDraft] = useState({ shared: null, male: null, female: null });
    const [taskImageUploading, setTaskImageUploading] = useState({ shared: false, male: false, female: false });
    const taskImageInputRefs = { shared: useRef(), male: useRef(), female: useRef() };


    // ── DELIVERY SCHEDULE STATE ───────────────────────────────────
    const [deliverySchedules, setDeliverySchedules] = useState([]);
    const [activeQRModal, setActiveQRModal] = useState(null);
    const [deliveryScheduleLoading, setDeliveryScheduleLoading] = useState(false);
    const [showAddScheduleForm, setShowAddScheduleForm] = useState(false);
    const [scheduleSearchQuery, setScheduleSearchQuery] = useState('');
    const [scheduleFormData, setScheduleFormData] = useState({
        donorName: '', donorPhone: '', bookerName: '', bookerPhone: '',
        materialName: '', pickupDate: '', pickupTime: '',
        assignedCoordinator: '', finalDeliveryBy: '', reminderMessage: '', notes: ''
    });
    const [scheduleFormLoading, setScheduleFormLoading] = useState(false);
    const [activeAddFormQuadrant, setActiveAddFormQuadrant] = useState(null);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [editScheduleFormData, setEditScheduleFormData] = useState({});
    const [editScheduleLoading, setEditScheduleLoading] = useState(false);
    const [customSections, setCustomSections] = useState(() => {
        try { return JSON.parse(localStorage.getItem('customDeliverySections') || '[]'); } catch { return []; }
    });
    const [showNewSectionForm, setShowNewSectionForm] = useState(false);
    const [newSectionData, setNewSectionData] = useState({ name: '', icon: '👤', color: '#2c3e50' });
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedDonationForEdit, setSelectedDonationForEdit] = useState(null);
    const [editCoordinatorNotes, setEditCoordinatorNotes] = useState('');
    const [showDelegateModal, setShowDelegateModal] = useState(false);
    const [donationToDelegate, setDonationToDelegate] = useState(null);
    const [showApprovalRequestsModal, setShowApprovalRequestsModal] = useState(false);
    const [selectedDonationForRequests, setSelectedDonationForRequests] = useState(null);

    // ── Action Request Modal State ──
    const [showActionRequestModal, setShowActionRequestModal] = useState(false);
    const [actionRequestData, setActionRequestData] = useState({
        donationId: null,
        actionType: null, // 'edit', 'delete', 'completeBooking', 'cancelBooking'
        materialIndex: null,
        donationDetails: null,
        coordinatorNotes: ''
    });

    // ── Admin Response Modal State ──
    const [showAdminResponseModal, setShowAdminResponseModal] = useState(false);
    const [adminResponseData, setAdminResponseData] = useState({
        donationId: null,
        request: null,
        adminAction: 'approve', // 'approve', 'reject', 'suspend'
        adminNotes: ''
    });



    // ── STAFF AUTH STATE ──────────────────────────────────────────
    const [loggedInUser, setLoggedInUser] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('exchange_staff')) || null; }
        catch { return null; }
    });
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [loginStep, setLoginStep] = useState(1); // 1 = secret code, 2 = credentials, 3 = email verification
    const [secretCodeInput, setSecretCodeInput] = useState('');
    const [secretCodeError, setSecretCodeError] = useState(false);
    const [loginForm, setLoginForm] = useState({ username: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showSecretCode, setShowSecretCode] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationCodeInput, setVerificationCodeInput] = useState('');
    const [verificationCodeError, setVerificationCodeError] = useState(false);
    const [pendingStaffKey, setPendingStaffKey] = useState('');
    const [pendingStaffEmail, setPendingStaffEmail] = useState('');
    const [pendingStaffName, setPendingStaffName] = useState('');

    // ── 2FA STAFF STATES ───────────────────────────────────────────
    const [pendingStaffTotpSecret, setPendingStaffTotpSecret] = useState('');
    const [totpCodeInput, setTotpCodeInput] = useState('');
    const [totpError, setTotpError] = useState(false);
    const [setup2faData, setSetup2faData] = useState(null);
    const [confirming2fa, setConfirming2fa] = useState(false);
    const [showQrInLogin, setShowQrInLogin] = useState(false);
    const [showResetInLogin, setShowResetInLogin] = useState(false);
    const [resetAdminPasswordInput, setResetAdminPasswordInput] = useState('');

    // ── CAPTCHA STATE ──────────────────────────────────────────────
    const [captchaText, setCaptchaText] = useState('');
    const [captchaInput, setCaptchaInput] = useState('');
    const [captchaError, setCaptchaError] = useState(false);
    const canvasRef = useRef(null);

    // New states and refs for student forms
    const [donationCaptchaText, setDonationCaptchaText] = useState('');
    const [donationCaptchaInput, setDonationCaptchaInput] = useState('');
    const [donationCaptchaError, setDonationCaptchaError] = useState(false);
    const donationCanvasRef = useRef(null);

    const [bookingCaptchaText, setBookingCaptchaText] = useState('');
    const [bookingCaptchaInput, setBookingCaptchaInput] = useState('');
    const [bookingCaptchaError, setBookingCaptchaError] = useState(false);
    const bookingCanvasRef = useRef(null);

    const SECRET_GATEWAY_CODE = 'makanak2025';

    // ── DASHBOARD STATE ───────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('donations');
    const [allDonations, setAllDonations] = useState([]);
    const [taskCompletions, setTaskCompletions] = useState({ ahmad: {}, sara: {} }); // { username: { taskKey: isoTimestamp } }
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [sectionSaving, setSectionSaving] = useState('');
    const [editSettings, setEditSettings] = useState({});

    // ── AUDIT LOG STATE ───────────────────────────────────────────
    const [auditLogs, setAuditLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [staffStatuses, setStaffStatuses] = useState({});
    const [statusesLoading, setStatusesLoading] = useState(false);
    const [logFilterOperator, setLogFilterOperator] = useState('all');
    const [logSearchQuery, setLogSearchQuery] = useState('');

    // ── ARCHIVE STATE ─────────────────────────────────────────────
    const [archives, setArchives] = useState([]);
    const [archiveName, setArchiveName] = useState('');
    const [showArchiveModal, setShowArchiveModal] = useState(false);
    const [selectedArchive, setSelectedArchive] = useState(null);
    const [archivesLoading, setArchivesLoading] = useState(false);
    const [deletedItems, setDeletedItems] = useState([]);
    const [deletedItemsLoading, setDeletedItemsLoading] = useState(false);

    // ── TERMS AND CONDITIONS VISIBILITY STATE ────────────────────
    const [showTermsDetails, setShowTermsDetails] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);

    const toggleTermsVisibility = () => {
        const nextState = !showTermsDetails;
        setShowTermsDetails(nextState);
        setShowTermsModal(nextState);
        setHasViewedTerms(true);
    };

    const generateCaptchaText = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const generateCaptcha = () => {
        const text = generateCaptchaText();
        setCaptchaText(text);
        setCaptchaInput('');
        setCaptchaError(false);
    };

    const generateDonationCaptcha = () => {
        const text = generateCaptchaText();
        setDonationCaptchaText(text);
        setDonationCaptchaInput('');
        setDonationCaptchaError(false);
        drawCaptchaOnCanvas(donationCanvasRef.current, text);
    };

    const generateBookingCaptcha = () => {
        const text = generateCaptchaText();
        setBookingCaptchaText(text);
        setBookingCaptchaInput('');
        setBookingCaptchaError(false);
        drawCaptchaOnCanvas(bookingCanvasRef.current, text);
    };

    const drawCaptchaOnCanvas = (canvas, text) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        ctx.fillStyle = isDark ? '#1f2937' : '#f3f4f6';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;
        const gridSize = 15;
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)';
        for (let i = 0; i < 6; i++) {
            ctx.lineWidth = 1.5 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
            ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
            ctx.stroke();
        }

        ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
        for (let i = 0; i < 40; i++) {
            ctx.beginPath();
            ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 1 + Math.random() * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        const fontSize = Math.floor(canvas.height * 0.55);
        ctx.font = `bold ${fontSize}px Courier New, monospace`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const colors = isDark
            ? ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7', '#a29bfe', '#ff9ff3', '#00d2d3']
            : ['#d63031', '#0984e3', '#00b894', '#fdcb6e', '#6c5ce7', '#db0a5b', '#018576'];

        const charSpacing = canvas.width / (text.length + 1);

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];

            ctx.save();
            const x = charSpacing * 0.85 + i * charSpacing + (Math.random() - 0.5) * (charSpacing * 0.15);
            const y = canvas.height / 2 + (Math.random() - 0.5) * (canvas.height * 0.12);
            const angle = (Math.random() - 0.5) * 0.35;

            ctx.translate(x, y);
            ctx.rotate(angle);

            const scaleX = 0.9 + Math.random() * 0.2;
            const scaleY = 0.9 + Math.random() * 0.2;
            ctx.scale(scaleX, scaleY);

            ctx.fillText(char, 0, 0);
            ctx.restore();
        }
    };

    const drawCaptcha = () => drawCaptchaOnCanvas(canvasRef.current, captchaText);
    const drawDonationCaptcha = () => drawCaptchaOnCanvas(donationCanvasRef.current, donationCaptchaText);
    const drawBookingCaptcha = () => drawCaptchaOnCanvas(bookingCanvasRef.current, bookingCaptchaText);
    // ── EFFECTS ───────────────────────────────────────────────────
    useEffect(() => {
        const targetISO = systemSettings.bookingStartTime || systemSettings.donationEndTime || '';
        const calculateTimeLeft = () => {
            if (!targetISO) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
                return;
            }
            const now = new Date();
            const target = new Date(targetISO);
            const difference = target - now;
            if (difference > 0) {
                setTimeLeft({
                    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                    minutes: Math.floor((difference / 1000 / 60) % 60),
                    seconds: Math.floor((difference / 1000) % 60)
                });
            } else {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };
        const timer = setInterval(calculateTimeLeft, 1000);
        calculateTimeLeft();
        return () => clearInterval(timer);
    }, [systemSettings.bookingStartTime, systemSettings.donationEndTime]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const settingsRef = doc(db, 'system_configs', 'global_settings');
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let phase = data.campaignPhase || 'exchange';
                    if (phase === 'booking') phase = 'exchange';
                    if (phase === 'donation') phase = 'collection';
                    const campaignEnabled = data.exchange_campaign_enabled !== undefined
                        ? Boolean(data.exchange_campaign_enabled)
                        : phase !== 'suspended';
                    const bookingEnabled = data.exchange_booking_enabled !== undefined
                        ? Boolean(data.exchange_booking_enabled)
                        : phase === 'exchange';
                    const donationEnabled = data.exchange_donation_enabled !== undefined
                        ? Boolean(data.exchange_donation_enabled)
                        : !Boolean(data.donationFormFrozen);
                    const statusCheckerEnabled = data.material_status_checker_enabled === true || data.material_status_checker_enabled === '1' || data.material_status_checker_enabled === 1;
                    setSystemSettings(prev => ({
                        ...prev,
                        campaignPhase: phase,
                        allowRegistration: data.allow_registration !== undefined ? Boolean(data.allow_registration) : true,
                        isExchangeActive: campaignEnabled,
                        materialStatusCheckerEnabled: statusCheckerEnabled,
                        secretGatewayCode: data.secretGatewayCode || 'makanak2025',
                        exchangeSuspendedMessageAr: data.exchangeSuspendedMessageAr || prev.exchangeSuspendedMessageAr,
                        exchangeSuspendedMessageEn: data.exchangeSuspendedMessageEn || prev.exchangeSuspendedMessageEn,
                        adminPassword: data.adminPassword || prev.adminPassword,
                        ahmadPassword: data.ahmadPassword || prev.ahmadPassword,
                        saraPassword: data.saraPassword || prev.saraPassword,
                        ahmadNameAr: data.ahmadNameAr || prev.ahmadNameAr,
                        ahmadNameEn: data.ahmadNameEn || prev.ahmadNameEn,
                        saraNameAr: data.saraNameAr || prev.saraNameAr,
                        saraNameEn: data.saraNameEn || prev.saraNameEn,
                        ahmadEmail: data.ahmadEmail || '',
                        saraEmail: data.saraEmail || '',
                        allowCoordinatorEditDelete: data.allowCoordinatorEditDelete !== undefined ? data.allowCoordinatorEditDelete : false,
                        coordinatorPermissions: data.coordinatorPermissions || {
                            ahmad: {
                                editDonation: false,
                                deleteDonation: false,
                                completeBooking: false,
                                cancelBooking: false
                            },
                            sara: {
                                editDonation: false,
                                deleteDonation: false,
                                completeBooking: false,
                                cancelBooking: false
                            }
                        },
                        coordinatorMaleTasks: data.coordinatorMaleTasks || '',
                        coordinatorFemaleTasks: data.coordinatorFemaleTasks || '',
                        sharedCoordinatorTasks: data.sharedCoordinatorTasks || '',
                        coordinatorMaleTasksV2: data.coordinatorMaleTasksV2 || [],
                        coordinatorFemaleTasksV2: data.coordinatorFemaleTasksV2 || [],
                        sharedCoordinatorTasksV2: data.sharedCoordinatorTasksV2 || [],
                        taskAutoDeleteHours: data.taskAutoDeleteHours !== undefined ? Number(data.taskAutoDeleteHours) : 24,
                        donationFormFrozen: !donationEnabled,
                        donationEnabled,
                        donationEndTime: data.donationEndTime || '',
                        bookingStartTime: data.bookingStartTime || '',
                        workdayEnabled: data.workdayEnabled !== undefined ? Boolean(data.workdayEnabled) : false,
                        workdayStart: data.workdayStart || '08:00',
                        workdayEnd: data.workdayEnd || '16:00',
                        workdayNoticeAr: data.workdayNoticeAr || 'ارج أوقات الشغل اليومي، الطلبات تُراجع لاحقاً.',
                        workdayNoticeEn: data.workdayNoticeEn || 'Outside working hours, requests are reviewed later.',
                        ahmad2faSecret: data.ahmad2faSecret || '',
                        sara2faSecret: data.sara2faSecret || '',
                        admin2faSecret: data.admin2faSecret || '',
                        ahmad2faEnabled: data.ahmad2faEnabled || false,
                        sara2faEnabled: data.sara2faEnabled || false,
                        admin2faEnabled: data.admin2faEnabled || false,
                        ahmadQrConfirmed: data.ahmadQrConfirmed || false,
                        saraQrConfirmed: data.saraQrConfirmed || false,
                        adminQrConfirmed: data.adminQrConfirmed || false,
                        ahmadResetRequest: data.ahmadResetRequest || false,
                        saraResetRequest: data.saraResetRequest || false,
                        adminResetRequest: data.adminResetRequest || false
                    }));
                    // Load task completions (with auto-delete of old entries)
                    const rawCompletions = data.taskCompletions || { ahmad: {}, sara: {} };
                    const autoDeleteHours = data.taskAutoDeleteHours !== undefined ? Number(data.taskAutoDeleteHours) : 24;
                    const cutoff = Date.now() - autoDeleteHours * 3600 * 1000;
                    const cleaned = {};
                    for (const [user, tasks] of Object.entries(rawCompletions)) {
                        cleaned[user] = {};
                        for (const [key, ts] of Object.entries(tasks)) {
                            if (new Date(ts).getTime() >= cutoff) cleaned[user][key] = ts;
                        }
                    }
                    setTaskCompletions(cleaned);
                    setBookingOpen(campaignEnabled && bookingEnabled);
                    setEditSettings({
                        campaignPhase: phase,
                        secretGatewayCode: data.secretGatewayCode || 'makanak2025',
                        adminPassword: data.adminPassword || 'admin2024',
                        ahmadPassword: data.ahmadPassword || 'ahmad2024',
                        saraPassword: data.saraPassword || 'sara2024',
                        ahmadNameAr: data.ahmadNameAr || 'أحمد',
                        ahmadNameEn: data.ahmadNameEn || 'Ahmad',
                        saraNameAr: data.saraNameAr || 'سار',
                        saraNameEn: data.saraNameEn || 'Sara',
                        ahmadEmail: data.ahmadEmail || '',
                        saraEmail: data.saraEmail || '',
                        ahmad2faSecret: data.ahmad2faSecret || '',
                        sara2faSecret: data.sara2faSecret || '',
                        admin2faSecret: data.admin2faSecret || '',
                        ahmad2faEnabled: data.ahmad2faEnabled || false,
                        sara2faEnabled: data.sara2faEnabled || false,
                        admin2faEnabled: data.admin2faEnabled || false,
                        ahmadQrConfirmed: data.ahmadQrConfirmed || false,
                        saraQrConfirmed: data.saraQrConfirmed || false,
                        adminQrConfirmed: data.adminQrConfirmed || false,
                        ahmadResetRequest: data.ahmadResetRequest || false,
                        saraResetRequest: data.saraResetRequest || false,
                        adminResetRequest: data.adminResetRequest || false,
                        allowCoordinatorEditDelete: data.allowCoordinatorEditDelete !== undefined ? data.allowCoordinatorEditDelete : false,
                        coordinatorPermissions: data.coordinatorPermissions || {
                            ahmad: {
                                editDonation: false,
                                deleteDonation: false,
                                completeBooking: false,
                                cancelBooking: false
                            },
                            sara: {
                                editDonation: false,
                                deleteDonation: false,
                                completeBooking: false,
                                cancelBooking: false
                            }
                        },
                        coordinatorMaleTasks: data.coordinatorMaleTasks || '',
                        coordinatorFemaleTasks: data.coordinatorFemaleTasks || '',
                        sharedCoordinatorTasks: data.sharedCoordinatorTasks || '',
                        coordinatorMaleTasksV2: data.coordinatorMaleTasksV2 || [],
                        coordinatorFemaleTasksV2: data.coordinatorFemaleTasksV2 || [],
                        sharedCoordinatorTasksV2: data.sharedCoordinatorTasksV2 || [],
                        taskAutoDeleteHours: data.taskAutoDeleteHours !== undefined ? Number(data.taskAutoDeleteHours) : 24,
                        exchangeSuspendedMessageAr: data.exchangeSuspendedMessageAr || '',
                        exchangeSuspendedMessageEn: data.exchangeSuspendedMessageEn || '',
                        donationEndTime: data.donationEndTime || '',
                        bookingStartTime: data.bookingStartTime || '',
                        taskCompletions: data.taskCompletions || { ahmad: {}, sara: {} }
                    });
                    // Sync V2 task arrays into editTasksV2
                    setEditTasksV2({
                        shared: data.sharedCoordinatorTasksV2 || [],
                        male: data.coordinatorMaleTasksV2 || [],
                        female: data.coordinatorFemaleTasksV2 || []
                    });
                }
            } catch (error) {
                console.error('Error fetching settings:', error);
            } finally {
                setSettingsLoaded(true);
            }
        };
        fetchSettings();
        fetchDonations();
        fetchArchives();
        fetchDeletedItems();
    }, []);

    useEffect(() => {
        const settingsRef = doc(db, 'system_configs', 'global_settings');
        const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            let phase = data.campaignPhase || 'exchange';
            if (phase === 'booking') phase = 'exchange';
            if (phase === 'donation') phase = 'collection';
            const campaignEnabled = data.exchange_campaign_enabled !== undefined
                ? Boolean(data.exchange_campaign_enabled)
                : phase !== 'suspended';
            const bookingEnabled = data.exchange_booking_enabled !== undefined
                ? Boolean(data.exchange_booking_enabled)
                : phase === 'exchange';
            const donationEnabled = data.exchange_donation_enabled !== undefined
                ? Boolean(data.exchange_donation_enabled)
                : !Boolean(data.donationFormFrozen);
            setSystemSettings(prev => ({
                ...prev,
                campaignPhase: phase,
                isExchangeActive: campaignEnabled,
                donationFormFrozen: !donationEnabled,
                donationEnabled
            }));
            setBookingOpen(campaignEnabled && bookingEnabled);
        }, (error) => {
            console.error('Error listening to campaign settings:', error);
        });
        return unsubscribe;
    }, []);

    // Derived at top level so useEffect hooks can access it
    const isAdminUser = loggedInUser?.role === 'admin';

    useEffect(() => {
        if (loggedInUser) {
            fetchAllDonations();
            fetchDeliverySchedules();
            if (isAdminUser) fetchAuditLogs();
        }
    }, [loggedInUser, isAdminUser]);

    useEffect(() => {
        if (!loggedInUser) {
            setPreRequests([]);
            return;
        }

        const unsubscribe = onSnapshot(collection(db, 'materialPreRequests'), (snapshot) => {
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            requestsData.sort((a, b) => {
                const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return bTime - aTime;
            });
            setPreRequests(requestsData);
        }, (error) => {
            console.error('Error fetching pre-requests:', error);
        });

        return () => unsubscribe();
    }, [loggedInUser]);

    useEffect(() => {
        if (activeTab === 'logs' && isAdminUser) {
            fetchAuditLogs();
        }
    }, [activeTab, isAdminUser]);

    useEffect(() => {
        const handleOpenStaffLogin = () => {
            setShowLoginModal(true);
            setLoginStep(2); // Go directly to username/password form
            setLoginError('');
            setLoginForm({ username: '', password: '' });
            setCaptchaInput('');
            setCaptchaError(false);
        };
        window.addEventListener('open-staff-login', handleOpenStaffLogin);
        return () => {
            window.removeEventListener('open-staff-login', handleOpenStaffLogin);
        };
    }, []);

    useEffect(() => {
        if (showLoginModal && loginStep === 2) {
            generateCaptcha();
        }
    }, [showLoginModal, loginStep]);

    const generateVerificationCode = () => {
        return Math.floor(100000 + Math.random() * 900000).toString();
    };

    const maskEmail = (email) => {
        if (!email) return '';
        const [local, domain] = email.split('@');
        if (!domain) return email;
        const visiblePart = local.slice(0, 2);
        return `${visiblePart}***@${domain}`;
    };

    const sendStaffVerificationCodeEmail = async (email, staffName, code) => {
        const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
        const templateId = import.meta.env.VITE_EMAILJS_LOGIN_TEMPLATE_ID || import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
        const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

        if (!serviceId || !templateId || !publicKey) {
            console.warn('EmailJS login verification environment variables are missing. Verification email will not be sent.');
            return false;
        }

        const templateParams = {
            to_name: staffName,
            to_email: email,
            verification_code: code,
            subject: isAr ? 'رمز التحقق لتسجيل دخول المنسق' : 'Coordinator login verification code',
            message: isAr
                ? `رمز التحقق الخاص بك هو ${code}. الرجاء إدخاله لإكمال تسجيل الدخول.`
                : `Your verification code is ${code}. Please enter it to complete login.`
        };

        try {
            await emailjs.send(serviceId, templateId, templateParams, publicKey);
            return true;
        } catch (error) {
            console.error('Email verification send failed:', error);
            return false;
        }
    };

    useEffect(() => {
        if (showLoginModal && loginStep === 2 && captchaText) {
            drawCaptcha();
        }
    }, [captchaText, showLoginModal, loginStep]);

    // Student Captcha Hooks
    useEffect(() => {
        if (showBookingModal) {
            generateBookingCaptcha();
        }
    }, [showBookingModal]);

    useEffect(() => {
        if (showBookingModal && bookingCaptchaText && bookingCanvasRef.current) {
            drawBookingCaptcha();
        }
    }, [bookingCaptchaText, showBookingModal]);

    // Update staff status (online & lastSeen & active tab & idle state) with high precision
    useEffect(() => {
        if (!loggedInUser) return;

        let lastActivity = Date.now();
        let currentStatusState = 'active'; // 'active' | 'idle'

        const updateStatus = async (isOnline = true, overrideState = null) => {
            try {
                const statusStateVal = overrideState || currentStatusState;
                const statusRef = doc(db, 'staff_status', loggedInUser.username);
                // NOTE: lastLogin is NOT updated here — it is only written at the actual login event.
                // This ping only keeps presence/activity data fresh.
                await setDoc(statusRef, {
                    online: isOnline,
                    statusState: isOnline ? statusStateVal : 'offline',
                    currentTab: activeTab || 'donations',
                    lastSeen: Date.now(),
                    username: loggedInUser.username,
                    nameAr: loggedInUser.nameAr || loggedInUser.username,
                    nameEn: loggedInUser.nameEn || loggedInUser.username,
                    role: loggedInUser.role || 'coordinator'
                }, { merge: true });
            } catch (e) {
                console.error("Error updating staff status:", e);
            }
        };

        // Update immediately on mount / tab change
        updateStatus(true);

        // Keep-alive ping every 30 seconds
        const pingInterval = setInterval(() => {
            updateStatus(true);
        }, 30000);

        // User activity listeners
        const recordActivity = () => {
            lastActivity = Date.now();
            if (currentStatusState === 'idle') {
                currentStatusState = 'active';
                // Update Firestore immediately to reflect active status
                updateStatus(true, 'active');
            }
        };

        window.addEventListener('mousemove', recordActivity);
        window.addEventListener('keydown', recordActivity);
        window.addEventListener('scroll', recordActivity);
        window.addEventListener('click', recordActivity);

        // Check for idleness every 10 seconds
        const idleCheckInterval = setInterval(() => {
            const idleTime = Date.now() - lastActivity;
            if (idleTime > 90000) { // 1.5 minutes
                if (currentStatusState === 'active') {
                    currentStatusState = 'idle';
                    updateStatus(true, 'idle');
                }
            }
        }, 10000);

        // Set offline when user closes the tab / window or logs out
        const handleUnload = () => {
            const statusRef = doc(db, 'staff_status', loggedInUser.username);
            updateDoc(statusRef, {
                online: false,
                statusState: 'offline',
                lastSeen: Date.now()
            }).catch(console.error);
        };

        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearInterval(pingInterval);
            clearInterval(idleCheckInterval);
            window.removeEventListener('mousemove', recordActivity);
            window.removeEventListener('keydown', recordActivity);
            window.removeEventListener('scroll', recordActivity);
            window.removeEventListener('click', recordActivity);
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [loggedInUser, activeTab]);

    // Real-time listener for staff statuses (replaces getDocs polling)
    useEffect(() => {
        if (!isAdminUser) return;
        const unsubscribe = onSnapshot(
            collection(db, 'staff_status'),
            (snapshot) => {
                const statuses = {};
                snapshot.docs.forEach(d => { statuses[d.id] = d.data(); });
                setStaffStatuses(statuses);
            },
            (err) => console.error('staff_status listener error:', err)
        );
        return () => unsubscribe();
    }, [isAdminUser]);

    // Real-time listener for audit logs (replaces getDocs polling)
    useEffect(() => {
        if (activeTab !== 'coordinators' || !isAdminUser) return;
        setLogsLoading(true);
        const q = query(
            collection(db, 'materialExchangeLogs'),
            orderBy('timestamp', 'desc'),
            limit(200)
        );
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                setAuditLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setLogsLoading(false);
            },
            (err) => {
                console.error('materialExchangeLogs listener error:', err);
                setLogsLoading(false);
            }
        );
        return () => unsubscribe();
    }, [activeTab, isAdminUser]);

    // ── EMAILJS NOTIFICATION FUNCTION ────────────────────────────
    const sendCoordinatorEmailNotification = async (type, data) => {
        const gender = data.studentGender || data.gender;
        const coordEmail = gender === 'female'
            ? systemSettings.saraEmail
            : systemSettings.ahmadEmail;
        const coordName = gender === 'female'
            ? (systemSettings.saraNameAr || 'سار')
            : (systemSettings.ahmadNameAr || 'أحمد');

        if (!coordEmail) {
            console.log('No email configured for this coordinator. Skipping notification.');
            return;
        }

        const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
        const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
        const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

        if (!serviceId || !templateId || !publicKey) {
            console.warn('EmailJS environment variables are missing.');
            return;
        }

        const isDonation = type === 'donation';
        const actionText = isDonation ? 'تبرع جديد بمواد دراسية' : 'حجز جديد لماد دراسي';

        let detailsText = '';
        if (isDonation) {
            detailsText = `المواد المختبرع بها:\n` + (data.materials || []).map((m, i) => `${i + 1}. ${typeof m === 'object' ? m.name : m}`).join('\n');
        } else {
            detailsText = `المادة المحجوز: ${data.materialName}\nصاحب المادة (المختبرع): ${data.donorName} (${data.donorPhone})`;
        }

        const templateParams = {
            to_name: coordName,
            to_email: coordEmail,
            student_name: data.studentName,
            student_phone: data.phoneNumber || data.phone || 'غير متوفر',
            student_gender: gender === 'female' ? 'أنثى' : 'ذكر',
            action_type: actionText,
            details: detailsText,
            message: `مرحباً ${coordName}،\n\nيوجد ${actionText} في منصتك الجامعية.\n\nتفاصيل الطالب:\n- الاسم: ${data.studentName}\n- الهاتف: ${data.phoneNumber || data.phone || 'غير متوفر'}\n\n${detailsText}\n\nيرجى الدخول إلى لوحة التحكم للمتابعة والتنسيق.`
        };

        try {
            await emailjs.send(serviceId, templateId, templateParams, publicKey);
            console.log(`Notification email sent successfully to ${coordName} (${coordEmail})`);
        } catch (error) {
            console.error('Failed to send notification email:', error);
        }
    };

    // ── PUBLIC FUNCTIONS ──────────────────────────────────────────
    const toEnglishNumerals = (str) => {
        const ar = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', ''];
        const en = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        let result = str;
        ar.forEach((a, i) => { result = result.replace(new RegExp(a, 'g'), en[i]); });
        return result;
    };

    const fetchDonations = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'materialDonations'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            const donationsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const materialsList = donationsData.flatMap(donation => {
                const materials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                return materials.map((m, idx) => {
                    const materialObj = typeof m === 'object' && m !== null ? { ...m } : { name: m };
                    const status = materialObj.status || (materialObj.takerInfo ? 'reserved' : donation.status);
                    materialObj.status = status;
                    return {
                        ...donation,
                        materialItem: materialObj,
                        originalIndex: idx,
                        uniqueKey: `${donation.id}-${idx}`,
                        materialName: materialObj.name,
                        isReserved: status === 'reserved' || status === 'completed'
                    };
                });
            });
            setAllMaterials(materialsList.filter((material) => !isDemoExchangeMaterial(material.materialName)));
        } catch (error) {
            console.error('Error fetching donations:', error);
            if (error.code === 'permission-denied') {
                toast.error(isAr ? 'خطأ في الصلاحيات' : 'Permission Error');
            } else {
                toast.error(isAr ? 'فشل في تحميل البيانات' : 'Failed to fetch donations');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchAllDonations = async () => {
        setDashboardLoading(true);
        try {
            const q = query(collection(db, 'materialDonations'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            setAllDonations(snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(item => !item.deleted));
        } catch (error) {
            console.error('Error fetching all donations:', error);
        } finally {
            setDashboardLoading(false);
        }
    };

    const handleDashboardRefresh = async () => {
        setDashboardLoading(true);
        try {
            await Promise.all([
                fetchAllDonations(),
                fetchDeliverySchedules(),
                loggedInUser ? fetchAuditLogs() : Promise.resolve(),
                loggedInUser ? fetchArchives() : Promise.resolve()
            ]);
        } catch (error) {
            console.error('Error refreshing dashboard:', error);
        } finally {
            setDashboardLoading(false);
        }
    };

    // ── DELIVERY SCHEDULE FUNCTIONS ───────────────────────────────
    const fetchDeliverySchedules = async () => {
        setDeliveryScheduleLoading(true);
        try {
            const q = query(collection(db, 'deliverySchedules'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            setDeliverySchedules(snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(item => !item.deleted));
        } catch (error) {
            console.error('Error fetching delivery schedules:', error);
        } finally {
            setDeliveryScheduleLoading(false);
        }
    };

    const handleAddDeliverySchedule = async () => {
        const { donorName, materialName, pickupDate, assignedCoordinator } = scheduleFormData;
        if (!donorName.trim() || !materialName.trim() || !pickupDate || !assignedCoordinator) {
            toast.error(isAr ? '⚠️ يرجى ملء الحقول المطلوب (الاسم، المادة، التاريخ، المنسق)' : '⚠️ Please fill required fields');
            return;
        }
        setScheduleFormLoading(true);
        try {
            await addDoc(collection(db, 'deliverySchedules'), {
                donorName: scheduleFormData.donorName.trim(),
                donorPhone: scheduleFormData.donorPhone.trim(),
                materialName: scheduleFormData.materialName.trim(),
                pickupDate: scheduleFormData.pickupDate,
                pickupTime: scheduleFormData.pickupTime,
                assignedCoordinator: scheduleFormData.assignedCoordinator,
                reminderMessage: scheduleFormData.reminderMessage.trim(),
                notes: scheduleFormData.notes.trim(),
                status: 'pending_contact',
                bookerName: scheduleFormData.bookerName?.trim() || '',
                bookerPhone: scheduleFormData.bookerPhone?.trim() || '',
                finalDeliveryBy: scheduleFormData.finalDeliveryBy || '',
                createdBy: loggedInUser?.username || 'unknown',
                createdAt: serverTimestamp()
            });
            toast.success(isAr ? '✅ تم إضاف موعد التسليم' : '✅ Delivery schedule added');
            setScheduleFormData({ donorName: '', donorPhone: '', bookerName: '', bookerPhone: '', materialName: '', pickupDate: '', pickupTime: '', assignedCoordinator: '', finalDeliveryBy: '', reminderMessage: '', notes: '' });
            setActiveAddFormQuadrant(null);
            await fetchDeliverySchedules();
        } catch (error) {
            console.error('Error adding schedule:', error);
            toast.error(isAr ? '❌ حدث خطأ أثناء الإضاف' : '❌ Error adding schedule');
        } finally {
            setScheduleFormLoading(false);
        }
    };

    const generateBookerWhatsAppLink = (schedule) => {
        const phone = String(schedule.bookerPhone || '').replace(/\D/g, '');
        if (!phone) return '#';
        const dateStr = schedule.pickupDate
            ? new Date(schedule.pickupDate + 'T00:00:00').toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            : '';
        const msg = isAr
            ? `السلام عليكم ${schedule.bookerName || ''}،\n\nنُذكّرك بأن مادة "${schedule.materialName}" ستكون جاهز للاستلام ${dateStr ? `يوم ${dateStr}` : 'قريباً'}.\n\nيرجى الحضور في الوقت المحدد.\n\nشكراً — فريق حمل تبادل المواد 📚`
            : `Hello ${schedule.bookerName || ''},\n\nReminder: "${schedule.materialName}" will be ready for pickup ${dateStr ? `on ${dateStr}` : 'soon'}.\n\nPlease come at the scheduled time.\n\nThank you — Material Exchange Team 📚`;
        return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    };

    const handleUpdateScheduleDetails = async () => {
        if (!editingSchedule) return;
        setEditScheduleLoading(true);
        try {
            const updates = {
                donorName: editScheduleFormData.donorName?.trim() || editingSchedule.donorName,
                donorPhone: editScheduleFormData.donorPhone?.trim() || '',
                bookerName: editScheduleFormData.bookerName?.trim() || '',
                bookerPhone: editScheduleFormData.bookerPhone?.trim() || '',
                materialName: editScheduleFormData.materialName?.trim() || editingSchedule.materialName,
                pickupDate: editScheduleFormData.pickupDate || '',
                pickupTime: editScheduleFormData.pickupTime || '',
                assignedCoordinator: editScheduleFormData.assignedCoordinator || '',
                finalDeliveryBy: editScheduleFormData.finalDeliveryBy || '',
                notes: editScheduleFormData.notes?.trim() || '',
                reminderMessage: editScheduleFormData.reminderMessage?.trim() || '',
                updatedAt: serverTimestamp(),
                updatedBy: loggedInUser?.username || 'unknown'
            };
            await updateDoc(doc(db, 'deliverySchedules', editingSchedule.id), updates);
            setDeliverySchedules(prev => prev.map(s => s.id === editingSchedule.id ? { ...s, ...updates } : s));
            toast.success(isAr ? '✅ تم تحديث الموعد بنجاح' : '✅ Schedule updated');
            setEditingSchedule(null);
        } catch (error) {
            console.error('Error updating schedule:', error);
            toast.error(isAr ? '❌ خطأ في التحديث' : '❌ Error updating schedule');
        } finally {
            setEditScheduleLoading(false);
        }
    };

    const handleUpdateScheduleStatus = async (scheduleId, newStatus) => {
        try {
            const nowTime = new Date();
            const updatePayload = { status: newStatus, updatedAt: serverTimestamp(), updatedBy: loggedInUser?.username || 'unknown' };
            // Save exact delivery timestamp when marking as completed
            if (newStatus === 'completed') {
                updatePayload.completedAt = serverTimestamp();
            }
            await updateDoc(doc(db, 'deliverySchedules', scheduleId), updatePayload);
            setDeliverySchedules(prev => prev.map(s => {
                if (s.id !== scheduleId) return s;
                const updated = { ...s, status: newStatus };
                if (newStatus === 'completed') updated.completedAt = nowTime;
                return updated;
            }));
            const labels = { pending_contact: isAr ? 'قيد الانتظار' : 'Pending', contacted: isAr ? 'تم التواصل' : 'Contacted', scheduled: isAr ? 'مؤكد' : 'Scheduled', completed: isAr ? 'مُسلّم' : 'Completed' };
            toast.success(isAr ? `✅ تم تغيير الحال إلى: ${labels[newStatus] || newStatus}` : `✅ Status updated to: ${labels[newStatus] || newStatus}`);
        } catch (error) {
            console.error('Error updating schedule status:', error);
            toast.error(isAr ? '❌ خطأ في تحديث الحال' : '❌ Error updating status');
        }
    };

    const handleDeleteSchedule = async (scheduleId) => {
        const confirmMsg = isAr ? 'هل أنت متأكد من حذف هذا الموعد؟' : 'Delete this schedule entry?';
        if (!window.confirm(confirmMsg)) return;
        try {
            const schedule = deliverySchedules.find(item => item.id === scheduleId);
            if (!schedule) return;
            if (loggedInUser?.role !== 'admin') {
                if (schedule.adminApprovalRequests?.some(request => request.type === 'deleteSchedule' && request.status === 'pending')) {
                    toast.info(isAr ? 'طلب حذف الموعد قيد الانتظار بالفعل' : 'A deletion request for this schedule is already pending');
                    return;
                }
                await updateDoc(doc(db, 'deliverySchedules', scheduleId), {
                    adminApprovalRequests: arrayUnion({
                        requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        type: 'deleteSchedule',
                        recordCollection: 'deliverySchedules',
                        requestedBy: loggedInUser.username,
                        requestedByName: loggedInUser.nameAr || loggedInUser.nameEn || loggedInUser.username,
                        requestedAt: new Date(),
                        status: 'pending'
                    })
                });
                toast.success(isAr ? 'تم إرسال طلب حذف الموعد للإدارة العامة' : 'Schedule deletion request sent to the general administration');
                fetchDeliverySchedules();
                return;
            }
            await moveToDeletedItems('deliverySchedules', scheduleId, schedule, 'schedule-deletion');
            setDeliverySchedules(prev => prev.filter(s => s.id !== scheduleId));
            fetchDeletedItems();
            toast.success(isAr ? '✅ نُقل الموعد إلى المحذوفات' : '✅ Schedule moved to deleted items');
        } catch (error) {
            console.error('Error deleting schedule:', error);
            toast.error(isAr ? '❌ خطأ في الحذف' : '❌ Error deleting');
        }
    };

    const generateScheduleWhatsAppLink = (schedule) => {
        const phone = String(schedule.donorPhone || '').replace(/\D/g, '');
        if (!phone) return '#';
        const coordinator = schedule.assignedCoordinator === 'ahmad'
            ? (isAr ? (systemSettings.ahmadNameAr || 'أحمد') : (systemSettings.ahmadNameEn || 'Ahmad'))
            : (isAr ? (systemSettings.saraNameAr || 'سار') : (systemSettings.saraNameEn || 'Sara'));
        const dateStr = schedule.pickupDate
            ? new Date(schedule.pickupDate + (schedule.pickupTime ? `T${schedule.pickupTime}` : '')).toLocaleString(isAr ? 'ar-JO' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: schedule.pickupTime ? '2-digit' : undefined, minute: schedule.pickupTime ? '2-digit' : undefined })
            : '';
        let msg = schedule.reminderMessage && schedule.reminderMessage.trim()
            ? schedule.reminderMessage.trim()
            : (isAr
                ? `السلام عليكم ${schedule.donorName}،\n\nنُذكّرك بضرور إحضار مادة "${schedule.materialName}" ${dateStr ? `يوم ${dateStr}` : ''} وتسليمها للمنسق ${coordinator}.\n\nشكراً لتعاونك — فريق حمل تبادل المواد 📚`
                : `Hello ${schedule.donorName},\n\nThis is a reminder to bring "${schedule.materialName}" ${dateStr ? `on ${dateStr}` : ''} and hand it over to coordinator ${coordinator}.\n\nThank you — Material Exchange Team 📚`);
        return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (name === 'phoneNumber') {
            setFormData(prev => ({ ...prev, [name]: toEnglishNumerals(value) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddMaterial = () => {
        if (currentMaterial.name.trim()) {
            setFormData(prev => ({
                ...prev,
                materials: [...prev.materials, {
                    name: currentMaterial.name.trim(),
                    description: currentMaterial.description.trim() || ''
                }]
            }));
            setCurrentMaterial({ name: '', description: '' });
        }
    };

    const handleRemoveMaterial = (index) => {
        setFormData(prev => ({ ...prev, materials: prev.materials.filter((_, i) => i !== index) }));
    };

    const formatPreRequestDate = (request) => {
        if (request.createdAt?.toDate) {
            return request.createdAt.toDate().toLocaleString(isAr ? 'ar-JO' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
        }
        return isAr ? 'تم الإرسال مؤراً' : 'Submitted recently';
    };

    const handlePreRequestSubmit = async (e) => {
        e.preventDefault();
        if (!preRequestForm.studentName.trim() || !preRequestForm.phoneNumber.trim() || !preRequestForm.materialName.trim()) {
            toast.error(isAr ? 'يرجى تعبئ الاسم والهاتف واسم المادة' : 'Please fill your name, phone, and material name');
            return;
        }

        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(preRequestForm.phoneNumber)) {
            toast.error(isAr ? 'يجب أن يتكون رقم الهاتف من 10 انات بالضبط' : 'Phone number must be exactly 10 digits');
            return;
        }

        if (!preRequestForm.agreedToPreRequestTerms) {
            toast.error(isAr ? 'يرجى الموافق على الشروط والأحكام' : 'Please agree to the terms and conditions');
            return;
        }

        setPreRequestLoading(true);
        try {
            await addDoc(collection(db, 'materialPreRequests'), {
                type: preRequestForm.type === 'need' ? 'need' : 'donate',
                studentName: preRequestForm.studentName.trim(),
                phoneNumber: preRequestForm.phoneNumber.trim(),
                materialName: preRequestForm.materialName.trim(),
                notes: preRequestForm.notes.trim(),
                agreedToPreRequestTerms: preRequestForm.agreedToPreRequestTerms,
                createdAt: serverTimestamp(),
                status: 'pending'
            });

            // Send real-time admin notification
            sendAdminNotification(
                preRequestForm.type === 'need' ? 'new_booking' : 'new_donation',
                preRequestForm.type === 'need'
                    ? (isAr ? `طلب مسبق لمادة: ${preRequestForm.materialName.trim()}` : `Pre-Request: ${preRequestForm.materialName.trim()}`)
                    : (isAr ? `تبرع جديد بكتاب/مادة: ${preRequestForm.materialName.trim()}` : `New Material Donation: ${preRequestForm.materialName.trim()}`),
                isAr
                    ? `قدم الطالب ${preRequestForm.studentName.trim()} طلباً (${preRequestForm.type === 'need' ? 'احتياج' : 'تبرع'}) بخصوص ${preRequestForm.materialName.trim()}`
                    : `Student ${preRequestForm.studentName.trim()} submitted a request for ${preRequestForm.materialName.trim()}`,
                { phone: preRequestForm.phoneNumber.trim(), studentName: preRequestForm.studentName.trim(), materialName: preRequestForm.materialName.trim() }
            );

            toast.success(isAr ? 'تم حفظ طلبك المسبق بنجاح' : 'Your pre-request was saved successfully');
            setPreRequestForm({ type: 'donate', studentName: '', phoneNumber: '', materialName: '', notes: '', agreedToPreRequestTerms: false });
        } catch (error) {
            console.error('Error saving pre-request:', error);
            toast.error(isAr ? 'حدث خطأ أثناء إرسال الطلب المسبق، حاول مرة أخرى' : 'An error occurred while submitting your pre-request. Please try again.');
        } finally {
            setPreRequestLoading(false);
        }
    };

    const handleCoordinatorApplicationSubmit = async (e) => {
        e.preventDefault();

        if (!systemSettings.allowRegistration) {
            toast.error(isAr ? 'عذراً، استقبال طلبات الانضمام متوقف حالياً' : 'Membership applications are currently closed');
            return;
        }

        if (!coordinatorApplicationForm.name.trim() || !coordinatorApplicationForm.phoneNumber.trim() || !coordinatorApplicationForm.email.trim() || !coordinatorApplicationForm.motivation.trim()) {
            toast.error(isAr ? 'يرجى تعبئ جميع الحقول المطلوب' : 'Please complete all required fields');
            return;
        }

        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(coordinatorApplicationForm.phoneNumber)) {
            toast.error(isAr ? 'يجب أن يتكون رقم الهاتف من 10 انات بالضبط' : 'Phone number must be exactly 10 digits');
            return;
        }

        if (!coordinatorApplicationForm.agreedToCoordinatorTerms) {
            toast.error(isAr ? 'يرجى الموافق على أن يتم التواصل معك بشأن الطلب' : 'Please agree to be contacted about your application');
            return;
        }

        setCoordinatorApplicationLoading(true);
        try {
            await addDoc(collection(db, 'coordinatorApplications'), {
                name: coordinatorApplicationForm.name.trim(),
                phoneNumber: coordinatorApplicationForm.phoneNumber.trim(),
                email: coordinatorApplicationForm.email.trim(),
                motivation: coordinatorApplicationForm.motivation.trim(),
                agreedToCoordinatorTerms: coordinatorApplicationForm.agreedToCoordinatorTerms,
                createdAt: serverTimestamp(),
                status: 'pending'
            });

            // Send real-time admin notification
            sendAdminNotification(
                'new_application',
                isAr ? 'طلب انضمام لمنسق جديد' : 'New Coordinator Application',
                isAr ? `قدم الطالب ${coordinatorApplicationForm.name.trim()} طلب انضمام لفريق التنسيق` : `Student ${coordinatorApplicationForm.name.trim()} submitted coordinator application`,
                { phone: coordinatorApplicationForm.phoneNumber.trim(), studentName: coordinatorApplicationForm.name.trim() }
            );

            toast.success(isAr ? 'تم إرسال طلب الانضمام بنجاح' : 'Your application was submitted successfully');
            setCoordinatorApplicationForm({ name: '', phoneNumber: '', email: '', motivation: '', agreedToCoordinatorTerms: false });
        } catch (error) {
            console.error('Error saving coordinator application:', error);
            toast.error(isAr ? 'حدث خطأ أثناء إرسال طلب الانضمام، حاول مرة أخرى' : 'An error occurred while submitting your application. Please try again.');
        } finally {
            setCoordinatorApplicationLoading(false);
        }
    };

    const openBookingModal = (material) => {
        if (!systemSettings.isExchangeActive) {
            toast(
                () => (
                    <div className="suspension-alert">
                        <p>{isAr ? systemSettings.exchangeSuspendedMessageAr : systemSettings.exchangeSuspendedMessageEn}</p>
                    </div>
                ),
                { duration: 6000, position: 'top-center', style: { background: '#fff3cd', color: '#856404', border: '1px solid #ffeeba', padding: '16px', borderRadius: '8px', fontSize: '16px', fontWeight: '600', textAlign: 'center' } }
            );
            return;
        }
        if (!bookingOpen) {
            toast.error(isAr ? 'عذراً، حجز المواد لم يبدأ بعد' : 'Sorry, material booking has not started yet');
            return;
        }
        setSelectedMaterial(material);
        setShowBookingModal(true);
    };

    const handleBookingSubmit = async (e) => {
        e.preventDefault();
        if (bookingCaptchaInput.trim().toUpperCase() !== bookingCaptchaText) {
            setBookingCaptchaError(true);
            toast.error(isAr ? 'رمز التحقق غير صحيح' : 'Incorrect verification code');
            generateBookingCaptcha();
            return;
        }
        if (bookingData.name.trim().split(/\s+/).length < 2) {
            toast.error(isAr ? 'يرجى إدخال الاسم الثنائي على الأقل' : 'Please enter at least two parts of your name');
            return;
        }
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(bookingData.phone)) {
            toast.error(isAr ? 'يجب أن يتكون رقم الهاتف من 10 انات بالضبط (مثال: 0790000000)' : 'Phone number must be exactly 10 digits (e.g. 0790000000)');
            return;
        }
        if (!bookingData.gender) {
            toast.error(isAr ? 'يرجى اختيار الجنس' : 'Please select gender');
            return;
        }
        setLoading(true);
        try {
            const { doc: docRef, runTransaction } = await import('firebase/firestore');
            const donationRef = docRef(db, 'materialDonations', selectedMaterial.id);
            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) throw new Error('Document does not exist!');
                const currentData = donationDoc.data();
                const materials = currentData.materials || [];
                const updatedMaterials = [...materials];
                const materialToUpdate = updatedMaterials[selectedMaterial.originalIndex];
                if (!materialToUpdate) throw new Error('Material not found in donation record.');
                const normalizedStatus = typeof materialToUpdate === 'object' ? materialToUpdate.status : currentData.status;
                if (normalizedStatus === 'reserved' || normalizedStatus === 'completed') throw new Error('ALREADY_RESERVED');
                if (typeof updatedMaterials[selectedMaterial.originalIndex] !== 'object') {
                    updatedMaterials[selectedMaterial.originalIndex] = { name: updatedMaterials[selectedMaterial.originalIndex], status: 'reserved' };
                } else {
                    updatedMaterials[selectedMaterial.originalIndex] = { ...materialToUpdate, status: 'reserved' };
                }
                updatedMaterials[selectedMaterial.originalIndex].takerInfo = {
                    name: bookingData.name.trim(),
                    phone: bookingData.phone.trim(),
                    email: bookingData.email?.trim() || '',
                    gender: bookingData.gender,
                    bookedAt: new Date()
                };
                const allReserved = updatedMaterials.every(m => {
                    const s = typeof m === 'object' ? m.status : 'pending';
                    return s === 'reserved' || s === 'completed';
                });
                transaction.update(donationRef, {
                    materials: updatedMaterials,
                    status: allReserved ? 'reserved' : 'approved',
                    lastUpdated: new Date()
                });
            });
            sendBookingToSheets({
                studentName: bookingData.name.trim(),
                phoneNumber: bookingData.phone.trim(),
                email: bookingData.email?.trim() || '',
                studentGender: bookingData.gender === 'male' ? (isAr ? 'ذكر' : 'Male') : (isAr ? 'أنثى' : 'Female'),
                materialName: selectedMaterial.materialName,
                donorName: selectedMaterial.donorName || 'Unknown',
                donorPhone: selectedMaterial.donorPhone || 'Unknown',
                status: 'reserved'
            }).catch(err => console.warn('Google Sheets backup failed:', err));

            // Send EmailJS Notification to coordinator
            sendCoordinatorEmailNotification('booking', {
                studentName: bookingData.name.trim(),
                phone: bookingData.phone.trim(),
                email: bookingData.email?.trim() || '',
                gender: bookingData.gender,
                materialName: selectedMaterial.materialName,
                donorName: selectedMaterial.donorName || 'Unknown',
                donorPhone: selectedMaterial.donorPhone || 'Unknown'
            }).catch(err => console.warn('Email notification failed:', err));

            // Send Realtime Admin Notification
            sendAdminNotification(
                'new_booking',
                isAr ? `حجز مادة جديدة: ${selectedMaterial?.materialName || 'مادة'}` : `New Booking: ${selectedMaterial?.materialName || 'Material'}`,
                isAr
                    ? `قام الطالب ${bookingData.name.trim()} بحجز مادة "${selectedMaterial?.materialName || ''}"`
                    : `Student ${bookingData.name.trim()} booked "${selectedMaterial?.materialName || ''}"`,
                { phone: bookingData.phone.trim(), studentName: bookingData.name.trim(), materialName: selectedMaterial?.materialName }
            );

            await saveCourseBooking({
                studentName: bookingData.name.trim(),
                phoneNumber: bookingData.phone.trim(),
                courseName: selectedMaterial?.materialName || '',
                courseCode: selectedMaterial?.courseCode || '',
                faculty: selectedMaterial?.faculty || '',
                notes: '',
                email: bookingData.email?.trim() || ''
            });
            toast.success(isAr ? 'تم حجز المادة بنجاح!' : 'Material booked successfully!', { duration: 5000 });
            setShowBookingModal(false);
            setActiveQRModal({
                bookingId: `BK-${Date.now().toString(36).toUpperCase()}`,
                studentName: bookingData.name.trim(),
                materialName: selectedMaterial?.materialName || selectedMaterial?.name || '',
                donorName: selectedMaterial?.donorName || 'مختبرع',
                coordinatorName: selectedMaterial?.studentGender === 'male' ? (systemSettings.ahmadNameAr || 'أحمد') : (systemSettings.saraNameAr || 'سار')
            });
            setBookingData({ name: '', phone: '', gender: '' });
            generateBookingCaptcha();
            fetchDonations();
        } catch (error) {
            console.error('Error booking material:', error);
            if (error.message === 'ALREADY_RESERVED') {
                toast.error(isAr ? 'عذراً، هذه المادة تم حجزها للتو من قبل شص آر' : 'Sorry, this material was just booked by someone else');
                fetchDonations();
            } else {
                toast.error(isAr ? 'فشل حجز المادة' : 'Failed to book material');
            }
        } finally {
            setLoading(false);
        }
    };

    // ── STAFF FUNCTIONS ───────────────────────────────────────────
    const handleLogin = async (e) => {
        e.preventDefault();

        // 1. Verify CAPTCHA first
        if (captchaInput.trim().toUpperCase() !== captchaText) {
            setCaptchaError(true);
            toast.error(isAr ? 'رمز التحقق غير صحيح' : 'Incorrect verification code');
            generateCaptcha();
            return;
        }

        const { username, password } = loginForm;
        const passwords = {
            admin: systemSettings.adminPassword || 'admin2024',
            ahmad: systemSettings.ahmadPassword || 'ahmad2024',
            sara: systemSettings.saraPassword || 'sara2024'
        };
        const staffUsersDynamic = {
            admin: { role: 'admin', nameAr: 'الأدمن', nameEn: 'Admin', gender: null },
            ahmad: { role: 'coordinator', nameAr: systemSettings.ahmadNameAr || 'أحمد', nameEn: systemSettings.ahmadNameEn || 'Ahmad', gender: 'male' },
            sara: { role: 'coordinator', nameAr: systemSettings.saraNameAr || 'سار', nameEn: systemSettings.saraNameEn || 'Sara', gender: 'female' }
        };

        const inputUserTrimmed = username.trim().toLowerCase();
        let matchedKey = null;

        const adminNameAr = 'الأدمن'.trim().toLowerCase();
        const adminNameEn = 'admin';

        const ahmadNameAr = (systemSettings.ahmadNameAr || 'أحمد').trim().toLowerCase();
        const ahmadNameEn = (systemSettings.ahmadNameEn || 'Ahmad').trim().toLowerCase();

        const saraNameAr = (systemSettings.saraNameAr || 'سار').trim().toLowerCase();
        const saraNameEn = (systemSettings.saraNameEn || 'Sara').trim().toLowerCase();

        if (inputUserTrimmed === 'admin' || inputUserTrimmed === adminNameAr || inputUserTrimmed === adminNameEn) {
            matchedKey = 'admin';
        } else if (inputUserTrimmed === 'ahmad' || inputUserTrimmed === ahmadNameAr || inputUserTrimmed === ahmadNameEn) {
            matchedKey = 'ahmad';
        } else if (inputUserTrimmed === 'sara' || inputUserTrimmed === saraNameAr || inputUserTrimmed === saraNameEn) {
            matchedKey = 'sara';
        }

        if (matchedKey && passwords[matchedKey] === password) {
            const user = staffUsersDynamic[matchedKey];

            // ── Permanently Enforced 2FA — fetch and generate secret on the fly if missing ──
            let totpSecret = '';
            try {
                const freshSnap = await getDoc(doc(db, 'system_configs', 'global_settings'));
                if (freshSnap.exists()) {
                    const fresh = freshSnap.data();
                    if (matchedKey === 'admin') {
                        totpSecret = fresh.admin2faSecret || '';
                    } else if (matchedKey === 'ahmad') {
                        totpSecret = fresh.ahmad2faSecret || '';
                    } else if (matchedKey === 'sara') {
                        totpSecret = fresh.sara2faSecret || '';
                    }
                }

                // If no secret exists yet, generate one on the fly and save to Firestore
                if (!totpSecret) {
                    totpSecret = generateBase32Secret();
                    const updateData = {};
                    const qrField = matchedKey === 'admin' ? 'adminQrConfirmed'
                        : matchedKey === 'ahmad' ? 'ahmadQrConfirmed' : 'saraQrConfirmed';
                    const secretField = matchedKey === 'admin' ? 'admin2faSecret'
                        : matchedKey === 'ahmad' ? 'ahmad2faSecret' : 'sara2faSecret';
                    const enabledField = matchedKey === 'admin' ? 'admin2faEnabled'
                        : matchedKey === 'ahmad' ? 'ahmad2faEnabled' : 'sara2faEnabled';

                    updateData[secretField] = totpSecret;
                    updateData[enabledField] = true;
                    updateData[qrField] = false;

                    await updateDoc(doc(db, 'system_configs', 'global_settings'), updateData);
                    setSystemSettings(prev => ({ ...prev, ...updateData }));
                }
            } catch (err) {
                console.error('2FA Firestore fetch/generation error:', err);
            }

            if (totpSecret) {
                setPendingStaffKey(matchedKey);
                setPendingStaffName(user.nameAr || user.nameEn || matchedKey);
                setPendingStaffTotpSecret(totpSecret);
                setTotpCodeInput('');
                setTotpError(false);
                setLoginStep(4);
                return;
            }

            const coordinatorEmail = matchedKey === 'ahmad'
                ? systemSettings.ahmadEmail
                : matchedKey === 'sara'
                    ? systemSettings.saraEmail
                    : null;

            if (matchedKey !== 'admin' && coordinatorEmail) {
                const code = generateVerificationCode();
                setVerificationCode(code);
                setVerificationCodeInput('');
                setVerificationCodeError(false);
                setPendingStaffKey(matchedKey);
                setPendingStaffEmail(coordinatorEmail);
                setPendingStaffName(user.nameAr || user.nameEn || matchedKey);

                const emailSent = await sendStaffVerificationCodeEmail(coordinatorEmail, user.nameAr || user.nameEn || matchedKey, code);
                if (emailSent) {
                    toast.success(isAr ? 'تم إرسال رمز التحقق إلى بريد المنسق' : 'Verification code sent to coordinator email');
                    setLoginStep(3);
                    return;
                }

                toast.error(isAr ? 'لم يتم إرسال رمز التحقق. تحقق من إعدادات البريد.' : 'Failed to send verification code. Check email settings.');
                return;
            }

            // ── Write lastLogin to Firestore (admin direct login path) ──
            const adminStatusRef = doc(db, 'staff_status', matchedKey);
            setDoc(adminStatusRef, {
                online: true,
                lastSeen: Date.now(),
                lastLogin: Date.now(),
                username: matchedKey,
                nameAr: user.nameAr,
                nameEn: user.nameEn,
                role: user.role
            }, { merge: true }).catch(console.error);
            // Audit log for login
            addDoc(collection(db, 'materialExchangeLogs'), {
                operatorId: matchedKey,
                operatorNameAr: user.nameAr,
                operatorNameEn: user.nameEn,
                actionAr: 'سجل دخوله إلى النظام',
                actionEn: 'Logged in to the system',
                details: { type: 'login' },
                timestamp: serverTimestamp()
            }).catch(console.error);
            setLoggedInUser({ ...user, username: matchedKey });
            sessionStorage.setItem('exchange_staff', JSON.stringify({ ...user, username: matchedKey }));
            setShowLoginModal(false);
            setLoginForm({ username: '', password: '' });
            setLoginError('');
            setCaptchaInput('');
            setCaptchaError(false);

            if (user.role === 'admin') {
                setTimeout(() => {
                    window.location.hash = '/admin';
                }, 100);
            }
        } else {
            setLoginError(isAr ? 'اسم المستدم أو كلم المرور غير صحيح' : 'Incorrect username or password');
            generateCaptcha();
        }
    };

    const handleVerificationSubmit = (e) => {
        e.preventDefault();
        if (verificationCodeInput.trim() !== verificationCode) {
            setVerificationCodeError(true);
            toast.error(isAr ? 'رمز التحقق غير صحيح' : 'Incorrect verification code');
            return;
        }

        const staffUsersDynamic = {
            ahmad: { role: 'coordinator', nameAr: systemSettings.ahmadNameAr || 'أحمد', nameEn: systemSettings.ahmadNameEn || 'Ahmad', gender: 'male' },
            sara: { role: 'coordinator', nameAr: systemSettings.saraNameAr || 'سار', nameEn: systemSettings.saraNameEn || 'Sara', gender: 'female' }
        };
        const user = staffUsersDynamic[pendingStaffKey] || { role: 'coordinator', nameAr: pendingStaffName, nameEn: pendingStaffName, gender: null };

        // ── Write lastLogin to Firestore (email verification login path) ──
        const coordStatusRef = doc(db, 'staff_status', pendingStaffKey);
        setDoc(coordStatusRef, {
            online: true,
            lastSeen: Date.now(),
            lastLogin: Date.now(),
            username: pendingStaffKey,
            nameAr: user.nameAr,
            nameEn: user.nameEn,
            role: user.role
        }, { merge: true }).catch(console.error);
        // Audit log for login
        addDoc(collection(db, 'materialExchangeLogs'), {
            operatorId: pendingStaffKey,
            operatorNameAr: user.nameAr,
            operatorNameEn: user.nameEn,
            actionAr: 'سجل دخوله إلى النظام',
            actionEn: 'Logged in to the system',
            details: { type: 'login' },
            timestamp: serverTimestamp()
        }).catch(console.error);
        setLoggedInUser({ ...user, username: pendingStaffKey });
        sessionStorage.setItem('exchange_staff', JSON.stringify({ ...user, username: pendingStaffKey }));
        setShowLoginModal(false);
        setLoginStep(1);
        setLoginForm({ username: '', password: '' });
        setLoginError('');
        setCaptchaInput('');
        setCaptchaError(false);
        setVerificationCode('');
        setVerificationCodeInput('');
        setVerificationCodeError(false);
        setPendingStaffKey('');
        setPendingStaffEmail('');
        setPendingStaffName('');
    };

    const handleResendVerificationCode = async () => {
        if (!pendingStaffKey || !pendingStaffEmail) return;
        const newCode = generateVerificationCode();
        setVerificationCode(newCode);
        setVerificationCodeInput('');
        setVerificationCodeError(false);

        const emailSent = await sendStaffVerificationCodeEmail(pendingStaffEmail, pendingStaffName, newCode);
        if (emailSent) {
            toast.success(isAr ? 'تم إعاد إرسال رمز التحقق' : 'Verification code resent successfully');
        } else {
            toast.error(isAr ? 'فشل إعاد إرسال رمز التحقق. تحقق من إعدادات البريد.' : 'Failed to resend verification code. Check email settings.');
        }
    };

    const handleTotpSubmit = async (e) => {
        e.preventDefault();
        if (!pendingStaffTotpSecret) return;

        const codeCurrent = await getTOTPToken(pendingStaffTotpSecret, 0);
        const codePrev = await getTOTPToken(pendingStaffTotpSecret, -30);
        const codeNext = await getTOTPToken(pendingStaffTotpSecret, 30);

        const userVal = totpCodeInput.trim();
        if (userVal === codeCurrent || userVal === codePrev || userVal === codeNext) {
            const staffUsersDynamic = {
                admin: { role: 'admin', nameAr: 'الأدمن', nameEn: 'Admin', gender: null },
                ahmad: { role: 'coordinator', nameAr: systemSettings.ahmadNameAr || 'أحمد', nameEn: systemSettings.ahmadNameEn || 'Ahmad', gender: 'male' },
                sara: { role: 'coordinator', nameAr: systemSettings.saraNameAr || 'سار', nameEn: systemSettings.saraNameEn || 'Sara', gender: 'female' }
            };
            const user = staffUsersDynamic[pendingStaffKey] || { role: 'coordinator', nameAr: pendingStaffKey, nameEn: pendingStaffKey, gender: null };

            // ── Mark QR as confirmed (hide three-dot QR button on future logins) ──
            const qrField = pendingStaffKey === 'admin' ? 'adminQrConfirmed'
                : pendingStaffKey === 'ahmad' ? 'ahmadQrConfirmed' : 'saraQrConfirmed';
            updateDoc(doc(db, 'system_configs', 'global_settings'), { [qrField]: true }).catch(console.error);
            setSystemSettings(prev => ({ ...prev, [qrField]: true }));
            setShowQrInLogin(false);

            // ── Update staff_status in Firestore ──
            const statusRef = doc(db, 'staff_status', pendingStaffKey);
            setDoc(statusRef, {
                online: true,
                lastSeen: Date.now(),
                lastLogin: Date.now(),
                username: pendingStaffKey,
                nameAr: user.nameAr,
                nameEn: user.nameEn,
                role: user.role
            }, { merge: true }).catch(console.error);

            // ── Add Audit Log for Login ──
            addDoc(collection(db, 'materialExchangeLogs'), {
                operatorId: pendingStaffKey,
                operatorNameAr: user.nameAr,
                operatorNameEn: user.nameEn,
                actionAr: 'سجل دخوله إلى النظام',
                actionEn: 'Logged in to the system',
                details: { type: 'login' },
                timestamp: serverTimestamp()
            }).catch(console.error);

            setLoggedInUser({ ...user, username: pendingStaffKey });
            sessionStorage.setItem('exchange_staff', JSON.stringify({ ...user, username: pendingStaffKey }));
            setShowLoginModal(false);
            setLoginStep(1);
            setLoginForm({ username: '', password: '' });
            setLoginError('');
            setCaptchaInput('');
            setCaptchaError(false);
            setTotpCodeInput('');
            setTotpError(false);
            setPendingStaffKey('');
            setPendingStaffTotpSecret('');
            toast.success(isAr ? 'تم تسجيل الدخول بنجاح! 🔐' : 'Logged in successfully! 🔐');

            if (user.role === 'admin') {
                setTimeout(() => {
                    window.location.hash = '/admin';
                }, 100);
            }
        } else {
            setTotpError(true);
            toast.error(isAr ? 'رمز التحقق الثنائي غير صحيح' : 'Incorrect 2FA code');
        }
    };

    // Send a reset request to the admin — stored in Firestore, shown in admin settings
    const handleRequestReset2fa = async (username) => {
        try {
            const requestField = username === 'admin' ? 'adminResetRequest'
                : username === 'ahmad' ? 'ahmadResetRequest' : 'saraResetRequest';
            await updateDoc(doc(db, 'system_configs', 'global_settings'), { [requestField]: true });
            setSystemSettings(prev => ({ ...prev, [requestField]: true }));
            toast.success(isAr ? 'تم إرسال طلب إعاد التعيين للأدمن ✅' : 'Reset request sent to admin ✅');
        } catch (err) {
            console.error('Request reset error:', err);
            toast.error(isAr ? 'فشل إرسال الطلب' : 'Failed to send request');
        }
    };

    const handleReset2faFromLogin = async (e) => {
        e.preventDefault();
        const expectedAdminPass = systemSettings.adminPassword || 'admin2024';
        if (resetAdminPasswordInput !== expectedAdminPass) {
            toast.error(isAr ? 'كلم مرور الأدمن غير صحيح' : 'Incorrect Admin password');
            return;
        }

        try {
            const secret = generateBase32Secret();
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            const updateData = {};
            const secretField = pendingStaffKey === 'admin' ? 'admin2faSecret'
                : pendingStaffKey === 'ahmad' ? 'ahmad2faSecret' : 'sara2faSecret';
            const qrField = pendingStaffKey === 'admin' ? 'adminQrConfirmed'
                : pendingStaffKey === 'ahmad' ? 'ahmadQrConfirmed' : 'saraQrConfirmed';

            updateData[secretField] = secret;
            updateData[qrField] = false;

            await updateDoc(settingsRef, updateData);
            setSystemSettings(prev => ({ ...prev, ...updateData }));
            setPendingStaffTotpSecret(secret);
            setShowResetInLogin(false);
            setResetAdminPasswordInput('');
            setShowQrInLogin(true); // Open/show the QR code immediately
            toast.success(isAr ? 'تم إعاد تعيين الكود السري بنجاح! امسح الرمز الجديد.' : 'Two-factor secret reset successfully! Scan the new QR code.');
        } catch (err) {
            console.error('Reset 2FA from login error:', err);
            toast.error(isAr ? 'فشل إعاد التعيين' : 'Failed to reset 2FA');
        }
    };

    const handleReset2fa = async (username) => {
        const displayName = username === 'admin'
            ? (isAr ? 'الأدمن' : 'Admin')
            : username === 'ahmad'
                ? systemSettings.ahmadNameAr
                : systemSettings.saraNameAr;
        if (!window.confirm(isAr
            ? `هل أنت متأكد من رغبتك في إعاد تعيين التحقق الثنائي (2FA) لـ ${displayName}؟ سيتم توليد رمز QR جديد بالكامل.`
            : `Are you sure you want to reset 2FA for ${displayName}? A new QR code will be generated.`
        )) return;

        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            const secret = generateBase32Secret();
            const updateData = {};
            if (username === 'admin') {
                updateData.admin2faEnabled = true;
                updateData.admin2faSecret = secret;
                updateData.adminQrConfirmed = false;
            } else if (username === 'ahmad') {
                updateData.ahmad2faEnabled = true;
                updateData.ahmad2faSecret = secret;
                updateData.ahmadQrConfirmed = false;
            } else {
                updateData.sara2faEnabled = true;
                updateData.sara2faSecret = secret;
                updateData.saraQrConfirmed = false;
            }
            await updateDoc(settingsRef, updateData);
            setSystemSettings(prev => ({ ...prev, ...updateData }));
            toast.success(isAr ? 'تم إعاد تعيين التحقق الثنائي بنجاح' : 'Two-factor authentication reset successfully');
        } catch (error) {
            console.error("Error resetting 2FA:", error);
            toast.error(isAr ? 'فشل إعاد تعيين التحقق الثنائي' : 'Failed to reset 2FA');
        }
    };

    // Re-show QR code — reads from state directly (synchronous, instant)
    const handleShowQR = (username) => {
        let secret = username === 'admin'
            ? systemSettings.admin2faSecret
            : username === 'ahmad'
                ? systemSettings.ahmad2faSecret
                : systemSettings.sara2faSecret;

        // If no secret in state, generate a new one and persist it
        if (!secret) {
            secret = generateBase32Secret();
            const updateData = {};
            if (username === 'admin') {
                updateData.admin2faSecret = secret;
                updateData.admin2faEnabled = true;
                updateData.adminQrConfirmed = false;
            } else if (username === 'ahmad') {
                updateData.ahmad2faSecret = secret;
                updateData.ahmad2faEnabled = true;
                updateData.ahmadQrConfirmed = false;
            } else {
                updateData.sara2faSecret = secret;
                updateData.sara2faEnabled = true;
                updateData.saraQrConfirmed = false;
            }
            updateDoc(doc(db, 'system_configs', 'global_settings'), updateData).catch(console.error);
            setSystemSettings(prev => ({ ...prev, ...updateData }));
        }

        const issuer = 'Makanak Al-Jamii';
        const qrData = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
        const formattedSecret = secret.match(/.{1,4}/g).join(' ');
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}&color=0f172a&bgcolor=ffffff`;
        setSetup2faData({ username, secret, formattedSecret, qrUrl, verificationCode: '', error: false });
    };

    const handleLogout = () => {
        if (loggedInUser) {
            const username = loggedInUser.username;
            const statusRef = doc(db, 'staff_status', username);
            updateDoc(statusRef, {
                online: false,
                lastLogout: Date.now(),
                lastSeen: Date.now()
            }).catch(console.error);

            addAuditLog(
                'سجّل روجه من النظام',
                'Logged out of the system',
                { type: 'logout' }
            );
        }
        setLoggedInUser(null);
        sessionStorage.removeItem('exchange_staff');
        setActiveTab('donations');
    };

    const handleApproveDonation = async (donationId) => {
        try {
            await updateDoc(doc(db, 'materialDonations', donationId), { status: 'approved' });
            toast.success(isAr ? 'تمت الموافق على التبرع' : 'Donation approved');
            fetchAllDonations();

            const don = allDonations.find(d => d.id === donationId);
            const donorName = don ? don.studentName : '';
            addAuditLog(
                `وافق على تبرع الطالب (${donorName}) بالكامل`,
                `Approved the entire donation from student (${donorName})`,
                { donationId, donorName }
            );
        } catch {
            toast.error(isAr ? 'فشل تحديث الحال' : 'Failed to update status');
        }
    };

    // ── Generate Direct WhatsApp Link ──
    const generateWhatsAppLink = (data, type) => {
        try {
            if (!data) return '#';

            const rawName = loggedInUser?.name || '';
            const coordinatorName = rawName || (isAr ? 'فريق مكانك' : 'Makanak Team');
            const coordinatorLabel = rawName
                ? (isAr ? `المنسق ${rawName}` : `Coordinator ${rawName}`)
                : (isAr ? 'فريق حمل تبادل المواد' : 'Material Exchange Team');
            let phone = '';
            let name = '';
            let messageText = '';
            let materials = [];

            // Helper to normalize phone numbers
            const normalizePhone = (p) => {
                if (!p) return '';
                return String(p).replace(/\D/g, '');
            };

            const phonesMatch = (a, b) => {
                const na = normalizePhone(a);
                const nb = normalizePhone(b);
                if (!na || !nb) return false;
                return na.slice(-9) === nb.slice(-9);
            };

            if (type === 'donor') {
                name = data.studentName || '';
                phone = String(data.phoneNumber || data.studentPhone || '').replace(/\D/g, '');

                const donorItems = allDonations.filter(item =>
                    phonesMatch(item.phoneNumber || item.studentPhone, phone)
                );

                const delivered = [];
                const remaining = [];

                donorItems.forEach(don => {
                    const rawMaterials = Array.isArray(don.materials) ? don.materials : [];
                    rawMaterials.forEach(m => {
                        const matName = typeof m === 'object' ? (m.name || '') : String(m || '');
                        const status = typeof m === 'object' ? (m.status || 'pending') : 'pending';

                        if (status === 'completed') {
                            delivered.push(`- ${matName}`);
                        } else {
                            let statusStr = '';
                            if (status === 'reserved') {
                                statusStr = isAr ? ' — بانتظار التسليم' : ' — Pending Delivery';
                            } else if (status === 'approved') {
                                statusStr = isAr ? ' — متاح للاستلام' : ' — Available for Pickup';
                            } else if (status === 'pending') {
                                statusStr = isAr ? ' — قيد المراجع' : ' — Under Review';
                            }
                            remaining.push(`- ${matName}${statusStr}`);
                        }
                    });
                });

                const deliveredText = delivered.length > 0
                    ? (isAr
                        ? `\n\n*المواد التي تم تسليمها بنجاح*:\n\n${delivered.join('\n')}`
                        : `\n\n*Delivered Materials*:\n\n${delivered.join('\n')}`)
                    : '';
                const remainingText = remaining.length > 0
                    ? (isAr
                        ? `\n\n*المواد المتبقي وبانتظار التسليم*:\n\n${remaining.join('\n')}`
                        : `\n\n*Pending Materials*:\n\n${remaining.join('\n')}`)
                    : '';

                if (isAr) {
                    messageText = `السلام عليكم ورحم الله وبركاته،
الأ/الأت الفاضل/ ${name}،

تقرير مُحدّث لحال المواد المختبرع بها من قبلكم عبر موقع "مكانك":${deliveredText}${remainingText}

للمزيد من التفاصيل، يرجى زيار صفح تبادل المواد.

جزاكم الله يراً على مساهمتكم الكريم لدعم الطلاب.`;
                } else {
                    messageText = `Dear ${name},

Here is an updated report on your donated materials on Makanak:${deliveredText}${remainingText}

For more details, please visit the material exchange page.`;
                }
            } else if (type === 'booker') {
                name = data.takerInfo?.name || '';
                phone = String(data.takerInfo?.phone || '').replace(/\D/g, '');

                const bookerDelivered = [];
                const bookerRemaining = [];

                allDonations.forEach(don => {
                    if (don.materials && Array.isArray(don.materials)) {
                        don.materials.forEach(m => {
                            if (typeof m === 'object' && m && m.takerInfo && m.takerInfo.phone) {
                                if (phonesMatch(m.takerInfo.phone, phone)) {
                                    const matName = m.name || '';
                                    const status = m.status || 'reserved';

                                    if (status === 'completed') {
                                        bookerDelivered.push(`- ${matName}`);
                                    } else if (status === 'reserved') {
                                        bookerRemaining.push(`- ${matName}`);
                                    }
                                }
                            }
                        });
                    }
                });

                if (bookerDelivered.length === 0 && bookerRemaining.length === 0) {
                    const matName = data.materialName || '';
                    if (data.status === 'completed') {
                        bookerDelivered.push(`- ${matName}`);
                    } else {
                        bookerRemaining.push(`- ${matName}`);
                    }
                }

                const bookerDeliveredText = bookerDelivered.length > 0
                    ? (isAr
                        ? `\n\n * المواد التي تم استلامها بنجاح *: \n\n${bookerDelivered.join('\n')} `
                        : `\n\n * Successfully Received Materials *: \n\n${bookerDelivered.join('\n')} `)
                    : '';
                const bookerRemainingText = bookerRemaining.length > 0
                    ? (isAr
                        ? `\n\n * المواد المحجوز وبانتظار الاستلام *: \n\n${bookerRemaining.join('\n')} `
                        : `\n\n * Booked Materials – Pending Pickup *: \n\n${bookerRemaining.join('\n')} `)
                    : '';

                if (isAr) {
                    messageText = `السلام عليكم ورحم الله وبركاته،
                    الأ / الأت الفاضل /  ${name}،

تقرير مُحدّث لحال المواد المحجوز من قبلكم عبر موقع "مكانك":${bookerDeliveredText}${bookerRemainingText}

للمزيد من التفاصيل، يرجى زيار صفح تبادل المواد.

يرجى التواصل معنا لتنسيق موعد الاستلام.شكراً لتعاونكم.`;
                } else {
                    messageText = `Dear ${name},

Here is an updated report on your booked materials on Makanak:${bookerDeliveredText}${bookerRemainingText}

For more details, please visit the material exchange page.

Please contact us to coordinate the pickup.Thank you.`;
                }

                materials = bookerDelivered.concat(bookerRemaining);
            }

            // Build final phone number
            let finalPhone = normalizePhone(phone);
            if (finalPhone.startsWith('00962')) {
                finalPhone = finalPhone.substring(2);
            }
            if (finalPhone.length === 10 && finalPhone.startsWith('0')) {
                finalPhone = '962' + finalPhone.substring(1);
            } else if (finalPhone.length === 9 && (finalPhone.startsWith('7') || finalPhone.startsWith('8') || finalPhone.startsWith('9'))) {
                finalPhone = '962' + finalPhone;
            }

            if (!finalPhone) return '#';

            const whatsappUrl = `https://wa.me/${finalPhone}?text=${encodeURIComponent(messageText)}`;
            return whatsappUrl;
        } catch (error) {
            console.error('Error generating WhatsApp link:', error);
            return '#';
        }
    };

    const normalizePhoneNumber = (raw) => {
        if (!raw) return '';
        return String(raw).replace(/\D/g, '');
    };

    const openMaterialReport = (data, type) => {
        const rawPhone = type === 'donor'
            ? data.phoneNumber || data.studentPhone || ''
            : data.takerInfo?.phone || '';
        const phone = normalizePhoneNumber(rawPhone);
        const url = `${window.location.origin}${window.location.pathname}#/report?phone=${phone}&type=${type}`;
        window.open(url, '_blank');
    };


    const closeMaterialReport = () => {
        setShowMaterialReportModal(false);
        setMaterialReportData(null);
        setMaterialReportType(null);
        setReportPrinted(false);
    };

    const getReportTitle = (type) => type === 'donor'
        ? (isAr ? 'كشف المواد المختبرع بها' : 'Donated Materials Report')
        : (isAr ? 'كشف المواد المحجوز' : 'Booked Materials Report');

    const getReportWhatsAppLink = (data, type) => {
        const name = type === 'donor'
            ? data.studentName || ''
            : data.takerInfo?.name || '';
        const rawPhone = type === 'donor'
            ? data.phoneNumber || data.studentPhone || ''
            : data.takerInfo?.phone || '';
        let finalPhone = normalizePhoneNumber(rawPhone);
        if (finalPhone.startsWith('00962')) finalPhone = finalPhone.substring(2);
        if (finalPhone.length === 10 && finalPhone.startsWith('0')) finalPhone = '962' + finalPhone.substring(1);
        else if (finalPhone.length === 9 && /^[789]/.test(finalPhone)) finalPhone = '962' + finalPhone;
        if (!finalPhone) return '#';

        const verb = type === 'donor'
            ? (isAr ? 'تبرعت بها' : 'donated')
            : (isAr ? 'حجزتها' : 'booked');
        const messageText = isAr
            ? `السلام عليكم ورحم الله وبركاته،\n\nإليك كشف بالمواد التي ${verb} عبر نظام مكانك.\n\nيمكنك حفظ الكشف أو طباعته من الشاش ثم مشاركته.\n\nشكراً لتعاونك.`
            : `Hello ${name},\n\nHere is the report of the materials you ${verb} through the Makanak system.\n\nPlease save or print the report from the screen before sharing it.\n\nThank you.`;

        return `https://wa.me/${finalPhone}?text=${encodeURIComponent(messageText)}`;
    };

    const buildMaterialReportItems = (data, type) => {
        if (!data) return [];
        if (type === 'donor') {
            return Array.isArray(data.materials) ? data.materials.map((item, index) => ({
                id: index,
                name: typeof item === 'object' ? item.name || '—' : String(item || '—'),
                status: typeof item === 'object' ? item.status || 'pending' : 'pending',
                actionDate: item.actionDate || data.createdAt || '',
                deliveryDate: item.status === 'completed' ? item.completedAt || data.updatedAt || '' : ''
            })) : [];
        }
        return [{
            id: 0,
            name: data.materialName || '—',
            status: data.status || 'reserved',
            actionDate: data.createdAt || data.date || '',
            deliveryDate: data.status === 'completed' ? data.completedAt || data.updatedAt || data.date || '' : ''
        }];
    };

    const formatReportDate = (value) => {
        if (!value) return '—';
        try {
            const date = typeof value === 'object' && value.seconds
                ? new Date(value.seconds * 1000)
                : new Date(value);
            return date.toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return String(value);
        }
    };

    const formatDateTimeWithSeconds = (value) => {
        if (!value) return '—';
        try {
            const date = typeof value === 'object' && value.seconds
                ? new Date(value.seconds * 1000)
                : new Date(value);
            return date.toLocaleString(isAr ? 'ar-JO' : 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return String(value);
        }
    };

    const MaterialReportModal = () => {
        if (!showMaterialReportModal || !materialReportData) return null;
        const items = buildMaterialReportItems(materialReportData, materialReportType);
        const title = isAr ? 'كشف حرك المواد' : 'Material Movement Report';
        const clientName = materialReportType === 'donor'
            ? materialReportData.studentName || '—'
            : materialReportData.takerInfo?.name || '—';
        const phone = materialReportType === 'donor'
            ? materialReportData.phoneNumber || materialReportData.studentPhone || '—'
            : materialReportData.takerInfo?.phone || '—';
        const statusLabel = materialReportType === 'donor'
            ? (isAr ? 'المختبرع' : 'Donor')
            : (isAr ? 'الحاجز' : 'Booker');

        // Calculate counts for stats
        let donatedCount = 0;
        let reservedCount = 0;
        let completedCount = 0;

        if (materialReportType === 'donor') {
            const allMats = Array.isArray(materialReportData.materials) ? materialReportData.materials : [];
            donatedCount = allMats.filter(m => {
                const s = typeof m === 'object' ? m.status : 'pending';
                return s === 'approved' || s === 'pending';
            }).length;
            reservedCount = allMats.filter(m => {
                const s = typeof m === 'object' ? m.status : 'pending';
                return s === 'reserved';
            }).length;
            completedCount = allMats.filter(m => {
                const s = typeof m === 'object' ? m.status : 'pending';
                return s === 'completed';
            }).length;
        } else {
            const status = materialReportData.status || 'reserved';
            if (status === 'completed') completedCount = 1;
            else if (status === 'reserved') reservedCount = 1;
            else donatedCount = 1;
        }

        const getUserStatus = () => {
            if (materialReportType === 'donor') {
                return <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>{isAr ? 'مختبرع نشط' : 'Active Donor'}</span>;
            } else {
                return <span style={{ color: '#e67e22', fontWeight: 'bold' }}>{isAr ? 'لديه حجز نشط' : 'Has Active Booking'}</span>;
            }
        };

        const getStatusBadge = (status) => {
            if (status === 'completed') {
                return <span className="badge delivered">{isAr ? 'تم التسليم' : 'Delivered'}</span>;
            } else if (status === 'reserved') {
                return <span className="badge reserved">{isAr ? 'بانتظار التسليم' : 'Pending Delivery'}</span>;
            } else if (status === 'approved') {
                return <span className="badge donated">{isAr ? 'متاح' : 'Available'}</span>;
            } else {
                return <span className="badge donated" style={{ background: '#f1f5f9', color: '#64748b' }}>{isAr ? 'قيد المراجع' : 'Pending Review'}</span>;
            }
        };

        return (
            <div className="modal-overlay" onClick={closeMaterialReport}>
                <div className="report-sheet" onClick={(e) => e.stopPropagation()} dir={isAr ? 'rtl' : 'ltr'}>
                    <div className="sheet">
                        <div className="ribbon">{isAr ? 'إلكتروني' : 'Electronic'}</div>
                        <div className="accent-bar"></div>

                        <header>
                            <div className="title-block">
                                <h1>{title}</h1>
                                <p>{isAr ? 'تقرير تفصيلي بالمواد المختبرع بها والمحجوز والمسلم لهذا الحاجز' : 'Detailed report of materials donated, reserved, and delivered.'}</p>
                            </div>
                            <div className="meta">
                                <div>{isAr ? 'رقم الكشف:' : 'Report No:'} <span className="report-no">{materialReportData.id ? materialReportData.id.substring(0, 10) : '—'}</span></div>
                                <div>{isAr ? 'تاريخخ الإصدار:' : 'Issued:'} <b>{new Date().toLocaleDateString(isAr ? 'ar-JO' : 'en-US')}</b></div>
                                <div>{isAr ? 'المنسق:' : 'Coordinator:'} <b>{loggedInUser?.name || (isAr ? 'فريق مكانك' : 'Makanak Team')}</b></div>
                            </div>
                        </header>

                        <div className="pilgrim">
                            <div className="pilgrim-field">
                                <span>{materialReportType === 'donor' ? (isAr ? 'اسم المختبرع' : 'Donor Name') : (isAr ? 'اسم الحاجز' : 'Booker Name')}</span>
                                <b>{clientName}</b>
                            </div>
                            <div className="pilgrim-field">
                                <span>{isAr ? 'رقم الهاتف' : 'Phone Number'}</span>
                                <b style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {phone} {phone !== '—' && <span style={{ fontSize: '1.1rem', opacity: 0.6 }}>💬</span>}
                                </b>
                            </div>
                            <div className="pilgrim-field">
                                <span>{isAr ? 'تاريخخ التسجيل' : 'Registration Date'}</span>
                                <b>{formatReportDate(materialReportData.createdAt)}</b>
                            </div>
                            <div className="pilgrim-field">
                                <span>{materialReportType === 'donor' ? (isAr ? 'حال المختبرع' : 'Donor Status') : (isAr ? 'حال الحاجز' : 'Booker Status')}</span>
                                <b>{getUserStatus()}</b>
                            </div>
                        </div>

                        {/* Summary Stats Cards */}
                        <div className="stats">
                            <div className="stat-card donated">
                                <div className="num">{donatedCount}</div>
                                <div className="lbl">{isAr ? 'مواد مختبرع بها متاح' : 'Available Donated Materials'}</div>
                            </div>
                            <div className="stat-card reserved">
                                <div className="num">{reservedCount}</div>
                                <div className="lbl">{isAr ? 'مواد محجوز' : 'Reserved Materials'}</div>
                            </div>
                            <div className="stat-card delivered">
                                <div className="num">{completedCount}</div>
                                <div className="lbl">{isAr ? 'مواد مسلّم' : 'Delivered Materials'}</div>
                            </div>
                        </div>

                        <div className="section-title">{isAr ? 'تفاصيل المواد' : 'Materials Details'}</div>
                        <table>
                            <thead>
                                <tr>
                                    <th>{isAr ? 'م' : '#'}</th>
                                    <th>{isAr ? 'اسم المادة' : 'Material Name'}</th>
                                    <th>{isAr ? 'التصنيف' : 'Classification'}</th>
                                    <th>{isAr ? 'تاريخخ الإجراء' : 'Action Date'}</th>
                                    <th>{isAr ? 'تاريخخ التسليم' : 'Delivery Date'}</th>
                                    <th>{isAr ? 'الحال' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.length > 0 ? items.map((item, index) => {
                                    const classification = item.status === 'completed'
                                        ? (isAr ? 'مادة مسلّم' : 'Delivered Material')
                                        : item.status === 'reserved'
                                            ? (isAr ? 'مادة محجوز' : 'Reserved Material')
                                            : (isAr ? 'مادة مختبرع بها' : 'Donated Material');

                                    return (
                                        <tr key={item.id || index}>
                                            <td>{index + 1}</td>
                                            <td style={{ fontWeight: '600' }}>{item.name}</td>
                                            <td style={{ color: '#5c6b7a' }}>{classification}</td>
                                            <td>{formatReportDate(item.actionDate)}</td>
                                            <td>{formatReportDate(item.deliveryDate)}</td>
                                            <td>{getStatusBadge(item.status)}</td>
                                        </tr>
                                    );
                                }) : (
                                    <tr className="empty-row">
                                        <td colSpan="6">{isAr ? 'لا توجد مواد مرتبط بهذا الكشف.' : 'No materials found for this report.'}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <footer>
                            <div className="note">
                                {isAr ? 'يرجى الاحتفاظ بهذا الكشف ومشاركته عند التواصل مع فريق التنسيق. هذا المستند صادر إلكترونياً من نظام مكانك، ولا يحتاج إلى تم أو توقيع لاعتماده.' : 'Please keep this report and share it when contacting the coordination team. This document is issued electronically from the Makanak system and does not require a stamp or signature for validation.'}
                            </div>
                            <div className="system">
                                <b>{isAr ? 'نظام مكانك' : 'Makanak System'}</b><br />
                                {isAr ? 'تقرير آلي - لا يُعتمد به كوثيق رسمي بديل عن السجل الأصلي' : 'Automated report - Not considered as a formal document replacement'}
                            </div>
                        </footer>
                    </div>
                    <div className="report-sheet-actions">
                        <button type="button" className="btn primary" onClick={() => { setReportPrinted(true); window.print(); }}>
                            🖨️ {isAr ? 'طباع / حفظ PDF' : 'Print / Save PDF'}
                        </button>
                        <button type="button" className="btn" onClick={closeMaterialReport}>{isAr ? 'إغلاق' : 'Close'}</button>
                        {reportPrinted && (
                            <button type="button" className="btn" onClick={() => {
                                const link = getReportWhatsAppLink(materialReportData, materialReportType);
                                if (link === '#') {
                                    toast.error(isAr ? 'رقم الهاتف غير متوفر أو غير صالح' : 'Phone number is invalid or missing');
                                    return;
                                }
                                window.open(link, '_blank');
                            }}>
                                {isAr ? 'إرسال رسال' : 'Send Message'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const handleUpdateTakerGender = async (donationId, materialIndex, newGender) => {
        try {
            const { doc: firestoreDoc, runTransaction } = await import('firebase/firestore');
            const donationRef = firestoreDoc(db, 'materialDonations', donationId);
            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) throw new Error('Document does not exist!');
                const currentData = donationDoc.data();
                const materials = currentData.materials || [];
                const updatedMaterials = [...materials];
                if (updatedMaterials[materialIndex] && typeof updatedMaterials[materialIndex] === 'object') {
                    updatedMaterials[materialIndex] = {
                        ...updatedMaterials[materialIndex],
                        takerInfo: {
                            ...(updatedMaterials[materialIndex].takerInfo || {}),
                            gender: newGender
                        }
                    };
                }
                transaction.update(donationRef, {
                    materials: updatedMaterials,
                    lastUpdated: new Date()
                });
            });
            toast.success(isAr ? 'تم تحديث جنس الحاجز بنجاح! ✅' : 'Taker gender updated successfully! ✅');
            fetchAllDonations();
        } catch (err) {
            console.error(err);
            toast.error(isAr ? 'حدث خطأ أثناء تحديث جنس الحاجز' : 'Error updating taker gender');
        }
    };

    const handleCompleteBooking = async (donationId, materialIndex, customDeliveryTime = null) => {
        const isAdmin = loggedInUser?.role === 'admin';
        const coordinatorPerms = systemSettings.coordinatorPermissions || {};
        const currentCoordinatorPerms = coordinatorPerms[loggedInUser?.username] || {};
        // Coordinators ALWAYS go through approval — only admins can complete bookings directly
        const canCompleteDirectly = isAdmin;

        if (!canCompleteDirectly) {
            await handleRequestAdminApproval({ donationId, materialIndex, actionType: 'completeBooking' });
            return;
        }
        try {
            const donationRef = doc(db, 'materialDonations', donationId);
            const donationDoc = await getDoc(donationRef);
            if (!donationDoc.exists()) return;
            const data = donationDoc.data();
            const materials = [...(data.materials || [])];
            if (materials[materialIndex]) {
                const currentMaterial = materials[materialIndex];
                const currentTakerInfo = (typeof currentMaterial === 'object' && currentMaterial !== null && currentMaterial.takerInfo)
                    ? currentMaterial.takerInfo
                    : {};
                const deliveryTime = customDeliveryTime
                    ? (typeof customDeliveryTime === 'object' && customDeliveryTime.seconds ? new Date(customDeliveryTime.seconds * 1000) : new Date(customDeliveryTime))
                    : new Date();

                materials[materialIndex] = {
                    ...(typeof currentMaterial === 'object' && currentMaterial !== null ? currentMaterial : { name: currentMaterial }),
                    status: 'completed',
                    completedAt: deliveryTime,
                    takerInfo: {
                        ...currentTakerInfo,
                        deliveredAt: deliveryTime
                    }
                };
            }

            let overallStatus = 'pending';
            const hasApproved = materials.some(m => m.status === 'approved');
            const hasReserved = materials.some(m => m.status === 'reserved');
            const hasCompleted = materials.some(m => m.status === 'completed');

            if (hasCompleted && !hasReserved && !hasApproved && !materials.some(m => m.status === 'pending')) {
                overallStatus = 'completed';
            } else if (hasReserved || hasCompleted) {
                overallStatus = 'reserved';
            } else if (hasApproved) {
                overallStatus = 'approved';
            }

            await updateDoc(donationRef, {
                materials,
                status: overallStatus,
                lastUpdated: new Date()
            });
            toast.success(isAr ? 'تم تسليم المادة بنجاح! ✅' : 'Material delivered successfully! ✅');
            fetchAllDonations();

            addAuditLog(
                `سلّم المادة (${materials[materialIndex].name}) للحاجز (${materials[materialIndex].takerInfo?.name || 'مجهول'})`,
                `Delivered material (${materials[materialIndex].name}) to booker (${materials[materialIndex].takerInfo?.name || 'Unknown'})`,
                { donationId, materialIndex }
            );
        } catch (error) {
            console.error('Error completing booking:', error);
            toast.error(isAr ? 'فشل إتمام عملي التسليم' : 'Failed to complete delivery');
        }
    };

    const handleCancelBooking = async (donationId, materialIndex) => {
        const isAdmin = loggedInUser?.role === 'admin';
        const coordinatorPerms = systemSettings.coordinatorPermissions || {};
        const currentCoordinatorPerms = coordinatorPerms[loggedInUser?.username] || {};
        // Coordinators ALWAYS go through approval — only admins can cancel bookings directly
        const canCancelDirectly = isAdmin;

        if (!canCancelDirectly) {
            await handleRequestAdminApproval({ donationId, materialIndex, actionType: 'cancelBooking' });
            return;
        }
        try {
            const donationRef = doc(db, 'materialDonations', donationId);
            const donationDoc = await getDoc(donationRef);
            if (!donationDoc.exists()) return;
            const data = donationDoc.data();
            const materials = [...(data.materials || [])];
            if (materials[materialIndex]) {
                materials[materialIndex].status = 'approved';
                delete materials[materialIndex].takerInfo;
            }

            let overallStatus = 'pending';
            const hasApproved = materials.some(m => m.status === 'approved');
            const hasReserved = materials.some(m => m.status === 'reserved');
            const hasCompleted = materials.some(m => m.status === 'completed');

            if (hasCompleted && !hasReserved && !hasApproved && !materials.some(m => m.status === 'pending')) {
                overallStatus = 'completed';
            } else if (hasReserved || hasCompleted) {
                overallStatus = 'reserved';
            } else if (hasApproved) {
                overallStatus = 'approved';
            }

            await updateDoc(donationRef, {
                materials,
                status: overallStatus,
                lastUpdated: new Date()
            });
            toast.success(isAr ? 'تم إلغاء الحجز بنجاح وإعاد المادة للمستودع 🔓' : 'Booking cancelled and material returned to pool 🔓');
            fetchAllDonations();

            addAuditLog(
                `ألغى حجز المادة (${materials[materialIndex].name})`,
                `Cancelled booking for material (${materials[materialIndex].name})`,
                { donationId, materialIndex }
            );
        } catch (error) {
            console.error('Error cancelling booking:', error);
            toast.error(isAr ? 'فشل إلغاء الحجز' : 'Failed to cancel booking');
        }
    };

    const handleSaveEditDonation = async (e) => {
        e.preventDefault();
        if (loading) return;
        if (!selectedDonationForEdit) return;
        setLoading(true);
        try {
            const isAdmin = loggedInUser?.role === 'admin';
            const coordinatorPerms = systemSettings.coordinatorPermissions || {};
            const currentCoordinatorPerms = coordinatorPerms[loggedInUser?.username] || {};
            // Coordinators ALWAYS go through approval — only admins can edit directly
            const canEditDirectly = isAdmin;

            // For coordinator: save edit request with modified data for admin approval if not allowed directly
            if (!canEditDirectly) {
                const updatedData = {
                    studentName: selectedDonationForEdit.studentName.trim(),
                    phoneNumber: selectedDonationForEdit.phoneNumber.trim(),
                    studentGender: selectedDonationForEdit.studentGender,
                    materials: selectedDonationForEdit.materials,
                    publishedToCoordinators: selectedDonationForEdit.publishedToCoordinators || false
                };

                const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                await updateDoc(doc(db, 'materialDonations', selectedDonationForEdit.id), {
                    adminApprovalRequests: arrayUnion({
                        requestId,
                        type: 'editDonation',
                        requestedBy: loggedInUser.username,
                        requestedByName: loggedInUser.nameAr || loggedInUser.nameEn || loggedInUser.username,
                        requestedAt: new Date(),
                        status: 'pending',
                        proposedChanges: updatedData,
                        coordinatorNotes: editCoordinatorNotes.trim()
                    })
                });

                await addAuditLog(
                    `طلب تعديل تفاصيل التبرع (${selectedDonationForEdit.studentName})`,
                    `Requested edit for donation details (${selectedDonationForEdit.studentName})`,
                    { donationId: selectedDonationForEdit.id, donorName: selectedDonationForEdit.studentName }
                );

                toast.success(isAr ? '📨 تم إرسال طلب التعديل — بانتظار موافق الإدار' : '📨 Edit request sent — Waiting for admin approval');
                toast.info(isAr ? 'لم تتغير البيانات بعد — ستُطبّق عند موافق الأدمن' : 'Data not changed yet — will apply upon admin approval');

                setShowEditModal(false);
                setSelectedDonationForEdit(null);
                setEditCoordinatorNotes('');
                fetchAllDonations();
                setLoading(false);
                return;
            }

            // apply edit directly
            const donationRef = doc(db, 'materialDonations', selectedDonationForEdit.id);
            const materials = selectedDonationForEdit.materials || [];
            let overallStatus = 'pending';
            const hasApproved = materials.some(m => m.status === 'approved');
            const hasReserved = materials.some(m => m.status === 'reserved');
            const hasCompleted = materials.some(m => m.status === 'completed');

            if (hasCompleted && !hasReserved && !hasApproved && !materials.some(m => m.status === 'pending')) {
                overallStatus = 'completed';
            } else if (hasReserved || hasCompleted) {
                overallStatus = 'reserved';
            } else if (hasApproved) {
                overallStatus = 'approved';
            }

            const updateFields = {
                studentName: selectedDonationForEdit.studentName.trim(),
                phoneNumber: selectedDonationForEdit.phoneNumber.trim(),
                studentGender: selectedDonationForEdit.studentGender,
                materials: selectedDonationForEdit.materials,
                status: overallStatus,
                lastUpdated: new Date()
            };

            if (selectedDonationForEdit.publishedToCoordinators !== undefined) {
                updateFields.publishedToCoordinators = selectedDonationForEdit.publishedToCoordinators;
            }

            await updateDoc(donationRef, updateFields);
            toast.success(isAr ? 'تم حفظ التعديلات بنجاح ✅' : 'Changes saved successfully ✅');
            setShowEditModal(false);
            setSelectedDonationForEdit(null);
            fetchAllDonations();
            fetchDonations();

            addAuditLog(
                `قام بتعديل تفاصيل تبرع الطالب (${selectedDonationForEdit.studentName}) وتحديث حال المواد`,
                `Edited donation details for student (${selectedDonationForEdit.studentName}) and updated materials status`,
                { donationId: selectedDonationForEdit.id, donorName: selectedDonationForEdit.studentName }
            );
        } catch (error) {
            console.error('Error saving edited donation:', error);
            toast.error(isAr ? `حدث خطأ أثناء حفظ التعديلات: ${error.message}` : `Error saving changes: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDelegateModal = (donation) => {
        setDonationToDelegate(donation);
        setShowDelegateModal(true);
    };

    const handleDelegateToCoordinator = async (donationId, coordinatorUsername) => {
        try {
            await updateDoc(doc(db, 'materialDonations', donationId), {
                publishedToCoordinators: true,
                delegatedTo: coordinatorUsername
            });
            const coordName = coordinatorUsername === 'ahmad'
                ? (systemSettings.ahmadNameAr || 'أحمد')
                : (systemSettings.saraNameAr || 'سار');
            toast.success(isAr ? `✅ تم تفويض الطلب إلى ${coordName}` : `✅ Delegated to ${coordinatorUsername}`);
            setShowDelegateModal(false);
            setDonationToDelegate(null);
            fetchAllDonations();

            const don = allDonations.find(d => d.id === donationId);
            const donorName = don ? don.studentName : '';
            addAuditLog(
                `فوّض تبرع الطالب (${donorName}) إلى المنسق (${coordName})`,
                `Delegated donation from student (${donorName}) to coordinator (${coordinatorUsername})`,
                { donationId, coordinatorUsername, donorName }
            );
        } catch (error) {
            console.error('Error delegating:', error);
            toast.error(isAr ? 'فشل التفويض' : 'Delegation failed');
        }
    };

    const handleRevokeDelegation = async (donationId) => {
        try {
            await updateDoc(doc(db, 'materialDonations', donationId), {
                publishedToCoordinators: false,
                delegatedTo: null
            });
            toast.success(isAr ? '🔄 تم إلغاء التفويض' : '🔄 Delegation revoked');
            fetchAllDonations();

            const don = allDonations.find(d => d.id === donationId);
            const donorName = don ? don.studentName : '';
            addAuditLog(
                `ألغى تفويض تبرع الطالب (${donorName})`,
                `Revoked delegation for donation from student (${donorName})`,
                { donationId, donorName }
            );
        } catch (error) {
            console.error('Error revoking delegation:', error);
            toast.error(isAr ? 'فشل إلغاء التفويض' : 'Failed to revoke');
        }
    };

    const handleDeleteDonation = async (donationId) => {
        if (!window.confirm(isAr ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete?')) return;
        const isAdmin = loggedInUser?.role === 'admin';
        const coordinatorPerms = systemSettings.coordinatorPermissions || {};
        const currentCoordinatorPerms = coordinatorPerms[loggedInUser?.username] || {};
        // Coordinators ALWAYS go through approval — only admins can delete directly
        const canDeleteDirectly = isAdmin;

        if (!canDeleteDirectly) {
            await handleRequestAdminApproval({ donationId, actionType: 'deleteDonation' });
            return;
        }
        try {
            const don = allDonations.find(d => d.id === donationId);
            const donorName = don ? don.studentName : '';
            await moveToDeletedItems('materialDonations', donationId, don, 'donation-deletion');
            toast.success(isAr ? 'تم نقل التبرع إلى المحذوفات' : 'Donation moved to deleted items');
            fetchAllDonations();
            fetchDeletedItems();

            addAuditLog(
                `نقل تبرع الطالب (${donorName}) إلى المحذوفات`,
                `Moved donation from student (${donorName}) to deleted items`,
                { donationId, donorName }
            );
        } catch {
            toast.error(isAr ? 'فشل الحذف' : 'Failed to delete');
        }
    };

    const handleRequestAdminApproval = async ({ donationId, materialIndex = null, actionType }) => {
        if (!loggedInUser) return;
        const donation = allDonations.find(d => d.id === donationId);
        if (!donation) return;
        if (hasPendingApprovalRequest(donation, actionType)) {
            toast.info(isAr ? '⚠️ الطلب قيد الانتظار بالفعل' : '⚠️ A request for this action is already pending');
            return;
        }
        if (actionType === 'editDonation' && isCoordinatorApprovedToEdit(donation)) {
            toast.info(isAr ? '✅ تمت الموافق على التعديل مسبقاً' : '✅ Edit already approved');
            return;
        }
        try {
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await updateDoc(doc(db, 'materialDonations', donationId), {
                adminApprovalRequests: arrayUnion({
                    requestId,
                    type: actionType,
                    requestedBy: loggedInUser.username,
                    requestedByName: loggedInUser.nameAr || loggedInUser.nameEn || loggedInUser.username,
                    requestedAt: new Date(),
                    materialIndex,
                    status: 'pending'
                })
            });
            toast.success(isAr ? '✅ تم إرسال طلب موافق للإدار' : '✅ Admin approval requested');
            fetchAllDonations();
            addAuditLog(
                `طلب موافق الإدار (${actionType}) للتبرع ${donationId}`,
                `Requested admin approval (${actionType}) for donation ${donationId}`,
                { donationId, actionType, materialIndex }
            );
        } catch (error) {
            console.error('Error requesting admin approval:', error);
            toast.error(isAr ? 'فشل إرسال طلب الموافق' : 'Failed to request admin approval');
        }
    };

    const getApprovalRequestTypeLabel = (type) => {
        const labels = {
            editDonation: isAr ? 'طلب تعديل مادة' : 'Edit Request',
            deleteDonation: isAr ? 'طلب حذف مادة' : 'Delete Request',
            deleteSchedule: isAr ? 'طلب حذف موعد' : 'Delete Schedule Request',
            completeBooking: isAr ? 'طلب تسليم مادة' : 'Delivery Request',
            cancelBooking: isAr ? 'طلب إلغاء حجز' : 'Cancel Booking Request'
        };
        return labels[type] || type;
    };

    const updateApprovalRequestStatus = async (donationId, requestId, status) => {
        try {
            const donationRef = doc(db, 'materialDonations', donationId);
            const donationSnap = await getDoc(donationRef);
            if (!donationSnap.exists()) return;
            const requests = donationSnap.data().adminApprovalRequests || [];
            const updatedRequests = requests.map(req => req.requestId === requestId ? {
                ...req,
                status,
                reviewedBy: loggedInUser?.username || 'admin',
                reviewedAt: new Date()
            } : req);
            await updateDoc(donationRef, { adminApprovalRequests: updatedRequests });
        } catch (error) {
            console.error('Error updating approval request status:', error);
            throw error;
        }
    };

    const processAdminApprovalRequest = async (donationId, request) => {
        switch (request.type) {
            case 'deleteDonation': {
                const donation = allDonations.find(item => item.id === donationId);
                if (!donation) return;
                await moveToDeletedItems('materialDonations', donationId, donation, 'donation-deletion');
                addAuditLog(
                    `وافق على نقل تبرع الطالب (${request.requestedByName}) إلى المحذوفات`,
                    `Approved moving donation by ${request.requestedByName} to deleted items`,
                    { donationId, requestId: request.requestId }
                );
                await fetchAllDonations();
                await fetchDeletedItems();
                return;
            }
            case 'deleteSchedule': {
                const schedule = deliverySchedules.find(item => item.id === donationId);
                if (!schedule) return;
                await moveToDeletedItems('deliverySchedules', donationId, schedule, 'schedule-deletion');
                await fetchDeliverySchedules();
                await fetchDeletedItems();
                addAuditLog(
                    `وافق على نقل موعد التسليم إلى المحذوفات (${request.requestedByName})`,
                    `Approved moving delivery schedule to deleted items (${request.requestedByName})`,
                    { scheduleId: donationId, requestId: request.requestId }
                );
                return;
            }
            case 'completeBooking': {
                await handleCompleteBooking(donationId, request.materialIndex);
                return;
            }
            case 'cancelBooking': {
                await handleCancelBooking(donationId, request.materialIndex);
                return;
            }
            case 'editDonation': {
                // Apply the proposed changes that were submitted with the request
                if (request.proposedChanges) {
                    const materials = request.proposedChanges.materials || [];
                    let overallStatus = 'pending';
                    const hasApproved = materials.some(m => m.status === 'approved');
                    const hasReserved = materials.some(m => m.status === 'reserved');
                    const hasCompleted = materials.some(m => m.status === 'completed');

                    if (hasCompleted && !hasReserved && !hasApproved && !materials.some(m => m.status === 'pending')) {
                        overallStatus = 'completed';
                    } else if (hasReserved || hasCompleted) {
                        overallStatus = 'reserved';
                    } else if (hasApproved) {
                        overallStatus = 'approved';
                    }

                    await updateDoc(doc(db, 'materialDonations', donationId), {
                        studentName: request.proposedChanges.studentName,
                        phoneNumber: request.proposedChanges.phoneNumber,
                        studentGender: request.proposedChanges.studentGender,
                        materials: request.proposedChanges.materials,
                        status: overallStatus,
                        lastUpdated: new Date(),
                        publishedToCoordinators: request.proposedChanges.publishedToCoordinators
                    });
                }
                addAuditLog(
                    `وافق على تعديل التبرع (${donationId}) من ${request.requestedByName} وطبق التعديلات`,
                    `Approved and applied edit request for donation (${donationId}) from ${request.requestedByName}`,
                    { donationId, requestId: request.requestId }
                );
                return;
            }
            default:
                throw new Error(`Unknown approval request type: ${request.type}`);
        }
    };

    const handleApproveApprovalRequest = async (donationId, request) => {
        try {
            // Process the request based on its type
            await processAdminApprovalRequest(donationId, request);

            if (request.type === 'deleteDonation' || request.type === 'deleteSchedule') {
                toast.success(isAr ? '✅ تمت الموافقة ونقل العنصر إلى المحذوفات' : '✅ Approved and moved item to deleted items');
                closeApprovalRequestsModal();
                closeAdminResponseModal();
                fetchAllDonations();
                fetchDeliverySchedules();
                return;
            }

            // Update request status to approved with admin notes
            const record = request.recordCollection === 'deliverySchedules'
                ? deliverySchedules.find(schedule => schedule.id === donationId)
                : allDonations.find(donation => donation.id === donationId);
            const updatedRequests = (record?.adminApprovalRequests || []).map(req =>
                req.requestId === request.requestId
                    ? { ...req, status: 'approved', adminNotes: adminResponseData.adminNotes || '', adminApprovedAt: new Date() }
                    : req
            );

            await updateDoc(doc(db, request.recordCollection === 'deliverySchedules' ? 'deliverySchedules' : 'materialDonations', donationId), {
                adminApprovalRequests: updatedRequests
            });

            toast.success(isAr ? '✅ تمت الموافق على الطلب' : '✅ Request approved');
            closeApprovalRequestsModal();
            closeAdminResponseModal();
            fetchAllDonations();
            addAuditLog(
                `وافق على طلب (${request.type}) - مع ملاحظات الأدمن`,
                `Approved request (${request.type}) - with admin notes`,
                { donationId, requestId: request.requestId, adminNotes: adminResponseData.adminNotes }
            );
        } catch (error) {
            console.error('Error approving request:', error);
            toast.error(isAr ? 'فشل موافق الطلب' : 'Failed to approve request');
        }
    };

    const handleRejectApprovalRequest = async (donationId, request) => {
        try {
            const record = request.recordCollection === 'deliverySchedules'
                ? deliverySchedules.find(schedule => schedule.id === donationId)
                : allDonations.find(donation => donation.id === donationId);
            const updatedRequests = (record?.adminApprovalRequests || []).map(req =>
                req.requestId === request.requestId
                    ? { ...req, status: 'rejected', adminNotes: adminResponseData.adminNotes || '', adminRejectedAt: new Date() }
                    : req
            );

            await updateDoc(doc(db, request.recordCollection === 'deliverySchedules' ? 'deliverySchedules' : 'materialDonations', donationId), {
                adminApprovalRequests: updatedRequests
            });

            toast.success(isAr ? '❌ تم رفض الطلب' : '❌ Request rejected');
            closeApprovalRequestsModal();
            closeAdminResponseModal();
            fetchAllDonations();
            addAuditLog(
                `رفض طلب (${request.type}) - مع ملاحظات الأدمن`,
                `Rejected request (${request.type}) - with admin notes`,
                { donationId, requestId: request.requestId, adminNotes: adminResponseData.adminNotes }
            );
        } catch (error) {
            console.error('Error rejecting request:', error);
            toast.error(isAr ? 'فشل رفض الطلب' : 'Failed to reject request');
        }
    };

    const handleSuspendApprovalRequest = async (donationId, request) => {
        try {
            const record = request.recordCollection === 'deliverySchedules'
                ? deliverySchedules.find(schedule => schedule.id === donationId)
                : allDonations.find(donation => donation.id === donationId);
            const updatedRequests = (record?.adminApprovalRequests || []).map(req =>
                req.requestId === request.requestId
                    ? { ...req, status: 'suspended', adminNotes: adminResponseData.adminNotes || '', adminSuspendedAt: new Date() }
                    : req
            );

            await updateDoc(doc(db, request.recordCollection === 'deliverySchedules' ? 'deliverySchedules' : 'materialDonations', donationId), {
                adminApprovalRequests: updatedRequests
            });

            toast.success(isAr ? '⏸️ تم إيقاف الطلب' : '⏸️ Request suspended');
            closeApprovalRequestsModal();
            closeAdminResponseModal();
            fetchAllDonations();
            addAuditLog(
                `أوقف طلب (${request.type}) - مع ملاحظات الأدمن`,
                `Suspended request (${request.type}) - with admin notes`,
                { donationId, requestId: request.requestId, adminNotes: adminResponseData.adminNotes }
            );
        } catch (error) {
            console.error('Error suspending request:', error);
            toast.error(isAr ? 'فشل إيقاف الطلب' : 'Failed to suspend request');
        }
    };

    const openApprovalRequestsModal = (donation) => {
        setSelectedDonationForRequests(donation);
        setShowApprovalRequestsModal(true);
    };

    const closeApprovalRequestsModal = () => {
        setShowApprovalRequestsModal(false);
        setSelectedDonationForRequests(null);
    };

    const openAdminResponseModal = (donationId, request) => {
        setAdminResponseData({
            donationId,
            request,
            adminAction: 'approve',
            adminNotes: ''
        });
        setShowAdminResponseModal(true);
    };

    const closeAdminResponseModal = () => {
        setShowAdminResponseModal(false);
        setAdminResponseData({
            donationId: null,
            request: null,
            adminAction: 'approve',
            adminNotes: ''
        });
    };

    // ── Action Request Modal Handlers ──────────────────────────
    const openActionRequestModal = (donationId, actionType, materialIndex = null, donationDetails = null) => {
        setActionRequestData({
            donationId,
            actionType,
            materialIndex,
            donationDetails,
            coordinatorNotes: ''
        });
        setShowActionRequestModal(true);
    };

    const closeActionRequestModal = () => {
        setShowActionRequestModal(false);
        setActionRequestData({
            donationId: null,
            actionType: null,
            materialIndex: null,
            donationDetails: null,
            coordinatorNotes: ''
        });
    };

    const handleSubmitActionRequest = async () => {
        try {
            const { donationId, actionType, materialIndex, coordinatorNotes } = actionRequestData;
            if (!donationId || !actionType) return;

            await updateDoc(doc(db, 'materialDonations', donationId), {
                adminApprovalRequests: arrayUnion({
                    requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type: actionType,
                    requestedBy: loggedInUser.username,
                    requestedByName: loggedInUser.nameAr || loggedInUser.nameEn || loggedInUser.username,
                    requestedAt: new Date(),
                    materialIndex,
                    coordinatorNotes,
                    status: 'pending'
                })
            });

            toast.success(isAr ? '✅ تم إرسال الطلب للموافق' : '✅ Request submitted for approval');
            closeActionRequestModal();
            fetchAllDonations();
            addAuditLog(
                `طلب إجراء (${actionType}) - ${coordinatorNotes ? 'مع ملاحظات' : 'بدون ملاحظات'}`,
                `Action request (${actionType}) ${coordinatorNotes ? 'with notes' : 'without notes'}`,
                { donationId, actionType, materialIndex, coordinatorNotes }
            );
        } catch (error) {
            console.error('Error submitting action request:', error);
            toast.error(isAr ? 'فشل إرسال الطلب' : 'Failed to submit request');
        }
    };

    const handleUpdateCampaignPhase = async (newPhase) => {
        setSystemSettings(prev => ({
            ...prev,
            campaignPhase: newPhase,
            isExchangeActive: newPhase !== 'suspended'
        }));
        setBookingOpen(newPhase === 'exchange');
        setEditSettings(prev => ({ ...prev, campaignPhase: newPhase }));
        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, { campaignPhase: newPhase }, { merge: true });
            toast.success(isAr ? 'تم تحديث حال الحمل بنجاح ✅' : 'Campaign status updated successfully ✅');

            addAuditLog(
                `غيّر حال مرحل الحمل إلى (${newPhase === 'suspended' ? 'موقوف 🛑' : newPhase === 'collection' ? 'جمع وتبرع 📥' : 'تبادل وحجز 🔄'})`,
                `Changed campaign phase status to (${newPhase})`,
                { newPhase }
            );
        } catch (error) {
            console.error('Error updating campaign phase:', error);
            toast.error(isAr ? 'فشل تحديث حال الحمل' : 'Failed to update campaign status');
        }
    };

    const handleSaveSettings = async () => {
        setSettingsSaving(true);
        // Update in memory immediately
        setSystemSettings(prev => ({ ...prev, ...editSettings }));
        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, editSettings, { merge: true });
            toast.success(isAr ? 'تم حفظ الإعدادات بنجاح ✅' : 'Settings saved successfully ✅');

            addAuditLog(
                `قام بتحديث الإعدادات العام للحمل`,
                `Updated general campaign settings`
            );
        } catch {
            toast.error(isAr ? 'فشل حفظ الإعدادات' : 'Failed to save settings');
        } finally {
            setSettingsSaving(false);
        }
    };

    // ── PER-SECTION SAVE ─────────────────────────────────────────
    const handleSaveSectionSettings = async (sectionId, fieldsArray) => {
        setSectionSaving(sectionId);
        const updateData = {};
        fieldsArray.forEach(field => {
            updateData[field] = editSettings[field] !== undefined ? editSettings[field] : '';
        });
        // ✅ Update in memory IMMEDIATELY — new passwords/codes work right away in the same session
        setSystemSettings(prev => ({ ...prev, ...updateData }));
        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            // setDoc with merge works even if the document doesn't exist yet
            await setDoc(settingsRef, updateData, { merge: true });
            toast.success(isAr ? 'تم الحفظ بنجاح ✅' : 'Saved ✅');

            addAuditLog(
                `قام بتحديث إعدادات القسم (${sectionId})`,
                `Updated settings for section (${sectionId})`,
                { sectionId }
            );
        } catch {
            toast.error(isAr ? 'فشل الحفظ — البيانات مُحدَّث محلياً' : 'Save failed — data updated locally');
        } finally {
            setSectionSaving('');
        }
    };

    // ── ARCHIVE FUNCTIONS ─────────────────────────────────────────
    const fetchArchives = async () => {
        setArchivesLoading(true);
        try {
            const q = query(collection(db, 'campaignArchives'), orderBy('archivedAt', 'desc'));
            const snap = await getDocs(q);
            setArchives(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error fetching archives:', e);
        } finally {
            setArchivesLoading(false);
        }
    };

    const fetchDeletedItems = async () => {
        setDeletedItemsLoading(true);
        try {
            const q = query(collection(db, 'deletedItems'), orderBy('deletedAt', 'desc'));
            const snap = await getDocs(q);
            setDeletedItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error fetching deleted items:', e);
        } finally {
            setDeletedItemsLoading(false);
        }
    };

    const moveToDeletedItems = async (collectionName, itemId, itemData, reason) => {
        const deletedBy = loggedInUser?.username || 'admin';
        const deletedByName = loggedInUser?.nameAr || loggedInUser?.nameEn || deletedBy;
        const deletedAt = serverTimestamp();
        await updateDoc(doc(db, collectionName, itemId), {
            deleted: true,
            deletedAt,
            deletedBy,
            deletedByName,
            deletionReason: reason
        });
        await setDoc(doc(db, 'deletedItems', `${collectionName}_${itemId}`), {
            originalCollection: collectionName,
            originalId: itemId,
            itemData: { ...itemData, deleted: true, deletedAt, deletedBy, deletedByName, deletionReason: reason },
            reason,
            deletedBy,
            deletedByName,
            deletedAt
        }, { merge: true });
    };

    const handleRestoreDeletedItem = async (item) => {
        if (!isAdminUser) return;
        try {
            const restoredData = { ...item.itemData, deleted: false, deletedAt: null, deletedBy: null, deletedByName: null, deletionReason: null };
            await setDoc(doc(db, item.originalCollection, item.originalId), restoredData, { merge: true });
            await updateDoc(doc(db, 'deletedItems', item.id), { restored: true, restoredAt: serverTimestamp(), restoredBy: loggedInUser?.username || 'admin' });
            toast.success(isAr ? 'تمت استعادة العنصر بنجاح' : 'Item restored successfully');
            fetchDeletedItems();
            if (item.originalCollection === 'materialDonations') fetchAllDonations();
            if (item.originalCollection === 'deliverySchedules') fetchDeliverySchedules();
        } catch (e) {
            console.error('Error restoring deleted item:', e);
            toast.error(isAr ? 'فشلت استعادة العنصر' : 'Failed to restore item');
        }
    };

    // ── AUDIT LOG FUNCTIONS ───────────────────────────────────────
    const addAuditLog = async (actionAr, actionEn, details = {}) => {
        if (!loggedInUser) return;
        try {
            await addDoc(collection(db, 'materialExchangeLogs'), {
                operatorId: loggedInUser.username,
                operatorNameAr: loggedInUser.nameAr || loggedInUser.username,
                operatorNameEn: loggedInUser.nameEn || loggedInUser.username,
                actionAr,
                actionEn,
                details,
                timestamp: serverTimestamp()
            });
            // Increment persistent totalActions counter in staff_status for accurate all-time counts
            const statusRef = doc(db, 'staff_status', loggedInUser.username);
            updateDoc(statusRef, { totalActions: increment(1) }).catch(() =>
                setDoc(statusRef, { totalActions: 1 }, { merge: true })
            );
        } catch (error) {
            console.error('Error adding audit log:', error);
        }
    };

    const fetchAuditLogs = async () => {
        setLogsLoading(true);
        try {
            const q = query(
                collection(db, 'materialExchangeLogs'),
                orderBy('timestamp', 'desc'),
                limit(150)
            );
            const snapshot = await getDocs(q);
            setAuditLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        } finally {
            setLogsLoading(false);
        }
    };

    // fetchStaffStatuses replaced by real-time onSnapshot listener (see useEffect above)
    // Kept as no-op to avoid breaking any residual call-sites
    const fetchStaffStatuses = () => { };

    const handleArchiveCampaign = async () => {
        if (!archiveName.trim()) {
            toast.error(isAr ? 'يرجى إدخال اسم الأرشيف' : 'Please enter an archive name');
            return;
        }
        try {
            const deliverySchedulesData = deliverySchedules.map(s => ({
                id: s.id || '',
                donorName: s.donorName || '',
                donorPhone: s.donorPhone || '',
                donorGender: s.donorGender || '',
                takerName: s.takerName || s.takerInfo?.name || '',
                takerPhone: s.takerPhone || s.takerInfo?.phone || '',
                takerGender: s.takerGender || s.takerInfo?.gender || '',
                materialName: s.materialName || '',
                pickupDate: s.pickupDate || '',
                pickupTime: s.pickupTime || '',
                status: s.status || '',
                coordinatorId: s.coordinatorId || '',
                coordinatorName: s.coordinatorName || '',
                createdAt: s.createdAt || null
            }));

            await addDoc(collection(db, 'campaignArchives'), {
                label: archiveName.trim(),
                archivedAt: new Date(),
                totalDonations: allDonations.length,
                totalDeliverySchedules: deliverySchedules.length,
                donationsData: allDonations.map(d => ({
                    id: d.id || '',
                    studentName: d.studentName || '',
                    phoneNumber: d.phoneNumber || '',
                    studentGender: d.studentGender || '',
                    status: d.status || '',
                    materials: (d.materials || []).map(m => {
                        if (typeof m === 'object' && m !== null) {
                            return {
                                name: m.name || '',
                                description: m.description || '',
                                status: m.status || 'pending',
                                takerInfo: m.takerInfo ? {
                                    name: m.takerInfo.name || '',
                                    phone: m.takerInfo.phone || '',
                                    gender: m.takerInfo.gender || ''
                                } : null
                            };
                        }
                        return { name: String(m), description: '', status: 'pending', takerInfo: null };
                    }),
                    createdAt: d.createdAt || null
                })),
                deliverySchedulesData
            });

            await Promise.all([
                ...allDonations.map(d => moveToDeletedItems('materialDonations', d.id, d, 'campaign-archive')),
                ...deliverySchedules.map(s => moveToDeletedItems('deliverySchedules', s.id, s, 'campaign-archive'))
            ]);

            toast.success(isAr
                ? `✅ تم أرشفة كافة أقسام الحملة (${allDonations.length} تبرعات و ${deliverySchedules.length} جداول تسليم) بنجاح تحت "${archiveName.trim()}"`
                : `✅ Archived all campaign sections (${allDonations.length} donations & ${deliverySchedules.length} schedules) as "${archiveName.trim()}"`);
            setShowArchiveModal(false);
            setArchiveName('');
            fetchArchives();
            fetchDonations();
            fetchAllDonations();
            fetchDeliverySchedules();
            fetchDeletedItems();

            addAuditLog(
                `قام بأرشفة كافة التبرعات وجداول التسليم (${allDonations.length} تبرعات و ${deliverySchedules.length} جداول) تحت اسم الأرشيف "${archiveName.trim()}" وبدأ دورة جديدة`,
                `Archived all donations and delivery schedules (${allDonations.length} donations & ${deliverySchedules.length} schedules) under "${archiveName.trim()}" and started a new cycle`,
                { archiveName: archiveName.trim(), donationsCount: allDonations.length, schedulesCount: deliverySchedules.length }
            );
        } catch (e) {
            console.error('Archive error:', e);
            toast.error(isAr ? 'فشلت عملي الأرشف' : 'Archiving failed');
        }
    };

    // ── EXPORT FUNCTIONS ──────────────────────────────────────────
    const exportToCSV = (donations, filename) => {
        const headersAr = ['الاسم', 'الهاتف', 'البريد الإلكتروني', 'الجنس', 'المواد', 'الملاحظات', 'الحال'];
        const headersEn = ['Name', 'Phone', 'Email', 'Gender', 'Materials', 'Notes', 'Status'];
        const headers = isAr ? headersAr : headersEn;
        const statusMap = {
            pending: isAr ? 'معلق' : 'Pending',
            approved: isAr ? 'معتمد' : 'Approved',
            reserved: isAr ? 'محجوز' : 'Reserved',
            completed: isAr ? 'مكتمل' : 'Completed'
        };
        const rows = donations.map(d => {
            const materialLabels = (d.materials || []).map(m => {
                if (typeof m === 'object') {
                    return m.description ? `${m.name} (${m.description})` : m.name;
                }
                return m;
            }).join(' | ');
            const materialNotes = (d.materials || []).map(m => typeof m === 'object' ? (m.description || '') : '').filter(Boolean).join(' | ');
            return [
                d.studentName || '',
                d.phoneNumber || '',
                d.email || '',
                d.studentGender === 'male' ? (isAr ? 'ذكر' : 'Male') : (isAr ? 'أنثى' : 'Female'),
                materialLabels,
                materialNotes,
                statusMap[d.status] || d.status || ''
            ];
        });
        const csv = [headers, ...rows]
            .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(isAr ? '✅ تم تصدير ملف Excel/CSV' : '✅ CSV exported');
    };

    const exportToPDF = (donations, filename) => {
        const getStatusHTML = (status) => {
            if (status === 'completed') return `<span class="badge delivered">${isAr ? 'تم التسليم' : 'Delivered'}</span>`;
            if (status === 'reserved') return `<span class="badge reserved">${isAr ? 'محجوز' : 'Reserved'}</span>`;
            if (status === 'approved') return `<span class="badge donated">${isAr ? 'معتمد' : 'Approved'}</span>`;
            return `<span class="badge pending">${isAr ? 'معلق' : 'Pending'}</span>`;
        };

        const approved = donations.filter(d => d.status === 'approved').length;
        const reserved = donations.reduce((acc, d) => acc + (d.materials || []).filter(m => (typeof m === 'object' ? m.status : d.status) === 'reserved').length, 0);
        const completed = donations.reduce((acc, d) => acc + (d.materials || []).filter(m => (typeof m === 'object' ? m.status : d.status) === 'completed').length, 0);

        const getCoordinatorLabel = (d) => {
            const delegate = d.delegatedTo || (d.studentGender === 'male' ? 'ahmad' : 'sara');
            if (delegate === 'ahmad') return `\u2642\uFE0F ${systemSettings.ahmadNameAr || '\u0623\u062D\u0645\u062F'}`;
            if (delegate === 'sara') return `\u2640\uFE0F ${systemSettings.saraNameAr || '\u0633\u0627\u0631\u0629'}`;
            return '\u2014';
        };

        const matRows = [];
        donations.forEach(d => {
            const mats = Array.isArray(d.materials) && d.materials.length > 0 ? d.materials : [null];
            mats.forEach(m => {
                const matName = m ? (typeof m === 'object' ? (m.name || '\u2014') : String(m)) : '\u2014';
                const matDesc = m && typeof m === 'object' ? (m.description || '\u2014') : '\u2014';
                const matSt = m && typeof m === 'object' ? (m.status || d.status) : d.status;
                const classLabel = matSt === 'completed'
                    ? (isAr ? '\u0645\u0633\u0644\u0651\u0645\u0629' : 'Delivered')
                    : matSt === 'reserved'
                        ? (isAr ? '\u0645\u062D\u062C\u0648\u0632\u0629' : 'Reserved')
                        : (isAr ? '\u0645\u062A\u0628\u0631\u0651\u0639 \u0628\u0647\u0627' : 'Available');
                const coord = getCoordinatorLabel(d);
                matRows.push(`
                <tr>
                    <td style="font-weight:600;">${d.studentName || ''}</td>
                    <td dir="ltr" class="phone-cell">${d.phoneNumber || ''}</td>
                    <td style="font-weight:600; color:#1b2a3c;">${matName}</td>
                    <td style="color:#5c6b7a; font-size:12.5px;">${matDesc}</td>
                    <td>${classLabel}</td>
                    <td style="font-weight:600;">${coord}</td>
                    <td>${getStatusHTML(matSt)}</td>
                </tr>`);
            });
        });
        const tableRows = matRows.join('');
        const total = matRows.length;

        const title = isAr ? 'جدول تبرعات المواد الدراسي' : 'Material Donations Table';
        const dateStr = new Date().toLocaleDateString(isAr ? 'ar-JO' : 'en-US');
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
    <meta charset="utf-8">
    <title>${filename}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap');
        body{font-family:'Tajawal','Tahoma','Arial',sans-serif;padding:24px;direction:${isAr ? 'rtl' : 'ltr'};color:#222;background:#f2f4f7;margin:0;}
        .no-print{margin-bottom:20px;max-width:1120px;margin-left:auto;margin-right:auto;display:flex;justify-content:flex-start;}
        .print-button{padding:10px 24px;background:#1B2A3C;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;box-shadow:0 4px 14px rgba(27,42,60,0.25);transition:all 0.2s ease;}
        .print-button:hover{transform:translateY(-1px);background:#253a52;}
        .report-sheet{position:relative;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:1rem;}
        .sheet{background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(17,24,39,0.08),0 16px 50px rgba(17,24,39,0.12);position:relative;}
        .accent-bar{height:6px;background:linear-gradient(90deg, #1B2A3C 0%, #C08A2E 100%);}
        .ribbon{position:absolute;top:18px;left:-42px;transform:rotate(-45deg);background:#c08a2e;color:#fff;font-size:11px;font-weight:700;padding:4px 46px;box-shadow:0 2px 6px rgba(0,0,0,0.15);}
        header{background:#1B2A3C;color:#ffffff;padding:28px 36px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
        header .title-block h1{font-size:24px;margin:0 0 6px;font-weight:700;}
        header .title-block p{margin:0;font-size:13px;color:#c7d0da;}
        header .meta{text-align:left;font-size:12.5px;color:#c7d0da;line-height:1.9;white-space:nowrap;}
        header .meta b{color:#fff;font-weight:600;}
        header .meta .report-no{display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:3px 10px;font-weight:600;color:#f1dfb8;}
        .pilgrim{padding:24px 36px 8px;display:flex;gap:28px;flex-wrap:wrap;}
        .pilgrim-field{min-width:150px;flex:1;}
        .pilgrim-field span{display:block;font-size:11.5px;color:#5c6b7a;margin-bottom:4px;}
        .pilgrim-field b{font-weight:700;font-size:16px;color:#1b2a3c;}
        .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:20px 36px 4px;}
        .stat-card{border:1px solid #e4e0d4;border-radius:10px;padding:14px 16px;text-align:center;background:#fcfbf8;}
        .stat-card .num{font-weight:900;font-size:26px;line-height:1;margin-bottom:6px;}
        .stat-card.donated .num{color:#155e68;}
        .stat-card.reserved .num{color:#8a5e14;}
        .stat-card.delivered .num{color:#2e6b3f;}
        .stat-card .lbl{font-size:12.5px;color:#5c6b7a;}
        .section-title{padding:22px 36px 10px;font-weight:700;font-size:15.5px;color:#1b2a3c;display:flex;align-items:center;gap:8px;}
        .section-title::before{content:"";width:4px;height:16px;background:#c08a2e;border-radius:2px;display:inline-block;}
        table{width:calc(100% - 72px);margin:10px 36px 20px;border-collapse:collapse;background:#fff;border:1px solid #e4e0d4;}
        table thead th{background:#fcfbf8;color:#1b2a3c;font-weight:700;font-size:13px;padding:12px 14px;border-bottom:2px solid #e4e0d4;text-align:${isAr ? 'right' : 'left'};}
        table tbody td{padding:12px 14px;font-size:13px;color:#2f3d4f;border-bottom:1px solid #f0edf4;vertical-align:top;}
        table tbody tr:last-child td{border-bottom:none;}
        table tbody tr:nth-child(even){background:#fcfbf8;}
        .badge{display:inline-block;padding:4px 10px;font-size:11.5px;font-weight:700;border-radius:6px;text-align:center;}
        .badge.donated{background:#e8f1f1;color:#155e68;}
        .badge.reserved{background:#fbf0dc;color:#8a5e14;}
        .badge.delivered{background:#e9f3eb;color:#2e6b3f;}
        .badge.pending{background:#f1f5f9;color:#64748b;}
        footer{padding:24px 36px 28px;border-top:1px solid #f0edf4;display:flex;justify-content:space-between;align-items:center;gap:24px;}
        footer .note{font-size:12px;color:#6c7b8a;max-width:60%;line-height:1.6;}
        footer .system{text-align:left;font-size:12px;color:#6c7b8a;line-height:1.6;}
        footer .system b{color:#1b2a3c;font-weight:700;}
        @media print {
            @page {
                margin: 0;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            body {
                margin: 1.6cm 1.2cm;
                background: #f6f4ee !important;
            }
            .no-print {
                display: none !important;
            }
            .sheet {
                box-shadow: none !important;
                border-radius: 14px !important;
                border: 1px solid #e4e0d4 !important;
            }
        }
    </style>
</head>
<body>
<div class="no-print">
    <button class="print-button" onclick="window.print()">🖨️ ${isAr ? 'طباع / حفظ PDF' : 'Print / Save as PDF'}</button>
</div>
<div class="report-sheet">
    <div class="sheet">
        <div class="ribbon">${isAr ? 'إلكتروني' : 'Electronic'}</div>
        <div class="accent-bar"></div>

        <header>
            <div class="title-block">
                <h1>${title}</h1>
                <p>${isAr ? 'تقرير تفصيلي بجدول التبرعات المقدمة من الطلاب للثيم والمرحل الحالي.' : 'Detailed report of student donation records.'}</p>
            </div>
            <div class="meta">
                <div>${isAr ? 'تاريخخ التصدير:' : 'Export Date:'} <b>${dateStr}</b></div>
                <div>${isAr ? 'عدد السجلات:' : 'Total Records:'} <b>${total}</b></div>
                <div>${isAr ? 'المنسق المصدر:' : 'Issued By:'} <b>${loggedInUser?.name || (isAr ? 'فريق مكانك' : 'Makanak Team')}</b></div>
            </div>
        </header>

        <div class="pilgrim">
            <div class="pilgrim-field">
                <span>${isAr ? 'نوع التقرير' : 'Report Type'}</span>
                <b>${isAr ? 'سجلات التبرعات' : 'Donations Records'}</b>
            </div>
            <div class="pilgrim-field">
                <span>${isAr ? 'الحال العام' : 'General Status'}</span>
                <b><span style="color:#2ecc71;">${isAr ? 'نشط' : 'Active'}</span></b>
            </div>
            <div class="pilgrim-field">
                <span>${isAr ? 'المرحل الحالي' : 'Current Phase'}</span>
                <b>${systemSettings.campaignPhase === 'collection' ? (isAr ? 'جمع المواد' : 'Collection') : (systemSettings.campaignPhase === 'exchange' ? (isAr ? 'تبادل وحجز' : 'Exchange') : (isAr ? 'موقوف' : 'Suspended'))}</b>
            </div>
        </div>

        {/* Summary Stats Cards */}
        <div class="stats">
            <div class="stat-card donated">
                <div class="num">${approved}</div>
                <div class="lbl">${isAr ? 'تبرعات معتمد ومتاح' : 'Approved Donations'}</div>
            </div>
            <div class="stat-card reserved">
                <div class="num">${reserved}</div>
                <div class="lbl">${isAr ? 'مواد محجوز' : 'Reserved Materials'}</div>
            </div>
            <div class="stat-card delivered">
                <div class="num">${completed}</div>
                <div class="lbl">${isAr ? 'مواد مسلّم' : 'Delivered Materials'}</div>
            </div>
        </div>

        <div class="section-title">${isAr ? 'تفاصيل السجلات' : 'Records Details'}</div>
        <table>
            <thead>
                <tr>
                    <th>${isAr ? 'اسم المختبرع' : 'Donor Name'}</th>
                    <th>${isAr ? 'الهاتف' : 'Phone'}</th>
                    <th>${isAr ? 'اسم المادة' : 'Material Name'}</th>
                    <th>${isAr ? 'الملاحظات' : 'Notes'}</th>
                    <th>${isAr ? 'التصنيف' : 'Classification'}</th>
                    <th>${isAr ? 'المنسق المعني' : 'Coordinator'}</th>
                    <th>${isAr ? 'الحال' : 'Status'}</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>

        <footer>
            <div class="note">
                ${isAr ? 'يرجى الاحتفاظ بهذا الكشف ومشاركته عند التواصل مع فريق التنسيق. هذا المستند صادر إلكترونياً من نظام مكانك، ولا يحتاج إلى تم أو توقيع لاعتماده.' : 'Please keep this report and share it when contacting the coordination team. This document is issued electronically from the Makanak system and does not require a stamp or signature for validation.'}
            </div>
            <div class="system">
                <b>${isAr ? 'نظام مكانك' : 'Makanak System'}</b><br>
                ${isAr ? 'تقرير آلي - لا يُعتمد به كوثيق رسمي بديل عن السجل الأصلي' : 'Automated report - Not considered as a formal document replacement'}
            </div>
        </footer>
    </div>
</div>
</body></html>`);
        win.document.close();
        toast.success(isAr ? '✅ تم فتح نافذ الطباع' : '✅ Print window opened');
    };

    const exportBookingsToCSV = (bookings, filename) => {
        const headersAr = ['اسم الحاجز', 'هاتف الحاجز', 'البريد الإلكتروني', 'الجنس', 'المادة', 'ملاحظات المادة', 'اسم المختبرع', 'بريد المختبرع', 'الحال'];
        const headersEn = ['Booker Name', 'Booker Phone', 'Booker Email', 'Gender', 'Material', 'Material Notes', 'Donor Name', 'Donor Email', 'Status'];
        const headers = isAr ? headersAr : headersEn;
        const statusMap = {
            reserved: isAr ? 'محجوز' : 'Reserved',
            completed: isAr ? 'تم التسليم' : 'Delivered'
        };
        const rows = bookings.map(b => [
            b.takerInfo?.name || '',
            b.takerInfo?.phone || '',
            b.takerEmail || '',
            (b.takerInfo?.gender || b.donorGender) === 'male' ? (isAr ? 'ذكر' : 'Male') : (isAr ? 'أنثى' : 'Female'),
            b.materialName || '',
            b.materialDescription || '',
            b.donorName || '',
            b.donorEmail || '',
            statusMap[b.status] || b.status || ''
        ]);
        const csv = [headers, ...rows]
            .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(isAr ? '✅ تم تصدير ملف Excel/CSV' : '✅ CSV exported');
    };

    const exportBookingsToPDF = (bookings, filename) => {
        const getStatusHTML = (status) => {
            if (status === 'completed') return `<span class="badge delivered">${isAr ? 'تم التسليم' : 'Delivered'}</span>`;
            if (status === 'reserved') return `<span class="badge reserved">${isAr ? 'محجوز' : 'Reserved'}</span>`;
            return `<span class="badge pending">${isAr ? 'معلق' : 'Pending'}</span>`;
        };

        const total = bookings.length;
        const reserved = bookings.filter(b => b.status === 'reserved').length;
        const completed = bookings.filter(b => b.status === 'completed').length;

        const tableRows = bookings.map(b => `
            <tr>
                <td style="font-weight:600;">${b.takerInfo?.name || ''}</td>
                <td dir="ltr" class="phone-cell">${b.takerInfo?.phone || ''}</td>
                <td dir="ltr">${b.takerEmail || '—'}</td>
                <td>${(b.takerInfo?.gender || b.donorGender) === 'male' ? (isAr ? 'ذكر' : 'Male') : (isAr ? 'أنثى' : 'Female')}</td>
                <td style="font-weight:600; color:#1b2a3c;">${b.materialName || ''}</td>
                <td style="color:#5c6b7a; font-size:12px;">${b.materialDescription || '—'}</td>
                <td>${b.donorName || ''}</td>
                <td dir="ltr">${b.donorEmail || '—'}</td>
                <td>${getStatusHTML(b.status)}</td>
            </tr>`).join('');

        const title = isAr ? 'جدول الحجوزات الطلابي' : 'Student Bookings Table';
        const dateStr = new Date().toLocaleDateString(isAr ? 'ar-JO' : 'en-US');
        const win = window.open('', '_blank');
        win.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
    <meta charset="utf-8">
    <title>${filename}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap');
        body{font-family:'Tajawal','Tahoma','Arial',sans-serif;padding:24px;direction:${isAr ? 'rtl' : 'ltr'};color:#222;background:#f2f4f7;margin:0;}
        .no-print{margin-bottom:20px;max-width:1120px;margin-left:auto;margin-right:auto;display:flex;justify-content:flex-start;}
        .print-button{padding:10px 24px;background:#1B2A3C;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;font-family:inherit;box-shadow:0 4px 14px rgba(27,42,60,0.25);transition:all 0.2s ease;}
        .print-button:hover{transform:translateY(-1px);background:#253a52;}
        .report-sheet{position:relative;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:1rem;}
        .sheet{background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(17,24,39,0.08),0 16px 50px rgba(17,24,39,0.12);position:relative;}
        .accent-bar{height:6px;background:linear-gradient(90deg, #1B2A3C 0%, #C08A2E 100%);}
        .ribbon{position:absolute;top:18px;left:-42px;transform:rotate(-45deg);background:#c08a2e;color:#fff;font-size:11px;font-weight:700;padding:4px 46px;box-shadow:0 2px 6px rgba(0,0,0,0.15);}
        header{background:#1B2A3C;color:#ffffff;padding:28px 36px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
        header .title-block h1{font-size:24px;margin:0 0 6px;font-weight:700;}
        header .title-block p{margin:0;font-size:13px;color:#c7d0da;}
        header .meta{text-align:left;font-size:12.5px;color:#c7d0da;line-height:1.9;white-space:nowrap;}
        header .meta b{color:#fff;font-weight:600;}
        header .meta .report-no{display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:3px 10px;font-weight:600;color:#f1dfb8;}
        .pilgrim{padding:24px 36px 8px;display:flex;gap:28px;flex-wrap:wrap;}
        .pilgrim-field{min-width:150px;flex:1;}
        .pilgrim-field span{display:block;font-size:11.5px;color:#5c6b7a;margin-bottom:4px;}
        .pilgrim-field b{font-weight:700;font-size:16px;color:#1b2a3c;}
        .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;padding:20px 36px 4px;}
        .stat-card{border:1px solid #e4e0d4;border-radius:10px;padding:14px 16px;text-align:center;background:#fcfbf8;}
        .stat-card .num{font-weight:900;font-size:26px;line-height:1;margin-bottom:6px;}
        .stat-card.donated .num{color:#155e68;}
        .stat-card.reserved .num{color:#8a5e14;}
        .stat-card.delivered .num{color:#2e6b3f;}
        .stat-card .lbl{font-size:12.5px;color:#5c6b7a;}
        .section-title{padding:22px 36px 10px;font-weight:700;font-size:15.5px;color:#1b2a3c;display:flex;align-items:center;gap:8px;}
        .section-title::before{content:"";width:4px;height:16px;background:#c08a2e;border-radius:2px;display:inline-block;}
        table{width:calc(100% - 72px);margin:10px 36px 20px;border-collapse:collapse;background:#fff;border:1px solid #e4e0d4;}
        table thead th{background:#fcfbf8;color:#1b2a3c;font-weight:700;font-size:13px;padding:12px 14px;border-bottom:2px solid #e4e0d4;text-align:${isAr ? 'right' : 'left'};}
        table tbody td{padding:12px 14px;font-size:13px;color:#2f3d4f;border-bottom:1px solid #f0edf4;vertical-align:top;}
        table tbody tr:last-child td{border-bottom:none;}
        table tbody tr:nth-child(even){background:#fcfbf8;}
        .badge{display:inline-block;padding:4px 10px;font-size:11.5px;font-weight:700;border-radius:6px;text-align:center;}
        .badge.donated{background:#e8f1f1;color:#155e68;}
        .badge.reserved{background:#fbf0dc;color:#8a5e14;}
        .badge.delivered{background:#e9f3eb;color:#2e6b3f;}
        .badge.pending{background:#f1f5f9;color:#64748b;}
        footer{padding:24px 36px 28px;border-top:1px solid #f0edf4;display:flex;justify-content:space-between;align-items:center;gap:24px;}
        footer .note{font-size:12px;color:#6c7b8a;max-width:60%;line-height:1.6;}
        footer .system{text-align:left;font-size:12px;color:#6c7b8a;line-height:1.6;}
        footer .system b{color:#1b2a3c;font-weight:700;}
        @media print {
            @page {
                margin: 0;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            body {
                margin: 1.6cm 1.2cm;
                background: #f6f4ee !important;
            }
            .no-print {
                display: none !important;
            }
            .sheet {
                box-shadow: none !important;
                border-radius: 14px !important;
                border: 1px solid #e4e0d4 !important;
            }
        }
    </style>
</head>
<body>
<div class="no-print">
    <button class="print-button" onclick="window.print()">🖨️ ${isAr ? 'طباع / حفظ PDF' : 'Print / Save as PDF'}</button>
</div>
<div class="report-sheet">
    <div class="sheet">
        <div class="ribbon">${isAr ? 'إلكتروني' : 'Electronic'}</div>
        <div class="accent-bar"></div>

        <header>
            <div class="title-block">
                <h1>${title}</h1>
                <p>${isAr ? 'تقرير تفصيلي بجدول الحجوزات الطلابي للمرحل الحالي.' : 'Detailed report of student booking records.'}</p>
            </div>
            <div class="meta">
                <div>${isAr ? 'تاريخخ التصدير:' : 'Export Date:'} <b>${dateStr}</b></div>
                <div>${isAr ? 'عدد الحجوزات:' : 'Total Bookings:'} <b>${total}</b></div>
                <div>${isAr ? 'المنسق المصدر:' : 'Issued By:'} <b>${loggedInUser?.name || (isAr ? 'فريق مكانك' : 'Makanak Team')}</b></div>
            </div>
        </header>

        <div class="pilgrim">
            <div class="pilgrim-field">
                <span>${isAr ? 'نوع التقرير' : 'Report Type'}</span>
                <b>${isAr ? 'سجلات الحجوزات' : 'Bookings Records'}</b>
            </div>
            <div class="pilgrim-field">
                <span>${isAr ? 'الحال العام' : 'General Status'}</span>
                <b><span style="color:#e67e22;">${isAr ? 'نشط' : 'Active'}</span></b>
            </div>
            <div class="pilgrim-field">
                <span>${isAr ? 'المرحل الحالي' : 'Current Phase'}</span>
                <b>${systemSettings.campaignPhase === 'collection' ? (isAr ? 'جمع المواد' : 'Collection') : (systemSettings.campaignPhase === 'exchange' ? (isAr ? 'تبادل وحجز' : 'Exchange') : (isAr ? 'موقوف' : 'Suspended'))}</b>
            </div>
        </div>

        {/* Summary Stats Cards */}
        <div class="stats">
            <div class="stat-card donated">
                <div class="num">${total}</div>
                <div class="lbl">${isAr ? 'إجمالي الحجوزات' : 'Total Bookings'}</div>
            </div>
            <div class="stat-card reserved">
                <div class="num">${reserved}</div>
                <div class="lbl">${isAr ? 'حجوزات قيد التسليم' : 'Pending Handovers'}</div>
            </div>
            <div class="stat-card delivered">
                <div class="num">${completed}</div>
                <div class="lbl">${isAr ? 'حجوزات تم تسليمها' : 'Delivered Handovers'}</div>
            </div>
        </div>

        <div class="section-title">${isAr ? 'تفاصيل السجلات' : 'Records Details'}</div>
        <table>
            <thead>
                <tr>
                    <th>${isAr ? 'اسم الحاجز' : 'Booker Name'}</th>
                    <th>${isAr ? 'الهاتف' : 'Phone'}</th>
                    <th>${isAr ? 'البريد' : 'Email'}</th>
                    <th>${isAr ? 'الجنس' : 'Gender'}</th>
                    <th>${isAr ? 'المادة' : 'Material'}</th>
                    <th>${isAr ? 'ملاحظات المادة' : 'Material Notes'}</th>
                    <th>${isAr ? 'اسم المختبرع' : 'Donor Name'}</th>
                    <th>${isAr ? 'بريد المختبرع' : 'Donor Email'}</th>
                    <th>${isAr ? 'الحال' : 'Status'}</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>

        <footer>
            <div class="note">
                ${isAr ? 'يرجى الاحتفاظ بهذا الكشف ومشاركته عند التواصل مع فريق التنسيق. هذا المستند صادر إلكترونياً من نظام مكانك، ولا يحتاج إلى تم أو توقيع لاعتماده.' : 'Please keep this report and share it when contacting the coordination team. This document is issued electronically from the Makanak system and does not require a stamp or signature for validation.'}
            </div>
            <div class="system">
                <b>${isAr ? 'نظام مكانك' : 'Makanak System'}</b><br>
                ${isAr ? 'تقرير آلي - لا يُعتمد به كوثيق رسمي بديل عن السجل الأصلي' : 'Automated report - Not considered as a formal document replacement'}
            </div>
        </footer>
    </div>
</div>
</body></html>`);
        win.document.close();
        toast.success(isAr ? '✅ تم فتح نافذ الطباع' : '✅ Print window opened');
    };

    const printDailyReport = (dateStr, dayLabel) => {
        const daySchedules = deliverySchedules.filter(s => s.pickupDate === dateStr);

        const tableRows = daySchedules.map((s, idx) => {
            const coordinator = s.assignedCoordinator === 'ahmad' ? (isAr ? (systemSettings.ahmadNameAr || 'علي') : 'Ali')
                : s.assignedCoordinator === 'sara' ? (isAr ? (systemSettings.saraNameAr || 'سندس') : 'Sondos')
                    : s.assignedCoordinator || '—';

            const deliverer = s.finalDeliveryBy === 'ahmad' ? (isAr ? (systemSettings.ahmadNameAr || 'علي') : 'Ali')
                : s.finalDeliveryBy === 'sara' ? (isAr ? (systemSettings.saraNameAr || 'سندس') : 'Sondos')
                    : s.finalDeliveryBy === 'admin' ? (isAr ? 'الأدمن حسين' : 'Admin Hussein')
                        : s.finalDeliveryBy || '—';

            const statusLabel = s.status === 'completed' ? (isAr ? 'تم التسليم' : 'Delivered')
                : s.status === 'scheduled' ? (isAr ? 'مؤكد' : 'Confirmed')
                    : s.status === 'contacted' ? (isAr ? 'تم التواصل' : 'Contacted')
                        : (isAr ? 'لم يُتواصل بعد' : 'Not Contacted');

            const statusClass = s.status;

            return `
                <tr>
                    <td style="text-align:center; font-weight:bold; border-bottom:1px solid #e4e0d4; padding:10px;">${idx + 1}</td>
                    <td style="font-weight:600; color:#1b2a3c; border-bottom:1px solid #e4e0d4; padding:10px;">${s.materialName || '—'}</td>
                    <td style="border-bottom:1px solid #e4e0d4; padding:10px;">
                        <div style="font-weight:600;">${s.donorName || '—'}</div>
                        <div style="font-size:11.5px; color:#5c6b7a;" dir="ltr">${s.donorPhone || '—'}</div>
                    </td>
                    <td style="border-bottom:1px solid #e4e0d4; padding:10px;">
                        <div style="font-weight:600;">${s.bookerName || '—'}</div>
                        <div style="font-size:11.5px; color:#5c6b7a;" dir="ltr">${s.bookerPhone || '—'}</div>
                    </td>
                    <td style="text-align:center; border-bottom:1px solid #e4e0d4; padding:10px;">
                        <span style="display:block; font-weight:600;">${coordinator}</span>
                        ${s.pickupTime ? `<span style="font-size:11px; color:#c08a2e;">⏰ ${s.pickupTime}</span>` : ''}
                    </td>
                    <td style="text-align:center; font-weight:600; color:#e67e22; border-bottom:1px solid #e4e0d4; padding:10px;">${deliverer}</td>
                    <td style="text-align:center; border-bottom:1px solid #e4e0d4; padding:10px;">
                        <span class="badge ${statusClass}">${statusLabel}</span>
                    </td>
                    <td style="font-size:11.5px; color:#5c6b7a; border-bottom:1px solid #e4e0d4; padding:10px; max-width:150px; word-break:break-word;">${s.notes || '—'}</td>
                </tr>
            `;
        }).join('');

        const win = window.open('', '_blank');
        const formattedDate = new Date(dateStr + 'T00:00:00').toLocaleDateString(isAr ? 'ar-JO' : 'en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        win.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
    <meta charset="utf-8">
    <title>${isAr ? 'كشف تسليم يوم' : 'Distribution Report'} - ${dayLabel}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');
        body{font-family:'IBM Plex Sans Arabic','Tajawal',sans-serif;padding:24px;direction:${isAr ? 'rtl' : 'ltr'};color:#1B2A3C;background:#f6f4ee;margin:0;}
        .no-print{margin-bottom:20px;max-width:1120px;margin-left:auto;margin-right:auto;display:flex;justify-content:flex-start;}
        .print-button{padding:10px 24px;background:#1B2A3C;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;box-shadow:0 4px 14px rgba(27,42,60,0.25);transition:all 0.2s ease;font-family:inherit;}
        .print-button:hover{transform:translateY(-1px);background:#253a52;}
        .report-sheet{position:relative;max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:1rem;}
        .sheet{background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(17,24,39,0.08),0 16px 50px rgba(17,24,39,0.12);position:relative;}
        .accent-bar{height:6px;background:linear-gradient(90deg, #1B2A3C 0%, #C08A2E 100%);}
        .ribbon{position:absolute;top:18px;left:-42px;transform:rotate(-45deg);background:#c08a2e;color:#fff;font-size:11px;font-weight:700;padding:4px 46px;box-shadow:0 2px 6px rgba(0,0,0,0.15);}
        header{background:#1B2A3C;color:#ffffff;padding:28px 36px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
        header *{color:#fff !important;}
        header .title-block h1{font-family:'Tajawal',sans-serif;font-size:24px;margin:0 0 6px;font-weight:700;}
        header .title-block p{margin:0;font-size:13px;color:#c7d0da;}
        header .meta{text-align:left;font-size:12.5px;color:#c7d0da;line-height:1.9;white-space:nowrap;}
        header .meta b{color:#fff;font-weight:600;}
        header .meta .report-no{display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:3px 10px;font-weight:600;color:#f1dfb8;}
        .pilgrim{padding:24px 36px 8px;display:flex;gap:28px;flex-wrap:wrap;}
        .pilgrim-field{min-width:150px;flex:1;}
        .pilgrim-field span{display:block;font-size:11.5px;color:#5c6b7a;margin-bottom:4px;}
        .pilgrim-field b{font-family:'Tajawal',sans-serif;font-weight:700;font-size:16px;color:#1b2a3c;}
        .section-title{padding:22px 36px 10px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:15.5px;color:#1b2a3c;display:flex;align-items:center;gap:8px;}
        .section-title::before{content:"";width:4px;height:16px;background:#c08a2e;border-radius:2px;display:inline-block;}
        table{width:calc(100% - 72px);margin:10px 36px 20px;border-collapse:collapse;background:#fff;border:1px solid #e4e0d4;font-size:13.5px;}
        table thead th{background:#fcfbf8;color:#1b2a3c;font-weight:700;font-size:13px;padding:12px 14px;border-bottom:2px solid #e4e0d4;text-align:${isAr ? 'right' : 'left'};}
        table tbody td{padding:12px 14px;color:#2f3d4f;border-bottom:1px solid #f0edf4;vertical-align:middle;}
        table tbody tr:last-child td{border-bottom:none;}
        table tbody tr:nth-child(even){background:#fcfbf8;}
        .badge{display:inline-block;padding:4px 10px;font-size:11.5px;font-weight:700;border-radius:20px;text-align:center;}
        .badge.completed{background:#e9f3eb;color:#2e6b3f;}
        .badge.scheduled{background:#f3e8ff;color:#7e22ce;}
        .badge.contacted{background:#dbeafe;color:#1d4ed8;}
        .badge.pending_contact{background:#fef3c7;color:#d97706;}
        footer{padding:24px 36px 28px;border-top:1px solid #f0edf4;display:flex;justify-content:space-between;align-items:center;gap:24px;}
        footer .note{font-size:12px;color:#6c7b8a;max-width:60%;line-height:1.6;text-align:right;}
        footer .system{text-align:left;font-size:12px;color:#6c7b8a;line-height:1.6;}
        footer .system b{color:#1b2a3c;font-weight:700;}
        .empty-state{text-align:center;padding:40px;color:#5c6b7a;font-size:15px;}
        @media print {
            @page {
                margin: 0;
            }
            * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            body {
                margin: 1.6cm 1.2cm;
                background: #f6f4ee !important;
            }
            .no-print {
                display: none !important;
            }
            .sheet {
                box-shadow: none !important;
                border-radius: 14px !important;
                border: 1px solid #e4e0d4 !important;
            }
        }
    </style>
</head>
<body>
<div class="no-print">
    <button class="print-button" onclick="window.print()">🖨️ ${isAr ? 'طباع الكشف / حفظ PDF' : 'Print / Save as PDF'}</button>
</div>
<div class="report-sheet">
    <div class="sheet">
        <div class="ribbon">${isAr ? 'رسمي' : 'Official'}</div>
        <div class="accent-bar"></div>

        <header>
            <div class="title-block">
                <h1>${isAr ? `كشف حركة تسليم المواد — يوم ${dayLabel}` : `Material Handover Sheet — ${dayLabel}`}</h1>
                <p>${isAr ? 'تقرير تفصيلي بمواعيد الإحضار والتسليم المجدولة، متضمناً بيانات المختبرعين والحاجزين والمنسقين.' : 'Detailed report of scheduled pickups and deliveries.'}</p>
            </div>
            <div class="meta">
                <div>${isAr ? 'التاريخخ المجدول:' : 'Scheduled Date:'} <b>${formattedDate}</b></div>
                <div>${isAr ? 'عدد الحالات المجدولة:' : 'Scheduled count:'} <b>${daySchedules.length}</b></div>
                <div>${isAr ? 'المنسق المصدر:' : 'Issued By:'} <b>${loggedInUser?.name || (isAr ? 'فريق مكانك' : 'Makanak Team')}</b></div>
            </div>
        </header>

        <div class="pilgrim">
            <div class="pilgrim-field">
                <span>${isAr ? 'اليوم' : 'Day'}</span>
                <b>${dayLabel}</b>
            </div>
            <div class="pilgrim-field">
                <span>${isAr ? 'التاريخخ الهجري/الميلادي' : 'Date'}</span>
                <b>${formattedDate}</b>
            </div>
            <div class="pilgrim-field">
                <span>${isAr ? 'الحمل' : 'Campaign'}</span>
                <b>${isAr ? 'مكانك الجامعي 🎓' : 'Makanak'}</b>
            </div>
        </div>

        <div class="section-title">${isAr ? 'قائم التسليمات اليومي' : 'Daily Deliveries List'}</div>
        
        ${daySchedules.length === 0 ? `
            <div class="empty-state">
                📭 ${isAr ? 'لا توجد مواعيد تسليم مجدول لهذا اليوم.' : 'No deliveries scheduled for this day.'}
            </div>
        ` : `
            <table style="width:calc(100% - 72px); margin:10px 36px 20px; border-collapse:collapse; background:#fff; border:1px solid #e4e0d4; font-size:13.5px;">
                <thead>
                    <tr>
                        <th style="width:40px; text-align:center; padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4;">#</th>
                        <th style="padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4; text-align:${isAr ? 'right' : 'left'};">${isAr ? 'المادة' : 'Material'}</th>
                        <th style="padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4; text-align:${isAr ? 'right' : 'left'};">${isAr ? 'المختبرع وهاتفه' : 'Donor & Phone'}</th>
                        <th style="padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4; text-align:${isAr ? 'right' : 'left'};">${isAr ? 'الحاجز وهاتفه' : 'Booker & Phone'}</th>
                        <th style="text-align:center; padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4;">${isAr ? 'المنسق المعني' : 'Coordinator'}</th>
                        <th style="text-align:center; padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4;">${isAr ? 'التسليم النهائي' : 'Final Delivery'}</th>
                        <th style="text-align:center; padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4;">${isAr ? 'الحال' : 'Status'}</th>
                        <th style="padding:12px; background:#fcfbf8; border-bottom:2px solid #e4e0d4; text-align:${isAr ? 'right' : 'left'};">${isAr ? 'ملاحظات' : 'Notes'}</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `}

        <footer>
            <div class="note">
                ${isAr ? 'يرجى التنسيق والتأكد من استلام وتسليم المواد حسب السجل. هذا المستند صادر إلكترونياً من نظام مكانك الجامعي.' : 'Please coordinate handover according to the records. Issued electronically.'}
            </div>
            <div class="system">
                <div><b>${isAr ? 'نظام مكانك الجامعي' : 'Makanak System'}</b></div>
                <div>${isAr ? 'تقرير آلي للمتابع والتوزيع' : 'Automated distribution report'}</div>
            </div>
        </footer>
    </div>
</div>
</body>
</html>`);
        win.document.close();
        toast.success(isAr ? '✅ تم فتح نافذ طباع الكشف اليومي' : '✅ Daily print window opened');
    };

    const getCoordinatorTasks = () => {
        if (!loggedInUser) return [];
        let tasksStr = systemSettings.sharedCoordinatorTasks || '';
        if (loggedInUser.gender === 'male') tasksStr += '\n' + (systemSettings.coordinatorMaleTasks || '');
        if (loggedInUser.gender === 'female') tasksStr += '\n' + (systemSettings.coordinatorFemaleTasks || '');
        if (loggedInUser.role === 'admin') {
            tasksStr = '👥 مهام عام:\n' + (systemSettings.sharedCoordinatorTasks || '—') +
                '\n♂️ مهام أحمد:\n' + (systemSettings.coordinatorMaleTasks || '—') +
                '\n♀️ مهام سار:\n' + (systemSettings.coordinatorFemaleTasks || '—');
        }
        return tasksStr.split('\n').map(t => t.trim()).filter(Boolean);
    };

    const getTasksForUser = (username) => {
        let tasksStr = systemSettings.sharedCoordinatorTasks || '';
        if (username === 'ahmad') {
            tasksStr += '\n' + (systemSettings.coordinatorMaleTasks || '');
        } else if (username === 'sara') {
            tasksStr += '\n' + (systemSettings.coordinatorFemaleTasks || '');
        }
        return tasksStr.split('\n').map(t => t.trim()).filter(Boolean);
    };

    const handleToggleCoordinatorTask = async (taskKey) => {
        if (!loggedInUser) return;
        const username = loggedInUser.username;
        const currentCompletions = { ...taskCompletions };
        const userCompletions = { ...currentCompletions[username] };

        if (userCompletions[taskKey]) {
            delete userCompletions[taskKey];
        } else {
            userCompletions[taskKey] = new Date().toISOString();
        }

        const newCompletions = {
            ...currentCompletions,
            [username]: userCompletions
        };

        setTaskCompletions(newCompletions);

        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, { taskCompletions: newCompletions }, { merge: true });
            toast.success(isAr ? 'تم تحديث حال المهم' : 'Task status updated');
        } catch (error) {
            console.error('Error toggling task completion:', error);
            toast.error(isAr ? 'فشل تحديث حال المهم في قاعد البيانات' : 'Failed to update task status in database');
            setTaskCompletions(currentCompletions);
        }
    };

    const handleClearAllTaskCompletions = async () => {
        const clearedCompletions = { ahmad: {}, sara: {} };
        const currentCompletions = taskCompletions;

        setTaskCompletions(clearedCompletions);

        try {
            const settingsRef = doc(db, 'system_configs', 'global_settings');
            await setDoc(settingsRef, { taskCompletions: clearedCompletions }, { merge: true });
            toast.success(isAr ? 'تم مسح جميع الإنجازات' : 'All completions cleared');
        } catch (error) {
            console.error('Error clearing task completions:', error);
            toast.error(isAr ? 'فشل مسح الإنجازات من قاعد البيانات' : 'Failed to clear completions from database');
            setTaskCompletions(currentCompletions);
        }
    };

    const getDashboardAlerts = () => {
        const alerts = [];
        const pending = allDonations.filter(d => d.status === 'pending');
        if (pending.length > 0) {
            alerts.push({
                type: 'warning',
                icon: '⏳',
                text: isAr ? `${pending.length} طلب تبرع بانتظار المراجع` : `${pending.length} donation(s) pending review`
            });
        }
        const pendingApprovalRequests = allDonations.flatMap((donation) => (donation.adminApprovalRequests || [])
            .filter(req => req.status === 'pending'));
        if (pendingApprovalRequests.length > 0) {
            alerts.push({
                type: 'warning',
                icon: '🔔',
                text: isAr ? `هناك ${pendingApprovalRequests.length} طلبات منتظر` : `${pendingApprovalRequests.length} pending requests`
            });
        }
        const sharedHandoverCount = allDonations.reduce((count, donation) => {
            if (!donation.materials) return count;
            return count + (donation.materials || []).filter(m => typeof m === 'object' && (m.status === 'reserved' || m.status === 'completed') && donation.studentGender && m.takerInfo?.gender && m.takerInfo.gender !== donation.studentGender).length;
        }, 0);
        if (sharedHandoverCount > 0) {
            alerts.push({
                type: 'info',
                icon: '🤝',
                text: isAr ? `هناك ${sharedHandoverCount} تسليم مشترك يحتاج متابع` : `${sharedHandoverCount} cross-gender handover(s) need attention`
            });
        }
        return alerts;
    };

    // Derived
    const availableMaterials = allMaterials.filter(m => !m.isReserved && ['approved', 'pending'].includes(m.materialItem.status));
    const reservedMaterials = allMaterials.filter(m => m.materialItem.status === 'reserved');

    if (!loggedInUser) {
        return (
            <div className="material-exchange-page">
                <section className="exchange-hero" style={{ backgroundImage: `url(${exchangeHero})` }}>
                    <div className="hero-overlay"></div>
                    <div className="hero-content">
                        <h1>{isAr ? 'تبادل المواد الدراسي' : 'Material Exchange'}</h1>
                        <p>{isAr ? 'منصة رسمي لتبادل المواد التعليمي بين الطلاب بطريق منظم.' : 'A formal platform for organized academic material exchange among students.'}</p>
                    </div>
                </section>

                <div className="exchange-main-container">
                    <section className="add-material-section glass-card">
                        <div className="section-header">
                            <h2>{isAr ? 'تبرع الآن بالمواد' : 'Donate Materials'}</h2>
                            <p>{isAr ? 'شارك موادك الدراسي مع زملائك بصور مهني.' : 'Share your academic materials with peers in a professional way.'}</p>
                        </div>

                        {!settingsLoaded ? (
                            <div className="campaign-suspension-notice" style={{ opacity: 0.5 }}>
                                <p>{isAr ? 'جاري تحميل الإعدادات...' : 'Loading settings...'}</p>
                            </div>
                        ) : !systemSettings.isExchangeActive ? (
                            <div className="campaign-suspension-notice">
                                <h3>{isAr ? 'الحمل متوقف حالياً' : 'Campaign Currently Suspended'}</h3>
                                <p>{isAr ? systemSettings.exchangeSuspendedMessageAr : systemSettings.exchangeSuspendedMessageEn}</p>
                                <div className="suspension-footer">
                                    <span>{isAr ? 'نراكم الفصل القادم.' : 'See you next semester.'}</span>
                                </div>
                            </div>
                        ) : systemSettings.donationFormFrozen ? (
                            <div className="campaign-suspension-notice">
                                <h3>{isAr ? 'نموذج التبرع مغلق حالياً' : 'Donation Form Closed'}</h3>
                                <p>{isAr ? 'تم إيقاف استقبال التبرعات بالمواد مؤقتاً، مع بقاء إمكاني حجز المواد المتوفر أدناه.' : 'Receiving material donations is temporarily closed, while booking available materials below remains open.'}</p>
                            </div>
                        ) : (
                            <div className="public-page-placeholder">
                                <div className="public-exchange-summary">
                                    <div className="summary-marker"></div>
                                    <div>
                                        <h3>{isAr ? 'صفح تبادل المواد مفتوح الآن' : 'Material Exchange Page Is Open'}</h3>
                                        <p>{isAr ? 'يمكنك التبرع بموادك أو تقديم طلب مسبق بشكل منظم.' : 'You can donate materials or submit a pre-request in an organized manner.'}</p>
                                    </div>
                                </div>
                                <div className="public-callout-row">
                                    <span>{isAr ? 'المواد المتاح تُقدّم عن طريق تبرعات الطلاب' : 'Available materials are offered through student donations'}</span>
                                    <span>{isAr ? 'الطلبات المسبق تضع للمراجع في لوح التحكم' : 'Pre-requests are reviewed in the control panel'}</span>
                                    <span>{isAr ? 'يتم تأكيد الحجز عبر جه التنسيق الرسمي' : 'Booking is confirmed through the official coordination channel'}</span>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="pre-request-section glass-card">
                        <div className="section-header">
                            <h2>{isAr ? 'طلبات مسبقة' : 'Pre-Requests'}</h2>
                            <p>{isAr ? 'إذا كنت ترغب في التبرع بمواد أو تحتاج مادة معينة، أرسل طلباً مسبقاً. الطلبات تظهر فقط للطاقم الإداري في لوح التحكم.' : 'If you want to donate a material or need one, submit a pre-request. Requests are visible only to administrative staff in the control panel.'}</p>
                        </div>

                        <form className="pre-request-form" onSubmit={handlePreRequestSubmit}>
                            <div className="pre-request-toggle-row">
                                <button
                                    type="button"
                                    className={`pre-request-type-btn ${preRequestForm.type === 'donate' ? 'active' : ''}`}
                                    onClick={() => setPreRequestForm(prev => ({ ...prev, type: 'donate', acknowledgeUrgentNeed: false }))}
                                >
                                    {isAr ? 'أرغب في التبرع' : 'I want to donate'}
                                </button>
                                <button
                                    type="button"
                                    className={`pre-request-type-btn ${preRequestForm.type === 'need' ? 'active' : ''}`}
                                    onClick={() => setPreRequestForm(prev => ({ ...prev, type: 'need' }))}
                                >
                                    {isAr ? 'أحتاج مادة' : 'I need a material'}
                                </button>
                            </div>

                            <div className="pre-request-grid">
                                <input
                                    type="text"
                                    className="form-input"
                                    value={preRequestForm.studentName}
                                    onChange={(e) => setPreRequestForm(prev => ({ ...prev, studentName: e.target.value }))}
                                    placeholder={isAr ? 'اسم الطالب' : 'Student name'}
                                    required
                                />
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={preRequestForm.phoneNumber}
                                    onChange={(e) => setPreRequestForm(prev => ({ ...prev, phoneNumber: toEnglishNumerals(e.target.value) }))}
                                    placeholder="0790000000"
                                    required
                                    dir="ltr"
                                    maxLength="10"
                                />
                                <input
                                    type="text"
                                    className="form-input"
                                    value={preRequestForm.materialName}
                                    onChange={(e) => setPreRequestForm(prev => ({ ...prev, materialName: e.target.value }))}
                                    placeholder={isAr ? 'اسم المادة' : 'Material name'}
                                    required
                                />
                            </div>

                            <textarea
                                className="form-input"
                                rows="4"
                                value={preRequestForm.notes}
                                onChange={(e) => setPreRequestForm(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder={isAr ? 'ملاحظات' : 'Notes'}
                            ></textarea>

                            <div className="pre-request-terms">
                                <div className="terms-section-header">
                                    <h4>{isAr ? 'الاتفاقية والشروط الخاصة بتقديم طلب التبرع' : 'Terms and Conditions for Donation Request'}</h4>
                                    {preRequestForm.type === 'donate' && (
                                        <button
                                            type="button"
                                            className="view-terms-link"
                                            onClick={toggleTermsVisibility}
                                        >
                                            {isAr ? (showTermsModal ? 'إخفاء الشروط' : 'عرض الشروط') : (showTermsModal ? 'Hide Terms' : 'View Terms')}
                                        </button>
                                    )}
                                </div>

                                {preRequestForm.type === 'donate' && showTermsDetails && (
                                    <div className="terms-summary-box">
                                        <div className="terms-quick-header">
                                            <strong>{isAr ? 'الشروط الأساسية (يجب قراءتها):' : 'Key Terms (Must Read):'}</strong>
                                        </div>
                                        <div className="terms-quick-list">
                                            {isAr ? (
                                                <>
                                                    <div className="quick-item"><strong>الإرادة الكاملة:</strong> تقديم الطلب بمحض إرادتك</div>
                                                    <div className="quick-item"><strong>الجدية:</strong> لا توجد طلبات وهمية أو متكررة</div>
                                                    <div className="quick-item"><strong>الإلغاء:</strong> يجب إبلاغ الفريق قبل التسليم بـ 24 ساعة على الأقل</div>
                                                    <div className="quick-item"><strong>المسؤولية:</strong> أنت مسؤول عن المادة بعد التسليم</div>
                                                    <div className="quick-item"><strong>التواصل:</strong> فقط من قبل المنسق الرسمي (واتس آب)</div>
                                                    <div className="quick-item"><strong>الخصوصية:</strong> لن يتم نشر بياناتك الشخصية</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="quick-item"><strong>Full Consent:</strong> Submit request of your own free will</div>
                                                    <div className="quick-item"><strong>Seriousness:</strong> No fake or duplicate requests allowed</div>
                                                    <div className="quick-item"><strong>Cancellation:</strong> Notify team at least 24 hours before delivery</div>
                                                    <div className="quick-item"><strong>Responsibility:</strong> You are responsible for the material after delivery</div>
                                                    <div className="quick-item"><strong>Communication:</strong> Only through official coordinator (WhatsApp)</div>
                                                    <div className="quick-item"><strong>Privacy:</strong> Your personal data will not be published</div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <label className="terms-label agreement-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={preRequestForm.agreedToPreRequestTerms}
                                        onChange={(e) => setPreRequestForm(prev => ({ ...prev, agreedToPreRequestTerms: e.target.checked }))}
                                    />
                                    {isAr ? 'أقر بأنني قرأت ووافقت على الشروط والأحكام' : 'I have read and agree to the terms and conditions'}
                                </label>
                                {preRequestForm.type === 'donate' && !hasViewedTerms && (
                                    <p className="terms-hint-text">
                                        {isAr ? 'اضغط على عرض الشروط قبل إرسال الطلب.' : 'Please click View Terms before submitting the request.'}
                                    </p>
                                )}
                                <button
                                    type="submit"
                                    className="submit-btn"
                                    disabled={preRequestLoading || !preRequestForm.agreedToPreRequestTerms || (preRequestForm.type === 'donate' && !hasViewedTerms)}
                                >
                                    {preRequestLoading ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'إرسال الطلب' : 'Submit Request')}
                                </button>
                            </div>
                        </form>
                    </section>

                    {/* ─── نموذج معرفة حالة الطلبات — يُخفي نفسه إذا material_status_checker_enabled = false ─── */}
                    {systemSettings.materialStatusCheckerEnabled && (
                        <MaterialStatusChecker isAr={isAr} isEnabledProp={systemSettings.materialStatusCheckerEnabled} />
                    )}

                    <section className="join-coordinator-section glass-card">
                        <div className="section-header">
                            <h2>{isAr ? 'طلب انضمام لفريق التنسيق' : 'Join the Coordination Team'}</h2>
                            <p>{isAr ? 'إذا كنت ترغب في المشارك في ترتيب وتنسيق حمل تبادل المواد، قدّم طلبك هنا.' : 'If you want to help organize and coordinate the material exchange campaign, submit your application here.'}</p>
                        </div>

                        <form className="join-coordinator-form" onSubmit={handleCoordinatorApplicationSubmit}>
                            <div className="join-coordinator-grid">
                                <input
                                    type="text"
                                    className="form-input"
                                    value={coordinatorApplicationForm.name}
                                    onChange={(e) => setCoordinatorApplicationForm(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder={isAr ? 'الاسم الكامل' : 'Full name'}
                                    required
                                />
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={coordinatorApplicationForm.phoneNumber}
                                    onChange={(e) => setCoordinatorApplicationForm(prev => ({ ...prev, phoneNumber: e.target.value.replace(/\D/g, '') }))}
                                    placeholder="0790000000"
                                    required
                                    dir="ltr"
                                    maxLength="10"
                                />
                                <input
                                    type="email"
                                    className="form-input"
                                    value={coordinatorApplicationForm.email}
                                    onChange={(e) => setCoordinatorApplicationForm(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder={isAr ? 'البريد الإلكتروني' : 'Email address'}
                                    required
                                />
                            </div>

                            <textarea
                                className="form-input"
                                rows="5"
                                value={coordinatorApplicationForm.motivation}
                                onChange={(e) => setCoordinatorApplicationForm(prev => ({ ...prev, motivation: e.target.value }))}
                                placeholder={isAr ? 'لماذا ترغب في الانضمام؟ اذكر برتك أو طموحك.' : 'Why do you want to join? Share your experience or motivation.'}
                                required
                            ></textarea>

                            <label className="terms-label agreement-checkbox">
                                <input
                                    type="checkbox"
                                    checked={coordinatorApplicationForm.agreedToCoordinatorTerms}
                                    onChange={(e) => setCoordinatorApplicationForm(prev => ({ ...prev, agreedToCoordinatorTerms: e.target.checked }))}
                                />
                                {isAr ? 'أوافق على أن يتم التواصل معي بشأن طلب الانضمام' : 'I agree to be contacted regarding my application'}
                            </label>

                            <button type="submit" className="submit-btn" disabled={coordinatorApplicationLoading}>
                                {coordinatorApplicationLoading ? (isAr ? 'جارٍ الإرسال...' : 'Submitting...') : (isAr ? 'إرسال طلب الانضمام' : 'Submit Application')}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        );
    }

    // ── STAFF DASHBOARD ───────────────────────────────────────────
    if (loggedInUser) {
        const staffUsersDynamic = {
            admin: { role: 'admin', nameAr: 'الأدمن', nameEn: 'Admin', gender: null },
            ahmad: { role: 'coordinator', nameAr: systemSettings.ahmadNameAr || 'أحمد', nameEn: systemSettings.ahmadNameEn || 'Ahmad', gender: 'male' },
            sara: { role: 'coordinator', nameAr: systemSettings.saraNameAr || 'سار', nameEn: systemSettings.saraNameEn || 'Sara', gender: 'female' }
        };
        const isAdminUser = loggedInUser.role === 'admin';
        const canViewArchive = loggedInUser && (isAdminUser || loggedInUser.role === 'coordinator');
        const isCoordinatorApprovedToEdit = (donation) => !isAdminUser && (donation.adminApprovalRequests || []).some(req => req.type === 'editDonation' && req.requestedBy === loggedInUser.username && req.status === 'approved');
        const hasPendingApprovalRequest = (donation, type) => (donation.adminApprovalRequests || []).some(req => req.type === type && req.status === 'pending');
        const totalDonations = allDonations.length;
        const pendingDonations = allDonations.filter(d => d.status === 'pending');
        const approvedDonations = allDonations.filter(d => d.status === 'approved');
        const pendingApprovalRequests = allDonations.flatMap(donation => (donation.adminApprovalRequests || [])
            .filter(req => req.status === 'pending')
            .map(req => ({ ...req, donationId: donation.id, donation }))
        ).concat(deliverySchedules.flatMap(schedule => (schedule.adminApprovalRequests || [])
            .filter(req => req.status === 'pending')
            .map(req => ({ ...req, donationId: schedule.id, donation: schedule, recordCollection: 'deliverySchedules' }))));
        const pendingApprovalRequestCount = pendingApprovalRequests.length;
        const dashAlerts = getDashboardAlerts();
        const reservedCount = allDonations.reduce((acc, d) => {
            const mats = d.materials || [];
            return acc + mats.filter(m => (typeof m === 'object' ? m.status : d.status) === 'reserved').length;
        }, 0);
        const totalMaterialsCount = allDonations.reduce((acc, d) => {
            const mats = d.materials || [];
            return acc + mats.length;
        }, 0);
        const deliveredCount = allDonations.reduce((acc, d) => {
            const mats = d.materials || [];
            return acc + mats.filter(m => (typeof m === 'object' ? m.status : d.status) === 'completed').length;
        }, 0);

        return (
            <div className="material-exchange-page staff-mode">
                <div className="staff-dashboard-container">

                    {/* ─── Gradient Header (hidden when embedded in AdminDashboard) ── */}
                    {!isEmbedded && (
                        <div className="dashboard-header-card">
                            <div className="dashboard-header-left">
                                <div className="dashboard-title-group">
                                    <h1 className="dashboard-main-title">
                                        🏛️ {isAr ? 'لوح إدار حمل التبادل' : 'Exchange Campaign Dashboard'}
                                    </h1>
                                    <p className="dashboard-subtitle">
                                        {isAr ? 'مرحباً،' : 'Welcome,'}{' '}
                                        <strong>{isAr ? (staffUsersDynamic[loggedInUser.username]?.nameAr || loggedInUser.nameAr) : (staffUsersDynamic[loggedInUser.username]?.nameEn || loggedInUser.nameEn)}</strong>
                                        <span className={`user-role-badge role-${loggedInUser.role}`}>
                                            {isAr
                                                ? (isAdminUser ? '👑 أدمن' : '🎯 منسق')
                                                : (isAdminUser ? '👑 Admin' : '🎯 Coordinator')}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div className="dashboard-header-right">
                                <button className="dashboard-refresh-btn" onClick={handleDashboardRefresh} title={isAr ? 'تحديث' : 'Refresh'}>
                                    🔄
                                </button>
                                <button className="dashboard-logout-btn" onClick={handleLogout}>
                                    🚪 {isAr ? 'روج' : 'Logout'}
                                </button>
                            </div>
                        </div>
                    )} {/* end !isEmbedded header */}

                    {/* ─── Stats Row ────────────────────────────── */}
                    <div className="dashboard-stats-row">
                        <div className="stat-card" style={{ '--stat-color': '#3498db', '--stat-rgb': '52,152,219' }}>
                            <div className="stat-icon">📦</div>
                            <div className="stat-info">
                                <span className="stat-value">{totalDonations}</span>
                                <span className="stat-label">{isAr ? 'إجمالي التبرعات' : 'Total Donations'}</span>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-color': '#e67e22', '--stat-rgb': '230,126,34' }}>
                            <div className="stat-icon">📚</div>
                            <div className="stat-info">
                                <span className="stat-value">{totalMaterialsCount}</span>
                                <span className="stat-label">{isAr ? 'إجمالي المواد' : 'Total Materials'}</span>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-color': '#f39c12', '--stat-rgb': '243,156,18' }}>
                            <div className="stat-icon">⏳</div>
                            <div className="stat-info">
                                <span className="stat-value">{pendingDonations.length}</span>
                                <span className="stat-label">{isAr ? 'بانتظار المراجع' : 'Pending'}</span>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-color': '#2ecc71', '--stat-rgb': '46,204,113' }}>
                            <div className="stat-icon">✅</div>
                            <div className="stat-info">
                                <span className="stat-value">{approvedDonations.length}</span>
                                <span className="stat-label">{isAr ? 'معتمد' : 'Approved'}</span>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-color': '#9b59b6', '--stat-rgb': '155,89,182' }}>
                            <div className="stat-icon">🔒</div>
                            <div className="stat-info">
                                <span className="stat-value">{reservedCount}</span>
                                <span className="stat-label">{isAr ? 'مواد محجوز' : 'Reserved'}</span>
                            </div>
                        </div>
                        <div className="stat-card" style={{ '--stat-color': '#1abc9c', '--stat-rgb': '26,188,156' }}>
                            <div className="stat-icon">🤝</div>
                            <div className="stat-info">
                                <span className="stat-value">{deliveredCount}</span>
                                <span className="stat-label">{isAr ? 'المواد المسلم' : 'Delivered'}</span>
                            </div>
                        </div>
                    </div>

                    {/* ─── Alerts & Tasks Board ─────────────────── */}

                    {/* ADMIN: full alerts + per-coordinator task panels */}
                    {isAdminUser && (
                        <div className="dashboard-alerts-board">
                            <div className="alerts-board-header">
                                <span className="alerts-board-icon">🔔</span>
                                <h2>{isAr ? 'الإشعارات والمهام' : 'Notifications & Tasks'}</h2>
                            </div>
                            <div className="alerts-board-body">
                                {/* Alerts — admin only */}
                                {dashAlerts.length > 0 && (
                                    <div className="alerts-list">
                                        {dashAlerts.map((alert, i) => (
                                            <div key={i} className={`alert-item alert-${alert.type}`}>
                                                <span className="alert-icon">{alert.icon}</span>
                                                <span className="alert-text">{alert.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Per-coordinator task panels */}
                                <div className="coordinator-tasks-grid">
                                    {[
                                        { username: 'ahmad', nameAr: systemSettings.ahmadNameAr || 'أحمد', nameEn: systemSettings.ahmadNameEn || 'Ahmad', icon: '♂️' },
                                        { username: 'sara', nameAr: systemSettings.saraNameAr || 'سار', nameEn: systemSettings.saraNameEn || 'Sara', icon: '♀️' }
                                    ].map(({ username, nameAr, nameEn, icon }) => {
                                        const tasks = getTasksForUser(username);
                                        const userCompletions = taskCompletions[username] || {};
                                        const doneCount = tasks.filter(t => !!userCompletions[t]).length;
                                        return (
                                            <div key={username} className="coordinator-task-panel">
                                                <div className="coord-task-panel-header">
                                                    <span className="coord-task-icon">{icon}</span>
                                                    <div>
                                                        <h4>{isAr ? `مهام ${nameAr}` : `${nameEn}'s Tasks`}</h4>
                                                        <span className="coord-task-progress">
                                                            {doneCount}/{tasks.length} {isAr ? 'منجز' : 'done'}
                                                        </span>
                                                    </div>
                                                    <div className="coord-task-bar-wrap">
                                                        <div className="coord-task-bar" style={{ width: tasks.length ? `${(doneCount / tasks.length) * 100}%` : '0%' }} />
                                                    </div>
                                                </div>
                                                {tasks.length === 0 ? (
                                                    <p className="no-tasks-msg">{isAr ? 'لا توجد مهام' : 'No tasks assigned'}</p>
                                                ) : (
                                                    <ul className="coord-task-list">
                                                        {tasks.map((task, idx) => {
                                                            const isDone = !!userCompletions[task];
                                                            const doneAt = userCompletions[task];
                                                            return (
                                                                <li key={idx} className={`coord-task-item ${isDone ? 'task-done' : ''}`}>
                                                                    <span className="task-checkbox">{isDone ? '✅' : '⬜'}</span>
                                                                    <span className="task-text">{task}</span>
                                                                    {isDone && doneAt && (
                                                                        <span className="task-done-time">
                                                                            {new Date(doneAt).toLocaleString(isAr ? 'ar-SA' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                                                                        </span>
                                                                    )}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Clear completions button */}
                                <div className="tasks-admin-actions">
                                    <button className="clear-tasks-btn" onClick={handleClearAllTaskCompletions}>
                                        🗑️ {isAr ? 'مسح جميع الإنجازات' : 'Clear All Completions'}
                                    </button>
                                    <span className="tasks-auto-delete-hint">
                                        ⏱️ {isAr
                                            ? `تُحذف الإنجازات القديم تلقائياً بعد ${systemSettings.taskAutoDeleteHours || 24} ساع`
                                            : `Completions auto-clear after ${systemSettings.taskAutoDeleteHours || 24}h`}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* COORDINATOR: own tasks only — no alerts */}
                    {!isAdminUser && (() => {
                        const myTasks = getTasksForUser(loggedInUser.username);
                        const myCompletions = taskCompletions[loggedInUser.username] || {};
                        const myDone = myTasks.filter(t => !!myCompletions[t]).length;
                        return (
                            <div className="dashboard-alerts-board coordinator-tasks-only">
                                <div className="alerts-board-header">
                                    <span className="alerts-board-icon">📋</span>
                                    <h2>{isAr ? 'مهامك المطلوب' : 'Your Required Tasks'}</h2>
                                    <span className="coord-my-progress">{myDone}/{myTasks.length} {isAr ? 'منجز' : 'done'}</span>
                                </div>
                                <div className="alerts-board-body">
                                    {myTasks.length === 0 ? (
                                        <div className="no-tasks-placeholder">
                                            <span>💼</span>
                                            <p>{isAr ? 'لا توجد مهام محدد حالياً' : 'No tasks assigned yet'}</p>
                                        </div>
                                    ) : (
                                        <ul className="tasks-list">
                                            {myTasks.map((task, i) => {
                                                const isDone = !!myCompletions[task];
                                                return (
                                                    <li
                                                        key={i}
                                                        className={`task-item ${isDone ? 'task-done' : ''}`}
                                                        onClick={() => handleToggleCoordinatorTask(task)}
                                                    >
                                                        <span className="task-checkbox">{isDone ? '✅' : '⬜'}</span>
                                                        <span className="task-text">{task}</span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ─── Sidebar + Content Layout ───────────────── */}
                    <div className="dashboard-page-layout">
                        <aside className="dashboard-sidebar">
                            <div className="sidebar-actions">
                                <button className="dashboard-refresh-btn sidebar-refresh" onClick={handleDashboardRefresh} title={isAr ? 'تحديث' : 'Refresh'}>
                                    🔄 {isAr ? 'تحديث' : 'Refresh'}
                                </button>
                                <button className="dashboard-logout-btn sidebar-logout" onClick={handleLogout}>
                                    🚪 {isAr ? 'روج' : 'Logout'}
                                </button>
                            </div>

                            <div className="dashboard-tabs sidebar-tabs">
                                <button
                                    className={`tab-btn ${activeTab === 'donations' ? 'active' : ''}`}
                                    onClick={() => setActiveTab('donations')}
                                >
                                    📦 {isAr ? 'إدار التبرعات' : 'Manage Donations'}
                                    {pendingDonations.length > 0 && (
                                        <span className="tab-badge">{pendingDonations.length}</span>
                                    )}
                                </button>
                                {loggedInUser && (
                                    <button
                                        className={`tab-btn ${activeTab === 'preRequests' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('preRequests')}
                                    >
                                        {isAr ? 'طلبات مسبقة' : 'Pre-Requests'}
                                        {preRequests.length > 0 && (
                                            <span className="tab-badge">{preRequests.length}</span>
                                        )}
                                    </button>
                                )}
                                {isAdminUser && (
                                    <button
                                        className={`tab-btn ${activeTab === 'approvalRequests' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('approvalRequests')}
                                    >
                                        🔔 {isAr ? 'الطلبات المنتظر' : 'Pending Requests'}
                                        {pendingApprovalRequestCount > 0 && (
                                            <span className="tab-badge approval-badge">{pendingApprovalRequestCount}</span>
                                        )}
                                    </button>
                                )}
                                {isAdminUser && (
                                    <button
                                        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('settings')}
                                    >
                                        ⚙️ {isAr ? 'الإعدادات' : 'Settings'}
                                    </button>
                                )}
                                {isAdminUser && (
                                    <button
                                        className={`tab-btn ${activeTab === 'coordinators' ? 'active' : ''}`}
                                        onClick={() => { setActiveTab('coordinators'); fetchStaffStatuses(); fetchAuditLogs(); }}
                                    >
                                        👥 {isAr ? 'نشاط المنسقين' : 'Coordinator Activity'}
                                    </button>
                                )}
                                {canViewArchive && (
                                    <button
                                        className={`tab-btn ${activeTab === 'archive' ? 'active' : ''}`}
                                        onClick={() => { setActiveTab('archive'); fetchArchives(); }}
                                    >
                                        🗄️ {isAr ? 'أرشيف الحملات' : 'Campaign Archive'}
                                        {archives.length > 0 && (
                                            <span className="tab-badge archive-badge">{archives.length}</span>
                                        )}
                                    </button>
                                )}
                                {canViewArchive && (
                                    <button
                                        className={`tab-btn ${activeTab === 'deletedItems' ? 'active' : ''}`}
                                        onClick={() => { setActiveTab('deletedItems'); fetchDeletedItems(); }}
                                    >
                                        🗑️ {isAr ? 'المحذوفات' : 'Deleted Items'}
                                        {deletedItems.length > 0 && <span className="tab-badge archive-badge">{deletedItems.length}</span>}
                                    </button>
                                )}
                                {isAdminUser && (
                                    <button
                                        className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                                        onClick={() => setActiveTab('analytics')}
                                    >
                                        📊 {isAr ? 'إحصائيات النظام' : 'System Analytics'}
                                    </button>
                                )}
                            </div>
                        </aside>

                        <div className="dashboard-content">

                            {/* DONATIONS TAB */}
                            {activeTab === 'donations' && (
                                <div className="donations-management">

                                    {/* ─── Sub-Tabs ─── */}
                                    <div className="staff-sub-tabs">
                                        <button
                                            className={`sub-tab-btn ${staffSubTab === 'main' ? 'active' : ''}`}
                                            onClick={() => setStaffSubTab('main')}
                                        >
                                            📊 {isAr ? 'الجدول الرسمي الرئيسي' : 'Main Official Table'}
                                        </button>
                                        <button
                                            className={`sub-tab-btn ${staffSubTab === 'donations' ? 'active' : ''}`}
                                            onClick={() => setStaffSubTab('donations')}
                                        >
                                            📦 {isAr ? 'تبرعات الطلاب' : 'Student Donations'}
                                        </button>
                                        <button
                                            className={`sub-tab-btn ${staffSubTab === 'bookings' ? 'active' : ''}`}
                                            onClick={() => setStaffSubTab('bookings')}
                                        >
                                            🔒 {isAr ? 'حجوزات الطلاب (الحاجزين)' : 'Student Bookings'}
                                        </button>
                                        <button
                                            className={`sub-tab-btn ${staffSubTab === 'shared' ? 'active' : ''}`}
                                            onClick={() => setStaffSubTab('shared')}
                                        >
                                            ⚡ {isAr ? 'الجدول المشترك (للتسليم)' : 'Shared Table (Handover)'}
                                        </button>
                                        <button
                                            className={`sub-tab-btn ${staffSubTab === 'delivered' ? 'active' : ''}`}
                                            onClick={() => { setStaffSubTab('delivered'); fetchDeliverySchedules(); }}
                                        >
                                            🤝 {isAr ? 'المواد التي تم تسليمها' : 'Delivered Materials'}
                                        </button>
                                        <button
                                            className={`sub-tab-btn ${staffSubTab === 'schedule' ? 'active' : ''}`}
                                            onClick={() => { setStaffSubTab('schedule'); fetchDeliverySchedules(); }}
                                        >
                                            📅 {isAr ? 'جدول تسليم الحجوزات' : 'Delivery Schedule'}
                                        </button>
                                    </div>

                                    {/* ─── Sub-Filters ─── */}
                                    {isAdminUser ? (
                                        <div className="admin-gender-filter">
                                            <button
                                                className={`filter-pill ${adminSubFilter === 'all' ? 'active' : ''}`}
                                                onClick={() => setAdminSubFilter('all')}
                                            >
                                                👥 {isAr ? 'كل التبرعات' : 'All Donations'}
                                            </button>
                                            <button
                                                className={`filter-pill ${adminSubFilter === 'ahmad' ? 'active' : ''}`}
                                                onClick={() => setAdminSubFilter('ahmad')}
                                            >
                                                ♂️ {isAr ? `قسم الذكور (المنسق: ${systemSettings.ahmadNameAr || 'أحمد'})` : `Male Section (${systemSettings.ahmadNameEn || 'Ahmad'})`}
                                            </button>
                                            <button
                                                className={`filter-pill ${adminSubFilter === 'sara' ? 'active' : ''}`}
                                                onClick={() => setAdminSubFilter('sara')}
                                            >
                                                ♀️ {isAr ? `قسم الإناث (المنسق: ${systemSettings.saraNameAr || 'سار'})` : `Female Section (${systemSettings.saraNameEn || 'Sara'})`}
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="coordinator-tabs-group">
                                                <button
                                                    className={`coord-tab-btn ${coordinatorSubTab === 'delegated' ? 'active' : ''}`}
                                                    onClick={() => setCoordinatorSubTab('delegated')}
                                                >
                                                    ⚡ {isAr ? 'المواد المفوض لي (صلاحية كامل)' : 'My Delegated Materials (Full Control)'}
                                                </button>
                                                <button
                                                    className={`coord-tab-btn ${coordinatorSubTab === 'main' ? 'active' : ''}`}
                                                    onClick={() => setCoordinatorSubTab('main')}
                                                >
                                                    👁️ {isAr ? 'الجدول الرئيسي لقسمك (للاطلاع فقط)' : 'Main Section Table (View Only)'}
                                                </button>
                                            </div>
                                            <div className="coordinator-mode-note">
                                                {coordinatorSubTab === 'delegated' ? (
                                                    <p>{isAr ? 'أنت في وضع المنسق المفوض: يمكنك تعديل وحذف المواد المفوض لك بالكامل.' : 'You are in Delegated mode: you can edit and delete materials delegated to you.'}</p>
                                                ) : null}
                                            </div>
                                        </>
                                    )}

                                    {/* ─── Export Toolbar ─── */}
                                    {(() => {
                                        const filteredDonations = isAdminUser
                                            ? (adminSubFilter === 'all'
                                                ? allDonations
                                                : adminSubFilter === 'ahmad'
                                                    ? allDonations.filter(d => d.studentGender === 'male')
                                                    : allDonations.filter(d => d.studentGender === 'female'))
                                            : allDonations.filter(d =>
                                                coordinatorSubTab === 'delegated'
                                                    ? d.delegatedTo === loggedInUser.username
                                                    : d.studentGender === loggedInUser.gender && (!d.delegatedTo || d.delegatedTo === loggedInUser.username)
                                            );

                                        const bookings = [];
                                        allDonations.forEach(donation => {
                                            const passFilter = isAdminUser
                                                ? (adminSubFilter === 'all'
                                                    ? true
                                                    : adminSubFilter === 'ahmad'
                                                        ? donation.studentGender === 'male'
                                                        : donation.studentGender === 'female')
                                                : (coordinatorSubTab === 'delegated'
                                                    ? donation.delegatedTo === loggedInUser.username
                                                    : donation.studentGender === loggedInUser.gender && (!donation.delegatedTo || donation.delegatedTo === loggedInUser.username));

                                            if (passFilter && donation.materials) {
                                                donation.materials.forEach((m, idx) => {
                                                    if (typeof m === 'object' && (m.status === 'reserved' || m.status === 'completed')) {
                                                        bookings.push({
                                                            id: `${donation.id}_booking_${idx}`,
                                                            donationId: donation.id,
                                                            materialIndex: idx,
                                                            materialName: m.name,
                                                            materialDescription: m.description || '',
                                                            status: m.status,
                                                            takerInfo: m.takerInfo || {},
                                                            takerEmail: m.takerInfo?.email || '',
                                                            donorName: donation.studentName,
                                                            donorPhone: donation.phoneNumber,
                                                            donorEmail: donation.email || '',
                                                            donorGender: donation.studentGender,
                                                            delegatedTo: donation.delegatedTo,
                                                            publishedToCoordinators: donation.publishedToCoordinators,
                                                            approvalRequests: donation.adminApprovalRequests || [],
                                                            createdAt: m.takerInfo?.bookedAt || donation.lastUpdated || donation.createdAt,
                                                            completedAt: m.completedAt || m.takerInfo?.deliveredAt || null,
                                                            deliveryTimestamp: m.takerInfo?.deliveredAt || m.completedAt || donation.lastUpdated || donation.createdAt
                                                        });
                                                    }
                                                });
                                            }
                                        });

                                        const exportLabel = isAdminUser
                                            ? (adminSubFilter === 'all' ? (isAr ? 'الكل' : 'all') : adminSubFilter === 'ahmad' ? (systemSettings.ahmadNameAr || 'أحمد') : (systemSettings.saraNameAr || 'سار'))
                                            : (isAr ? loggedInUser.nameAr : loggedInUser.nameEn);

                                        const recordsCount = staffSubTab === 'donations'
                                            ? filteredDonations.length
                                            : staffSubTab === 'delivered'
                                                ? bookings.filter(b => b.status === 'completed').length
                                                : staffSubTab === 'bookings'
                                                    ? bookings.filter(b => b.status === 'reserved').length
                                                    : bookings.length;

                                        return (
                                            <div className="export-toolbar">
                                                <span className="export-toolbar-label">
                                                    📊 {isAr ? `تصدير (${recordsCount} سجل)` : `Export (${recordsCount} records)`}
                                                </span>
                                                <div className="staff-search-wrapper">
                                                    <input
                                                        type="search"
                                                        value={staffSearchQuery}
                                                        onChange={(e) => setStaffSearchQuery(e.target.value)}
                                                        placeholder={isAr ? 'ابحث باسم الطالب، المادة، الهاتف أو البريد' : 'Search donor, material, phone, or email'}
                                                        className="staff-search-input"
                                                    />
                                                </div>
                                                <button
                                                    className="export-btn export-csv-btn"
                                                    onClick={() => {
                                                        if (staffSubTab === 'donations') {
                                                            exportToCSV(filteredDonations, `donations-${exportLabel}`);
                                                        } else if (staffSubTab === 'delivered') {
                                                            exportBookingsToCSV(bookings.filter(b => b.status === 'completed'), `delivered-${exportLabel}`);
                                                        } else {
                                                            exportBookingsToCSV(bookings.filter(b => b.status === 'reserved'), `bookings-${exportLabel}`);
                                                        }
                                                    }}
                                                    title={isAr ? 'تصدير إلى Excel/CSV' : 'Export to Excel/CSV'}
                                                >
                                                    📊 {isAr ? 'تصدير Excel' : 'Export Excel'}
                                                </button>
                                                <button
                                                    className="export-btn export-pdf-btn"
                                                    onClick={() => {
                                                        if (staffSubTab === 'donations') {
                                                            exportToPDF(filteredDonations, `donations-${exportLabel}`);
                                                        } else if (staffSubTab === 'delivered') {
                                                            exportBookingsToPDF(bookings.filter(b => b.status === 'completed'), `delivered-${exportLabel}`);
                                                        } else {
                                                            exportBookingsToPDF(bookings.filter(b => b.status === 'reserved'), `bookings-${exportLabel}`);
                                                        }
                                                    }}
                                                    title={isAr ? 'طباع / تصدير PDF' : 'Print / Export PDF'}
                                                >
                                                    🖨️ {isAr ? 'طباع / PDF' : 'Print / PDF'}
                                                </button>
                                            </div>
                                        );
                                    })()}

                                    {dashboardLoading ? (
                                        <div className="dashboard-loading">
                                            <div className="loading-spinner"></div>
                                            <p>{isAr ? 'جاري التحميل...' : 'Loading...'}</p>
                                        </div>
                                    ) : (() => {
                                        // ── compute filtered data ──
                                        const searchTerm = staffSearchQuery.trim().toLowerCase();
                                        const donationMatchesSearch = (donation) => {
                                            if (!searchTerm) return true;
                                            const materialText = (donation.materials || []).map(m => {
                                                if (typeof m === 'object' && m !== null) {
                                                    return `${m.name || ''} ${m.description || ''} ${m.status || ''} ${m.takerInfo?.name || ''} ${m.takerInfo?.phone || ''} ${m.takerInfo?.email || ''}`;
                                                }
                                                return `${m || ''}`;
                                            }).join(' ');
                                            const paymentText = `${donation.studentName || ''} ${donation.phoneNumber || ''} ${donation.email || ''} ${donation.studentGender || ''} ${donation.status || ''} ${materialText}`;
                                            return paymentText.toLowerCase().includes(searchTerm);
                                        };
                                        const bookingMatchesSearch = (booking) => {
                                            if (!searchTerm) return true;
                                            const bookingText = `${booking.materialName || ''} ${booking.materialDescription || ''} ${booking.donorName || ''} ${booking.donorPhone || ''} ${booking.donorEmail || ''} ${booking.takerInfo?.name || ''} ${booking.takerInfo?.phone || ''} ${booking.takerInfo?.email || ''} ${booking.status || ''}`;
                                            return bookingText.toLowerCase().includes(searchTerm);
                                        };
                                        const sharedBookingMatchesSearch = (booking) => {
                                            if (!searchTerm) return true;
                                            const sharedText = `${booking.donorName || ''} ${booking.donorPhone || ''} ${booking.donorEmail || ''} ${booking.materialName || ''} ${booking.materialDescription || ''} ${booking.takerName || ''} ${booking.takerPhone || ''} ${booking.takerEmail || ''} ${booking.materialStatus || ''}`;
                                            return sharedText.toLowerCase().includes(searchTerm);
                                        };
                                        const filteredDonations = isAdminUser
                                            ? (adminSubFilter === 'all'
                                                ? allDonations
                                                : adminSubFilter === 'ahmad'
                                                    ? allDonations.filter(d => d.studentGender === 'male')
                                                    : allDonations.filter(d => d.studentGender === 'female'))
                                            : allDonations.filter(d =>
                                                coordinatorSubTab === 'delegated'
                                                    ? d.delegatedTo === loggedInUser.username
                                                    : d.studentGender === loggedInUser.gender && (!d.delegatedTo || d.delegatedTo === loggedInUser.username)
                                            ).filter(donationMatchesSearch);

                                        const filteredBookings = [];
                                        const filteredDelivered = [];
                                        allDonations.forEach(donation => {
                                            const passFilter = isAdminUser
                                                ? (adminSubFilter === 'all'
                                                    ? true
                                                    : adminSubFilter === 'ahmad'
                                                        ? donation.studentGender === 'male'
                                                        : donation.studentGender === 'female')
                                                : (coordinatorSubTab === 'delegated'
                                                    ? donation.delegatedTo === loggedInUser.username
                                                    : donation.studentGender === loggedInUser.gender && (!donation.delegatedTo || donation.delegatedTo === loggedInUser.username));
                                            if (passFilter && donation.materials) {
                                                donation.materials.forEach((m, idx) => {
                                                    const isObjectMaterial = typeof m === 'object' && m !== null;
                                                    const materialStatus = isObjectMaterial ? (m.status || donation.status) : donation.status;
                                                    if (!['reserved', 'completed'].includes(materialStatus)) return;

                                                    const bookingRecord = {
                                                        id: `${donation.id}_booking_${idx}`,
                                                        donationId: donation.id,
                                                        donation,
                                                        materialIndex: idx,
                                                        materialName: isObjectMaterial ? (m.name || '—') : String(m || '—'),
                                                        materialDescription: isObjectMaterial ? (m.description || '') : '',
                                                        status: materialStatus,
                                                        takerInfo: isObjectMaterial ? (m.takerInfo || {}) : {},
                                                        takerEmail: isObjectMaterial ? (m.takerInfo?.email || '') : '',
                                                        donorName: donation.studentName,
                                                        donorPhone: donation.phoneNumber,
                                                        donorEmail: donation.email || '',
                                                        donorGender: donation.studentGender,
                                                        delegatedTo: donation.delegatedTo,
                                                        publishedToCoordinators: donation.publishedToCoordinators,
                                                        approvalRequests: donation.adminApprovalRequests || [],
                                                        createdAt: isObjectMaterial ? (m.takerInfo?.bookedAt || donation.lastUpdated || donation.createdAt) : (donation.lastUpdated || donation.createdAt),
                                                        completedAt: isObjectMaterial ? (m.completedAt || m.takerInfo?.deliveredAt || null) : (donation.status === 'completed' ? (donation.lastUpdated || donation.createdAt) : null),
                                                        deliveryTimestamp: isObjectMaterial ? (m.takerInfo?.deliveredAt || m.completedAt || donation.lastUpdated || donation.createdAt) : (donation.lastUpdated || donation.createdAt)
                                                    };
                                                    if (bookingMatchesSearch(bookingRecord)) {
                                                        if (materialStatus === 'reserved') {
                                                            filteredBookings.push(bookingRecord);
                                                        } else if (materialStatus === 'completed') {
                                                            filteredDelivered.push(bookingRecord);
                                                        }
                                                    }
                                                });
                                            }
                                        });

                                        const coordinatorPerms = systemSettings.coordinatorPermissions || {};
                                        const currentCoordinatorPerms = coordinatorPerms[loggedInUser?.username] || {};
                                        // Only admins can act directly on bookings
                                        const canCompleteBooking = isAdminUser;
                                        const canCancelBooking = isAdminUser;
                                        // Only admins can edit/delete directly — coordinators always request approval
                                        const canEditDonation = (donation) => isAdminUser;
                                        const canDeleteDonation = isAdminUser;

                                        return (
                                            <>
                                                {/* ─── الجدول الرسمي الرئيسي ─── */}
                                                {staffSubTab === 'main' && (
                                                    <div className="formal-table-wrapper">
                                                        <div className="formal-table-header">
                                                            <span className="formal-table-title">
                                                                📊 {isAr ? 'الجدول الرسمي الرئيسي' : 'Main Official Table'}
                                                                {!isAdminUser && <span style={{ marginRight: '8px', color: 'rgba(255,255,255,0.7)' }}>👁️ {isAr ? '(للاطلاع فقط)' : '(View Only)'}</span>}
                                                            </span>
                                                            <span className="formal-table-count">{isAr ? `إجمالي: ${filteredDonations.length} تبرع` : `Total: ${filteredDonations.length} donations`}</span>
                                                        </div>
                                                        {filteredDonations.length === 0 ? (
                                                            <div className="empty-state">📭 {isAr ? 'لا توجد بيانات' : 'No data found'}</div>
                                                        ) : (
                                                            <div className="formal-table-scroll">
                                                                <table className="formal-table main-official-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>#</th>
                                                                            <th>{isAr ? 'اسم المختبرع' : 'Donor Name'}</th>
                                                                            <th>{isAr ? 'رقم الهاتف' : 'Phone'}</th>
                                                                            <th>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                                                                            <th>{isAr ? 'الجنس' : 'Gender'}</th>
                                                                            <th>{isAr ? 'اسم المادة' : 'Material Name'}</th>
                                                                            <th>{isAr ? 'وصف المادة' : 'Description'}</th>
                                                                            <th>{isAr ? 'حال المادة' : 'Material Status'}</th>
                                                                            <th>{isAr ? 'اسم الحاجز' : 'Booker (if reserved)'}</th>
                                                                            <th>{isAr ? 'هاتف الحاجز' : 'Booker Phone'}</th>
                                                                            <th>{isAr ? 'حال الحجز' : 'Booking Status'}</th>
                                                                            <th>{isAr ? 'تاريخخ التبرع' : 'Donation Date'}</th>
                                                                            {isAdminUser && <th>{isAr ? 'الحال العام' : 'Overall Status'}</th>}
                                                                            {isAdminUser && <th>{isAr ? 'المفوّض' : 'Delegated To'}</th>}
                                                                            {isAdminUser && <th>{isAr ? 'الإجراءات' : 'Actions'}</th>}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {filteredDonations.map((donation, donIdx) => {
                                                                            const donDate = donation.createdAt?.toDate ? donation.createdAt.toDate() : donation.createdAt ? new Date(donation.createdAt) : null;
                                                                            const materialsWithIndex = (donation.materials || []).map((m, idx) => ({ ...m, materialIndex: idx, donationId: donation.id, donation }));

                                                                            return materialsWithIndex.map((material, matIdx) => {
                                                                                const materialObj = typeof material === 'object' ? material : { name: material, status: donation.status };
                                                                                const matStatus = materialObj.status || donation.status;
                                                                                const takerInfo = materialObj.takerInfo || {};
                                                                                const bookingStatus = materialObj.status === 'reserved' ? (isAr ? '🔒 محجوز' : '🔒 Reserved')
                                                                                    : materialObj.status === 'completed' ? (isAr ? '✅ مُسلّم' : '✅ Delivered')
                                                                                        : (isAr ? '⏳ بانتظار' : '⏳ Pending');

                                                                                return (
                                                                                    <tr key={`${donation.id}-${matIdx}`} className={`formal-row status-row-${matStatus}`}>
                                                                                        <td className="row-num">{donIdx + 1}.{matIdx + 1}</td>
                                                                                        <td className="donor-name-cell"><strong>{donation.studentName}</strong></td>
                                                                                        <td dir="ltr" className="phone-cell">{donation.phoneNumber}</td>
                                                                                        <td dir="ltr" className="email-cell">{donation.email || '—'}</td>
                                                                                        <td>
                                                                                            <span className={`gender-badge gender-${donation.studentGender}`}>
                                                                                                {donation.studentGender === 'male' ? (isAr ? '♂️ ذكر' : '♂️ M') : (isAr ? '♀️ أنثى' : '♀️ F')}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="material-name-cell"><strong>{materialObj.name || '—'}</strong></td>
                                                                                        <td className="description-cell">{materialObj.description || '—'}</td>
                                                                                        <td>
                                                                                            <span className={`status-badge status-${matStatus}`}>
                                                                                                {matStatus === 'pending' && (isAr ? '⏳ معلق' : '⏳ Pending')}
                                                                                                {matStatus === 'reserved' && (isAr ? '🔒 محجوز' : '🔒 Reserved')}
                                                                                                {matStatus === 'completed' && (isAr ? '✅ مُسلّم' : '✅ Delivered')}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td>{takerInfo?.name || '—'}</td>
                                                                                        <td dir="ltr" className="phone-cell">{takerInfo?.phone || '—'}</td>
                                                                                        <td>{bookingStatus}</td>
                                                                                        <td className="date-cell">{donDate ? donDate.toLocaleDateString(isAr ? 'ar-JO' : 'en-US') : '—'}</td>
                                                                                        {isAdminUser && (
                                                                                            <td>
                                                                                                <span className={`status-badge status-${donation.status}`}>
                                                                                                    {donation.status === 'pending' && (isAr ? '⏳ معلق' : '⏳ Pending')}
                                                                                                    {donation.status === 'approved' && (isAr ? '✅ معتمد' : '✅ Approved')}
                                                                                                    {donation.status === 'reserved' && (isAr ? '🔒 محجوز' : '🔒 Reserved')}
                                                                                                    {donation.status === 'completed' && (isAr ? '📦 مكتمل' : '📦 Completed')}
                                                                                                </span>
                                                                                            </td>
                                                                                        )}
                                                                                        {isAdminUser && (
                                                                                            <td className="delegation-cell-formal">
                                                                                                {donation.publishedToCoordinators ? (
                                                                                                    <span className="delegated-to-badge">
                                                                                                        {donation.delegatedTo === 'ahmad'
                                                                                                            ? `♂️ ${systemSettings.ahmadNameAr || 'أحمد'}`
                                                                                                            : donation.delegatedTo === 'sara'
                                                                                                                ? `♀️ ${systemSettings.saraNameAr || 'سار'}`
                                                                                                                : '📢 مفوّض'}
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span style={{ fontSize: '0.9em', color: 'rgba(255,255,255,0.5)' }}>—</span>
                                                                                                )}
                                                                                            </td>
                                                                                        )}
                                                                                        {isAdminUser && (
                                                                                            <td className="actions-cell">
                                                                                                {donation.status === 'pending' && !donation.adminApprovalRequests?.some(req => req.status === 'pending') && (
                                                                                                    <button className="action-btn approve-btn" style={{ fontSize: '0.85em', padding: '6px 10px' }} onClick={() => handleApproveDonation(donation.id)}>
                                                                                                        ✅ {isAr ? 'اعتماد' : 'Approve'}
                                                                                                    </button>
                                                                                                )}
                                                                                            </td>
                                                                                        )}
                                                                                    </tr>
                                                                                );
                                                                            });
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ─── جدول التبرعات ─── */}
                                                {staffSubTab === 'donations' && (
                                                    <div className="formal-table-wrapper">
                                                        <div className="formal-table-header">
                                                            <span className="formal-table-title">📦 {isAr ? 'جدول تبرعات الطلاب' : 'Student Donations Table'}</span>
                                                            <span className="formal-table-count">{isAr ? `إجمالي: ${filteredDonations.length} سجل` : `Total: ${filteredDonations.length} records`}</span>
                                                        </div>
                                                        {filteredDonations.length === 0 ? (
                                                            <div className="empty-state">📭 {isAr ? 'لا توجد تبرعات' : 'No donations found'}</div>
                                                        ) : (
                                                            <div className="formal-table-scroll">
                                                                <table className="formal-table donations-formal-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>{isAr ? '#' : '#'}</th>
                                                                            <th>{isAr ? 'اسم المختبرع' : 'Donor Name'}</th>
                                                                            <th>{isAr ? 'رقم الهاتف' : 'Phone'}</th>
                                                                            <th>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                                                                            <th>{isAr ? 'الجنس' : 'Gender'}</th>
                                                                            <th>{isAr ? 'المواد المختبرع بها' : 'Donated Materials'}</th>
                                                                            <th>{isAr ? 'حال الطلب' : 'Status'}</th>
                                                                            <th>{isAr ? 'تاريخخ التقديم' : 'Submitted'}</th>
                                                                            {isAdminUser && <th>{isAr ? 'التفويض' : 'Delegation'}</th>}
                                                                            <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {filteredDonations.map((donation, idx) => {
                                                                            const donDate = donation.createdAt?.toDate ? donation.createdAt.toDate() : donation.createdAt ? new Date(donation.createdAt) : null;
                                                                            return (
                                                                                <tr key={donation.id} className={`formal-row status-row-${donation.status}`}>
                                                                                    <td className="row-num">{idx + 1}</td>
                                                                                    <td className="donor-name-cell"><strong>{donation.studentName}</strong></td>
                                                                                    <td dir="ltr" className="phone-cell">{donation.phoneNumber}</td>
                                                                                    <td dir="ltr" className="email-cell">{donation.email || '—'}</td>
                                                                                    <td>
                                                                                        <span className={`gender-badge gender-${donation.studentGender}`}>
                                                                                            {donation.studentGender === 'male' ? (isAr ? '♂️ ذكر' : '♂️ Male') : (isAr ? '♀️ أنثى' : '♀️ Female')}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="materials-cell">
                                                                                        <ul className="materials-list-formal">
                                                                                            {(donation.materials || []).map((m, i) => (
                                                                                                <li key={i} className="donation-material-item">
                                                                                                    <span className={`mat-status-dot status-dot-${typeof m === 'object' ? m.status : donation.status}`}></span>
                                                                                                    <div className="material-item-content">
                                                                                                        <strong>{typeof m === 'object' ? m.name : m}</strong>
                                                                                                        {typeof m === 'object' && m.description && (
                                                                                                            <small>{m.description}</small>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </td>
                                                                                    <td>
                                                                                        <span className={`status-badge status-${donation.status}`}>
                                                                                            {donation.status === 'pending' && (isAr ? '⏳ معلق' : '⏳ Pending')}
                                                                                            {donation.status === 'approved' && (isAr ? '✅ معتمد' : '✅ Approved')}
                                                                                            {donation.status === 'reserved' && (isAr ? '🔒 محجوز' : '🔒 Reserved')}
                                                                                            {donation.status === 'completed' && (isAr ? '📦 مكتمل' : '📦 Completed')}
                                                                                        </span>
                                                                                        {donation.status === 'pending' && isAdminUser && !donation.adminApprovalRequests?.some(req => req.status === 'pending') && (
                                                                                            <button className="action-btn approve-btn" style={{ marginTop: '4px', display: 'block' }} onClick={() => handleApproveDonation(donation.id)}>
                                                                                                ✅ {isAr ? 'اعتماد' : 'Approve'}
                                                                                            </button>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="date-cell">{donDate ? donDate.toLocaleDateString(isAr ? 'ar-JO' : 'en-US') : '—'}</td>
                                                                                    {isAdminUser && (
                                                                                        <td className="delegation-cell-formal">
                                                                                            {donation.publishedToCoordinators ? (
                                                                                                <div className="delegation-cell">
                                                                                                    <span className="delegated-to-badge">
                                                                                                        {donation.delegatedTo === 'ahmad'
                                                                                                            ? `♂️ ${systemSettings.ahmadNameAr || 'أحمد'}`
                                                                                                            : donation.delegatedTo === 'sara'
                                                                                                                ? `♀️ ${systemSettings.saraNameAr || 'سار'}`
                                                                                                                : '📢 مفوّض'}
                                                                                                    </span>
                                                                                                    <button className="action-btn revoke-btn" onClick={() => handleRevokeDelegation(donation.id)}>
                                                                                                        🔄 {isAr ? 'إلغاء' : 'Revoke'}
                                                                                                    </button>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <button className="action-btn publish-btn" onClick={() => handleOpenDelegateModal(donation)}>
                                                                                                    📢 {isAr ? 'تفويض' : 'Delegate'}
                                                                                                </button>
                                                                                            )}
                                                                                        </td>
                                                                                    )}
                                                                                    <td className="actions-cell">
                                                                                        {canEditDonation(donation) && (
                                                                                            <button className="action-btn edit-btn" onClick={() => { setSelectedDonationForEdit(JSON.parse(JSON.stringify(donation))); setShowEditModal(true); }}>
                                                                                                ✏️ {isAr ? 'تعديل' : 'Edit'}
                                                                                            </button>
                                                                                        )}
                                                                                        <button
                                                                                            type="button"
                                                                                            className="action-btn print-report-btn"
                                                                                            onClick={() => openMaterialReport(donation, 'donor')}
                                                                                            style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                        >
                                                                                            🖨️ {isAr ? 'كشف/طباع' : 'Report/Print'}
                                                                                        </button>
                                                                                        {canDeleteDonation && (
                                                                                            <button className="action-btn delete-btn" onClick={() => handleDeleteDonation(donation.id)}>
                                                                                                🗑️ {isAr ? 'حذف' : 'Delete'}
                                                                                            </button>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ─── جدول الحجوزات ─── */}
                                                {staffSubTab === 'bookings' && (
                                                    <div className="formal-table-wrapper">
                                                        <div className="formal-table-header">
                                                            <span className="formal-table-title">🔒 {isAr ? 'جدول حجوزات الطلاب (الحاجزين)' : 'Student Bookings Table'}</span>
                                                            <span className="formal-table-count">{isAr ? `إجمالي: ${filteredBookings.length} حجز` : `Total: ${filteredBookings.length} bookings`}</span>
                                                        </div>
                                                        {filteredBookings.length === 0 ? (
                                                            <div className="empty-state">📭 {isAr ? 'لا توجد حجوزات بعد' : 'No bookings yet'}</div>
                                                        ) : (
                                                            <div className="formal-table-scroll">
                                                                <table className="formal-table bookings-formal-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>#</th>
                                                                            <th>{isAr ? 'اسم الحاجز' : 'Booker Name'}</th>
                                                                            <th>{isAr ? 'هاتف الحاجز' : 'Booker Phone'}</th>
                                                                            <th>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                                                                            <th>{isAr ? 'الجنس' : 'Gender'}</th>
                                                                            <th>{isAr ? 'المادة المحجوز' : 'Booked Material'}</th>
                                                                            <th>{isAr ? 'اسم المختبرع' : 'Donor Name'}</th>
                                                                            <th>{isAr ? 'بريد المختبرع' : 'Donor Email'}</th>
                                                                            <th>{isAr ? 'حال الحجز' : 'Booking Status'}</th>
                                                                            <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {filteredBookings.map((booking, idx) => (
                                                                            <tr key={booking.id} className={`formal-row status-row-${booking.status}`}>
                                                                                <td className="row-num">{idx + 1}</td>
                                                                                <td className="donor-name-cell"><strong>{booking.takerInfo?.name || '—'}</strong></td>
                                                                                <td dir="ltr" className="phone-cell">{booking.takerInfo?.phone || '—'}</td>
                                                                                <td dir="ltr" className="email-cell">{booking.takerInfo?.email || '—'}</td>
                                                                                <td>
                                                                                    <span className={`gender-badge gender-${booking.takerInfo?.gender || booking.donorGender}`}>
                                                                                        {(booking.takerInfo?.gender || booking.donorGender) === 'male' ? (isAr ? '♂️ ذكر' : '♂️ Male') : (isAr ? '♀️ أنثى' : '♀️ Female')}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="materials-cell">
                                                                                    <strong>{booking.materialName}</strong>
                                                                                    {booking.materialDescription && <p className="material-note">{booking.materialDescription}</p>}
                                                                                </td>
                                                                                <td>{booking.donorName}</td>
                                                                                <td dir="ltr" className="email-cell">{booking.donorEmail || '—'}</td>
                                                                                <td>
                                                                                    <span className={`status-badge status-${booking.status}`}>
                                                                                        {booking.status === 'reserved' && (isAr ? '🔒 محجوز — بانتظار التسليم' : '🔒 Reserved')}
                                                                                        {booking.status === 'completed' && (isAr ? '✅ تم التسليم' : '✅ Delivered')}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="actions-cell">
                                                                                    {isAdminUser ? (
                                                                                        <>
                                                                                            {booking.status === 'reserved' && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="action-btn approve-btn"
                                                                                                    onClick={() => handleCompleteBooking(booking.donationId, booking.materialIndex)}
                                                                                                    style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto' }}
                                                                                                >
                                                                                                    ✅ {isAr ? 'تم التسليم' : 'Mark Delivered'}
                                                                                                </button>
                                                                                            )}
                                                                                            <button
                                                                                                type="button"
                                                                                                className="action-btn print-report-btn"
                                                                                                onClick={() => openMaterialReport(booking, 'booker')}
                                                                                                style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                            >
                                                                                                🖨️ {isAr ? 'كشف/طباع' : 'Report/Print'}
                                                                                            </button>
                                                                                            {(isAdminUser || isCoordinatorApprovedToEdit({ id: booking.donationId }) || (systemSettings.allowCoordinatorEditDelete && currentCoordinatorPerms.cancelBooking)) && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="action-btn delete-btn"
                                                                                                    onClick={() => {
                                                                                                        if (isAdminUser || (systemSettings.allowCoordinatorEditDelete && currentCoordinatorPerms.cancelBooking)) {
                                                                                                            handleCancelBooking(booking.donationId, booking.materialIndex);
                                                                                                        } else {
                                                                                                            openActionRequestModal(booking.donationId, 'cancelBooking', booking.materialIndex, booking);
                                                                                                        }
                                                                                                    }}
                                                                                                    style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto' }}
                                                                                                >
                                                                                                    🔓 {isAr ? 'إلغاء الحجز' : 'Cancel Booking'}
                                                                                                </button>
                                                                                            )}
                                                                                        </>
                                                                                    ) : (
                                                                                        <div className="view-only-actions-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                                            <button
                                                                                                type="button"
                                                                                                className="action-btn print-report-btn"
                                                                                                onClick={() => openMaterialReport(booking, 'booker')}
                                                                                                style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                            >
                                                                                                🖨️ {isAr ? 'كشف/طباع' : 'Report/Print'}
                                                                                            </button>
                                                                                            <span className="view-only-tag">👁️ {isAr ? 'للاطلاع فقط' : 'View Only'}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* PRE-REQUESTS TAB */}
                                                {activeTab === 'preRequests' && (
                                                    <div className="pre-requests-dashboard">
                                                        <div className="formal-table-wrapper">
                                                            <div className="formal-table-header">
                                                                <span className="formal-table-title"> {isAr ? 'طلبات مسبقة' : 'Pre-Requests'}</span>
                                                                <span className="formal-table-count">{isAr ? `إجمالي: ${preRequests.length} طلب` : `Total: ${preRequests.length} requests`}</span>
                                                            </div>
                                                            {preRequests.length === 0 ? (
                                                                <div className="empty-state">📭 {isAr ? 'لا توجد طلبات مسبقة حتى الآن' : 'No pre-requests yet'}</div>
                                                            ) : (
                                                                <div className="formal-table-scroll">
                                                                    <table className="formal-table prerequests-formal-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>#</th>
                                                                                <th>{isAr ? 'النوع' : 'Type'}</th>
                                                                                <th>{isAr ? 'اسم الطالب' : 'Student Name'}</th>
                                                                                <th>{isAr ? 'الهاتف' : 'Phone'}</th>
                                                                                <th>{isAr ? 'اسم المادة' : 'Material'}</th>
                                                                                <th>{isAr ? 'الملاحظات' : 'Notes'}</th>
                                                                                <th>{isAr ? 'تاريخخ الإرسال' : 'Submitted At'}</th>
                                                                                <th>{isAr ? 'حال الطلب' : 'Status'}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {preRequests.map((request, idx) => (
                                                                                <tr key={request.id}>
                                                                                    <td>{idx + 1}</td>
                                                                                    <td>{request.type === 'need' ? (isAr ? 'احتياج' : 'Need') : (isAr ? 'تبرع' : 'Donate')}</td>
                                                                                    <td>{request.studentName}</td>
                                                                                    <td dir="ltr">{request.phoneNumber}</td>
                                                                                    <td>{request.materialName}</td>
                                                                                    <td>{request.notes || '—'}</td>
                                                                                    <td>{formatPreRequestDate(request)}</td>
                                                                                    <td>{request.status || (isAr ? 'قيد الانتظار' : 'Pending')}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ─── جدول المواد التي تم تسليمها ─── */}
                                                {staffSubTab === 'delivered' && (() => {
                                                    // Merge: bookings from materialDonations + completed schedules from deliverySchedules
                                                    const completedScheduleRows = deliverySchedules
                                                        .filter(s => s.status === 'completed')
                                                        .map((s, i) => ({
                                                            id: `sched_${s.id}`,
                                                            isScheduleItem: true,
                                                            materialName: s.materialName || '—',
                                                            materialDescription: s.notes || '',
                                                            donorName: s.donorName || '—',
                                                            donorPhone: s.donorPhone || '—',
                                                            donorEmail: '—',
                                                            donorGender: null,
                                                            takerInfo: {
                                                                name: s.bookerName || '—',
                                                                phone: s.bookerPhone || '—',
                                                                email: '—',
                                                                gender: null,
                                                                deliveredAt: s.completedAt || s.updatedAt || s.createdAt
                                                            },
                                                            deliveryTimestamp: s.completedAt || s.updatedAt || s.createdAt,
                                                            assignedCoordinator: s.assignedCoordinator,
                                                            finalDeliveryBy: s.finalDeliveryBy
                                                        }));
                                                    const allDelivered = [...filteredDelivered, ...completedScheduleRows];
                                                    return (
                                                        <div className="formal-table-wrapper">
                                                            <div className="formal-table-header">
                                                                <span className="formal-table-title">🤝 {isAr ? 'جدول المواد التي تم تسليمها' : 'Delivered Materials Table'}</span>
                                                                <span className="formal-table-count">{isAr ? `إجمالي: ${allDelivered.length} مادة` : `Total: ${allDelivered.length} materials`}</span>
                                                            </div>
                                                            {allDelivered.length === 0 ? (
                                                                <div className="empty-state">📭 {isAr ? 'لا توجد مواد مسلم بعد' : 'No delivered materials yet'}</div>
                                                            ) : (
                                                                <div className="formal-table-scroll">
                                                                    <table className="formal-table bookings-formal-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>#</th>
                                                                                <th>{isAr ? 'اسم المستلم' : 'Recipient Name'}</th>
                                                                                <th>{isAr ? 'هاتف المستلم' : 'Recipient Phone'}</th>
                                                                                <th>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                                                                                <th>{isAr ? 'الجنس' : 'Gender'}</th>
                                                                                <th>{isAr ? 'المادة المسلم' : 'Delivered Material'}</th>
                                                                                <th>{isAr ? 'اسم المختبرع' : 'Donor Name'}</th>
                                                                                <th>{isAr ? 'هاتف المختبرع' : 'Donor Phone'}</th>
                                                                                <th>{isAr ? 'حال التسليم' : 'Delivery Status'}</th>
                                                                                <th>{isAr ? 'توقيت التسليم (بالثاني)' : 'Delivered At (with seconds)'}</th>
                                                                                <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {allDelivered.map((booking, idx) => (
                                                                                <tr key={booking.id} className="formal-row status-row-completed">
                                                                                    <td className="row-num">{idx + 1}</td>
                                                                                    <td className="donor-name-cell"><strong>{booking.takerInfo?.name || '—'}</strong></td>
                                                                                    <td dir="ltr" className="phone-cell">{booking.takerInfo?.phone || '—'}</td>
                                                                                    <td dir="ltr" className="email-cell">{booking.takerInfo?.email || '—'}</td>
                                                                                    <td>
                                                                                        {booking.takerInfo?.gender || booking.donorGender ? (
                                                                                            <span className={`gender-badge gender-${booking.takerInfo?.gender || booking.donorGender}`}>
                                                                                                {(booking.takerInfo?.gender || booking.donorGender) === 'male' ? (isAr ? '♂️ ذكر' : '♂️ Male') : (isAr ? '♀️ أنثى' : '♀️ Female')}
                                                                                            </span>
                                                                                        ) : <span style={{ opacity: 0.5 }}>—</span>}
                                                                                    </td>
                                                                                    <td className="materials-cell">
                                                                                        <strong>{booking.materialName}</strong>
                                                                                        {booking.materialDescription && <p className="material-note">{booking.materialDescription}</p>}
                                                                                    </td>
                                                                                    <td>{booking.donorName}</td>
                                                                                    <td dir="ltr" className="phone-cell">{booking.donorPhone || booking.donorEmail || '—'}</td>
                                                                                    <td>
                                                                                        <span className="status-badge status-completed">
                                                                                            {isAr ? '✅ تم التسليم' : '✅ Delivered'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td style={{ whiteSpace: 'nowrap', fontWeight: 'bold', color: '#22c55e' }}>
                                                                                        {formatDateTimeWithSeconds(booking.takerInfo?.deliveredAt || booking.deliveryTimestamp)}
                                                                                    </td>
                                                                                    <td className="actions-cell">
                                                                                        <div className="view-only-actions-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                                            {!booking.isScheduleItem && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="action-btn print-report-btn"
                                                                                                    onClick={() => openMaterialReport(booking, 'booker')}
                                                                                                    style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                                >
                                                                                                    🖨️ {isAr ? 'كشف/طباع' : 'Report/Print'}
                                                                                                </button>
                                                                                            )}
                                                                                            {!booking.isScheduleItem && isAdminUser ? (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    className="action-btn delete-btn"
                                                                                                    onClick={() => handleCancelBooking(booking.donationId, booking.materialIndex)}
                                                                                                    style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto' }}
                                                                                                >
                                                                                                    🔓 {isAr ? 'إلغاء التسليم' : 'Cancel Delivery'}
                                                                                                </button>
                                                                                            ) : !booking.isScheduleItem && (
                                                                                                (isAdminUser || isCoordinatorApprovedToEdit({ id: booking.donationId }) || (systemSettings.allowCoordinatorEditDelete && currentCoordinatorPerms.cancelBooking)) ? (
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        className="action-btn delete-btn"
                                                                                                        onClick={() => {
                                                                                                            if (systemSettings.allowCoordinatorEditDelete && currentCoordinatorPerms.cancelBooking) {
                                                                                                                handleCancelBooking(booking.donationId, booking.materialIndex);
                                                                                                            } else {
                                                                                                                openActionRequestModal(booking.donationId, 'cancelBooking', booking.materialIndex, booking);
                                                                                                            }
                                                                                                        }}
                                                                                                        style={{ zIndex: 100, cursor: 'pointer', pointerEvents: 'auto' }}
                                                                                                    >
                                                                                                        🔓 {isAr ? 'إلغاء التسليم' : 'Cancel Delivery'}
                                                                                                    </button>
                                                                                                ) : (
                                                                                                    <span className="view-only-tag">👁️ {isAr ? 'للاطلاع فقط' : 'View Only'}</span>
                                                                                                )
                                                                                            )}
                                                                                            {booking.isScheduleItem && (
                                                                                                <span className="status-badge status-completed" style={{ fontSize: '0.72rem' }}>📅 {isAr ? 'من جدول التسليم' : 'From Schedule'}</span>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}

                                                {/* ─── الجدول المشترك (حجوزات بين الجنسين) ─── */}
                                                {staffSubTab === 'shared' && (
                                                    <div className="formal-table-wrapper">
                                                        <div className="formal-table-header">
                                                            <span className="formal-table-title">
                                                                ⚡ {isAr ? 'الجدول المشترك (تسليم بين المنسقين)' : 'Shared Table (Cross-Gender Handover)'}
                                                            </span>
                                                            <span className="formal-table-count">
                                                                {isAr ? 'حجوزات مشترك بين الجنسين' : 'Cross-gender reservations'}
                                                            </span>
                                                        </div>
                                                        {(() => {
                                                            // Filter bookings where donor gender ≠ taker gender OR gender data is incomplete
                                                            const sharedBookings = [];
                                                            allDonations.forEach(donation => {
                                                                // All coordinators and admins can see the full shared table
                                                                if (donation.materials) {
                                                                    donation.materials.forEach((m, idx) => {
                                                                        if (typeof m === 'object' && (m.status === 'reserved' || m.status === 'completed')) {
                                                                            const takerGender = m.takerInfo?.gender;
                                                                            const donorGender = donation.studentGender;

                                                                            // EXCLUDE only when both genders are known AND identical (confirmed same-gender, handled by own coordinator)
                                                                            const confirmedSameGender = takerGender && donorGender && takerGender === donorGender;
                                                                            if (confirmedSameGender) return;

                                                                            const sharedBookingRecord = {
                                                                                id: `${donation.id}_shared_${idx}`,
                                                                                donationId: donation.id,
                                                                                materialIndex: idx,
                                                                                donation,
                                                                                material: m,
                                                                                takerInfo: m.takerInfo || {},
                                                                                donorName: donation.studentName,
                                                                                donorGender: donation.studentGender,
                                                                                donorPhone: donation.phoneNumber,
                                                                                donorEmail: donation.email,
                                                                                takerName: m.takerInfo?.name || '—',
                                                                                takerGender: m.takerInfo?.gender,
                                                                                takerPhone: m.takerInfo?.phone || '—',
                                                                                takerEmail: m.takerInfo?.email || '—',
                                                                                materialName: m.name,
                                                                                materialDescription: m.description || '—',
                                                                                materialStatus: m.status,
                                                                                coordinatorAssigned: donation.delegatedTo || null,
                                                                                // Flag rows with incomplete gender data so UI can warn coordinator
                                                                                hasGenderWarning: !takerGender || !donorGender
                                                                            };
                                                                            if (sharedBookingMatchesSearch(sharedBookingRecord)) {
                                                                                sharedBookings.push(sharedBookingRecord);
                                                                            }
                                                                        }
                                                                    });
                                                                }
                                                            });

                                                            return sharedBookings.length === 0 ? (
                                                                <div className="empty-state">✅ {isAr ? 'لا توجد حجوزات مشترك حالياً' : 'No shared bookings at the moment'}</div>
                                                            ) : (
                                                                <div className="formal-table-scroll">
                                                                    <table className="formal-table shared-handover-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>#</th>
                                                                                <th>{isAr ? 'المختبرع (الجه الأولى)' : 'Donor (First Party)'}</th>
                                                                                <th>{isAr ? 'جنس المختبرع' : "Donor's Gender"}</th>
                                                                                <th>{isAr ? 'هاتف المختبرع' : 'Donor Phone'}</th>
                                                                                <th>{isAr ? 'المادة' : 'Material'}</th>
                                                                                <th>{isAr ? 'حال التسليم' : 'Delivery Status'}</th>
                                                                                <th>{isAr ? 'الحاجز (الجه الثاني)' : 'Taker (Second Party)'}</th>
                                                                                <th>{isAr ? 'جنس الحاجز' : "Taker's Gender"}</th>
                                                                                <th>{isAr ? 'هاتف الحاجز' : 'Taker Phone'}</th>
                                                                                <th>{isAr ? 'المنسق المكلّف' : 'Assigned Coordinator'}</th>
                                                                                <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {sharedBookings.map((booking, idx) => (
                                                                                <tr key={booking.id} className={`formal-row status-row-${booking.materialStatus}${booking.hasGenderWarning ? ' gender-warning-row' : ''}`}>
                                                                                    <td className="row-num">{idx + 1}</td>
                                                                                    <td className="donor-name-cell"><strong>{booking.donorName}</strong></td>
                                                                                    <td>
                                                                                        {booking.donorGender ? (
                                                                                            <span className={`gender-badge gender-${booking.donorGender}`}>
                                                                                                {booking.donorGender === 'male' ? (isAr ? '♂️ شب' : '♂️ M') : (isAr ? '♀️ بنت' : '♀️ F')}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="gender-badge gender-unknown" title={isAr ? 'جنس المختبرع غير مسجّل' : 'Donor gender not recorded'}>⚠️ ?</span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td dir="ltr" className="phone-cell">{booking.donorPhone}</td>
                                                                                    <td className="material-name-cell">
                                                                                        <strong>{booking.materialName}</strong>
                                                                                        {booking.materialDescription !== '—' && <small>{booking.materialDescription}</small>}
                                                                                        {booking.hasGenderWarning && (
                                                                                            <small style={{ display: 'block', color: '#f59e0b', marginTop: '2px' }}>
                                                                                                {isAr ? '⚠️ جنس غير مكتمل — يرجى التحقق يدوياً' : '⚠️ Gender info incomplete — verify manually'}
                                                                                            </small>
                                                                                        )}
                                                                                    </td>
                                                                                    <td>
                                                                                        <span className={`status-badge status-${booking.materialStatus}`}>
                                                                                            {booking.materialStatus === 'reserved' ? (isAr ? '🔒 محجوز' : '🔒 Reserved') : (isAr ? '✅ مُسلّم' : '✅ Delivered')}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="taker-name-cell"><strong>{booking.takerName}</strong></td>
                                                                                    <td>
                                                                                        {isAdminUser ? (
                                                                                            <select
                                                                                                value={booking.takerGender || ''}
                                                                                                onChange={(e) => handleUpdateTakerGender(booking.donationId, booking.materialIndex, e.target.value)}
                                                                                                className="admin-gender-select"
                                                                                                style={{
                                                                                                    padding: '4px 8px',
                                                                                                    borderRadius: '6px',
                                                                                                    border: '1.5px dashed #f59e0b',
                                                                                                    fontSize: '0.85rem',
                                                                                                    background: booking.takerGender === 'male' ? '#e0f2fe' : (booking.takerGender === 'female' ? '#fce7f3' : '#fef3c7'),
                                                                                                    color: booking.takerGender === 'male' ? '#0369a1' : (booking.takerGender === 'female' ? '#be185d' : '#d97706'),
                                                                                                    fontWeight: 'bold',
                                                                                                    cursor: 'pointer',
                                                                                                    outline: 'none',
                                                                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                                                                                                }}
                                                                                            >
                                                                                                <option value="" style={{ background: '#fff', color: '#333' }}>⚠️ {isAr ? '؟' : '?'}</option>
                                                                                                <option value="male" style={{ background: '#fff', color: '#333' }}>♂️ {isAr ? 'شب' : 'Male'}</option>
                                                                                                <option value="female" style={{ background: '#fff', color: '#333' }}>♀️ {isAr ? 'بنت' : 'Female'}</option>
                                                                                            </select>
                                                                                        ) : (
                                                                                            booking.takerGender ? (
                                                                                                <span className={`gender-badge gender-${booking.takerGender}`}>
                                                                                                    {booking.takerGender === 'male' ? (isAr ? '♂️ شب' : '♂️ M') : (isAr ? '♀️ بنت' : '♀️ F')}
                                                                                                </span>
                                                                                            ) : (
                                                                                                <span className="gender-badge gender-unknown" title={isAr ? 'جنس الحاجز غير مسجّل' : 'Taker gender not recorded'}>⚠️ ?</span>
                                                                                            )
                                                                                        )}
                                                                                    </td>
                                                                                    <td dir="ltr" className="phone-cell">{booking.takerPhone}</td>
                                                                                    <td>
                                                                                        {booking.coordinatorAssigned ? (
                                                                                            <span className="delegated-to-badge">
                                                                                                {booking.coordinatorAssigned === 'ahmad'
                                                                                                    ? `♂️ ${systemSettings.ahmadNameAr || 'أحمد'}`
                                                                                                    : booking.coordinatorAssigned === 'sara'
                                                                                                        ? `♀️ ${systemSettings.saraNameAr || 'سار'}`
                                                                                                        : booking.coordinatorAssigned}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span style={{ color: 'rgba(255,100,100,1)', fontWeight: 'bold' }}>
                                                                                                {isAr ? '⚠️ لم يُعيّن' : '⚠️ Not assigned'}
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="actions-cell">
                                                                                        {isAdminUser && !booking.coordinatorAssigned && (
                                                                                            <>
                                                                                                <button
                                                                                                    className="action-btn approve-btn"
                                                                                                    onClick={() => {
                                                                                                        handleUpdateDelegation(booking.donationId, 'ahmad');
                                                                                                        toast.success(isAr ? '✅ تم التعيين للمنسق' : '✅ Assigned');
                                                                                                    }}
                                                                                                    title={`Assign to ${systemSettings.ahmadNameAr || 'Ahmad'}`}
                                                                                                    style={{ marginRight: '4px' }}
                                                                                                >
                                                                                                    ♂️
                                                                                                </button>
                                                                                                <button
                                                                                                    className="action-btn approve-btn"
                                                                                                    onClick={() => {
                                                                                                        handleUpdateDelegation(booking.donationId, 'sara');
                                                                                                        toast.success(isAr ? '✅ تم التعيين للمنسق' : '✅ Assigned');
                                                                                                    }}
                                                                                                    title={`Assign to ${systemSettings.saraNameAr || 'Sara'}`}
                                                                                                >
                                                                                                    ♀️
                                                                                                </button>
                                                                                            </>
                                                                                        )}
                                                                                        {isAdminUser && booking.coordinatorAssigned && (
                                                                                            <button
                                                                                                className="action-btn delete-btn"
                                                                                                onClick={() => {
                                                                                                    handleUpdateDelegation(booking.donationId, null);
                                                                                                    toast.success(isAr ? '✅ تم إلغاء التعيين' : '✅ Unassigned');
                                                                                                }}
                                                                                            >
                                                                                                🔄 {isAr ? 'إعاد تعيين' : 'Reassign'}
                                                                                            </button>
                                                                                        )}
                                                                                        {!isAdminUser && (
                                                                                            booking.coordinatorAssigned === loggedInUser.username ? (
                                                                                                <>
                                                                                                    {booking.materialStatus === 'reserved' && (
                                                                                                        <button
                                                                                                            type="button"
                                                                                                            className="action-btn approve-btn"
                                                                                                            onClick={() => handleCompleteBooking(booking.donationId, booking.materialIndex)}
                                                                                                            style={{ marginRight: '4px' }}
                                                                                                        >
                                                                                                            ✅ {isAr ? 'تم التسليم' : 'Deliver'}
                                                                                                        </button>
                                                                                                    )}
                                                                                                    <a
                                                                                                        href={generateWhatsAppLink(booking.donation, 'donor')}
                                                                                                        target="_blank"
                                                                                                        rel="noopener noreferrer"
                                                                                                        className="action-btn message-btn"
                                                                                                        title={isAr ? 'مراسل المختبرع' : 'Message Donor'}
                                                                                                        style={{ marginRight: '4px' }}
                                                                                                    >
                                                                                                        💬 {isAr ? 'المختبرع' : 'Donor'}
                                                                                                    </a>
                                                                                                    <a
                                                                                                        href={generateWhatsAppLink(booking, 'booker')}
                                                                                                        target="_blank"
                                                                                                        rel="noopener noreferrer"
                                                                                                        className="action-btn message-btn"
                                                                                                        title={isAr ? 'مراسل الحاجز' : 'Message Booker'}
                                                                                                    >
                                                                                                        💬 {isAr ? 'الحاجز' : 'Booker'}
                                                                                                    </a>
                                                                                                </>
                                                                                            ) : (
                                                                                                <span className="view-only-tag">👁️ {isAr ? 'للاطلاع' : 'View Only'}</span>
                                                                                            )
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* DELIVERY SCHEDULE TAB */}
                            {activeTab === 'donations' && staffSubTab === 'schedule' && (
                                <div className="formal-table-wrapper">

                                    {/* ─── Page Header ─── */}
                                    <div className="formal-table-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                        <div>
                                            <span className="formal-table-title">📅 {isAr ? 'جدول تسليم الحجوزات' : 'Delivery Schedule'}</span>
                                            <span className="formal-table-count" style={{ marginRight: isAr ? '0' : '8px', marginLeft: isAr ? '8px' : '0' }}>
                                                {isAr ? `${deliverySchedules.length} سجل` : `${deliverySchedules.length} record(s)`}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <input
                                                type="text"
                                                placeholder={isAr ? '🔍 بحث...' : '🔍 Search...'}
                                                value={scheduleSearchQuery}
                                                onChange={e => setScheduleSearchQuery(e.target.value)}
                                                className="schedule-form-input"
                                                style={{ padding: '6px 12px', minWidth: '180px' }}
                                            />
                                            {(isAdminUser || loggedInUser?.role === 'coordinator') && (
                                                <button
                                                    className="action-btn approve-btn"
                                                    onClick={() => { setShowNewSectionForm(p => !p); setNewSectionData({ name: '', icon: '👤', color: '#2c3e50' }); }}
                                                    style={{ padding: '6px 14px', fontWeight: 'bold', fontSize: '0.85rem' }}
                                                    title={isAr ? 'إضاف جدول جديد' : 'Add New Section'}
                                                >
                                                    {showNewSectionForm ? '❌' : (isAr ? '➕ جدول جديد' : '➕ New Section')}
                                                </button>
                                            )}
                                            <button
                                                className="dashboard-refresh-btn"
                                                onClick={fetchDeliverySchedules}
                                                title={isAr ? 'تحديث' : 'Refresh'}
                                                disabled={deliveryScheduleLoading}
                                            >
                                                {deliveryScheduleLoading ? '⏳' : '🔄'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ─── Daily Reports Actions ─── */}
                                    <div style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1.5px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '12px',
                                        padding: '12px 18px',
                                        marginTop: '16px',
                                        marginBottom: '16px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px'
                                    }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>📋</span>
                                            <span>{isAr ? 'كشوفات التوزيع اليومي للطباع (منسق - مختبرع - حاجز):' : 'Daily distribution reports for printing:'}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {[
                                                { date: '2026-07-12', dayAr: 'الأحد ١٢ / ٧', dayEn: 'Sunday 12/7' },
                                                { date: '2026-07-13', dayAr: 'الإثنين ١٣ / ٧', dayEn: 'Monday 12/7' },
                                                { date: '2026-07-14', dayAr: 'الثلاثاء ١٤ / ٧', dayEn: 'Tuesday 12/7' },
                                                { date: '2026-07-15', dayAr: 'الأربعاء ١٥ / ٧', dayEn: 'Wednesday 12/7' }
                                            ].map(day => {
                                                const count = deliverySchedules.filter(s => s.pickupDate === day.date).length;
                                                return (
                                                    <button
                                                        key={day.date}
                                                        onClick={() => printDailyReport(day.date, isAr ? day.dayAr : day.dayEn)}
                                                        style={{
                                                            background: 'rgba(52, 152, 219, 0.15)',
                                                            border: '1px solid rgba(52, 152, 219, 0.3)',
                                                            borderRadius: '8px',
                                                            padding: '8px 14px',
                                                            color: '#3498db',
                                                            cursor: 'pointer',
                                                            fontWeight: 'bold',
                                                            fontSize: '0.85rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onMouseOver={e => { e.currentTarget.style.background = 'rgba(52, 152, 219, 0.25)'; }}
                                                        onMouseOut={e => { e.currentTarget.style.background = 'rgba(52, 152, 219, 0.15)'; }}
                                                    >
                                                        <span>📅</span>
                                                        <span>{isAr ? day.dayAr : day.dayEn}</span>
                                                        <span style={{
                                                            background: 'rgba(255,255,255,0.15)',
                                                            color: '#fff',
                                                            padding: '2px 6px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            marginRight: isAr ? '4px' : '0',
                                                            marginLeft: isAr ? '0' : '4px'
                                                        }}>{count}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* ─── New Section Form ─── */}
                                    {showNewSectionForm && (isAdminUser || loggedInUser?.role === 'coordinator') && (
                                        <div className="schedule-inline-form" style={{ gridTemplateColumns: '1fr auto', alignItems: 'flex-end', gap: '12px', marginTop: '12px', marginBottom: '4px' }}>
                                            <div>
                                                <label className="schedule-form-label">{isAr ? '* اسم الجدول الجديد' : '* New Section Name'}</label>
                                                <input
                                                    type="text"
                                                    value={newSectionData.name}
                                                    onChange={e => setNewSectionData(p => ({ ...p, name: e.target.value }))}
                                                    placeholder={isAr ? 'مثال: طلال' : 'e.g. Talal'}
                                                    className="schedule-form-input"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    className="action-btn delete-btn"
                                                    style={{ padding: '7px 16px' }}
                                                    onClick={() => setShowNewSectionForm(false)}
                                                >
                                                    {isAr ? 'إلغاء' : 'Cancel'}
                                                </button>
                                                <button
                                                    className="action-btn approve-btn"
                                                    style={{ padding: '7px 16px', fontWeight: 'bold' }}
                                                    onClick={() => {
                                                        if (!newSectionData.name.trim()) return;
                                                        const key = `custom_${Date.now()}`;
                                                        const colors = ['#2c3e50', '#2980b9', '#8e44ad', '#27ae60', '#d35400', '#f39c12'];
                                                        const randomColor = colors[Math.floor(Math.random() * colors.length)];
                                                        const updated = [...customSections, { key, name: newSectionData.name.trim(), icon: '👤', color: randomColor }];
                                                        setCustomSections(updated);
                                                        localStorage.setItem('customDeliverySections', JSON.stringify(updated));
                                                        setShowNewSectionForm(false);
                                                        setNewSectionData({ name: '', icon: '👤', color: '#2c3e50' });
                                                    }}
                                                >
                                                    {isAr ? '✅ إنشاء' : '✅ Create'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* ─── 4-Quadrant / Custom Tables (per-person inline add form) ─── */}
                                    {deliveryScheduleLoading ? (
                                        <div className="empty-state" style={{ padding: '40px' }}>⏳ {isAr ? 'جاري التحميل...' : 'Loading...'}</div>
                                    ) : (() => {
                                        const scheduleStatusMeta = {
                                            pending_contact: { label: isAr ? 'لم يُتواصل بعد' : 'Not Contacted', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '⏳' },
                                            contacted: { label: isAr ? 'تم التواصل' : 'Contacted', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: '📞' },
                                            scheduled: { label: isAr ? 'مؤكد الحضور' : 'Confirmed', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', icon: '✔️' },
                                            completed: { label: isAr ? 'تم التسليم' : 'Delivered', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: '✅' }
                                        };

                                        const filteredSchedules = deliverySchedules.filter(s => {
                                            if (!scheduleSearchQuery) return true;
                                            const q = scheduleSearchQuery.toLowerCase();
                                            return (s.donorName || '').toLowerCase().includes(q) ||
                                                (s.materialName || '').toLowerCase().includes(q) ||
                                                (s.donorPhone || '').includes(q) ||
                                                (s.bookerName || '').toLowerCase().includes(q) ||
                                                (s.bookerPhone || '').includes(q) ||
                                                (s.notes || '').toLowerCase().includes(q);
                                        });

                                        // Partition into groups
                                        const adminList = [], aliList = [], sondosList = [], mohammadList = [], otherList = [];
                                        const customLists = {};
                                        customSections.forEach(sec => { customLists[sec.key] = []; });

                                        filteredSchedules.forEach(s => {
                                            const donor = (s.donorName || '').toLowerCase();
                                            const matchedCustom = customSections.find(sec =>
                                                donor.includes(sec.name.toLowerCase())
                                            );
                                            if (matchedCustom) {
                                                customLists[matchedCustom.key].push(s);
                                            } else if (donor.includes('حسين') || donor.includes('ادمن') || donor.includes('admin')) {
                                                adminList.push(s);
                                            } else if (donor.includes('سندس') || donor.includes('سار') || donor.includes('sara')) {
                                                sondosList.push(s);
                                            } else if (donor.includes('زغلول') || donor.includes('زغول') || donor.includes('محمد')) {
                                                mohammadList.push(s);
                                            } else if (donor.includes('زعبي') || donor.includes('علي') || donor.includes('احمد') || donor.includes('ahmad')) {
                                                aliList.push(s);
                                            } else {
                                                otherList.push(s);
                                            }
                                        });

                                        // Inline add form shared between quadrants
                                        const renderInlineAddForm = (quadrantKey, prefillDonorName) => {
                                            if (activeAddFormQuadrant !== quadrantKey) return null;
                                            const isOther = quadrantKey === 'other';
                                            return (
                                                <div className="schedule-inline-form">
                                                    {/* Donor Name (pre-filled & read-only for named quadrants) */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? '* اسم المختبرع' : '* Donor Name'}</label>
                                                        <input
                                                            type="text"
                                                            value={isOther ? scheduleFormData.donorName : prefillDonorName}
                                                            readOnly={!isOther}
                                                            onChange={isOther ? (e => setScheduleFormData(p => ({ ...p, donorName: e.target.value }))) : undefined}
                                                            className="schedule-form-input"
                                                        />
                                                    </div>
                                                    {/* Donor Phone */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? 'هاتف المختبرع' : 'Donor Phone'}</label>
                                                        <input type="tel" dir="ltr" value={scheduleFormData.donorPhone} onChange={e => setScheduleFormData(p => ({ ...p, donorPhone: e.target.value }))} placeholder="07xx-xxx-xxxx" className="schedule-form-input" />
                                                    </div>
                                                    {/* Booker Name */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? 'اسم الحاجز' : 'Booker Name'}</label>
                                                        <input type="text" value={scheduleFormData.bookerName} onChange={e => setScheduleFormData(p => ({ ...p, bookerName: e.target.value }))} placeholder={isAr ? 'اسم الشخص الحاجز...' : 'Booker...'} className="schedule-form-input" />
                                                    </div>
                                                    {/* Booker Phone */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? 'هاتف الحاجز' : 'Booker Phone'}</label>
                                                        <input type="tel" dir="ltr" value={scheduleFormData.bookerPhone} onChange={e => setScheduleFormData(p => ({ ...p, bookerPhone: e.target.value }))} placeholder="07xx-xxx-xxxx" className="schedule-form-input" />
                                                    </div>
                                                    {/* Material */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? '* المادة' : '* Material'}</label>
                                                        <input type="text" value={scheduleFormData.materialName} onChange={e => setScheduleFormData(p => ({ ...p, materialName: e.target.value }))} placeholder={isAr ? 'كيمياء عضوي...' : 'Organic Chemistry...'} className="schedule-form-input" />
                                                    </div>
                                                    {/* Pickup Date */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? '* تاريخخ الإحضار' : '* Pickup Date'}</label>
                                                        <input type="date" value={scheduleFormData.pickupDate} onChange={e => setScheduleFormData(p => ({ ...p, pickupDate: e.target.value }))} className="schedule-form-input" />
                                                    </div>
                                                    {/* Pickup Time */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? 'الوقت' : 'Time'}</label>
                                                        <input type="time" value={scheduleFormData.pickupTime} onChange={e => setScheduleFormData(p => ({ ...p, pickupTime: e.target.value }))} className="schedule-form-input" />
                                                    </div>
                                                    {/* Assigned Coordinator */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? '* المنسق' : '* Coordinator'}</label>
                                                        <select value={scheduleFormData.assignedCoordinator} onChange={e => setScheduleFormData(p => ({ ...p, assignedCoordinator: e.target.value }))} className="schedule-form-select">
                                                            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
                                                            <option value="ahmad">♂️ {systemSettings.ahmadNameAr || 'علي'}</option>
                                                            <option value="sara">♀️ {systemSettings.saraNameAr || 'سندس'}</option>
                                                        </select>
                                                    </div>
                                                    {/* Final Delivery By */}
                                                    <div>
                                                        <label className="schedule-form-label">{isAr ? 'التسليم النهائي' : 'Final Delivery By'}</label>
                                                        <select value={scheduleFormData.finalDeliveryBy} onChange={e => setScheduleFormData(p => ({ ...p, finalDeliveryBy: e.target.value }))} className="schedule-form-select">
                                                            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
                                                            <option value="admin">👑 {isAr ? 'الأدمن / حسين' : 'Admin / Hussein'}</option>
                                                            <option value="ahmad">♂️ {systemSettings.ahmadNameAr || 'علي'}</option>
                                                            <option value="sara">♀️ {systemSettings.saraNameAr || 'سندس'}</option>
                                                        </select>
                                                    </div>
                                                    {/* Notes */}
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <label className="schedule-form-label">{isAr ? 'ملاحظات' : 'Notes'}</label>
                                                        <input type="text" value={scheduleFormData.notes} onChange={e => setScheduleFormData(p => ({ ...p, notes: e.target.value }))} placeholder={isAr ? 'ملاحظات اختيارية...' : 'Optional notes...'} className="schedule-form-input" />
                                                    </div>
                                                    {/* Actions */}
                                                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                        <button
                                                            className="action-btn delete-btn"
                                                            onClick={() => {
                                                                setActiveAddFormQuadrant(null);
                                                                setScheduleFormData({ donorName: '', donorPhone: '', bookerName: '', bookerPhone: '', materialName: '', pickupDate: '', pickupTime: '', assignedCoordinator: '', finalDeliveryBy: '', reminderMessage: '', notes: '' });
                                                            }}
                                                            style={{ padding: '7px 16px' }}
                                                        >
                                                            {isAr ? 'إلغاء' : 'Cancel'}
                                                        </button>
                                                        <button
                                                            className="action-btn approve-btn"
                                                            onClick={() => {
                                                                if (!isOther) setScheduleFormData(p => ({ ...p, donorName: prefillDonorName }));
                                                                handleAddDeliverySchedule();
                                                            }}
                                                            disabled={scheduleFormLoading}
                                                            style={{ padding: '7px 16px', fontWeight: 'bold' }}
                                                        >
                                                            {scheduleFormLoading ? '⏳...' : (isAr ? '✅ حفظ' : '✅ Save')}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        };

                                        // Quadrant card renderer
                                        const renderQuadrant = (quadrantKey, title, icon, list, headerBg, prefillDonorName) => {
                                            const canAdd = isAdminUser || loggedInUser?.role === 'coordinator';
                                            const isExpanded = activeAddFormQuadrant === quadrantKey;
                                            return (
                                                <div className="quadrant-card" style={{
                                                    background: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1.5px solid rgba(255, 255, 255, 0.08)',
                                                    borderRadius: '16px',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.15)',
                                                    backdropFilter: 'blur(4px)'
                                                }}>
                                                    {/* Card Header */}
                                                    <div style={{
                                                        background: headerBg,
                                                        padding: '12px 18px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        color: '#fff',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.98rem'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span>{icon}</span>
                                                            <span>{title}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.78rem' }}>
                                                                {isAr ? `${list.length} سجل` : `${list.length} records`}
                                                            </span>
                                                            {canAdd && (
                                                                <button
                                                                    onClick={() => {
                                                                        setScheduleFormData({ donorName: '', donorPhone: '', bookerName: '', bookerPhone: '', materialName: '', pickupDate: '', pickupTime: '', assignedCoordinator: '', finalDeliveryBy: '', reminderMessage: '', notes: '' });
                                                                        setActiveAddFormQuadrant(isExpanded ? null : quadrantKey);
                                                                    }}
                                                                    style={{
                                                                        border: 'none',
                                                                        background: isExpanded ? 'rgba(231,76,60,0.25)' : 'rgba(255,255,255,0.2)',
                                                                        color: '#fff',
                                                                        borderRadius: '8px',
                                                                        padding: '4px 10px',
                                                                        fontSize: '0.8rem',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 'bold',
                                                                        transition: 'background 0.2s'
                                                                    }}
                                                                >
                                                                    {isExpanded ? '❌' : '➕'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Inline Add Form */}
                                                    <div style={{ padding: isExpanded ? '0 12px' : '0' }}>
                                                        {renderInlineAddForm(quadrantKey, prefillDonorName)}
                                                    </div>

                                                    {/* Table Content */}
                                                    <div style={{ padding: '12px', flex: 1, overflowX: 'auto' }}>
                                                        {list.length === 0 && !isExpanded ? (
                                                            <div style={{ textAlign: 'center', padding: '30px', opacity: 0.5, fontSize: '0.9rem' }}>
                                                                {isAr ? '📭 لا توجد مواعيد تسليم في هذا القسم' : '📭 No delivery appointments here'}
                                                            </div>
                                                        ) : list.length === 0 ? null : (
                                                            <table className="formal-table compact-delivery-table" style={{ width: '100%', minWidth: '450px', borderCollapse: 'collapse' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1.5px solid rgba(255,255,255,0.1)' }}>
                                                                        <th style={{ padding: '8px 4px', fontSize: '0.8rem', textAlign: 'start' }}>{isAr ? 'المادة / التفاصيل' : 'Material / Details'}</th>
                                                                        <th style={{ padding: '8px 4px', fontSize: '0.8rem', textAlign: 'start' }}>{isAr ? 'الأطراف والتواصل' : 'Parties / Contacts'}</th>
                                                                        <th style={{ padding: '8px 4px', fontSize: '0.8rem', textAlign: 'start' }}>{isAr ? 'الحال' : 'Status'}</th>
                                                                        <th style={{ padding: '8px 4px', fontSize: '0.8rem', textAlign: 'center', width: '70px' }}>{isAr ? 'إجراءات' : 'Actions'}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {list.map((schedule) => {
                                                                        const meta = scheduleStatusMeta[schedule.status] || scheduleStatusMeta.pending_contact;
                                                                        const dateDisplay = schedule.pickupDate
                                                                            ? new Date(schedule.pickupDate + 'T00:00:00').toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { month: 'short', day: 'numeric' })
                                                                            : '';
                                                                        const timeDisplay = schedule.pickupTime || '';
                                                                        const deliveryPerson = schedule.finalDeliveryBy === 'ahmad' ? (isAr ? (systemSettings.ahmadNameAr || 'علي') : 'Ali')
                                                                            : schedule.finalDeliveryBy === 'sara' ? (isAr ? (systemSettings.saraNameAr || 'سندس') : 'Sondos')
                                                                                : schedule.finalDeliveryBy === 'admin' ? (isAr ? 'الأدمن حسين' : 'Admin Hussein')
                                                                                    : schedule.finalDeliveryBy || '';
                                                                        const canEdit = isAdminUser || loggedInUser?.role === 'coordinator';
                                                                        return (
                                                                            <tr key={schedule.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                                                {/* Material & Date */}
                                                                                <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                                                                                    <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-main)' }}>{schedule.materialName || '—'}</div>
                                                                                    <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '2px' }}>
                                                                                        📅 {dateDisplay} {timeDisplay && `⏰ ${timeDisplay}`}
                                                                                    </div>
                                                                                    {deliveryPerson && (
                                                                                        <div style={{ fontSize: '0.72rem', marginTop: '2px', color: '#e67e22' }}>
                                                                                            🚚 {deliveryPerson}
                                                                                        </div>
                                                                                    )}
                                                                                    {schedule.notes && (
                                                                                        <div style={{ fontSize: '0.72rem', opacity: 0.5, color: '#f39c12', marginTop: '2px', wordBreak: 'break-word' }}>
                                                                                            📝 {schedule.notes}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                                {/* Donor & Booker */}
                                                                                <td style={{ padding: '8px 4px', verticalAlign: 'top', fontSize: '0.78rem' }}>
                                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                                            <span style={{ opacity: 0.6 }}>📦 {isAr ? 'مختبرع:' : 'Donor:'}</span>
                                                                                            <strong style={{ color: 'var(--text-main)' }}>{schedule.donorName || '—'}</strong>
                                                                                            {schedule.donorPhone && (
                                                                                                <a href={generateScheduleWhatsAppLink(schedule)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#2ecc71', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', background: 'rgba(46,204,113,0.1)', padding: '1px 5px', borderRadius: '4px' }} title={isAr ? 'تذكير المختبرع' : 'Remind Donor'}>
                                                                                                    💬
                                                                                                </a>
                                                                                            )}
                                                                                        </div>
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                                            <span style={{ opacity: 0.6 }}>🔖 {isAr ? 'حاجز:' : 'Booker:'}</span>
                                                                                            <strong style={{ color: 'var(--text-main)' }}>{schedule.bookerName || '—'}</strong>
                                                                                            {schedule.bookerPhone && (
                                                                                                <a href={generateBookerWhatsAppLink(schedule)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#3498db', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', background: 'rgba(52,152,219,0.1)', padding: '1px 5px', borderRadius: '4px' }} title={isAr ? 'تذكير الحاجز' : 'Remind Booker'}>
                                                                                                    💬
                                                                                                </a>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                {/* Status Dropdown */}
                                                                                <td style={{ padding: '8px 4px', verticalAlign: 'middle' }}>
                                                                                    {canEdit ? (
                                                                                        <select
                                                                                            value={schedule.status}
                                                                                            onChange={e => handleUpdateScheduleStatus(schedule.id, e.target.value)}
                                                                                            style={{ padding: '3px 8px', borderRadius: '12px', border: `1px solid ${meta.color}`, background: meta.bg, color: meta.color, fontWeight: 'bold', fontSize: '0.72rem', cursor: 'pointer', outline: 'none', width: '100%', maxWidth: '120px', boxSizing: 'border-box' }}
                                                                                        >
                                                                                            <option value="pending_contact">{scheduleStatusMeta.pending_contact.icon} {scheduleStatusMeta.pending_contact.label}</option>
                                                                                            <option value="contacted">{scheduleStatusMeta.contacted.icon} {scheduleStatusMeta.contacted.label}</option>
                                                                                            <option value="scheduled">{scheduleStatusMeta.scheduled.icon} {scheduleStatusMeta.scheduled.label}</option>
                                                                                            <option value="completed">{scheduleStatusMeta.completed.icon} {scheduleStatusMeta.completed.label}</option>
                                                                                        </select>
                                                                                    ) : (
                                                                                        <span style={{ padding: '3px 8px', borderRadius: '12px', border: `1px solid ${meta.color}`, background: meta.bg, color: meta.color, fontWeight: 'bold', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                                                                                            {meta.icon} {meta.label}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                {/* Actions */}
                                                                                <td style={{ padding: '8px 4px', verticalAlign: 'middle', textAlign: 'center' }}>
                                                                                    {canEdit && (
                                                                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                                                            <button
                                                                                                onClick={() => setActiveQRModal(schedule)}
                                                                                                style={{ border: 'none', background: 'rgba(251,191,36,0.15)', cursor: 'pointer', padding: '4px 8px', fontSize: '0.78rem', color: '#fbbf24', borderRadius: '6px' }}
                                                                                                title={isAr ? 'عرض بطاق QR' : 'Show QR Card'}
                                                                                            >
                                                                                                📱
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => {
                                                                                                    setEditingSchedule(schedule);
                                                                                                    setEditScheduleFormData({ ...schedule });
                                                                                                }}
                                                                                                style={{ border: 'none', background: 'rgba(52,152,219,0.15)', cursor: 'pointer', padding: '4px 8px', fontSize: '0.78rem', color: '#3498db', borderRadius: '6px' }}
                                                                                                title={isAr ? 'تعديل' : 'Edit'}
                                                                                            >
                                                                                                ✏️
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleDeleteSchedule(schedule.id)}
                                                                                                style={{ border: 'none', background: 'rgba(231,76,60,0.12)', cursor: 'pointer', padding: '4px 8px', fontSize: '0.78rem', color: '#e74c3c', borderRadius: '6px' }}
                                                                                                title={isAr ? 'حذف' : 'Delete'}
                                                                                            >
                                                                                                🗑️
                                                                                            </button>
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        };

                                        // Extra header button for custom sections: delete section
                                        const renderCustomSectionHeader = (sec) => (
                                            (isAdminUser || loggedInUser?.role === 'coordinator') ? (
                                                <button
                                                    onClick={() => {
                                                        if (!window.confirm(isAr ? `حذف جدول "${sec.name}"؟` : `Delete section "${sec.name}"?`)) return;
                                                        const updated = customSections.filter(s => s.key !== sec.key);
                                                        setCustomSections(updated);
                                                        localStorage.setItem('customDeliverySections', JSON.stringify(updated));
                                                    }}
                                                    style={{ border: 'none', background: 'rgba(231,76,60,0.3)', color: '#fff', borderRadius: '6px', padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer' }}
                                                    title={isAr ? 'حذف الجدول' : 'Delete section'}
                                                >
                                                    🗑️
                                                </button>
                                            ) : null
                                        );

                                        return (
                                            <div>
                                                <div className="delivery-schedules-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '20px', marginTop: '20px' }}>
                                                    {renderQuadrant('admin', isAr ? 'الادمن / حسين' : 'Admin / Hussein', '👑', adminList, 'linear-gradient(135deg, #8e44ad, #9b59b6)', 'الادمن حسين')}
                                                    {renderQuadrant('ali', isAr ? 'علي الزعبي' : 'Ali Al-Zoubi', '♂️', aliList, 'linear-gradient(135deg, #2980b9, #3498db)', 'علي الزعبي')}
                                                    {renderQuadrant('sondos', isAr ? 'سندس' : 'Sondos', '♀️', sondosList, 'linear-gradient(135deg, #c0392b, #e74c3c)', 'سندس')}
                                                    {renderQuadrant('mohammad', isAr ? 'محمد الزغلول' : 'Mohammad Al-Zaghloul', '👤', mohammadList, 'linear-gradient(135deg, #27ae60, #2ecc71)', 'محمد الزغلول')}
                                                    {/* Custom sections */}
                                                    {customSections.map(sec => {
                                                        const hexToGradient = (hex) => {
                                                            const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
                                                            return `linear-gradient(135deg, rgba(${r},${g},${b},0.85), rgba(${r},${g},${b},1))`;
                                                        };
                                                        return (
                                                            <div key={sec.key} style={{ position: 'relative' }}>
                                                                {renderQuadrant(sec.key, sec.name, sec.icon, customLists[sec.key] || [], hexToGradient(sec.color), sec.name)}
                                                                {/* Delete button overlaid top-left */}
                                                                <div style={{ position: 'absolute', top: '10px', left: isAr ? 'auto' : '12px', right: isAr ? '12px' : 'auto', zIndex: 10 }}>
                                                                    {renderCustomSectionHeader(sec)}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {otherList.length > 0 && (
                                                    <div style={{ marginTop: '25px' }}>
                                                        {renderQuadrant('other', isAr ? 'مختبرعون آرون' : 'Other Donors', '📦', otherList, 'linear-gradient(135deg, #7f8c8d, #95a5a6)', '')}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* ─── Edit Schedule Modal ─── */}
                                    {editingSchedule && (
                                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) setEditingSchedule(null); }}>
                                            <div className="schedule-edit-modal-body">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>✏️ {isAr ? `تعديل الموعد — ${editingSchedule.materialName}` : `Edit Schedule — ${editingSchedule.materialName}`}</h3>
                                                    <button onClick={() => setEditingSchedule(null)} style={{ border: 'none', background: 'transparent', color: 'inherit', fontSize: '1.3rem', cursor: 'pointer', opacity: 0.7 }}>✕</button>
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                                    {[
                                                        { key: 'donorName', label: isAr ? 'اسم المختبرع' : 'Donor Name', type: 'text' },
                                                        { key: 'donorPhone', label: isAr ? 'هاتف المختبرع' : 'Donor Phone', type: 'tel', dir: 'ltr' },
                                                        { key: 'bookerName', label: isAr ? 'اسم الحاجز' : 'Booker Name', type: 'text' },
                                                        { key: 'bookerPhone', label: isAr ? 'هاتف الحاجز' : 'Booker Phone', type: 'tel', dir: 'ltr' },
                                                        { key: 'materialName', label: isAr ? 'اسم المادة' : 'Material Name', type: 'text' },
                                                        { key: 'pickupDate', label: isAr ? 'تاريخخ الإحضار' : 'Pickup Date', type: 'date' },
                                                        { key: 'pickupTime', label: isAr ? 'وقت الإحضار' : 'Pickup Time', type: 'time' },
                                                    ].map(({ key, label, type, dir }) => (
                                                        <div key={key}>
                                                            <label style={{ display: 'block', fontSize: '0.78rem', opacity: 0.7, marginBottom: '4px' }}>{label}</label>
                                                            <input
                                                                type={type}
                                                                dir={dir}
                                                                value={editScheduleFormData[key] || ''}
                                                                onChange={e => setEditScheduleFormData(p => ({ ...p, [key]: e.target.value }))}
                                                                className="schedule-form-input schedule-form-input-lg"
                                                            />
                                                        </div>
                                                    ))}

                                                    {/* Coordinator Select */}
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.78rem', opacity: 0.7, marginBottom: '4px' }}>{isAr ? 'المنسق' : 'Coordinator'}</label>
                                                        <select value={editScheduleFormData.assignedCoordinator || ''} onChange={e => setEditScheduleFormData(p => ({ ...p, assignedCoordinator: e.target.value }))} className="schedule-form-select schedule-form-select-lg">
                                                            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
                                                            <option value="ahmad">♂️ {systemSettings.ahmadNameAr || 'علي'}</option>
                                                            <option value="sara">♀️ {systemSettings.saraNameAr || 'سندس'}</option>
                                                        </select>
                                                    </div>

                                                    {/* Final Delivery By */}
                                                    <div>
                                                        <label style={{ display: 'block', fontSize: '0.78rem', opacity: 0.7, marginBottom: '4px' }}>{isAr ? 'التسليم النهائي بواسط' : 'Final Delivery By'}</label>
                                                        <select value={editScheduleFormData.finalDeliveryBy || ''} onChange={e => setEditScheduleFormData(p => ({ ...p, finalDeliveryBy: e.target.value }))} className="schedule-form-select schedule-form-select-lg">
                                                            <option value="">{isAr ? '— اختر —' : '— Select —'}</option>
                                                            <option value="admin">👑 {isAr ? 'الأدمن / حسين' : 'Admin / Hussein'}</option>
                                                            <option value="ahmad">♂️ {systemSettings.ahmadNameAr || 'علي'}</option>
                                                            <option value="sara">♀️ {systemSettings.saraNameAr || 'سندس'}</option>
                                                        </select>
                                                    </div>

                                                    {/* Notes */}
                                                    <div style={{ gridColumn: '1 / -1' }}>
                                                        <label style={{ display: 'block', fontSize: '0.78rem', opacity: 0.7, marginBottom: '4px' }}>{isAr ? 'ملاحظات' : 'Notes'}</label>
                                                        <input type="text" value={editScheduleFormData.notes || ''} onChange={e => setEditScheduleFormData(p => ({ ...p, notes: e.target.value }))} className="schedule-form-input schedule-form-input-lg" />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                                    <button className="action-btn delete-btn" onClick={() => setEditingSchedule(null)} style={{ padding: '9px 22px' }}>{isAr ? 'إلغاء' : 'Cancel'}</button>
                                                    <button className="action-btn approve-btn" onClick={handleUpdateScheduleDetails} disabled={editScheduleLoading} style={{ padding: '9px 22px', fontWeight: 'bold', minWidth: '130px' }}>
                                                        {editScheduleLoading ? '⏳...' : (isAr ? '💾 حفظ التعديلات' : '💾 Save Changes')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* SETTINGS TAB (Admin only) */}

                            {activeTab === 'settings' && isAdminUser && (
                                <div className="settings-panel">
                                    <h3 className="settings-title">⚙️ {isAr ? 'إعدادات النظام' : 'System Settings'}</h3>

                                    {/* ─── Campaign Control Center ─── */}
                                    <div className="campaign-control-card">
                                        <div className="campaign-control-header">
                                            <div className="campaign-control-title-group">
                                                <span className="campaign-control-icon">🚀</span>
                                                <div>
                                                    <h4>{isAr ? 'مركز التحكم بحال الحمل' : 'Campaign Control Center'}</h4>
                                                    <p className="campaign-control-desc">{isAr ? 'تحكم في مرحل الحمل الحالي — التغييرات تنعكس فوراً على الموقع' : 'Control the active campaign phase — changes reflect instantly'}</p>
                                                </div>
                                            </div>
                                            <div className="campaign-current-badge">
                                                <span className="current-badge-label">{isAr ? 'الحال الآن' : 'Now'}</span>
                                                <span className={`status-pill phase-${systemSettings.campaignPhase}`}>
                                                    {systemSettings.campaignPhase === 'suspended' && (isAr ? '🛑 موقوف' : '🛑 Suspended')}
                                                    {systemSettings.campaignPhase === 'collection' && (isAr ? '📥 جمع وتبرع' : '📥 Collection')}
                                                    {systemSettings.campaignPhase === 'exchange' && (isAr ? '🔄 تبادل وحجز' : '🔄 Exchange')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="campaign-phases-row">
                                            {/* Phase 1: Suspended */}
                                            <button
                                                className={`phase-card ${systemSettings.campaignPhase === 'suspended' ? 'phase-active phase-active-suspended' : ''}`}
                                                onClick={() => handleUpdateCampaignPhase('suspended')}
                                            >
                                                <span className="phase-card-icon">🛑</span>
                                                <span className="phase-card-title">{isAr ? 'إيقاف الحمل' : 'Suspend'}</span>
                                                <span className="phase-card-desc">{isAr ? 'النموذج والحجز معطّلان' : 'Form & booking disabled'}</span>
                                                {systemSettings.campaignPhase === 'suspended' && <span className="phase-active-dot"></span>}
                                            </button>

                                            {/* Arrow */}
                                            <span className="phase-arrow">›</span>

                                            {/* Phase 2: Collection */}
                                            <button
                                                className={`phase-card ${systemSettings.campaignPhase === 'collection' ? 'phase-active phase-active-collection' : ''}`}
                                                onClick={() => handleUpdateCampaignPhase('collection')}
                                            >
                                                <span className="phase-card-icon">📥</span>
                                                <span className="phase-card-title">{isAr ? 'جمع المواد' : 'Collection'}</span>
                                                <span className="phase-card-desc">{isAr ? 'النموذج مفعّل، الحجز لاحقاً' : 'Form active, booking later'}</span>
                                                {systemSettings.campaignPhase === 'collection' && <span className="phase-active-dot"></span>}
                                            </button>

                                            {/* Arrow */}
                                            <span className="phase-arrow">›</span>

                                            {/* Phase 3: Exchange */}
                                            <button
                                                className={`phase-card ${systemSettings.campaignPhase === 'exchange' ? 'phase-active phase-active-exchange' : ''}`}
                                                onClick={() => handleUpdateCampaignPhase('exchange')}
                                            >
                                                <span className="phase-card-icon">🔄</span>
                                                <span className="phase-card-title">{isAr ? 'تبادل المواد' : 'Exchange'}</span>
                                                <span className="phase-card-desc">{isAr ? 'الحجز مفتوح للطلاب' : 'Booking open for students'}</span>
                                                {systemSettings.campaignPhase === 'exchange' && <span className="phase-active-dot"></span>}
                                            </button>
                                        </div>
                                        <div className="live-status-row">
                                            <div className="settings-field live-control-field">
                                                <label className="permission-toggle-label">
                                                    <span className="permission-icon">🔴</span>
                                                    <div className="permission-text-block">
                                                        <strong>{isAr ? 'تشغيل الحمل الآن' : 'Campaign Live Now'}</strong>
                                                        <small>{isAr ? 'شغّل أو أوقف الحمل بالكامل دون تغيير الجدول.' : 'Turn the campaign on or off instantly without changing the schedule.'}</small>
                                                    </div>
                                                    <div className="toggle-switch-wrapper">
                                                        <input
                                                            type="checkbox"
                                                            id="toggleCampaignLive"
                                                            className="toggle-checkbox"
                                                            checked={systemSettings.isExchangeActive}
                                                            onChange={() => handleUpdateCampaignPhase(systemSettings.isExchangeActive ? 'suspended' : 'collection')}
                                                        />
                                                        <label htmlFor="toggleCampaignLive" className="toggle-label-switch"></label>
                                                    </div>
                                                </label>
                                            </div>
                                            <div className="settings-field live-control-field">
                                                <label className="permission-toggle-label">
                                                    <span className="permission-icon">🟢</span>
                                                    <div className="permission-text-block">
                                                        <strong>{isAr ? 'فتح الحجز الآن' : 'Booking Open Now'}</strong>
                                                        <small>{isAr ? 'فعِّل وضع الحجز مباشرً عندما تكون الحمل فعّال.' : 'Enable booking directly when the campaign is active.'}</small>
                                                    </div>
                                                    <div className="toggle-switch-wrapper">
                                                        <input
                                                            type="checkbox"
                                                            id="toggleBookingOpen"
                                                            className="toggle-checkbox"
                                                            checked={bookingOpen}
                                                            onChange={() => handleUpdateCampaignPhase(bookingOpen ? 'collection' : 'exchange')}
                                                        />
                                                        <label htmlFor="toggleBookingOpen" className="toggle-label-switch"></label>
                                                    </div>
                                                </label>
                                            </div>
                                            <div className="settings-field live-control-field">
                                                <label className="permission-toggle-label">
                                                    <span className="permission-icon">🔒</span>
                                                    <div className="permission-text-block">
                                                        <strong>{isAr ? 'تجميد نموذج التبرع' : 'Freeze Donation Form'}</strong>
                                                        <small>{isAr ? 'يوقف إرسال نموذج التبرع من حيث الحجوزات مؤقتاً مع بقاء الحمل نشط.' : 'Temporarily stops donation form submissions while keeping the campaign active.'}</small>
                                                    </div>
                                                    <div className="toggle-switch-wrapper">
                                                        <input
                                                            type="checkbox"
                                                            id="toggleDonationFormFrozen"
                                                            className="toggle-checkbox"
                                                            checked={systemSettings.donationFormFrozen || false}
                                                            onChange={async () => {
                                                                const frozen = !systemSettings.donationFormFrozen;
                                                                setSystemSettings(prev => ({ ...prev, donationFormFrozen: frozen }));
                                                                setEditSettings(prev => ({ ...prev, donationFormFrozen: frozen }));
                                                                try {
                                                                    const settingsRef = doc(db, 'system_configs', 'global_settings');
                                                                    await setDoc(settingsRef, { donationFormFrozen: frozen }, { merge: true });
                                                                    toast.success(isAr ? (frozen ? 'تم تجميد نموذج التبرع' : 'تم تفعيل نموذج التبرع') : (frozen ? 'Donation form frozen' : 'Donation form activated'));
                                                                    addAuditLog(
                                                                        frozen
                                                                            ? (isAr ? 'قام بتجميد نموذج التبرع' : 'Froze donation form')
                                                                            : (isAr ? 'قام بتفعيل نموذج التبرع' : 'Activated donation form'),
                                                                        frozen ? 'Froze donation form' : 'Activated donation form',
                                                                        { donationFormFrozen: frozen }
                                                                    );
                                                                } catch (error) {
                                                                    console.error('Error updating donation form freeze:', error);
                                                                    toast.error(isAr ? 'فشل تحديث الحال' : 'Failed to update status');
                                                                }
                                                            }}
                                                        />
                                                        <label htmlFor="toggleDonationFormFrozen" className="toggle-label-switch"></label>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {/* Campaign messages in-place editor */}
                                        <div className="campaign-messages-row">
                                            <div className="settings-field">
                                                <label>🔔 {isAr ? 'رسال الإيقاف (عربي)' : 'Suspension Message (AR)'}</label>
                                                <textarea className="settings-textarea" rows="2"
                                                    value={editSettings.exchangeSuspendedMessageAr || ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, exchangeSuspendedMessageAr: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>🔔 {isAr ? 'رسال الإيقاف (إنجليزي)' : 'Suspension Message (EN)'}</label>
                                                <textarea className="settings-textarea" rows="2"
                                                    value={editSettings.exchangeSuspendedMessageEn || ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, exchangeSuspendedMessageEn: e.target.value }))} />
                                            </div>
                                        </div>
                                        <div className="card-save-row">
                                            <button
                                                className="card-save-btn"
                                                onClick={() => handleSaveSectionSettings('messages', ['exchangeSuspendedMessageAr', 'exchangeSuspendedMessageEn'])}
                                                disabled={sectionSaving === 'messages'}
                                            >
                                                {sectionSaving === 'messages' ? '⏳' : '💾'} {isAr ? 'حفظ الرسائل' : 'Save Messages'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ─── Campaign Schedule Card ─── */}
                                    <div className="campaign-schedule-card">
                                        <div className="campaign-control-header">
                                            <div className="campaign-control-title-group">
                                                <span className="campaign-control-icon">📅</span>
                                                <div>
                                                    <h4>{isAr ? 'جدول توقيت الحمل' : 'Campaign Schedule'}</h4>
                                                    <p className="campaign-control-desc">
                                                        {isAr
                                                            ? 'حدد تواري بدء وانتهاء كل مرحل — يُحدَّث العداد التنازلي تلقائياً'
                                                            : 'Set start and end dates for each phase — countdown updates automatically'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="schedule-fields-row">
                                            <div className="settings-field schedule-field">
                                                <label>
                                                    <span className="schedule-phase-badge collection-badge">📥</span>
                                                    {isAr ? 'انتهاء فتر الجمع والتبرع' : 'Donation / Collection End'}
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    step="60"
                                                    className="settings-input schedule-input"
                                                    value={editSettings.donationEndTime
                                                        ? editSettings.donationEndTime.substring(0, 16)
                                                        : ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, donationEndTime: e.target.value }))}
                                                />
                                                {editSettings.donationEndTime && (
                                                    <span className="schedule-preview">
                                                        ⏱ {new Date(editSettings.donationEndTime).toLocaleString(isAr ? 'ar-JO' : 'en-JO', { dateStyle: 'full', timeStyle: 'short' })}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="schedule-divider-arrow">›</div>
                                            <div className="settings-field schedule-field">
                                                <label>
                                                    <span className="schedule-phase-badge exchange-badge">🔄</span>
                                                    {isAr ? 'بدء فتر الحجز والتبادل' : 'Booking / Exchange Start'}
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    step="60"
                                                    className="settings-input schedule-input"
                                                    value={editSettings.bookingStartTime
                                                        ? editSettings.bookingStartTime.substring(0, 16)
                                                        : ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, bookingStartTime: e.target.value }))}
                                                />
                                                {editSettings.bookingStartTime && (
                                                    <span className="schedule-preview">
                                                        ⏱ {new Date(editSettings.bookingStartTime).toLocaleString(isAr ? 'ar-JO' : 'en-JO', { dateStyle: 'full', timeStyle: 'short' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="card-save-row">
                                            <button
                                                className="card-save-btn"
                                                onClick={() => handleSaveSectionSettings('schedule', ['donationEndTime', 'bookingStartTime'])}
                                                disabled={sectionSaving === 'schedule'}
                                            >
                                                {sectionSaving === 'schedule' ? '⏳' : '💾'} {isAr ? 'حفظ جدول التوقيت' : 'Save Schedule'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="settings-grid">
                                        {/* Passwords Card */}
                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>🔐 {isAr ? 'كلمات المرور والوصول' : 'Passwords & Access'}</h4>
                                                <span className="settings-card-hint">{isAr ? 'تُحفظ بشكل مستقل' : 'Saved independently'}</span>
                                            </div>
                                            <div className="settings-field">
                                                <label>🔑 {isAr ? 'كود العبور السري الأول' : 'First Secret Gateway Code'}</label>
                                                <input type="text" className="settings-input" value={editSettings.secretGatewayCode || ''} onChange={e => setEditSettings(p => ({ ...p, secretGatewayCode: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>👑 {isAr ? 'كلم مرور الأدمن' : 'Admin Password'}</label>
                                                <input type="text" className="settings-input" value={editSettings.adminPassword || ''} onChange={e => setEditSettings(p => ({ ...p, adminPassword: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>♂️ {isAr ? `كلم مرور المنسق (${systemSettings.ahmadNameAr || 'أحمد'})` : `Coordinator (${systemSettings.ahmadNameEn || 'Ahmad'}) Password`}</label>
                                                <input type="text" className="settings-input" value={editSettings.ahmadPassword || ''} onChange={e => setEditSettings(p => ({ ...p, ahmadPassword: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>♀️ {isAr ? `كلم مرور المنسق (${systemSettings.saraNameAr || 'سار'})` : `Coordinator (${systemSettings.saraNameEn || 'Sara'}) Password`}</label>
                                                <input type="text" className="settings-input" value={editSettings.saraPassword || ''} onChange={e => setEditSettings(p => ({ ...p, saraPassword: e.target.value }))} />
                                            </div>
                                            <div className="card-save-row">
                                                <button className="card-save-btn"
                                                    onClick={() => handleSaveSectionSettings('passwords', ['secretGatewayCode', 'adminPassword', 'ahmadPassword', 'saraPassword'])}
                                                    disabled={sectionSaving === 'passwords'}
                                                >
                                                    {sectionSaving === 'passwords' ? '⏳' : '💾'} {isAr ? 'حفظ كلمات المرور' : 'Save Passwords'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* 2FA Card */}
                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>🛡️ {isAr ? 'التحقق بطوتين (2FA) — الأدمن والمنسقين' : '2FA Settings — Admin & Coordinators'}</h4>
                                                <span className="settings-card-hint">{isAr ? 'حماي الحسابات بشكل إجباري ومستمر' : 'Mandatory account protection is permanently enforced'}</span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '10px' }}>

                                                {/* Admin 2FA */}
                                                <div className="settings-field" style={{ borderBottom: '1px dashed var(--glass-border)', paddingBottom: '12px' }}>
                                                    <label style={{ fontWeight: 'bold' }}>👑 {isAr ? 'الأدمن' : 'Admin'}</label>
                                                    {systemSettings.adminResetRequest && (
                                                        <div style={{ margin: '8px 0', padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#d97706', fontWeight: '600' }}>
                                                                📨 {isAr ? 'طلب إعاد تعيين رمز التحقق معلق' : 'Reset request pending'}
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button
                                                                    className="submit-btn"
                                                                    onClick={async () => {
                                                                        await handleReset2fa('admin');
                                                                        await updateDoc(doc(db, 'system_configs', 'global_settings'), { adminResetRequest: false });
                                                                        setSystemSettings(p => ({ ...p, adminResetRequest: false }));
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '0.8rem', background: '#22c55e' }}
                                                                >
                                                                    ✅ {isAr ? 'موافق' : 'Approve'}
                                                                </button>
                                                                <button
                                                                    className="secondary-btn"
                                                                    onClick={async () => {
                                                                        await updateDoc(doc(db, 'system_configs', 'global_settings'), { adminResetRequest: false });
                                                                        setSystemSettings(p => ({ ...p, adminResetRequest: false }));
                                                                        toast(isAr ? 'تم رفض الطلب' : 'Request rejected');
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                                                                >
                                                                    ❌ {isAr ? 'رفض' : 'Reject'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                        <span style={{ fontSize: '0.9rem', color: '#22c55e', fontWeight: '500' }}>
                                                            {isAr ? '🛡️ مفعّل دائماً (إجباري)' : '🛡️ Enforced (Mandatory)'}
                                                        </span>
                                                        <button
                                                            className="secondary-btn"
                                                            onClick={() => handleReset2fa('admin')}
                                                            style={{ padding: '6px 14px', fontSize: '0.82rem', borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.05)' }}
                                                        >
                                                            🔄 {isAr ? 'تحديث رمز التحقق' : 'Update Verification Code'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Ahmad 2FA */}
                                                <div className="settings-field" style={{ borderBottom: '1px dashed var(--glass-border)', paddingBottom: '12px' }}>
                                                    <label style={{ fontWeight: 'bold' }}>♂️ {systemSettings.ahmadNameAr || 'أحمد'}</label>
                                                    {systemSettings.ahmadResetRequest && (
                                                        <div style={{ margin: '8px 0', padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#d97706', fontWeight: '600' }}>
                                                                📨 {isAr ? 'طلب إعاد تعيين رمز التحقق معلق' : 'Reset request pending'}
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button
                                                                    className="submit-btn"
                                                                    onClick={async () => {
                                                                        await handleReset2fa('ahmad');
                                                                        await updateDoc(doc(db, 'system_configs', 'global_settings'), { ahmadResetRequest: false });
                                                                        setSystemSettings(p => ({ ...p, ahmadResetRequest: false }));
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '0.8rem', background: '#22c55e' }}
                                                                >
                                                                    ✅ {isAr ? 'موافق' : 'Approve'}
                                                                </button>
                                                                <button
                                                                    className="secondary-btn"
                                                                    onClick={async () => {
                                                                        await updateDoc(doc(db, 'system_configs', 'global_settings'), { ahmadResetRequest: false });
                                                                        setSystemSettings(p => ({ ...p, ahmadResetRequest: false }));
                                                                        toast(isAr ? 'تم رفض الطلب' : 'Request rejected');
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                                                                >
                                                                    ❌ {isAr ? 'رفض' : 'Reject'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                        <span style={{ fontSize: '0.9rem', color: '#22c55e', fontWeight: '500' }}>
                                                            {isAr ? '🛡️ مفعّل دائماً (إجباري)' : '🛡️ Enforced (Mandatory)'}
                                                        </span>
                                                        <button
                                                            className="secondary-btn"
                                                            onClick={() => handleReset2fa('ahmad')}
                                                            style={{ padding: '6px 14px', fontSize: '0.82rem', borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.05)' }}
                                                        >
                                                            🔄 {isAr ? 'تحديث رمز التحقق' : 'Update Verification Code'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Sara 2FA */}
                                                <div className="settings-field">
                                                    <label style={{ fontWeight: 'bold' }}>♀️ {systemSettings.saraNameAr || 'سار'}</label>
                                                    {systemSettings.saraResetRequest && (
                                                        <div style={{ margin: '8px 0', padding: '10px 14px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#d97706', fontWeight: '600' }}>
                                                                📨 {isAr ? 'طلب إعاد تعيين رمز التحقق معلق' : 'Reset request pending'}
                                                            </span>
                                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                                <button
                                                                    className="submit-btn"
                                                                    onClick={async () => {
                                                                        await handleReset2fa('sara');
                                                                        await updateDoc(doc(db, 'system_configs', 'global_settings'), { saraResetRequest: false });
                                                                        setSystemSettings(p => ({ ...p, saraResetRequest: false }));
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '0.8rem', background: '#22c55e' }}
                                                                >
                                                                    ✅ {isAr ? 'موافق' : 'Approve'}
                                                                </button>
                                                                <button
                                                                    className="secondary-btn"
                                                                    onClick={async () => {
                                                                        await updateDoc(doc(db, 'system_configs', 'global_settings'), { saraResetRequest: false });
                                                                        setSystemSettings(p => ({ ...p, saraResetRequest: false }));
                                                                        toast(isAr ? 'تم رفض الطلب' : 'Request rejected');
                                                                    }}
                                                                    style={{ padding: '5px 12px', fontSize: '0.8rem', borderColor: '#ef4444', color: '#ef4444' }}
                                                                >
                                                                    ❌ {isAr ? 'رفض' : 'Reject'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                        <span style={{ fontSize: '0.9rem', color: '#22c55e', fontWeight: '500' }}>
                                                            {isAr ? '🛡️ مفعّل دائماً (إجباري)' : '🛡️ Enforced (Mandatory)'}
                                                        </span>
                                                        <button
                                                            className="secondary-btn"
                                                            onClick={() => handleReset2fa('sara')}
                                                            style={{ padding: '6px 14px', fontSize: '0.82rem', borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239,68,68,0.05)' }}
                                                        >
                                                            🔄 {isAr ? 'تحديث رمز التحقق' : 'Update Verification Code'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>


                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>🛡️ {isAr ? 'صلاحيات المنسقين' : 'Coordinator Permissions'}</h4>
                                                <span className="settings-card-hint">{isAr ? 'حدد صلاحيات التعديل، الحذف، التسليم والإلغاء لكل منسق' : 'Set edit, delete, delivery and cancel permissions for each coordinator'}</span>
                                            </div>

                                            <div className="settings-field">
                                                <label>{isAr ? 'اختر المنسق' : 'Select Coordinator'}</label>
                                                <select
                                                    className="settings-input"
                                                    value={permissionsSelection}
                                                    onChange={e => setPermissionsSelection(e.target.value)}
                                                >
                                                    <option value="ahmad">{isAr ? `${systemSettings.ahmadNameAr || 'أحمد'} (ذكر)` : `${systemSettings.ahmadNameEn || 'Ahmad'} (Male)`}</option>
                                                    <option value="sara">{isAr ? `${systemSettings.saraNameAr || 'سار'} (أنثى)` : `${systemSettings.saraNameEn || 'Sara'} (Female)`}</option>
                                                </select>
                                            </div>

                                            <div className="settings-field coordinator-permission-field">
                                                <label className="permission-toggle-label">
                                                    <span className="permission-icon">🔓</span>
                                                    <div className="permission-text-block">
                                                        <strong>{isAr ? 'السماح للمنسقين بالتعديل والحذف' : 'Allow Coordinators to Edit & Delete'}</strong>
                                                        <small>{isAr ? 'عند التفعيل، يسمح للمنسقين بالتحكم في التعديلات والحذف دون موافق إضافي.' : 'When enabled, coordinators can edit and delete without extra admin approval.'}</small>
                                                    </div>
                                                    <div className="toggle-switch-wrapper">
                                                        <input
                                                            type="checkbox"
                                                            id="allowCoordEditDelete"
                                                            className="toggle-checkbox"
                                                            checked={editSettings.allowCoordinatorEditDelete || false}
                                                            onChange={e => setEditSettings(p => ({ ...p, allowCoordinatorEditDelete: e.target.checked }))}
                                                        />
                                                        <label htmlFor="allowCoordEditDelete" className="toggle-label-switch"></label>
                                                    </div>
                                                </label>
                                            </div>

                                            <div className="settings-field permission-checkboxes-grid">
                                                {['editDonation', 'deleteDonation', 'completeBooking', 'cancelBooking'].map(permissionKey => {
                                                    const labels = {
                                                        editDonation: { ar: 'تعديل التبرعات', en: 'Edit Donations' },
                                                        deleteDonation: { ar: 'حذف التبرعات', en: 'Delete Donations' },
                                                        completeBooking: { ar: 'تأكيد التسليم', en: 'Confirm Delivery' },
                                                        cancelBooking: { ar: 'إلغاء الحجز', en: 'Cancel Booking' }
                                                    };
                                                    const currentPermissions = editSettings.coordinatorPermissions || systemSettings.coordinatorPermissions || {};
                                                    const checked = currentPermissions[permissionsSelection]?.[permissionKey] || false;
                                                    return (
                                                        <label key={permissionKey} className="permission-checkbox-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={e => setEditSettings(prev => ({
                                                                    ...prev,
                                                                    coordinatorPermissions: {
                                                                        ...prev.coordinatorPermissions,
                                                                        [permissionsSelection]: {
                                                                            ...((prev.coordinatorPermissions || systemSettings.coordinatorPermissions || {})[permissionsSelection] || {}),
                                                                            [permissionKey]: e.target.checked
                                                                        }
                                                                    }
                                                                }))}
                                                            />
                                                            <span>{isAr ? labels[permissionKey].ar : labels[permissionKey].en}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>

                                            <div className="card-save-row">
                                                <button className="card-save-btn"
                                                    onClick={() => handleSaveSectionSettings('coordPermissions', ['coordinatorPermissions'])}
                                                    disabled={sectionSaving === 'coordPermissions'}
                                                >
                                                    {sectionSaving === 'coordPermissions' ? '⏳' : '💾'} {isAr ? 'حفظ صلاحيات المنسقين' : 'Save Coordinator Permissions'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Coordinator Names Card */}
                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>👥 {isAr ? 'أسماء المنسقين' : 'Coordinator Names'}</h4>
                                                <span className="settings-card-hint">{isAr ? 'تُحدَّث تلقائياً بعد الحفظ' : 'Auto-updates on save'}</span>
                                            </div>
                                            <div className="settings-field">
                                                <label>♂️ {isAr ? 'اسم المنسق بالعربي' : 'Male Coord. Arabic Name'}</label>
                                                <input type="text" className="settings-input" value={editSettings.ahmadNameAr || ''} onChange={e => setEditSettings(p => ({ ...p, ahmadNameAr: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>♂️ {isAr ? 'اسم المنسق بالإنجليزي' : 'Male Coord. English Name'}</label>
                                                <input type="text" className="settings-input" value={editSettings.ahmadNameEn || ''} onChange={e => setEditSettings(p => ({ ...p, ahmadNameEn: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>♀️ {isAr ? 'اسم المنسق بالعربي' : 'Female Coord. Arabic Name'}</label>
                                                <input type="text" className="settings-input" value={editSettings.saraNameAr || ''} onChange={e => setEditSettings(p => ({ ...p, saraNameAr: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>♀️ {isAr ? 'اسم المنسق بالإنجليزي' : 'Female Coord. English Name'}</label>
                                                <input type="text" className="settings-input" value={editSettings.saraNameEn || ''} onChange={e => setEditSettings(p => ({ ...p, saraNameEn: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>📧 {isAr ? `بريد المنسق (${systemSettings.ahmadNameAr || 'أحمد'}) — لتلقي الإشعارات` : `Coordinator (${systemSettings.ahmadNameEn || 'Ahmad'}) Email — For Notifications`}</label>
                                                <input type="email" className="settings-input" dir="ltr" placeholder="coordinator@example.com" value={editSettings.ahmadEmail || ''} onChange={e => setEditSettings(p => ({ ...p, ahmadEmail: e.target.value }))} />
                                            </div>
                                            <div className="settings-field">
                                                <label>📧 {isAr ? `بريد المنسق (${systemSettings.saraNameAr || 'سار'}) — لتلقي الإشعارات` : `Coordinator (${systemSettings.saraNameEn || 'Sara'}) Email — For Notifications`}</label>
                                                <input type="email" className="settings-input" dir="ltr" placeholder="coordinator@example.com" value={editSettings.saraEmail || ''} onChange={e => setEditSettings(p => ({ ...p, saraEmail: e.target.value }))} />
                                            </div>
                                            <div className="card-save-row">
                                                <button className="card-save-btn"
                                                    onClick={() => handleSaveSectionSettings('names', ['ahmadNameAr', 'ahmadNameEn', 'saraNameAr', 'saraNameEn', 'ahmadEmail', 'saraEmail'])}
                                                    disabled={sectionSaving === 'names'}
                                                >
                                                    {sectionSaving === 'names' ? '⏳' : '💾'} {isAr ? 'حفظ الأسماء والبريد الإلكتروني' : 'Save Names & Emails'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Tasks Card — Male */}
                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>♂️ {isAr ? `مهام ${systemSettings.ahmadNameAr || 'أحمد'} (منسق الذكور)` : `${systemSettings.ahmadNameEn || 'Ahmad'}'s Tasks`}</h4>
                                                <span className="settings-card-hint">{isAr ? 'يراها المنسق فقط' : 'Seen by him only'}</span>
                                            </div>
                                            <div className="settings-field">
                                                <label>👥 {isAr ? 'مهام مشترك (يراها كلا المنسقين)' : 'Shared Tasks (both see)'}</label>
                                                <textarea className="settings-textarea" rows="3"
                                                    placeholder={isAr ? 'مهم لكل سطر...' : 'One task per line...'}
                                                    value={editSettings.sharedCoordinatorTasks || ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, sharedCoordinatorTasks: e.target.value }))}
                                                />
                                            </div>
                                            <div className="settings-field">
                                                <label>♂️ {isAr ? 'مهام اص بمنسق الذكور فقط' : 'Male Coordinator Exclusive Tasks'}</label>
                                                <textarea className="settings-textarea" rows="4"
                                                    placeholder={isAr ? 'مهم لكل سطر...' : 'One task per line...'}
                                                    value={editSettings.coordinatorMaleTasks || ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, coordinatorMaleTasks: e.target.value }))}
                                                />
                                            </div>
                                            <div className="card-save-row">
                                                <button className="card-save-btn"
                                                    onClick={() => handleSaveSectionSettings('maleTasks', ['sharedCoordinatorTasks', 'coordinatorMaleTasks'])}
                                                    disabled={sectionSaving === 'maleTasks'}
                                                >
                                                    {sectionSaving === 'maleTasks' ? '⏳' : '💾'} {isAr ? 'حفظ مهام الذكور' : 'Save Male Tasks'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Tasks Card — Female */}
                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>♀️ {isAr ? `مهام ${systemSettings.saraNameAr || 'سار'} (منسق الإناث)` : `${systemSettings.saraNameEn || 'Sara'}'s Tasks`}</h4>
                                                <span className="settings-card-hint">{isAr ? 'تراها المنسق فقط' : 'Seen by her only'}</span>
                                            </div>
                                            <div className="settings-field">
                                                <label>♀️ {isAr ? 'مهام اص بمنسق الإناث فقط' : 'Female Coordinator Exclusive Tasks'}</label>
                                                <textarea className="settings-textarea" rows="7"
                                                    placeholder={isAr ? 'مهم لكل سطر...' : 'One task per line...'}
                                                    value={editSettings.coordinatorFemaleTasks || ''}
                                                    onChange={e => setEditSettings(p => ({ ...p, coordinatorFemaleTasks: e.target.value }))}
                                                />
                                            </div>
                                            <div className="card-save-row">
                                                <button className="card-save-btn"
                                                    onClick={() => handleSaveSectionSettings('femaleTasks', ['coordinatorFemaleTasks'])}
                                                    disabled={sectionSaving === 'femaleTasks'}
                                                >
                                                    {sectionSaving === 'femaleTasks' ? '⏳' : '💾'} {isAr ? 'حفظ مهام الإناث' : 'Save Female Tasks'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Auto-Delete Timer Card */}
                                        <div className="settings-card">
                                            <div className="settings-card-header">
                                                <h4>⏱️ {isAr ? 'مد الحذف التلقائي للإنجازات' : 'Task Completion Auto-Delete Timer'}</h4>
                                                <span className="settings-card-hint">{isAr ? 'بعد انقضاء المد تُحذف الإنجازات تلقائياً' : 'Completions auto-clear after this duration'}</span>
                                            </div>
                                            <div className="settings-field">
                                                <label>⏰ {isAr ? 'المد بالساعات' : 'Duration (hours)'}</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="8760"
                                                    className="settings-input"
                                                    dir="ltr"
                                                    placeholder="24"
                                                    value={editSettings.taskAutoDeleteHours ?? 24}
                                                    onChange={e => setEditSettings(p => ({ ...p, taskAutoDeleteHours: Number(e.target.value) || 24 }))}
                                                />
                                                <small style={{ color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                                                    {isAr
                                                        ? `الإعداد الحالي: ${systemSettings.taskAutoDeleteHours || 24} ساع — يعني كل ${systemSettings.taskAutoDeleteHours || 24} ساع تُمسح إنجازات المنسقين تلقائياً`
                                                        : `Current: ${systemSettings.taskAutoDeleteHours || 24}h — coordinator completions auto-clear every ${systemSettings.taskAutoDeleteHours || 24} hours`}
                                                </small>
                                            </div>
                                            <div className="card-save-row">
                                                <button className="card-save-btn"
                                                    onClick={() => handleSaveSectionSettings('taskAutoDelete', ['taskAutoDeleteHours'])}
                                                    disabled={sectionSaving === 'taskAutoDelete'}
                                                >
                                                    {sectionSaving === 'taskAutoDelete' ? '⏳' : '💾'} {isAr ? 'حفظ المد' : 'Save Timer'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'approvalRequests' && isAdminUser && (
                                <div className="approval-requests-panel">
                                    <div className="approval-requests-header">
                                        <div>
                                            <h3>🔔 {isAr ? 'الطلبات المنتظر' : 'Pending Requests'}</h3>
                                            <p>{isAr ? 'راجع إجراءات المنسقين ووافق أو ارفض قبل تنفيذ أي تغيير.' : 'Review coordinator requests and approve or reject before applying changes.'}</p>
                                        </div>
                                        <div className="approval-requests-summary">
                                            <span>{isAr ? 'إجمالي الطلبات المعلق' : 'Pending requests'}: <strong>{pendingApprovalRequestCount}</strong></span>
                                        </div>
                                    </div>

                                    {pendingApprovalRequestCount === 0 ? (
                                        <div className="empty-state">
                                            ✅ {isAr ? 'لا توجد طلبات منتظر الآن.' : 'No pending approval requests at the moment.'}
                                        </div>
                                    ) : (
                                        <div className="approval-requests-grid">
                                            {pendingApprovalRequests.map((item, idx) => {
                                                const requestDate = item.requestedAt?.seconds ? new Date(item.requestedAt.seconds * 1000) : new Date(item.requestedAt);
                                                const materialName = item.donation?.materials?.[item.materialIndex]?.name || '';
                                                return (
                                                    <div key={`${item.donationId}-${item.requestId}-${idx}`} className="approval-request-card">
                                                        <div className="approval-request-top">
                                                            <span className="request-type-label">{getApprovalRequestTypeLabel(item.type)}</span>
                                                            <span className="request-status pending">{isAr ? 'معلق' : 'Pending'}</span>
                                                        </div>
                                                        <div className="approval-request-content">
                                                            <p><strong>{isAr ? 'منسق الطلب' : 'Requester'}:</strong> {item.requestedByName}</p>
                                                            <p><strong>{isAr ? 'معرّف التبرع' : 'Donation ID'}:</strong> {item.donationId}</p>
                                                            <p><strong>{isAr ? 'اسم المختبرع' : 'Donor'}:</strong> {item.donation?.studentName || '—'}</p>
                                                            {item.materialIndex !== null && item.materialIndex !== undefined && (
                                                                <p><strong>{isAr ? 'رقم المادة' : 'Material #'}:</strong> {item.materialIndex + 1} {materialName ? `- ${materialName}` : ''}</p>
                                                            )}
                                                            <p><strong>{isAr ? 'الحال الحالي' : 'Current Status'}:</strong> {item.donation?.status || '—'}</p>
                                                            <p><strong>{isAr ? 'تاريخخ الطلب' : 'Requested at'}:</strong> {requestDate.toLocaleString(isAr ? 'ar-JO' : 'en-US')}</p>
                                                        </div>
                                                        <div className="approval-request-actions">
                                                            <button className="action-btn approve-btn" onClick={() => openAdminResponseModal(item.donationId, item)}>
                                                                ✅ {isAr ? 'الموافق/الرفض' : 'Decide'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'archive' && canViewArchive && (
                                <div className="archive-panel">
                                    <div className="archive-panel-header">
                                        <div>
                                            <h3>🗄️ {isAr ? 'أرشيف حملات تبادل المواد' : 'Material Exchange Campaign Archive'}</h3>
                                            <p>{isAr ? 'اعرض الأرشيف السابق وحمّل التفاصيل للتصدير' : 'View the previous archive and export details as needed'}</p>
                                            {!isAdminUser && (
                                                <p className="archive-view-note">{isAr ? 'عرض فقط؛ لا يمكنك أرشف أو تعديل الحمل.' : 'View only; you cannot archive or modify campaigns.'}</p>
                                            )}
                                        </div>
                                        {isAdminUser && (
                                            <button className="archive-new-btn" onClick={() => setShowArchiveModal(true)}>
                                                📦 {isAr ? 'أرشف الحمل الحالي' : 'Archive Current Campaign'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Current campaign summary */}
                                    <div className="archive-current-summary">
                                        <div className="archive-summary-stat">
                                            <span className="archive-summary-num">{allDonations.length}</span>
                                            <span className="archive-summary-lbl">{isAr ? 'إجمالي التبرعات الحالي' : 'Current Donations'}</span>
                                        </div>
                                        <div className="archive-summary-stat">
                                            <span className="archive-summary-num">{allDonations.filter(d => d.status === 'pending').length}</span>
                                            <span className="archive-summary-lbl">{isAr ? 'بانتظار المراجع' : 'Pending'}</span>
                                        </div>
                                        <div className="archive-summary-stat">
                                            <span className="archive-summary-num">{allDonations.filter(d => d.status === 'approved').length}</span>
                                            <span className="archive-summary-lbl">{isAr ? 'معتمد' : 'Approved'}</span>
                                        </div>
                                        <div className="archive-summary-stat">
                                            <span className="archive-summary-num">{allDonations.filter(d => d.status === 'reserved').length}</span>
                                            <span className="archive-summary-lbl">{isAr ? 'محجوز' : 'Reserved'}</span>
                                        </div>
                                    </div>

                                    {/* Archive list */}
                                    <h4 className="archive-list-title">📚 {isAr ? 'الأرشيف السابق' : 'Previous Archives'}</h4>
                                    {archivesLoading ? (
                                        <div className="dashboard-loading"><div className="loading-spinner"></div></div>
                                    ) : archives.length === 0 ? (
                                        <div className="empty-state">
                                            🗄️ {isAr ? 'لا يوجد أرشيف بعد. أرشف الحمل الحالي عند نهاي الفصل الدراسي.' : 'No archives yet. Archive the current campaign at the end of the semester.'}
                                        </div>
                                    ) : (
                                        <div className="archives-list">
                                            {archives.map(arch => {
                                                const archDate = arch.archivedAt?.toDate ? arch.archivedAt.toDate() : arch.archivedAt ? new Date(arch.archivedAt) : null;
                                                const archDonations = arch.donationsData || [];
                                                const totalDonations = arch.totalDonations || archDonations.length;
                                                const approvedCount = archDonations.filter(d => d.status === 'approved').length;
                                                const reservedCount = archDonations.filter(d => d.status === 'reserved').length;
                                                const pendingCount = archDonations.filter(d => d.status === 'pending').length;
                                                const isExpanded = selectedArchive?.id === arch.id;
                                                return (
                                                    <div key={arch.id} className={`archive-item-card ${isExpanded ? 'archive-item-expanded' : ''}`}>
                                                        {/* Top row: icon + title + date + actions */}
                                                        <div className="archive-item-top">
                                                            <div className="archive-item-left">
                                                                <div className="archive-item-icon">🗃️</div>
                                                                <div className="archive-item-info">
                                                                    <h4>{arch.label}</h4>
                                                                    <p className="archive-item-date">
                                                                        📅 {archDate ? archDate.toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="archive-item-actions">
                                                                <button className="export-btn export-csv-btn"
                                                                    onClick={() => exportToCSV(archDonations, arch.label)}>
                                                                    📊 Excel
                                                                </button>
                                                                <button className="export-btn export-pdf-btn"
                                                                    onClick={() => exportToPDF(archDonations, arch.label)}>
                                                                    🖨️ PDF
                                                                </button>
                                                                <button className="archive-expand-btn"
                                                                    onClick={() => setSelectedArchive(isExpanded ? null : arch)}>
                                                                    {isExpanded ? (isAr ? '▲ إفاء' : '▲ Hide') : (isAr ? '▼ عرض التفاصيل' : '▼ Show Details')}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Stats bar — always visible */}
                                                        <div className="archive-item-stats">
                                                            <div className="archive-stat-chip archive-stat-total">
                                                                <span className="astat-num">{totalDonations}</span>
                                                                <span className="astat-lbl">{isAr ? 'إجمالي التبرعات' : 'Total Donations'}</span>
                                                            </div>
                                                            <div className="archive-stat-chip archive-stat-approved">
                                                                <span className="astat-num">{approvedCount}</span>
                                                                <span className="astat-lbl">{isAr ? 'معتمد' : 'Approved'}</span>
                                                            </div>
                                                            <div className="archive-stat-chip archive-stat-reserved">
                                                                <span className="astat-num">{reservedCount}</span>
                                                                <span className="astat-lbl">{isAr ? 'محجوز' : 'Reserved'}</span>
                                                            </div>
                                                            {pendingCount > 0 && (
                                                                <div className="archive-stat-chip archive-stat-pending">
                                                                    <span className="astat-num">{pendingCount}</span>
                                                                    <span className="astat-lbl">{isAr ? 'معلق' : 'Pending'}</span>
                                                                </div>
                                                            )}
                                                            {(arch.totalDeliverySchedules !== undefined || (arch.deliverySchedulesData || []).length > 0) && (
                                                                <div className="archive-stat-chip" style={{ background: 'rgba(116, 185, 255, 0.15)', borderColor: 'rgba(116, 185, 255, 0.3)' }}>
                                                                    <span className="astat-num" style={{ color: '#74b9ff' }}>{arch.totalDeliverySchedules || (arch.deliverySchedulesData || []).length}</span>
                                                                    <span className="astat-lbl" style={{ color: '#74b9ff' }}>{isAr ? 'جدول تسليم الحجوزات' : 'Delivery Schedules'}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Expanded donors table */}
                                                        {isExpanded && archDonations.length > 0 && (
                                                            <div className="archive-detail-table-wrapper">
                                                                <table className="donations-table archive-table">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>{isAr ? '#' : '#'}</th>
                                                                            <th>{isAr ? 'الاسم' : 'Name'}</th>
                                                                            <th>{isAr ? 'الهاتف' : 'Phone'}</th>
                                                                            <th>{isAr ? 'الجنس' : 'Gender'}</th>
                                                                            <th>{isAr ? 'المواد + الحاجزون' : 'Materials + Bookers'}</th>
                                                                            <th>{isAr ? 'الحال' : 'Status'}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {archDonations.map((d, i) => (
                                                                            <tr key={i}>
                                                                                <td style={{ color: 'var(--adm-muted)', fontWeight: 600 }}>{i + 1}</td>
                                                                                <td><strong>{d.studentName}</strong></td>
                                                                                <td dir="ltr">{d.phoneNumber}</td>
                                                                                <td>
                                                                                    <span className={`gender-badge gender-${d.studentGender}`}>
                                                                                        {d.studentGender === 'male' ? (isAr ? '♂️ ذكر' : '♂️ Male') : (isAr ? '♀️ أنثى' : '♀️ Female')}
                                                                                    </span>
                                                                                </td>
                                                                                <td>
                                                                                    {(d.materials || []).map((m, mi) => {
                                                                                        const matName = typeof m === 'object' ? (m.name || '—') : String(m);
                                                                                        const matStatus = typeof m === 'object' ? m.status : 'pending';
                                                                                        const taker = typeof m === 'object' ? (m.takerInfo || null) : null;
                                                                                        return (
                                                                                            <div key={mi} style={{ marginBottom: '0.4rem', padding: '0.4rem 0.6rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>📦 {matName}</span>
                                                                                                    <span className={`status-badge status-${matStatus}`} style={{ fontSize: '0.72rem', padding: '0.1rem 0.4rem' }}>
                                                                                                        {matStatus === 'completed' ? (isAr ? '✅ تم التسليم' : '✅ Delivered')
                                                                                                            : matStatus === 'reserved' ? (isAr ? '🔒 محجوز' : '🔒 Reserved')
                                                                                                                : matStatus === 'approved' ? (isAr ? '✔ معتمد' : '✔ Approved')
                                                                                                                    : (isAr ? '⏳ معلق' : '⏳ Pending')}
                                                                                                    </span>
                                                                                                </div>
                                                                                                {taker && (taker.name || taker.phone) ? (
                                                                                                    <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px dashed rgba(255,255,255,0.15)', display: 'flex', gap: '0.8rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                                                                                                        <span>👤 {isAr ? 'الحاجز:' : 'Booker:'} <strong style={{ color: '#fff' }}>{taker.name || '—'}</strong></span>
                                                                                                        <span dir="ltr">📞 {taker.phone || '—'}</span>
                                                                                                        {taker.gender && (
                                                                                                            <span className={`gender-badge gender-${taker.gender}`} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                                                                                                                {taker.gender === 'male' ? (isAr ? '♂️ ذكر' : '♂️ Male') : (isAr ? '♀️ أنثى' : '♀️ Female')}
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div style={{ marginTop: '0.2rem', fontSize: '0.74rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                                                                                                        {isAr ? 'غير محجوز' : 'Not booked'}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </td>
                                                                                <td>
                                                                                    <span className={`status-badge status-${d.status}`}>
                                                                                        {d.status === 'approved' ? (isAr ? '✅ معتمد' : '✅ Approved')
                                                                                            : d.status === 'reserved' ? (isAr ? '🔒 محجوز' : '🔒 Reserved')
                                                                                                : d.status === 'pending' ? (isAr ? '⏳ بانتظار' : '⏳ Pending')
                                                                                                    : d.status}
                                                                                    </span>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}

                                                        {/* Expanded delivery schedules table */}
                                                        {isExpanded && (arch.deliverySchedulesData || []).length > 0 && (
                                                            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
                                                                <h5 style={{ margin: '0 0 0.8rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#74b9ff', fontSize: '0.95rem' }}>
                                                                    📅 {isAr ? 'جدول تسليم الحجوزات المؤرشف' : 'Archived Delivery Schedules'} ({arch.deliverySchedulesData.length})
                                                                </h5>
                                                                <div className="archive-detail-table-wrapper">
                                                                    <table className="donations-table archive-table">
                                                                        <thead>
                                                                            <tr>
                                                                                <th>#</th>
                                                                                <th>{isAr ? 'المادة' : 'Material'}</th>
                                                                                <th>{isAr ? 'المختبرع' : 'Donor'}</th>
                                                                                <th>{isAr ? 'الحاجز' : 'Booker'}</th>
                                                                                <th>{isAr ? 'موعد التسليم' : 'Pickup Date & Time'}</th>
                                                                                <th>{isAr ? 'المنسق' : 'Coordinator'}</th>
                                                                                <th>{isAr ? 'الحال' : 'Status'}</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {arch.deliverySchedulesData.map((s, idx) => (
                                                                                <tr key={idx}>
                                                                                    <td style={{ color: 'var(--adm-muted)', fontWeight: 600 }}>{idx + 1}</td>
                                                                                    <td><strong>{s.materialName || '—'}</strong></td>
                                                                                    <td>
                                                                                        <div>{s.donorName || '—'}</div>
                                                                                        <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }} dir="ltr">{s.donorPhone || ''}</div>
                                                                                    </td>
                                                                                    <td>
                                                                                        <div>{s.takerName || '—'}</div>
                                                                                        <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }} dir="ltr">{s.takerPhone || ''}</div>
                                                                                    </td>
                                                                                    <td>
                                                                                        <div>📅 {s.pickupDate || '—'}</div>
                                                                                        <div style={{ fontSize: '0.78rem', color: 'var(--adm-muted)' }}>⏰ {s.pickupTime || '—'}</div>
                                                                                    </td>
                                                                                    <td>{s.coordinatorName || s.coordinatorId || '—'}</td>
                                                                                    <td>
                                                                                        <span className={`status-badge status-${s.status || 'pending'}`}>
                                                                                            {s.status === 'completed' ? (isAr ? '✅ تم التسليم' : '✅ Delivered')
                                                                                                : s.status === 'delivered_later' ? (isAr ? '⏳ يتساقط لاحقاً' : '⏳ Delivered Later')
                                                                                                    : (isAr ? '⏳ بانتظار التسليم' : '⏳ Pending')}
                                                                                        </span>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {isExpanded && archDonations.length === 0 && (
                                                            <div className="empty-state" style={{ padding: '1.5rem', margin: '0.5rem 0 0' }}>
                                                                {isAr ? 'لا توجد بيانات مفصّل لهذا الأرشيف.' : 'No detailed records for this archive.'}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'deletedItems' && canViewArchive && (
                                <div className="archive-panel">
                                    <div className="archive-panel-header">
                                        <div>
                                            <h3>🗑️ {isAr ? 'المحذوفات والأرشيف' : 'Deleted Items & Archive'}</h3>
                                            <p>{isAr ? 'كل عنصر حُذف يبقى محفوظاً ويمكن للإدارة العامة استعادته.' : 'Deleted records are retained and can be restored by the general administration.'}</p>
                                        </div>
                                    </div>
                                    {deletedItemsLoading ? (
                                        <div className="dashboard-loading"><div className="loading-spinner"></div></div>
                                    ) : deletedItems.length === 0 ? (
                                        <div className="empty-state">🗑️ {isAr ? 'لا توجد عناصر محذوفة.' : 'No deleted items.'}</div>
                                    ) : (
                                        <div className="archives-list">
                                            {deletedItems.map(item => {
                                                const deletedDate = item.deletedAt?.toDate ? item.deletedAt.toDate() : item.deletedAt ? new Date(item.deletedAt) : null;
                                                const data = item.itemData || {};
                                                return (
                                                    <div key={item.id} className="archive-item-card">
                                                        <div className="archive-item-top">
                                                            <div className="archive-item-info">
                                                                <h4>{data.studentName || data.materialName || (isAr ? 'عنصر محذوف' : 'Deleted item')}</h4>
                                                                <p className="archive-item-date">
                                                                    {item.originalCollection} · {deletedDate ? deletedDate.toLocaleString(isAr ? 'ar-JO' : 'en-US') : '—'}
                                                                </p>
                                                                <p>{isAr ? 'بواسطة:' : 'By:'} {item.deletedByName || item.deletedBy || '—'}</p>
                                                            </div>
                                                            {isAdminUser && (
                                                                <button className="archive-expand-btn" onClick={() => handleRestoreDeletedItem(item)}>
                                                                    ♻️ {isAr ? 'استعادة' : 'Restore'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'analytics' && isAdminUser && (
                                <div className="admin-analytics-placeholder">
                                    <div className="empty-state">
                                        {isAr ? 'إحصائيات النظام' : 'System Analytics'}
                                    </div>
                                </div>
                            )}
                            {activeTab === 'coordinators' && isAdminUser && (() => {
                                const isUserOnline = (userKey) => {
                                    const status = staffStatuses[userKey];
                                    if (!status) return false;
                                    if (status.online === false || status.statusState === 'offline') return false;
                                    const lastSeen = status.lastSeen?.seconds ? status.lastSeen.seconds * 1000 : status.lastSeen;
                                    if (!lastSeen) return false;
                                    return (Date.now() - lastSeen) < 180000; // 3 minutes threshold
                                };

                                const formatStatusTime = (timestamp) => {
                                    if (!timestamp) return isAr ? 'غير متوفر' : 'N/A';
                                    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
                                    return date.toLocaleString(isAr ? 'ar-JO' : 'en-JO', {
                                        month: 'numeric',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                    });
                                };

                                const formatLastSeenRelative = (userKey) => {
                                    const status = staffStatuses[userKey];
                                    if (!status) return isAr ? 'غير متصل' : 'Offline';

                                    const online = isUserOnline(userKey);
                                    if (online) {
                                        if (status.statusState === 'idle') {
                                            return isAr ? 'امل (بلا نشاط)' : 'Idle (Inactive)';
                                        }
                                        return isAr ? 'نشط الآن' : 'Active now';
                                    }

                                    const lastSeen = status.lastSeen?.seconds ? status.lastSeen.seconds * 1000 : status.lastSeen;
                                    if (!lastSeen) return isAr ? 'غير متصل' : 'Offline';
                                    const diffMs = Date.now() - lastSeen;
                                    const diffMins = Math.floor(diffMs / 60000);

                                    if (diffMins < 2) return isAr ? 'نشط قبل قليل' : 'Active recently';
                                    if (diffMins < 60) return isAr ? `نشط منذ ${diffMins} دقيق` : `Active ${diffMins} mins ago`;
                                    const diffHours = Math.floor(diffMins / 60);
                                    if (diffHours < 24) return isAr ? `نشط منذ ${diffHours} ساع` : `Active ${diffHours} hours ago`;
                                    const diffDays = Math.floor(diffHours / 24);
                                    return isAr ? `نشط منذ ${diffDays} يوم` : `Active ${diffDays} days ago`;
                                };

                                const getTabLabel = (tabKey) => {
                                    switch (tabKey) {
                                        case 'donations': return isAr ? '📦 إدار التبرعات' : '📦 Manage Donations';
                                        case 'approvalRequests': return isAr ? '🔔 الطلبات المنتظر' : '🔔 Pending Requests';
                                        case 'settings': return isAr ? '⚙️ إعدادات النظام' : '⚙️ System Settings';
                                        case 'archive': return isAr ? '🗄️ أرشيف الحملات' : '🗄️ Campaign Archive';
                                        case 'analytics': return isAr ? '📊 إحصائيات النظام' : '📊 System Analytics';
                                        case 'coordinators': return isAr ? '👥 تتبع المنسقين' : '👥 Coordinators Tracker';
                                        default: return tabKey || (isAr ? 'الرئيسي' : 'Dashboard');
                                    }
                                };

                                const getActionCount = (userKey) => {
                                    // Persistent all-time counter stored in staff_status — always accurate
                                    return staffStatuses[userKey]?.totalActions ?? 0;
                                };

                                const filteredLogs = auditLogs.filter(log => {
                                    if (logFilterOperator !== 'all' && log.operatorId !== logFilterOperator) return false;
                                    if (logSearchQuery.trim()) {
                                        const q = logSearchQuery.toLowerCase();
                                        const ar = (log.actionAr || '').toLowerCase();
                                        const en = (log.actionEn || '').toLowerCase();
                                        const op = (log.operatorId || '').toLowerCase();
                                        return ar.includes(q) || en.includes(q) || op.includes(q);
                                    }
                                    return true;
                                });

                                const staffList = [
                                    { key: 'admin', name: 'الأدمن', roleName: 'مدير النظام / Admin', icon: '👑', avatarClass: 'admin-avatar' },
                                    { key: 'ahmad', name: systemSettings.ahmadNameAr || 'أحمد (علي)', roleName: 'منسق قسم الذكور / Coordinator', icon: '♂️', avatarClass: '' },
                                    { key: 'sara', name: systemSettings.saraNameAr || 'سار (سندس)', roleName: 'منسق قسم الإناث / Coordinator', icon: '♀️', avatarClass: '' }
                                ];

                                return (
                                    <div className="coordinators-activity-container">
                                        {/* Top Status Cards */}
                                        <div className="staff-status-grid">
                                            {staffList.map(staff => {
                                                const status = staffStatuses[staff.key] || {};
                                                const online = isUserOnline(staff.key);
                                                const isIdle = online && status.statusState === 'idle';
                                                const actionCount = getActionCount(staff.key);

                                                // Status class for CSS styling
                                                let statusClass = '';
                                                let statusLabel = isAr ? 'غير متصل' : 'Offline';
                                                if (online) {
                                                    if (isIdle) {
                                                        statusClass = 'is-idle'; // We can add CSS for is-idle
                                                        statusLabel = isAr ? 'امل' : 'Idle';
                                                    } else {
                                                        statusClass = 'is-online';
                                                        statusLabel = isAr ? 'متصل' : 'Online';
                                                    }
                                                }

                                                return (
                                                    <div key={staff.key} className="staff-card glass-card">
                                                        <div className="staff-card-header">
                                                            <div className="staff-avatar-wrapper">
                                                                <div className={`staff-avatar-icon ${staff.avatarClass}`}>
                                                                    {staff.icon}
                                                                </div>
                                                                <div className="staff-card-title">
                                                                    <h3>{staff.name}</h3>
                                                                    <span>{staff.roleName}</span>
                                                                </div>
                                                            </div>
                                                            <div className={`staff-status-dot-wrapper ${statusClass}`}>
                                                                <span className="status-dot-pulse" />
                                                                <span>{statusLabel}</span>
                                                            </div>
                                                        </div>

                                                        <div className="staff-details-rows">
                                                            <div className="staff-detail-row">
                                                                <label>{isAr ? 'حال النشاط' : 'Activity Status'}</label>
                                                                <span style={{ color: online ? (isIdle ? '#f59e0b' : '#22c55e') : 'inherit', fontWeight: 'bold' }}>
                                                                    {formatLastSeenRelative(staff.key)}
                                                                </span>
                                                            </div>
                                                            {online && status.currentTab && (
                                                                <div className="staff-detail-row">
                                                                    <label>{isAr ? 'الصفحة المفتوح حالياً' : 'Current Page'}</label>
                                                                    <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                                                        {getTabLabel(status.currentTab)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="staff-detail-row">
                                                                <label>{isAr ? 'آخر تسجيل دخول' : 'Last Login'}</label>
                                                                <span>{formatStatusTime(status.lastLogin)}</span>
                                                            </div>
                                                            <div className="staff-detail-row">
                                                                <label>{isAr ? 'آر تسجيل روج' : 'Last Logout'}</label>
                                                                <span>{formatStatusTime(status.lastLogout)}</span>
                                                            </div>
                                                            <div className="staff-detail-row">
                                                                <label>{isAr ? 'إجمالي العمليات المنفذ' : 'Total Actions'}</label>
                                                                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                                                    {actionCount} {isAr ? 'عملي' : 'actions'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Timeline Filter Toolbar */}
                                        <div className="activity-filter-toolbar glass-card">
                                            <div className="filter-operators-group">
                                                {[
                                                    { key: 'all', label: isAr ? 'الكل' : 'All' },
                                                    { key: 'admin', label: isAr ? 'الأدمن' : 'Admin' },
                                                    { key: 'ahmad', label: systemSettings.ahmadNameAr || 'أحمد' },
                                                    { key: 'sara', label: systemSettings.saraNameAr || 'سار' }
                                                ].map(op => (
                                                    <button
                                                        key={op.key}
                                                        className={`filter-op-btn ${logFilterOperator === op.key ? 'active' : ''}`}
                                                        onClick={() => setLogFilterOperator(op.key)}
                                                    >
                                                        {op.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="activity-search-box">
                                                <input
                                                    type="text"
                                                    placeholder={isAr ? '🔍 ابحث في سجل العمليات...' : '🔍 Search action logs...'}
                                                    value={logSearchQuery}
                                                    onChange={e => setLogSearchQuery(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Timeline Card */}
                                        <div className="activity-timeline-card glass-card">
                                            <div className="timeline-header-row">
                                                <h3>📋 {isAr ? 'سجل العمليات والنشاط التفصيلي' : 'Detailed Activity Log & Audit'}</h3>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {isAr ? `يعرض آر ${filteredLogs.length} عملي منفذ` : `Showing last ${filteredLogs.length} operations`}
                                                </span>
                                            </div>

                                            {statusesLoading && filteredLogs.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                                    ⏳ {isAr ? 'جاري تحميل سجل النشاط...' : 'Loading activity logs...'}
                                                </div>
                                            ) : filteredLogs.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                                    🔍 {isAr ? 'لا توجد عمليات مطابق للمرشحات المحدد.' : 'No matching activities found.'}
                                                </div>
                                            ) : (
                                                <ul className="timeline-list">
                                                    {filteredLogs.map(log => {
                                                        const logTime = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000) : new Date(log.timestamp);
                                                        const operatorName = isAr ? log.operatorNameAr : log.operatorNameEn;
                                                        const operatorIcon = log.operatorId === 'admin' ? '👑' : log.operatorId === 'ahmad' ? '♂️' : '♀️';
                                                        return (
                                                            <li key={log.id} className="timeline-item">
                                                                <div className="timeline-item-dot" />
                                                                <div className="timeline-item-meta">
                                                                    <span className="timeline-item-operator">
                                                                        <span>{operatorIcon}</span>
                                                                        <strong>{operatorName}</strong>
                                                                    </span>
                                                                    <span>
                                                                        {logTime.toLocaleString(isAr ? 'ar-JO' : 'en-JO', {
                                                                            dateStyle: 'medium',
                                                                            timeStyle: 'short'
                                                                        })}
                                                                    </span>
                                                                </div>
                                                                <div className="timeline-item-content">
                                                                    {isAr ? log.actionAr : log.actionEn}
                                                                </div>
                                                                {log.details && Object.keys(log.details).length > 0 && log.details.type !== 'login' && log.details.type !== 'logout' && (
                                                                    <div className="timeline-item-details">
                                                                        {isAr ? 'تفاصيل العملي:' : 'Details:'} {
                                                                            Object.entries(log.details)
                                                                                .filter(([k]) => k !== 'type')
                                                                                .map(([k, v]) => `${k}: ${v}`).join(' | ')
                                                                        }
                                                                    </div>
                                                                )}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* ─── Approval Requests Modal ─── */}
                    {showApprovalRequestsModal && selectedDonationForRequests && (
                        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeApprovalRequestsModal(); }}>
                            <div className="booking-modal glass-card approval-requests-modal" onClick={e => e.stopPropagation()}>
                                <button className="close-modal" onClick={closeApprovalRequestsModal}>×</button>
                                <div className="modal-header">
                                    <h2>🔔 {isAr ? 'الطلبات المنتظر' : 'Pending Requests'}</h2>
                                    <p>{isAr ? 'راجع ووافق أو ارفض طلبات المنسقين قبل تنفيذ الإجراءات.' : 'Review and approve or reject coordinator requests before applying actions.'}</p>
                                </div>
                                <div className="approval-requests-list">
                                    {selectedDonationForRequests.adminApprovalRequests?.filter(req => req.status === 'pending').length === 0 ? (
                                        <div className="empty-state">✅ {isAr ? 'لا توجد طلبات معلق لهذا التبرع.' : 'No pending requests for this donation.'}</div>
                                    ) : (
                                        <ul className="requests-list">
                                            {selectedDonationForRequests.adminApprovalRequests?.filter(req => req.status === 'pending').map((req, idx) => (
                                                <li key={idx} className="request-item">
                                                    <div className="request-header">
                                                        <strong>{getApprovalRequestTypeLabel(req.type)}</strong>
                                                        <span>{req.requestedByName}</span>
                                                    </div>
                                                    <div className="request-body">
                                                        <p>{isAr ? `المنسق: ${req.requestedByName}` : `Coordinator: ${req.requestedByName}`}</p>
                                                        <p>{isAr ? `الحدث: ${getApprovalRequestTypeLabel(req.type)}` : `Action: ${getApprovalRequestTypeLabel(req.type)}`}</p>
                                                        {req.materialIndex !== null && req.materialIndex !== undefined && (
                                                            <p>{isAr ? `رقم المادة: ${req.materialIndex + 1}` : `Material #${req.materialIndex + 1}`}</p>
                                                        )}
                                                        <p>{isAr ? `تاريخخ الطلب: ${new Date(req.requestedAt.seconds ? req.requestedAt.seconds * 1000 : req.requestedAt).toLocaleString('ar-JO')}` : `Requested at: ${new Date(req.requestedAt.seconds ? req.requestedAt.seconds * 1000 : req.requestedAt).toLocaleString('en-US')}`}</p>
                                                    </div>
                                                    <div className="request-actions">
                                                        <button className="action-btn approve-btn" onClick={() => handleApproveApprovalRequest(selectedDonationForRequests.id, req)}>
                                                            ✅ {isAr ? 'موافق' : 'Approve'}
                                                        </button>
                                                        <button className="action-btn delete-btn" onClick={() => handleRejectApprovalRequest(selectedDonationForRequests.id, req)}>
                                                            ❌ {isAr ? 'رفض' : 'Reject'}
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* ─── Archive Campaign Modal ─── */}
                    {showArchiveModal && (
                        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowArchiveModal(false); }}>
                            <div className="booking-modal glass-card archive-modal" onClick={e => e.stopPropagation()}>
                                <button className="close-modal" onClick={() => setShowArchiveModal(false)}>×</button>
                                <div className="modal-header">
                                    <h2>🗄️ {isAr ? 'أرشف الحمل الحالي' : 'Archive Current Campaign'}</h2>
                                    <p>{isAr ? `سيتم حفظ ${allDonations.length} تبرع حالي في الأرشيف تحت الاسم الذي تحدده أدناه` : `${allDonations.length} current donations will be saved under the name you specify`}</p>
                                </div>
                                <div className="form-group">
                                    <label>{isAr ? 'اسم الأرشيف (مثال: الفصل الثاني 2024-2025)' : 'Archive Label (e.g. Semester 2 2024-2025)'}</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={archiveName}
                                        onChange={e => setArchiveName(e.target.value)}
                                        placeholder={isAr ? 'الفصل الدراسي الصيفي 2025...' : 'Summer Semester 2025...'}
                                        autoFocus
                                    />
                                </div>
                                <div className="archive-modal-warning">
                                    ⚠️ {isAr ? 'تنبيه: سيتم حفظ نس من البيانات الحالي وحذفها نهائياً للبدء بحمل وفصل جديد.' : 'Warning: Current donations will be archived and cleared permanently to start a new campaign.'}
                                </div>
                                <button className="submit-btn full-width" onClick={handleArchiveCampaign}>
                                    📦 {isAr ? 'تأكيد الأرشف' : 'Confirm Archive'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ─── Delegate to Coordinator Modal ─── */}
                    {showDelegateModal && donationToDelegate && (
                        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowDelegateModal(false); setDonationToDelegate(null); } }}>
                            <div className="booking-modal glass-card delegate-modal" onClick={e => e.stopPropagation()}>
                                <button className="close-modal" onClick={() => { setShowDelegateModal(false); setDonationToDelegate(null); }}>×</button>
                                <div className="modal-header">
                                    <h2>📢 {isAr ? 'تفويض إلى منسق' : 'Delegate to Coordinator'}</h2>
                                    <p>
                                        {isAr ? 'تبرع من:' : 'Donation by:'}{' '}
                                        <strong>{donationToDelegate.studentName}</strong>{' '}
                                        <span className={`gender-badge gender-${donationToDelegate.studentGender}`}>
                                            {donationToDelegate.studentGender === 'male' ? '♂️' : '♀️'}
                                        </span>
                                    </p>
                                    <p className="delegate-hint">
                                        {isAr
                                            ? 'اختر المنسق الذي ستُفوّض إليه هذا الطلب للمتابع والتسليم:'
                                            : 'Choose the coordinator to handle this donation:'}
                                    </p>
                                </div>
                                <div className="delegate-options">
                                    {(donationToDelegate.studentGender === 'male' || !donationToDelegate.studentGender) && (
                                        <button
                                            className="delegate-option-btn male-option"
                                            onClick={() => handleDelegateToCoordinator(donationToDelegate.id, 'ahmad')}
                                        >
                                            <span className="delegate-option-icon">♂️</span>
                                            <div className="delegate-option-info">
                                                <strong>{systemSettings.ahmadNameAr || 'أحمد'}</strong>
                                                <span>{isAr ? 'منسق قسم الذكور' : 'Male Section Coordinator'}</span>
                                            </div>
                                        </button>
                                    )}
                                    {(donationToDelegate.studentGender === 'female' || !donationToDelegate.studentGender) && (
                                        <button
                                            className="delegate-option-btn female-option"
                                            onClick={() => handleDelegateToCoordinator(donationToDelegate.id, 'sara')}
                                        >
                                            <span className="delegate-option-icon">♀️</span>
                                            <div className="delegate-option-info">
                                                <strong>{systemSettings.saraNameAr || 'سار'}</strong>
                                                <span>{isAr ? 'منسق قسم الإناث' : 'Female Section Coordinator'}</span>
                                            </div>
                                        </button>
                                    )}
                                </div>
                                <p className="delegate-gender-notice">
                                    {donationToDelegate.studentGender === 'male'
                                        ? (isAr ? 'ℹ️ هذا الطلب من مختبرع ذكر، يُفضل تفويضه لمنسق الذكور.' : 'ℹ️ This is a male donor, recommended to delegate to male coordinator.')
                                        : donationToDelegate.studentGender === 'female'
                                            ? (isAr ? 'ℹ️ هذا الطلب من مختبرع، يُفضل تفويضه لمنسق الإناث.' : 'ℹ️ This is a female donor, recommended to delegate to female coordinator.')
                                            : (isAr ? '⚠️ لم يتم تحديد جنس المختبرع، يمكنك الاختيار يدوياً.' : '⚠️ Donor gender not specified, you can choose manually.')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ─── Edit Donation Modal ─── */}
                    {showEditModal && selectedDonationForEdit && (
                        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowEditModal(false); setSelectedDonationForEdit(null); } }}>
                            <div className="booking-modal glass-card edit-donation-modal" onClick={e => e.stopPropagation()}>
                                <button className="close-modal" onClick={() => { setShowEditModal(false); setSelectedDonationForEdit(null); }}>×</button>
                                <div className="modal-header">
                                    <h2>
                                        {isAdminUser
                                            ? (isAr ? '✏️ تعديل بيانات طلب التبرع' : '✏️ Edit Donation Record')
                                            : (isAr ? '📝 طلب تعديل بيانات التبرع' : '📝 Request Donation Edit')}
                                    </h2>
                                    <p>
                                        {isAdminUser
                                            ? (isAr ? 'تحديث معلومات المختبرع والمواد وحال الحجز بالكامل' : 'Update donor info, materials, and reservation status')
                                            : (isAr ? 'سيتم إرسال التعديلات للإدار للمراجع والموافق قبل تطبيقها' : 'Changes will be sent to admin for review before being applied')}
                                    </p>
                                    {!isAdminUser && (
                                        <div style={{ background: 'rgba(255,180,0,0.15)', border: '1px solid rgba(255,180,0,0.4)', borderRadius: '8px', padding: '10px 14px', marginTop: '10px', fontSize: '0.9em', color: '#ffdd88', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            🔔 {isAr ? 'ملاحظ: التعديلات لن تُطبق فوراً — ستصل للإدار كطلب معلق حتى الموافق عليها' : 'Note: Changes will not apply immediately — they will be sent as a pending request for admin approval'}
                                        </div>
                                    )}
                                </div>
                                <form className="booking-form" onSubmit={handleSaveEditDonation}>
                                    <div className="form-group">
                                        <label>{isAr ? 'اسم المختبرع' : 'Donor Name'}</label>
                                        <input
                                            type="text"
                                            required
                                            value={selectedDonationForEdit.studentName}
                                            onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, studentName: e.target.value })}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{isAr ? 'رقم هاتف المختبرع' : 'Donor Phone'}</label>
                                        <input
                                            type="text"
                                            required
                                            value={selectedDonationForEdit.phoneNumber}
                                            onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, phoneNumber: toEnglishNumerals(e.target.value) })}
                                            className="form-input"
                                            maxLength="10"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{isAr ? 'جنس المختبرع' : 'Donor Gender'}</label>
                                        <select
                                            value={selectedDonationForEdit.studentGender}
                                            onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, studentGender: e.target.value })}
                                            className="form-input"
                                        >
                                            <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                                            <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                                        </select>
                                    </div>

                                    {loggedInUser.role === 'admin' && (
                                        <div className="form-group terms-checkbox-container" style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                id="publishedCheckbox"
                                                checked={selectedDonationForEdit.publishedToCoordinators || false}
                                                onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, publishedToCoordinators: e.target.checked })}
                                            />
                                            <label htmlFor="publishedCheckbox" style={{ margin: 0, cursor: 'pointer' }}>
                                                📢 {isAr ? 'نشر وتفويض للمنسقين' : 'Publish/Delegate to Coordinators'}
                                            </label>
                                        </div>
                                    )}

                                    <div className="edit-modal-materials-section">
                                        <h3 style={{ margin: '15px 0 10px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px' }}>📚 {isAr ? 'المواد وحالات الحجز' : 'Materials & Reservation Status'}</h3>
                                        {(selectedDonationForEdit.materials || []).map((material, index) => {
                                            const status = typeof material === 'object' ? material.status : 'pending';
                                            const name = typeof material === 'object' ? material.name : material;
                                            const description = typeof material === 'object' ? material.description : '';
                                            const taker = typeof material === 'object' ? (material.takerInfo || {}) : {};

                                            const updateMaterialField = (field, val) => {
                                                const updatedMats = [...selectedDonationForEdit.materials];
                                                if (typeof updatedMats[index] !== 'object') {
                                                    updatedMats[index] = { name: updatedMats[index], status: 'pending' };
                                                }
                                                updatedMats[index] = { ...updatedMats[index], [field]: val };
                                                setSelectedDonationForEdit({ ...selectedDonationForEdit, materials: updatedMats });
                                            };

                                            const updateTakerField = (field, val) => {
                                                const updatedMats = [...selectedDonationForEdit.materials];
                                                if (typeof updatedMats[index] !== 'object') {
                                                    updatedMats[index] = { name: updatedMats[index], status: 'pending' };
                                                }
                                                const curTaker = updatedMats[index].takerInfo || {};
                                                updatedMats[index] = {
                                                    ...updatedMats[index],
                                                    takerInfo: { ...curTaker, [field]: val }
                                                };
                                                setSelectedDonationForEdit({ ...selectedDonationForEdit, materials: updatedMats });
                                            };

                                            return (
                                                <div key={index} className="edit-material-block" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                                                    <div className="material-details-row" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                        <input
                                                            type="text"
                                                            value={name}
                                                            onChange={e => updateMaterialField('name', e.target.value)}
                                                            className="form-input material-name-input"
                                                            placeholder={isAr ? 'اسم المادة' : 'Material name'}
                                                            style={{ flex: 1 }}
                                                            required
                                                        />
                                                        <select
                                                            value={status}
                                                            onChange={e => updateMaterialField('status', e.target.value)}
                                                            className="form-input material-status-select"
                                                            style={{ width: '150px' }}
                                                        >
                                                            <option value="pending">{isAr ? '⏳ معلّق' : 'Pending'}</option>
                                                            <option value="approved">{isAr ? '✅ معتمد' : 'Approved'}</option>
                                                            <option value="reserved">{isAr ? '🔒 محجوز' : 'Reserved'}</option>
                                                            <option value="completed">{isAr ? '📦 تم تسليمها' : 'Completed'}</option>
                                                        </select>
                                                        {selectedDonationForEdit.materials.length > 1 && (
                                                            <button
                                                                type="button"
                                                                className="action-btn delete-btn"
                                                                onClick={() => {
                                                                    const updatedMats = selectedDonationForEdit.materials.filter((_, idx) => idx !== index);
                                                                    setSelectedDonationForEdit({ ...selectedDonationForEdit, materials: updatedMats });
                                                                }}
                                                                style={{ padding: '0 12px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '40px' }}
                                                                title={isAr ? 'حذف هذه المادة' : 'Delete this material'}
                                                            >
                                                                🗑️
                                                            </button>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={description}
                                                        onChange={e => updateMaterialField('description', e.target.value)}
                                                        className="form-input material-desc-input"
                                                        placeholder={isAr ? 'وصف المادة (اختياري)' : 'Description (optional)'}
                                                    />
                                                    {['reserved', 'completed'].includes(status) && (
                                                        <div className="taker-info-fields" style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>👤 {isAr ? 'معلومات المستلم (الحاجز)' : 'Taker/Booker Info'}</h4>
                                                            <div className="taker-fields-row" style={{ display: 'flex', gap: '8px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={taker.name || ''}
                                                                    onChange={e => updateTakerField('name', e.target.value)}
                                                                    className="form-input"
                                                                    placeholder={isAr ? 'اسم المستلم' : 'Taker Name'}
                                                                    style={{ flex: 1 }}
                                                                    required
                                                                />
                                                                <input
                                                                    type="tel"
                                                                    value={taker.phone || ''}
                                                                    onChange={e => updateTakerField('phone', toEnglishNumerals(e.target.value))}
                                                                    className="form-input"
                                                                    placeholder={isAr ? 'رقم هاتف المستلم' : 'Taker Phone'}
                                                                    style={{ flex: 1 }}
                                                                    required
                                                                    maxLength="10"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {!isAdminUser && (
                                        <div className="form-group" style={{ marginTop: '20px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <span>📝 {isAr ? 'ملاحظات المنسق (مطلوب لتوضيح الإجراء المطلوب):' : 'Coordinator Notes (Required to explain changes):'}</span>
                                            </label>
                                            <textarea
                                                className="form-input"
                                                value={editCoordinatorNotes}
                                                onChange={e => setEditCoordinatorNotes(e.target.value)}
                                                placeholder={isAr ? 'مثال: حذف كتاب الاللغة العربية بسبب تسليمه، أو تصحيح اسم الطالب...' : 'Example: Deleted Arabic Book because it was delivered, or corrected student name...'}
                                                style={{
                                                    minHeight: '80px',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical'
                                                }}
                                                maxLength="500"
                                                required
                                            />
                                            <small style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', display: 'block', textAlign: 'left' }}>
                                                {editCoordinatorNotes.length}/500
                                            </small>
                                        </div>
                                    )}

                                    <button type="submit" className="submit-btn full-width" disabled={loading} style={{ marginTop: '20px' }}>
                                        {loading ? (isAr ? '⏳ جاري الإرسال...' : 'Submitting...') : (!isAdminUser ? (isAr ? '📨 إرسال طلب' : 'Submit Request') : (isAr ? '💾 حفظ التعديلات' : 'Save Changes'))}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
                );

                <MaterialReportModal />

                {/* Login Modal — two-step secret gateway */}
                {showLoginModal && (
                    <div className="modal-overlay" onClick={e => {
                        if (e.target === e.currentTarget) {
                            setShowLoginModal(false);
                            setLoginStep(1);
                            setSecretCodeInput('');
                            setSecretCodeError(false);
                            setLoginForm({ username: '', password: '' });
                            setLoginError('');
                            setCaptchaInput('');
                            setCaptchaError(false);
                            setVerificationCode('');
                            setVerificationCodeInput('');
                            setVerificationCodeError(false);
                            setPendingStaffKey('');
                            setPendingStaffEmail('');
                            setPendingStaffName('');
                        }
                    }}>
                        <div className="login-modal glass-card">
                            <button className="close-modal" onClick={() => {
                                setShowLoginModal(false);
                                setLoginStep(1);
                                setSecretCodeInput('');
                                setSecretCodeError(false);
                                setLoginError('');
                                setCaptchaInput('');
                                setCaptchaError(false);
                                setVerificationCode('');
                                setVerificationCodeInput('');
                                setVerificationCodeError(false);
                                setPendingStaffKey('');
                                setPendingStaffEmail('');
                                setPendingStaffName('');
                            }}>×</button>

                            {/* ── Step 1: Secret Code ── */}
                            {loginStep === 1 && (
                                <>
                                    <div className="modal-header">
                                        <h2>🔒 {isAr ? 'بوابة الوصول' : 'Access Gateway'}</h2>
                                        <p>{isAr ? 'أدخل الكود للمتابعة' : 'Enter the code to continue'}</p>
                                    </div>
                                    <form className="login-form" onSubmit={e => {
                                        e.preventDefault();
                                        if (secretCodeInput.trim() === (systemSettings.secretGatewayCode || 'makanak2025')) {
                                            setLoginStep(2);
                                            setSecretCodeInput('');
                                            setSecretCodeError(false);
                                        } else {
                                            setSecretCodeError(true);
                                            setSecretCodeInput('');
                                        }
                                    }}>
                                        <div className="form-group">
                                            <input
                                                type="text"
                                                className={`form-input ${secretCodeError ? 'input-error-shake' : ''}`}
                                                value={secretCodeInput}
                                                onChange={e => { setSecretCodeInput(e.target.value); setSecretCodeError(false); }}
                                                autoComplete="off"
                                                autoFocus
                                            />
                                            {secretCodeError && (
                                                <div className="login-error">⚠️ {isAr ? 'الكود غير صحيح' : 'Incorrect code'}</div>
                                            )}
                                        </div>
                                        <button type="submit" className="submit-btn">
                                            {isAr ? 'تأكيد' : 'Confirm'}
                                        </button>
                                    </form>
                                </>
                            )}

                            {/* ── Step 2: Username & Password ── */}
                            {loginStep === 2 && (
                                <>
                                    <div className="modal-header">
                                        <h2>🔐 {isAr ? 'دخول الفريق' : 'Staff Login'}</h2>
                                        <p>{isAr ? 'اص بفريق الإدار والمنسقين فقط' : 'For management team and coordinators only'}</p>
                                    </div>
                                    <form className="login-form" onSubmit={handleLogin}>
                                        <div className="form-group">
                                            <label>{isAr ? 'اسم المستدم' : 'Username'}</label>
                                            <input
                                                type="text"
                                                name="staff_username_unique_makanak"
                                                className="form-input"
                                                value={loginForm.username}
                                                onChange={e => setLoginForm(p => ({ ...p, username: e.target.value }))}
                                                autoComplete="new-username"
                                                autoFocus
                                            />
                                        </div>
                                        <div className="form-group form-group-with-toggle">
                                            <label>{isAr ? 'كلم المرور' : 'Password'}</label>
                                            <div className="input-toggle-wrapper">
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    name="staff_password_unique_makanak"
                                                    className="form-input"
                                                    value={loginForm.password}
                                                    onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                                                    autoComplete="new-password"
                                                />
                                                <button
                                                    type="button"
                                                    className="toggle-visibility-btn"
                                                    onClick={() => setShowPassword(prev => !prev)}
                                                    aria-label={showPassword ? (isAr ? 'إفاء المحتوى' : 'Hide text') : (isAr ? 'عرض المحتوى' : 'Show text')}
                                                >
                                                    {showPassword ? '🙈' : '👁️'}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Text-based Canvas CAPTCHA */}
                                        <div className="form-group">
                                            <label>{isAr ? 'رمز التحقق' : 'Verification Code'}</label>
                                            <div className="captcha-wrapper">
                                                <div className="captcha-canvas-container">
                                                    <canvas
                                                        ref={canvasRef}
                                                        width="240"
                                                        height="70"
                                                        className="captcha-canvas"
                                                    />
                                                    <button
                                                        type="button"
                                                        className="captcha-refresh-btn"
                                                        onClick={generateCaptcha}
                                                        title={isAr ? 'تحديث الرمز' : 'Refresh code'}
                                                    >
                                                        🔄
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    className={`form-input captcha-input-field ${captchaError ? 'input-error-shake' : ''}`}
                                                    value={captchaInput}
                                                    onChange={e => {
                                                        setCaptchaInput(e.target.value);
                                                        setCaptchaError(false);
                                                    }}
                                                    placeholder={isAr ? 'أدخل الرمز أعلاه' : 'Enter the code above'}
                                                    autoComplete="off"
                                                    maxLength="6"
                                                />
                                            </div>
                                        </div>

                                        {loginError && <div className="login-error">⚠️ {loginError}</div>}
                                        <button
                                            type="submit"
                                            className="submit-btn"
                                        >
                                            {isAr ? 'تسجيل الدخول' : 'Login'}
                                        </button>
                                    </form>
                                </>
                            )}

                            {loginStep === 3 && (
                                <>
                                    <div className="modal-header">
                                        <h2>✉️ {isAr ? 'التحقق عبر البريد الإلكتروني' : 'Email Verification'}</h2>
                                        <p>{isAr ? 'تم إرسال رمز تحقق إلى البريد الإلكتروني التالي. أدخله لإكمال تسجيل الدخول.' : 'A verification code has been sent to the coordinator email below. Enter it to complete login.'}</p>
                                    </div>
                                    <form className="login-form" onSubmit={handleVerificationSubmit}>
                                        <div className="form-group">
                                            <label>{isAr ? 'البريد الإلكتروني للمنسق' : 'Coordinator email'}</label>
                                            <input
                                                type="text"
                                                className="form-input"
                                                value={maskEmail(pendingStaffEmail)}
                                                readOnly
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>{isAr ? 'رمز التحقق' : 'Verification code'}</label>
                                            <input
                                                type="text"
                                                className={`form-input ${verificationCodeError ? 'input-error-shake' : ''}`}
                                                value={verificationCodeInput}
                                                onChange={e => {
                                                    setVerificationCodeInput(e.target.value);
                                                    setVerificationCodeError(false);
                                                }}
                                                autoComplete="off"
                                                autoFocus
                                                maxLength="6"
                                            />
                                            {verificationCodeError && (
                                                <div className="login-error">⚠️ {isAr ? 'رمز التحقق غير صحيح' : 'Incorrect verification code'}</div>
                                            )}
                                        </div>
                                        <div className="login-action-row" style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <button type="submit" className="submit-btn">
                                                {isAr ? 'تأكيد الرمز' : 'Confirm Code'}
                                            </button>
                                            <button type="button" className="secondary-btn" onClick={handleResendVerificationCode}>
                                                {isAr ? 'إعاد الإرسال' : 'Resend'}
                                            </button>
                                        </div>
                                    </form>
                                </>
                            )}

                            {loginStep === 4 && (() => {
                                const loginQrSecret = pendingStaffTotpSecret;
                                const qrConfirmed = pendingStaffKey === 'admin'
                                    ? systemSettings.adminQrConfirmed
                                    : pendingStaffKey === 'ahmad'
                                        ? systemSettings.ahmadQrConfirmed
                                        : systemSettings.saraQrConfirmed;
                                const resetRequested = pendingStaffKey === 'admin'
                                    ? systemSettings.adminResetRequest
                                    : pendingStaffKey === 'ahmad'
                                        ? systemSettings.ahmadResetRequest
                                        : systemSettings.saraResetRequest;
                                const loginQrUrl = (!qrConfirmed && loginQrSecret)
                                    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`otpauth://totp/Makanak%20Al-Jamii:${pendingStaffKey}?secret=${loginQrSecret}&issuer=Makanak%20Al-Jamii`)}&color=0f172a&bgcolor=ffffff`
                                    : null;
                                return (
                                    <>
                                        <div className="modal-header" style={{ position: 'relative' }}>
                                            <h2>🛡️ {isAr ? 'التحقق بطوتين (2FA)' : 'Two-Factor Authentication'}</h2>
                                            <p>{isAr ? 'أدخل الرمز المكون من 6 أرقام من تطبيق Authenticator الخاص بك.' : 'Enter the 6-digit code from your authenticator app.'}</p>

                                            {/*  Three-dot button — always visible */}
                                            <button
                                                type="button"
                                                title={isAr ? 'يارات' : 'Options'}
                                                onClick={() => setShowQrInLogin(v => !v)}
                                                style={{
                                                    position: 'absolute',
                                                    top: '-5px',
                                                    [isAr ? 'left' : 'right']: '5px',
                                                    background: 'var(--card-bg, #ffffff)',
                                                    border: '1px solid var(--glass-border, rgba(0,0,0,0.15))',
                                                    cursor: 'pointer',
                                                    fontSize: '1.4rem',
                                                    color: 'var(--text-primary, #0f172a)',
                                                    padding: '2px 8px',
                                                    borderRadius: '50%',
                                                    lineHeight: '1.2',
                                                    zIndex: 10,
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                                }}
                                            >

                                            </button>
                                        </div>

                                        {/* Dropdown panel */}
                                        {showQrInLogin && (
                                            <div style={{ margin: '0 0 15px', padding: '12px', background: 'rgba(99,102,241,0.06)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px', border: '1px solid rgba(99,102,241,0.15)' }}>

                                                {/* QR — only if NOT yet confirmed */}
                                                {!qrConfirmed && loginQrUrl && (
                                                    <div style={{ textAlign: 'center' }}>
                                                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                                                            {isAr ? '📱 امسح هذا الرمز بتطبيق Authenticator (مر واحد فقط)' : '📱 Scan once with Authenticator app'}
                                                        </p>
                                                        <div style={{ display: 'inline-block', background: '#fff', padding: '8px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                            <img src={loginQrUrl} alt="QR" style={{ width: '150px', height: '150px', display: 'block' }} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Request reset button — always shown in dropdown */}
                                                <div style={{ textAlign: 'center' }}>
                                                    {resetRequested ? (
                                                        <div style={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: '600', padding: '8px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                                            ⏳ {isAr ? 'تم إرسال طلب إعاد التعيين — بانتظار موافق الأدمن' : 'Reset request sent — awaiting admin approval'}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRequestReset2fa(pendingStaffKey)}
                                                            style={{
                                                                width: '100%',
                                                                padding: '8px 14px',
                                                                fontSize: '0.85rem',
                                                                background: 'rgba(239,68,68,0.06)',
                                                                border: '1px solid rgba(239,68,68,0.35)',
                                                                color: '#ef4444',
                                                                borderRadius: '8px',
                                                                cursor: 'pointer',
                                                                fontWeight: '600'
                                                            }}
                                                        >
                                                            📨 {isAr ? 'طلب إعاد تعيين رمز التحقق' : 'Request Verification Code Reset'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        <form className="login-form" onSubmit={handleTotpSubmit}>
                                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                                <label>{isAr ? 'رمز الأمان (2FA)' : 'Security Code (2FA)'}</label>
                                                <input
                                                    type="text"
                                                    className={`form-input ${totpError ? 'input-error-shake' : ''}`}
                                                    placeholder="000 000"
                                                    value={totpCodeInput}
                                                    onChange={e => {
                                                        setTotpCodeInput(e.target.value.replace(/\D/g, ''));
                                                        setTotpError(false);
                                                    }}
                                                    autoComplete="one-time-code"
                                                    autoFocus
                                                    maxLength="6"
                                                    style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.4rem', fontWeight: 'bold' }}
                                                />
                                                {totpError && (
                                                    <div className="login-error">⚠️ {isAr ? 'رمز التحقق غير صحيح، يرجى المحاولة مجدداً' : 'Incorrect 2FA code, please try again'}</div>
                                                )}
                                            </div>
                                            <div className="login-action-row">
                                                <button type="submit" className="submit-btn" style={{ width: '100%' }}>
                                                    {isAr ? 'تأكيد وتسجيل الدخول' : 'Verify & Enter'}
                                                </button>
                                            </div>
                                        </form>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* 2FA Setup Modal */}
                {setup2faData && (
                    <div className="modal-overlay active" style={{ zIndex: 100000 }}>
                        <div className="modal-content glass-card" style={{ maxWidth: '420px', padding: '24px', textAlign: 'center' }}>
                            <div className="modal-header">
                                <h2>🛡️ {isAr ? 'تأمين الحساب بـ 2FA' : 'Secure Account with 2FA'}</h2>
                                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '8px 0 16px', lineHeight: '1.5' }}>
                                    {isAr
                                        ? `امسح رمز الاستجابة السريعة (QR Code) باستخدام تطبيق Authenticator الخاص بك (مثل Google Authenticator أو Authy) أو أدخل المفتاح السري يدوياً لتوليد الرموز.`
                                        : `Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.) or enter the secret manually to generate login codes.`
                                    }
                                </p>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                                <div style={{ background: '#fff', padding: '12px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                    <img src={setup2faData.qrUrl} alt="2FA QR Code" style={{ display: 'block', width: '180px', height: '180px' }} />
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: '20px' }}>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={setup2faData.formattedSecret}
                                    readOnly
                                    style={{ textAlign: 'center', letterSpacing: '2px', fontFamily: 'monospace', fontWeight: 'bold', background: 'var(--glass-bg)', border: '1px dashed var(--glass-border)', fontSize: '0.95rem', cursor: 'pointer' }}
                                    onClick={(e) => {
                                        navigator.clipboard.writeText(setup2faData.secret);
                                        toast.success(isAr ? 'تم نس المفتاح السري!' : 'Secret key copied!');
                                    }}
                                    title={isAr ? 'انقر للنس' : 'Click to copy'}
                                />
                            </div>

                            <div className="login-action-row" style={{ display: 'flex', justifyContent: 'center' }}>
                                <button type="button" className="submit-btn" style={{ width: '100%' }} onClick={() => setSetup2faData(null)}>
                                    {isAr ? 'إغلاق' : 'Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Hero */}
                <section className="exchange-hero" style={{ backgroundImage: `url(${exchangeHero})` }}>
                    <div className="hero-overlay"></div>
                    <div className="hero-content">
                        <h1>
                            {isAr ? 'تبادل المواد الدراسي 📚' : 'Material Exchange 📚'}
                        </h1>
                        <p>{isAr ? 'منصة لتبادل الكتب والدوسيات بين الطلاب.. فيد واستفيد!' : 'A platform to exchange books and notes between students.. Give and Take!'}</p>
                    </div>
                </section>

                <div className="exchange-main-container">
                    {/* Donation Form */}
                    <div className="add-material-section glass-card">
                        <div className="section-header">
                            <div className="section-header-top">
                                <div>
                                    <h2>{isAr ? 'تبرع الآن بالمواد' : 'Donate Materials Now'}</h2>
                                    <p>{isAr ? 'شارك كتبك ودوسياتك مع زملائك' : 'Share your books and notes with peers'}</p>
                                </div>
                            </div>
                        </div>

                        {!settingsLoaded ? (
                            <div className="campaign-suspension-notice" style={{ opacity: 0.5 }}>
                                <p>{isAr ? 'جاري تحميل الإعدادات...' : 'Loading settings...'}</p>
                            </div>
                        ) : !systemSettings.isExchangeActive ? (
                            <div className="campaign-suspension-notice">
                                <div className="suspension-icon">📢</div>
                                <h3>{isAr ? 'الحمل متوقف حالياً' : 'Campaign Currently Suspended'}</h3>
                                <p>{isAr ? systemSettings.exchangeSuspendedMessageAr : systemSettings.exchangeSuspendedMessageEn}</p>
                                <div className="suspension-footer">
                                    <span>{isAr ? 'نراكم الفصل القادم! 👋' : 'See you next semester! 👋'}</span>
                                </div>
                            </div>
                        ) : systemSettings.donationFormFrozen ? (
                            <div className="campaign-suspension-notice">
                                <div className="suspension-icon">🔒</div>
                                <h3>{isAr ? 'نموذج التبرع مغلق حالياً' : 'Donation Form Closed'}</h3>
                                <p>{isAr ? 'تم إيقاف استقبال التبرعات بالمواد مؤقتاً، مع بقاء إمكاني حجز المواد المتوفر أدناه.' : 'Receiving material donations is temporarily closed, while booking available materials below remains open.'}</p>
                            </div>
                        ) : (
                            <form className="material-form" onSubmit={handleSubmit}>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label>{isAr ? 'اسم الطالب' : 'Student Name'}</label>
                                        <input type="text" name="studentName" value={formData.studentName} onChange={handleInputChange} placeholder={isAr ? 'مثال: أحمد محمد' : 'e.g. Ahmad Mohammad'} className="form-input" required />
                                    </div>
                                    <div className="form-group">
                                        <label>{isAr ? 'رقم التواصل (واتساب)' : 'Contact Number (WhatsApp)'}</label>
                                        <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleInputChange} placeholder="07xxxxxxxx" className="form-input" dir="ltr" maxLength="10" required />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group full-width">
                                        <label>{t('exchange.form.email')}</label>
                                        <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="example@university.edu.jo" className="form-input" dir="ltr" />
                                    </div>
                                </div>
                                {/* ── Gender Selection ── */}
                                <div className="form-group full-width">
                                    <label className="gender-field-label">
                                        {isAr ? 'الجنس' : 'Gender'}
                                        <span className="required-star">*</span>
                                        <span
                                            className="gender-hint-icon"
                                            title={isAr
                                                ? 'اختيار الجنس يُمكّن المنسق المختص بقسمك (ذكور/إناث) من التواصل معك وتسليم المواد بشكل منظم وسريع'
                                                : 'Selecting gender allows the right coordinator (male/female section) to contact you and deliver materials efficiently'}
                                        >
                                            i
                                        </span>
                                    </label>
                                    <div className="gender-select-row">
                                        <button
                                            type="button"
                                            className={`gender-select-btn ${formData.studentGender === 'male' ? 'gender-active-male' : ''}`}
                                            onClick={() => setFormData(prev => ({ ...prev, studentGender: 'male' }))}
                                        >
                                            <span>{isAr ? 'ذكر' : 'Male'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className={`gender-select-btn ${formData.studentGender === 'female' ? 'gender-active-female' : ''}`}
                                            onClick={() => setFormData(prev => ({ ...prev, studentGender: 'female' }))}
                                        >
                                            <span>{isAr ? 'أنثى' : 'Female'}</span>
                                        </button>
                                    </div>
                                    <small className="gender-field-hint">
                                        {isAr
                                            ? 'يُستخدم الجنس لتصنيف موادك وإيصالها للمنسق المختصل بقسمك لتسهيل عملية التسليم والتواصل'
                                            : 'Gender is used to route your materials to the right coordinator for organized delivery and communication'}
                                    </small>
                                </div>
                                <div className="form-group full-width">
                                    <label>{isAr ? 'المواد المتوفر' : 'Available Materials'}</label>
                                    <div className="material-input-container">
                                        <input type="text" value={currentMaterial.name} onChange={e => setCurrentMaterial(prev => ({ ...prev, name: e.target.value }))} placeholder={isAr ? 'اسم المادة (مثال: كتاب الفيزياء 1)' : 'Material name (e.g. Physics 1 Book)'} className="form-input" />
                                        <textarea value={currentMaterial.description} onChange={e => setCurrentMaterial(prev => ({ ...prev, description: e.target.value }))} placeholder={isAr ? 'وصف المادة (اختياري): مثال: سلايدات كاملة، سلايدات الميد فقط، كتاب + شرح، إل...' : 'Material description (optional): e.g. Complete slides, Midterm only, Book + notes, etc.'} className="form-input material-description" rows="2" />
                                        <button type="button" onClick={handleAddMaterial} className="add-btn">{isAr ? 'إضاف' : 'Add'}</button>
                                    </div>
                                    <small className="form-hint">{isAr ? 'يمكنك إضاف أكثر من مادة بالنقر على "إضاف" عد مرات' : 'You can add multiple materials by clicking "Add" multiple times'}</small>
                                    {formData.materials.length > 0 && (
                                        <div className="added-materials-list">
                                            {formData.materials.map((material, index) => (
                                                <div key={index} className="added-material-item">
                                                    <div className="material-item-icon">&#128218;</div>
                                                    <div className="material-item-details">
                                                        <strong>{typeof material === 'string' ? material : material.name}</strong>
                                                        {material.description && <p>{material.description}</p>}
                                                    </div>
                                                    <button type="button" onClick={() => handleRemoveMaterial(index)} className="remove-material-btn" title={isAr ? 'حذف' : 'Remove'}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="disclaimer-box">
                                    <h4 className="disclaimer-title">
                                        <i className="fas fa-exclamation-triangle"></i>
                                        {isAr ? 'تنويه هام / شروط التبرع' : 'Important Note / T&C'}
                                    </h4>
                                    <p className="disclaimer-content">
                                        {isAr
                                            ? 'المواد التي يتم التبرع بها تصبح من ضمن المواد المحجوزة لدى الموقع، وتبقى تحت تصرف مسؤول الموقع أو المنسقين المعتمدين إلى حين انتهاء الحملة. يتم التواصل مع المختبرعين أو الحاجزين من قبل مسؤول الموقع أو المنسقين المعتمدين فقط. الموقع لا يتحمل مسؤولية أي تواصل يتم من قبل أي شخص آخر باسم الموقع.'
                                            : 'Donated materials become part of the reserved materials managed by the site and remain under the control of the site administrator or approved coordinators until the end of the campaign. Communication is carried out only by authorized coordinators or the site administrator. We disclaim responsibility for any communication by anyone else in the name of the website.'}
                                    </p>
                                    <p className="disclaimer-content" style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '0.6rem', fontWeight: 600 }}>
                                        {isAr
                                            ? 'موعد تسليم المواد متوقع أن يكون في الأسبوع الأول أو الثاني من بداية الدوام الرسمي. على كل من يرغب في حجز مادة أن يكون على إدراك تام بأنه بحاجة إليها فعلاً — لا يُقبل إلغاء التسليم بحجة عدم الرغبة في المادة بعد تأكيد الحجز.'
                                            : 'Material delivery is expected during the first or second week of the official semester. Anyone wishing to book a material must be fully aware that they genuinely need it — cancellation of delivery will not be accepted after booking confirmation on the grounds of no longer wanting the material.'}
                                    </p>
                                </div>
                                {/* ── CAPTCHA — Verification Code ── */}
                                <div className="form-group captcha-form-group">
                                    <label>{isAr ? 'رمز التحقق' : 'Verification Code'}</label>
                                    <div className="captcha-wrapper">
                                        <div className="captcha-canvas-container">
                                            <canvas
                                                ref={donationCanvasRef}
                                                width="240"
                                                height="70"
                                                className="captcha-canvas"
                                            />
                                            <button
                                                type="button"
                                                className="captcha-refresh-btn"
                                                onClick={generateDonationCaptcha}
                                                title={isAr ? 'تحديث الرمز' : 'Refresh code'}
                                            >
                                                🔄
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            className={`form-input captcha-input-field ${donationCaptchaError ? 'input-error-shake' : ''}`}
                                            value={donationCaptchaInput}
                                            onChange={e => {
                                                setDonationCaptchaInput(e.target.value);
                                                setDonationCaptchaError(false);
                                            }}
                                            placeholder={isAr ? 'أدخل الرمز أعلاه' : 'Enter the code above'}
                                            autoComplete="off"
                                            maxLength="6"
                                        />
                                    </div>
                                    {donationCaptchaError && (
                                        <div className="captcha-error-msg">⚠️ {isAr ? 'رمز التحقق غير صحيح — حاول مرة أخرى' : 'Incorrect code — please try again'}</div>
                                    )}
                                </div>
                                <div className="terms-checkbox-container">
                                    <input type="checkbox" id="termsCheckbox" className="terms-checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} />
                                    <label htmlFor="termsCheckbox" className="terms-label">
                                        {isAr ? 'أقر بأنني قرأت ووافقت على الشروط والأحكام أعلاه' : 'I acknowledge that I have read and agreed to the above terms and conditions'}
                                    </label>
                                </div>
                                <button type="submit" className="submit-btn" disabled={loading || !agreedToTerms}>
                                    <span>{loading ? (isAr ? 'جاري النشر...' : 'Publishing...') : (isAr ? 'نشر المواد' : 'Publish Materials')}</span>
                                    <span>{loading ? '⏳' : '🚀'}</span>
                                </button>
                            </form>
                        )}
                    </div>

                    <section className="pre-request-section glass-card">
                        <div className="section-header">
                            <h2>
                                📝 {isAr ? 'طلبات مسبق' : 'Pre-Requests'}
                            </h2>
                            <p>{isAr ? 'إذا كنت ترغب في التبرع بماد أو تحتاج مادة معين، أرسل طلباً مسبقاً. الطلبات لا تُعرض للجمهور، بل تظهر للطاقم فقط في لوح التحكم.' : 'If you want to donate a material or need one, submit a pre-request. Requests are not shown publicly and are visible only to staff in the control panel.'}</p>
                        </div>

                        <form className="pre-request-form" onSubmit={handlePreRequestSubmit}>
                            <div className="pre-request-toggle-row">
                                <button
                                    type="button"
                                    className={`pre-request-type-btn ${preRequestForm.type === 'donate' ? 'active' : ''}`}
                                    onClick={() => setPreRequestForm(prev => ({ ...prev, type: 'donate' }))}
                                >
                                    {isAr ? 'أرغب في التبرع' : 'I want to donate'}
                                </button>
                                <button
                                    type="button"
                                    className={`pre-request-type-btn ${preRequestForm.type === 'need' ? 'active' : ''}`}
                                    onClick={() => setPreRequestForm(prev => ({ ...prev, type: 'need' }))}
                                >
                                    {isAr ? 'أحتاج مادة' : 'I need a material'}
                                </button>
                            </div>

                            <div className="pre-request-grid">
                                <input
                                    type="text"
                                    className="form-input"
                                    value={preRequestForm.studentName}
                                    onChange={(e) => setPreRequestForm(prev => ({ ...prev, studentName: e.target.value }))}
                                    placeholder={isAr ? 'اسم الطالب' : 'Student name'}
                                    required
                                />
                                <input
                                    type="tel"
                                    className="form-input"
                                    value={preRequestForm.phoneNumber}
                                    onChange={(e) => setPreRequestForm(prev => ({ ...prev, phoneNumber: toEnglishNumerals(e.target.value) }))}
                                    placeholder="0790000000"
                                    required
                                    dir="ltr"
                                />
                                <input
                                    type="text"
                                    className="form-input"
                                    value={preRequestForm.materialName}
                                    onChange={(e) => setPreRequestForm(prev => ({ ...prev, materialName: e.target.value }))}
                                    placeholder={isAr ? 'اسم المادة' : 'Material name'}
                                    required
                                />
                            </div>

                            <textarea
                                className="form-input pre-request-notes"
                                value={preRequestForm.notes}
                                onChange={(e) => setPreRequestForm(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder={isAr ? 'ملاحظات إضافية (اختياري)' : 'Additional notes (optional)'}
                                rows="3"
                            />

                            <div className="pre-request-conditions">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={preRequestForm.agreedToPreRequestTerms}
                                        onChange={(e) => setPreRequestForm(prev => ({ ...prev, agreedToPreRequestTerms: e.target.checked }))}
                                    />
                                    {isAr ? 'أقر بأنني قرأت الشروط والأحكام وأوافق عليها' : 'I confirm that I have read and agree to the terms and conditions'}
                                </label>
                            </div>

                            <button type="submit" className="submit-btn full-width" disabled={preRequestLoading}>
                                {preRequestLoading ? (isAr ? 'جاري الإرسال...' : 'Submitting...') : (isAr ? 'إرسال الطلب المسبق' : 'Submit Pre-Request')}
                            </button>
                        </form>

                        <div className="pre-request-note">
                            {isAr
                                ? 'بإمكانك متابع طلبك، في حال تم العثور على مادة تحتاجها سيتم التواصل معك عبر واتساب لتأكيد حجزها.'
                                : 'You can follow up on your request. If a needed material is found, we will contact you via WhatsApp to confirm the reservation.'}
                        </div>
                    </section>

                    {/* Materials List */}
                    <div className="materials-section glass-card">
                        <div className="section-header">
                            <h2>
                                {isAr ? 'المواد المتوفرة' : 'Available Materials'}
                                {systemSettings.isExchangeActive && bookingOpen && <span className="live-badge">● {isAr ? 'مباشر الآن' : 'Live Now'}</span>}
                            </h2>
                            <p>{isAr ? 'تصفح المواد المتاح للتبادل' : 'Browse available materials for exchange'}</p>
                        </div>

                        {
                            systemSettings.isExchangeActive && !bookingOpen && (
                                <div className="booking-notice-banner glass-card animate-pulse">
                                    <span className="notice-icon">⏳</span>
                                    <div className="notice-text">
                                        <h3>{isAr ? 'فتر حجز المواد تبدأ 📚' : 'Material Booking Period Starts 📚'}</h3>
                                        <div className="countdown-timer">
                                            <div className="countdown-item"><span className="time-val">{timeLeft.days}</span><span className="time-label">{isAr ? 'يوم' : 'Days'}</span></div>
                                            <div className="countdown-item"><span className="time-val">{timeLeft.hours}</span><span className="time-label">{isAr ? 'ساع' : 'Hrs'}</span></div>
                                            <div className="countdown-item"><span className="time-val">{timeLeft.minutes}</span><span className="time-label">{isAr ? 'دقيق' : 'Min'}</span></div>
                                            <div className="countdown-item"><span className="time-val">{timeLeft.seconds}</span><span className="time-label">{isAr ? 'ثاني' : 'Sec'}</span></div>
                                        </div>
                                        {systemSettings.bookingStartTime ? (
                                            <>
                                                <p className="booking-info-text">
                                                    {isAr
                                                        ? `الفترة الحالية مخصصة حصراً لجمع وتبرع المواد، على أن يبدأ حجزها بتاريخخ ${new Date(systemSettings.bookingStartTime).toLocaleString('ar-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. ⏳`
                                                        : `This period is exclusively for donations. Booking opens on ${new Date(systemSettings.bookingStartTime).toLocaleString('en-JO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. ⏳`}
                                                </p>
                                                <input
                                                    type="text"
                                                    className={`form-input captcha-input-field ${captchaError ? 'input-error-shake' : ''}`}
                                                    value={captchaInput}
                                                    onChange={e => {
                                                        setCaptchaInput(e.target.value);
                                                        setCaptchaError(false);
                                                    }}
                                                    placeholder={isAr ? 'أدخل الرمز أعلاه' : 'Enter the code above'}
                                                    autoComplete="off"
                                                    maxLength="6"
                                                />
                                                <div className="empty-icon">⏳</div>
                                                <h3>{isAr ? 'جاري التحميل...' : 'Loading...'}</h3>
                                            </>
                                        ) : !systemSettings.isExchangeActive ? (
                                            <div className="no-materials">
                                                <div className="empty-icon">🔧</div>
                                                <h3>{isAr ? 'النظام قيد التطوير' : 'System Under Development'}</h3>
                                                <p>{isAr ? 'نعمل على إطلاق نظام جديد ومتكامل قريباً' : 'We are launching a new integrated system soon'}</p>
                                            </div>
                                        ) : availableMaterials.length > 0 ? (
                                            <div className="materials-grid">
                                                {availableMaterials.map(item => (
                                                    <div key={item.uniqueKey} className="donation-card">
                                                        <div className="donation-main">
                                                            <div className="material-icon">📚</div>
                                                            <div className="donation-details"><h3>{item.materialItem.name}</h3></div>
                                                        </div>
                                                        <button
                                                            className={`btn-book ${!bookingOpen ? 'locked' : ''}`}
                                                            onClick={() => { if (bookingOpen) openBookingModal(item); }}
                                                            disabled={!bookingOpen}
                                                            title={!bookingOpen ? (isAr ? 'حمل الحجز مغلق حالياً' : 'Booking campaign is currently closed') : ''}
                                                        >
                                                            {isAr ? 'حجز المادة' : 'Book Material'}
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="no-materials">
                                                <div className="empty-icon">📦</div>
                                                <h3>{isAr ? 'لا توجد مواد معروض حالياً' : 'No materials available yet'}</h3>
                                                <p>{isAr ? 'كن أول المبادرين!' : 'Be the first!'}</p>
                                            </div>
                                        )
                                        }

                                        {
                                            systemSettings.isExchangeActive && reservedMaterials.length > 0 && (
                                                <div className="reserved-materials-container">
                                                    <div className="section-divider-wrapper">
                                                        <hr className="section-divider" />
                                                        <span className="divider-text">{isAr ? 'مواد نفذت (غير متاح حالياً)' : 'Out of Stock (Currently Unavailable)'}</span>
                                                    </div>
                                                    <div className="materials-grid">
                                                        {reservedMaterials.map((item, index) => (
                                                            <div key={index} className="donation-card reserved-card">
                                                                <div className="material-icon">📚</div>
                                                                <div className="donation-details"><h3>{item.materialName}</h3></div>
                                                                <button className="btn-book disabled" disabled>{isAr ? 'تم الحجز' : 'Reserved'}</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        }
                                    </div>
                                </div>
                            )
                        }

                        {/* Team Section */}
                        <section className="coordination-team-section glass-card">
                            <div className="coordination-badge">
                                <span className="badge-icon">🤝</span>
                                <span>{isAr ? 'فريق التنسيق المعتمد' : 'Certified Coordination Team'}</span>
                            </div>
                            <div className="coordination-content">
                                <h3>{isAr ? 'آلي الإشراف والتوزيع' : 'Supervision & Distribution Mechanism'}</h3>
                                <p className="coordination-description">
                                    {isAr
                                        ? 'هناك فريق تنسيق معتمد يقوم بالإشراف وتنسيق عملي التبرع والحجز، حيث يتم التواصل مع الطلاب الذكور من قبل المنسق المعني، والطالبات الإناث من قبل المنسق المعني، وذلك لضمان الخصوصية والتنظيم والسرعة في تسليم المواد.'
                                        : 'There is a certified coordination team supervising and coordinating the donation and booking process: male students are contacted by the male coordinator, and female students by the female coordinator, ensuring privacy, organization, and speed in material delivery.'}
                                </p>
                                <div className="coordination-features">
                                    <div className="coord-feature-item">
                                        <span className="feature-icon">♂️</span>
                                        <div className="feature-text">
                                            <h4>{isAr ? 'قسم الذكور' : 'Male Section'}</h4>
                                            <p>{isAr ? `بإشراف المنسق المعني (${systemSettings.ahmadNameAr || 'أحمد'})` : `Supervised by male coordinator (${systemSettings.ahmadNameEn || 'Ahmad'})`}</p>
                                        </div>
                                    </div>
                                    <div className="coord-feature-item">
                                        <span className="feature-icon">♀️</span>
                                        <div className="feature-text">
                                            <h4>{isAr ? 'قسم الإناث' : 'Female Section'}</h4>
                                            <p>{isAr ? `بإشراف المنسق المعني (${systemSettings.saraNameAr || 'سار'})` : `Supervised by female coordinator (${systemSettings.saraNameEn || 'Sara'})`}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                {/* Booking Modal */}
                {
                    showBookingModal && (
                        <div className="modal-overlay">
                            <div className="booking-modal glass-card">
                                <button className="close-modal" onClick={() => setShowBookingModal(false)}>×</button>
                                <div className="modal-header">
                                    <h2>{isAr ? 'حجز المادة' : 'Book Material'}</h2>
                                    <p>{isAr ? 'يرجى ملء معلوماتك لحجز المادة وسنتواصل معك قريباً' : 'Please fill in your details to book the material'}</p>
                                    <div className="material-to-book"><span>📖</span><strong>{selectedMaterial?.materialName}</strong></div>
                                </div>
                                <form className="booking-form" onSubmit={handleBookingSubmit}>
                                    <div className="form-group">
                                        <label>{isAr ? 'الاسم (من مقطعين على الأقل)' : 'Full Name (at least 2 parts)'}</label>
                                        <input type="text" required value={bookingData.name} onChange={e => setBookingData({ ...bookingData, name: e.target.value })} placeholder={isAr ? 'مثال: محمد أحمد' : 'e.g. Mohammad Ahmad'} className="form-input" />
                                    </div>
                                    <div className="form-group">
                                        <label>{isAr ? 'رقم الهاتف للتواصل واستلام المادة' : 'Contact Number'}</label>
                                        <input type="tel" required value={bookingData.phone} onChange={e => setBookingData({ ...bookingData, phone: toEnglishNumerals(e.target.value) })} placeholder="07xxxxxxxx" className="form-input" dir="ltr" />
                                    </div>
                                    {/* ── Gender Selection ── */}
                                    <div className="form-group">
                                        <label className="gender-field-label">
                                            {isAr ? 'الجنس' : 'Gender'}
                                            <span className="required-star">*</span>
                                            <span
                                                className="gender-hint-icon"
                                                title={isAr
                                                    ? 'اختيار الجنس يساعد المنسق المختص بقسمك على التواصل معك وإتمام عملية الاستلام بشكل منظم'
                                                    : 'Selecting gender helps the right coordinator contact you to arrange material pickup'}
                                            >
                                                i
                                            </span>
                                        </label>
                                        <div className="gender-select-row">
                                            <button
                                                type="button"
                                                className={`gender-select-btn ${bookingData.gender === 'male' ? 'gender-active-male' : ''}`}
                                                onClick={() => setBookingData(prev => ({ ...prev, gender: 'male' }))}
                                            >
                                                <span>{isAr ? 'ذكر' : 'Male'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                className={`gender-select-btn ${bookingData.gender === 'female' ? 'gender-active-female' : ''}`}
                                                onClick={() => setBookingData(prev => ({ ...prev, gender: 'female' }))}
                                            >
                                                <span>{isAr ? 'أنثى' : 'Female'}</span>
                                            </button>
                                        </div>
                                        <small className="gender-field-hint">
                                            {isAr
                                                ? 'يُستخدم لتحديد المنسق المعني الذي سيتواصل معك لتسليم المادة'
                                                : 'Used to identify the right coordinator who will contact you for material pickup'}
                                        </small>
                                    </div>
                                    {/* ── CAPTCHA — Verification Code ── */}
                                    <div className="form-group captcha-form-group">
                                        <label>{isAr ? 'رمز التحقق' : 'Verification Code'}</label>
                                        <div className="captcha-wrapper">
                                            <div className="captcha-canvas-container">
                                                <canvas
                                                    ref={bookingCanvasRef}
                                                    width="240"
                                                    height="70"
                                                    className="captcha-canvas"
                                                />
                                                <button
                                                    type="button"
                                                    className="captcha-refresh-btn"
                                                    onClick={generateBookingCaptcha}
                                                    title={isAr ? 'تحديث الرمز' : 'Refresh code'}
                                                >
                                                    🔄
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                className={`form-input captcha-input-field ${bookingCaptchaError ? 'input-error-shake' : ''}`}
                                                value={bookingCaptchaInput}
                                                onChange={e => {
                                                    setBookingCaptchaInput(e.target.value);
                                                    setBookingCaptchaError(false);
                                                }}
                                                placeholder={isAr ? 'أدخل الرمز أعلاه' : 'Enter the code above'}
                                                autoComplete="off"
                                                maxLength="6"
                                            />
                                        </div>
                                        {bookingCaptchaError && (
                                            <div className="captcha-error-msg">⚠️ {isAr ? 'رمز التحقق غير صحيح — حاول مرة أخرى' : 'Incorrect code — please try again'}</div>
                                        )}
                                    </div>
                                    <div className="disclaimer-box" style={{ margin: '0.5rem 0 1rem 0' }}>
                                        <h4 className="disclaimer-title">
                                            <i className="fas fa-exclamation-triangle"></i>
                                            {isAr ? 'تنويه هام قبل تأكيد الحجز' : 'Important Note Before Confirming'}
                                        </h4>
                                        <p className="disclaimer-content">
                                            {isAr
                                                ? 'موعد تسليم المواد متوقع يكون لال الأسبوع الأول أو الثاني من بداي الدوام الرسمي. بتأكيدك للحجز أنت تُقر بأنك بحاج فعلي لهذه المادة وعلى إدراك تام بذلك — لا يُقبل إلغاء التسليم بحج عدم الرغب في المادة بعد تأكيد الحجز.'
                                                : 'Material delivery is expected during the first or second week of the official semester. By confirming your booking, you acknowledge that you genuinely need this material — cancellation of delivery will not be accepted after booking confirmation on the grounds of no longer wanting it.'}
                                        </p>
                                    </div>
                                    <button type="submit" className="submit-btn full-width" disabled={loading}>
                                        {loading ? (isAr ? 'جاري الحجز...' : 'Booking...') : (isAr ? 'تأكيد الحجز' : 'Confirm Booking')}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* Edit Donation Modal moved to staff dashboard above */}
                {
                    false && showEditModal && selectedDonationForEdit && (
                        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowEditModal(false); setSelectedDonationForEdit(null); } }}>
                            <div className="booking-modal glass-card edit-donation-modal" onClick={e => e.stopPropagation()}>
                                <button className="close-modal" onClick={() => { setShowEditModal(false); setSelectedDonationForEdit(null); }}>×</button>
                                <div className="modal-header">
                                    <h2>✏️ {isAr ? 'تعديل بيانات طلب التبرع' : 'Edit Donation Record'}</h2>
                                    <p>{isAr ? 'تحديث معلومات المختبرع والمواد وحال الحجز بالكامل' : 'Update donor info, materials, and reservation status'}</p>
                                </div>
                                <form className="booking-form" onSubmit={handleSaveEditDonation}>
                                    <div className="form-group">
                                        <label>{isAr ? 'اسم المختبرع' : 'Donor Name'}</label>
                                        <input
                                            type="text"
                                            required
                                            value={selectedDonationForEdit.studentName}
                                            onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, studentName: e.target.value })}
                                            className="form-input"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{isAr ? 'رقم هاتف المختبرع' : 'Donor Phone'}</label>
                                        <input
                                            type="text"
                                            required
                                            value={selectedDonationForEdit.phoneNumber}
                                            onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, phoneNumber: toEnglishNumerals(e.target.value) })}
                                            className="form-input"
                                            maxLength="10"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>{isAr ? 'جنس المختبرع' : 'Donor Gender'}</label>
                                        <select
                                            value={selectedDonationForEdit.studentGender}
                                            onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, studentGender: e.target.value })}
                                            className="form-input"
                                        >
                                            <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                                            <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                                        </select>
                                    </div>

                                    {loggedInUser.role === 'admin' && (
                                        <div className="form-group terms-checkbox-container" style={{ margin: '15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                id="publishedCheckbox"
                                                checked={selectedDonationForEdit.publishedToCoordinators || false}
                                                onChange={e => setSelectedDonationForEdit({ ...selectedDonationForEdit, publishedToCoordinators: e.target.checked })}
                                            />
                                            <label htmlFor="publishedCheckbox" style={{ margin: 0, cursor: 'pointer' }}>
                                                📢 {isAr ? 'نشر وتفويض للمنسقين' : 'Publish/Delegate to Coordinators'}
                                            </label>
                                        </div>
                                    )}

                                    <div className="edit-modal-materials-section">
                                        <h3 style={{ margin: '15px 0 10px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px' }}>📚 {isAr ? 'المواد وحالات الحجز' : 'Materials & Reservation Status'}</h3>
                                        {(selectedDonationForEdit.materials || []).map((material, index) => {
                                            const status = typeof material === 'object' ? material.status : 'pending';
                                            const name = typeof material === 'object' ? material.name : material;
                                            const description = typeof material === 'object' ? material.description : '';
                                            const taker = typeof material === 'object' ? (material.takerInfo || {}) : {};

                                            const updateMaterialField = (field, val) => {
                                                const updatedMats = [...selectedDonationForEdit.materials];
                                                if (typeof updatedMats[index] !== 'object') {
                                                    updatedMats[index] = { name: updatedMats[index], status: 'pending' };
                                                }
                                                updatedMats[index] = { ...updatedMats[index], [field]: val };
                                                setSelectedDonationForEdit({ ...selectedDonationForEdit, materials: updatedMats });
                                            };

                                            const updateTakerField = (field, val) => {
                                                const updatedMats = [...selectedDonationForEdit.materials];
                                                if (typeof updatedMats[index] !== 'object') {
                                                    updatedMats[index] = { name: updatedMats[index], status: 'pending' };
                                                }
                                                const curTaker = updatedMats[index].takerInfo || {};
                                                updatedMats[index] = {
                                                    ...updatedMats[index],
                                                    takerInfo: { ...curTaker, [field]: val }
                                                };
                                                setSelectedDonationForEdit({ ...selectedDonationForEdit, materials: updatedMats });
                                            };

                                            return (
                                                <div key={index} className="edit-material-block" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                                                    <div className="material-details-row" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                        <input
                                                            type="text"
                                                            value={name}
                                                            onChange={e => updateMaterialField('name', e.target.value)}
                                                            className="form-input material-name-input"
                                                            placeholder={isAr ? 'اسم المادة' : 'Material name'}
                                                            style={{ flex: 1 }}
                                                            required
                                                        />
                                                        <select
                                                            value={status}
                                                            onChange={e => updateMaterialField('status', e.target.value)}
                                                            className="form-input material-status-select"
                                                            style={{ width: '150px' }}
                                                        >
                                                            <option value="pending">{isAr ? '⏳ معلّق' : 'Pending'}</option>
                                                            <option value="approved">{isAr ? '✅ معتمد' : 'Approved'}</option>
                                                            <option value="reserved">{isAr ? '🔒 محجوز' : 'Reserved'}</option>
                                                            <option value="completed">{isAr ? '📦 تم تسليمها' : 'Completed'}</option>
                                                        </select>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={description}
                                                        onChange={e => updateMaterialField('description', e.target.value)}
                                                        className="form-input material-desc-input"
                                                        placeholder={isAr ? 'وصف المادة (اختياري)' : 'Description (optional)'}
                                                    />
                                                    {/* Taker Info (Booker) */}
                                                    {['reserved', 'completed'].includes(status) && (
                                                        <div className="taker-info-fields" style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                                                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>👤 {isAr ? 'معلومات المستلم (الحاجز)' : 'Taker/Booker Info'}</h4>
                                                            <div className="taker-fields-row" style={{ display: 'flex', gap: '8px' }}>
                                                                <input
                                                                    type="text"
                                                                    value={taker.name || ''}
                                                                    onChange={e => updateTakerField('name', e.target.value)}
                                                                    className="form-input"
                                                                    placeholder={isAr ? 'اسم المستلم' : 'Taker Name'}
                                                                    style={{ flex: 1 }}
                                                                    required
                                                                />
                                                                <input
                                                                    type="tel"
                                                                    value={taker.phone || ''}
                                                                    onChange={e => updateTakerField('phone', toEnglishNumerals(e.target.value))}
                                                                    className="form-input"
                                                                    placeholder={isAr ? 'رقم هاتف المستلم' : 'Taker Phone'}
                                                                    style={{ flex: 1 }}
                                                                    required
                                                                    maxLength="10"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <button type="submit" className="submit-btn full-width" disabled={loading} style={{ marginTop: '20px' }}>
                                        {loading ? (isAr ? '⏳ جاري الإرسال...' : 'Submitting...') : (!isAdminUser ? (isAr ? '📤 إرسال الطلب' : 'Submit Request') : (isAr ? '💾 حفظ التعديلات' : 'Save Changes'))}
                                    </button>
                                    {!isAdminUser && (
                                        <p className="modal-note" style={{ marginTop: '12px', color: 'var(--muted-color)', fontSize: '0.95em' }}>
                                            {isAr ? 'ملاحظ: سيتم إرسال هذا الطلب إلى الإدار للمراجع. سيُتّذ قرار بالموافق أو الرفض وسيصلك إشعار بالنتيج.' : 'Note: This request will be sent to administration for review. A decision (approve or reject) will be made and you will be notified.'}
                                        </p>
                                    )}
                                </form>
                            </div>
                        </div>
                    )
                }

                {/* ──────────────────────────────────────────────────────────────────────────
                ADMIN DECISION MODAL
                ──────────────────────────────────────────────────────────────────────────
                Opens when admin clicks on approval request in the pending list.
                Allows admin to approve/reject/suspend with optional admin notes.
            ────────────────────────────────────────────────────────────────────────────── */}
                {
                    showAdminResponseModal && isAdminUser && adminResponseData.request && (
                        <div className="modal-overlay" onClick={e => {
                            if (e.target === e.currentTarget) closeAdminResponseModal();
                        }}>
                            <div className="booking-modal glass-card" onClick={e => e.stopPropagation()}>
                                <button className="close-modal" onClick={closeAdminResponseModal}>×</button>
                                <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🔍 {isAr ? 'قرار المشرف على الطلب' : 'Admin Decision on Request'}
                                </h2>

                                {/* Coordinator Request Details */}
                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: 'rgba(255,255,255,0.7)', fontWeight: 'bold' }}>
                                        {isAr ? '📋 تفاصيل طلب المنسق:' : '📋 Coordinator Request Details:'}
                                    </p>
                                    <table style={{ width: '100%', fontSize: '0.9em' }}>
                                        <tbody>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', width: '150px' }}>
                                                    {isAr ? 'نوع الطلب:' : 'Request Type:'}
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    {getApprovalRequestTypeLabel(adminResponseData.request.type)}
                                                </td>
                                            </tr>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', width: '150px' }}>
                                                    {isAr ? 'طالب الموافق:' : 'Requester:'}
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    {adminResponseData.request.requestedByName}
                                                </td>
                                            </tr>
                                            {adminResponseData.request.coordinatorNotes && (
                                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', width: '150px' }}>
                                                        {isAr ? 'ملاحظات المنسق:' : 'Notes:'}
                                                    </td>
                                                    <td style={{ padding: '8px', fontStyle: 'italic', color: 'rgba(255,255,255,0.9)' }}>
                                                        "{adminResponseData.request.coordinatorNotes}"
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Admin Decision Radio Buttons */}
                                <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(0,100,200,0.1)', borderRadius: '8px', border: '1px solid rgba(0,150,255,0.2)' }}>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.95em', fontWeight: 'bold' }}>
                                        {isAr ? '⚙️ اختر قرارك:' : '⚙️ Choose your decision:'}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', borderRadius: '6px', background: adminResponseData.adminAction === 'approve' ? 'rgba(0,255,100,0.15)' : 'transparent' }}>
                                            <input
                                                type="radio"
                                                value="approve"
                                                checked={adminResponseData.adminAction === 'approve'}
                                                onChange={e => setAdminResponseData({ ...adminResponseData, adminAction: e.target.value })}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span style={{ flex: 1 }}>✅ {isAr ? 'الموافق على الطلب' : 'Approve the request'}</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', borderRadius: '6px', background: adminResponseData.adminAction === 'reject' ? 'rgba(255,0,0,0.15)' : 'transparent' }}>
                                            <input
                                                type="radio"
                                                value="reject"
                                                checked={adminResponseData.adminAction === 'reject'}
                                                onChange={e => setAdminResponseData({ ...adminResponseData, adminAction: e.target.value })}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span style={{ flex: 1 }}>❌ {isAr ? 'رفض الطلب' : 'Reject the request'}</span>
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', borderRadius: '6px', background: adminResponseData.adminAction === 'suspend' ? 'rgba(255,200,0,0.15)' : 'transparent' }}>
                                            <input
                                                type="radio"
                                                value="suspend"
                                                checked={adminResponseData.adminAction === 'suspend'}
                                                onChange={e => setAdminResponseData({ ...adminResponseData, adminAction: e.target.value })}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span style={{ flex: 1 }}>⏸️ {isAr ? 'إيقاف الطلب للمراجع' : 'Suspend for further review'}</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Admin Notes */}
                                <div className="form-group" style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span>📝 {isAr ? 'ملاحظات المشرف (اختياري)' : 'Admin Notes (Optional)'}</span>
                                        <span style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.5)' }}>
                                            ({isAr ? 'اشرح السبب لف قرارك' : 'explain your decision'})
                                        </span>
                                    </label>
                                    <textarea
                                        className="form-input"
                                        value={adminResponseData.adminNotes}
                                        onChange={e => setAdminResponseData({ ...adminResponseData, adminNotes: e.target.value })}
                                        placeholder={isAr ? 'مثال: الطلب نظيف وآمن، المادة صحيح...' : 'Example: Request is clean, material is valid...'}
                                        style={{
                                            minHeight: '100px',
                                            fontFamily: 'inherit',
                                            resize: 'vertical'
                                        }}
                                        maxLength="500"
                                    />
                                    <small style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
                                        {isAr ? `${adminResponseData.adminNotes.length}/500` : `${adminResponseData.adminNotes.length}/500`}
                                    </small>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={closeAdminResponseModal}
                                        className="cancel-btn"
                                        style={{
                                            padding: '10px 20px',
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '6px',
                                            color: 'rgba(255,255,255,0.8)',
                                            cursor: 'pointer',
                                            fontSize: '0.95em'
                                        }}
                                    >
                                        {isAr ? '❌ إلغاء' : '❌ Cancel'}
                                    </button>
                                    {adminResponseData.adminAction === 'approve' && (
                                        <button
                                            onClick={() => handleApproveApprovalRequest(adminResponseData.donationId, adminResponseData.request)}
                                            style={{
                                                padding: '10px 20px',
                                                background: 'linear-gradient(135deg, #00d400, #009900)',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '0.95em'
                                            }}
                                        >
                                            ✅ {isAr ? 'الموافق' : 'Approve'}
                                        </button>
                                    )}
                                    {adminResponseData.adminAction === 'reject' && (
                                        <button
                                            onClick={() => handleRejectApprovalRequest(adminResponseData.donationId, adminResponseData.request)}
                                            style={{
                                                padding: '10px 20px',
                                                background: 'linear-gradient(135deg, #ff0000, #cc0000)',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '0.95em'
                                            }}
                                        >
                                            ❌ {isAr ? 'رفض' : 'Reject'}
                                        </button>
                                    )}
                                    {adminResponseData.adminAction === 'suspend' && (
                                        <button
                                            onClick={() => handleSuspendApprovalRequest(adminResponseData.donationId, adminResponseData.request)}
                                            style={{
                                                padding: '10px 20px',
                                                background: 'linear-gradient(135deg, #ffc800, #ff9800)',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '0.95em'
                                            }}
                                        >
                                            ⏸️ {isAr ? 'إيقاف' : 'Suspend'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    showActionRequestModal && !isAdminUser && (
                        <div className="modal-overlay" onClick={e => {
                            if (e.target === e.currentTarget) closeActionRequestModal();
                        }} style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div className="booking-modal glass-card" onClick={e => e.stopPropagation()} style={{ zIndex: 10001, maxHeight: '90vh', overflowY: 'auto' }}>
                                <button className="close-modal" onClick={closeActionRequestModal}>×</button>
                                <h2 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    ⚠️ {isAr ? 'طلب إجراء للموافق' : 'Action Request for Approval'}
                                </h2>

                                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                                    <p style={{ margin: '0 0 10px 0', fontSize: '0.9em', color: 'rgba(255,255,255,0.7)' }}>
                                        {isAr ? '📋 تفاصيل الإجراء المطلوب:' : '📋 Action Details:'}
                                    </p>
                                    <table style={{ width: '100%', fontSize: '0.9em' }}>
                                        <tbody>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', width: '150px' }}>
                                                    {isAr ? 'نوع الإجراء:' : 'Action Type:'}
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    {actionRequestData.actionType === 'editDonation' && (isAr ? '✏️ تعديل التبرع' : '✏️ Edit Donation')}
                                                    {actionRequestData.actionType === 'deleteDonation' && (isAr ? '🗑️ حذف التبرع' : '🗑️ Delete Donation')}
                                                    {actionRequestData.actionType === 'completeBooking' && (isAr ? '✅ إتمام تسليم المادة' : '✅ Complete Material Delivery')}
                                                    {actionRequestData.actionType === 'cancelBooking' && (isAr ? '❌ إلغاء حجز المادة' : '❌ Cancel Material Booking')}
                                                </td>
                                            </tr>
                                            {actionRequestData.donationDetails && (
                                                <>
                                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', width: '150px' }}>
                                                            {isAr ? 'المادة المتأثر:' : 'Affected Material:'}
                                                        </td>
                                                        <td style={{ padding: '8px' }}>
                                                            {actionRequestData.donationDetails.materials && actionRequestData.donationDetails.materials[actionRequestData.materialIndex || 0]?.name}
                                                        </td>
                                                    </tr>
                                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.8)', width: '150px' }}>
                                                            {isAr ? 'المختبرع:' : 'Donor:'}
                                                        </td>
                                                        <td style={{ padding: '8px' }}>
                                                            {actionRequestData.donationDetails.donorNameAr || actionRequestData.donationDetails.donorNameEn}
                                                        </td>
                                                    </tr>
                                                </>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Coordinator Notes */}
                                <div className="form-group" style={{ marginBottom: '20px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                        <span>📝 {isAr ? 'ملاحظات المنسق (اختياري)' : 'Coordinator Notes (Optional)'}</span>
                                        <span style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.5)' }}>
                                            ({isAr ? 'اشرح السبب أو التفاصيل' : 'explain reason or details'})
                                        </span>
                                    </label>
                                    <textarea
                                        className="form-input"
                                        value={actionRequestData.coordinatorNotes}
                                        onChange={e => setActionRequestData({ ...actionRequestData, coordinatorNotes: e.target.value })}
                                        placeholder={isAr ? 'مثال: المادة تالف، تحتاج تحديث معلومات...' : 'Example: Material damaged, needs info update...'}
                                        style={{
                                            minHeight: '100px',
                                            fontFamily: 'inherit',
                                            resize: 'vertical'
                                        }}
                                        maxLength="500"
                                    />
                                    <small style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
                                        {isAr ? `${actionRequestData.coordinatorNotes.length}/500` : `${actionRequestData.coordinatorNotes.length}/500`}
                                    </small>
                                </div>

                                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button
                                        onClick={closeActionRequestModal}
                                        className="cancel-btn"
                                        style={{
                                            padding: '10px 20px',
                                            background: 'rgba(255,255,255,0.1)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            borderRadius: '6px',
                                            color: 'rgba(255,255,255,0.8)',
                                            cursor: 'pointer',
                                            fontSize: '0.95em'
                                        }}
                                    >
                                        {isAr ? '❌ إلغاء' : '❌ Cancel'}
                                    </button>
                                    <button
                                        onClick={handleSubmitActionRequest}
                                        className="submit-btn"
                                        style={{
                                            padding: '10px 20px',
                                            background: 'linear-gradient(135deg, #00d4ff, #0099cc)',
                                            border: 'none',
                                            borderRadius: '6px',
                                            color: 'white',
                                            cursor: 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '0.95em'
                                        }}
                                    >
                                        📤 {isAr ? 'إرسال الطلب' : 'Submit Request'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* ─── WhatsApp direct links replace the old modal ─── */}
                {
                    false && (() => {
                        let finalPhone = String(messageRecipient.phone || '').replace(/\D/g, '');
                        if (finalPhone.length === 10 && finalPhone.startsWith('0')) {
                            finalPhone = '962' + finalPhone.substring(1);
                        }
                        const whatsappLink = `https://wa.me/${finalPhone}?text=${encodeURIComponent(messageText)}`;

                        return (
                            <div className="modal-overlay" onClick={() => setShowMessageComposer(false)}>
                                <div className="booking-modal glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                                    <div className="modal-header">
                                        <h2>💬 {isAr ? 'إرسال رسال عبر الواتس' : 'Send WhatsApp Message'}</h2>
                                        <button
                                            className="close-btn"
                                            onClick={() => setShowMessageComposer(false)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                fontSize: '1.5em',
                                                cursor: 'pointer',
                                                color: 'rgba(255,255,255,0.7)'
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>

                                    <div className="modal-body">
                                        <div className="form-group">
                                            <label>{isAr ? 'المتلقي' : 'Recipient'}</label>
                                            <div style={{
                                                background: 'rgba(255,255,255,0.05)',
                                                padding: '12px 15px',
                                                borderRadius: '6px',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                marginBottom: '15px'
                                            }}>
                                                <p style={{ margin: '0 0 5px 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.9em' }}>
                                                    {messageRecipient.type === 'donor' ? (isAr ? 'المختبرع' : 'Donor') : (isAr ? 'الحاجز' : 'Booker')}
                                                </p>
                                                <p style={{ margin: '0 0 3px 0', fontWeight: 'bold', color: 'white' }}>
                                                    {messageRecipient.name || '—'}
                                                </p>
                                                <p style={{ margin: '0', color: 'rgba(255,255,255,0.6)', fontSize: '0.9em', direction: 'ltr', textAlign: isAr ? 'right' : 'left' }}>
                                                    📱 {messageRecipient.phone || '—'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>{isAr ? 'الرسالة' : 'Message'}</label>
                                            <textarea
                                                className="form-input"
                                                value={messageText}
                                                onChange={e => setMessageText(e.target.value)}
                                                style={{
                                                    minHeight: '250px',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical',
                                                    fontSize: '0.95em',
                                                    lineHeight: '1.6'
                                                }}
                                                maxLength="2000"
                                            />
                                            <small style={{ color: 'rgba(255,255,255,0.5)', marginTop: '4px', display: 'block' }}>
                                                {messageText.length}/2000
                                            </small>
                                        </div>

                                        <div style={{
                                            background: 'rgba(25, 135, 84, 0.1)',
                                            border: '1px solid rgba(25, 135, 84, 0.3)',
                                            borderRadius: '6px',
                                            padding: '12px 15px',
                                            marginBottom: '20px',
                                            direction: isAr ? 'rtl' : 'ltr'
                                        }}>
                                            <p style={{ margin: '0', color: 'rgba(25, 135, 84, 1)', fontSize: '0.9em' }}>
                                                ✓ {isAr ? 'سيتم فتح تطبيق الواتس أب مع الرسالة جاهز للإرسال' : 'WhatsApp will open with the message ready to send'}
                                            </p>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '0 20px 20px' }}>
                                        <button
                                            onClick={() => setShowMessageComposer(false)}
                                            className="cancel-btn"
                                            style={{
                                                padding: '10px 20px',
                                                background: 'rgba(255,255,255,0.1)',
                                                border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '6px',
                                                color: 'rgba(255,255,255,0.8)',
                                                cursor: 'pointer',
                                                fontSize: '0.95em'
                                            }}
                                        >
                                            {isAr ? 'إلغاء' : 'Cancel'}
                                        </button>
                                        <a
                                            href={whatsappLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => {
                                                toast.success(isAr ? 'تم فتح تطبيق الواتس أب' : 'WhatsApp opened');
                                                setShowMessageComposer(false);
                                            }}
                                            className="submit-btn"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '10px 20px',
                                                background: '#25D366',
                                                border: 'none',
                                                borderRadius: '6px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '0.95em',
                                                textDecoration: 'none'
                                            }}
                                        >
                                            💬 {isAr ? 'إرسال عبر الواتس' : 'Send WhatsApp'}
                                        </a>
                                    </div>
                                </div>
                            </div>
                        );
                    })()
                }

                {/* QR Booking Modal */}
                {
                    activeQRModal && (
                        <QRBookingCard
                            bookingId={activeQRModal.bookingId || activeQRModal.id}
                            studentName={activeQRModal.studentName || activeQRModal.bookerName}
                            materialName={activeQRModal.materialName}
                            donorName={activeQRModal.donorName}
                            coordinatorName={activeQRModal.coordinatorName || activeQRModal.assignedCoordinator}
                            pickupDate={activeQRModal.pickupDate}
                            pickupTime={activeQRModal.pickupTime}
                            isAr={isAr}
                            onClose={() => setActiveQRModal(null)}
                        />
                    )
                }

                {/* ─── Terms and Conditions Modal ─── */}
                {showTermsModal && (
                    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowTermsModal(false); setShowTermsDetails(false); } }}>
                        <div className="terms-modal glass-card" onClick={e => e.stopPropagation()}>
                            <div className="terms-modal-header">
                                <h2 className="terms-modal-title">
                                    {isAr ? 'الاتفاقية والشروط الخاصة بتقديم طلب التبرع' : 'Terms and Conditions for Donation Request'}
                                </h2>
                                <button className="close-modal" onClick={() => { setShowTermsModal(false); setShowTermsDetails(false); }}>×</button>
                            </div>

                            <div className="terms-modal-content">
                                <div className="terms-intro-box">
                                    <p className="terms-intro-text">
                                        {isAr
                                            ? 'أقرّ أنا الموقع أدناه (مقدمة الطلب) بما يلي:'
                                            : 'I, the undersigned (requestor), hereby acknowledge the following:'}
                                    </p>
                                </div>

                                {/* Term 1 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">1.</span>
                                        <h3>{isAr ? 'تأكيد الرغب والإراد الكامل' : 'Confirmation of Full Will and Desire'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أتقدم بهذا الطلب بكامل إرادتي، وأؤكد أنني بحاجة فعلية وماسة للمادة (المواد) المطلوبة، وأن طلبي هذا يعبّر عن رغبتي الشخصية، ولا يحملني أي التزام مادي أو قانوني تجاه الجهة المنظمة أو المختبرعين.'
                                            : 'I submit this request of my own free will and confirm that I have a genuine and pressing need for the requested material(s). This request reflects my personal desire and does not create any financial or legal obligation toward the organizing entity or donors.'}
                                    </p>
                                </div>

                                {/* Term 2 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">2.</span>
                                        <h3>{isAr ? 'الالتزام بجدية الطلب' : 'Commitment to Request Seriousness'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أتعهد بعدم تقديم طلبات وهمية أو متكررة بغرض الحجز دون حاجة، وأدرك أن هذا الطلب سيُعتبر ملزماً لي في حال توفر المادة المطلوبة.'
                                            : 'I commit to not submitting fake or duplicate requests for the purpose of booking without genuine need. I understand that this request will be considered binding if the requested material becomes available.'}
                                    </p>
                                </div>

                                {/* Term 3 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">3.</span>
                                        <h3>{isAr ? 'إلغاء الحجز' : 'Booking Cancellation'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? '• في حال رغبتي في إلغاء الطلب أو الحجز، أتعهد بالتواصل مع فريق الحملة عبر المنسق العام (0782934685) في أقرب فرصة ممكنة، وقبل موعد استلام المادة بوقت كافٍ.\n\n• لا يجوز إلغاء الاستلام في يوم التسليم المحدد، إلا بموافقة الفريق أو تواصل مباشر معه، وفي حالات طارئة فقط وبقبول الفريق.'
                                            : '• If I wish to cancel my request or booking, I commit to contacting the campaign team through the general coordinator (0782934685) as soon as possible and before the scheduled material pickup date.\n\n• Cancellation on the designated delivery day is not permitted unless approved in writing or via direct communication with the team, and only in emergencies with the team\'s acceptance.'}
                                    </p>
                                </div>

                                {/* Term 4 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">4.</span>
                                        <h3>{isAr ? 'إبلاغ الفريق قبل التسليم' : 'Notification to Team Before Delivery'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'إذا تم تحديد يوم لتسليم المادة، يجب أن يتم الإبلاغ عن أي رغب في الإلغاء أو التأجيل قبل يوم التسليم على الأقل، وإلا يُعتبر الطلب نافذاً ويتم المضي قدماً في عملي التسليم.'
                                            : 'If a delivery date is set, any cancellation or postponement request must be notified at least one day before the scheduled delivery date. Otherwise, the request will be considered confirmed and the delivery process will proceed.'}
                                    </p>
                                </div>

                                {/* Term 5 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">5.</span>
                                        <h3>{isAr ? 'المسؤولية تجاه المادة المختبرع بها' : 'Responsibility Toward Donated Material'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? '• أتعهد بعدم التصرف بالمادة (بيعاً، أو إهداءً، أو إتلافاً) دون الرجوع إلى الفريق المنظم، وفي حال عدم رغبتي فيها بعد تسلمها، يجب إعادتها إلى الفريق أو التنسيق معهم بشأنها.\n\n• لا يجوز إلغاء مادة تم التبرع بها فعلياً من قبل مختبرع، دون إبلاغ الفريق بشكل رسمي، وإلا أتحمل أنا (الطالب) مسؤولية تعويض الفريق أو المختبرع عن أي ضرر ينتج عن ذلك.'
                                            : '• I commit to not selling, gifting, or disposing of the material without consulting the organizing team. If I do not want it after receiving it, I must return it to the team or coordinate with them regarding it.\n\n• I cannot reject a material that has been genuinely donated without formally notifying the team. Otherwise, I (the student) assume responsibility for compensating the team or donor for any resulting damage.'}
                                    </p>
                                </div>

                                {/* Term 6 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">6.</span>
                                        <h3>{isAr ? 'التزام بالتواصل' : 'Communication Commitment'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أدرك أن جميع مراحل الطلب والحجز تتم عبر منسق الحملة، وأي تغيير أو تعديل يجب أن يكون عبر القنوات الرسمية للفريق، وأتحمل مسؤولية متابعة الطلب بنفسي.'
                                            : 'I understand that all request and booking stages are handled through the campaign coordinator. Any changes or modifications must be made through official team channels, and I am responsible for following up on my request.'}
                                    </p>
                                </div>

                                {/* Term 7 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">7.</span>
                                        <h3>{isAr ? 'حفظ الخصوصية والبيانات الشخصية' : 'Privacy and Personal Data Protection'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أفهم أن بياناتي الشخصية (الاسم، رقم الهاتف، البريد الإلكتروني) ستُستخدم فقط لأغراض التواصل والتسليم ضمن فريق الحملة المصرح. لن يتم نشر أو مشاركة بياناتي مع أي جهات خارجية دون موافقتي الصريحة. البيانات محفوظة بسرية تامة وفقاً لسياسة الخصوصية.'
                                            : 'I understand that my personal data (name, phone, email) will only be used for communication and delivery purposes within the authorized campaign team. My data will not be published or shared with third parties without my explicit consent. All data is kept strictly confidential according to privacy policies.'}
                                    </p>
                                </div>

                                {/* Term 8 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">8.</span>
                                        <h3>{isAr ? 'الالتزام بقوانين الجامعة والقوانين المحلية' : 'Compliance with University and Local Laws'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أتعهد بالالتزام بجميع قوانين الجامعة وأنظمتها، وكذلك القوانين المحليةة المعمول بها. أفهم أن أي تجاوز أو مخالفات قد يؤدي إلى اتخاذ إجراءات تأديبية ضدي. الحملة غير مسؤولة عن أي قوانين قد ينتهكها المختبرع أو الحاجز.'
                                            : 'I commit to complying with all university regulations and laws, as well as applicable local laws. I understand that any violation may result in disciplinary action against me. The campaign is not responsible for any laws violated by donors or recipients.'}
                                    </p>
                                </div>

                                {/* Term 9 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">9.</span>
                                        <h3>{isAr ? 'حق الفريق في الرفض والتعديل' : 'Team Right to Reject and Modify'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'يحتفظ فريق الحمل بالحق الكامل في:\n• رفض أي طلب دون تقديم أسباب واضح إذا رأوا أنه يتعارض مع أهداف الحمل\n• تعديل شروط الحمل أو مواعيد التسليم دون إشعار مسبق\n• إلغاء أي حجز إذا تبين عدم صدق الطلب أو وجود مالفات\n• الاحتفاظ بحق تتبع مسار المواد المختبرع بها'
                                            : 'The campaign team reserves the right to:\n• Reject any request without clear justification if it conflicts with campaign objectives\n• Modify campaign terms or delivery dates without prior notice\n• Cancel any booking if the request proves to be fraudulent or in violation\n• Track the path of donated materials'}
                                    </p>
                                </div>

                                {/* Term 10 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">10.</span>
                                        <h3>{isAr ? 'تجنب النزاعات والقبول بالقرار النهائي' : 'Dispute Resolution and Final Decision'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أتعهد بعدم الدخول في نزاع أو جدال مع فريق الحملة أو المختبرعين بشأن المواد. أوافق على الالتزام بقرار فريق الحملة النهائي في أي حال. إذا كان لدي شكوى، سأقدمها بطريقة احترافية وسلمية عبر المنسق الرسمي فقط.'
                                            : 'I commit to not engaging in disputes or arguments with the campaign team or donors regarding materials. My decision is to accept the campaign team\'s final decision in any dispute. If I have a complaint, I must submit it professionally and peacefully only through the official coordinator.'}
                                    </p>
                                </div>

                                {/* Term 11 */}
                                <div className="terms-item">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">11.</span>
                                        <h3>{isAr ? 'الموافق على الفحص والتحقق' : 'Acceptance of Inspection and Verification'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'أوافق على أن يقوم فريق الحملة بفحص المواد قبل وبعد التسليم للتأكد من سلامتها. كما أوافق على التحقق من بيانات الطلب والحجز في حال الشك أو الشكاوى. أفهم أن هذا لا يعني انتهاك الخصوصية بل هو للتأكد من سير العمل بشكل صحيح.'
                                            : 'I agree to allow the campaign team to inspect materials before and after delivery to ensure their integrity. I also agree to verification of request and booking details in case of doubt or complaints. I understand this does not violate privacy but ensures the process runs correctly.'}
                                    </p>
                                </div>

                                {/* Term 12 */}
                                <div className="terms-item highlight-term">
                                    <div className="terms-item-header">
                                        <span className="terms-item-number">12.</span>
                                        <h3>{isAr ? 'إقرار نهائي وملزم' : 'Final and Binding Acknowledgment'}</h3>
                                    </div>
                                    <p className="terms-item-content">
                                        {isAr
                                            ? 'بوضعي علامة على أني موافق، أقرّ بأنني:\n✓ قرأت جميع البنود أعلاه بعناية وفهمتها بشكل كامل\n✓ أوافق عليها بشكل طوعي وملزم قانونياً\n✓ أتحمل كامل المسؤولية عن أي عدم التزام بهذه الشروط\n✓ أفهم أن عدم الالتزام قد يؤدي إلى عواقب قانونية وتأديبية'
                                            : 'By checking the box, I confirm that I:\n✓ Have read all the terms above carefully and understood them completely\n✓ Agree to them voluntarily and they are legally binding\n✓ Take full responsibility for any breach of these terms\n✓ Understand that non-compliance may result in legal and disciplinary consequences'}
                                    </p>
                                </div>

                                <div className="terms-closing-box">
                                    <p className="closing-main-text">
                                        {isAr
                                            ? 'شكراً لك على قراءتك والتزامك بهذه الشروط. تعاونك يساهم في نجاح هذه الحمل.'
                                            : 'Thank you for reading and committing to these terms. Your cooperation contributes to the success of this campaign.'}
                                    </p>
                                    <p className="closing-sub-text">
                                        {isAr
                                            ? 'للاستفسارات أو الشكاوى: التواصل مع المنسق الرسمي عبر واتساب'
                                            : 'For inquiries or complaints: Contact the official coordinator via WhatsApp'}
                                    </p>
                                </div>
                            </div>

                            <div className="terms-modal-footer">
                                <button
                                    className="close-terms-btn"
                                    onClick={() => { setShowTermsModal(false); setShowTermsDetails(false); }}
                                >
                                    {isAr ? 'إلغاء' : 'Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
};

export default MaterialExchange;
