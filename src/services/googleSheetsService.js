// Google Sheets Integration Service
// This service sends data to Google Sheets as a backup
// TEMPORARILY DISABLED due to CORS issues - Firebase provides sufficient data protection

const GOOGLE_SHEETS_URL = import.meta.env.VITE_GOOGLE_SHEETS_URL;

/**
 * Send donation data to Google Sheets
 * @param {Object} donationData - The donation data to send
 * @returns {Promise<Object>} Response from Google Sheets
 */
export const sendDonationToSheets = async (donationData) => {
    try {
        if (!GOOGLE_SHEETS_URL) {
            console.warn('Google Sheets URL not configured');
            return { status: 'skipped', message: 'Google Sheets URL not configured' };
        }

        const params = new URLSearchParams({
            type: 'donation',
            studentName: donationData.studentName,
            phoneNumber: donationData.phoneNumber,
            email: donationData.email || '',
            materials: Array.isArray(donationData.materials) ? donationData.materials.join(', ') : donationData.materials,
            status: donationData.status
        });

        // Use fetch with no-cors mode to avoid CORS errors
        // Note: This returns an opaque response, so we can't read the response body
        // but the request will be processed by Google Sheets
        await fetch(`${GOOGLE_SHEETS_URL}?${params.toString()}`, {
            method: 'GET',
            mode: 'no-cors'
        });

        console.log('✅ Data sent to Google Sheets (no-cors mode)');
        return { status: 'success', message: 'Data sent to Google Sheets' };
    } catch (error) {
        console.error('Error sending to Google Sheets:', error);
        return { status: 'error', message: error.message };
    }
};

/**
 * Send booking data to Google Sheets
 * @param {Object} bookingData - The booking data to send
 * @returns {Promise<Object>} Response from Google Sheets
 */
export const sendBookingToSheets = async (bookingData) => {
    try {
        if (!GOOGLE_SHEETS_URL) {
            console.warn('Google Sheets URL not configured');
            return { status: 'skipped', message: 'Google Sheets URL not configured' };
        }

        const params = new URLSearchParams({
            type: 'booking',
            studentName: bookingData.studentName,
            phoneNumber: bookingData.phoneNumber,
            email: bookingData.email || '',
            materialName: bookingData.materialName,
            donorName: bookingData.donorName,
            donorPhone: bookingData.donorPhone,
            status: bookingData.status
        });

        // Use fetch with no-cors mode to avoid CORS errors
        await fetch(`${GOOGLE_SHEETS_URL}?${params.toString()}`, {
            method: 'GET',
            mode: 'no-cors'
        });

        console.log('✅ Booking data sent to Google Sheets (no-cors mode)');
        return { status: 'success', message: 'Data sent to Google Sheets' };
    } catch (error) {
        console.error('Error sending to Google Sheets:', error);
        return { status: 'error', message: error.message };
    }
};
