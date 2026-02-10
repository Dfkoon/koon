import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';

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
        const updateData = {
            status: newStatus,
            approved: newStatus === 'approved' // Critical for security rules
        };

        // Website uses 'approvedAt' for ordering, so we must set it
        if (newStatus === 'approved') {
            updateData.approvedAt = serverTimestamp();
        }

        await updateDoc(testimonialRef, updateData);
    },

    async deleteTestimonial(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    },

    async updateTestimonialDetails(id, newText) {
        // We handle multiple possible text fields to be safe, but standardize on 'quote' for the future
        await updateDoc(doc(db, COLLECTION_NAME, id), {
            quote: newText,
            message: newText, // Keep legacy fields in sync just in case
            text: newText
        });
    }
};
