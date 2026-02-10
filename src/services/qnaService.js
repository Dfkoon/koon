import { db } from '../lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

export const qnaService = {
    // Fetch from BOTH 'qna' and 'suggestions' collections with optional filtering
    async getAllSuggestions(typeFilter = null) {
        try {
            // ...
            // Check current user authentication
            const { auth } = await import('../lib/firebase');
            const currentUser = auth.currentUser;

            console.log('🔐 Current User:', currentUser?.email || 'Not logged in');
            console.log('🔐 User UID:', currentUser?.uid || 'N/A');

            // 1. Fetch 'qna'
            console.log('📥 Fetching from "qna" collection...');
            const qnaSnapshot = await getDocs(collection(db, 'qna'));
            console.log(`✅ QnA: Retrieved ${qnaSnapshot.docs.length} documents`);

            const qnaData = qnaSnapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    source: 'qna',
                    ...data,
                    // Normalize Content Fields
                    text: data.message || data.text || data.content || data.quote || '',
                    // Normalize Date Field
                    createdAt: data.createdAt || data.timestamp || data.date || null,
                    // Normalize Contact Info
                    email: data.email || data.mail || data.userEmail || null,
                    phone: data.phone || data.phoneNumber || data.mobile || data.contactNumber || data.tel || data.whatsapp || data.contact || null
                };
            });

            // 2. Fetch 'suggestions' (Legacy)
            console.log('📥 Fetching from "suggestions" collection...');
            const suggSnapshot = await getDocs(collection(db, 'suggestions'));
            console.log(`✅ Suggestions: Retrieved ${suggSnapshot.docs.length} documents`);

            const suggData = suggSnapshot.docs.map(doc => {
                const data = doc.data();
                console.log("Raw Suggestion Data:", doc.id, data); // DEBUG: Check field names in console
                return {
                    id: doc.id,
                    source: 'suggestions',
                    ...data,
                    text: data.message || data.text || data.content || data.quote || '',
                    // Normalize Date Field
                    createdAt: data.createdAt || data.timestamp || data.date || null,
                    // Normalize Contact Info
                    email: data.email || data.mail || data.userEmail || null,
                    phone: data.phone || data.phoneNumber || data.mobile || data.contactNumber || data.tel || data.whatsapp || data.contact || null
                };
            });

            // Merge and Filter
            let combined = [...qnaData, ...suggData];

            if (typeFilter) {
                const filterArray = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
                combined = combined.filter(item => {
                    // If no type exists, we show it in Suggestions (default)
                    if (!item.type) return true;
                    return filterArray.includes(item.type);
                });
            }

            // Sort
            combined.sort((a, b) => {
                const getMillis = (d) => {
                    if (!d) return 0;
                    if (d.toDate) return d.toDate().getTime();
                    return new Date(d).getTime() || 0;
                };
                return getMillis(b.createdAt) - getMillis(a.createdAt);
            });

            console.log(`📊 Total messages: ${combined.length} (QnA: ${qnaData.length}, Suggestions: ${suggData.length})`);
            return combined;
        } catch (error) {
            console.error("❌ Error fetching suggestions:", error);
            console.error("❌ Error code:", error.code);
            console.error("❌ Error message:", error.message);

            // Check if it's a permission error
            if (error.code === 'permission-denied') {
                console.error('🚫 PERMISSION DENIED: You need to be logged in as Admin!');
                console.error('🚫 Allowed emails: admin@koon.bau.jo, hussienaldayyat@gmail.com');
            }

            return [];
        }
    },

    async deleteSuggestion(id, sourceCollection = 'qna') {
        await deleteDoc(doc(db, sourceCollection, id));
    },

    async togglePublicStatus(id, newStatus, sourceCollection = 'qna') {
        await updateDoc(doc(db, sourceCollection, id), { isPublic: newStatus });
    }
};
