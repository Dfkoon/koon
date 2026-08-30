import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './BackToTopBtn.css';

const BackToTopBtn = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > 400);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <button
            className={`back-to-top-btn ${visible ? 'visible' : ''}`}
            onClick={scrollToTop}
            aria-label={isAr ? 'العود للأعلى' : 'Back to top'}
            title={isAr ? 'العود للأعلى' : 'Back to top'}
        >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
            </svg>
        </button>
    );
};

export default BackToTopBtn;
