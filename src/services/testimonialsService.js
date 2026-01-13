import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

const COLLECTION_NAME = 'testimonials';

export const testimonialsService = {
    async getAllTestimonials() {
        try {
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(doc.data().createdAt || Date.now())
            })).sort((a, b) => b.date - a.date);
        } catch (error) {
            console.error("Error fetching testimonials:", error);
            return [];
        }
    },

    async updateStatus(id, newStatus) {
        const testimonialRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(testimonialRef, {
            status: newStatus,
            approved: newStatus === 'approved' // Critical for security rules
        });
    },

    async deleteTestimonial(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
};
