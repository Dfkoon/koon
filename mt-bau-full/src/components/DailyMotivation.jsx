import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './DailyMotivation.css';

const QUOTES = {
    ar: [
        { text: 'النجاح ليس نهاي الطريق، والفشل ليس نهاي الأمل. الشجاع هي ما يستمر.', author: 'ونستون تشرشل' },
        { text: 'التعليم هو أقوى سلاح يمكنك استدامه لتغيير العالم.', author: 'نيلسون مانديلا' },
        { text: 'لا تقل لم أستطع، بل قل لم أحاول بعد.', author: 'مجهول' },
        { text: 'كل بير كان في يوم من الأيام مبتدئاً. لا تجل من البداي.', author: 'هيلين هايز' },
        { text: 'الإراد تتغلب على ما يبدو مستحيلاً.', author: 'مجهول' },
        { text: 'الدراس ليست عبئاً، إنها استثمار في نفسك ومستقبلك.', author: 'مجهول' },
        { text: 'كل يوم جديد هو فرص جديد لتكون أفضل مما كنت عليه أمس.', author: 'مجهول' },
        { text: 'المعرف قو، لكن تطبيق المعرف هو السلط الحقيقي.', author: 'فرنسيس بيكون' },
        { text: 'الذكاء هو القدر على التكيف مع التغيير.', author: 'ستيفن هوكينج' },
        { text: 'امنح كل يوم فرص لأن يكون أجمل أيامك.', author: 'مارك توين' },
    ],
    en: [
        { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
        { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
        { text: "Don't say I can't, say I haven't tried yet.", author: 'Anonymous' },
        { text: 'Every expert was once a beginner. Never be ashamed of starting.', author: 'Helen Hayes' },
        { text: 'Where there is a will, there is a way.', author: 'Anonymous' },
        { text: 'Studying is not a burden; it is an investment in yourself and your future.', author: 'Anonymous' },
        { text: 'Every new day is a new chance to be better than you were yesterday.', author: 'Anonymous' },
        { text: 'Knowledge is power, but the application of knowledge is true authority.', author: 'Francis Bacon' },
        { text: 'Intelligence is the ability to adapt to change.', author: 'Stephen Hawking' },
        { text: 'Give every day the chance to become the most beautiful day of your life.', author: 'Mark Twain' },
    ]
};

const DailyMotivation = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const getDailyIndex = () => {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        return dayOfYear % QUOTES.ar.length;
    };

    const [quoteIdx, setQuoteIdx] = useState(getDailyIndex());
    const [fading, setFading] = useState(false);

    const quotes = isAr ? QUOTES.ar : QUOTES.en;
    const quote = quotes[quoteIdx];

    const handleRefresh = () => {
        setFading(true);
        setTimeout(() => {
            setQuoteIdx(prev => (prev + 1) % quotes.length);
            setFading(false);
        }, 300);
    };

    return (
        <div className="daily-motivation-card glass-card">
            <div className="motivation-top-bar">
                <span className="motivation-badge">✨ {isAr ? 'اقتباس اليوم' : "Today's Quote"}</span>
                <button className="motivation-refresh-btn" onClick={handleRefresh} title={isAr ? 'اقتباس آر' : 'Next quote'}>
                    🔄
                </button>
            </div>
            <div className={`motivation-body ${fading ? 'fade-out' : 'fade-in'}`}>
                <blockquote className="motivation-quote">
                    <span className="quote-mark">"</span>
                    {quote.text}
                    <span className="quote-mark">"</span>
                </blockquote>
                <cite className="motivation-author">— {quote.author}</cite>
            </div>
        </div>
    );
};

export default DailyMotivation;
