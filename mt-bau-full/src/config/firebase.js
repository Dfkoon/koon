import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCwEYy_wNXXmvq_jDHD-8xvD90ZEVUwHVA",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "koon-609da.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "koon-609da",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "koon-609da.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "999499144055",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:999499144055:web:de58d0ab0b1dcc11b05f72",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-5G25S6VXNR"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

let analytics = null;
if (typeof window !== "undefined") {
    isSupported().then((supported) => {
        if (supported && firebaseConfig.measurementId && firebaseConfig.apiKey) {
            try {
                analytics = getAnalytics(app);
            } catch (err) {
                console.warn("Firebase Analytics skipped:", err?.message || err);
            }
        }
    }).catch((err) => {
        console.warn("Firebase Analytics check failed:", err?.message || err);
    });
}

export { db, storage, auth, analytics };
