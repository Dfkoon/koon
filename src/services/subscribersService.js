import { db } from '../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

const COLLECTION_NAME = 'subscribers';

export const subscribersService = {
    // Subscribe a new email
    async subscribe(email) {
        try {
            // Check if already subscribed
            const q = query(collection(db, COLLECTION_NAME), where("email", "==", email));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                return { success: false, message: 'Already subscribed' };
            }

            await addDoc(collection(db, COLLECTION_NAME), {
                email,
                subscribedAt: new Date().toISOString()
            });
            return { success: true };
        } catch (error) {
            console.error("Error subscribing:", error);
            return { success: false, error };
        }
    },

    // Get all subscribers (Admin)
    async getSubscribers() {
        try {
            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
            const subscribers = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            return subscribers.sort((a, b) => new Date(b.subscribedAt) - new Date(a.createdAt));
        } catch (error) {
            console.error("Error fetching subscribers:", error);
            return [];
        }
    },

    // Unsubscribe (Admin)
    async unsubscribe(id) {
        try {
            await deleteDoc(doc(db, COLLECTION_NAME, id));
            return { success: true };
        } catch (error) {
            console.error("Error unsubscribing:", error);
            return { success: false, error };
        }
    }
};
