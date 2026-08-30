import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './CookieConsent.css';

const CookieConsent = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if user has already consented
        const hasConsented = localStorage.getItem('makanak_cookie_consent');
        if (!hasConsented) {
            // Show banner after a short delay for smooth entrance
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('makanak_cookie_consent', 'true');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="cookie-consent-wrapper">
            <div className="cookie-consent-card glass-card">
                <div className="cookie-consent-content">
                    <div className="cookie-consent-icon-wrapper">
                        <span className="cookie-consent-icon">🔒</span>
                    </div>
                    <div className="cookie-consent-text">
                        <h4>{isAr ? 'نحن نهتم بصوصيتك' : 'We care about your privacy'}</h4>
                        <p>
                            {isAr
                                ? 'يستدم موقع "مكانك" ملفات تعريف الارتباط لتوفير تجرب مستدم ممتاز وحفظ تفضيلاتك (مثل اللغ والمظهر الداكن). باستمرارك في التصفح، فإنك توافق على سياس الصوصي الخاص بنا.'
                                : 'Makanak uses cookies to enhance your browsing experience, analyze site usage, and remember your preferences (like language and dark theme). By continuing to browse, you agree to our privacy policy.'}
                        </p>
                    </div>
                </div>
                <div className="cookie-consent-actions">
                    <button className="cookie-accept-btn" onClick={handleAccept}>
                        {isAr ? 'حسناً، موافق' : 'Got it, accept'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CookieConsent;
