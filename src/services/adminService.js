import { collection, addDoc, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const MATERIALS_COLLECTION = 'custom_courses';

// --- Admin Materials Management ---

export const getCustomCourses = async () => {
    try {
        const snapshot = await getDocs(collection(db, MATERIALS_COLLECTION));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error fetching custom courses:', error);
        return [];
    }
};

export const addCustomCourse = async (courseData) => {
    try {
        const docRef = await addDoc(collection(db, MATERIALS_COLLECTION), {
            ...courseData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error adding course:', error);
        return { success: false, error: error.message };
    }
};

export const updateCustomCourse = async (courseId, courseData) => {
    try {
        const courseRef = doc(db, MATERIALS_COLLECTION, courseId);
        await updateDoc(courseRef, {
            ...courseData,
            updatedAt: serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error('Error updating course:', error);
        return { success: false, error: error.message };
    }
};

export const deleteCustomCourse = async (courseId) => {
    try {
        const courseRef = doc(db, MATERIALS_COLLECTION, courseId);
        await deleteDoc(courseRef);
        return { success: true };
    } catch (error) {
        console.error('Error deleting course:', error);
        return { success: false, error: error.message };
    }
};

// --- System Settings Management ---

export const getSystemSettings = async () => {
    try {
        const settingsRef = doc(db, 'system_configs', 'global_settings');
        const docSnap = await getDoc(settingsRef);

        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            // Default settings if document doesn't exist
            const defaultSettings = {
                isExchangeActive: true,
                exchangeSuspendedMessageAr: 'تم ايقاف حجوزات مؤقتا اذ كان احدكم بحاجة الى ماده تواصل مع 0782934685',
                exchangeSuspendedMessageEn: 'Bookings are temporarily suspended. If you need any material, please contact 0782934685'
            };
            await setDoc(settingsRef, defaultSettings);
            return defaultSettings;
        }
    } catch (error) {
        console.error('Error fetching system settings:', error);
        return null;
    }
};

export const updateSystemSettings = async (newSettings) => {
    try {
        const settingsRef = doc(db, 'system_configs', 'global_settings');
        await setDoc(settingsRef, newSettings, { merge: true });
        return { success: true };
    } catch (error) {
        console.error('Error updating system settings:', error);
        return { success: false, error: error.message };
    }
};

// --- News Management ---

const NEWS_COLLECTION = 'news';

export const getNews = async () => {
    try {
        const snapshot = await getDocs(collection(db, NEWS_COLLECTION));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error fetching news:', error);
        return [];
    }
};

export const addNewsItem = async (newsData) => {
    try {
        const docRef = await addDoc(collection(db, NEWS_COLLECTION), {
            ...newsData,
            createdAt: serverTimestamp()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error adding news:', error);
        return { success: false, error: error.message };
    }
};

export const deleteNewsItem = async (newsId) => {
    try {
        const newsRef = doc(db, NEWS_COLLECTION, newsId);
        await deleteDoc(newsRef);
        return { success: true };
    } catch (error) {
        console.error('Error deleting news:', error);
        return { success: false, error: error.message };
    }
};

// --- Quiz Management ---

const QUIZZES_COLLECTION = 'custom_quizzes';

export const getCustomQuizzes = async (materialId = null) => {
    try {
        const q = collection(db, QUIZZES_COLLECTION);
        const snapshot = await getDocs(q);
        let quizzes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (materialId) {
            quizzes = quizzes.filter(quiz => quiz.materialId === materialId);
        }

        return quizzes;
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        return [];
    }
};

export const addQuiz = async (quizData) => {
    try {
        const docRef = await addDoc(collection(db, QUIZZES_COLLECTION), {
            ...quizData,
            questions: quizData.questions || [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error adding quiz:', error);
        return { success: false, error: error.message };
    }
};

export const updateQuiz = async (quizId, quizData) => {
    try {
        const quizRef = doc(db, QUIZZES_COLLECTION, quizId);
        await updateDoc(quizRef, {
            ...quizData,
            updatedAt: serverTimestamp()
        });
        return { success: true };
    } catch (error) {
        console.error('Error updating quiz:', error);
        return { success: false, error: error.message };
    }
};

export const deleteQuiz = async (quizId) => {
    try {
        const quizRef = doc(db, QUIZZES_COLLECTION, quizId);
        await deleteDoc(quizRef);
        return { success: true };
    } catch (error) {
        console.error('Error deleting quiz:', error);
        return { success: false, error: error.message };
    }
};
