import React, { createContext, useContext, useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (mounted) {
                setCurrentUser(user);
                setLoading(false);
            }
        }, (error) => {
            console.error("Auth state change error:", error);
            if (mounted) setLoading(false);
        });

        return () => {
            mounted = false;
            unsubscribe();
        };
    }, []);
    const login = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const register = (email, password) => {
        return createUserWithEmailAndPassword(auth, email, password);
    };

    const logout = () => {
        return signOut(auth);
    };

    const value = {
        currentUser,
        login,
        register,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {loading ? (
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    bgcolor: '#0a0a0a',
                    gap: 2
                }}>
                    <CircularProgress color="primary" />
                    <Box component="span" sx={{ color: 'white', fontFamily: 'sans-serif' }}>جاري الاتصال...</Box>
                </Box>
            ) : children}
        </AuthContext.Provider>
    );
};
