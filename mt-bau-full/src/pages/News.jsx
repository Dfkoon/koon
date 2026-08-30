import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import newsHero from '../assets/heros/news_hero.png';
import './News.css';

import { announcements } from '../data/newsData';

const News = () => {
    const { language } = useLanguage();
    const [filter, setFilter] = useState('all');

    const filteredAnnouncements = filter === 'all'
        ? announcements
        : announcements.filter(a => a.type === filter);

    const getBadgeLabel = (type) => {
        const labels = {
            'new': { ar: 'جديد ✨', en: 'New' },
            'important': { ar: 'هام ⚠️', en: 'Important' },
            'admission': { ar: 'قبول وتجسيل 🎓', en: 'Admission' },
            'general': { ar: 'بر عام 🌐', en: 'General' }
        };
        return language === 'ar' ? labels[type]?.ar : labels[type]?.en;
    };

    return (
        <div className="news-page" dir={language === 'ar' ? 'rtl' : 'ltr'}>
            {/* Maintenance Overlay */}
            <div className="coming-soon-overlay">
                <div className="coming-soon-box" data-aos="zoom-in">
                    <div className="coming-soon-icon-large">🚧</div>
                    <h1>{language === 'ar' ? 'تحت الصيان' : 'Under Maintenance'}</h1>
                    <p>
                        {language === 'ar'
                            ? 'نقوم حالياً بتحديث قسم الأبار لنوافيكم بآر المستجدات بشكل أفضل. انتظرونا قريباً!'
                            : 'We are currently updating the news section to bring you the latest updates more effectively. Stay tuned!'}
                    </p>
                    <div className="coming-soon-badge">
                        {language === 'ar' ? 'قريباً' : 'Coming Soon'}
                    </div>
                </div>
            </div>

            <div className="content-blur-wrapper">
                {/* Hero Section */}
                <section className="news-hero" style={{ backgroundImage: `url(${newsHero})` }}>
                    <div className="hero-overlay"></div>
                    <div className="hero-content">
                        <h1 className="hero-title">{language === 'ar' ? 'أبار مكانك' : 'Makanak News'} 📰</h1>
                        <p className="hero-subtitle">
                            {language === 'ar'
                                ? 'وجهتك الأولى لمعرف كل جديد في جامعة البلقاء التطبيقية'
                                : 'Your standard source for all updates at Al-Balqa Applied University'}
                        </p>
                    </div>
                </section>

                {/* Filters */}
                <div className="news-filters">
                    {[
                        { key: 'all', labelAr: 'الكل', labelEn: 'All' },
                        { key: 'new', labelAr: 'جديد', labelEn: 'New' },
                        { key: 'important', labelAr: 'هام', labelEn: 'Important' },
                        { key: 'admission', labelAr: 'قبول', labelEn: 'Admission' },
                        { key: 'general', labelAr: 'عام', labelEn: 'General' }
                    ].map(f => (
                        <button
                            key={f.key}
                            className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                            onClick={() => setFilter(f.key)}
                        >
                            {language === 'ar' ? f.labelAr : f.labelEn}
                        </button>
                    ))}
                </div>

                {/* News Grid */}
                <div className="news-container">
                    {filteredAnnouncements.map(item => (
                        <div
                            key={item.id}
                            className="news-card glass-card"
                            style={{ '--primary': item.color }}
                        >
                            {/* Badge */}
                            <div className="card-badge" style={{ background: item.color }}>
                                {getBadgeLabel(item.type)}
                            </div>

                            {/* Header */}
                            <div className="card-header">
                                <div className="card-icon" style={{ borderColor: item.color, color: item.color }}>
                                    <i className={item.icon}></i>
                                </div>
                                <div className="card-title-group">
                                    <h3>{item.title[language]}</h3>
                                    <div className="card-date">
                                        <i className="far fa-clock"></i> {item.date}
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="card-content">
                                {item.content[language]}
                            </div>

                            {/* Footer */}
                            <div className="news-footer">
                                <span className="footer-tag" style={{ color: item.color }}>
                                    {language === 'ar' ? 'رحل مكانك ❤️' : 'Makanak Journey ❤️'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default News;
