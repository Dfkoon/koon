import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, orderBy, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';

const COLLECTION_NAME = 'nashmi_chat';

export const nashmiService = {
    async getAllLogs() {
        try {
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(doc.data().timestamp || Date.now())
            })).sort((a, b) => b.timestamp - a.timestamp);
        } catch (error) {
            console.error("Error fetching Nashmi logs:", error);
            return [];
        }
    },

    async deleteLog(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    },

    async updateStatus(id, status) {
        await updateDoc(doc(db, COLLECTION_NAME, id), { status });
    },

    async addLogToKnowledge(question, answer) {
        await addDoc(collection(db, 'nashmi_knowledge'), {
            question,
            answer,
            verifiedAt: serverTimestamp(),
            source: 'admin_training'
        });
    }
};
