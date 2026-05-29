import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const VIEWS_COLLECTION = 'page_views';

export const logPageView = async (path) => {
    // Avoid logging admin paths
    if (path.startsWith('/admin')) return;

    try {
        await addDoc(collection(db, VIEWS_COLLECTION), {
            path,
            timestamp: serverTimestamp(),
            userAgent: navigator.userAgent
        });
    } catch (error) {
        console.warn('Failed to log page view:', error);
    }
};

export const getAnalyticsData = async () => {
    try {
        const snapshot = await getDocs(collection(db, VIEWS_COLLECTION));
        const views = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                date: data.timestamp ? data.timestamp.toDate() : new Date()
            };
        });

        // Calculate aggregated data
        const totalViews = views.length;
        const pageBreakdown = {};
        const hourlyBreakdown = Array(24).fill(0);

        views.forEach(view => {
            // By path
            const path = view.path || '/';
            if (!pageBreakdown[path]) pageBreakdown[path] = 0;
            pageBreakdown[path]++;

            // By hour
            if (view.date) {
                const hour = view.date.getHours();
                hourlyBreakdown[hour]++;
            }
        });

        const sortedPages = Object.entries(pageBreakdown)
            .map(([path, count]) => ({ path, count }))
            .sort((a, b) => b.count - a.count);

        return {
            totalViews,
            viewsByPage: sortedPages,
            viewsByHour: hourlyBreakdown
        };
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return { totalViews: 0, viewsByPage: [], viewsByHour: Array(24).fill(0) };
    }
};
