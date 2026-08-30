import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeLanguageToggle from './ThemeLanguageToggle';
import AnimatedLogo from './AnimatedLogo';
import './Navbar.css';

const Navbar = ({ toggleSidebar }) => {
  const [scrolled, setScrolled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaffLogged, setIsStaffLogged] = useState(false);

  const { t, language } = useLanguage();
  const location = useLocation();
  const isAr = language === 'ar';

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Detect admin and staff session for dashboard link
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('exchange_staff');
      if (s) {
        const u = JSON.parse(s);
        setIsAdmin(u?.role === 'admin');
        setIsStaffLogged(true);
      } else {
        setIsStaffLogged(false);
        setIsAdmin(false);
      }
    } catch { /* ignore */ }
  }, [location]);

  const isActive = (path) => {
    // For hash router, we check the actual path within the hash
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar-container">

          <div className="logo" style={{ display: 'flex', alignItems: 'center' }}>
            <Link to="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '15px' }}>
              <img src="static_logo.png" alt="Logo" style={{ height: '65px', width: 'auto', transition: 'all 0.3s ease' }} />
              <span className="logo-text"><span className="highlight">{t('hero.title.highlight')}</span></span>
            </Link>
          </div>

          <ul className="nav-links">
            <li className="nav-item dropdown-parent">
              <Link to="/" className={`dropdown-trigger ${isActive('/') ? 'active' : ''}`}>
                {t('nav.home')}
                <span className="dropdown-arrow">▾</span>
              </Link>
              <ul className="dropdown-menu">
                {/* Using native hash anchors for same-page navigation */}
                <li><a href="#/#lemon-chat">{t('nav.nashmi')}</a></li>
                <li><a href="#/#events">{t('nav.events')}</a></li>
                <li><a href="#/#weekly-tip">{t('nav.tip')}</a></li>
                <li><a href="#/#services">{t('nav.services')}</a></li>
                <li><a href="#/#testimonials-section">{t('nav.testimonials')}</a></li>
                <li><a href="#/#suggestions">{t('nav.contact')}</a></li>
              </ul>
            </li>
            <li><Link to="/materials" className={isActive('/materials') ? 'active' : ''}>{t('nav.materials')}</Link></li>
            <li><Link to="/plans" className={isActive('/plans') ? 'active' : ''}>{t('nav.plans')}</Link></li>
            <li><Link to="/grading" className={isActive('/grading') ? 'active' : ''}>{t('nav.grading')}</Link></li>
            <li><Link to="/quiz" className={isActive('/quiz') ? 'active' : ''}>{t('nav.quiz')}</Link></li>
            <li><Link to="/calendar" className={isActive('/calendar') ? 'active' : ''}>{t('nav.calendar')}</Link></li>
            <li><Link to="/exchange" className={isActive('/exchange') ? 'active' : ''}>{t('nav.exchange')}</Link></li>
            <li><Link to="/watcher" className={isActive('/watcher') ? 'active watcher-highlight' : 'watcher-highlight'}>{t('nav.watcher')} <span className="watcher-badge-pill">مباشر</span></Link></li>


            <li className="nav-item dropdown-parent">
              <span className={`dropdown-trigger ${isActive('/news') || isActive('/faq') || isActive('/about') ? 'active' : ''}`}>
                {t('nav.more')}
                <span className="dropdown-arrow">▾</span>
              </span>
              <ul className="dropdown-menu">
                <li><Link to="/faq">{t('nav.faq')}</Link></li>
                <li><Link to="/about">{t('nav.about')}</Link></li>
              </ul>
            </li>
          </ul>

          <div className="nav-controls">
            <div className="nav-cta">
              <ThemeLanguageToggle />
            </div>
            <div className="menu-icon" onClick={toggleSidebar}>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
            </div>
          </div>
        </div>
      </nav>

      {/* Global Modals */}
    </>
  );
};

export default Navbar;
