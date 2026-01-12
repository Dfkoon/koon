import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

const COLLECTION_NAME = 'page_views';

export const analyticsService = {
    // Detect device type
    getDeviceType() {
        const ua = navigator.userAgent;
        if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
            return 'tablet';
        }
        if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
            return 'mobile';
        }
        return 'desktop';
    },

    // Detect browser
    getBrowser() {
        const ua = navigator.userAgent;
        if (ua.indexOf('Firefox') > -1) return 'Firefox';
        if (ua.indexOf('SamsungBrowser') > -1) return 'Samsung Internet';
        if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) return 'Opera';
        if (ua.indexOf('Trident') > -1) return 'IE';
        if (ua.indexOf('Edge') > -1) return 'Edge';
        if (ua.indexOf('Chrome') > -1) return 'Chrome';
        if (ua.indexOf('Safari') > -1) return 'Safari';
        return 'Unknown';
    },

    // Get hour of day (0-23)
    getHourOfDay() {
        return new Date().getHours();
    },

    // Get time period (morning, afternoon, evening, night)
    getTimePeriod() {
        const hour = this.getHourOfDay();
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        if (hour >= 18 && hour < 22) return 'evening';
        return 'night';
    },

    // Log a page view
    async logPageView(pagePath, duration, sessionId, visitorId) {
        try {
            await addDoc(collection(db, COLLECTION_NAME), {
                path: pagePath,
                duration: duration, // in seconds
                sessionId: sessionId,
                visitorId: visitorId,
                deviceType: this.getDeviceType(),
                browser: this.getBrowser(),
                hourOfDay: this.getHourOfDay(),
                timePeriod: this.getTimePeriod(),
                timestamp: serverTimestamp(),
                date: new Date().toISOString().split('T')[0] // For easier grouping
            });
            return { success: true };
        } catch (error) {
            console.error("Error logging page view:", error);
            return { success: false, error };
        }
    },

    // Get stats for admin
    async getAnalyticsStats() {
        try {
            const q = query(collection(db, COLLECTION_NAME), orderBy('timestamp', 'desc'), limit(5000));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            return data;
        } catch (error) {
            console.error("Error fetching analytics stats:", error);
            return [];
        }
    }
};
