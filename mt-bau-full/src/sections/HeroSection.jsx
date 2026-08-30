import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import CountUp from '../components/CountUp';
import { getTotalStudentVisits } from '../services/analyticsService';
import { coursesData, categories } from '../data/coursesData';
import { quizCategories } from '../data/quizData';
import { db } from '../config/firebase';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import heroVideo from '../assets/video/video1.mp4';
import './HeroSection.css';

const HeroSection = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [ballCount, setBallCount] = useState(75);
    const [heroVisitorsCount, setHeroVisitorsCount] = useState(0);
    const [heroMaterialsCount, setHeroMaterialsCount] = useState(0);
    const [heroQuizzesCount, setHeroQuizzesCount] = useState(0);
    const [heroCopy, setHeroCopy] = useState({ title: '', subtitle: '' });

    useEffect(() => {
        const handleResize = () => {
            setBallCount(window.innerWidth < 768 ? 35 : 75);
        };

        const loadVisitorCount = async () => {
            const count = await getTotalStudentVisits();
            setHeroVisitorsCount(count || 0);
        };

        const updateMaterialCount = (snapshot) => {
            const mergedCourses = {};
            Object.keys(coursesData).forEach(categoryId => {
                mergedCourses[categoryId] = [...(coursesData[categoryId] || [])];
            });

            snapshot.forEach(courseDoc => {
                const course = { id: courseDoc.id, ...courseDoc.data() };
                const categoryId = course.category;
                if (!categoryId) return;
                if (!mergedCourses[categoryId]) mergedCourses[categoryId] = [];

                const existingIndex = mergedCourses[categoryId].findIndex(
                    item => String(item.id) === String(course.id)
                );
                if (course.deleted) {
                    if (existingIndex >= 0) mergedCourses[categoryId].splice(existingIndex, 1);
                } else if (course.custom) {
                    const mappedCourse = {
                        id: course.id,
                        name: course.name,
                        nameEn: course.nameEn,
                        files: course.files || {},
                    };
                    if (existingIndex >= 0) mergedCourses[categoryId][existingIndex] = mappedCourse;
                    else mergedCourses[categoryId].push(mappedCourse);
                }
            });

            const facultyCategoryIds = new Set(
                categories
                    .filter(category => category.faculty === 'ai' || category.faculty === 'it')
                    .map(category => category.id)
            );
            const courseIds = new Set();
            facultyCategoryIds.forEach(categoryId => {
                (mergedCourses[categoryId] || []).forEach(course => courseIds.add(`${categoryId}:${course.id}`));
            });
            setHeroMaterialsCount(courseIds.size);
        };

        const updateQuizCount = (snapshot) => {
            const dynamicSubjects = snapshot.docs.map(quizDoc => quizDoc.id);
            let localParts = [];
            try {
                localParts = Object.keys(JSON.parse(localStorage.getItem('koon_local_quiz_subjects') || '{}'));
            } catch { /* Ignore malformed local quiz data. */ }

            const subjectIds = new Set([
                ...quizCategories.map(category => category.id),
                ...dynamicSubjects,
                ...localParts,
            ]);
            setHeroQuizzesCount(subjectIds.size);
        };

        getDoc(doc(db, 'system_configs', 'global_settings')).then(snapshot => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            setHeroCopy({
                title: data.home_hero_title || '',
                subtitle: data.home_hero_subtitle || '',
            });
        }).catch(error => console.warn('Failed to load homepage hero settings:', error));

        const unsubscribeCourses = onSnapshot(collection(db, 'academic_courses'), updateMaterialCount, () => {
            updateMaterialCount({ forEach: () => { } });
        });
        const unsubscribeQuizzes = onSnapshot(collection(db, 'quiz_subjects'), updateQuizCount, () => {
            updateQuizCount({ docs: [] });
        });

        loadVisitorCount();
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            unsubscribeCourses();
            unsubscribeQuizzes();
        };
    }, []);

    return (
        <section id="hero" className="hero-section">
            <div className="hero-background">

                {/* ─── DIRECT BUNDLED ULTRA HD VIDEO ─── */}
                <div className="hero-video-wrapper">
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        src={heroVideo}
                        className="hero-bg-video"
                    />
                </div>

                {/* ─── BALLPIT OPTION (DISABLED FROM DISPLAY & KEPT IN PROJECT CODEBASE) ───
                <div className="ballpit-wrapper">
                    <Ballpit
                        count={ballCount}
                        gravity={0.4}
                        friction={0.99}
                        wallBounce={0.95}
                        followCursor={true}
                        colors={['#000000', '#ffffff', '#007a3d', '#ce1126']}
                    />
                </div>
                ───────────── */}

                <div className="overlay"></div>
            </div>

            <div className="hero-content animate-fade">
                <div className="title-frame">
                    <h1 className="hero-title">
                        {heroCopy.title || t('hero.title')} {!heroCopy.title && <span className="highlight">{t('hero.title.highlight')}</span>}
                    </h1>
                    <span className="frame-corner frame-bl" />
                    <span className="frame-corner frame-br" />
                </div>
                <p className="hero-subtitle">
                    {heroCopy.subtitle || t('hero.subtitle')}
                </p>

                <div className="hero-btns">
                    <button className="btn-primary btn-lg" onClick={() => navigate('/materials')}>
                        {t('hero.btn.materials')}
                    </button>
                    <button className="btn-secondary btn-lg" onClick={() => navigate('/calendar')}>
                        {t('hero.btn.calendar')}
                    </button>
                </div>

                <div className="hero-stats">
                    <div className="stat-item">
                        <span className="stat-value">
                            +<CountUp to={heroMaterialsCount} duration={2.5} className="count-up-text" />
                        </span>
                        <span className="stat-label">{t('hero.stat.materials')}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">
                            +<CountUp to={heroVisitorsCount} duration={2.5} className="count-up-text" />
                        </span>
                        <span className="stat-label">{t('hero.stat.students')}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">
                            +<CountUp to={heroQuizzesCount} duration={2.5} className="count-up-text" />
                        </span>
                        <span className="stat-label">{t('hero.stat.quizzes')}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-value">24/7</span>
                        <span className="stat-label">{t('hero.stat.support')}</span>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HeroSection;
