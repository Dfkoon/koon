import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, orderBy } from 'firebase/firestore';

const COLLECTION_NAME = 'materialDonations';

export const materialsService = {
    async getAllMaterials() {
        try {
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : (doc.data().createdAt ? (doc.data().createdAt.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt)) : new Date())
            })).sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            console.error("Error fetching materials:", error);
            return [];
        }
    },

    async deleteMaterial(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
};
