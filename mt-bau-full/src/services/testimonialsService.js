import { db } from '../config/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, onSnapshot, writeBatch } from 'firebase/firestore';

const TESTIMONIALS_COLLECTION = 'testimonials';

// Submit a new testimonial (Instant display, Admin can delete later)
export const submitTestimonial = async (testimonialData) => {
    try {
        const docRef = await addDoc(collection(db, TESTIMONIALS_COLLECTION), {
            ...testimonialData,
            status: 'approved',
            approved: true,
            createdAt: serverTimestamp(),
        });
        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error submitting testimonial:', error);
        return { success: false, error: error.message };
    }
};

// Subscribe to approved testimonials (Real-time)
export const subscribeToApprovedTestimonials = (callback) => {
    // Note: Removed orderBy('createdAt', 'desc') to avoid composite index requirement.
    // Sorting will be handled locally in the callback.
    const q = query(
        collection(db, TESTIMONIALS_COLLECTION),
        where('approved', '==', true)
    );

    return onSnapshot(q, (snapshot) => {
        const testimonials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort locally by createdAt desc
        testimonials.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });
        callback(testimonials);
    }, (error) => {
        console.error('Error in testimonials subscription:', error);
        callback([]);
    });
};

// Subscribe to all testimonials (Admin Real-time)
export const subscribeToAllTestimonials = (callback) => {
    const q = query(collection(db, TESTIMONIALS_COLLECTION), orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
        const testimonials = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(testimonials);
    }, (error) => {
        console.error('Error in admin testimonials subscription:', error);
        callback([]);
    });
};

// Get all approved testimonials (Fallback/One-time)
export const getApprovedTestimonials = async () => {
    try {
        const q = query(
            collection(db, TESTIMONIALS_COLLECTION),
            where('approved', '==', true)
        );
        const querySnapshot = await getDocs(q);
        const testimonials = [];
        querySnapshot.forEach((doc) => {
            testimonials.push({ id: doc.id, ...doc.data() });
        });
        // Sort locally
        testimonials.sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
        });
        return testimonials;
    } catch (error) {
        console.error('Error fetching approved testimonials:', error);
        return [];
    }
};

// Get all testimonials (for admin panel)
export const getAllTestimonials = async () => {
    try {
        const q = query(collection(db, TESTIMONIALS_COLLECTION), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const testimonials = [];
        querySnapshot.forEach((doc) => {
            testimonials.push({ id: doc.id, ...doc.data() });
        });
        return testimonials;
    } catch (error) {
        console.error('Error fetching all testimonials:', error);
        return [];
    }
};

// Approve a testimonial
export const approveTestimonial = async (testimonialId, approvedBy = 'Admin') => {
    try {
        const testimonialRef = doc(db, TESTIMONIALS_COLLECTION, testimonialId);
        await updateDoc(testimonialRef, {
            status: 'approved',
            approved: true, // Specific field for security rules
            approvedAt: serverTimestamp(),
            approvedBy: approvedBy,
        });
        return { success: true };
    } catch (error) {
        console.error('Error approving testimonial:', error);
        return { success: false, error: error.message };
    }
};

// Reject a testimonial
export const rejectTestimonial = async (testimonialId) => {
    try {
        const testimonialRef = doc(db, TESTIMONIALS_COLLECTION, testimonialId);
        await updateDoc(testimonialRef, {
            status: 'rejected',
            rejectedAt: serverTimestamp(),
        });
        return { success: true };
    } catch (error) {
        console.error('Error rejecting testimonial:', error);
        return { success: false, error: error.message };
    }
};

// Delete a testimonial
export const deleteTestimonial = async (testimonialId) => {
    try {
        await deleteDoc(doc(db, TESTIMONIALS_COLLECTION, testimonialId));
        return { success: true };
    } catch (error) {
        console.error('Error deleting testimonial:', error);
        return { success: false, error: error.message };
    }
};

// Delete ALL testimonials (DANGER ZONE)
export const deleteAllTestimonials = async () => {
    try {
        const q = query(collection(db, TESTIMONIALS_COLLECTION));
        const snapshot = await getDocs(q);

        const batch = writeBatch(db);
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error('Error deleting all testimonials:', error);
        return { success: false, error: error.message };
    }
};
