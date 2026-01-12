import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

const COLLECTION_NAME = 'testimonials';

export const testimonialsService = {
    // Add a new testimonial
    async addTestimonial(data) {
        try {
            await addDoc(collection(db, COLLECTION_NAME), {
                ...data, // author, role, company (major), quote
                text: data.quote || data.text || '', // Save both for compatibility
                status: 'pending', // pending, approved, rejected
                createdAt: new Date().toISOString(),
                avatarColor: getRandomColor()
            });
            return { success: true };
        } catch (error) {
            console.error("Error adding testimonial:", error);
            return { success: false, error };
        }
    },

    // Get all testimonials (for Admin)
    async getAllTestimonials() {
        try {
            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
            const testimonials = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            // Sort by date descending
            return testimonials.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (error) {
            console.error("Error fetching testimonials:", error);
            return [];
        }
    },

    // Get approved testimonials (for Home Page)
    async getApprovedTestimonials() {
        try {
            const all = await this.getAllTestimonials();
            return all.filter(t => t.status === 'approved');
        } catch (error) {
            console.error("Error fetching approved testimonials:", error);
            return [];
        }
    },

    // Update status (Approve/Reject)
    async updateStatus(id, newStatus) {
        try {
            const testimonialRef = doc(db, COLLECTION_NAME, id);
            await updateDoc(testimonialRef, {
                status: newStatus
            });
            return { success: true };
        } catch (error) {
            console.error("Error updating testimonial status:", error);
            return { success: false, error };
        }
    },

    // Delete testimonial
    async deleteTestimonial(id) {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, id));
            return { success: true };
        } catch (error) {
            console.error("Error deleting testimonial:", error);
            return { success: false, error };
        }
    }
};

const getRandomColor = () => {
    const colors = ['#e91e63', '#9c27b0', '#2196f3', '#ff9800', '#4caf50', '#009688', '#3f51b5'];
    return colors[Math.floor(Math.random() * colors.length)];
};
