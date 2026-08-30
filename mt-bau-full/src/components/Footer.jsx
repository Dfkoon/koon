import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Link } from 'react-router-dom';
import AnimatedLogo from './AnimatedLogo';
import './Footer.css';

const Footer = () => {
    const { t, language } = useLanguage();
    const isAr = language === 'ar';

    return (
        <footer id="contact" className="footer">
            <div className="footer-container">
                <div className="footer-charity-banner">
                    <span className="charity-icon">🕊️</span>
                    <span className="charity-text">{t('footer.charity')}</span>
                </div>

                <div className="footer-top">
                    <div className="footer-brand">
                        <div style={{ marginBottom: '1rem' }}>
                            <img src="static_logo.png" alt="Logo" style={{ height: '80px', width: 'auto' }} />
                        </div>
                        <h2 className="logo-text"><span className="highlight">{t('hero.title.highlight')}</span></h2>
                        <p className="brand-desc">
                            {t('footer.brand.desc')}
                        </p>
                    </div>

                    <div className="footer-links-col">
                        <h3>{t('footer.quicklinks')}</h3>
                        <ul>
                            <li><Link to="/">{t('nav.home')}</Link></li>
                            <li><Link to="/calendar">{t('nav.calendar')}</Link></li>
                            <li><Link to="/materials">{t('nav.materials')}</Link></li>
                            <li><Link to="/plans">{t('nav.plans')}</Link></li>
                        </ul>
                    </div>

                    <div className="footer-links-col">
                        <h3>{t('footer.contact')}</h3>
                        <ul>
                            <li><a href="mailto:makanak.bau.jo@gmail.com">makanak.bau.jo@gmail.com</a></li>
                            <li><a href="tel:0782934685">0782934685</a></li>
                            <li>السلط، الأردن</li>
                        </ul>
                    </div>

                    <div className="footer-social">
                        <h3>{t('footer.follow')}</h3>
                        <div className="social-icons">
                            <a href="https://web.facebook.com/share/g/1DPBxG5J9t/" target="_blank" rel="noopener noreferrer" className="social-icon facebook" aria-label="Facebook">
                                <i className="fab fa-facebook-f"></i>
                            </a>
                            <a href="https://t.me/introtoai1" target="_blank" rel="noopener noreferrer" className="social-icon telegram" aria-label="Telegram">
                                <i className="fab fa-telegram-plane"></i>
                            </a>
                            <a href="https://chat.whatsapp.com/Jkjv6AZyuCf8n3QYntFCX4" target="_blank" rel="noopener noreferrer" className="social-icon whatsapp" aria-label="WhatsApp">
                                <i className="fab fa-whatsapp"></i>
                            </a>
                        </div>
                    </div>
                </div>

                <div className="footer-bottom">
                    <p>{t('footer.rights')}</p>
                    <div className="footer-bottom-links">
                        <Link to="/legal" className="legal-link">{t('nav.legal')}</Link>
                    </div>
                    <div className="developer-tag">{t('footer.dev')}</div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
