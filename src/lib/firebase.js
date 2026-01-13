import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyCwEYy_wNXXMvq_jDHD-8xvD9OZEVUwHVA",
    authDomain: "koon-609da.firebaseapp.com",
    projectId: "koon-609da",
    storageBucket: "koon-609da.firebasestorage.app",
    messagingSenderId: "999499144055",
    appId: "1:999499144055:web:de58d0ab0b1dcc11b05f72",
    measurementId: "G-5G25S6VXNR"
};

let app, auth, db, storage;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log("Firebase initialized successfully.");
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

export { app, auth, db, storage };
