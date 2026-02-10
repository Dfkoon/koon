import { db } from '../lib/firebase';
import { collection, getDocs, doc, deleteDoc, query, orderBy, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';

let COLLECTION_NAME = 'nashmi_chat';

export const nashmiService = {
    setCollectionName(name) {
        COLLECTION_NAME = name;
        console.log(`🔄 [Nashmi] Collection switched to: ${name}`);
    },
    async getAllLogs(typeFilter = null) {
        try {
            // Check current user authentication
            const { auth } = await import('../lib/firebase');
            const currentUser = auth.currentUser;

            console.log(`📥 [Nashmi] Fetching from "${COLLECTION_NAME}" collection...`);
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            console.log(`✅ [Nashmi] Retrieved ${snapshot.docs.length} documents`);

            let logs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() : new Date(doc.data().timestamp || Date.now())
            }));

            // Filter only if we are using a shared collection (like 'qna' or 'suggestions')
            const isShared = ['qna', 'suggestions'].includes(COLLECTION_NAME);
            if (typeFilter && isShared) {
                const filterArray = Array.isArray(typeFilter) ? typeFilter : [typeFilter];
                logs = logs.filter(log => filterArray.includes(log.type) || filterArray.includes(log.category));
            }
            // If it's the dedicated collection, we show everything found there.

            logs.sort((a, b) => b.timestamp - a.timestamp);

            console.log(`📊 [Nashmi] Total logs: ${logs.length}`);
            return logs;
        } catch (error) {
            console.error("❌ [Nashmi] Error fetching logs:", error);
            console.error("❌ [Nashmi] Error code:", error.code);
            console.error("❌ [Nashmi] Error message:", error.message);

            // Check if it's a permission error
            if (error.code === 'permission-denied') {
                console.error('🚫 [Nashmi] PERMISSION DENIED: You need to be logged in as Admin!');
                console.error('🚫 [Nashmi] Allowed emails: admin@koon.bau.jo, hussienaldayyat@gmail.com');
            }

            return [];
        }
    },

    async deleteLog(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    },

    async updateStatus(id, status) {
        await updateDoc(doc(db, COLLECTION_NAME, id), { status });
    },

    // Add answer to knowledge base AND mark the chat log as answered
    async markAsAnswered(logId, question, answer) {
        // 1. Add to Knowledge Base
        await addDoc(collection(db, 'nashmi_knowledge'), {
            question,
            answer,
            verifiedAt: serverTimestamp(),
            source: 'admin_chat_log'
        });

        // 2. Update Chat Log Status and Link
        await updateDoc(doc(db, COLLECTION_NAME, logId), {
            status: 'answered',
            adminAnswer: answer,
            answeredAt: serverTimestamp()
        });
    },

    // Delete ALL logs (Destructive)
    async deleteAllLogs() {
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
    },

    // DEBUG: Scan multiple collections to find where data is hiding
    async scanCollections() {
        const potentialCollections = [
            'nashmi_chat', 'nashmi', 'chat', 'chats', 'messages',
            'qna', 'suggestions', 'inquiries', 'requests', 'logs',
            'contact_form', 'contacts', 'feedback', 'site_suggestions',
            // New guesses
            'nashmichat', 'bot_messages', 'ai_chat', 'conversations', 'history',
            'questions', 'user_messages', 'queries'
        ];

        const results = [];

        for (const colName of potentialCollections) {
            try {
                const snapshot = await getDocs(collection(db, colName));
                if (!snapshot.empty) {
                    const lastDoc = snapshot.docs[0].data(); // Just grab first one to show example keys
                    results.push({
                        name: colName,
                        count: snapshot.size,
                        keys: Object.keys(lastDoc).join(', '),
                        sampleType: lastDoc.type || lastDoc.category || 'N/A',
                        lastId: snapshot.docs[0].id
                    });
                }
            } catch (error) {
                console.warn(`Could not access collection: ${colName}`, error);
            }
        }
        return results;
    }
};
