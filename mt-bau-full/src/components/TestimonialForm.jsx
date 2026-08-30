import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { submitTestimonial } from '../services/testimonialsService';
import './TestimonialForm.css';

const TestimonialForm = () => {
    const { t, language } = useLanguage();
    const [formData, setFormData] = useState({
        author: '',
        gender: 'male', // default
        major: '',
        quote: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);

    const detectGender = (name) => {
        if (!name) return 'male';
        const femaleEndings = ['', 'ى', 'اء', 'ا'];
        const commonFemaleNames = ['فرح', 'رهف', 'لجين', 'ميس', 'نور', 'شهد'];
        const lastChar = name.trim().slice(-1);
        const lastTwo = name.trim().slice(-2);

        if (commonFemaleNames.includes(name.trim())) return 'female';
        if (femaleEndings.includes(lastChar) || femaleEndings.includes(lastTwo)) return 'female';
        return 'male';
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        let newFormData = { ...formData, [name]: value };

        if (name === 'author') {
            newFormData.gender = detectGender(value);
        }

        setFormData(newFormData);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setSubmitStatus(null);

        try {
            // Select Flork avatar based on gender from the newly renamed set
            let avatarPath = '/assets/avatars/flork_cool.png';
            if (formData.gender === 'male') {
                const maleAvatars = [
                    '/assets/avatars/flork_cool.png', 
                    '/assets/avatars/flork_cool_v2.png',
                    '/assets/avatars/flork_crying.png'
                ];
                avatarPath = maleAvatars[Math.floor(Math.random() * maleAvatars.length)];
            } else {
                const femaleAvatars = [
                    '/assets/avatars/flork_heart.png', 
                    '/assets/avatars/flork_female_grad.png',
                    '/assets/avatars/flork_female_cool.png'
                ];
                avatarPath = femaleAvatars[Math.floor(Math.random() * femaleAvatars.length)];
            }
            
            // Set a timeout for the submission
            const submissionPromise = submitTestimonial({
                ...formData,
                role: language === 'ar'
                    ? `${formData.gender === 'male' ? 'طالب' : 'طالب'}`
                    : `${formData.gender === 'male' ? 'Male' : 'Female'} Student`,
                language: language,
                avatar: avatarPath,
            });

            // Competition with a timeout
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 10000)
            );

            const result = await Promise.race([submissionPromise, timeoutPromise]);

            if (result.success) {
                setSubmitStatus('success');
                setFormData({ author: '', gender: 'male', major: '', quote: '' });
                // No need to wait for approved:true manually since we enabled auto-approval in service
            } else {
                setSubmitStatus('error');
            }
        } catch (error) {
            console.error('Submission failed:', error);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setSubmitStatus(null), 5000);
        }
    };

    return (
        <div className="testimonial-form-container">
            <motion.div
                className="testimonial-form-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <h3 className="form-title">
                    💭 {language === 'ar' ? 'شاركنا رأيك القيّم' : 'Share Your Valuable Opinion'}
                </h3>
                <p className="form-subtitle">
                    {language === 'ar'
                        ? 'أبرنا عن تجربتك مع الموقع'
                        : 'Tell us about your experience with the website'}
                </p>

                {submitStatus === 'success' && (
                    <motion.div
                        className="success-message"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        ✅ {language === 'ar' ? 'شكراً لك! رأيك قيد المراجع وسيظهر قريباً' : 'Thank you! Your review is pending approval'}
                    </motion.div>
                )}

                {submitStatus === 'error' && (
                    <motion.div
                        className="error-message"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        ❌ {language === 'ar' ? 'حدث خطأ، يرجى المحاولة مرة أخرى' : 'An error occurred, please try again'}
                    </motion.div>
                )}

                <form onSubmit={handleSubmit} className="testimonial-form">
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="author">
                                {language === 'ar' ? 'الاسم من مقطعين' : 'Name (Two Parts)'} *
                            </label>
                            <input
                                type="text"
                                id="author"
                                name="author"
                                value={formData.author}
                                onChange={handleChange}
                                required
                                placeholder={language === 'ar' ? 'أحمد محمود' : 'Ahmad Mahmoud'}
                            />
                        </div>

                        <div className="form-group">
                            <label>{language === 'ar' ? 'تحديد' : 'Select'} *</label>
                            <div className="gender-toggle">
                                <button
                                    type="button"
                                    className={formData.gender === 'male' ? 'active' : ''}
                                    onClick={() => setFormData({ ...formData, gender: 'male' })}
                                >
                                    {language === 'ar' ? 'طالب' : 'Male'}
                                </button>
                                <button
                                    type="button"
                                    className={formData.gender === 'female' ? 'active' : ''}
                                    onClick={() => setFormData({ ...formData, gender: 'female' })}
                                >
                                    {language === 'ar' ? 'طالب' : 'Female'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group full-width">
                            <label htmlFor="major">
                                {language === 'ar' ? 'التخصص' : 'Major'} *
                            </label>
                            <input
                                type="text"
                                id="major"
                                name="major"
                                value={formData.major}
                                onChange={handleChange}
                                required
                                placeholder={language === 'ar' ? 'علوم الحاسوب' : 'Computer Science'}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label htmlFor="quote">
                            {language === 'ar' ? 'رأيك' : 'Your Review'} *
                        </label>
                        <textarea
                            id="quote"
                            name="quote"
                            value={formData.quote}
                            onChange={handleChange}
                            required
                            rows="4"
                            placeholder={language === 'ar'
                                ? 'شاركنا تجربتك مع الموقع...'
                                : 'Share your experience with the website...'}
                        />
                    </div>

                    <button type="submit" className="submit-btn" disabled={isSubmitting}>
                        {isSubmitting
                            ? (language === 'ar' ? 'جاري الإرسال...' : 'Submitting...')
                            : (language === 'ar' ? 'إرسال الرأي' : 'Submit Review')}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default TestimonialForm;
