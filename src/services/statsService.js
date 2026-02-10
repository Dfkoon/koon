import { db } from '../lib/firebase';
import { collection, getDocs, query, where, count } from 'firebase/firestore';

export const statsService = {
    async getGlobalStats() {
        const stats = {
            complaints: 0,
            testimonials: 0,
            materials: 0,
            reports: 0,
            nashmi: 0,
            contributions: 0,
            websites: 0,
            visitors: "1,200+"
        };

        try {
            // Get Suggestions/Complaints count (Filtered)
            try {
                const [qnaSnap, suggSnap] = await Promise.all([
                    getDocs(collection(db, 'qna')),
                    getDocs(collection(db, 'suggestions'))
                ]);
                const complaintsTypes = ['complaint', 'suggestion', 'technical', 'thanks', 'other'];
                const filterCount = (snap) => snap.docs.filter(doc => !doc.data().type || complaintsTypes.includes(doc.data().type)).length;
                stats.complaints = filterCount(qnaSnap) + filterCount(suggSnap);

                // Keep qnaSnap for fallbacks
                const qnaDocs = qnaSnap.docs;

                // Get Nashmi Fallback
                try {
                    const nashmiSnap = await getDocs(collection(db, 'nashmi_chat'));
                    let count = nashmiSnap.docs.filter(doc => !doc.data().type || doc.data().type === 'nashmi').length;
                    if (count === 0) {
                        count = qnaDocs.filter(doc => doc.data().type === 'nashmi').length;
                    }
                    stats.nashmi = count;
                } catch (e) {
                    // If nashmi_chat fails, try fallback from qna
                    stats.nashmi = qnaDocs.filter(doc => doc.data().type === 'nashmi').length;
                }

                // Get Website Fallback
                try {
                    const siteSnap = await getDocs(collection(db, 'site_suggestions'));
                    let count = siteSnap.docs.filter(doc => !doc.data().type || doc.data().type === 'website' || doc.data().type === 'tool').length;
                    if (count === 0) {
                        count = qnaDocs.filter(doc => doc.data().type === 'website' || doc.data().type === 'tool').length;
                    }
                    stats.websites = count;
                } catch (e) {
                    stats.websites = qnaDocs.filter(doc => doc.data().type === 'website' || doc.data().type === 'tool').length;
                }

            } catch (e) { console.error("Stats: QnA/Suggestions error", e); }

            // Get Testimonials (Approved)
            try {
                const testimonialsSnap = await getDocs(query(collection(db, 'testimonials'), where('status', '==', 'approved')));
                stats.testimonials = testimonialsSnap.size;
            } catch (e) { console.error("Stats: Testimonials error", e); }

            // Get Material Donations
            try {
                const materialsSnap = await getDocs(collection(db, 'materialDonations'));
                stats.materials = materialsSnap.size;
            } catch (e) { console.error("Stats: Materials error", e); }

            // Get Question Reports
            try {
                const reportsSnap = await getDocs(collection(db, 'question_reports'));
                stats.reports = reportsSnap.size;
            } catch (e) { console.error("Stats: Reports error", e); }

            // Get Student Contributions
            try {
                const contributionsSnap = await getDocs(collection(db, 'quizContributions'));
                stats.contributions = contributionsSnap.size;
            } catch (e) { console.error("Stats: Contributions error", e); }

            return stats;
        } catch (error) {
            console.error("Error fetching stats:", error);
            return stats;
        }
    },

    async getWeeklyVisits() {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            // Fetch page views from last 7 days
            const q = query(
                collection(db, 'page_views'),
                where('timestamp', '>', sevenDaysAgo)
            );

            const snapshot = await getDocs(q);

            // Initialize last 7 days map
            const daysMap = {};
            const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayName = days[d.getDay()];
                daysMap[dayName] = 0;
            }

            // Aggregate counts
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.timestamp) {
                    const date = data.timestamp.toDate();
                    const dayName = days[date.getDay()];
                    if (daysMap[dayName] !== undefined) {
                        daysMap[dayName]++;
                    }
                }
            });

            // Format for Recharts
            return Object.keys(daysMap).map(day => ({
                name: day,
                visits: daysMap[day]
            }));

        } catch (error) {
            console.error("Error fetching weekly visits:", error);
            // Return empty fallback structure
            return [
                { name: 'السبت', visits: 0 },
                { name: 'الأحد', visits: 0 },
                { name: 'الاثنين', visits: 0 },
                { name: 'الثلاثاء', visits: 0 },
                { name: 'الأربعاء', visits: 0 },
                { name: 'الخميس', visits: 0 },
                { name: 'الجمعة', visits: 0 },
            ];
        }
    }
};
