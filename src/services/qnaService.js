import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

export const qnaService = {
    // Fetch from BOTH 'qna' and 'suggestions' collections
    async getAllSuggestions() {
        try {
            // 1. Fetch 'qna'
            const qnaSnapshot = await getDocs(collection(db, 'qna'));
            const qnaData = qnaSnapshot.docs.map(doc => ({
                id: doc.id,
                source: 'qna',
                ...doc.data(),
                // Normalize Content Fields
                text: doc.data().message || doc.data().text || doc.data().content || doc.data().quote || ''
            }));

            // 2. Fetch 'suggestions' (Legacy)
            const suggSnapshot = await getDocs(collection(db, 'suggestions'));
            const suggData = suggSnapshot.docs.map(doc => ({
                id: doc.id,
                source: 'suggestions',
                ...doc.data(),
                text: doc.data().message || doc.data().text || doc.data().content || doc.data().quote || ''
            }));

            // Merge and Sort
            const combined = [...qnaData, ...suggData].sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
                return dateB - dateA;
            });

            return combined;
        } catch (error) {
            console.error("Error fetching suggestions:", error);
            return [];
        }
    },

    async deleteSuggestion(id, sourceCollection = 'qna') {
        await deleteDoc(doc(db, sourceCollection, id));
    },

    async togglePublicStatus(id, newStatus, sourceCollection = 'qna') {
        await updateDoc(doc(db, sourceCollection, id), { isPublic: newStatus });
    }
};
