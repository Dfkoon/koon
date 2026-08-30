import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        const THEME_VERSION = "3.0"; // Bumped to reset to light for everyone
        const savedVersion = localStorage.getItem('theme_version');
        const savedTheme = localStorage.getItem('theme');
        const supportedThemes = ['light', 'dark'];

        // If it's a new version or no version, force 'light'
        if (savedVersion !== THEME_VERSION) {
            localStorage.setItem('theme', 'light');
            localStorage.setItem('theme_version', THEME_VERSION);
            return 'light';
        }

        return (savedTheme && supportedThemes.includes(savedTheme)) ? savedTheme : 'light';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        localStorage.setItem('theme_version', "3.0");
    }, [theme]);

    const changeTheme = (newTheme) => {
        setTheme(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: changeTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
