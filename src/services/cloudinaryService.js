/**
 * Cloudinary Upload Service
 * Handles file uploads to Cloudinary for student contributions
 */
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();

/**
 * Upload a file to Cloudinary
 * @param {File} file - The file to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL and public_id
 */
export const uploadToCloudinary = async (file, options = {}) => {
    if (!CLOUD_NAME) throw new Error('Cloudinary Cloud Name is missing in .env');
    if (!UPLOAD_PRESET) throw new Error('Cloudinary Upload Preset is missing in .env');

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);

        if (options.folder) formData.append('folder', options.folder);
        if (options.tags) formData.append('tags', options.tags.join(','));

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Cloudinary API Error:', errorData);
            throw new Error(errorData.error?.message || 'Upload failed');
        }

        const data = await response.json();
        return {
            url: data.secure_url,
            publicId: data.public_id,
            format: data.format,
            resourceType: data.resource_type,
            bytes: data.bytes
        };
    } catch (error) {
        console.error('Cloudinary Service Error:', error);
        throw error;
    }
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
        errors.push(`حجم الملف يجب أن يكون أقل من ${maxSize / 1024 / 1024} ميجابايت`);
    }

    if (!allowedTypes.includes(file.type)) {
        errors.push(`نوع الملف يجب أن يكون: صورة أو PDF`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

export default {
    uploadToCloudinary,
    validateFile
};
