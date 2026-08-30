import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { nashmiData } from '../data/nashmiData';
import { coursesData } from '../data/coursesData';
import { chatWithNashmi } from '../services/aiService';
import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import './LemonChat.css';

const LemonChat = () => {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const isAr = language === 'ar';
    const [messages, setMessages] = useState([
        {
            id: 1,
            text: isAr ? 'مرحباً بك! أنا "نشمي المطور"، رفيقك الذكي في مشروع "مكانك الجامعي" التطوعي 🇯🇴🤖. كيف يمكنني مساعدتك في رحلتك الأكاديمي اليوم؟' : 'Welcome! I am Nashmi Advanced, your smart companion in the "Makanak Al-Jami\'i" initiative 🇯🇴🤖. How can I assist you in your academic journey today?',
            sender: 'bot'
        }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const isFirstRender = useRef(true);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    useEffect(() => {
        if (messages.length > 1) {
            scrollToBottom();
        } else {
            // Even if only 1 message, we mark first render as done after some time
            setTimeout(() => { isFirstRender.current = false; }, 1000);
        }
    }, [messages]);

    const normalizeText = (text) => {
        if (!text) return '';
        return text.toLowerCase()
            .trim()
            .replace(/[أإآ]/g, 'ا')
            .replace(/\uFFFD/g, 'ه')
            .replace(/ى/g, 'ي')
            .replace(/ئ/g, 'ي')
            .replace(/ؤ/g, 'و')
            .replace(/[^a-z0-9\u0600-\u06FF\s]/g, '')
            .trim();
    };

    // Calculate relevance score between query and target
    const calculateScore = (query, target) => {
        const normQuery = normalizeText(query);
        const normTarget = normalizeText(target);

        if (normTarget === normQuery) return 100;
        if (normTarget.includes(normQuery)) return normQuery.length * 5;

        const queryWords = normQuery.split(' ');
        let score = 0;
        queryWords.forEach(word => {
            if (word.length < 3) return;
            // Ignore common query lead words when matching target title
            if (['ملص', 'دوسي', 'مادة', 'اسئل', 'شرح', 'كتاب', 'سلايدات', 'بدي', 'اريد'].includes(word)) return;
            if (normTarget.includes(word)) {
                score += 20;
            } else if (word.length >= 4 && normTarget.includes(word.substring(0, 4))) {
                score += 12;
            }
        });
        return score;
    };

    const findMaterial = (query) => {
        let bestMatch = null;
        let maxScore = 0;

        Object.values(coursesData).forEach(category => {
            if (!Array.isArray(category)) return;
            category.forEach(course => {
                const nameAr = course.name;
                const nameEn = course.nameEn || '';

                let score = calculateScore(query, nameAr) + calculateScore(query, nameEn);

                if (score > maxScore) {
                    maxScore = score;
                    bestMatch = {
                        type: 'course_card',
                        data: { ...course },
                        textAr: `تفضل، هي مصادر مادة **${nameAr}** موجود هون! 👇`,
                        textEn: `Here are the resources for **${nameEn}**! 👇`
                    };
                }
            });
        });

        if (maxScore >= 10) return bestMatch; // Threshold
        return null;
    };

    const findBestMatch = (query) => {
        const normQuery = normalizeText(query);
        let bestMatch = null;
        let maxScore = 0;

        // 1. Pages Navigation (Very High Confidence Actions)
        const pages = [
            { id: 'request', keywords: ['اطلب ما تحتاجه', 'طلب دم', 'خدمات', 'اطلب ملص', 'طلب مادة', 'انشاء اسئل', 'اقتراح فكر', 'طلب جديد'], path: '#request-services', titleAr: 'قسم اطلب ما تحتاجه', titleEn: 'Request Services', icon: '✨' },
            { id: 'grading', keywords: ['معدل', 'احسب', 'علامات', 'ترج', 'grade', 'grading', 'marks'], path: '/grading', titleAr: 'نظام العلامات', titleEn: 'Grading System', icon: '📊' },
            { id: 'calendar', keywords: ['تقويم', 'موعد', 'متى', 'calendar', 'date', 'schedule'], path: '/calendar', titleAr: 'التقويم الجامعي', titleEn: 'Academic Calendar', icon: '📅' },
            { id: 'materials', keywords: ['مواد', 'دراسه', 'كتب', 'materials', 'study', 'courses'], path: '/materials', titleAr: 'المواد الدراسي', titleEn: 'Study Materials', icon: '📚' },
            { id: 'plans', keywords: ['ط', 'خطط', 'ساعات', 'plans', 'tree', 'map'], path: '/plans', titleAr: 'الخطط الدراسي', titleEn: 'Academic Plans', icon: '🗺️' },
            { id: 'quiz', keywords: ['كويز', 'اسئل', 'بنك', 'quiz', 'bank', 'questions'], path: '/quiz', titleAr: 'بنك الأسئلة', titleEn: 'Question Bank', icon: '📝' },
            { id: 'news', keywords: ['ابار', 'اعلان', 'جديد', 'news', 'announcement', 'update'], path: '/news', titleAr: 'أبار الجامعة', titleEn: 'University News', icon: '📰' }
        ];

        pages.forEach(page => {
            page.keywords.forEach(keyword => {
                const normK = normalizeText(keyword);
                if (normQuery === normK) {
                    maxScore = 150; // Exact match on navigation
                    bestMatch = { type: 'page_card', data: page };
                } else if (normQuery.includes(normK) && normQuery.length < 25) {
                    const score = 80 + normK.length;
                    if (score > maxScore) {
                        maxScore = score;
                        bestMatch = { type: 'page_card', data: page };
                    }
                }
            });
        });

        // 2. Course Materials (High Confidence)
        const materialResult = findMaterial(query);
        if (materialResult && maxScore < 90) {
            maxScore = 90;
            bestMatch = materialResult;
        }

        // 3. Fallback for material / summary / quiz requests when not found in database
        const isMaterialQuery = ['ملص', 'دوسي', 'كتاب', 'سلايدات', 'شرح', 'مادة', 'امتحان', 'امتحانات'].some(w => normQuery.includes(w));
        if (!materialResult && isMaterialQuery && maxScore < 90) {
            maxScore = 95;
            bestMatch = {
                type: 'text_response',
                textAr: `عذراً يا نشمي، المادة أو الملص اللي بتدور عليه غير متوفر حالياً بالموقع 💔.\n\nبس ولا يهمك! بإمكانك طلب توفيرها فوراً من فريق مكانك عبر قسم **[اطلب ما تحتاجه](#request-services)** وسنقوم بإعدادها وإضافتها لك في أقرب وقت! 🚀`,
                textEn: `Sorry! The requested material is not available yet 💔.\n\nYou can request it directly from our team via the **[Request Services](#request-services)** section!`
            };
        }

        // 4. Nashmi Persona (Social/General) - ONLY FOR EXACT MATCHES OR VERY HIGH CONFIDENCE
        if (!bestMatch) {
            nashmiData.forEach(item => {
                item.keywords.forEach(k => {
                    const normK = normalizeText(k);
                    if (normQuery === normK) {
                        maxScore = 100;
                        bestMatch = { type: 'text_response', textAr: item.response, textEn: item.response };
                    }
                });
            });
        }

        return { match: bestMatch, score: maxScore };
    };

    const handleSend = async (e) => {
        e.preventDefault();
        if (!input.trim() || isTyping) return;

        const originalInput = input;
        const userMsg = { id: Date.now(), text: originalInput, sender: 'user' };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const { match, score } = findBestMatch(originalInput);

            // Save to Firebase (Non-blocking)
            addDoc(collection(db, 'nashmi_chat'), {
                question: originalInput,
                timestamp: serverTimestamp(),
                foundMatch: !!match,
                matchScore: score,
                type: 'nashmi'
            }).catch(err => console.warn("Firebase logging skipped:", err.message));

            if (match && score >= 90) {
                // local match
                await new Promise(resolve => setTimeout(resolve, 800));

                const responseMsg = {
                    id: Date.now() + 1,
                    sender: 'bot',
                    ...match
                };

                if (match.type === 'text_response') {
                    responseMsg.text = isAr ? match.textAr : match.textEn;
                } else if (!responseMsg.text) {
                    responseMsg.text = isAr ? match.textAr || 'تفضل، هذا ما وجدته:' : match.textEn || 'Here is what I found:';
                }

                setMessages(prev => [...prev, responseMsg]);
            } else {
                // CALL REAL AI IF NO HIGH-CONFIDENCE LOCAL MATCH FOUND
                const aiResult = await chatWithNashmi(originalInput, "Main Chat Section", messages);

                const aiBotMsg = {
                    id: Date.now() + 1,
                    sender: 'bot',
                    text: aiResult.success ? aiResult.text : (isAr ? aiResult.messageAr : aiResult.messageEn)
                };

                setMessages(prev => [...prev, aiBotMsg]);
            }
        } catch (error) {
            console.error("Nashmi Chat Error:", error);
            const errorMsg = {
                id: Date.now() + 2,
                sender: 'bot',
                text: isAr ? 'عذراً، واجهت مشكل تقني بسيط. جرب تبعث رسالتك مر ثاني!' : 'Sorry, I encountered a small technical issue. Please try sending your message again!'
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsTyping(false);
        }
    };

    const renderMessageContent = (msg) => {
        // 1. Course Card Render
        if (msg.type === 'course_card') {
            const course = msg.data;
            const hasFiles = Object.keys(course.files || {}).length > 0;

            return (
                <div className="chat-rich-content">
                    <p>{msg.text}</p>
                    <div className="chat-course-card glass-card">
                        <div className="chat-card-header">
                            <span className="chat-card-icon">{course.icon || '📘'}</span>
                            <div>
                                <h4>{isAr ? course.name : course.nameEn}</h4>
                                <span className="chat-card-badge">{isAr ? 'مادة دراسي' : 'Course'}</span>
                            </div>
                        </div>

                        {hasFiles ? (
                            <div className="chat-card-actions">
                                {Object.entries(course.files).slice(0, 3).map(([type, url]) => (
                                    <a href={url} target="_blank" rel="noreferrer" key={type} className="chat-action-btn">
                                        {type === 'pdf' ? (isAr ? '📄 ملف PDF' : '📄 PDF') :
                                            type === 'video' ? (isAr ? '🎥 فيديو' : '🎥 Video') :
                                                (isAr ? '🔗 رابط' : '🔗 Link')}
                                    </a>
                                ))}
                                <button
                                    onClick={() => navigate('/materials')}
                                    className="chat-action-btn primary"
                                >
                                    {isAr ? 'كل المصادر' : 'All Resources'}
                                </button>
                            </div>
                        ) : (
                            <p className="chat-card-empty">{isAr ? 'لا توجد ملفات حالياً' : 'No files yet'}</p>
                        )}
                    </div>
                </div>
            );
        }

        // 2. Page Link Render
        if (msg.type === 'page_card') {
            const page = msg.data;
            return (
                <div className="chat-rich-content">
                    <p>
                        {(isAr ? `بتقدر تلاقي اللي بتدور عليه بصفح **${page.titleAr}**:` : `You can find what you need in the **${page.titleEn}** page:`)
                            .split('**').map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
                    </p>
                    <div
                        onClick={() => navigate(page.path)}
                        className="chat-page-link glass-card"
                        style={{ cursor: 'pointer' }}
                    >
                        <span className="page-link-icon">{page.icon}</span>
                        <div className="page-link-info">
                            <h4>{isAr ? page.titleAr : page.titleEn}</h4>
                            <span className="page-link-arrow">←</span>
                        </div>
                    </div>
                </div>
            );
        }

        // 3. Standard Text Render (with link parsing)
        return msg.text.split('\n').map((line, i) => (
            <span key={i}>
                {line.split('**').map((part, j) => {
                    if (j % 2 === 1) return <strong key={j}>{part}</strong>;

                    // Improved Link Regex: Matches [text](/url) or [text](http...)
                    // Using non-greedy capture and allowing for spaces/unicode in text
                    const parts = [];
                    let remaining = part;
                    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/;

                    while (remaining) {
                        const match = remaining.match(linkRegex);
                        if (!match) {
                            parts.push(remaining);
                            break;
                        }

                        // Push text before link
                        if (match.index > 0) {
                            parts.push(remaining.substring(0, match.index));
                        }

                        // Push link
                        const [fullMatch, label, url] = match;
                        parts.push(
                            <a
                                key={`${i}-${j}-${parts.length}`}
                                href={url}
                                className="chat-link-action"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (url.startsWith('/')) {
                                        navigate(url);
                                    } else if (url.startsWith('#')) {
                                        const element = document.querySelector(url);
                                        if (element) element.scrollIntoView({ behavior: 'smooth' });
                                    } else {
                                        window.open(url, '_blank', 'noopener,noreferrer');
                                    }
                                }}
                            >
                                {label}
                            </a>
                        );

                        remaining = remaining.substring(match.index + fullMatch.length);
                    }
                    return parts;
                })}
                <br />
            </span>
        ));
    };

    return (
        <section id="lemon-chat" className="lemon-chat-section">
            <div className="lemon-background"></div>

            <div className="section-header">
                <h2 className="section-title">{t('chat.title')}</h2>
                <p className="section-subtitle">{t('chat.subtitle')}</p>
            </div>

            <div className="chat-container glass">
                <div className="chat-messages">
                    {messages.map(msg => (
                        <div key={msg.id} className={`message ${msg.sender}`}>
                            <div className="message-bubble">
                                {renderMessageContent(msg)}
                            </div>
                        </div>
                    ))}
                    {isTyping && <div className="message bot typing">{t('chat.typing')}</div>}
                    <div ref={messagesEndRef} />
                </div>

                <form className="chat-input-area" onSubmit={handleSend}>
                    <input
                        type="text"
                        placeholder={t('chat.placeholder')}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                    />
                    <button type="submit" className="btn-primary">{t('chat.send')}</button>
                </form>
            </div>

            <div className="quick-suggestions">
                {[t('nav.plans'), t('chat.materials'), t('chat.calendar'), t('chat.news'), t('nav.about')].map(link => (
                    <button key={link} onClick={() => setInput(link)} className="suggestion-btn">
                        {link}
                    </button>
                ))}
            </div>
        </section>
    );
};

export default LemonChat;
