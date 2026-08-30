import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { addStudentProject } from '../services/studentProjectsService';
import toast from 'react-hot-toast';
import './AddProjectModal.css';

const AddProjectModal = ({ onClose }) => {
    const { t, language } = useLanguage();
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        link: '',
        imageFile: null
    });
    const [preview, setPreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast.error(language === 'ar' ? 'حجم الصورة كبير جداً' : 'Image size is too large');
                return;
            }
            setFormData(prev => ({ ...prev, imageFile: file }));

            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name || !formData.description) {
            toast.error(language === 'ar' ? 'يرجى تعبئ الحقول المطلوب' : 'Please fill required fields');
            return;
        }

        setIsSubmitting(true);
        const result = await addStudentProject(formData);

        if (result.success) {
            toast.success(t('student.projects.success'));
            setTimeout(onClose, 2000);
        } else {
            toast.error(language === 'ar' ? 'حدث خطأ أثناء الإرسال' : 'Error submitting project');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="add-project-overlay" onClick={onClose}>
            <div className="add-project-modal" onClick={e => e.stopPropagation()}>
                <button className="close-modal-btn" onClick={onClose}>×</button>

                <div className="modal-header">
                    <h2>{t('student.projects.add')}</h2>
                    <p>{t('student.projects.subtitle')}</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>{t('student.projects.name')} *</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('student.projects.desc')} *</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('student.projects.link')}</label>
                        <input
                            type="url"
                            name="link"
                            value={formData.link}
                            onChange={handleInputChange}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="form-group">
                        <label>{t('student.projects.image')}</label>
                        <div className="file-input-wrapper">
                            {preview ? (
                                <img src={preview} alt="Preview" className="selected-file-preview" />
                            ) : (
                                <>
                                    <span className="file-upload-icon">📷</span>
                                    <span>{language === 'ar' ? 'اضغط لرفع صور' : 'Click to upload image'}</span>
                                </>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className={`submit-btn ${isSubmitting ? 'disabled' : ''}`}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? t('suggestions.btn.sending') : t('student.projects.submit')}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AddProjectModal;
