import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

const COLLECTION_NAME = 'question_reports';

export const questionReportsService = {
    async getAllReports() {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Error fetching question reports:", error);
            return [];
        }
    },

    async updateStatus(id, newStatus) {
        const reportRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(reportRef, {
            status: newStatus, // 'pending', 'resolved', 'ignored'
            updatedAt: new Date()
        });
    },

    async deleteReport(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
};
