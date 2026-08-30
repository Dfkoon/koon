import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './SmartNotification.css';

const DISMISS_KEY = 'koon_notif_dismissed_v1';

const NOTIFICATIONS = {
    '/': [
        {
            id: 'home-gpa',
            emoji: '📊',
            titleAr: 'احسب معدلك الآن!',
            titleEn: 'Calculate your GPA now!',
            msgAr: 'هل تعرف معدلك التراكمي بدق؟ جرّب حاسب المعدل الجديد مع نظام باق التحسين.',
            msgEn: 'Do you know your exact cumulative GPA? Try our new GPA calculator with the upgrade planner.',
            link: '/grading',
            type: 'info',
        }
    ],
    '/materials': [
        {
            id: 'materials-rate',
            emoji: '⭐',
            titleAr: 'ساعد زملاءك!',
            titleEn: 'Help your classmates!',
            msgAr: 'بعد تحميل الملف، قيّم المادة بالنجوم لمساعد الطلاب الآخرين على اختيار أفضل المراجع.',
            msgEn: 'After downloading, rate the material with stars to help other students pick the best references.',
            type: 'tip',
        }
    ],
    '/grading': [
        {
            id: 'grading-target',
            emoji: '🎯',
            titleAr: 'حدّد هدفك الدراسي!',
            titleEn: 'Set your academic target!',
            msgAr: 'استدم مخطط معدل الهدف لمعرف كم تحتاج تحصل في كل مادة لترفع معدلك.',
            msgEn: 'Use the Target GPA planner to know exactly what grades you need to raise your average.',
            type: 'success',
        }
    ],
    '/quiz': [
        {
            id: 'quiz-streak',
            emoji: '🔥',
            titleAr: 'تحدِّ نفسك يومياً!',
            titleEn: 'Challenge yourself daily!',
            msgAr: 'حاول تحل كويز جديد كل يوم للحفاظ على مستواك وتعزيز ذاكرتك.',
            msgEn: 'Try to solve a new quiz every day to maintain your level and strengthen your memory.',
            type: 'tip',
        }
    ]
};

const SmartNotification = () => {
    const { language } = useLanguage();
    const location = useLocation();
    const isAr = language === 'ar';

    const [visible, setVisible] = useState(false);
    const [current, setCurrent] = useState(null);
    const [dismissed, setDismissed] = useState(() => {
        try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); }
        catch { return []; }
    });

    const showNextNotif = useCallback(() => {
        const path = location.pathname;
        const pool = NOTIFICATIONS[path] || NOTIFICATIONS['/'];
        // Global fallback pool
        const allNotifs = Object.values(NOTIFICATIONS).flat();
        const combined = [...(pool || []), ...allNotifs.filter(n => !pool?.find(p => p.id === n.id))];

        const next = combined.find(n => !dismissed.includes(n.id));
        if (next) {
            setCurrent(next);
            setVisible(true);
        }
    }, [location.pathname, dismissed]);

    useEffect(() => {
        const delay = setTimeout(showNextNotif, 4000);
        return () => clearTimeout(delay);
    }, [location.pathname]);

    const handleDismiss = () => {
        if (current) {
            const updated = [...dismissed, current.id];
            setDismissed(updated);
            try { localStorage.setItem(DISMISS_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
        }
        setVisible(false);
    };

    const handleAction = () => {
        handleDismiss();
    };

    if (!visible || !current) return null;

    return (
        <div className={`smart-notif-wrapper ${current.type || 'info'} ${isAr ? 'rtl' : 'ltr'}`} role="alert">
            <div className="smart-notif-icon">{current.emoji}</div>
            <div className="smart-notif-body">
                <strong className="smart-notif-title">{isAr ? current.titleAr : current.titleEn}</strong>
                <p className="smart-notif-msg">{isAr ? current.msgAr : current.msgEn}</p>
                {current.link && (
                    <a
                        href={`#${current.link}`}
                        className="smart-notif-action"
                        onClick={handleAction}
                    >
                        {isAr ? 'اذهب الآن ←' : 'Go now →'}
                    </a>
                )}
            </div>
            <button
                className="smart-notif-close"
                onClick={handleDismiss}
                aria-label={isAr ? 'إغلاق' : 'Close'}
            >×</button>
        </div>
    );
};

export default SmartNotification;
