import { db, storage } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';

const COLLECTION_NAME = 'quizContributions';

export const contributionsService = {
    async getAllContributions() {
        try {
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt || Date.now())
            })).sort((a, b) => b.date - a.date);
        } catch (error) {
            console.error("Error fetching contributions:", error);
            return [];
        }
    },

    async updateStatus(id, newStatus) {
        const docRef = doc(db, COLLECTION_NAME, id);
        const updateData = {
            status: newStatus
        };

        if (newStatus === 'approved') {
            updateData.approvedAt = serverTimestamp();
        }

        await updateDoc(docRef, updateData);
    },

    async deleteContribution(id, storagePath) {
        try {
            if (storagePath) {
                const fileRef = ref(storage, storagePath);
                await deleteObject(fileRef);
            }
            await deleteDoc(doc(db, COLLECTION_NAME, id));
        } catch (error) {
            console.error("Error deleting contribution:", error);
            throw error;
        }
    }
};
