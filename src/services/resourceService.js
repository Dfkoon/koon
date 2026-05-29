import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const SUGGESTIONS_COLLECTION = 'resource_suggestions';

/**
 * Submit a resource suggestion to Firestore
 * @param {Object} suggestionData - The suggestion data (name, description, link)
 * @returns {Promise<Object>} Result with success status and doc id
 */
export const submitResourceSuggestion = async (suggestionData) => {
    try {
        const docRef = await addDoc(collection(db, SUGGESTIONS_COLLECTION), {
            ...suggestionData,
            status: 'pending',
            createdAt: serverTimestamp(),
        });

        console.log('Resource suggestion submitted, ID:', docRef.id);
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error submitting resource suggestion:', error);
        return { success: false, error: error.message };
    }
};
