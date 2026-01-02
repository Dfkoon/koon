import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

const COLLECTION_NAME = 'page_views';

export const analyticsService = {
    // Log a page view
    async logPageView(pagePath, duration, sessionId, visitorId) {
        try {
            await addDoc(collection(db, COLLECTION_NAME), {
                path: pagePath,
                duration: duration, // in seconds
                sessionId: sessionId,
                visitorId: visitorId,
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
