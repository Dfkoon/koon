import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { academicCalendarData } from '../data/calendarData';
import './UpcomingEvents.css';

const UpcomingEvents = () => {
    const { t, language } = useLanguage();
    const navigate = useNavigate();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentDate, setCurrentDate] = useState(new Date());

    // Update current date every hour to auto-refresh events
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentDate(new Date());
        }, 60 * 60 * 1000); // Update every hour

        return () => clearInterval(interval);
    }, []);

    const upcomingEvents = useMemo(() => {
        const allEvents = [
            ...academicCalendarData.firstSemester.events,
            ...academicCalendarData.secondSemester.events,
            ...academicCalendarData.summerSemester.events
        ];

        const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const eventsWithDates = allEvents.map(event => {
            const dateStr = event.date.split('-')[0].trim();
            const [year, month, day] = dateStr.split('/').map(Number);
            return {
                ...event,
                parsedDate: new Date(year, month - 1, day)
            };
        });

        return eventsWithDates
            .filter(event => event.parsedDate >= today)
            .sort((a, b) => a.parsedDate - b.parsedDate)
            .slice(0, 5);
    }, [currentDate]);

    const nextEvent = () => {
        setCurrentIndex((prev) => (prev + 1) % upcomingEvents.length);
    };

    const prevEvent = () => {
        setCurrentIndex((prev) => (prev - 1 + upcomingEvents.length) % upcomingEvents.length);
    };

    return (
        <section id="events" className="upcoming-events-section carousel-mode">
            <div className="events-header">
                <div className="events-icon">📅</div>
                <h2 className="events-title">{t('events.title')}</h2>
                <p className="events-subtitle">{t('events.subtitle')}</p>
            </div>

            <div className="carousel-container">
                <div className="carousel-inner">
                    {upcomingEvents.map((event, index) => {
                        let offset = index - currentIndex;
                        if (offset > 2) offset -= upcomingEvents.length;
                        if (offset < -2) offset += upcomingEvents.length;

                        const isCenter = offset === 0;
                        const absOffset = Math.abs(offset);

                        const x = offset * 320;
                        const z = absOffset * -400;
                        const scale = 1 - (absOffset * 0.2);
                        const opacity = 1 - (absOffset * 0.5);
                        const zIndex = 10 - absOffset;
                        const rotateY = offset * -45;

                        return (
                            <div
                                key={index}
                                className={`carousel-card glass-card ${isCenter ? 'active' : ''}`}
                                style={{
                                    position: 'absolute',
                                    transform: `translateX(${x}px) translateZ(${z}px) scale(${scale}) rotateY(${rotateY}deg)`,
                                    opacity,
                                    zIndex,
                                    filter: isCenter ? 'blur(0px)' : 'blur(4px)',
                                    visibility: absOffset > 2 ? 'hidden' : 'visible',
                                    transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease, filter 0.4s ease'
                                }}
                                onClick={() => setCurrentIndex(index)}
                            >
                                <div className="holographic-overlay"></div>
                                <div className="card-content">
                                    <div className="event-date-container">
                                        <span className="event-day-number">{event.date.split('/')[2]}</span>
                                        <div className="event-date-details">
                                            <span className="event-month">{event.date.split('/')[1]}</span>
                                            <span className="event-year">{event.date.split('/')[0]}</span>
                                        </div>
                                    </div>
                                    <h3 className="event-title-text">
                                        {language === 'ar' ? event.event : event.eventEn}
                                    </h3>
                                    <p className="event-day-text">
                                        {language === 'ar' ? event.day : event.dayEn}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="carousel-controls">
                    <button className="control-btn prev" onClick={prevEvent}>←</button>
                    <button className="control-btn next" onClick={nextEvent}>→</button>
                </div>
            </div>

            <div className="events-footer">
                <button className="view-more-btn" onClick={() => navigate('/calendar')}>
                    {t('events.viewMore')} →
                </button>
            </div>
        </section>
    );
};

export default UpcomingEvents;
