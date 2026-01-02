/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { useLanguage } from './LanguageContext';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [mode, setMode] = useState(() => localStorage.getItem('themeMode') || 'light');
    const { language } = useLanguage();

    useEffect(() => {
        localStorage.setItem('themeMode', mode);
    }, [mode]);

    const toggleColorMode = () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
    };

    const theme = useMemo(() => createTheme({
        direction: language === 'ar' ? 'rtl' : 'ltr',
        palette: {
            mode,
            primary: {
                main: mode === 'light' ? '#1976d2' : '#90caf9', // Blue / Light Blue
            },
            secondary: {
                main: mode === 'light' ? '#f1c40f' : '#ffeb3b', // Yellow
            },
            background: {
                default: mode === 'light' ? '#f4f6f8' : '#121212',
                paper: mode === 'light' ? '#ffffff' : '#1e1e1e',
            },
        },
        typography: {
            fontFamily: 'Cairo, Alexandria, Tajawal, Readex Pro, sans-serif',
            allVariants: {
                fontWeight: 600, // Enforce semi-bold globally as per user request
            },
            h1: { fontWeight: 800 },
            h2: { fontWeight: 800 },
            h3: { fontWeight: 800 },
            h4: { fontWeight: 700 },
            h5: { fontWeight: 700 },
            h6: { fontWeight: 700 },
            button: { fontWeight: 700 },
        },
        components: {
            MuiCard: {
                styleOverrides: {
                    root: {
                        borderRadius: 16,
                        boxShadow: mode === 'light'
                            ? '0 4px 20px rgba(0,0,0,0.05)'
                            : '0 4px 20px rgba(0,0,0,0.4)',
                        backdropFilter: 'blur(10px)',
                        background: mode === 'light'
                            ? 'rgba(255, 255, 255, 0.9)'
                            : 'rgba(30, 30, 30, 0.9)',
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: {
                        borderRadius: 30,
                        textTransform: 'none',
                        fontWeight: 600,
                    },
                },
            },
        },
    }), [mode, language]);

    return (
        <ThemeContext.Provider value={{ mode, toggleColorMode }}>
            <MuiThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};

export const useColorMode = () => useContext(ThemeContext);
