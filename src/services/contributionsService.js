import { db } from '../config/firebase'; // Removed storage import as it's no longer needed for uploads
import { collection, addDoc, doc, deleteDoc, query, orderBy, serverTimestamp, onSnapshot, updateDoc } from 'firebase/firestore';
import { uploadToCloudinary, validateFile } from './cloudinaryService';

const CONTRIBUTIONS_COLLECTION = 'quizContributions';

// Upload file to Cloudinary and save metadata to Firestore
export const submitContribution = async (file, subjectName = 'General', contributionType = 'unspecified', onProgress, onTask) => {
    try {
        // 1. Validate File
        const validation = validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.errors.join(', '));
        }

        console.log(`Starting Cloudinary upload for: ${file.name}`);

        // 2. Upload to Cloudinary
        // Note: onTask is not supported directly by fetch, but we can fake progress if needed 
        // or just use the simplified flow. Cloudinary client-side upload via fetch doesn't emit granular progress events 
        // as easily as XHR/Firebase Task, so we might simulate or just jump to 100%.
        if (onProgress) onProgress(10); // Start

        const result = await uploadToCloudinary(file, {
            folder: 'koon-contributions',
            tags: ['student-contribution', contributionType, subjectName]
        });

        // 3. Save metadata to Firestore
        console.log(`Saving metadata to Firestore for ${file.name}...`);
        const docRef = await addDoc(collection(db, CONTRIBUTIONS_COLLECTION), {
            subjectName: subjectName, // Fixed from studentName to subjectName
            fileName: file.name,
            fileUrl: result.url,
            publicId: result.publicId,
            fileType: result.format || file.type,
            contributionType: contributionType,
            fileSize: result.bytes || file.size,
            status: 'pending',
            createdAt: serverTimestamp(),
        });

        if (onProgress) onProgress(100); // Done ONLY after both upload & metadata save are complete

        console.log(`Metadata saved for ${file.name}, docId: ${docRef.id}`);
        return { success: true, id: docRef.id, url: result.url };

    } catch (error) {
        console.error('Contribution submission failed:', error);
        return { success: false, error: error.message };
    }
};

// Save a link-only contribution to Firestore
export const submitLinkContribution = async (linkUrl, subjectName = 'General', contributionType = 'unspecified') => {
    try {
        const docRef = await addDoc(collection(db, CONTRIBUTIONS_COLLECTION), {
            studentName: subjectName,
            fileUrl: linkUrl, // Use fileUrl field to store the link
            contributionType,
            fileType: 'link', // Explicitly mark as a link
            fileName: 'External Link',
            status: 'pending',
            createdAt: serverTimestamp(),
        });
        return { success: true, id: docRef.id, url: linkUrl };
    } catch (error) {
        console.error('Link contribution failed:', error);
        return { success: false, error: error.message };
    }
};

// Subscribe to all contributions (Admin Real-time)
export const subscribeToContributions = (callback) => {
    const q = query(collection(db, CONTRIBUTIONS_COLLECTION), orderBy('createdAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
        const contributions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(contributions);
    }, (error) => {
        console.error('Error in contributions subscription:', error);
        callback([]);
    });
};

// Approve a contribution
export const approveContribution = async (contributionId) => {
    try {
        await updateDoc(doc(db, CONTRIBUTIONS_COLLECTION, contributionId), {
            status: 'approved'
        });
        return { success: true };
    } catch (error) {
        console.error('Error approving contribution:', error);
        return { success: false, error: error.message };
    }
};

// Reject a contribution
export const rejectContribution = async (contributionId, storagePath) => {
    // Rejection for contributions = Deletion from database
    // Note: We are NOT deleting from Cloudinary here automatically to avoid security complexity on client-side.
    // Ideally, a periodic cleanup script or a secure backend endpoint would handle this using the publicId.
    return await deleteContribution(contributionId, storagePath);
};

// Delete a contribution (including its file in Storage - skipping Storage for Cloudinary for now)
export const deleteContribution = async (contributionId, storagePath) => {
    try {
        // 1. Delete from Storage (Skipped for Cloudinary client-side for now)
        // if (storagePath) { ... }

        // 2. Delete from Firestore
        await deleteDoc(doc(db, CONTRIBUTIONS_COLLECTION, contributionId));
        return { success: true };
    } catch (error) {
        console.error('Error deleting contribution:', error);
        return { success: false, error: error.message };
    }
};
