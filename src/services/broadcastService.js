import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, addDoc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';

const COLLECTION_NAME = 'broadcasts';

export const broadcastService = {
    async getAllBroadcasts() {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt || Date.now())
            }));
        } catch (error) {
            console.error("Error fetching broadcasts:", error);
            return [];
        }
    },

    async addBroadcast(data) {
        return await addDoc(collection(db, COLLECTION_NAME), {
            ...data,
            createdAt: serverTimestamp(),
            active: true
        });
    },

    async deleteBroadcast(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    },

    async toggleActive(id, status) {
        await updateDoc(doc(db, COLLECTION_NAME, id), { active: status });
    }
};
