import { db } from '../lib/firebase';
import { collection, getDocs, query, where, count } from 'firebase/firestore';

export const statsService = {
    async getGlobalStats() {
        try {
            // Get Suggestions/Complaints count
            const qnaSnap = await getDocs(collection(db, 'qna'));
            const suggSnap = await getDocs(collection(db, 'suggestions'));
            const totalComplaints = qnaSnap.size + suggSnap.size;

            // Get Testimonials (Approved)
            const testimonialsSnap = await getDocs(query(collection(db, 'testimonials'), where('status', '==', 'approved')));
            const approvedTestimonials = testimonialsSnap.size;

            // Get Material Donations
            const materialsSnap = await getDocs(collection(db, 'materialDonations'));
            const totalMaterials = materialsSnap.size;

            // Get Question Reports
            const reportsSnap = await getDocs(collection(db, 'question_reports'));
            const questionReportsCount = reportsSnap.size;

            // Get Nashmi Chat Logs
            const nashmiSnap = await getDocs(collection(db, 'nashmi_chat'));
            const nashmiCount = nashmiSnap.size;

            // Get Student Contributions
            const contributionsSnap = await getDocs(collection(db, 'quizContributions'));
            const contributionsCount = contributionsSnap.size;

            return {
                complaints: totalComplaints,
                testimonials: approvedTestimonials,
                materials: totalMaterials,
                reports: questionReportsCount,
                nashmi: nashmiCount,
                contributions: contributionsCount,
                visitors: "1,200+" // Temporary stationary
            };
        } catch (error) {
            console.error("Error fetching stats:", error);
            return null;
        }
    }
};
