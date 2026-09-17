import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { quizData as baseQuizData, quizCategories } from '../data/quizData';
import { extraQuizData } from '../data/quizDataExtra';
import FileUploader from '../components/FileUploader';
import { submitQuestionReport, updateQuestionReportNote } from '../services/quizReportService';
import { logQuizCompletion } from '../services/analyticsService';
import { db } from '../config/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import watermarkLogo from '../assets/logo-watermark.png';
import quizHero from '../assets/heros/quiz_hero.png';
import { Highlight, themes } from 'prism-react-renderer';
import { motion, AnimatePresence } from 'framer-motion';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './Quiz.css';
import ExamTimer from '../components/ExamTimer';

// Pure HTML5 Canvas Confetti for celebration upon passing the quiz
const Confetti = () => {
    const canvasRef = useRef(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animationId;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = [
            '#4caf50', '#8bc34a', '#2196f3', '#00bcd4',
            '#ffeb3b', '#ffc107', '#ff9800', '#e91e63',
            '#9c27b0', '#673ab7', '#00c853', '#00e5ff'
        ];

        const particles = [];
        const particleCount = 150;

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height - canvas.height,
                r: Math.random() * 6 + 4,
                d: Math.random() * canvas.height,
                color: colors[Math.floor(Math.random() * colors.length)],
                tilt: Math.random() * 10 - 5,
                tiltAngleIncremental: Math.random() * 0.07 + 0.02,
                tiltAngle: 0
            });
        }

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p, idx) => {
                p.tiltAngle += p.tiltAngleIncremental;
                p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
                p.x += Math.sin(p.tiltAngle);
                p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;

                ctx.beginPath();
                ctx.lineWidth = p.r;
                ctx.strokeStyle = p.color;
                ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
                ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
                ctx.stroke();
            });

            let active = false;
            particles.forEach(p => {
                if (p.y < canvas.height) active = true;
            });

            if (active) {
                animationId = requestAnimationFrame(draw);
            }
        };

        draw();

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                pointerEvents: 'none',
                zIndex: 99999
            }}
        />
    );
};


const CodeBlock = ({ code, language = 'cpp' }) => (
    <Highlight
        theme={themes.vsDark}
        code={code.trim()}
        language={language}
    >
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
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
                margin: '1rem 0',
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
                    {/* Line numbers */}
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
                        {tokens.map((_, i) => (
                            <div key={i} style={{ height: '1.4rem', fontSize: '0.8rem' }}>{i + 1}</div>
                        ))}
                    </div>
                    {/* Highlighted code */}
                    <pre style={{
                        ...style,
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
                        {tokens.map((line, i) => (
                            <div key={i} {...getLineProps({ line })} style={{ height: '1.4rem' }}>
                                {line.map((token, key) => (
                                    <span key={key} {...getTokenProps({ token })} />
                                ))}
                            </div>
                        ))}
                    </pre>
                </div>
            </div>
        )}
    </Highlight>
);

const renderTextWithCode = (text) => {
    if (!text) return null;

    const renderMath = (raw) => raw.replace(/(\$\$[\s\S]+?\$\$|\$[^\$\n][\s\S]*?\$)/g, (match) => {
        const isBlock = match.startsWith('$$') && match.endsWith('$$');
        const content = isBlock ? match.slice(2, -2) : match.slice(1, -1);
        try {
            return katex.renderToString(content, {
                displayMode: isBlock,
                throwOnError: false,
                errorColor: '#bf0000'
            });
        } catch (e) {
            return match;
        }
    });

    const sanitizeHtml = (htmlStr) => {
        if (!htmlStr) return '';
        return htmlStr
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            .replace(/javascript\s*:/gi, '');
    };

    // Modern multi-language support for markdown code blocks
    // Note: We split by the regex but use a capturing group so matches are included in the array
    const parts = text.split(/```(?:java|cpp|javascript|sql|python)?([\s\S]*?)```/i);

    if (parts.length > 1) {
        return parts.map((part, index) => {
            if (index % 2 === 1) {
                return <CodeBlock key={index} code={part} />;
            }

            const html = renderMath(part);
            const isHtml = /<[^>]+>/.test(html);
            if (isHtml) {
                return <span key={index} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
            }

            return <span key={index} style={{ whiteSpace: 'pre-wrap' }}>{html}</span>;
        });
    }

    const html = renderMath(text);
    const isHtml = /<[^>]+>/.test(html);
    if (isHtml) {
        return <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
    }

    return <span style={{ whiteSpace: 'pre-wrap' }}>{html}</span>;
};

// Web Audio API for satisfying click sound without external assets
const playClickSound = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        console.log('Audio playback failed or not supported', e);
    }
};

const playSuccessSound = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        [440, 554, 659].forEach((freq, i) => { // A Major chord
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + (i * 0.1));
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime + (i * 0.1));
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (i * 0.1) + 1);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + (i * 0.1));
            osc.stop(audioCtx.currentTime + (i * 0.1) + 1);
        });
    } catch (e) { }
};

const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(30);
    }
};

