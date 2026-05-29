import { db } from '../config/firebase';
import { collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { uploadToCloudinary } from './cloudinaryService';

const PROJECTS_COLLECTION = 'student_projects';

/**
 * Add a new student project
 * @param {Object} projectData - { name, description, link, imageFile }
 * @returns {Promise<Object>}
 */
export const addStudentProject = async (projectData) => {
    try {
        let imageUrl = null;
        let imagePublicId = null;

        if (projectData.imageFile) {
            const uploadResult = await uploadToCloudinary(projectData.imageFile, {
                folder: 'student-projects',
                tags: ['student-project']
            });
            imageUrl = uploadResult.url;
            imagePublicId = uploadResult.publicId;
        }

        const docRef = await addDoc(collection(db, PROJECTS_COLLECTION), {
            name: projectData.name,
            description: projectData.description,
            link: projectData.link || null,
            imageUrl: imageUrl,
            imagePublicId: imagePublicId,
            status: 'pending', // pending, approved, rejected
            createdAt: serverTimestamp()
        });

        return { success: true, id: docRef.id };
    } catch (error) {
        console.error('Error adding student project:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get approved student projects
 * @returns {Promise<Array>}
 */
export const getApprovedProjects = async () => {
    try {
        const q = query(
            collection(db, PROJECTS_COLLECTION),
            where('status', '==', 'approved'),
            orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error fetching student projects:', error);
        return [];
    }
};
