import { db } from '../lib/firebase';
import {
    collection, getDocs, doc, deleteDoc, updateDoc,
    setDoc, getDoc, serverTimestamp, query, where, orderBy
} from 'firebase/firestore';

const COLLECTION_NAME = 'materialDonations';
const SETTINGS_COLLECTION = 'settings';
const EXCHANGE_SETTINGS_ID = 'material_exchange';

export const materialsService = {
    // 1. Phase Management
    async getSystemStatus() {
        const docRef = doc(db, SETTINGS_COLLECTION, EXCHANGE_SETTINGS_ID);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data();
        }
        // Default status
        return { phase: 'donation', isActive: true };
    },

    async setSystemPhase(phase) {
        const docRef = doc(db, SETTINGS_COLLECTION, EXCHANGE_SETTINGS_ID);
        await setDoc(docRef, { phase, lastUpdated: serverTimestamp() }, { merge: true });
    },

    // 2. Data Fetching
    async getAllMaterials() {
        try {
            const snapshot = await getDocs(collection(db, COLLECTION_NAME));
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() :
                    (doc.data().timestamp?.toDate ? doc.data().timestamp.toDate() :
                        (doc.data().createdAt ? new Date(doc.data().createdAt) : new Date()))
            })).sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            console.error("Error fetching materials:", error);
            return [];
        }
    },

    // 3. Reservation & Handover Logic
    async updateReservation(materialId, takerData) {
        const docRef = doc(db, COLLECTION_NAME, materialId);
        await updateDoc(docRef, {
            status: 'reserved',
            takerInfo: takerData, // { name, phone, studentId, isDonor }
            reservedAt: serverTimestamp()
        });
    },

    async markAsHandedOver(materialId) {
        const docRef = doc(db, COLLECTION_NAME, materialId);
        await updateDoc(docRef, {
            status: 'completed',
            handedOverAt: serverTimestamp()
        });
    },

    async resetStatus(materialId) {
        const docRef = doc(db, COLLECTION_NAME, materialId);
        await updateDoc(docRef, {
            status: 'approved', // Back to available
            takerInfo: null,
            reservedAt: null
        });
    },

    // 4. Priority Check: Is this student a donor?
    async checkUserDonations(studentId) {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('studentId', '==', studentId),
            where('status', 'in', ['approved', 'completed', 'reserved'])
        );
        const snapshot = await getDocs(q);
        return snapshot.size > 0;
    },

    // 5. Quota Check: Has student already taken 2 items?
    async checkUserQuota(studentId) {
        const q = query(
            collection(db, COLLECTION_NAME),
            where('takerInfo.studentId', '==', studentId),
            where('status', 'in', ['reserved', 'completed'])
        );
        const snapshot = await getDocs(q);
        return snapshot.size;
    },

    async approveDonation(id) {
        const docRef = doc(db, COLLECTION_NAME, id);
        await updateDoc(docRef, { status: 'approved' });
    },

    async deleteMaterial(id) {
        await deleteDoc(doc(db, COLLECTION_NAME, id));
    }
};