const Quiz = () => {
    const { language, t } = useLanguage();
    const { quizId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [selectedCategory, setSelectedCategory] = useState(null);
    const [showUploader, setShowUploader] = useState(false);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState({});
    const [showResults, setShowResults] = useState(false);
    const [score, setScore] = useState(0);
    const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
    const [quizNotes, setQuizNotes] = useState({}); // optional student notes keyed by question ID
    const [reportDocIds, setReportDocIds] = useState({}); // maps questionId -> Firestore report document ID
    const [searchTerm, setSearchTerm] = useState('');

    // Timer and mobile navigation states
    const [timeLeft, setTimeLeft] = useState(0);
    const [timerActive, setTimerActive] = useState(false);
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
    const [printMode, setPrintMode] = useState(null);

    // ── Admin-edits from Firestore (question_edits collection) ──
    const [questionEdits, setQuestionEdits] = useState({});
    const [dbSubjects, setDbSubjects] = useState([]);
    const [dbParts, setDbParts] = useState([]);
    const [dbPartsLoaded, setDbPartsLoaded] = useState(false);
    const [dbCurrentQuestions, setDbCurrentQuestions] = useState([]);
    const [dbSubjectQuestions, setDbSubjectQuestions] = useState([]);
    const [quizExportData, setQuizExportData] = useState({ subjects: [], parts: [], questions: [] });

    // AI grading for essay / short-answer questions
    const [aiGrading, setAiGrading] = useState(false);
    const [aiGradingResults, setAiGradingResults] = useState({});

    // Load custom subjects and parts from Firestore (with localStorage fallback)
    useEffect(() => {
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
            const cloudList = [];
            snap.forEach(d => cloudList.push(d.data()));
            const localSubs = getLocalSubs();
            const combined = [...cloudList];
            localSubs.forEach(ls => {
                if (!combined.some(c => c.id === ls.id)) combined.push(ls);
            });
            quizExportData.subjects.forEach(exportedSubject => {
                if (!combined.some(c => c.id === exportedSubject.id)) combined.push(exportedSubject);
            });
            setDbSubjects(combined);
        }, (err) => {
            console.warn('Quiz.jsx: quiz_subjects fetch warning:', err?.message);
            setDbSubjects(getLocalSubs());
        });

        const unsubParts = onSnapshot(collection(db, 'quiz_parts'), (snap) => {
            const cloudList = [];
            snap.forEach(d => cloudList.push({ ...d.data(), fromDb: true }));
            const localParts = getLocalParts();
            const combined = [...cloudList];
            localParts.forEach(lp => {
                if (!combined.some(c => c.id === lp.id)) combined.push({ ...lp, fromDb: true });
            });
            quizExportData.parts.forEach(exportedPart => {
                if (!combined.some(c => c.id === exportedPart.id)) combined.push({ ...exportedPart, fromDb: true });
            });
            setDbParts(combined);
            setDbPartsLoaded(true);
        }, (err) => {
            console.warn('Quiz.jsx: quiz_parts fetch warning:', err?.message);
            setDbParts(getLocalParts().map(p => ({ ...p, fromDb: true })));
            setDbPartsLoaded(true);
        });

        return () => {
            unsubSubjects();
            unsubParts();
        };
    }, [quizExportData]);

    useEffect(() => {
        Promise.all([
            fetch('/data/firestore/quiz_subjects.json').then(response => response.ok ? response.json() : []),
            fetch('/data/firestore/quiz_parts.json').then(response => response.ok ? response.json() : []),
            fetch('/data/firestore/quiz_questions.json').then(response => response.ok ? response.json() : [])
        ]).then(([subjects, parts, questions]) => {
            setQuizExportData({ subjects, parts, questions });
        }).catch(error => console.warn('Quiz export fallback unavailable:', error));
    }, []);

    // Load edits for the current quizId
    useEffect(() => {
        if (!quizId) { setQuestionEdits({}); return; }
        const unsubEdits = onSnapshot(collection(db, 'question_edits'), (snap) => {
            const map = {};
            snap.forEach(d => {
                const data = d.data();
                if (data.quizId === quizId || data.partId === quizId || d.id.startsWith(`${quizId}_`)) {
                    map[data.questionId] = data;
                }
            });
            setQuestionEdits(map);
        }, () => { }); // silently fail — local data is fallback

        return () => unsubEdits();
    }, [quizId]);

    // Load dynamic questions for the current quizId
    useEffect(() => {
        if (!quizId) {
            setDbCurrentQuestions([]);
            return;
        }
        const q = query(collection(db, 'quiz_questions'), where('partId', '==', quizId));
        const unsubCurrentQs = onSnapshot(q, (snap) => {
            const list = [];
            snap.forEach(d => list.push(d.data()));
            quizExportData.questions
                .filter(question => question.partId === quizId && !question.deleted)
                .forEach(question => {
                    if (!list.some(current => current.id === question.id)) list.push(question);
                });
            setDbCurrentQuestions(list);
        }, console.error);

        return () => unsubCurrentQs();
    }, [quizId, quizExportData.questions]);

    // Merge base quiz categories (static) with custom subjects & parts from DB
    const mergedCategories = useMemo(() => {
        let cats = quizCategories.map(cat => {
            // Find any DB/Firestore update for this subject
            const dbSub = dbSubjects.find(s => s.id === cat.id);
            const baseCat = dbSub ? { ...cat, ...dbSub } : cat;

            const staticParts = baseCat.parts || [];
            const partsMap = new Map();
            staticParts.forEach(p => partsMap.set(p.id, { ...p }));

            const matchingDbParts = dbParts.filter(p => p.subjectId === cat.id);
            matchingDbParts.forEach(dp => {
                if (partsMap.has(dp.id)) {
                    partsMap.set(dp.id, { ...partsMap.get(dp.id), ...dp });
                } else {
                    partsMap.set(dp.id, dp);
                }
            });

            const finalParts = Array.from(partsMap.values()).filter(p => !p.hidden && !p.deleted);
            return {
                ...baseCat,
                parts: finalParts
            };
        });

        // Add completely new subjects from Firestore
        dbSubjects.forEach(sub => {
            const exists = cats.some(c => c.id === sub.id);
            if (!exists) {
                const subParts = dbParts.filter(p => p.subjectId === sub.id && !p.hidden && !p.deleted);
                cats.push({ ...sub, parts: subParts });
            }
        });

        // Also directly read localStorage to ensure offline-added subjects always show
        try {
            const raw = localStorage.getItem('koon_local_quiz_subjects');
            if (raw) {
                Object.values(JSON.parse(raw)).forEach(lSub => {
                    if (!cats.some(c => c.id === lSub.id)) {
                        const rawParts = localStorage.getItem('koon_local_quiz_parts');
                        const localParts = rawParts ? Object.values(JSON.parse(rawParts)).filter(p => p.subjectId === lSub.id && !p.hidden && !p.deleted) : [];
                        cats.push({ ...lSub, parts: localParts });
                    }
                });
            }
        } catch (e) { }

        return cats.filter(cat => !cat.deleted && !cat.hidden);
    }, [dbSubjects, dbParts]);

    // Load all questions for the current subject (to count questions per part on subject landing page)
    useEffect(() => {
        const subjectId = quizId || selectedCategory?.id;
        if (!subjectId) {
            setDbSubjectQuestions([]);
            return;
        }
        const q = query(collection(db, 'quiz_questions'), where('subjectId', '==', subjectId));
        const unsubSubjectQuestions = onSnapshot(q, (snap) => {
            const list = [];
            snap.forEach(d => list.push(d.data()));
            quizExportData.questions
                .filter(question => question.subjectId === subjectId && !question.deleted)
                .forEach(question => {
                    if (!list.some(current => current.id === question.id)) list.push(question);
                });
            setDbSubjectQuestions(list);
        }, console.error);

        return () => unsubSubjectQuestions();
        // Use selectedCategory?.id (string) not the object reference to avoid unnecessary re-runs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizId, selectedCategory?.id, quizExportData.questions]);

    // Merge base quiz data with extra quizzes
    const quizData = useMemo(() => ({ ...baseQuizData, ...extraQuizData }), [baseQuizData]);

    // Get current quiz data (merged with dynamic questions & edits)
    const currentQuiz = useMemo(() => {
        if (!quizId) return null;

        // Priority 1: Check if quizId matches a DB part (leaf quiz) — do this FIRST
        // This prevents a part ID accidentally matching a subject in mergedCategories
        const dbPartInfo = dbParts.find(p => p.id === quizId);

        // Priority 2: Check static merged categories (subjects) — only if quizId is NOT a DB part
        const matchedCat = !dbPartInfo ? mergedCategories.find(c => c.id === quizId) : null;

        let baseQuiz = null;

        if (matchedCat) {
            // It's a subject/category (container with sub-parts)
            baseQuiz = { ...matchedCat };
        } else if (dbPartInfo) {
            // It's a DB-created quiz part (leaf quiz with questions)
            baseQuiz = {
                ...dbPartInfo,
                id: quizId,
                title: dbPartInfo.title,
                titleAr: dbPartInfo.titleAr,
                questions: []
            };
        } else if (quizData[quizId]) {
            // It's a static quiz from quizData
            baseQuiz = { ...quizData[quizId] };
        } else {
            // Check if it matches a part inside any category of mergedCategories (e.g. static part with no static questions but has dynamic questions)
            let foundPart = null;
            for (const cat of mergedCategories) {
                if (cat.parts) {
                    const p = cat.parts.find(part => part.id === quizId);
                    if (p) {
                        foundPart = p;
                        break;
                    }
                }
            }

            if (foundPart) {
                baseQuiz = {
                    ...foundPart,
                    id: quizId,
                    title: foundPart.title,
                    titleAr: foundPart.titleAr,
                    questions: []
                };
            } else {
                // Last resort: check in subParts of grouped parts
                for (const p of dbParts) {
                    if (p.isGroup && p.subParts) {
                        const subPart = p.subParts.find(sp => sp.id === quizId);
                        if (subPart) {
                            baseQuiz = {
                                ...subPart,
                                id: quizId,
                                title: subPart.title,
                                titleAr: subPart.titleAr,
                                questions: []
                            };
                            break;
                        }
                    }
                }
            }
        }

        if (!baseQuiz) return null;

        // Start with base questions (if any)
        let mergedQuestions = [...(baseQuiz.questions || [])];

        // Append custom dynamic questions from DB
        dbCurrentQuestions.forEach(dbQ => {
            const idx = mergedQuestions.findIndex(q => q.id === dbQ.id);
            if (idx >= 0) {
                mergedQuestions[idx] = { ...mergedQuestions[idx], ...dbQ };
            } else {
                mergedQuestions.push(dbQ);
            }
        });

        // Apply admin edits / corrections
        if (Object.keys(questionEdits).length > 0) {
            mergedQuestions = mergedQuestions.map(q => {
                const edit = questionEdits[q.id];
                if (!edit) return q;
                if (edit.deleted) return { ...q, deleted: true };
                return {
                    ...q,
                    questionAr: edit.questionAr || q.questionAr,
                    questionEn: edit.questionEn || q.questionEn,
                    options: edit.options?.length > 0 ? edit.options : q.options,
                    correctAnswer: edit.correctAnswer || q.correctAnswer,
                    image: edit.hasOwnProperty('image') ? edit.image : q.image,
                };
            });
        }

        // Filter deleted questions and collapse static/cloud copies of the same question.
        const seenQuestionKeys = new Set();
        mergedQuestions = mergedQuestions.filter(q => {
            if (q.deleted) return false;
            const text = String(q.questionAr || q.questionEn || '')
                .replace(/<[^>]*>/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            const key = text ? `text:${text}` : `id:${String(q.id)}`;
            if (seenQuestionKeys.has(key)) return false;
            seenQuestionKeys.add(key);
            return true;
        });

        return {
            ...baseQuiz,
            questions: mergedQuestions
        };
    }, [quizId, quizData, mergedCategories, dbParts, dbCurrentQuestions, questionEdits]);

    // Find the parent subject/category for the current quiz (used in breadcrumbs)
    const currentSubject = quizId ? mergedCategories.find(cat => {
        // Level 1: Direct match
        if (cat.id === quizId) return true;

        // Level 2: Match in parts
        if (cat.parts && cat.parts.some(p => p.id === quizId)) return true;

        // Level 3: Match in sub-parts of parts
        if (cat.parts) {
            return cat.parts.some(p => {
                // Static subParts or DB subParts
                if (p.isGroup && p.subParts) {
                    return p.subParts.some(subPart => subPart.id === quizId);
                }
                const partObj = quizData[p.id];
                return partObj && partObj.parts && partObj.parts.some(subPart => subPart.id === quizId);
            });
        }

        return false;
    }) : null;

    const currentSubjectName = currentSubject
        ? (language === 'ar' ? (currentSubject.nameAr || currentSubject.name) : currentSubject.name)
        : '';

    // Filter categories based on search
    const filteredCategories = mergedCategories.filter(category => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            category.name.toLowerCase().includes(search) ||
            category.nameAr.includes(searchTerm)
        );
    });

    // Reset state when quiz ID changes (navigation)
    // Calculate total possible marks for current quiz
    const quizTotalMarks = useMemo(() => {
        if (!currentQuiz?.questions?.length) return 0;
        let total = 0;
        currentQuiz.questions.forEach(q => {
            total += q.marks || 1;
            if (q.type === 'matching') {
                const subQuestions = q.subQuestions || [];
                const hasPerItemMarks = subQuestions.some(s => s.marks !== undefined && s.marks !== null);
                if (hasPerItemMarks) {
                    const subTotal = subQuestions.reduce((acc, s) => acc + (parseFloat(s.marks) || 0), 0);
                    total += subTotal - (q.marks || 1);
                }
            }
        });
        return total;
    }, [currentQuiz]);

    useEffect(() => {
        setCurrentQuestionIndex(0);
        setUserAnswers({});
        setShowResults(false);
        setScore(0);
        setFlaggedQuestions(new Set());
        setIsMobileDrawerOpen(false);
        setQuizNotes({});
        if (quizId) setSelectedCategory(null);
        window.scrollTo(0, 0);
        setTimerActive(false);
        setTimeLeft(0);
        // Reset so the timer re-initialises for each new quiz
        timerStartedRef.current = false;
    }, [quizId]);

    // Track whether the timer has already started for this quiz session
    const timerStartedRef = React.useRef(false);

    // Activate timer once questions are loaded — re-init if durationMinutes changes
    useEffect(() => {
        if (quizId && currentQuiz && !currentQuiz.parts && currentQuiz.questions?.length > 0 && !showResults) {
            const durationSec = currentQuiz.durationMinutes
                ? currentQuiz.durationMinutes * 60
                : currentQuiz.questions.length * 90;

            // Always (re-)set the timer when durationMinutes or question count changes,
            // but only set it once per quiz session after it has already been started
            // (avoids jumping back to full time mid-quiz on unrelated re-renders).
            if (!timerStartedRef.current) {
                timerStartedRef.current = true;
                setTimeLeft(durationSec);
                setTimerActive(true);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quizId, currentQuiz?.questions?.length, currentQuiz?.durationMinutes]);

    // Handle back navigation state to restore selected subject category
    useEffect(() => {
        if (!quizId) {
            if (location.state?.selectedCategoryId) {
                const cat = mergedCategories.find(c => c.id === location.state.selectedCategoryId);
                if (cat) {
                    setSelectedCategory(cat);
                }
            } else {
                setSelectedCategory(null);
            }
        }
    }, [quizId, location.state]);

    // Timer countdown effect
    const normalizeTextAnswer = (value) => {
        if (value == null) return '';
        return value.toString().trim().toLowerCase().replace(/[\u200E\u200F]/g, '').replace(/[.,!?؛:]+$/, '').trim();
    };

    const isTextAnswerCorrect = (userAnswer, correctAnswer, correctAnswers = []) => {
        const normalizedUser = normalizeTextAnswer(userAnswer);
        if (!normalizedUser) return false;
        const normalizedCorrect = normalizeTextAnswer(correctAnswer);
        if (normalizedUser === normalizedCorrect) return true;
        return correctAnswers.some(ans => normalizeTextAnswer(ans) === normalizedUser);
    };

    const isCorrectAnswer = (q, answer) => {
        if (q.type === 'matching') {
            return false;
        }

        if (q.type === 'multi_select') {
            // answer is an array of selected option IDs
            const correct = q.correctAnswers || (q.correctAnswer ? q.correctAnswer.split(',').filter(Boolean) : []);
            const selected = Array.isArray(answer) ? answer : [];
            if (!selected.length || !correct.length) return false;
            // Must match exactly
            return correct.length === selected.length &&
                correct.every(id => selected.includes(id)) &&
                selected.every(id => correct.includes(id));
        }

        if (q.type === 'text' || q.type === 'short_answer' || q.type === 'fill') {
            return isTextAnswerCorrect(answer, q.correctAnswer, q.correctAnswers || q.correctAnswerVariants || []);
        }

        return answer === q.correctAnswer;
    };

    // Calculate Score — defined BEFORE the timer effect that calls it
    const finishQuiz = React.useCallback(async () => {
        let calculatedScore = 0;
        let totalMarks = 0;

        currentQuiz.questions.forEach(q => {
            totalMarks += q.marks || 1;
            if (q.type === 'matching') {
                const subQuestions = q.subQuestions || [];
                // If sub-questions have individual marks, use them; otherwise divide equally
                const hasPerItemMarks = subQuestions.some(s => s.marks !== undefined && s.marks !== null);
                if (hasPerItemMarks) {
                    // totalMarks for this question = sum of sub marks (override the q.marks already added)
                    const subTotal = subQuestions.reduce((acc, s) => acc + (parseFloat(s.marks) || 0), 0);
                    totalMarks += subTotal - (q.marks || 1); // adjust: we already added q.marks above
                    subQuestions.forEach(sub => {
                        const userSubAns = userAnswers[q.id]?.[sub.id];
                        if (userSubAns === sub.correctAnswer) {
                            calculatedScore += (parseFloat(sub.marks) || 0);
                        }
                    });
                } else {
                    const subMarks = (q.marks || 1) / subQuestions.length;
                    subQuestions.forEach(sub => {
                        const userSubAns = userAnswers[q.id]?.[sub.id];
                        if (userSubAns === sub.correctAnswer) {
                            calculatedScore += subMarks;
                        }
                    });
                }
            } else if (q.type === 'multi_select') {
                const correct = q.correctAnswers || (q.correctAnswer ? q.correctAnswer.split(',').filter(Boolean) : []);
                const selected = Array.isArray(userAnswers[q.id]) ? userAnswers[q.id] : [];
                const qMarks = q.marks || 1;
                if (correct.length > 0) {
                    let correctHits = selected.filter(id => correct.includes(id)).length;
                    let wrongHits = selected.filter(id => !correct.includes(id)).length;
                    const perMark = qMarks / correct.length;
                    const earned = Math.max(0, (correctHits - wrongHits) * perMark);
                    calculatedScore += earned;
                }
            } else if (q.type === 'text' || q.type === 'short_answer' || q.type === 'fill') {
                // Essay questions: AI grading — skip for first-pass sync score
            } else {
                if (isCorrectAnswer(q, userAnswers[q.id])) {
                    calculatedScore += q.marks || 1;
                }
            }
        });

        setScore(calculatedScore);
        setShowResults(true);
        setTimerActive(false);
        window.scrollTo(0, 0);

        // AI grade essay/short-answer questions asynchronously
        const essayQs = currentQuiz.questions.filter(q =>
            (q.type === 'text' || q.type === 'short_answer' || q.type === 'fill') &&
            userAnswers[q.id] &&
            String(userAnswers[q.id]).trim()
        );

        if (essayQs.length > 0) {
            setAiGrading(true);
            const results = {};
            let essayScore = 0;
            await Promise.all(essayQs.map(async q => {
                const qText = q.questionAr || q.questionEn || q.question || '';
                const modelAns = q.correctAnswer || '';
                const studentAns = String(userAnswers[q.id] || '');
                const qMarks = q.marks || 1;
                const res = await gradeEssayAnswer(studentAns, modelAns, qText, qMarks);
                results[q.id] = res;
                essayScore += res.earnedMarks || 0;
            }));
            setAiGradingResults(results);
            setScore(prev => +(prev + essayScore).toFixed(2));
            setAiGrading(false);
        }

        // Collect wrong answers for the activity log (max 10 to stay within Firestore doc limits)
        const wrongQuestions = currentQuiz.questions
            .filter(q => {
                if (q.type === 'text' || q.type === 'short_answer' || q.type === 'fill' || q.type === 'matching') return false;
                return !isCorrectAnswer(q, userAnswers[q.id]);
            })
            .slice(0, 10)
            .map(q => ({
                questionText: (q.questionAr || q.questionEn || q.question || '').slice(0, 120),
                correctAnswer: q.correctAnswer || '',
                studentAnswer: userAnswers[q.id] || '',
            }));

        // Log quiz completion to analytics
        logQuizCompletion(
            quizId,
            currentQuiz.titleAr || currentQuiz.title || quizId,
            `${calculatedScore.toFixed(2)}/${totalMarks.toFixed(2)}`,
            {
                courseName: currentSubject ? (currentSubject.titleAr || currentSubject.title || '') : '',
                partTitle: currentQuiz.titleAr || currentQuiz.title || quizId,
                wrongQuestions,
            }
        );

        const passThreshold = currentQuiz.passMark != null
            ? Number(currentQuiz.passMark)
            : totalMarks * 0.5;
        if (calculatedScore >= passThreshold) {
            playSuccessSound();
        }
    }, [currentQuiz, userAnswers]);

    useEffect(() => {
        let interval = null;
        if (timerActive && timeLeft > 0 && !showResults) {
            interval = setInterval(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && timerActive && !showResults) {
            toast.error(
                language === 'ar'
                    ? 'انتهى الوقت! تم إنهاء الاختبار وتصحيح إجاباتك تلقائياً.'
                    : 'Time is up! Your quiz has been automatically submitted.',
                { duration: 5000, icon: '⏰' }
            );
            finishQuiz();
        }
        return () => clearInterval(interval);
    }, [timerActive, timeLeft, showResults, finishQuiz, language]);

    // Ensure page starts from top when changing categories internally
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [selectedCategory]);



    // Handle clearing print mode
    useEffect(() => {
        const handleAfterPrint = () => setPrintMode(null);
        window.addEventListener('afterprint', handleAfterPrint);
        return () => window.removeEventListener('afterprint', handleAfterPrint);
    }, []);

    const handlePrint = (mode) => {
        setPrintMode(mode);
        setTimeout(() => window.print(), 150);
    };

    // Handle Answer Selection
    const handleAnswerSelect = React.useCallback((questionId, answer) => {
        playClickSound();
        triggerHaptic();
        setUserAnswers(prev => ({
            ...prev,
            [questionId]: answer
        }));
    }, []);

    // Keyboard Navigation Effect
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!timerActive || showResults || !currentQuiz) return;

            const question = currentQuiz.questions[currentQuestionIndex];

            // Navigate between questions
            if (e.key === 'ArrowRight' || e.key === 'Enter') {
                setCurrentQuestionIndex(prev => Math.min(currentQuiz.questions.length - 1, prev + 1));
            } else if (e.key === 'ArrowLeft') {
                setCurrentQuestionIndex(prev => Math.max(0, prev - 1));
            }

            // Select answers using numbers 1-4 for MCQ/TF
            if (question && question.type !== 'multi_select' && question.type !== 'text' && question.type !== 'short_answer' && question.type !== 'fill' && question.type !== 'matching') {
                const num = parseInt(e.key);
                if (!isNaN(num) && num > 0) {
                    let optId = null;
                    const opts = question.options && question.options.length >= 2 ? question.options : [
                        { id: 'a' },
                        { id: 'b' }
                    ];
                    if (opts[num - 1]) {
                        optId = opts[num - 1].id;
                    }
                    if (optId) handleAnswerSelect(question.id, optId);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [timerActive, showResults, currentQuiz, currentQuestionIndex, handleAnswerSelect]);

    // finishQuiz is now defined above the timer useEffect that calls it

    // Restart Quiz
    const restartQuiz = () => {
        setUserAnswers({});
        setShowResults(false);
        setCurrentQuestionIndex(0);
        setScore(0);
        setFlaggedQuestions(new Set());
        if (currentQuiz) {
            const durationSec = currentQuiz.durationMinutes
                ? currentQuiz.durationMinutes * 60
                : currentQuiz.questions.length * 90;
            setTimeLeft(durationSec);
            setTimerActive(true);
        }
        window.scrollTo(0, 0);
    };

    // Toggle Flag
    const toggleFlag = (q) => {
        const qId = q.id;
        const willBeFlagged = !flaggedQuestions.has(qId);

        setFlaggedQuestions(prev => {
            const next = new Set(prev);
            if (next.has(qId)) next.delete(qId);
            else next.add(qId);
            return next;
        });

        // If newly flagged, send report to admin
        if (willBeFlagged) {
            const subject = mergedCategories.find(cat =>
                cat.id === quizId || (cat.parts && cat.parts.some(p => p.id === quizId))
            );
            const subName = subject ? (language === 'ar' ? (subject.nameAr || subject.name) : subject.name) : '';
            const currentNote = (quizNotes[qId] || '').trim();

            const reportData = {
                quizId: quizId,
                quizTitle: currentQuiz ? (currentQuiz.titleAr || currentQuiz.title) : '',
                subjectName: subName,
                reportType: 'incorrect_answer',
                questionId: qId,
                questionAr: q.questionAr || '',
                questionEn: q.questionEn || '',
                type: q.type,
                options: q.options || [],
                correctAnswer: q.correctAnswer || '',
                studentNote: currentNote,
            };

            submitQuestionReport(reportData).then(res => {
                if (res.success) {
                    if (res.id) {
                        setReportDocIds(prev => ({ ...prev, [qId]: res.id }));
                    }
                    toast.success(language === 'ar' ? 'تم إرسال بلاغ للمراجع' : 'Report sent for review', {
                        style: {
                            borderRadius: '10px',
                            background: '#333',
                            color: '#fff',
                        },
                        icon: ''
                    });
                }
            });
        }
    };

    // Save or update student note for a question
    const handleSaveNote = async (q, overrideNoteVal) => {
        const qId = q.id;
        const noteText = (overrideNoteVal !== undefined ? overrideNoteVal : (quizNotes[qId] || '')).trim();
        if (!noteText) return;

        const existingReportId = reportDocIds[qId];

        if (existingReportId) {
            // Report already exists -> update studentNote in Firestore
            const res = await updateQuestionReportNote(existingReportId, noteText);
            if (res.success) {
                toast.success(language === 'ar' ? 'تم حفظ وتحديث الملاحظ' : 'Note updated', { icon: '📝' });
            }
        } else {
            // Report not sent yet -> flag the question and send report with studentNote
            setFlaggedQuestions(prev => new Set(prev).add(qId));

            const subject = mergedCategories.find(cat =>
                cat.id === quizId || (cat.parts && cat.parts.some(p => p.id === quizId))
            );
            const subName = subject ? (language === 'ar' ? (subject.nameAr || subject.name) : subject.name) : '';

            const reportData = {
                quizId: quizId,
                quizTitle: currentQuiz ? (currentQuiz.titleAr || currentQuiz.title) : '',
                subjectName: subName,
                reportType: 'incorrect_answer',
                questionId: qId,
                questionAr: q.questionAr || '',
                questionEn: q.questionEn || '',
                type: q.type,
                options: q.options || [],
                correctAnswer: q.correctAnswer || '',
                studentNote: noteText,
            };

            const res = await submitQuestionReport(reportData);
            if (res.success) {
                if (res.id) {
                    setReportDocIds(prev => ({ ...prev, [qId]: res.id }));
                }
                toast.success(language === 'ar' ? 'تم إرسال الملاحظ مع البلاغ' : 'Note sent with report', { icon: '' });
            }
        }
    };

    // If quizId is set but quiz hasn't resolved yet (dbParts still loading) — show spinner
    if (quizId && !currentQuiz && !dbPartsLoaded) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', gap: '1rem' }}>
                <div style={{ width: 52, height: 52, border: '5px solid #e0e0e0', borderTop: '5px solid #9c27b0', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                <p style={{ color: '#9c27b0', fontWeight: 600, fontSize: '1.1rem' }}>
                    {language === 'ar' ? 'جارٍ تحميل الاختبار…' : 'Loading quiz…'}
                </p>
            </div>
        );
    }

    // If viewing a specific quiz
    if (quizId && currentQuiz) {
        // If the quiz serves as a container for sub-parts (like "Chapter Quizzes" -> "Quiz 1, Quiz 2")
        if (currentQuiz.parts && currentQuiz.parts.length > 0) {
            return (
                <div className="quiz-page">
                    <section className="quiz-hero" style={{ backgroundImage: `url(${quizHero})` }}>
                        <div className="hero-overlay"></div>
                        <div className="hero-content">
                            <h1 className="hero-title">{t('quiz.hero.title')}</h1>
                            <p className="hero-subtitle">{t('quiz.hero.subtitle')}</p>
                        </div>
                    </section>

                    <div className="quiz-selection-container">
                        <div className="parts-selection fade-in">
                            <button
                                className="back-btn"
                                onClick={() => {
                                    if (currentSubject) {
                                        navigate('/quiz', { state: { selectedCategoryId: currentSubject.id } });
                                    } else {
                                        navigate('/quiz');
                                    }
                                }}
                            >
                                {language === 'ar' ? '← العود' : '← Back'}
                            </button>
                            <h2 className="selection-title">
                                {language === 'ar' ? (currentQuiz.titleAr || currentQuiz.title) : currentQuiz.title}
                            </h2>
                            <div className="quiz-categories-grid">
                                {currentQuiz.parts.map(part => {
                                    // Identify if the part refers to a valid quiz with questions
                                    const partId = part.id;
                                    const partData = quizData[partId];

                                    // Sum static questions + dynamic questions from DB
                                    const dbQuestionsCount = dbSubjectQuestions.filter(q => q.partId === partId).length;
                                    const staticQuestionsCount = partData?.questions?.length || 0;
                                    const totalQuestionsCount = staticQuestionsCount + dbQuestionsCount;
                                    const hasQuestions = totalQuestionsCount > 0;

                                    return (
                                        <Link
                                            key={part.id}
                                            to={hasQuestions ? `/quiz/${partId}` : '#'}
                                            onClick={(e) => !hasQuestions && e.preventDefault()}
                                            className={`quiz-category-card glass-card ${!hasQuestions ? 'disabled-quiz-card' : ''}`}
                                            style={{ '--category-color': currentQuiz.color }}
                                        >
                                            <div className="category-icon">{part.icon || currentQuiz.icon}</div>
                                            <h3>{language === 'ar' ? part.titleAr : part.title}</h3>
                                            <p>{totalQuestionsCount} {t('quiz.selection.questions')}</p>
                                            <span className="start-btn">
                                                {hasQuestions
                                                    ? t('quiz.selection.start')
                                                    : (language === 'ar' ? 'لم تتوفر بعد' : 'Not available yet')}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // If results shown
        if (showResults) {
            const totalQuestions = currentQuiz.questions.length;
            const percentage = (score / totalQuestions) * 100;

            return (
                <div className="quiz-page-container print-area moodle-quiz-page-container">
                    {/* Confetti celebration when score is >= 50% */}
                    {percentage >= 50 && <Confetti />}

                    {/* Watermark for Print - Top level for repetition */}
                    <div className="print-watermark">
                        <img src={watermarkLogo} alt="Watermark" />
                        <p>COPYRIGHT  MAKANAK PROJECT</p>
                        <p style={{ fontSize: '1rem', marginTop: '0.5rem', opacity: 0.6 }}>KOON BAU - ALL RIGHTS RESERVED</p>
                    </div>

                    {/* Moodle Style Summary & Review */}
                    <div className={`moodle-theme-wrapper ${((currentSubject?.languageMode || (currentQuiz.forceEnglish || quizId === 'comp_skills' ? 'en' : 'both')) === 'en') ? 'force-ltr' : ''}`} dir={((currentSubject?.languageMode || (currentQuiz.forceEnglish || quizId === 'comp_skills' ? 'en' : 'both')) === 'en') ? 'ltr' : ((currentSubject?.languageMode || (currentQuiz.forceEnglish || quizId === 'comp_skills' ? 'en' : 'both')) === 'ar' ? 'rtl' : (language === 'ar' ? 'rtl' : 'ltr'))}>

                        {/* Moodle Top Navbar removed per user request */}

                        {/* Moodle Breadcrumbs */}
                        <div className="moodle-breadcrumbs no-print">
                            <Link to="/quiz" state={{ selectedCategoryId: currentSubject?.id }} className="moodle-breadcrumb-item moodle-breadcrumb-link" style={{ textDecoration: 'none', color: '#0f6cbf' }}>{language === 'ar' ? 'الاختبارات القصيرة' : 'Quizzes'}</Link>
                            {currentSubjectName && currentSubject && currentSubject.id !== quizId && (
                                <>
                                    <span className="moodle-breadcrumb-separator">/</span>
                                    <span
                                        className="moodle-breadcrumb-item"
                                        style={{ color: '#0f6cbf', cursor: 'pointer' }}
                                        onClick={() => navigate('/quiz', { state: { selectedCategoryId: currentSubject.id } })}
                                    >
                                        {currentSubjectName}
                                    </span>
                                </>
                            )}
                            <span className="moodle-breadcrumb-separator">/</span>
                            <span className="moodle-breadcrumb-item">{language === 'ar' ? (currentQuiz.titleAr || currentQuiz.title) : currentQuiz.title}</span>
                        </div>

                        {/* Quiz Title Header */}
                        <div className="moodle-quiz-header">
                            <div className="moodle-quiz-icon-pink">
                                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 11l3 3L22 4"></path>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                </svg>
                            </div>
                            <h1 className="moodle-quiz-title">
                                {language === 'ar' ? (currentQuiz.titleAr || currentQuiz.title) : currentQuiz.title}
                            </h1>
                        </div>

                        {/* Quiz Metadata Description Card */}
                        <div className="moodle-quiz-meta-card no-print">
                            <div className="moodle-meta-row">
                                <span className="moodle-meta-label">{language === 'ar' ? '📅 وقت الفتح:' : '📅 Opened:'}</span>
                                <span className="moodle-meta-value">{language === 'ar' ? 'متاح دائماً' : 'Always available'}</span>
                            </div>
                            <div className="moodle-meta-row">
                                <span className="moodle-meta-label">{language === 'ar' ? '📅 وقت الغلق:' : '📅 Closed:'}</span>
                                <span className="moodle-meta-value">{language === 'ar' ? 'يعتمد على انتهاء المحاولة' : 'Depends on attempt completion'}</span>
                            </div>
                            <hr className="moodle-meta-divider" />
                            <p className="moodle-meta-instruction">
                                {language === 'ar'
                                    ? 'أجب على الأسئلة في دفتر ملاحظاتك وارفع صوراً لإجاباتك.'
                                    : 'Answer the short-answer questions in your notebook and upload a picture of your answers.'}
                            </p>
                        </div>

                        <div className="moodle-quiz-info-list no-print">
                            <p><strong>{language === 'ar' ? 'المحاولات المسموح بها:' : 'Attempts allowed:'}</strong> {language === 'ar' ? 'غير محدود' : 'Unlimited'}</p>
                            <p><strong>{language === 'ar' ? 'الحد الزمني:' : 'Time limit:'}</strong> {currentQuiz.durationMinutes ? currentQuiz.durationMinutes : Math.floor((totalQuestions * 90) / 60)} {language === 'ar' ? 'دقيقة' : 'mins'}</p>
                            <p><strong>{language === 'ar' ? 'درجة النجاح:' : 'Grade to pass:'}</strong> {currentQuiz.passMark != null ? Number(currentQuiz.passMark).toFixed(2) : (quizTotalMarks * 0.5).toFixed(2)} {language === 'ar' ? 'من' : 'out of'} {quizTotalMarks.toFixed(2)}</p>
                        </div>

                        <div className="moodle-results-container">
                            <h2 className="moodle-final-grade">
                                {language === 'ar' ? `علامتك النهائية في هذا الاختبار هي ${score.toFixed(2)}/${quizTotalMarks.toFixed(2)}.` : `Your final grade for this quiz is ${score.toFixed(2)}/${quizTotalMarks.toFixed(2)}.`}
                            </h2>

                            <h3 className="moodle-attempts-title">
                                {language === 'ar' ? 'محاولاتك' : 'Your attempts'}
                            </h3>

                            <table className="moodle-attempts-table">
                                <thead>
                                    <tr>
                                        <th colSpan="2">{language === 'ar' ? 'المحاولة 1' : 'Attempt 1'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="moodle-label">{language === 'ar' ? 'الحالة' : 'Status'}</td>
                                        <td>{language === 'ar' ? 'منتهي' : 'Finished'}</td>
                                    </tr>
                                    <tr>
                                        <td className="moodle-label">{language === 'ar' ? 'بدأ في' : 'Started'}</td>
                                        <td>{new Date(Date.now() - (totalQuestions * 90 * 1000) + (timeLeft * 1000)).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}</td>
                                    </tr>
                                    <tr>
                                        <td className="moodle-label">{language === 'ar' ? 'اكتمل في' : 'Completed'}</td>
                                        <td>{new Date().toLocaleString(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true })}</td>
                                    </tr>
                                    <tr>
                                        <td className="moodle-label">{language === 'ar' ? 'المدة' : 'Duration'}</td>
                                        <td>{Math.floor(((totalQuestions * 90) - timeLeft) / 60)} {language === 'ar' ? 'دقائق' : 'mins'} {((totalQuestions * 90) - timeLeft) % 60} {language === 'ar' ? 'ثواني' : 'secs'}</td>
                                    </tr>
                                    <tr>
                                        <td className="moodle-label">{language === 'ar' ? 'العلامة' : 'Grade'}</td>
                                        <td><strong>{score.toFixed(2)}</strong> {language === 'ar' ? 'من' : 'out of'} {totalQuestions.toFixed(2)} (<strong>{Math.round(percentage)}</strong>%)</td>
                                    </tr>
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan="2" className="moodle-review-link">
                                            <a href="#quiz-review-section" onClick={(e) => { e.preventDefault(); document.getElementById('quiz-review-section').scrollIntoView({ behavior: 'smooth' }); }}>{language === 'ar' ? 'مراجعة' : 'Review'}</a>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div className="moodle-back-btn-container" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: language === 'ar' ? 'flex-end' : 'flex-start', marginTop: '1.5rem' }}>
                                <button
                                    onClick={() => {
                                        if (currentSubject) {
                                            navigate('/quiz', { state: { selectedCategoryId: currentSubject.id } });
                                        } else {
                                            navigate('/quiz');
                                        }
                                    }}
                                    className="moodle-back-btn"
                                >
                                    {language === 'ar' ? 'العودة إلى المقرر الدراسي' : 'Back to the course'}
                                </button>
                                <button onClick={restartQuiz} className="moodle-back-btn" style={{ backgroundColor: '#0f6cbf', color: 'white', borderColor: '#0a4a84' }}>
                                    🔄 {language === 'ar' ? 'إعادة الاختبار' : 'Restart Quiz'}
                                </button>
                                <button onClick={() => handlePrint('student')} className="moodle-back-btn" style={{ backgroundColor: '#f8f9fa' }}>
                                    🖨️ {language === 'ar' ? 'طباعة إجاباتي' : 'Print my answers'}
                                </button>
                                <button onClick={() => handlePrint('model')} className="moodle-back-btn" style={{ backgroundColor: '#e7f3f5', borderColor: '#c8e1e5', color: '#0f6cbf' }}>
                                    🖨️ {language === 'ar' ? 'طباعة الإجابات النموذجية' : 'Print model answers'}
                                </button>
                            </div>
                        </div>

                        {/* ── Smart Performance Analysis Card ── */}
                        {(() => {
                            const correct = score;
                            const wrong = Object.keys(userAnswers).filter(qid => {
                                const q = currentQuiz.questions.find(x => x.id === qid);
                                return q && userAnswers[qid] !== undefined && userAnswers[qid] !== q.correctAnswer;
                            }).length;
                            const skipped = totalQuestions - Object.keys(userAnswers).length;
                            const pct = Math.round(percentage);
                            const msgAr = pct >= 90 ? '🏆 ممتاز! أداء رائع جداً — استمر بهذا المستوى!'
                                : pct >= 75 ? '🌟 جيد جداً! أنت على المسار الصحيح.'
                                    : pct >= 50 ? '💪 جيد! قليل من المراجعة وسوف تصل للقمة.'
                                        : '📚 لا تستسلم! راجع الأسئلة الخاطئة وحاول مجدداً.';
                            const msgEn = pct >= 90 ? '🏆 Excellent! Outstanding performance — keep it up!'
                                : pct >= 75 ? '🌟 Very Good! You are on the right track.'
                                    : pct >= 50 ? "💪 Good! A bit more review and you'll reach the top."
                                        : '📚 Keep going! Review the wrong answers and try again.';
                            const barColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#e02b20';
                            return (
                                <div className="no-print" style={{ margin: '1.5rem 0', padding: '20px 24px', borderRadius: '14px', background: 'linear-gradient(135deg,rgba(156,39,176,0.06),rgba(233,30,99,0.04))', border: '1px solid rgba(156,39,176,0.15)' }}>
                                    <h4 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: '16px' }}>
                                        📊 {language === 'ar' ? 'تحليل أدائك' : 'Performance Analysis'}
                                    </h4>
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px', opacity: 0.7 }}>
                                            <span>{language === 'ar' ? 'النتيجة الإجمالية' : 'Overall Score'}</span>
                                            <span style={{ color: barColor, fontWeight: 900 }}>{pct}%</span>
                                        </div>
                                        <div style={{ height: '10px', borderRadius: '50px', background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: '50px', background: `linear-gradient(90deg,${barColor},${barColor}cc)`, transition: 'width 0.8s ease', boxShadow: `0 0 10px ${barColor}66` }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
                                        {[
                                            { label: language === 'ar' ? '✅ صحيح' : '✅ Correct', val: correct, color: '#10b981', bg: 'rgba(16,185,129,0.08)' },
                                            { label: language === 'ar' ? '❌ خاطئ' : '❌ Wrong', val: wrong, color: '#e02b20', bg: 'rgba(224,43,32,0.08)' },
                                            { label: language === 'ar' ? '⏭️ متروك' : '⏭️ Skipped', val: skipped, color: '#9ca3af', bg: 'rgba(156,163,175,0.08)' },
                                        ].map((s, i) => (
                                            <div key={i} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: '10px', background: s.bg, border: `1px solid ${s.color}22` }}>
                                                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color }}>{s.val}</div>
                                                <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.7, marginTop: '2px' }}>{s.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ padding: '10px 14px', borderRadius: '10px', background: `${barColor}11`, border: `1px solid ${barColor}33`, fontSize: '0.88rem', fontWeight: 700, color: barColor }}>
                                        {language === 'ar' ? msgAr : msgEn}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Moodle Review Layout */}
                        <div id="quiz-review-section" className="moodle-review-section">
                            <div className="moodle-review-layout">
                                {/* Left Content (Questions) */}
                                <div className="moodle-questions-column">
                                    {currentQuiz.questions.map((q, idx) => {
                                        const originalUserAnswer = userAnswers[q.id];
                                        let effectiveUserAnswer = originalUserAnswer;

                                        if (printMode === 'model') {
                                            if (q.type === 'matching') {
                                                const matchingCorrect = {};
                                                (q.subQuestions || []).forEach(sub => {
                                                    matchingCorrect[sub.id] = sub.correctAnswer;
                                                });
                                                effectiveUserAnswer = matchingCorrect;
                                            } else {
                                                effectiveUserAnswer = q.correctAnswer;
                                            }
                                        }

                                        const userAnswer = effectiveUserAnswer;

                                        let isCorrect = false;
                                        let earnedMarks = 0;
                                        let statusText = '';

                                        if (q.type === 'matching') {
                                            const subQuestions = q.subQuestions || [];
                                            let correctCount = 0;
                                            subQuestions.forEach(sub => {
                                                if (userAnswer?.[sub.id] === sub.correctAnswer) correctCount++;
                                            });
                                            isCorrect = correctCount === subQuestions.length;
                                            earnedMarks = (correctCount / (subQuestions.length || 1)) * (q.marks || 1.00);
                                            statusText = isCorrect
                                                ? (language === 'ar' ? 'صحيح' : 'Correct')
                                                : correctCount > 0
                                                    ? (language === 'ar' ? 'صحيح جزئياً' : 'Partially correct')
                                                    : (language === 'ar' ? 'غير صحيح' : 'Incorrect');
                                        } else if (q.type === 'multi_select') {
                                            const correct = q.correctAnswers || (q.correctAnswer ? q.correctAnswer.split(',').filter(Boolean) : []);
                                            const selected = Array.isArray(userAnswer) ? userAnswer : [];
                                            const qMarks = q.marks || 1;
                                            let earned = 0;
                                            if (correct.length > 0) {
                                                let correctHits = selected.filter(id => correct.includes(id)).length;
                                                let wrongHits = selected.filter(id => !correct.includes(id)).length;
                                                const perMark = qMarks / correct.length;
                                                earned = Math.max(0, (correctHits - wrongHits) * perMark);
                                            }
                                            earnedMarks = earned;
                                            isCorrect = earned === qMarks;
                                            statusText = earned === qMarks
                                                ? (language === 'ar' ? 'صحيح' : 'Correct')
                                                : earned > 0
                                                    ? (language === 'ar' ? 'صحيح جزئياً' : 'Partially correct')
                                                    : (language === 'ar' ? 'غير صحيح' : 'Incorrect');
                                        } else if (q.type === 'text' || q.type === 'short_answer' || q.type === 'fill') {
                                            if (aiGradingResults[q.id]) {
                                                const aiRes = aiGradingResults[q.id];
                                                earnedMarks = aiRes.earnedMarks || 0;
                                                isCorrect = aiRes.score >= 0.7;
                                                statusText = aiRes.score >= 0.9
                                                    ? (language === 'ar' ? 'صحيح ✅' : 'Correct ✅')
                                                    : aiRes.score >= 0.7
                                                        ? (language === 'ar' ? 'صحيح (فكر متقارب) ✅' : 'Close Concept Match ✅')
                                                        : aiRes.score > 0
                                                            ? (language === 'ar' ? 'صحيح جزئياً 💡' : 'Partially correct 💡')
                                                            : (language === 'ar' ? 'غير صحيح ❌' : 'Incorrect ❌');
                                            } else if (aiGrading) {
                                                isCorrect = false;
                                                earnedMarks = 0;
                                                statusText = language === 'ar' ? 'جاري التقييم... ⏳' : 'Evaluating... ⏳';
                                            } else {
                                                isCorrect = isCorrectAnswer(q, userAnswer);
                                                earnedMarks = isCorrect ? (q.marks || 1.00) : 0;
                                                statusText = isCorrect ? (language === 'ar' ? 'صحيح ✅' : 'Correct ✅') : (language === 'ar' ? 'غير صحيح ❌' : 'Incorrect ❌');
                                            }
                                        } else {
                                            isCorrect = isCorrectAnswer(q, userAnswer);
                                            earnedMarks = isCorrect ? (q.marks || 1.00) : 0;
                                            statusText = isCorrect ? (language === 'ar' ? 'صحيح' : 'Correct') : (language === 'ar' ? 'غير صحيح' : 'Incorrect');
                                        }

                                        const subjectLangMode = currentSubject?.languageMode || (currentQuiz.forceEnglish || quizId === 'comp_skills' ? 'en' : 'both');
                                        const displayLang = subjectLangMode === 'en' ? 'en' : subjectLangMode === 'ar' ? 'ar' : language;

                                        return (
                                            <div key={q.id} className="moodle-question-block" id={`question-${idx + 1}`}>
                                                <div className="moodle-q-info-box">
                                                    <div className="moodle-q-num"><strong>{language === 'ar' ? 'سؤال ' : 'Question '} {idx + 1}</strong></div>
                                                    <div className="moodle-q-status">{statusText}</div>
                                                    <div className="moodle-q-mark">{language === 'ar' ? `العلامة ${earnedMarks.toFixed(2)} من ${(q.marks || 1.00).toFixed(2)}` : `Mark ${earnedMarks.toFixed(2)} out of ${(q.marks || 1.00).toFixed(2)}`}</div>
                                                    <div className="moodle-q-flag">
                                                        <span className="flag-icon">⚑</span> {language === 'ar' ? 'تعليم السؤال' : 'Flag question'}
                                                    </div>
                                                </div>

                                                <div className="moodle-q-content-box">
                                                    <div className={`moodle-q-text-area ${displayLang === 'en' ? 'force-ltr' : ''}`}>
                                                        {q.codeBlock && <CodeBlock code={q.codeBlock} />}
                                                        <div className="moodle-q-text-main">
                                                            {renderTextWithCode(displayLang === 'ar' ? (q.questionAr || q.questionEn) : q.questionEn)}
                                                        </div>

                                                        {(q.image || q.image2) && (
                                                            <div className="question-images-grid" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', margin: '1rem 0' }}>
                                                                {q.image && (
                                                                    <div className="question-image-container" style={{ flex: '1 1 auto', maxWidth: '450px', textAlign: 'center', margin: 0 }}>
                                                                        <img
                                                                            src={q.image}
                                                                            alt="Question Illustration 1"
                                                                            style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                                                        />
                                                                    </div>
                                                                )}
                                                                {q.image2 && (
                                                                    <div className="question-image-container" style={{ flex: '1 1 auto', maxWidth: '450px', textAlign: 'center', margin: 0 }}>
                                                                        <img
                                                                            src={q.image2}
                                                                            alt="Question Illustration 2"
                                                                            style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {q.questionEnPartB && (
                                                            <div className="moodle-q-text-main" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                                                                {renderTextWithCode(displayLang === 'ar' ? q.questionArPartB : q.questionEnPartB)}
                                                            </div>
                                                        )}

                                                        {q.tableData && (
                                                            <div className="question-table-container" style={{ margin: '1.5rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                {q.tableData.title && (
                                                                    <h3 style={{ marginBottom: '0.5rem', alignSelf: 'flex-start', marginLeft: '10%' }}>{q.tableData.title}</h3>
                                                                )}
                                                                <table style={{
                                                                    borderCollapse: 'collapse',
                                                                    backgroundColor: '#f8f9fa',
                                                                    color: '#333',
                                                                    borderRadius: '8px',
                                                                    overflow: 'hidden',
                                                                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                                    minWidth: '200px'
                                                                }}>
                                                                    <thead>
                                                                        <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #ced4da' }}>
                                                                            {q.tableData.headers.map((header, idx) => (
                                                                                <th key={idx} style={{ padding: '0.75rem 1.5rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{header}</th>
                                                                            ))}
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {q.tableData.rows.map((row, rIdx) => (
                                                                            <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#fff' : '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
                                                                                {row.map((cell, cIdx) => (
                                                                                    <td key={cIdx} style={{ padding: '0.75rem 1.5rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{cell}</td>
                                                                                ))}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}

                                                        {q.multiTables && (
                                                            <div className="question-multi-tables-container" style={{ margin: '1.5rem 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem' }}>
                                                                {q.multiTables.map((tbl, tIdx) => (
                                                                    <div key={tIdx} className="single-table-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                                        {tbl.title && (
                                                                            <h3 style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>{tbl.title}</h3>
                                                                        )}
                                                                        <table style={{
                                                                            borderCollapse: 'collapse',
                                                                            backgroundColor: '#f8f9fa',
                                                                            color: '#333',
                                                                            borderRadius: '8px',
                                                                            overflow: 'hidden',
                                                                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                                            minWidth: '150px'
                                                                        }}>
                                                                            <thead>
                                                                                <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #ced4da' }}>
                                                                                    {tbl.headers.map((header, idx) => (
                                                                                        <th key={idx} style={{ padding: '0.5rem 1rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{header}</th>
                                                                                    ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {tbl.rows.map((row, rIdx) => (
                                                                                    <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#fff' : '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
                                                                                        {row.map((cell, cIdx) => (
                                                                                            <td key={cIdx} style={{ padding: '0.5rem 1rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{cell}</td>
                                                                                        ))}
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* User Answer Display */}
                                                        <div className="moodle-q-options-display">
                                                            {q.type === 'multi_select' && (() => {
                                                                const correct = q.correctAnswers || (q.correctAnswer ? q.correctAnswer.split(',').filter(Boolean) : []);
                                                                const selected = Array.isArray(userAnswer) ? userAnswer : [];
                                                                return (q.options || []).map((o, oIdx) => {
                                                                    const isSelected = selected.includes(o.id);
                                                                    const isCorrectOption = correct.includes(o.id);
                                                                    const labelClass = isSelected && isCorrectOption ? 'moodle-correct-text'
                                                                        : isSelected && !isCorrectOption ? 'moodle-wrong-text'
                                                                            : !isSelected && isCorrectOption ? 'moodle-correct-text'
                                                                                : '';
                                                                    return (
                                                                        <div key={o.id} className="moodle-radio-display">
                                                                            <input type="checkbox" checked={isSelected} readOnly style={{ accentColor: '#6366f1' }} />
                                                                            <label className={labelClass}>
                                                                                <span className="moodle-option-letter">{(() => {
                                                                                    const txt = displayLang === 'ar' ? (o.textAr || o.textEn) : (o.textEn || o.textAr);
                                                                                    if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                                                                                    return String(oIdx + 1);
                                                                                })()}</span>{' '}
                                                                                {renderTextWithCode(displayLang === 'ar' ? (o.textAr || o.textEn) : (o.textEn || o.textAr))}
                                                                                {!isSelected && isCorrectOption && <span style={{ marginRight: '0.4rem', color: '#22c55e', fontSize: '0.78rem' }}> ← {displayLang === 'ar' ? 'صحيح' : 'correct'}</span>}
                                                                            </label>
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                            {q.type === 'mcq' && q.options.map((o, oIdx) => {
                                                                const letter = String.fromCharCode(97 + oIdx); // a, b, c, d
                                                                const isSelected = userAnswer === o.id;
                                                                const isOptionCorrect = o.id === q.correctAnswer;
                                                                return (
                                                                    <div key={o.id} className="moodle-radio-display">
                                                                        <input type="radio" checked={isSelected} readOnly />
                                                                        <label className={isSelected && isOptionCorrect ? 'moodle-correct-text' : (isSelected ? 'moodle-wrong-text' : '')}>
                                                                            <span className="moodle-option-letter">{(() => {
                                                                                const txt = displayLang === 'ar' ? (o.textAr || o.textEn) : (o.textEn || o.textAr);
                                                                                if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                                                                                return String(oIdx + 1);
                                                                            })()}</span>{' '}
                                                                            {o.tableData ? (
                                                                                <div className="option-table-wrapper" style={{ display: 'inline-block', verticalAlign: 'middle', overflowX: 'auto' }}>
                                                                                    <table className="question-interactive-table opt-table">
                                                                                        <thead>
                                                                                            <tr>
                                                                                                {o.tableData.headers.map((h, i) => (
                                                                                                    <th key={i}>{h}</th>
                                                                                                ))}
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {o.tableData.rows.map((r, i) => (
                                                                                                <tr key={i}>
                                                                                                    {r.map((c, j) => (
                                                                                                        <td key={j}>{c}</td>
                                                                                                    ))}
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            ) : (
                                                                                <div className="moodle-option-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                                                                                    {o.image && (
                                                                                        <div className="moodle-option-image-wrapper" style={{ margin: '0.3rem 0' }}>
                                                                                            <img src={o.image} alt="Option Choice" className="moodle-option-image" style={{ maxHeight: '150px', maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                                                                                        </div>
                                                                                    )}
                                                                                    {renderTextWithCode(displayLang === 'ar' ? (o.textAr || o.textEn) : o.textEn)}
                                                                                </div>
                                                                            )}
                                                                            {isSelected && isCorrect && <span className="moodle-check-icon"> ✔</span>}
                                                                            {isSelected && !isCorrect && <span className="moodle-cross-icon"> ❌</span>}
                                                                            {!isSelected && isOptionCorrect && <span className="moodle-check-icon"> (✔)</span>}
                                                                        </label>
                                                                    </div>
                                                                );
                                                            })}

                                                            {(q.type === 'tf' || q.type === 'true_false') && (
                                                                (q.options && q.options.length >= 2 ? q.options : [
                                                                    { id: 'a', textAr: 'صح', textEn: 'True' },
                                                                    { id: 'b', textAr: 'خطأ', textEn: 'False' }
                                                                ]).map((opt, oIdx) => {
                                                                    const letter = String.fromCharCode(97 + oIdx); // a, b
                                                                    const isSelected = userAnswer === opt.id;
                                                                    const isOptionCorrect = opt.id === q.correctAnswer;
                                                                    const text = displayLang === 'ar' ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr);
                                                                    return (
                                                                        <div key={opt.id} className="moodle-radio-display">
                                                                            <input type="radio" checked={isSelected} readOnly />
                                                                            <label className={isSelected && isOptionCorrect ? 'moodle-correct-text' : (isSelected ? 'moodle-wrong-text' : '')}>
                                                                                <span className="moodle-option-letter">{(() => {
                                                                                    const txt = displayLang === 'ar' ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr);
                                                                                    if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                                                                                    return String(oIdx + 1);
                                                                                })()}</span>{' '}
                                                                                {renderTextWithCode(text)}
                                                                                {isSelected && isCorrect && <span className="moodle-check-icon"> ✔</span>}
                                                                                {isSelected && !isCorrect && <span className="moodle-cross-icon"> ❌</span>}
                                                                                {!isSelected && isOptionCorrect && <span className="moodle-check-icon"> (✔)</span>}
                                                                            </label>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}

                                                            {q.type === 'matching' && (q.subQuestions || []).map((sub, sIdx) => {
                                                                const userSubAns = userAnswer?.[sub.id];
                                                                const isSubCorrect = userSubAns === sub.correctAnswer;
                                                                const correctOptText = q.options.find(o => o.id === sub.correctAnswer)?.textEn || q.options.find(o => o.id === sub.correctAnswer)?.textAr || sub.correctAnswer;
                                                                const userOptText = q.options.find(o => o.id === userSubAns)?.textEn || q.options.find(o => o.id === userSubAns)?.textAr || userSubAns || (language === 'ar' ? 'لم يتم الاختيار' : 'Not chosen');

                                                                return (
                                                                    <div key={sub.id} className="moodle-matching-review-row" style={{ display: 'flex', gap: '1rem', margin: '0.5rem 0', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontWeight: 'bold' }}>{sIdx + 1}. {renderTextWithCode(displayLang === 'ar' ? sub.textAr : sub.textEn)}</span>
                                                                        <span style={{ margin: '0 10px' }}>➔</span>
                                                                        <span className={isSubCorrect ? 'moodle-correct-text' : 'moodle-wrong-text'} style={{ padding: '2px 8px', borderRadius: '4px', background: isSubCorrect ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)', color: isSubCorrect ? '#28a745' : '#dc3545' }}>
                                                                            {userOptText}
                                                                            {isSubCorrect ? ' ✔' : ` ❌ (${language === 'ar' ? 'الإجابة الصحيحةة هي' : 'Correct is'}: ${correctOptText})`}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {(q.type === 'text' || q.type === 'short_answer' || q.type === 'fill') && (
                                                                <div className="moodle-essay-review-wrapper" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                                    <div style={{ padding: '0.85rem 1.2rem', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}>
                                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                                                                            {language === 'ar' ? 'إجابتك المكتوبة:' : 'Your written response:'}
                                                                        </span>
                                                                        <div style={{ fontSize: '1rem', fontStyle: 'italic', color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                                                                            {userAnswer || (language === 'ar' ? 'لم يتم كتابة إجابة' : 'No answer provided')}
                                                                        </div>
                                                                    </div>
                                                                    {aiGradingResults[q.id] && (
                                                                        <div style={{ padding: '0.85rem 1.2rem', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.05)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                <span style={{ fontWeight: 'bold', color: '#a78bfa', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                                                    🤖 {language === 'ar' ? 'تقييم نشمي الذكي:' : 'Nashmi AI Assessment:'}
                                                                                </span>
                                                                                <span style={{ fontWeight: 'bold', color: '#10b981', fontSize: '0.95rem' }}>
                                                                                    {aiGradingResults[q.id].earnedMarks} / {(q.marks || 1).toFixed(2)} {language === 'ar' ? 'علامة' : 'marks'}
                                                                                </span>
                                                                            </div>
                                                                            <p style={{ margin: 0, fontSize: '0.88rem', color: '#d1d5db', lineHeight: '1.4' }}>
                                                                                {language === 'ar' ? aiGradingResults[q.id].feedback : aiGradingResults[q.id].feedbackEn}
                                                                            </p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="moodle-q-feedback-box">
                                                        <div className="feedback-answer-state">
                                                            {q.type === 'text' || q.type === 'short_answer' || q.type === 'fill' ? (
                                                                aiGradingResults[q.id] ? (
                                                                    aiGradingResults[q.id].score === 1
                                                                        ? (language === 'ar' ? 'إجابتك صحيحة تماماً.' : 'Your answer is fully correct.')
                                                                        : aiGradingResults[q.id].score > 0
                                                                            ? (language === 'ar' ? 'إجابتك صحيحة جزئياً.' : 'Your answer is partially correct.')
                                                                            : (language === 'ar' ? 'إجابتك غير صحيحة.' : 'Your answer is incorrect.')
                                                                ) : (
                                                                    language === 'ar' ? 'بانتظار تقييم نشمي...' : 'Waiting for Nashmi assessment...'
                                                                )
                                                            ) : (
                                                                (language === 'ar' ? 'إجابتك ' : 'Your answer is ') + (isCorrect ? (language === 'ar' ? 'صحيحة.' : 'correct.') : (language === 'ar' ? 'غير صحيحة.' : 'incorrect.'))
                                                            )}
                                                        </div>
                                                        <div className="feedback-correct-answer">
                                                            {language === 'ar' ? 'الإجابة النموذجية هي: ' : 'The correct answer is: '}
                                                            {q.type === 'mcq' ? (() => {
                                                                const correctOpt = q.options.find(o => o.id === q.correctAnswer);
                                                                if (!correctOpt) return null;
                                                                return (
                                                                    <div className="moodle-option-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', verticalAlign: 'middle' }}>
                                                                        {correctOpt.image && (
                                                                            <div className="moodle-option-image-wrapper" style={{ margin: '0.3rem 0' }}>
                                                                                <img src={correctOpt.image} alt="Correct Choice" className="moodle-option-image" style={{ maxHeight: '100px', maxWidth: '100%', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }} />
                                                                            </div>
                                                                        )}
                                                                        {renderTextWithCode(displayLang === 'ar' ? (correctOpt.textAr || correctOpt.textEn) : correctOpt.textEn)}
                                                                    </div>
                                                                );
                                                            })() : q.type === 'multi_select' ? (() => {
                                                                const correctIds = q.correctAnswers || (q.correctAnswer ? (Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer.split(',').filter(Boolean)) : []);
                                                                const correctOpts = (q.options || []).filter(o => correctIds.includes(o.id));
                                                                if (correctOpts.length === 0) return language === 'ar' ? 'موضح أعلاه' : 'Indicated above';
                                                                return (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.3rem' }}>
                                                                        {correctOpts.map(opt => (
                                                                            <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                <span style={{ color: '#22c55e' }}>✓</span>
                                                                                {renderTextWithCode(displayLang === 'ar' ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr))}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                );
                                                            })() : q.type === 'matching'
                                                                ? (language === 'ar' ? 'موضح باللون الأخضر أعلاه' : 'indicated in green above')
                                                                : q.type === 'text' || q.type === 'short_answer' || q.type === 'fill'
                                                                    ? (q.correctAnswer || (language === 'ar' ? 'لا توجد إجابة نموذجية محددة' : 'No model answer defined'))
                                                                    : ((q.correctAnswer === 'a' || q.correctAnswer === true) ? (displayLang === 'ar' ? 'صح' : 'True') : (displayLang === 'ar' ? 'خطأ' : 'False'))}
                                                        </div>
                                                        {(q.explanation || q.explanationAr) && (
                                                            <div className="explanation" style={{ marginTop: '1rem', borderLeft: language === 'en' ? '4px solid #FFC107' : 'none', borderRight: language === 'ar' ? '4px solid #FFC107' : 'none' }}>
                                                                <strong>{language === 'ar' ? 'التعليل: ' : 'Explanation: '}</strong>
                                                                {renderTextWithCode(displayLang === 'ar' ? (q.explanationAr || q.explanation) : (q.explanation || q.explanationAr))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Right Content (Quiz Navigation Sidebar) */}
                                <div className="moodle-nav-column">
                                    <div className="moodle-nav-block">
                                        <div className="moodle-close-drawer-row">
                                            <button className="moodle-close-drawer-btn" style={{ visibility: 'hidden' }}>✕</button>
                                            <span>{language === 'ar' ? 'إغلاق قائمة التصفح' : 'Close block drawer'}</span>
                                        </div>
                                        <h3 className="moodle-nav-title">{language === 'ar' ? 'التنقل عبر الاختبار' : 'Quiz navigation'}</h3>
                                        <div className="moodle-nav-grid">
                                            {currentQuiz.questions.map((q, idx) => {
                                                const originalUserAnswer = userAnswers[q.id];
                                                let effectiveUserAnswer = originalUserAnswer;

                                                if (printMode === 'model') {
                                                    if (q.type === 'matching') {
                                                        const matchingCorrect = {};
                                                        (q.subQuestions || []).forEach(sub => {
                                                            matchingCorrect[sub.id] = sub.correctAnswer;
                                                        });
                                                        effectiveUserAnswer = matchingCorrect;
                                                    } else {
                                                        effectiveUserAnswer = q.correctAnswer;
                                                    }
                                                }

                                                const userAnswer = effectiveUserAnswer;

                                                let isCorrect = false;
                                                if (q.type === 'matching') {
                                                    const subQuestions = q.subQuestions || [];
                                                    let correctCount = 0;
                                                    subQuestions.forEach(sub => {
                                                        if (userAnswer?.[sub.id] === sub.correctAnswer) correctCount++;
                                                    });
                                                    isCorrect = correctCount === subQuestions.length;
                                                } else if (q.type === 'multi_select') {
                                                    const correct = q.correctAnswers || (q.correctAnswer ? (Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer.split(',').filter(Boolean)) : []);
                                                    const selected = Array.isArray(userAnswer) ? userAnswer : [];
                                                    const qMarks = q.marks || 1;
                                                    let earned = 0;
                                                    if (correct.length > 0) {
                                                        let correctHits = selected.filter(id => correct.includes(id)).length;
                                                        let wrongHits = selected.filter(id => !correct.includes(id)).length;
                                                        const perMark = qMarks / correct.length;
                                                        earned = Math.max(0, (correctHits - wrongHits) * perMark);
                                                    }
                                                    isCorrect = earned === qMarks;
                                                } else if (q.type === 'text' || q.type === 'short_answer' || q.type === 'fill') {
                                                    if (aiGradingResults[q.id]) {
                                                        isCorrect = aiGradingResults[q.id].score === 1;
                                                    } else {
                                                        isCorrect = isCorrectAnswer(q, userAnswer);
                                                    }
                                                } else {
                                                    isCorrect = isCorrectAnswer(q, userAnswer);
                                                }
                                                const isFlagged = flaggedQuestions.has(q.id);

                                                return (
                                                    <a
                                                        href={`#question-${idx + 1}`}
                                                        key={q.id}
                                                        className={`moodle-nav-item-review ${isCorrect ? 'correct' : 'wrong'}`}
                                                    >
                                                        <span className="nav-num">{idx + 1}</span>
                                                        {isCorrect ? (
                                                            <span className="nav-status-badge correct">✔</span>
                                                        ) : (
                                                            <>
                                                                <span className="nav-status-badge wrong">✘</span>
                                                                <span className="nav-corner-tag"></span>
                                                            </>
                                                        )}
                                                        {isFlagged && <span className="nav-flag-indicator-review"></span>}
                                                    </a>
                                                );
                                            })}
                                        </div>
                                        <div className="moodle-nav-links">
                                            <a href="#show-one" onClick={(e) => e.preventDefault()}>{language === 'ar' ? 'إظهار صفحة واحدة في كل مرة' : 'Show one page at a time'}</a>
                                            <a href="#finish-review" onClick={(e) => { e.preventDefault(); window.scrollTo(0, 0); }}>{language === 'ar' ? 'إنهاء المراجعة' : 'Finish review'}</a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        const question = currentQuiz.questions[currentQuestionIndex];
        const subjectLangMode = currentSubject?.languageMode || (currentQuiz.forceEnglish || quizId === 'comp_skills' ? 'en' : 'both');
        const isEnglishContent = subjectLangMode === 'en';
        const isArabicContent = subjectLangMode === 'ar';
        const displayLang = isEnglishContent ? 'en' : isArabicContent ? 'ar' : language;

        // Guard: questions may not be loaded yet (Firebase async)
        if (!question) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
                    <div className="loading-spinner" style={{ width: 48, height: 48, border: '4px solid #e0e0e0', borderTop: '4px solid #9c27b0', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
                    <p style={{ color: '#9c27b0', fontWeight: 600, fontSize: '1.1rem' }}>
                        {language === 'ar' ? 'جارٍ تحميل الأسئلة…' : 'Loading questions…'}
                    </p>
                </div>
            );
        }

        // Helper to format remaining time
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        };

        return (
            <div className="moodle-theme-wrapper active-quiz-mode" dir={(subjectLangMode === 'en') ? 'ltr' : (subjectLangMode === 'ar' ? 'rtl' : (language === 'ar' ? 'rtl' : 'ltr'))}>
                {/* Moodle Top Navbar removed per user request */}

                {/* Moodle Breadcrumbs */}
                <div className="moodle-breadcrumbs no-print">
                    <Link to="/quiz" state={{ selectedCategoryId: currentSubject?.id }} className="moodle-breadcrumb-item moodle-breadcrumb-link" style={{ textDecoration: 'none', color: '#0f6cbf' }}>{language === 'ar' ? 'الاختبارات القصير' : 'Quizzes'}</Link>
                    {currentSubjectName && currentSubject && currentSubject.id !== quizId && (
                        <>
                            <span className="moodle-breadcrumb-separator">/</span>
                            <span
                                className="moodle-breadcrumb-item"
                                style={{ color: '#0f6cbf', cursor: 'pointer' }}
                                onClick={() => navigate('/quiz', { state: { selectedCategoryId: currentSubject.id } })}
                            >
                                {currentSubjectName}
                            </span>
                        </>
                    )}
                    <span className="moodle-breadcrumb-separator">/</span>
                    <span className="moodle-breadcrumb-item">{language === 'ar' ? (currentQuiz.titleAr || currentQuiz.title) : currentQuiz.title}</span>
                </div>

                {/* Moodle Quiz Header */}
                <div className="moodle-quiz-header">
                    <div className="moodle-quiz-icon-pink">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 11l3 3L22 4"></path>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                        </svg>
                    </div>
                    <h1 className="moodle-quiz-title">
                        {language === 'ar' ? (currentQuiz.titleAr || currentQuiz.title) : currentQuiz.title}
                    </h1>
                </div>

                <div className="moodle-review-layout">
                    {/* Main Quiz Content */}
                    <div className="moodle-questions-column">
                        {/* AI Note Banner - only shown when noteAr is set on the quiz */}
                        {currentQuiz.noteAr && (
                            <div className="quiz-instructional-banner fade-in no-print" style={{
                                background: 'linear-gradient(135deg, rgba(244,67,54,0.12), rgba(255,152,0,0.10))',
                                borderLeft: '4px solid #F44336',
                                borderRadius: '10px',
                                marginBottom: '0.75rem'
                            }}>
                                <div className="banner-icon">🤖</div>
                                <div className="banner-text" style={{ fontWeight: 600, color: 'var(--text-primary, #333)' }}>
                                    {currentQuiz.noteAr}
                                </div>
                            </div>
                        )}

                        {/* ── Quiz Progress Bar ── */}
                        {(() => {
                            const total = currentQuiz.questions.length;
                            const answered = Object.keys(userAnswers).length;
                            const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
                            return (
                                <div className="quiz-top-progress-wrap no-print">
                                    <div className="quiz-top-progress-meta">
                                        <span>
                                            {language === 'ar'
                                                ? `${answered} من ${total} سؤال`
                                                : `${answered} of ${total} answered`}
                                        </span>
                                        <span className="quiz-top-progress-pct">{pct}%</span>
                                    </div>
                                    <div className="quiz-top-progress-track">
                                        <div
                                            className="quiz-top-progress-fill"
                                            style={{ width: `${pct}%` }}
                                        />
                                        {/* Current question marker */}
                                        <div
                                            className="quiz-top-progress-cursor"
                                            style={{ left: `${total > 1 ? (currentQuestionIndex / (total - 1)) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Instructional Notice Banner */}
                        <div className="quiz-instructional-banner fade-in no-print">
                            <div className="banner-icon">💡</div>
                            <div className="banner-text">
                                {language === 'ar'
                                    ? 'عند مواجهتك سؤالاً تعتقد أن به خطأً، يرجى تعليم السؤال لنقوم بمراجعته.'
                                    : 'If you encounter a question you believe has an error, please "Flag" it for immediate review.'}
                            </div>
                        </div>


                        <div className="moodle-question-block" id={`question-${currentQuestionIndex + 1}`}>
                            {/* Left Info Box (Moodle Style) */}
                            <div className="moodle-q-info-box">
                                <div className="moodle-q-num">
                                    <strong>{language === 'ar' ? 'سؤال' : 'Question'} {currentQuestionIndex + 1}</strong>
                                </div>
                                <div className="moodle-q-status">
                                    {userAnswers[question.id] !== undefined
                                        ? (language === 'ar' ? 'تمت الإجاب' : 'Answered')
                                        : (language === 'ar' ? 'لم تتم الإجاب بعد' : 'Not yet answered')}
                                </div>
                                <div className="moodle-q-mark">
                                    {language === 'ar' ? `الدرج من ${(question.marks || 1.00).toFixed(2)}` : `Marked out of ${(question.marks || 1.00).toFixed(2)}`}
                                </div>

                                {/* Mobile Timer Badge */}
                                <div className={`mobile-timer-badge no-print ${timeLeft <= 60 ? 'timer-danger' : ''}`} style={{ margin: '10px 0', display: 'none' }}>
                                    <span className="timer-badge-icon">⏱️</span>
                                    <span className="timer-badge-text">{formatTime(timeLeft)}</span>
                                </div>

                                <button
                                    className={`moodle-q-flag-btn ${flaggedQuestions.has(question.id) ? 'active' : ''}`}
                                    onClick={() => toggleFlag(question)}
                                >
                                    <span className="flag-icon">⚑</span>{' '}
                                    {flaggedQuestions.has(question.id)
                                        ? (language === 'ar' ? 'إزال العلامة' : 'Remove flag')
                                        : (language === 'ar' ? 'تعليم السؤال' : 'Flag question')}
                                </button>

                                {/* Notes textarea — below flag button */}
                                <div className="no-print" style={{ marginTop: '10px' }}>
                                    <label
                                        htmlFor={`quiz-note-${question.id}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            color: '#555',
                                            marginBottom: '5px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        📝 {language === 'ar' ? 'كتاب ملاحظ عن السؤال' : 'Note about question'}
                                    </label>
                                    <textarea
                                        id={`quiz-note-${question.id}`}
                                        value={quizNotes[question.id] || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setQuizNotes(prev => ({ ...prev, [question.id]: val }));
                                        }}
                                        onBlur={e => {
                                            e.target.style.borderColor = '#ddd';
                                            const val = e.target.value.trim();
                                            if (val) handleSaveNote(question, val);
                                        }}
                                        placeholder={language === 'ar' ? 'اكتب ملاحظتك هنا ثم اضغط إرسال...' : 'Write your note and click send...'}
                                        rows={3}
                                        style={{
                                            width: '100%',
                                            resize: 'vertical',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '0.82rem',
                                            fontFamily: 'inherit',
                                            color: 'var(--text-primary, #333)',
                                            background: '#fff',
                                            outline: 'none',
                                            boxSizing: 'border-box',
                                            direction: language === 'ar' ? 'rtl' : 'ltr',
                                            transition: 'border-color 0.2s'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#9c27b0'}
                                    />
                                    <button
                                        onClick={() => handleSaveNote(question)}
                                        disabled={!quizNotes[question.id] || !quizNotes[question.id].trim()}
                                        style={{
                                            marginTop: '6px',
                                            width: '100%',
                                            background: quizNotes[question.id] && quizNotes[question.id].trim() ? 'linear-gradient(135deg, #d32f2f, #b71c1c)' : '#e0e0e0',
                                            color: quizNotes[question.id] && quizNotes[question.id].trim() ? '#ffffff' : '#888888',
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '6px 10px',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            cursor: quizNotes[question.id] && quizNotes[question.id].trim() ? 'pointer' : 'not-allowed',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s ease',
                                            boxShadow: quizNotes[question.id] && quizNotes[question.id].trim() ? '0 2px 8px rgba(211, 47, 47, 0.3)' : 'none'
                                        }}
                                    >
                                        {language === 'ar' ? 'إرسال الملاحظ مع البلاغ' : 'Send Note with Report'}
                                    </button>
                                </div>
                            </div>

                            {/* Question Content Box */}
                            <div className="moodle-q-content-box">
                                <div
                                    className={`moodle-q-text-area ${isEnglishContent ? 'force-ltr' : ''}`}
                                    dir={isEnglishContent ? 'ltr' : 'rtl'}
                                >
                                    {question.codeBlock && <CodeBlock code={question.codeBlock} />}
                                    <div className="moodle-q-text-main">
                                        {renderTextWithCode(displayLang === 'ar' ? (question.questionAr || question.questionEn) : question.questionEn)}
                                    </div>

                                    {(question.image || question.image2) && (
                                        <div className="question-images-grid" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', margin: '1rem 0' }}>
                                            {question.image && (
                                                <div className="question-image-container" style={{ flex: '1 1 auto', maxWidth: '450px', textAlign: 'center', margin: 0 }}>
                                                    <img
                                                        src={question.image}
                                                        alt="Question Illustration 1"
                                                        style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    />
                                                </div>
                                            )}
                                            {question.image2 && (
                                                <div className="question-image-container" style={{ flex: '1 1 auto', maxWidth: '450px', textAlign: 'center', margin: 0 }}>
                                                    <img
                                                        src={question.image2}
                                                        alt="Question Illustration 2"
                                                        style={{ maxWidth: '100%', maxHeight: '350px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {question.questionEnPartB && (
                                        <div className="moodle-q-text-main" style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                                            {renderTextWithCode(displayLang === 'ar' ? question.questionArPartB : question.questionEnPartB)}
                                        </div>
                                    )}

                                    {question.tableData && (
                                        <div className="question-table-container" style={{ margin: '1.5rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            {question.tableData.title && (
                                                <h3 style={{ marginBottom: '0.5rem', alignSelf: 'flex-start', marginLeft: '10%' }}>{question.tableData.title}</h3>
                                            )}
                                            <table style={{
                                                borderCollapse: 'collapse',
                                                backgroundColor: '#f8f9fa',
                                                color: '#333',
                                                borderRadius: '8px',
                                                overflow: 'hidden',
                                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                minWidth: '200px'
                                            }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #ced4da' }}>
                                                        {question.tableData.headers.map((header, idx) => (
                                                            <th key={idx} style={{ padding: '0.75rem 1.5rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{header}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {question.tableData.rows.map((row, rIdx) => (
                                                        <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#fff' : '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
                                                            {row.map((cell, cIdx) => (
                                                                <td key={cIdx} style={{ padding: '0.75rem 1.5rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{cell}</td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {question.multiTables && (
                                        <div className="question-multi-tables-container" style={{ margin: '1.5rem 0', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '2rem' }}>
                                            {question.multiTables.map((tbl, tIdx) => (
                                                <div key={tIdx} className="single-table-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    {tbl.title && (
                                                        <h3 style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>{tbl.title}</h3>
                                                    )}
                                                    <table style={{
                                                        borderCollapse: 'collapse',
                                                        backgroundColor: '#f8f9fa',
                                                        color: '#333',
                                                        borderRadius: '8px',
                                                        overflow: 'hidden',
                                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                        minWidth: '150px'
                                                    }}>
                                                        <thead>
                                                            <tr style={{ backgroundColor: '#e9ecef', borderBottom: '2px solid #ced4da' }}>
                                                                {tbl.headers.map((header, idx) => (
                                                                    <th key={idx} style={{ padding: '0.5rem 1rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{header}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {tbl.rows.map((row, rIdx) => (
                                                                <tr key={rIdx} style={{ backgroundColor: rIdx % 2 === 0 ? '#fff' : '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
                                                                    {row.map((cell, cIdx) => (
                                                                        <td key={cIdx} style={{ padding: '0.5rem 1rem', borderRight: '1px solid #dee2e6', textAlign: 'center', fontWeight: 'bold' }}>{cell}</td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="moodle-q-options-display" dir={isEnglishContent ? 'ltr' : 'rtl'}>
                                        {question.type === 'multi_select' ? (
                                            // Checkbox multi-select
                                            (question.options || []).map((opt, oIdx) => {
                                                const selected = Array.isArray(userAnswers[question.id]) ? userAnswers[question.id] : [];
                                                const isChecked = selected.includes(opt.id);
                                                return (
                                                    <div
                                                        key={opt.id}
                                                        className={`moodle-radio-display ${isChecked ? 'selected' : ''}`}
                                                        onClick={() => {
                                                            const cur = Array.isArray(userAnswers[question.id]) ? [...userAnswers[question.id]] : [];
                                                            const updated = cur.includes(opt.id) ? cur.filter(id => id !== opt.id) : [...cur, opt.id];
                                                            handleAnswerSelect(question.id, updated);
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                    >
                                                        <input type="checkbox" checked={isChecked} readOnly style={{ accentColor: '#6366f1' }} />
                                                        <label style={{ cursor: 'pointer' }}>
                                                            <span className="moodle-option-letter">{(() => {
                                                                const txt = displayLang === 'ar' ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr);
                                                                if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                                                                return String(oIdx + 1);
                                                            })()}</span>{' '}
                                                            <div className="moodle-option-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                                                                {opt.image && (
                                                                    <div className="moodle-option-image-wrapper" style={{ margin: '0.3rem 0' }}>
                                                                        <img src={opt.image} alt="Option Choice" className="moodle-option-image" style={{ maxHeight: '150px', maxWidth: '100%', borderRadius: '8px' }} />
                                                                    </div>
                                                                )}
                                                                {renderTextWithCode(displayLang === 'ar' ? (opt.textAr || opt.textEn) : opt.textEn)}
                                                            </div>
                                                        </label>
                                                    </div>
                                                );
                                            })
                                        ) : (question.type !== 'multi_select' && question.type !== 'text' && question.type !== 'short_answer' && question.type !== 'fill' && question.type !== 'matching') ? (
                                            (question.options && question.options.length >= 2 ? question.options : [
                                                { id: 'a', textAr: 'صح', textEn: 'True' },
                                                { id: 'b', textAr: 'خطأ', textEn: 'False' }
                                            ]).map((opt, oIdx) => {
                                                const letter = String.fromCharCode(97 + oIdx); // a, b, c, d
                                                const isSelected = userAnswers[question.id] === opt.id;
                                                return (
                                                    <div
                                                        key={opt.id}
                                                        className={`moodle-radio-display ${isSelected ? 'selected' : ''}`}
                                                        onClick={() => handleAnswerSelect(question.id, opt.id)}
                                                    >
                                                        <input type="radio" checked={isSelected} readOnly />
                                                        <label>
                                                            <span className="moodle-option-letter">{(() => {
                                                                const txt = displayLang === 'ar' ? (opt.textAr || opt.textEn) : (opt.textEn || opt.textAr);
                                                                if (txt && txt.trim()) return txt.length > 18 ? txt.slice(0, 18) + '…' : txt;
                                                                return String(oIdx + 1);
                                                            })()}</span>{' '}
                                                            {opt.tableData ? (
                                                                <div className="option-table-wrapper" style={{ overflowX: 'auto', display: 'inline-block', verticalAlign: 'middle' }}>
                                                                    <table className="question-interactive-table opt-table">
                                                                        <thead>
                                                                            <tr>
                                                                                {opt.tableData.headers.map((h, i) => (
                                                                                    <th key={i}>{h}</th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {opt.tableData.rows.map((r, i) => (
                                                                                <tr key={i}>
                                                                                    {r.map((c, j) => (
                                                                                        <td key={j}>{c}</td>
                                                                                    ))}
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            ) : (
                                                                <div className="moodle-option-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1 }}>
                                                                    {opt.image && (
                                                                        <div className="moodle-option-image-wrapper" style={{ margin: '0.3rem 0' }}>
                                                                            <img src={opt.image} alt="Option Choice" className="moodle-option-image" style={{ maxHeight: '150px', maxWidth: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }} />
                                                                        </div>
                                                                    )}
                                                                    {renderTextWithCode(displayLang === 'ar' ? (opt.textAr || opt.textEn) : opt.textEn)}
                                                                </div>
                                                            )}
                                                        </label>
                                                    </div>
                                                );
                                            })
                                        ) : (question.type === 'text' || question.type === 'short_answer' || question.type === 'fill') ? (
                                            <div className="moodle-text-answer-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
                                                <input
                                                    type="text"
                                                    className="moodle-text-answer-input"
                                                    value={userAnswers[question.id] || ''}
                                                    placeholder={language === 'ar' ? 'اكتب إجابتك هنا...' : 'Type your answer here...'}
                                                    onChange={(e) => handleAnswerSelect(question.id, e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        minHeight: '48px',
                                                        padding: '0.85rem 1rem',
                                                        borderRadius: '8px',
                                                        border: '1px solid #ced4da',
                                                        background: '#fff',
                                                        color: '#212529',
                                                        fontSize: '0.95rem'
                                                    }}
                                                />
                                                {question.correctAnswer && showResults && (
                                                    <div style={{ color: '#495057', fontSize: '0.95rem' }}>
                                                        <strong>{language === 'ar' ? 'الإجابة الصحيحةة:' : 'Correct answer:'}</strong> {question.correctAnswer}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="moodle-matching-container">
                                                {(question.subQuestions || []).map((sub, sIdx) => {
                                                    const currentAnswer = userAnswers[question.id]?.[sub.id] || '';
                                                    return (
                                                        <div key={sub.id} className="moodle-matching-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.8rem 0', gap: '1rem', flexWrap: 'wrap' }}>
                                                            <div className="sub-q-text">
                                                                <span className="sub-num">{sIdx + 1}.</span>{' '}
                                                                {renderTextWithCode(displayLang === 'ar' ? sub.textAr : sub.textEn)}
                                                            </div>
                                                            <div className="moodle-select-wrapper">
                                                                <select
                                                                    className="moodle-select"
                                                                    value={currentAnswer}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setUserAnswers(prev => ({
                                                                            ...prev,
                                                                            [question.id]: {
                                                                                ...(prev[question.id] || {}),
                                                                                [sub.id]: val
                                                                            }
                                                                        }));
                                                                    }}
                                                                >
                                                                    <option value="">{language === 'ar' ? 'اختر...' : 'Choose...'}</option>
                                                                    {(question.options || []).map(opt => (
                                                                        <option key={opt.id} value={opt.id}>
                                                                            {displayLang === 'ar' ? (opt.textAr || opt.id) : (opt.textEn || opt.id)}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="quiz-footer moodle-quiz-footer no-print">
                            <div className="footer-controls">
                                <button
                                    className="nav-btn exit-quiz-btn"
                                    onClick={() => {
                                        if (window.confirm(language === 'ar' ? 'هل أنت متأكد من الخروج؟ سيتم فقدان تقدمك.' : 'Are you sure you want to exit? Your progress will be lost.')) {
                                            setUserAnswers({});
                                            setCurrentQuestionIndex(0);
                                            setFlaggedQuestions(new Set());
                                            setSelectedCategory(null);
                                            navigate('/quiz', { state: { selectedCategoryId: currentSubject?.id } });
                                        }
                                    }}
                                >
                                    {language === 'ar' ? 'العودة للقائمة' : 'Back to List'}
                                </button>

                                <button
                                    className="nav-btn prev"
                                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                                    disabled={currentQuestionIndex === 0}
                                >
                                    {language === 'ar' ? 'الصفحة السابقة' : 'Previous page'}
                                </button>

                                <span className="question-counter">
                                    {currentQuestionIndex + 1} / {currentQuiz.questions.length}
                                </span>

                                {currentQuestionIndex === currentQuiz.questions.length - 1 ? (
                                    <button
                                        className="nav-btn finish"
                                        onClick={finishQuiz}
                                        style={{ backgroundColor: '#0f6cbf', color: '#fff' }}
                                    >
                                        {language === 'ar' ? 'إنهاء المحاولة...' : 'Finish attempt...'}
                                    </button>
                                ) : (
                                    <button
                                        className="nav-btn next"
                                        onClick={() => setCurrentQuestionIndex(prev => Math.min(currentQuiz.questions.length - 1, prev + 1))}
                                        style={{ backgroundColor: '#0f6cbf', color: '#fff' }}
                                    >
                                        {language === 'ar' ? 'الصفحة التالية' : 'Next page'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right column: Navigation sidebar */}
                    <div className="moodle-nav-column no-print">
                        <div className="moodle-nav-block">
                            <div className="moodle-timer-section">
                                <span className="timer-label">⏱️ {language === 'ar' ? 'الوقت المتبقي:' : 'Time Left:'}</span>
                                <span className={`timer-value ${timeLeft <= 60 ? 'timer-danger' : ''}`}>{formatTime(timeLeft)}</span>
                            </div>
                            <div className="moodle-close-drawer-row">
                                <button className="moodle-close-drawer-btn" style={{ visibility: 'hidden' }}>✕</button>
                                <span>{language === 'ar' ? 'إغلاق قائمة التصفح' : 'Close block drawer'}</span>
                            </div>
                            <h3 className="moodle-nav-title">{language === 'ar' ? 'التنقل عبر الاختبار' : 'Quiz navigation'}</h3>
                            <div className="moodle-nav-grid">
                                {currentQuiz.questions.map((q, idx) => {
                                    const isAnswered = userAnswers[q.id] !== undefined;
                                    const isCurrent = currentQuestionIndex === idx;
                                    const isFlagged = flaggedQuestions.has(q.id);

                                    return (
                                        <button
                                            key={q.id}
                                            className={`moodle-active-nav-item ${isAnswered ? 'answered' : ''} ${isCurrent ? 'current' : ''}`}
                                            onClick={() => setCurrentQuestionIndex(idx)}
                                        >
                                            <span className="nav-num">{idx + 1}</span>
                                            {isFlagged && <span className="nav-flag-indicator"></span>}
                                            <span className="nav-status-shade"></span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="moodle-nav-links">
                                <a href="#finish-attempt" onClick={(e) => { e.preventDefault(); finishQuiz(); }}>
                                    {language === 'ar' ? 'إنهاء المحاولة...' : 'Finish attempt...'}
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Navigation FAB button for mobile/tablet */}
                <button
                    className="mobile-nav-toggle-fab no-print"
                    onClick={() => setIsMobileDrawerOpen(true)}
                    style={{ backgroundColor: '#0f6cbf' }}
                >
                    <span className="fab-icon">🧭</span>
                    <span className="fab-badge">{currentQuestionIndex + 1}/{currentQuiz.questions.length}</span>
                </button>

                {/* Mobile BottomSheet Navigation Drawer */}
                <AnimatePresence>
                    {isMobileDrawerOpen && (
                        <>
                            <motion.div
                                className="mobile-drawer-backdrop no-print"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setIsMobileDrawerOpen(false)}
                            />
                            <motion.div
                                className="mobile-drawer-sheet no-print"
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            >
                                <div className="drawer-handle" onClick={() => setIsMobileDrawerOpen(false)} />
                                <div className="drawer-header">
                                    <span className="drawer-icon">🧭</span>
                                    <h3>{language === 'ar' ? 'خريطة الأسئلة والتنقل' : 'Question Map & Navigation'}</h3>
                                    <button className="close-drawer-btn" onClick={() => setIsMobileDrawerOpen(false)}>✕</button>
                                </div>

                                <div className="drawer-timer-section">
                                    <span className="timer-label">⏱️ {language === 'ar' ? 'الوقت المتبقي:' : 'Time Left:'}</span>
                                    <span className={`timer-value ${timeLeft <= 60 ? 'timer-danger' : ''}`}>{formatTime(timeLeft)}</span>
                                </div>

                                <div className="moodle-nav-grid" style={{ padding: '1rem', justifyContent: 'center' }}>
                                    {currentQuiz.questions.map((q, idx) => {
                                        const isAnswered = userAnswers[q.id] !== undefined;
                                        const isFlagged = flaggedQuestions.has(q.id);
                                        const isCurrent = currentQuestionIndex === idx;

                                        return (
                                            <button
                                                key={q.id}
                                                className={`moodle-active-nav-item ${isAnswered ? 'answered' : ''} ${isCurrent ? 'current' : ''}`}
                                                onClick={() => {
                                                    setCurrentQuestionIndex(idx);
                                                    setIsMobileDrawerOpen(false);
                                                }}
                                            >
                                                <span className="nav-num">{idx + 1}</span>
                                                {isFlagged && <span className="nav-flag-indicator"></span>}
                                                <span className="nav-status-shade"></span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="drawer-footer">
                                    <button className="finish-btn-premium" onClick={() => {
                                        setIsMobileDrawerOpen(false);
                                        finishQuiz();
                                    }} style={{ backgroundColor: '#0f6cbf' }}>
                                        <span className="btn-icon">🏁</span>
                                        {language === 'ar' ? 'إنهاء المحاولة وتصحيح الاختبار' : 'Finish Attempt & Score'}
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div >
        );
    }




    // Default: Show Categories or Selected Category Parts
    return (
        <div className="quiz-page">
            <section className="quiz-hero" style={{ backgroundImage: `url(${quizHero})` }}>
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <h1 className="hero-title">{t('quiz.hero.title')}</h1>
                    <p className="hero-subtitle">{t('quiz.hero.subtitle')}</p>
                </div>
            </section>

            <div className="quiz-selection-container">
                {selectedCategory ? (
                    <div className="parts-selection fade-in">
                        <button className="back-btn" onClick={() => setSelectedCategory(null)}>
                            {language === 'ar' ? '← العودة للمواد' : '← Back to Subjects'}
                        </button>
                        <h2 className="selection-title">
                            {language === 'ar' ? selectedCategory.nameAr : selectedCategory.name}
                        </h2>
                        <div className="quiz-categories-grid">
                            {[...selectedCategory.parts].reverse().map(part => {
                                // Handle accordion/group structure
                                if (part.isGroup && part.subParts) {
                                    return part.subParts.map(subPart => {
                                        const subPartData = quizData[subPart.id];
                                        const staticCount = subPartData?.questions?.length || 0;
                                        const dynamicCount = dbSubjectQuestions.filter(q => q.partId === subPart.id).length;
                                        const totalCount = staticCount + dynamicCount;
                                        const hasQuestions = totalCount > 0;
                                        return (
                                            <Link
                                                key={subPart.id}
                                                to={hasQuestions ? `/quiz/${subPart.id}` : '#'}
                                                onClick={(e) => !hasQuestions && e.preventDefault()}
                                                className={`quiz-category-card glass-card ${!hasQuestions ? 'disabled-quiz-card' : ''}`}
                                                style={{ '--category-color': selectedCategory.color }}
                                            >
                                                <div className="category-icon">{selectedCategory.icon}</div>
                                                <h3>{language === 'ar' ? subPart.titleAr : subPart.title}</h3>
                                                <p>{totalCount} {language === 'ar' ? 'أسئلة' : 'Questions'}</p>
                                                <span className="start-btn">
                                                    {hasQuestions ? (language === 'ar' ? 'ابدأ الاختبار' : 'Start') : (language === 'ar' ? 'لم تتوفر بعد' : 'Not available')}
                                                </span>
                                            </Link>
                                        );
                                    });
                                }

                                // Handle regular parts
                                const partData = quizData[part.id];
                                const staticQCount = partData?.questions?.length || 0;
                                const dynamicQCount = dbSubjectQuestions.filter(q => q.partId === part.id).length;
                                const totalQCount = staticQCount + dynamicQCount;
                                const hasQuestions = totalQCount > 0;
                                const hasSubParts = partData?.parts?.length > 0;
                                // Also allow navigation for DB-only parts (e.g. a newly created quiz part with questions but no static data)
                                const isAvailable = hasQuestions || hasSubParts || part.fromDb;

                                return (
                                    <Link
                                        key={part.id}
                                        to={isAvailable ? `/quiz/${part.id}` : '#'}
                                        onClick={(e) => !isAvailable && e.preventDefault()}
                                        className={`quiz-category-card glass-card ${!isAvailable ? 'disabled-quiz-card' : ''}`}
                                        style={{ '--category-color': selectedCategory.color }}
                                    >
                                        <div className="category-icon">{selectedCategory.icon}</div>
                                        <h3>{language === 'ar' ? part.titleAr : part.title}</h3>
                                        <p>
                                            {hasSubParts
                                                ? `${partData.parts.length} ${language === 'ar' ? 'أجزاء' : 'Parts'}`
                                                : `${totalQCount} ${t('quiz.selection.questions')}`
                                            }
                                        </p>
                                        <span className="start-btn">
                                            {isAvailable
                                                ? (hasSubParts ? (language === 'ar' ? 'عرض الأجزاء' : 'View Parts') : t('quiz.selection.start'))
                                                : (language === 'ar' ? 'لم تتوفر بعد' : 'Not available yet')}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <>
                        <h2 className="selection-title">{t('quiz.selection.title')}</h2>

                        {/* Disclaimer Banner */}
                        <div className="quiz-disclaimer-banner fade-in">
                            <span className="disclaimer-icon">💡</span>
                            <p>
                                {language === 'ar'
                                    ? 'تنويه: الأسئلة الموجود هنا هي عبار عن أسئلة سنوات سابق تم تحويلها لنمط اختبار تفاعلي'
                                    : 'Note: The questions provided here are past paper questions adapted into an interactive test format'
                                }
                            </p>
                        </div>

                        <p className="selection-note fade-in">{t('quiz.selection.note')}</p>

                        {/* Search Bar */}
                        <div className="search-bar-container fade-in">
                            <div className="search-input-wrapper">
                                <span className="search-field-icon">🔍</span>
                                <input
                                    type="text"
                                    className="quiz-search-input"
                                    placeholder={language === 'ar' ? 'ابحث عن مادة... (مثلاً: برمج، رياضيات)' : 'Search for a subject... (e.g., Programming, Math)'}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Subjects Quick Index */}
                        {searchTerm === '' && (
                            <div className="subjects-index-container fade-in">
                                <div className="index-header">
                                    <span className="index-icon">📚</span>
                                    <h3 className="index-title">{language === 'ar' ? 'فهرس المواد المتاح' : 'Available Subjects Index'}</h3>
                                </div>
                                <div className="subjects-chips-grid">
                                    {[...mergedCategories].reverse().map((category, index) => (
                                        <button
                                            key={category.id}
                                            className="subject-chip-premium"
                                            onClick={() => {
                                                const element = document.getElementById(`category-${category.id}`);
                                                if (element) {
                                                    const yOffset = -150;
                                                    const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
                                                    window.scrollTo({ top: y, behavior: 'smooth' });

                                                    element.classList.add('highlight-pulse');
                                                    setTimeout(() => element.classList.remove('highlight-pulse'), 2000);
                                                }
                                            }}
                                        >
                                            <span className="chip-icon-mini">{category.icon}</span>
                                            <span className="chip-text">{language === 'ar' ? category.nameAr : category.name}</span>
                                            <span className="chip-count">
                                                {index + 1}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {filteredCategories.length > 0 ? (
                            <div className="quiz-categories-grid">
                                {[...filteredCategories].reverse().map(category => {
                                    const hasQuestions = quizData[category.id]?.questions?.length > 0;
                                    const hasParts = category.parts && category.parts.length > 0;

                                    if (hasParts) {
                                        return (
                                            <div
                                                key={category.id}
                                                id={`category-${category.id}`}
                                                className="quiz-category-card glass-card"
                                                style={{ '--category-color': category.color }}
                                                onClick={() => setSelectedCategory(category)}
                                            >
                                                {category.isNew && <span className="new-badge">NEW</span>}
                                                <div className="category-icon">{category.icon}</div>
                                                <h3>{language === 'ar' ? category.nameAr : category.name}</h3>
                                                <p>{category.parts.length} {language === 'ar' ? 'أجزاء' : 'Parts'}</p>
                                                <span className="start-btn">{language === 'ar' ? 'عرض الأجزاء' : 'View Parts'}</span>
                                            </div>
                                        );
                                    }

                                    return (
                                        <Link
                                            key={category.id}
                                            id={`category-${category.id}`}
                                            to={hasQuestions ? `/quiz/${category.id}` : '#'}
                                            onClick={(e) => !hasQuestions && e.preventDefault()}
                                            className={`quiz-category-card glass-card ${!hasQuestions ? 'disabled-quiz-card' : ''}`}
                                            style={{ '--category-color': category.color }}
                                        >
                                            {category.isNew && <span className="new-badge">NEW</span>}
                                            <div className="category-icon">{category.icon}</div>
                                            <h3>{language === 'ar' ? category.nameAr : category.name}</h3>
                                            <p>
                                                {quizData[category.id]?.questions?.length || 0} {t('quiz.selection.questions')}
                                            </p>
                                            <span className="start-btn">
                                                {hasQuestions
                                                    ? t('quiz.selection.start')
                                                    : (language === 'ar' ? 'لم تتوفر بعد' : 'Not available yet')}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="no-search-results fade-in">
                                <div className="no-results-icon">😕</div>
                                <h3>{language === 'ar' ? 'نعتذر، لم يتم العثور على المادة' : 'Sorry, no subject found'}</h3>
                                <p>
                                    {language === 'ar'
                                        ? 'نحن نعمل باستمرار على إضاف مواد جديد. إذا كنت تبحث عن مادة محدد، يمكنك مراسلتنا لاقتراحها!'
                                        : "We are constantly adding new materials. If you're looking for a specific subject, please suggest it to us!"
                                    }
                                </p>
                                <button className="clear-results-btn" onClick={() => setSearchTerm('')}>
                                    {language === 'ar' ? 'عرض كافة المواد' : 'View all subjects'}
                                </button>
                            </div>
                        )}
                    </>
                )}

                {!selectedCategory && (
                    <div style={{ maxWidth: '560px', margin: '0 auto' }}>
                        <ExamTimer />
                    </div>
                )}

                {!selectedCategory && (
                    <div className="quiz-contribution-container fade-in">
                        <div className="quiz-contribution-cta unified-cta glass-card">
                            <div className="cta-content">
                                <div className="cta-icon-wrapper">
                                    <div className="cta-icon-bg"></div>
                                    <span className="cta-icon">✨</span>
                                </div>
                                <div className="cta-text">
                                    <h3>{language === 'ar' ? 'ساهم في إثراء محتوى مكانك ✨' : 'Share & Enrich Makanak Content ✨'}</h3>
                                    <p>
                                        {language === 'ar'
                                            ? 'نرحب بمساهماتكم سواء كانت أسئلة سنوات، اختبارات قصيرة، ملخصات، أو روابط مفيدة. ساعد زملائك وكن جزءاً من مسيرة الخير.'
                                            : 'We welcome your contributions! Share past papers, quizzes, summaries, or helpful links to benefit all students.'}
                                    </p>
                                </div>
                            </div>
                            <div className="cta-actions">
                                <button
                                    onClick={() => setShowUploader(true)}
                                    className="cta-pill primary-action"
                                >
                                    <span className="pill-icon">📤</span>
                                    <span className="pill-text">{language === 'ar' ? 'أرفق ملفات أو روابط' : 'Attach Files or Links'}</span>
                                </button>
                                <div className="secondary-actions">
                                    <a href="https://wa.me/962782934685" target="_blank" rel="noopener noreferrer" className="cta-pill whatsapp-lite">
                                        <span className="pill-icon">📱</span>
                                        <span className="pill-text">WhatsApp</span>
                                    </a>
                                    <Link to="/#suggestions" className="cta-pill suggestions-lite">
                                        <span className="pill-icon"></span>
                                        <span className="pill-text">{language === 'ar' ? 'الاقتراحات' : 'Suggestions'}</span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* File Uploader Modal */}
                {showUploader && <FileUploader onClose={() => setShowUploader(false)} />}
            </div>
        </div>
    );
};

export default Quiz;
