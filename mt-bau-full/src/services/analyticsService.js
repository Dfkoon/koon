import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp, query, where, getCountFromServer } from 'firebase/firestore';
import { getUserProfile } from '../utils/exchangeLocalStorage';

/**
 * Log a generic page view or user interaction to Firestore.
 * @param {string} path - The URL path or action category
 * @param {Object} details - Additional metadata to record
 */
export const logPageView = async (path, details = {}) => {
    try {
        const profile = getUserProfile();
        
        // Simple safety check: don't flood Firestore in case of infinite loops
        // Only log if path is valid
        if (!path) return;

        // Skip logging if the user is authenticated admin to keep stats clean
        let isAdmin = false;
        try {
            const saved = sessionStorage.getItem('exchange_staff');
            if (saved) {
                const user = JSON.parse(saved);
                if (user?.role === 'admin') {
                    isAdmin = true;
                }
            }
        } catch (e) {
            // Ignore sessionStorage errors
        }

        if (isAdmin) return;

        const visitKey = `koon_last_visit:${path}`;
        const lastVisit = Number(sessionStorage.getItem(visitKey) || 0);
        if (Date.now() - lastVisit < 30_000) return;
        sessionStorage.setItem(visitKey, String(Date.now()));

        const viewData = {
            path,
            timestamp: serverTimestamp(),
            userAgent: navigator.userAgent,
            language: localStorage.getItem('language') || 'ar',
            studentName: profile?.name || 'Guest',
            studentPhone: profile?.phone || '',
            type: details.type || 'visit',
            ...details
        };

        await addDoc(collection(db, 'page_views'), viewData);
    } catch (error) {
        console.error('Error logging page view:', error);
    }
};

export const getTotalStudentVisits = async () => {
    try {
        const snapshot = await getCountFromServer(
            query(collection(db, 'page_views'), where('type', '==', 'visit'))
        );
        return Number(snapshot.data().count || 0);
    } catch (error) {
        console.error('Error fetching visitor count:', error);
        return 0;
    }
};

/**
 * Log when a student clicks on/downloads a study material.
 * @param {string} courseName - The name of the course
 * @param {string} materialName - The name of the material
 */
export const logMaterialDownload = async (courseName, materialName) => {
    return logPageView('/materials/click', {
        type: 'material_view',
        courseName,
        materialName
    });
};

/**
 * Log when a student successfully completes a quiz attempt.
 * @param {string} quizId - The identifier of the quiz
 * @param {string} quizTitle - The title of the quiz (part/chapter name)
 * @param {string} score - The final grade achieved (e.g. "8/10")
 * @param {Object} extra - Additional context: { courseName, partTitle, wrongQuestions }
 *   wrongQuestions: Array of { questionText, correctAnswer, studentAnswer }
 */
export const logQuizCompletion = async (quizId, quizTitle, score, extra = {}) => {
    return logPageView('/quiz/complete', {
        type: 'quiz_completed',
        quizId,
        quizTitle,
        score,
        courseName: extra.courseName || '',
        partTitle: extra.partTitle || quizTitle || '',
        wrongQuestions: extra.wrongQuestions || [],
    });
};
