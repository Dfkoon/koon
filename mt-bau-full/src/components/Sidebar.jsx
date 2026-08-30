import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './Sidebar.css';
import ThemeLanguageToggle from './ThemeLanguageToggle';
import AnimatedLogo from './AnimatedLogo';

const Sidebar = ({ isOpen, toggleSidebar }) => {
    const { t, language } = useLanguage();
    const [isStaffLogged, setIsStaffLogged] = useState(false);

    useEffect(() => {
        try {
            const s = sessionStorage.getItem('exchange_staff');
            setIsStaffLogged(!!s);
        } catch { /* ignore */ }
    }, [isOpen]);
    return (
        <>
            <div className={`sidebar-overlay ${isOpen ? 'active' : ''}`} onClick={toggleSidebar}></div>
            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AnimatedLogo size="50px" />
                        <span className="logo-text"><span className="highlight">{t('hero.title.highlight')}</span></span>
                    </div>
                    <button className="close-btn" onClick={toggleSidebar}>&times;</button>
                </div>

                <ul className="sidebar-links">
                    <li><Link to="/" onClick={toggleSidebar}>{t('nav.home')}</Link></li>
                    <li><Link to="/materials" onClick={toggleSidebar}>{t('nav.materials')}</Link></li>
                    <li><Link to="/plans" onClick={toggleSidebar}>{t('nav.plans')}</Link></li>
                    <li><Link to="/grading" onClick={toggleSidebar}>{t('nav.grading') || 'نظام العلامات'}</Link></li>
                    <li><Link to="/quiz" onClick={toggleSidebar}>{t('nav.quiz')}</Link></li>
                    <li><Link to="/calendar" onClick={toggleSidebar}>{t('nav.calendar')}</Link></li>
                    <li><Link to="/exchange" onClick={toggleSidebar}>{t('nav.exchange')}</Link></li>
                    <li><Link to="/watcher" onClick={toggleSidebar} style={{ fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span>{t('nav.watcher')}</span> <span className="watcher-badge-pill">مباشر</span></Link></li>


                    <li><Link to="/faq" onClick={toggleSidebar}>{t('nav.faq')}</Link></li>

                    <div className="divider" style={{ borderTop: '1px solid var(--glass-border)', margin: '10px 0' }}></div>
                    <li><a href="#/#lemon-chat" onClick={toggleSidebar}>{t('nav.nashmi')}</a></li>
                    <li><a href="#/#events" onClick={toggleSidebar}>{t('nav.events')}</a></li>
                    <li><a href="#/#weekly-tip" onClick={toggleSidebar}>{t('nav.tip')}</a></li>
                    <li><a href="#/#services" onClick={toggleSidebar}>{t('nav.services')}</a></li>
                    <li><a href="#/#testimonials-section" onClick={toggleSidebar}>{t('nav.testimonials')}</a></li>
                    <li><a href="#/#suggestions" onClick={toggleSidebar}>{t('nav.contact')}</a></li>
                </ul>

                <div className="sidebar-footer">
                    <ThemeLanguageToggle />
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
