import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './UsefulSitesSection.css';

const UsefulSitesSection = () => {
    const { t } = useLanguage();

    // External links for the sites
    const sites = [
        {
            id: 1,
            title: t('site.1.title'),
            desc: t('site.1.desc'),
            icon: '🎓',
            link: 'https://www.coursera.org'
        },
        {
            id: 2,
            title: t('site.2.title'),
            desc: t('site.2.desc'),
            icon: '',
            link: 'https://www.khanacademy.org'
        },
        {
            id: 3,
            title: t('site.3.title'),
            desc: t('site.3.desc'),
            icon: '🐺',
            link: 'https://www.wolframalpha.com'
        },
        {
            id: 4,
            title: t('site.4.title'),
            desc: t('site.4.desc'),
            icon: '🎨',
            link: 'https://www.canva.com'
        },
        {
            id: 5,
            title: t('site.5.title'),
            desc: t('site.5.desc'),
            icon: '📝',
            link: 'https://quizlet.com'
        },
        {
            id: 6,
            title: t('site.6.title'),
            desc: t('site.6.desc'),
            icon: '🔍',
            link: 'https://scholar.google.com'
        },
        {
            id: 7,
            title: t('site.7.title'),
            desc: t('site.7.desc'),
            icon: '📦',
            link: 'https://www.hackthebox.com'
        },
        {
            id: 8,
            title: t('site.8.title'),
            desc: t('site.8.desc'),
            icon: '🛡️',
            link: 'https://tryhackme.com'
        },
        {
            id: 9,
            title: t('site.9.title'),
            desc: t('site.9.desc'),
            icon: '☕',
            link: 'https://netbeans.apache.org'
        }
    ];

    // Double the array to ensure smooth infinite scrolling
    const allSites = [...sites, ...sites];

    return (
        <section id="useful-sites" className="useful-sites-section">
            <div className="section-header fade-in">
                <h2 className="section-title">{t('useful_sites.title')}</h2>
                <p className="section-subtitle">{t('useful_sites.subtitle')}</p>
            </div>

            <div className="sites-container">
                <div className="sites-track">
                    {allSites.map((site, index) => (
                        <div key={`${site.id}-${index}`} className="site-card glass-card">
                            <div className="site-icon">{site.icon}</div>
                            <h3 className="site-title">{site.title}</h3>
                            <p className="site-desc">{site.desc}</p>
                            <a
                                href={site.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="site-btn"
                            >
                                {t('useful_sites.visit')}
                            </a>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default UsefulSitesSection;
