import React, { useState, useMemo } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { academicCalendarData, semesterCategories } from '../data/calendarData';
import calendarHero from '../assets/heros/calendar_hero.png';
import './AcademicCalendar.css';

const AcademicCalendar = () => {
    const { language, t } = useLanguage();
    const [selectedSemester, setSelectedSemester] = useState('summerSemester');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // all, exams, holidays, deadlines
    const [viewMode, setViewMode] = useState('list'); // list, grid

    const currentSemester = academicCalendarData[selectedSemester];

    // Helper to parse date string for comparison (simplified)
    const parseEventDate = (dateStr) => {
        try {
            // Take the last part of a range "2026/1/22-1/10" -> "2026/1/22" (EndDate usually)
            const parts = dateStr.split('-');
            const fullDatePart = parts.find(p => p.match(/\d{4}\/\d{1,2}\/\d{1,2}/)) || parts[0];

            const dateParts = fullDatePart.split('/');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]);
            const day = parseInt(dateParts[2]);
            return new Date(year, month - 1, day);
        } catch (e) {
            return new Date();
        }
    };

    const isUpcoming = (dateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const eventDate = parseEventDate(dateStr);
        return eventDate >= today;
    };

    // Filtered Events Logic
    const filteredEvents = useMemo(() => {
        if (!currentSemester) return [];

        return currentSemester.events.filter(event => {
            const eventName = language === 'ar' ? event.event : (event.eventEn || event.event);
            const dayName = language === 'ar' ? event.day : (event.dayEn || event.day);

            // 1. Search Filter
            const matchesSearch =
                eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                event.date.includes(searchQuery) ||
                dayName.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            // 2. Type Filter
            if (filterType === 'all') return true;
            return event.type === filterType.slice(0, -1); // 'exams' -> 'exam', 'holidays' -> 'holiday', 'deadlines' -> 'deadline'
        });
    }, [currentSemester, searchQuery, filterType, language]);

    // Statistics
    const stats = useMemo(() => {
        if (!currentSemester) return { total: 0, exams: 0, holidays: 0, deadlines: 0 };
        return {
            total: currentSemester.events.length,
            exams: currentSemester.events.filter(e => e.type === 'exam').length,
            holidays: currentSemester.events.filter(e => e.type === 'holiday').length,
            deadlines: currentSemester.events.filter(e => e.type === 'deadline').length
        };
    }, [currentSemester]);

    // Upcoming Events (Top 3)
    const upcomingEvents = useMemo(() => {
        if (!currentSemester) return [];
        return currentSemester.events
            .filter(e => isUpcoming(e.date))
            .slice(0, 3);
    }, [currentSemester]);

    if (!currentSemester) {
        return <div className="loading">{t('common.loading') || 'Loading...'}</div>;
    }

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="academic-calendar-page">
            {/* Hero Section */}
            <section className="calendar-hero" style={{ backgroundImage: `url(${calendarHero})` }}>
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <h1 className="hero-title">{t('calendar.hero.title')} 📅</h1>
                    <p className="hero-subtitle">
                        {t('calendar.hero.subtitle')}
                    </p>
                    <p className="hero-note">{t('calendar.hero.note')}</p>
                </div>
            </section>

            {/* Statistics Cards */}
            <div className="statistics-container">
                <div className="stat-card premium-card" data-aos="fade-up" data-aos-delay="100">
                    <div className="stat-icon-wrapper">📊</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.total}</div>
                        <div className="stat-label">{t('calendar.stats.total')}</div>
                    </div>
                </div>
                <div className="stat-card premium-card" data-aos="fade-up" data-aos-delay="200">
                    <div className="stat-icon-wrapper">📝</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.exams}</div>
                        <div className="stat-label">{t('calendar.stats.exams')}</div>
                    </div>
                </div>
                <div className="stat-card premium-card" data-aos="fade-up" data-aos-delay="300">
                    <div className="stat-icon-wrapper">🎉</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.holidays}</div>
                        <div className="stat-label">{t('calendar.stats.holidays')}</div>
                    </div>
                </div>
                <div className="stat-card premium-card" data-aos="fade-up" data-aos-delay="400">
                    <div className="stat-icon-wrapper">⏰</div>
                    <div className="stat-info">
                        <div className="stat-value">{stats.deadlines}</div>
                        <div className="stat-label">{t('calendar.stats.deadlines')}</div>
                    </div>
                </div>
            </div>

            {/* Central Control Dashboard */}
            <div className="control-dashboard glass-card" data-aos="fade-up">
                {/* Upcoming Quick View */}
                {upcomingEvents.length > 0 && (
                    <div className="quick-upcoming">
                        <div className="quick-header">
                            <span className="pulse-icon">🔔</span>
                            <h4>{t('calendar.upcoming.title')}</h4>
                        </div>
                        <div className="quick-events-track">
                            {upcomingEvents.map((event, idx) => (
                                <div key={idx} className="quick-item">
                                    <span className="quick-date">{event.date}</span>
                                    <span className="quick-name">
                                        {language === 'ar' ? event.event : (event.eventEn || event.event)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="dashboard-main-controls">
                    <div className="search-box">
                        <span className="search-icon-glass">🔍</span>
                        <input
                            type="text"
                            placeholder={t('calendar.search.placeholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="filter-group">
                        <button
                            className={`filter-chip ${filterType === 'all' ? 'active' : ''}`}
                            onClick={() => setFilterType('all')}
                        >
                            {t('calendar.filters.all')}
                        </button>
                        <button
                            className={`filter-chip ${filterType === 'exams' ? 'active' : ''}`}
                            onClick={() => setFilterType('exams')}
                        >
                            {t('calendar.filters.exams')}
                        </button>
                        <button
                            className={`filter-chip ${filterType === 'holidays' ? 'active' : ''}`}
                            onClick={() => setFilterType('holidays')}
                        >
                            {t('calendar.filters.holidays')}
                        </button>
                    </div>

                    <div className="view-actions">
                        <div className="view-switch">
                            <button
                                className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => setViewMode('list')}
                                title={t('calendar.view.list')}
                            >
                                📋
                            </button>
                            <button
                                className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                onClick={() => setViewMode('grid')}
                                title={t('calendar.view.grid')}
                            >
                                📅
                            </button>
                        </div>
                        <button className="icon-action-btn print-btn" onClick={handlePrint} title={t('calendar.actions.print')}>
                            🖨️
                        </button>
                    </div>
                </div>
            </div>

            {/* Semester Tabs - Modernized */}
            <div className="semester-navigation">
                {semesterCategories.map(semester => (
                    <button
                        key={semester.id}
                        className={`nav-tab ${selectedSemester === semester.id ? 'active' : ''}`}
                        onClick={() => {
                            setSelectedSemester(semester.id);
                            setSearchQuery('');
                            setFilterType('all');
                        }}
                        style={{ '--accent-color': semester.color }}
                    >
                        <span className="nav-icon">{semester.icon}</span>
                        <span className="nav-text">
                            {language === 'ar' ? semester.name : (semester.nameEn || semester.name)}
                        </span>
                    </button>
                ))}
            </div>

            {/* Calendar Content */}
            <div className="calendar-container">
                <div className="semester-header">
                    <h2>{language === 'ar' ? currentSemester.name : (currentSemester.nameEn || currentSemester.name)}</h2>
                    <span className="semester-year">{currentSemester.year}</span>
                </div>

                {filteredEvents.length === 0 ? (
                    <div className="no-results">
                        <span className="no-results-icon">📭</span>
                        <h3>{t('calendar.no_results.title')}</h3>
                        <p>{t('calendar.no_results.text')}</p>
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' ? (
                            <div className="events-timeline">
                                {filteredEvents.map((event, index) => (
                                    <div key={index} className="event-card glass-card">
                                        <div className="event-date-badge" style={{ '--event-color': currentSemester.color }}>
                                            <div className="date-text">{event.date}</div>
                                            <div className="day-text">
                                                {language === 'ar' ? event.day : (event.dayEn || event.day)}
                                            </div>
                                        </div>
                                        <div className="event-content">
                                            <p className="event-description">
                                                {language === 'ar' ? event.event : (event.eventEn || event.event)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="calendar-grid">
                                {filteredEvents.map((event, index) => (
                                    <div key={index} className="calendar-event-card glass-card">
                                        <div className="calendar-event-date" style={{ color: currentSemester.color }}>
                                            {event.date}
                                        </div>
                                        <div className="calendar-event-day">
                                            {language === 'ar' ? event.day : (event.dayEn || event.day)}
                                        </div>
                                        <p className="calendar-event-text">
                                            {language === 'ar' ? event.event : (event.eventEn || event.event)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Info Banner */}
            <div className="info-banner glass-card">
                <h3>📌 {t('calendar.note.title')}</h3>
                <p>
                    {t('calendar.note.text').split('\n').map((line, i) => (
                        <React.Fragment key={i}>
                            {line}
                            <br />
                        </React.Fragment>
                    ))}
                </p>
            </div>
        </div>
    );
};

export default AcademicCalendar;
