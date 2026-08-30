import React from 'react';
import { useNavigate } from 'react-router-dom';
import { announcements } from '../data/newsData';
import { useLanguage } from '../contexts/LanguageContext';
import './NewsSection.css';

const NewsSection = () => {
    const { t, language } = useLanguage();
    const navigate = useNavigate();

    // Helper to parse dates like "2025/9/2", "8/9/2026", etc.
    const parseDate = (dateStr) => {
        if (!dateStr) return new Date(0);
        const parts = dateStr.split('/');
        // Assume format YYYY/M/D or D/M/YYYY ?? 
        // Based on data: "2025/9/2" (YYYY/M/D) and "8/9/2026" (D/M/YYYY)
        // Let's try to detect based on first part length
        if (parts[0].length === 4) {
            return new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
            // Assume D/M/YYYY
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
    };

    // Sort by date descending and take top 3
    const latestNews = [...announcements] // Create copy to avoid mutating source
        .sort((a, b) => parseDate(b.date) - parseDate(a.date))
        .slice(0, 3);

    const handleNavigation = () => {
        navigate('/news');
        window.scrollTo(0, 0);
    };

    return (
        <section id="updates" className="news-section">
            <div className="section-header">
                <h2 className="section-title">{t('news.title')}</h2>
                <p className="section-subtitle">{t('news.subtitle')}</p>
            </div>

            <div className="news-grid">
                {latestNews.map(news => (
                    <div key={news.id} className="news-card glass-card" style={{ '--primary': news.color }}>
                        {/* Reusing News Page Styles roughly, or adapting to News Section styles */}
                        {/* The original NewsSection used images, but the News Page data uses Icons. 
                             We should adapt the design to match the data we have (Icons). 
                             Or stick to the NewsSection design but with data derived from news. */}

                        <div className="news-image-placeholder" style={{ backgroundColor: news.color }}>
                            <i className={news.icon} style={{ fontSize: '3rem', color: 'white' }}></i>
                        </div>

                        <div className="news-content">
                            <span className="news-date">{news.date}</span>
                            <h3 className="news-item-title">{news.title[language]}</h3>
                            {/* Truncate content for summary if possible, but content is JSX. 
                                We'll just show the title and date and a generic desc if needed, 
                                or extract text from JSX (hard). For simplicity, just Title is often enough for summary cards.
                             */}
                            <button className="read-more" onClick={handleNavigation}>
                                {t('news.readmore')}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="view-all-container">
                <button className="btn-secondary" onClick={handleNavigation}>{t('news.viewall')}</button>
            </div>
        </section>
    );
};

export default NewsSection;
