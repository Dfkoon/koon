console.log("App.jsx executing...");
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import AnimatedBackground from './components/layout/AnimatedBackground';
import { Box, CircularProgress, CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';

// Lazy Load Pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Suggestions = React.lazy(() => import('./pages/Suggestions'));
const Testimonials = React.lazy(() => import('./pages/Testimonials'));
const MaterialExchange = React.lazy(() => import('./pages/MaterialExchange'));
const QuestionReports = React.lazy(() => import('./pages/QuestionReports'));
const NashmiChat = React.lazy(() => import('./pages/NashmiChat'));
const Broadcasts = React.lazy(() => import('./pages/Broadcasts'));
import Login from './pages/Login';

// Dark Theme Setup
const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#d32f2f' },
        background: { default: '#0a0a0a', paper: '#1a1a1a' },
        text: { primary: '#ffffff', secondary: 'rgba(255,255,255,0.7)' }
    },
    typography: {
        fontFamily: '"Cairo", "Outfit", sans-serif',
    }
});

// Protected Route Component
const ProtectedRoute = ({ children }) => {
    const { currentUser } = useAuth();
    const location = useLocation();

    if (!currentUser) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
}

// Redirect if already logged in
const PublicRoute = ({ children }) => {
    const { currentUser } = useAuth();
    if (currentUser) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
};

// Layout wrapper for sidebar visibility logic
const AppLayout = ({ children }) => {
    const { currentUser } = useAuth();
    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', direction: 'rtl' }}>
            {currentUser && <Sidebar />}
            <Box component="main" sx={{ flexGrow: 1, p: 3, zIndex: 1, position: 'relative' }}>
                {children}
            </Box>
        </Box>
    );
};

function App() {
    return (
        <AuthProvider>
            <ThemeProvider theme={darkTheme}>
                <CssBaseline />
                <BrowserRouter basename={import.meta.env.BASE_URL}>
                    <AnimatedBackground />

                    <AppLayout>
                        <Suspense fallback={
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                                <CircularProgress color="primary" />
                                <Box component="span" sx={{ color: 'white' }}>جاري تحميل الواجهة...</Box>
                            </Box>
                        }>
                            <Routes>
                                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />

                                {/* Protected Routes */}
                                <Route path="/" element={<ProtectedRoute><Navigate to="/dashboard" replace /></ProtectedRoute>} />
                                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                                <Route path="/suggestions" element={<ProtectedRoute><Suggestions /></ProtectedRoute>} />
                                <Route path="/testimonials" element={<ProtectedRoute><Testimonials /></ProtectedRoute>} />
                                <Route path="/materials" element={<ProtectedRoute><MaterialExchange /></ProtectedRoute>} />
                                <Route path="/questions" element={<ProtectedRoute><QuestionReports /></ProtectedRoute>} />
                                <Route path="/nashmi" element={<ProtectedRoute><NashmiChat /></ProtectedRoute>} />
                                <Route path="/broadcasts" element={<ProtectedRoute><Broadcasts /></ProtectedRoute>} />
                            </Routes>
                        </Suspense>
                    </AppLayout>

                </BrowserRouter>
            </ThemeProvider>
        </AuthProvider>
    );
}

export default App;
