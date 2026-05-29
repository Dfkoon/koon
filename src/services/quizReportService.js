import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const REPORTS_COLLECTION = 'question_reports';

/**
 * Submits a report for a specific quiz question to Firestore.
 * @param {Object} reportData - The data to store
 */
export const submitQuestionReport = async (reportData) => {
    try {
        const docRef = await addDoc(collection(db, REPORTS_COLLECTION), {
            ...reportData,
            text: `Report: [${reportData.quizId}] ${reportData.questionAr || reportData.questionEn}`, // Required by firestore.rules validation
            status: 'pending',
            createdAt: serverTimestamp(),
        });
        console.log('Question report submitted with ID:', docRef.id);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error reporting question:', error);
        return { success: false, error: error.message };
    }
};
