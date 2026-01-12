import React, { createContext, useContext, useState, useEffect } from 'react';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'ar');

    useEffect(() => {
        localStorage.setItem('language', language);
        document.dir = language === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = language;
    }, [language]);

    const toggleLanguage = () => {
        setLanguage(prev => prev === 'ar' ? 'en' : 'ar');
    };

    const translations = {
        ar: {
            home: 'الرئيسية',
            plans: 'الخطة الدراسية',
            materials: 'المواد',
            exams: 'الامتحانات',
            more: 'المزيد',
            usefulSites: 'مواقع مفيدة',
            faq: 'الأسئلة الشائعة',
            studentLibrary: 'المكتبة الطلابية',
            dashboard: 'لوحة التحكم',
            qna: 'الأسئلة والأجوبة',
            reports: 'البلاغات',
            analytics: 'التحليلات',
            testimonials: 'الشهادات',
            requests: 'الطلبات',
            subscribers: 'المشتركون',
            login: 'تسجيل الدخول',
            adminConnect: 'اتصال المسؤول',
            logout: 'تسجيل الخروج',
            adminSuggestions: 'الاقتراحات والشكاوى',
            adminReports: 'بلاغات الأسئلة',
        },
        en: {
            home: 'Home',
            plans: 'Study Plans',
            materials: 'Materials',
            exams: 'Exams',
            more: 'More',
            usefulSites: 'Useful Sites',
            faq: 'FAQ',
            studentLibrary: 'Student Library',
            dashboard: 'Dashboard',
            qna: 'Q&A',
            reports: 'Reports',
            analytics: 'Analytics',
            testimonials: 'Testimonials',
            requests: 'Requests',
            subscribers: 'Subscribers',
            login: 'Login',
            adminConnect: 'Admin Connect',
            logout: 'Logout',
            adminSuggestions: 'Suggestions & Feedback',
            adminReports: 'Question Reports',
        }
    };

    const t = (key) => {
        return translations[language][key] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, t, setLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
