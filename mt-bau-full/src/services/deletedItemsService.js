import { db } from '../config/firebase';
import {
    collection,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc
} from 'firebase/firestore';

const DELETED_ITEMS_COLLECTION = 'deletedItems';

export const archiveItem = async ({ originalCollection, originalId, itemData, reason, deletedBy = 'admin', deletedByName = deletedBy }) => {
    const deletedAt = serverTimestamp();
    await updateDoc(doc(db, originalCollection, originalId), {
        deleted: true,
        deletedAt,
        deletedBy,
        deletedByName,
        deletionReason: reason
    });
    await setDoc(doc(db, DELETED_ITEMS_COLLECTION, `${originalCollection}_${originalId}`), {
        originalCollection,
        originalId,
        itemData: { ...itemData, deleted: true, deletedAt, deletedBy, deletedByName, deletionReason: reason },
        reason,
        deletedBy,
        deletedByName,
        deletedAt
    }, { merge: true });
};

export const listDeletedItems = async () => {
    const snapshot = await getDocs(query(collection(db, DELETED_ITEMS_COLLECTION), orderBy('deletedAt', 'desc')));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !item.restored);
};

export const restoreArchivedItem = async (item, restoredBy = 'admin') => {
    const restoredData = {
        ...item.itemData,
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        deletedByName: null,
        deletionReason: null
    };
    await setDoc(doc(db, item.originalCollection, item.originalId), restoredData, { merge: true });
    await updateDoc(doc(db, DELETED_ITEMS_COLLECTION, item.id), {
        restored: true,
        restoredAt: serverTimestamp(),
        restoredBy
    });
};
