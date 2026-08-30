/**
 * Course Status Service
 * Handles saving and retrieving course booking/donation status from Firestore
 */

import { 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    updateDoc, 
    doc,
    Timestamp 
} from 'firebase/firestore';
import { db } from '../config/firebase';

const COLLECTIONS = {
    BOOKINGS: 'courseBookings',
    DONATIONS: 'courseDonations',
    STATUS_UPDATES: 'statusUpdates'
};

/**
 * Save a course booking to Firestore
 */
export const saveCourseBooking = async (bookingData) => {
    try {
        const docRef = await addDoc(collection(db, COLLECTIONS.BOOKINGS), {
            studentName: bookingData.studentName,
            phoneNumber: bookingData.phoneNumber,
            courseName: bookingData.courseName,
            courseCode: bookingData.courseCode,
            faculty: bookingData.faculty,
            status: 'pending', // pending, approved, rejected
            submittedAt: Timestamp.now(),
            approvedAt: null,
            approvedBy: null,
            notes: bookingData.notes || '',
            email: bookingData.email || '',
            active: true
        });
        return {
            success: true,
            bookingId: docRef.id,
            data: bookingData
        };
    } catch (error) {
        console.error('Error saving booking:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Save a course donation to Firestore
 */
export const saveCourseDonation = async (donationData) => {
    try {
        const docRef = await addDoc(collection(db, COLLECTIONS.DONATIONS), {
            donorName: donationData.donorName,
            phoneNumber: donationData.phoneNumber,
            courseNames: donationData.courseNames, // Array of courses
            faculty: donationData.faculty,
            status: 'pending', // pending, approved, rejected
            submittedAt: Timestamp.now(),
            approvedAt: null,
            approvedBy: null,
            notes: donationData.notes || '',
            email: donationData.email || '',
            resourcesOffered: donationData.resourcesOffered || [], // notes, summaries, etc.
            active: true
        });
        return {
            success: true,
            donationId: docRef.id,
            data: donationData
        };
    } catch (error) {
        console.error('Error saving donation:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Search for bookings by phone number
 */
export const searchBookingsByPhone = async (phoneNumber) => {
    try {
        const q = query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('phoneNumber', '==', phoneNumber.trim()),
            where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const bookings = [];
        
        snapshot.forEach((doc) => {
            bookings.push({
                id: doc.id,
                ...doc.data(),
                submittedAt: doc.data().submittedAt?.toDate(),
                approvedAt: doc.data().approvedAt?.toDate()
            });
        });
        
        return {
            success: true,
            data: bookings,
            count: bookings.length
        };
    } catch (error) {
        console.error('Error searching bookings:', error);
        return {
            success: false,
            data: [],
            error: error.message
        };
    }
};

/**
 * Search for donations by phone number
 */
export const searchDonationsByPhone = async (phoneNumber) => {
    try {
        const q = query(
            collection(db, COLLECTIONS.DONATIONS),
            where('phoneNumber', '==', phoneNumber.trim()),
            where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const donations = [];
        
        snapshot.forEach((doc) => {
            donations.push({
                id: doc.id,
                ...doc.data(),
                submittedAt: doc.data().submittedAt?.toDate(),
                approvedAt: doc.data().approvedAt?.toDate()
            });
        });
        
        return {
            success: true,
            data: donations,
            count: donations.length
        };
    } catch (error) {
        console.error('Error searching donations:', error);
        return {
            success: false,
            data: [],
            error: error.message
        };
    }
};

/**
 * Get a single booking by ID
 */
export const getBookingById = async (bookingId) => {
    try {
        const docSnap = await getDocs(query(collection(db, COLLECTIONS.BOOKINGS), where('__name__', '==', bookingId)));
        
        if (!docSnap.empty) {
            const data = docSnap.docs[0].data();
            return {
                success: true,
                data: {
                    id: docSnap.docs[0].id,
                    ...data,
                    submittedAt: data.submittedAt?.toDate(),
                    approvedAt: data.approvedAt?.toDate()
                }
            };
        }
        
        return { success: false, error: 'Booking not found' };
    } catch (error) {
        console.error('Error getting booking:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Update booking status (Admin only)
 */
export const updateBookingStatus = async (bookingId, status, approverInfo = {}) => {
    try {
        const bookingRef = doc(db, COLLECTIONS.BOOKINGS, bookingId);
        const updateData = {
            status: status, // approved, rejected
            approvedAt: status === 'pending' ? null : Timestamp.now(),
            approvedBy: approverInfo.name || 'admin',
            notes: approverInfo.notes || ''
        };
        
        await updateDoc(bookingRef, updateData);
        
        return {
            success: true,
            message: `Booking status updated to ${status}`
        };
    } catch (error) {
        console.error('Error updating booking status:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Update donation status (Admin only)
 */
export const updateDonationStatus = async (donationId, status, approverInfo = {}) => {
    try {
        const donationRef = doc(db, COLLECTIONS.DONATIONS, donationId);
        const updateData = {
            status: status, // approved, rejected
            approvedAt: status === 'pending' ? null : Timestamp.now(),
            approvedBy: approverInfo.name || 'admin',
            notes: approverInfo.notes || ''
        };
        
        await updateDoc(donationRef, updateData);
        
        return {
            success: true,
            message: `Donation status updated to ${status}`
        };
    } catch (error) {
        console.error('Error updating donation status:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Get all pending bookings (Admin)
 */
export const getPendingBookings = async () => {
    try {
        const q = query(
            collection(db, COLLECTIONS.BOOKINGS),
            where('status', '==', 'pending'),
            where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const bookings = [];
        
        snapshot.forEach((doc) => {
            bookings.push({
                id: doc.id,
                ...doc.data(),
                submittedAt: doc.data().submittedAt?.toDate()
            });
        });
        
        return {
            success: true,
            data: bookings,
            count: bookings.length
        };
    } catch (error) {
        console.error('Error getting pending bookings:', error);
        return {
            success: false,
            data: [],
            error: error.message
        };
    }
};

/**
 * Get all pending donations (Admin)
 */
export const getPendingDonations = async () => {
    try {
        const q = query(
            collection(db, COLLECTIONS.DONATIONS),
            where('status', '==', 'pending'),
            where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const donations = [];
        
        snapshot.forEach((doc) => {
            donations.push({
                id: doc.id,
                ...doc.data(),
                submittedAt: doc.data().submittedAt?.toDate()
            });
        });
        
        return {
            success: true,
            data: donations,
            count: donations.length
        };
    } catch (error) {
        console.error('Error getting pending donations:', error);
        return {
            success: false,
            data: [],
            error: error.message
        };
    }
};
