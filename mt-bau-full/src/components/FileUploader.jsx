import React, { useState, useCallback, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { submitContribution, submitLinkContribution } from '../services/contributionsService';
import toast from 'react-hot-toast';
import './FileUploader.css';

const MAX_IMAGES = 10;
const MAX_PDFS = 2;
const MAX_SIZE_MB = 10;

const FileUploader = ({ onClose }) => {
    const { language } = useLanguage();
    const [files, setFiles] = useState([]); // [{file, preview, compressed, progress}]
    const [externalLink, setExternalLink] = useState('');
    const [studentName, setStudentName] = useState('');
    const [subjectName, setSubjectName] = useState('');
    const [contributionType, setContributionType] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0); // overall percentage
    const [status, setStatus] = useState('idle'); // idle, uploading, success, error
    const [errorDetails, setErrorDetails] = useState('');
    const activeTasks = useRef([]);

    const formatFileSize = (size) => {
        if (!size) return '0 KB';
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
        return (size / 1024 / 1024).toFixed(2) + ' MB';
    };

    const onDragOver = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const validateFiles = (newFiles) => {
        const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        const validFiles = [];
        let pdfCount = files.filter(f => f.type === 'application/pdf').length;
        let imageCount = files.filter(f => f.type.startsWith('image/')).length;

        for (const file of newFiles) {
            if (file.size === 0) continue;
            if (!allowedTypes.includes(file.type)) continue;
            if (file.size > MAX_SIZE_MB * 1024 * 1024) continue;

            if (file.type === 'application/pdf') {
                if (pdfCount >= MAX_PDFS) continue;
                pdfCount++;
            } else {
                if (imageCount >= MAX_IMAGES) continue;
                imageCount++;
            }
            validFiles.push(file);
        }
        return validFiles;
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const dropped = Array.from(e.dataTransfer.files);
        const valid = validateFiles(dropped);

        const newFileEntries = valid.map(f => ({
            file: f,
            name: f.name,
            size: f.size,
            type: f.type,
            processed: null
        }));

        setFiles(prev => [...prev, ...newFileEntries]);

        newFileEntries.forEach(async (entry) => {
            const compressed = await processFile(entry.file);
            setFiles(current => {
                const updated = [...current];
                const index = updated.findIndex(f => f.file === entry.file);
                if (index !== -1) updated[index].processed = compressed;
                return updated;
            });
        });
    }, [files]);

    // Compression Logic (Faster & Parallel)
    const processFile = async (file) => {
        if (!file.type.startsWith('image/')) return file;

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_DIM = 1200; // slightly higher for quality but still fast

                    if (width > MAX_DIM || height > MAX_DIM) {
                        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                        width *= ratio;
                        height *= ratio;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    }, 'image/jpeg', 0.7); // 0.7 is a sweet spot for speed/quality
                };
            };
        });
    };

    const handleFileChange = async (e) => {
        const selected = Array.from(e.target.files);
        const valid = validateFiles(selected);

        // Add to state immediately with "processing" status
        const newFileEntries = valid.map(f => ({
            file: f,
            name: f.name,
            size: f.size,
            type: f.type,
            processed: null // will hold the compressed blob
        }));

        setFiles(prev => [...prev, ...newFileEntries]);

        // Start compression in the background (Parallel)
        newFileEntries.forEach(async (entry, idx) => {
            const compressed = await processFile(entry.file);
            setFiles(current => {
                const updated = [...current];
                const index = updated.findIndex(f => f.file === entry.file);
                if (index !== -1) updated[index].processed = compressed;
                return updated;
            });
        });
    };

    const handleUpload = async () => {
        if (!contributionType) return;

        if (!subjectName || subjectName.trim().length < 2) {
            toast.error(language === 'ar' ? 'يرجى إدخال اسم المادة بشكل صحيح' : 'Please enter a valid subject name');
            return;
        }

        if (contributionType !== 'external_link' && files.length === 0) {
            toast.error(language === 'ar' ? 'يرجى اختيار ملف واحد على الأقل' : 'Please select at least one file');
            return;
        }

        setIsUploading(true);
        setStatus('uploading');

        if (contributionType === 'external_link') {
            setStatusMessage(language === 'ar' ? 'جاري إرسال الرابط...' : 'Sending link...');
            try {
                const result = await submitLinkContribution(externalLink, subjectName || 'General', contributionType);
                if (result.success) {
                    setStatus('success');
                    setStatusMessage(language === 'ar' ? 'تم الإرسال بنجاح! ✨' : 'Sent successfully! ✨');
                    toast.success(language === 'ar' ? 'تم الإرسال بنجاح! ✨' : 'Sent successfully! ✨');
                    setTimeout(() => onClose(), 2500);
                } else {
                    setStatus('error');
                    setErrorDetails(result.messageAr || result.error || 'Submission failed');
                    toast.error(language === 'ar' ? (result.messageAr || 'فشل الإرسال') : (result.messageEn || 'Failed to send'));
                    setIsUploading(false);
                }
            } catch (error) {
                setStatus('error');
                setErrorDetails(error.friendly?.ar || error.message || 'Submission failed');
                toast.error(language === 'ar' ? (error.friendly?.ar || 'فشل الإرسال') : (error.friendly?.en || 'Failed to send'));
                setIsUploading(false);
            }
            return;
        }

        setStatusMessage(language === 'ar' ? 'جاري تحضير الملفات للرفع...' : 'Preparing files...');

        try {
            // Wait for any background compression to finish
            const finalizedFiles = await Promise.all(files.map(async f => {
                if (f.processed) return f.processed;
                return await processFile(f.file);
            }));

            setUploadProgress(10); // Start at 10% after prep
            setStatusMessage(language === 'ar' ? `جاري رفـع ${files.length} ملفـات بسرع...` : `Uploading ${files.length} files fast...`);

            let completedCount = 0;
            const fileProgresses = new Array(finalizedFiles.length).fill(0);

            const uploadPromises = finalizedFiles.map((file, idx) =>
                submitContribution(
                    file,
                    subjectName || 'General',
                    contributionType,
                    studentName,
                    (progress) => {
                        fileProgresses[idx] = progress;
                        const totalProgress = fileProgresses.reduce((sum, p) => sum + p, 0);
                        const aggregateProgress = totalProgress / finalizedFiles.length;
                        // Use 0.9 multiplier because initial 10% is preparation
                        setUploadProgress(10 + (aggregateProgress * 0.9));
                    },
                    (task) => activeTasks.current.push(task)
                ).then(res => {
                    completedCount++;
                    // Ensure the bar stays accurate as files lock in their 100% states
                    setUploadProgress(10 + (completedCount / finalizedFiles.length) * 90);
                    return res;
                })
            );

            const results = await Promise.all(uploadPromises);

            const failedCount = results.filter(r => !r.success).length;

            if (failedCount === 0) {
                setUploadProgress(100);
                setStatus('success');
                setStatusMessage(language === 'ar' ? 'تم الرفع بنجاح! ✨' : 'Upload successful! ✨');
                toast.success(language === 'ar' ? 'تم الرفع بنجاح فائق! ✨' : 'Lightning fast upload complete! ✨');
                setTimeout(() => onClose(), 2500);
            } else {
                setStatus('error');
                const failedResult = results.find(r => !r.success) || { error: 'Unknown error' };
                setErrorDetails(failedResult.messageAr || failedResult.error || 'Unknown error');
                setStatusMessage(language === 'ar' ? 'فشل رفع بعض الملفات' : 'Some files failed to upload');
                toast.error(language === 'ar'
                    ? (failedResult.messageAr || `فشل رفع ${failedCount} ملفات، يرجى المحاولة لاحقاً`)
                    : (failedResult.messageEn || `Failed to upload ${failedCount} files, please try again`));
                setIsUploading(false);
            }
        } catch (error) {
            console.error('Upload error:', error);
            activeTasks.current.forEach(t => t.cancel?.());
            setStatus('error');
            setErrorDetails(error.friendly?.ar || error.message || 'Upload failed');
            setStatusMessage(language === 'ar' ? 'حدث خطأ أثناء الرفع' : 'Upload failed');
            toast.error(language === 'ar' ? (error.friendly?.ar || 'حدث خطأ أثناء الرفع') : (error.friendly?.en || 'Upload failed'));
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleCancel = () => {
        if (isUploading) {
            activeTasks.current.forEach(task => {
                try { task.cancel(); } catch (e) { }
            });
            toast.error(language === 'ar' ? 'تم إلغاء الرفع 🛑' : 'Upload cancelled 🛑');
        }
        onClose();
    };

    return (
        <div className="file-uploader-overlay" onClick={handleCancel}>
            <div className="file-uploader-modal glass-card" onClick={e => e.stopPropagation()}>
                <button className="close-upload-btn" onClick={handleCancel}>×</button>

                <div className="uploader-header">
                    <h2>{language === 'ar' ? 'مساهم جديد 📁' : 'New Contribution 📁'}</h2>
                    <p>{language === 'ar' ? 'ارفع حتى 10 صور أو ملفين PDF' : 'Upload up to 10 images or 2 PDFs'}</p>
                </div>

                <div className="uploader-body">
                    {status === 'success' || status === 'error' ? (
                        <div className={`upload-status-view ${status}`}>
                            <span className="status-icon-large">
                                {status === 'success' ? '✅' : '❌'}
                            </span>
                            <h3 className="status-title-large">
                                {status === 'success'
                                    ? (language === 'ar' ? 'تم الرفع بنجاح!' : 'Upload Successful!')
                                    : (language === 'ar' ? 'فشل الرفع' : 'Upload Failed')
                                }
                            </h3>
                            <p className="status-desc-large">
                                {status === 'success'
                                    ? (language === 'ar' ? 'شكراً لمساهمتك القيم! ✨' : 'Thank you for your valuable contribution! ✨')
                                    : (errorDetails || (language === 'ar' ? 'حدث خطأ، يرجى المحاولة لاحقاً' : 'An error occurred, please try again later'))
                                }
                            </p>
                            {status === 'error' && (
                                <button className="retry-upload-btn" onClick={() => {
                                    setStatus('idle');
                                    setIsUploading(false);
                                    setErrorDetails('');
                                }}>
                                    {language === 'ar' ? 'إعاد المحاولة 🔄' : 'Try Again 🔄'}
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="input-group">
                                <label>{language === 'ar' ? 'نوع المساهمةة (إجباري)' : 'Contribution Type (Mandatory)'}</label>
                                <select
                                    className="type-select"
                                    value={contributionType}
                                    onChange={(e) => setContributionType(e.target.value)}
                                    disabled={isUploading}
                                >
                                    <option value="">{language === 'ar' ? '-- اختر نوع المرفق --' : '-- Select Type --'}</option>
                                    <option value="past_papers">{language === 'ar' ? 'أسئلة سنوات' : 'Past Papers'}</option>
                                    <option value="quizzes">{language === 'ar' ? 'اختبارات قصيرة' : 'Quizzes'}</option>
                                    <option value="summaries">{language === 'ar' ? 'ملخصات' : 'Summaries'}</option>
                                    <option value="material_pdf">{language === 'ar' ? 'مادة PDF' : 'PDF Material'}</option>
                                </select>
                            </div>

                            <div className="input-group">
                                <label>{language === 'ar' ? 'اسم المادة (إجباري)' : 'Subject Name (Mandatory)'}</label>
                                <input
                                    type="text"
                                    placeholder={language === 'ar' ? 'مثال: حاسوب، فيزياء...' : 'e.g. CS, Physics...'}
                                    value={subjectName}
                                    onChange={(e) => setSubjectName(e.target.value)}
                                    disabled={isUploading}
                                    required
                                />
                            </div>

                            <div className="input-group">
                                <label>{language === 'ar' ? 'اسمك (اختياري - سيظهر كمساهم)' : 'Your Name (Optional - will show as contributor)'}</label>
                                <input
                                    type="text"
                                    placeholder={language === 'ar' ? 'مثال: أحمد الد...' : 'e.g. Ahmed Khaled...'}
                                    value={studentName}
                                    onChange={(e) => setStudentName(e.target.value)}
                                    disabled={isUploading}
                                />
                            </div>

                            {contributionType === 'external_link' ? (
                                <div className="input-group">
                                    <label>{language === 'ar' ? 'رابط الملف (جوجل درايف، ميجا...)' : 'File Link (Google Drive, Mega...)'}</label>
                                    <input
                                        type="url"
                                        placeholder="https://drive.google.com/..."
                                        value={externalLink}
                                        onChange={(e) => setExternalLink(e.target.value)}
                                        disabled={isUploading}
                                    />
                                </div>
                            ) : (
                                <div
                                    className={`drop-zone ${isDragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    onDrop={onDrop}
                                >
                                    {files.length === 0 ? (
                                        <>
                                            <span className="drop-icon">📤</span>
                                            <p>{language === 'ar' ? 'اسحب الملفات هنا أو' : 'Drag files here or'}</p>
                                            <label className="file-input-label">
                                                {language === 'ar' ? 'اختر ملفات' : 'Browse Files'}
                                                <input type="file" onChange={handleFileChange} multiple hidden />
                                            </label>
                                            <span className="file-hint">PDF, PNG, JPG (Max 10MB/file)</span>
                                        </>
                                    ) : (
                                        <div className="files-list-container">
                                            {files.map((file, idx) => (
                                                <div key={idx} className="file-item-row">
                                                    <span className="file-item-icon">{file.type.includes('image') ? '🖼️' : '📄'}</span>
                                                    <div className="file-item-info">
                                                        <span className="file-item-name">{file.name}</span>
                                                        <span className="file-item-size">{formatFileSize(file.size)}</span>
                                                    </div>
                                                    {!isUploading && (
                                                        <button className="remove-file-btn" onClick={() => removeFile(idx)}>×</button>
                                                    )}
                                                </div>
                                            ))}
                                            {!isUploading && files.length < 10 && (
                                                <label className="add-more-files">
                                                    + {language === 'ar' ? 'إضاف المزيد' : 'Add More'}
                                                    <input type="file" onChange={handleFileChange} multiple hidden />
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {isUploading && (
                                <div className="upload-progress-container">
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                    <div className="progress-info-row">
                                        <span className="status-label">{statusMessage}</span>
                                        <span className="progress-percentage">{Math.round(uploadProgress)}%</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="uploader-footer">
                    <button className="cancel-btn" onClick={handleCancel}>
                        {status === 'success' ? (language === 'ar' ? 'إغلاق' : 'Close') : (language === 'ar' ? 'إلغاء' : 'Cancel')}
                    </button>
                    {status === 'idle' && (
                        <button
                            className={`upload-submit-btn ${(contributionType === 'external_link' ? (!externalLink || !subjectName) : (files.length === 0 || !subjectName || files.some(f => !f.processed))) ||
                                !contributionType || isUploading ? 'disabled' : ''
                                }`}
                            onClick={handleUpload}
                            disabled={(contributionType === 'external_link' ? (!externalLink || !subjectName) : (files.length === 0 || !subjectName || files.some(f => !f.processed))) || !contributionType || isUploading}
                        >
                            {isUploading ? (language === 'ar' ? 'جاري الإرسال...' : 'Sending...') : (
                                contributionType === 'external_link'
                                    ? (language === 'ar' ? 'إرسال الرابط' : 'Send Link')
                                    : (language === 'ar' ? `رفع ${files.length} ملفات` : `Upload ${files.length} Files`)
                            )}
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FileUploader;
