import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './FeatureShowcase.css';

// Import existing hero images
import plansHero from '../assets/heros/academic_plans_hero.png';
import calendarHero from '../assets/heros/calendar_hero.png';
import exchangeHero from '../assets/heros/exchange_hero.png';
import gradingHero from '../assets/heros/grading_system_hero.png';
import quizHero from '../assets/heros/quiz_hero.png';
import newsHero from '../assets/heros/news_hero.png';
import logoWatermark from '../assets/logo-watermark.png'; // Using as fallback/brand image

// Fallback images or re-used ones could be handled, but we'll use conditional rendering
// For Materials, FAQ, About - we might need placeholders or just text/icon layouts if no image.

const FeatureShowcase = () => {
    const { t, language } = useLanguage();
    const isAr = language === 'ar';

    // Simple Intersection Observer to trigger animations
    React.useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1 });

        const rows = document.querySelectorAll('.feature-row');
        rows.forEach(row => observer.observe(row));

        return () => rows.forEach(row => observer.unobserve(row));
    }, []);

    const features = [
        {
            id: 'materials',
            title: t('materials.hero.title'),
            desc: t('materials.hero.subtitle'), // "Explore all study materials..."
            link: '/materials',
            image: '/assets/faculties/ai-faculty.png', // Using AI Faculty image from public/assets
            icon: '📚',
            color: 'var(--blue-500)', // Example colors or use CSS variables
        },
        {
            id: 'plans',
            title: t('plans.hero.title'),
            desc: t('plans.hero.subtitle'),
            link: '/plans',
            image: plansHero,
            icon: '🎓',
            color: 'var(--green-500)',
        },
        {
            id: 'quiz',
            title: t('quiz.hero.title'),
            desc: t('quiz.hero.subtitle'),
            link: '/quiz',
            image: quizHero,
            icon: '📝',
            color: 'var(--purple-500)',
        },
        {
            id: 'calendar',
            title: t('calendar.hero.title'),
            desc: t('calendar.hero.subtitle'),
            link: '/calendar',
            image: calendarHero,
            icon: '📅',
            color: 'var(--orange-500)',
        },
        {
            id: 'grading',
            title: t('gpa.title'), // "GPA Calculator" or "Grading System"
            desc: t('service.4.desc'), // "Track your academic performance..."
            link: '/grading',
            image: gradingHero,
            icon: '📊',
            color: 'var(--red-500)',
        },
        {
            id: 'exchange',
            title: t('nav.exchange'), // "Material Exchange"
            desc: t('service.6.desc'), // "Opportunity to exchange books..."
            link: '/exchange',
            image: exchangeHero,
            icon: '🤝',
            color: 'var(--teal-500)',
        },
        {
            id: 'faq',
            title: t('nav.faq'), // "FAQ"
            desc: t('services.subtitle'), // Generic or add specific? Re-using generic for now or custom text
            customDesc: isAr ? 'إجابات على جميع الأسئلة الشائعة التي قد تطر ببالك حول الجامعة والدراس.' : 'Answers to all common questions you might have about university and studies.',
            link: '/faq',
            image: newsHero, // Using News Hero as generic "Info" graphic
            icon: '❓',
            color: 'var(--yellow-500)',
        },
        {
            id: 'about',
            title: t('nav.about'), // "About Us"
            desc: t('hero.subtitle'), // re-use hero subtitle?
            link: '/about',
            image: logoWatermark, // Using Logo for About Us
            icon: 'ℹ️',
            color: 'var(--indigo-500)',
        }
    ];

    return (
        <section className="feature-showcase-section">
            {features.map((feature, index) => (
                <div
                    key={feature.id}
                    className={`feature-row ${index % 2 !== 0 ? 'reverse' : ''}`}
                // Remove data-aos if not using the library, leveraging custom 'visible' class
                >
                    <div className="feature-content">
                        <div className="feature-icon-wrapper">
                            <span className="feature-icon">{feature.icon}</span>
                        </div>
                        <h2 className="feature-title">{feature.title}</h2>
                        <p className="feature-desc">
                            {feature.customDesc || feature.desc}
                        </p>
                        <Link to={feature.link} className="feature-btn">
                            {isAr ? 'عرض التفاصيل' : 'View Details'}
                            <span className="btn-arrow">{isAr ? '←' : '→'}</span>
                        </Link>
                    </div>

                    {/* feature-visual مفي مؤقتاً */}

                </div>
            ))}
        </section>
    );
};

export default FeatureShowcase;
