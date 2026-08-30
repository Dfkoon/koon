import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, useMotionValue, useSpring, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { subscribeToApprovedTestimonials } from '../services/testimonialsService';
import TestimonialForm from '../components/TestimonialForm';
import './Testimonials.css';

const fallbackTestimonials = {
    ar: [
        {
            quote: "الي عامل الموقع هاض فنان! الثيمات (Themes) جد رهيب والشغل متعوب عليه. تجرب مستدم فم 🚀",
            author: "أحمد إسماعيل",
            gender: "male",
            major: "هندس البرمجيات",
            avatar: "/assets/avatars/flork_cool.png"
        },
        {
            quote: "الموقع ساعدني كثير في دراستي! المواد منظم والملصات واضح. شكراً للفريق المتطوع 💙",
            author: "أحمد محمود",
            gender: "male",
            major: "التحقيقات الجنائي الرقمي",
            avatar: "/assets/avatars/flork_crying.png"
        },
        {
            quote: "أفضل مصدر للمواد الدراسي! التقويم الأكاديمي والاتبارات التفاعلي سهلت علي الدراس كثير 🎓",
            author: "سار العلي",
            gender: "female",
            major: "علوم الحاسوب",
            avatar: "/assets/avatars/flork_heart.png"
        }
    ],
    en: [
        {
            quote: "Whoever made this site is an artist! The themes are truly awesome and the effort is clear. Premium user experience! 🚀",
            author: "Ahmad Ismaeel",
            major: "Software Engineering",
            avatar: "/assets/avatars/flork_cool.png"
        },
        {
            quote: "This website helped me a lot in my studies! The materials are organized and summaries are clear. Thanks to the volunteer team 💙",
            author: "Ahmad Mahmoud",
            major: "Digital Forensics",
            avatar: "/assets/avatars/flork_crying.png"
        },
        {
            quote: "Best source for study materials! The academic calendar and interactive quizzes made studying much easier 🎓",
            author: "Sarah Al-Ali",
            major: "Computer Science",
            avatar: "/assets/avatars/flork_heart.png"
        }
    ]
};

