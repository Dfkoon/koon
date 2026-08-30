import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import './ThemeLanguageToggle.css';

const ThemeLanguageToggle = () => {
    const { theme, setTheme } = useTheme();
    const { language, toggleLanguage } = useLanguage();

    const themes = [
        { id: 'light', icon: 'fa-sun', label: { ar: 'أبيض', en: 'White Mode' } },
        { id: 'dark', icon: 'fa-moon', label: { ar: 'أسود', en: 'Black Mode' } }
    ];

    const cycleTheme = () => {
        const currentIndex = themes.findIndex(t => t.id === theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex].id);
    };

    const currentThemeData = themes.find(t => t.id === theme) || themes[0];

    return (
        <div className="toggle-controls">
            {/* Theme Toggle */}
            <button
                className={`nav-toggle-btn theme-toggle ${theme}`}
                onClick={cycleTheme}
                aria-label="Cycle theme"
            >
                <div className="toggle-icon-container">
                    <i className={`fas ${currentThemeData.icon}`}></i>
                </div>
                <span className="tooltip-text">
                    {language === 'ar' ? currentThemeData.label.ar : currentThemeData.label.en}
                </span>
            </button>

            {/* Language Toggle */}
            <button
                className="nav-toggle-btn language-toggle"
                onClick={toggleLanguage}
                aria-label="Toggle language"
            >
                <div className="toggle-icon-container">
                    {language === 'ar' ? (
                        <span className="lang-text">EN</span>
                    ) : (
                        <span className="lang-text ar-font">ع</span>
                    )}
                </div>
            </button>
        </div>
    );
};

export default ThemeLanguageToggle;
