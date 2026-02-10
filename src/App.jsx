import React, { Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import AnimatedBackground from './components/layout/AnimatedBackground';
import Sidebar from './components/layout/Sidebar';

// Pages Import
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Suggestions from './pages/Suggestions';
import Testimonials from './pages/Testimonials';
import MaterialExchange from './pages/MaterialExchange';
import Contributions from './pages/Contributions';
import QuestionReports from './pages/QuestionReports';
import NashmiChat from './pages/NashmiChat';
import Broadcasts from './pages/Broadcasts';
import WebsiteSuggestions from './pages/WebsiteSuggestions';

// Theme Definition
const darkTheme = createTheme({
    direction: 'rtl',
    palette: {
        mode: 'dark',
        primary: {
            main: '#d32f2f',
        },
        secondary: {
            main: '#f50057',
        },
        background: {
            default: '#0a0a0a',
            paper: 'rgba(255, 255, 255, 0.05)',
        },
        text: {
            primary: '#fff',
            secondary: 'rgba(255, 255, 255, 0.7)',
        },
    },
    typography: {
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    scrollbarColor: "var(--primary) var(--bg-deep)",
                    "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
                        backgroundColor: "var(--bg-deep)",
                        width: "8px",
                    },
                    "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                        borderRadius: 8,
                        backgroundColor: "var(--primary)",
                        minHeight: 24,
                    },
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none',
                },
            },
        },
    },
});

// Light Theme Definition
const lightTheme = createTheme({
    direction: 'rtl',
    palette: {
        mode: 'light',
        primary: {
            main: '#d32f2f',
        },
        secondary: {
            main: '#f50057',
        },
        background: {
            default: '#f5f7fa',
            paper: '#ffffff',
        },
        text: {
            primary: '#1a1a1a',
            secondary: 'rgba(0, 0, 0, 0.7)',
        },
    },
    typography: {
        fontFamily: "'Cairo', 'Tajawal', sans-serif",
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    scrollbarColor: "var(--primary) var(--bg-deep)",
                    "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
                        backgroundColor: "var(--bg-deep)",
                        width: "8px",
                    },
                    "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
                        borderRadius: 8,
                        backgroundColor: "var(--primary)",
                        minHeight: 24,
                    },
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    textTransform: 'none',
                },
            },
        },
    },
});

// Protected Route Component
const ProtectedRoute = ({ children }) => {
    const { currentUser } = useAuth();
    if (!currentUser) return <Navigate to="/login" replace />;
    return children;
};

// Public Route Component (for Login)
const PublicRoute = ({ children }) => {
    const { currentUser } = useAuth();
    if (currentUser) return <Navigate to="/dashboard" replace />;
    return children;
};

// Layout Component
const AppLayout = ({ children, mode, toggleTheme }) => {
    const { currentUser } = useAuth();
    const location = useLocation();

    if (!currentUser) return children;

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
            <Sidebar mode={mode} toggleTheme={toggleTheme} />
            <Box component="main" sx={{ flexGrow: 1, p: 3, width: '100%', ml: { sm: 0 }, overflowX: 'hidden' }}>
                {children}
            </Box>
        </Box>
    );
};

function App() {
    const [themeMode, setThemeMode] = React.useState(localStorage.getItem('admin-theme') || 'dark');

    const toggleTheme = () => {
        const newMode = themeMode === 'dark' ? 'light' : 'dark';
        setThemeMode(newMode);
        localStorage.setItem('admin-theme', newMode);
    };

    React.useEffect(() => {
        if (themeMode === 'light') {
            document.documentElement.classList.add('light-mode');
        } else {
            document.documentElement.classList.remove('light-mode');
        }
    }, [themeMode]);

    console.log("App component rendering...");
    return (
        <AuthProvider>
            <ThemeProvider theme={themeMode === 'dark' ? darkTheme : lightTheme}>
                <CssBaseline />
                <HashRouter>
                    <AnimatedBackground />

                    <AppLayout mode={themeMode} toggleTheme={toggleTheme}>
                        <Suspense fallback={
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                                <CircularProgress color="primary" />
                                <Box component="span" sx={{ color: 'var(--text-primary)' }}>جاري تحميل الواجهة...</Box>
                            </Box>
                        }>
                            <Routes>
                                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                                <Route path="/" element={<ProtectedRoute><Navigate to="/dashboard" replace /></ProtectedRoute>} />
                                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                                <Route path="/suggestions" element={<ProtectedRoute><Suggestions /></ProtectedRoute>} />
                                <Route path="/testimonials" element={<ProtectedRoute><Testimonials /></ProtectedRoute>} />
                                <Route path="/materials" element={<ProtectedRoute><MaterialExchange /></ProtectedRoute>} />
                                <Route path="/contributions" element={<ProtectedRoute><Contributions /></ProtectedRoute>} />
                                <Route path="/questions" element={<ProtectedRoute><QuestionReports /></ProtectedRoute>} />
                                <Route path="/nashmi" element={<ProtectedRoute><NashmiChat /></ProtectedRoute>} />
                                <Route path="/broadcasts" element={<ProtectedRoute><Broadcasts /></ProtectedRoute>} />
                                <Route path="/website-suggestions" element={<ProtectedRoute><WebsiteSuggestions /></ProtectedRoute>} />
                            </Routes>
                        </Suspense>
                    </AppLayout>

                </HashRouter>
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
