import { db } from '../lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

let COLLECTION_NAME = 'site_suggestions';

export const websiteSuggestionsService = {
    setCollectionName(name) {
        COLLECTION_NAME = name;
        console.log(`🔄 [WebsiteSuggestions] Collection switched to: ${name}`);
    },

    // Fetch all website suggestions
    // Fetch all website suggestions with optional filtering
    async getAllSuggestions(typeFilter = null) {
        try {
            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
            let data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filter only if we are using a shared collection
            const isShared = ['qna', 'suggestions'].includes(COLLECTION_NAME);
            if (typeFilter && isShared) {
                const filterArray = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
                data = data.filter(item => filterArray.includes(item.type) || filterArray.includes(item.category));
            }

            return data;
        } catch (error) {
            console.error("Error fetching site suggestions:", error);
            return [];
        }
    },

    // Delete a suggestion
    async deleteSuggestion(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
};
