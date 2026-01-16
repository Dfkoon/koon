/**
 * Cloudinary Upload Service
 * Handles file uploads to Cloudinary for student contributions
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

/**
 * Upload a file to Cloudinary
 * @param {File} file - The file to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL and public_id
 */
export const uploadToCloudinary = async (file, options = {}) => {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);
        formData.append('folder', options.folder || 'koon-contributions');

        // Add tags for better organization
        if (options.tags) {
            formData.append('tags', options.tags.join(','));
        }

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Upload failed');
        }

        const data = await response.json();

        return {
            url: data.secure_url,
            publicId: data.public_id,
            format: data.format,
            resourceType: data.resource_type,
            bytes: data.bytes,
            width: data.width,
            height: data.height
        };
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error(`Failed to upload file: ${error.message}`);
    }
};

/**
 * Delete a file from Cloudinary
 * Note: This requires backend implementation with API secret
 * @param {string} publicId - The public ID of the file to delete
 */
export const deleteFromCloudinary = async (publicId) => {
    // Note: Deletion requires API secret and should be done on backend
    // For now, we'll keep the file and just remove the reference from Firestore
    console.warn('Cloudinary deletion should be implemented on backend with API secret');
    return true;
};

/**
 * Validate file before upload
 * @param {File} file - The file to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export const validateFile = (file, options = {}) => {
    const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB default
    const allowedTypes = options.allowedTypes || ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

    const errors = [];

    if (file.size > maxSize) {
        errors.push(`File size must be less than ${maxSize / 1024 / 1024}MB`);
    }

    if (!allowedTypes.includes(file.type)) {
        errors.push(`File type must be one of: ${allowedTypes.map(t => t.split('/')[1]).join(', ')}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

export default {
    uploadToCloudinary,
    deleteFromCloudinary,
    validateFile
};
