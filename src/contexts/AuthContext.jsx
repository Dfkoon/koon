import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// Ensure a singleton Context instance across Vite HMR module reloads
const AuthContext = globalThis.__AUTH_CONTEXT__ || createContext({
    currentUser: null,
    login: async () => { },
    logout: async () => { }
});
globalThis.__AUTH_CONTEXT__ = AuthContext;

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const login = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const logout = () => {
        return signOut(auth);
    };

    const value = {
        currentUser,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

