/**
 * Cloudinary Upload Service
 * Handles file uploads to Cloudinary for student contributions
 */
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();
const PLACEHOLDER_CLOUD_NAME = 'your_cloudinary_cloud_name';
const PLACEHOLDER_UPLOAD_PRESET = 'your_upload_preset';

/**
 * Upload a file to Cloudinary
 * @param {File} file - The file to upload
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL and public_id
 */
export const uploadToCloudinary = (file, options = {}) => {
    return new Promise((resolve, reject) => {
        if (!CLOUD_NAME || CLOUD_NAME === PLACEHOLDER_CLOUD_NAME) {
            const err = new Error('CLOUDINARY_CONFIG_MISSING');
            err.code = 'CLOUDINARY_CONFIG_MISSING';
            err.friendly = {
                ar: 'إعدادات Cloudinary غير مضبوط على الادم. تواصل مع الإدار.',
                en: 'Cloudinary settings are not configured. Contact the admin.'
            };
            return reject(err);
        }
        if (!UPLOAD_PRESET || UPLOAD_PRESET === PLACEHOLDER_UPLOAD_PRESET) {
            const err = new Error('CLOUDINARY_PRESET_MISSING');
            err.code = 'CLOUDINARY_PRESET_MISSING';
            err.friendly = {
                ar: 'قالب التحميل (upload preset) غير مضبوط. تواصل مع الدعم.',
                en: 'Upload preset is not configured. Contact support.'
            };
            return reject(err);
        }

        try {
            console.log("Cloudinary Uploading config active in browser:", { CLOUD_NAME, UPLOAD_PRESET });
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, true);

            if (options.onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = Math.round((e.loaded / e.total) * 100);
                        options.onProgress(percentComplete);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        resolve({
                            url: data.secure_url,
                            publicId: data.public_id,
                            format: data.format,
                            resourceType: data.resource_type,
                            bytes: data.bytes
                        });
                    } catch (e) {
                        reject(new Error('Invalid JSON response from Cloudinary'));
                    }
                } else {
                    let errorData;
                    try {
                        errorData = JSON.parse(xhr.responseText);
                    } catch (e) {
                        errorData = null;
                    }
                    console.error('Cloudinary API Error:', errorData || xhr.statusText);

                    const remoteMsg = errorData?.error?.message || xhr.statusText || 'Upload failed';
                    const err = new Error('CLOUDINARY_UPLOAD_ERROR');
                    err.code = 'CLOUDINARY_UPLOAD_ERROR';
                    if (/unknown api key/i.test(remoteMsg) || /invalid api key/i.test(remoteMsg)) {
                        err.friendly = {
                            ar: 'مفتاح Cloudinary غير صحيح أو غير معروف. تحقق من إعدادات البيئ وأعد تشغيل السيرفر.',
                            en: 'Cloudinary API key is invalid or unknown. Check your environment settings.'
                        };
                    } else if (/upload preset/i.test(remoteMsg) || /invalid preset/i.test(remoteMsg)) {
                        err.friendly = {
                            ar: 'قالب التحميل (Upload Preset) غير صحيح أو غير موجود. تحقق من إعدادات لوح التحكم.',
                            en: 'Upload preset is invalid or missing.'
                        };
                    } else {
                        err.friendly = {
                            ar: `فشل رفع الملف: ${remoteMsg}`,
                            en: `File upload failed: ${remoteMsg}`
                        };
                    }
                    err.remote = remoteMsg;
                    reject(err);
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error occurred during Cloudinary upload'));
            };

            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', UPLOAD_PRESET);
            if (options.folder) formData.append('folder', options.folder);
            if (options.tags) formData.append('tags', options.tags.join(','));

            xhr.send(formData);
        } catch (error) {
            console.error('Cloudinary Service Error:', error);
            reject(error);
        }
    });
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
        errors.push(`نوع الملف يجب أن يكون: صور أو PDF`);
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
