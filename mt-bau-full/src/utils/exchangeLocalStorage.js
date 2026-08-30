/**
 * Local Storage Management for Material Exchange
 * Handles tracking of donations and bookings with localStorage
 */

const STORAGE_KEYS = {
    MY_DONATIONS: 'makanak_my_donations',
    MY_BOOKINGS: 'makanak_my_bookings',
    RECENT_SEARCHES: 'makanak_recent_searches',
    USER_PROFILE: 'makanak_user_profile'
};

/**
 * Save user profile for faster tracking
 */
export const saveUserProfile = (phone, name) => {
    try {
        const profile = { phone: phone.trim(), name: name.trim(), savedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
    } catch (error) {
        console.error('Error saving user profile:', error);
    }
};

/**
 * Get saved user profile
 */
export const getUserProfile = () => {
    try {
        const profile = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
        return profile ? JSON.parse(profile) : null;
    } catch (error) {
        console.error('Error getting user profile:', error);
        return null;
    }
};

/**
 * Save a donation submission
 */
export const saveDonationRecord = (donationData) => {
    try {
        const donations = getDonationRecords();
        const newDonation = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            phoneNumber: donationData.phoneNumber,
            studentName: donationData.studentName,
            materials: donationData.materials,
            submittedAt: new Date().toISOString(),
            status: 'submitted'
        };
        donations.push(newDonation);
        localStorage.setItem(STORAGE_KEYS.MY_DONATIONS, JSON.stringify(donations));
        return newDonation;
    } catch (error) {
        console.error('Error saving donation record:', error);
        return null;
    }
};

/**
 * Get all saved donation records
 */
export const getDonationRecords = () => {
    try {
        const donations = localStorage.getItem(STORAGE_KEYS.MY_DONATIONS);
        return donations ? JSON.parse(donations) : [];
    } catch (error) {
        console.error('Error getting donation records:', error);
        return [];
    }
};

/**
 * Save a booking submission
 */
export const saveBookingRecord = (bookingData) => {
    try {
        const bookings = getBookingRecords();
        const newBooking = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            phoneNumber: bookingData.phone,
            studentName: bookingData.name,
            materialName: bookingData.materialName,
            donorPhone: bookingData.donorPhone,
            donorName: bookingData.donorName,
            bookedAt: new Date().toISOString(),
            status: 'booked'
        };
        bookings.push(newBooking);
        localStorage.setItem(STORAGE_KEYS.MY_BOOKINGS, JSON.stringify(bookings));
        return newBooking;
    } catch (error) {
        console.error('Error saving booking record:', error);
        return null;
    }
};

/**
 * Get all saved booking records
 */
export const getBookingRecords = () => {
    try {
        const bookings = localStorage.getItem(STORAGE_KEYS.MY_BOOKINGS);
        return bookings ? JSON.parse(bookings) : [];
    } catch (error) {
        console.error('Error getting booking records:', error);
        return [];
    }
};

/**
 * Filter donations by phone number
 */
export const findDonationsByPhone = (phone) => {
    const donations = getDonationRecords();
    return donations.filter(d => d.phoneNumber === phone.trim());
};

/**
 * Filter bookings by phone number
 */
export const findBookingsByPhone = (phone) => {
    const bookings = getBookingRecords();
    return bookings.filter(b => {
        const bookingPhone = (b.phoneNumber || b.phone || '').toString().trim();
        return bookingPhone === phone.trim();
    });
};

/**
 * Clear all local data (for testing)
 */
export const clearAllData = () => {
    try {
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        return true;
    } catch (error) {
        console.error('Error clearing data:', error);
        return false;
    }
};

/**
 * Filter materials by multiple criteria
 */
export const filterMaterials = (materials, filters) => {
    let filtered = materials;

    // Filter by search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        filtered = filtered.filter(m =>
            (m.materialName || '').toLowerCase().includes(query) ||
            (m.materialItem?.description || '').toLowerCase().includes(query)
        );
    }

    // Filter by status
    if (filters.status && filters.status !== 'all') {
        filtered = filtered.filter(m => m.materialItem.status === filters.status);
    }

    // Filter by reserved/available
    if (filters.availability === 'available') {
        filtered = filtered.filter(m => !m.isReserved);
    } else if (filters.availability === 'reserved') {
        filtered = filtered.filter(m => m.isReserved);
    }

    return filtered;
};