function usePreloadImages(images) {
    useEffect(() => {
        images.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, [images]);
}

function SplitText({ text }) {
    if (!text) return null;
    const words = text.split(' ');

    return (
        <span className="split-text-wrapper">
            {words.map((word, i) => (
                <motion.span
                    key={i}
                    initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{
                        duration: 0.4,
                        delay: i * 0.03,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                    className="testimonial-word"
                >
                    {word}
                </motion.span>
            ))}
        </span>
    );
}

const Testimonials = () => {
    const { language } = useLanguage();
    const [activeIndex, setActiveIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const [firebaseTestimonials, setFirebaseTestimonials] = useState([]);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef(null);

    // Subscribe to Firebase testimonials
    useEffect(() => {
        // setLoading(true);
        const unsubscribe = subscribeToApprovedTestimonials((approved) => {
            const languageFiltered = approved.filter(t => t.language === language);
            setFirebaseTestimonials(languageFiltered);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [language]);

    // Keep fallback content only while Firebase has no testimonials.
    const florkMaleAvatars = [
        '/assets/avatars/flork_cool.png',
        '/assets/avatars/flork_cool_v2.png',
        '/assets/avatars/flork_crying.png'
    ];
    const florkFemaleAvatars = [
        '/assets/avatars/flork_heart.png',
        '/assets/avatars/flork_female_grad.png',
        '/assets/avatars/flork_female_cool.png'
    ];

    const testimonials = [
        ...(firebaseTestimonials.length > 0
            ? firebaseTestimonials
            : (fallbackTestimonials[language] || fallbackTestimonials.ar))
    ].map((t, idx) => {
        let avatar = t.avatar;
        if (!avatar || !avatar.startsWith('/assets/avatars/flork')) {
            const isFemale = t.gender === 'female' ||
                (t.role && t.role.toLowerCase().includes('female')) ||
                (t.author && t.author.includes('طالب'));
            const avatarList = isFemale ? florkFemaleAvatars : florkMaleAvatars;
            avatar = avatarList[idx % avatarList.length];
        }
        return {
            ...t,
            avatar
        };
    });

    usePreloadImages(testimonials.map((t) => t.avatar));

    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    const springConfig = { damping: 25, stiffness: 150 };
    const cursorX = useSpring(mouseX, springConfig);
    const cursorY = useSpring(mouseY, springConfig);

    const handleMouseMove = useCallback(
        (e) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            mouseX.set(e.clientX - rect.left);
            mouseY.set(e.clientY - rect.top);
        },
        [mouseX, mouseY]
    );

    const handleNext = () => {
        setActiveIndex((prev) => (prev + 1) % testimonials.length);
    };

    // Auto-play: Change testimonial every 5 seconds
    useEffect(() => {
        // Don't auto-play if user is hovering or if there's only one testimonial
        if (isHovered || testimonials.length <= 1) return;

        const interval = setInterval(() => {
            handleNext();
        }, 5000); // 5 seconds

        return () => clearInterval(interval);
    }, [isHovered, testimonials.length]);

    const currentTestimonial = testimonials[activeIndex];

    if (!currentTestimonial) return null;

    return (
        <section className="testimonials-section">
            <div className="testimonials-header">
                <h2 className="testimonials-title">💬 {language === 'ar' ? 'آراء الطلاب' : 'Student Reviews'}</h2>
            </div>

            {/* Testimonial Submission Form */}
            <TestimonialForm />

            {loading ? (
                <div className="testimonials-loading">
                    <p>{language === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
                </div>
            ) : (
                <div
                    ref={containerRef}
                    className="testimonial-container"
                    style={{ cursor: 'none' }}
                    onMouseMove={handleMouseMove}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    onClick={handleNext}
                >
                    {/* Custom magnetic cursor */}
                    <motion.div
                        className="custom-cursor"
                        style={{
                            x: cursorX,
                            y: cursorY,
                            translateX: '-50%',
                            translateY: '-50%',
                        }}
                    >
                        <motion.div
                            className="cursor-inner"
                            animate={{
                                width: isHovered ? 80 : 0,
                                height: isHovered ? 80 : 0,
                                opacity: isHovered ? 1 : 0,
                            }}
                            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        >
                            <motion.span
                                className="cursor-text"
                                animate={{ opacity: isHovered ? 1 : 0 }}
                                transition={{ delay: 0.1 }}
                            >
                                {language === 'ar' ? 'التالي' : 'Next'}
                            </motion.span>
                        </motion.div>
                    </motion.div>

                    {/* Index indicator */}
                    <motion.div
                        className="testimonial-index"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                    >
                        <motion.span
                            className="index-current"
                            key={activeIndex}
                            initial={{ y: 10, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ duration: 0.3 }}
                        >
                            {String(activeIndex + 1).padStart(2, '0')}
                        </motion.span>
                        <span className="index-separator">/</span>
                        <span className="index-total">{String(testimonials.length).padStart(2, '0')}</span>
                    </motion.div>

                    {/* Avatar previews */}
                    <motion.div
                        className="avatar-previews"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        transition={{ delay: 0.6 }}
                    >
                        {testimonials.map((t, i) => (
                            <motion.div
                                key={i}
                                className={`avatar-preview ${i === activeIndex ? 'active' : ''}`}
                                whileHover={{ scale: 1.1, opacity: 1 }}
                            >
                                <img src={t.avatar} alt={t.author} />
                            </motion.div>
                        ))}
                    </motion.div>

                    {/* Main content */}
                    <div className="testimonial-content">
                        <AnimatePresence mode="wait">
                            <motion.blockquote
                                key={activeIndex}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                className="testimonial-quote"
                            >
                                <SplitText text={currentTestimonial.quote} />
                            </motion.blockquote>
                        </AnimatePresence>

                        {/* Author info */}
                        <motion.div className="testimonial-author-wrapper" layout>
                            <div className="author-info-container">
                                {/* Avatar */}
                                <div className="author-avatar-container">
                                    <motion.div
                                        className="avatar-border"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ duration: 0.5 }}
                                    />
                                    {testimonials.map((t, i) => (
                                        <motion.img
                                            key={t.id || i}
                                            src={t.avatar}
                                            alt={t.author}
                                            className="author-avatar"
                                            animate={{
                                                opacity: i === activeIndex ? 1 : 0,
                                                zIndex: i === activeIndex ? 1 : 0,
                                            }}
                                            transition={{ duration: 0.4, ease: 'easeInOut' }}
                                        />
                                    ))}
                                </div>

                                {/* Author details */}
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeIndex}
                                        className="author-details"
                                        initial={{ opacity: 0, x: language === 'ar' ? 10 : -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: language === 'ar' ? -10 : 10 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <motion.div
                                            className="author-line"
                                            initial={{ scaleY: 0 }}
                                            animate={{ scaleY: 1 }}
                                            transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                                        />
                                        <div className="name-verified-row">
                                            <span className="author-name">{currentTestimonial.author || currentTestimonial.name}</span>
                                            <span className="verified-badge" title="Verified Member">✓</span>
                                        </div>
                                        <span className="author-role">
                                            {currentTestimonial.major}
                                        </span>
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </motion.div>

                        {/* Progress bar */}
                        <div className="testimonial-progress">
                            <motion.div
                                className="progress-fill"
                                initial={{ width: '0%' }}
                                animate={{ width: `${((activeIndex + 1) / testimonials.length) * 100}%` }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            />
                        </div>
                    </div>

                    {/* Click hint */}
                    <motion.div
                        className="click-hint"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isHovered ? 0.4 : 0.2 }}
                        transition={{ duration: 0.3 }}
                    >
                        <span>{language === 'ar' ? 'اضغط في أي مكان' : 'Click anywhere'}</span>
                    </motion.div>
                </div>
            )}
        </section>
    );
};

export default Testimonials;
