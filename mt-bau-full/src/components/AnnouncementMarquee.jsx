import React, { useMemo, useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { academicCalendarData } from '../data/calendarData';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import './AnnouncementMarquee.css';

const AnnouncementMarquee = () => {
    const { t, language } = useLanguage();
    const [urgentNews, setUrgentNews] = useState([]);

    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, 'urgent_news'), (snapshot) => {
            const news = snapshot.docs
                .map(item => ({ id: item.id, ...item.data() }))
                .filter(item => item.active && (item.titleAr || item.titleEn));
            setUrgentNews(news);
        }, (error) => console.warn('Failed to load urgent news:', error));
        return () => unsubscribe();
    }, []);

    const upcomingEvents = useMemo(() => {
        const allEvents = [
            ...academicCalendarData.firstSemester.events,
            ...academicCalendarData.secondSemester.events,
            ...academicCalendarData.summerSemester.events
        ];

        const normalizeDate = (dateStr) => {
            const [startDate] = dateStr.split('-').map(str => str.trim());
            const [year, month, day] = startDate.split('/').map(Number);
            if (!year || !month || !day) return null;
            return new Date(year, month - 1, day);
        };

        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        return allEvents
            .map(event => ({ ...event, parsedDate: normalizeDate(event.date) }))
            .filter(event => event.parsedDate && !Number.isNaN(event.parsedDate.getTime()) && event.parsedDate >= todayStart)
            .sort((a, b) => a.parsedDate - b.parsedDate)
            .slice(0, 2);
    }, []);

    const messages = urgentNews.length > 0
        ? urgentNews.map(item => ({
            text: language === 'ar' ? (item.titleAr || item.titleEn) : (item.titleEn || item.titleAr),
            link: item.link || ''
        }))
        : upcomingEvents.length > 0
            ? upcomingEvents.map(event => {
                const title = language === 'ar' ? event.event : event.eventEn;
                const dayText = language === 'ar' ? event.day : event.dayEn;
                return { text: `${dayText} ${event.date} — ${title}`, link: '' };
            })
            : [
                t('marquee.text1'),
                t('marquee.text2')
            ].filter(msg => msg && msg.trim() !== '').map(text => ({ text, link: '' }));

    // Build a single row of items with separators
    const renderItems = () => messages.map((msg, index) => (
        <span key={index} className="marquee-item">
            {msg.link ? <a href={msg.link} target="_blank" rel="noreferrer">{msg.text}</a> : msg.text}
            <img src="/static_logo.png" alt="•" className="marquee-separator" />
        </span>
    ));

    return (
        <div className="marquee-container">
            <div className="marquee-label">{t('marquee.label')}</div>
            <div className="marquee-track-wrapper">
                {/* Two identical copies so the scroll loops perfectly without any gap */}
                <div className="marquee-track">
                    {renderItems()}
                    {renderItems()}
                </div>
            </div>
        </div>
    );
};

export default AnnouncementMarquee;
