import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './FloatingActionMenu.css';

const ACTIONS = [
    { icon: '📚', labelAr: 'المواد', labelEn: 'Materials', path: '/materials' },
    { icon: '🎯', labelAr: 'كويز', labelEn: 'Quiz', path: '/quiz' },
    { icon: '📊', labelAr: 'المعدل', labelEn: 'GPA', path: '/grading' },
];

const FloatingActionMenu = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    const handleAction = (path) => {
        navigate(path);
        setOpen(false);
    };

    return (
        <div className={`fab-menu-wrapper ${isAr ? 'rtl' : 'ltr'} ${open ? 'open' : ''}`}>
            {/* Sub-action items */}
            <div className="fab-actions">
                {ACTIONS.map((a, i) => (
                    <button
                        key={i}
                        className="fab-action-btn"
                        onClick={() => handleAction(a.path)}
                        title={isAr ? a.labelAr : a.labelEn}
                        style={{ transitionDelay: open ? `${i * 0.05}s` : '0s' }}
                    >
                        <span className="fab-action-icon">{a.icon}</span>
                        <span className="fab-action-label">{isAr ? a.labelAr : a.labelEn}</span>
                    </button>
                ))}
            </div>

            {/* Main toggle button */}
            <button
                className={`fab-main-btn ${open ? 'active' : ''}`}
                onClick={() => setOpen(!open)}
                aria-label={isAr ? 'قائم سريع' : 'Quick menu'}
                aria-expanded={open}
            >
                <span className="fab-main-icon">{open ? '✕' : '⚡'}</span>
            </button>
        </div>
    );
};

export default FloatingActionMenu;
