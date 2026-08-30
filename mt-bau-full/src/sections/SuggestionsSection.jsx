import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useLanguage } from '../contexts/LanguageContext';
import './SuggestionsSection.css';

const SuggestionsSection = () => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState({
        name: '',
        type: 'suggestion',
        contact: '',
        phone: '',
        message: ''
    });
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        let timeoutId;

        try {
            // Add an 8-second timeout so it never stays stuck
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('timeout')), 8000);
            });

            const submitPromise = addDoc(collection(db, 'suggestions'), {
                ...formData,
                timestamp: serverTimestamp(),
                status: 'new',
                read: false,
            });

            await Promise.race([submitPromise, timeoutPromise]);
            
            clearTimeout(timeoutId);

            console.log('Form Submitted to Firebase');
            setIsSubmitted(true);
            setTimeout(() => {
                setIsSubmitted(false);
                setFormData({ name: '', type: 'suggestion', contact: '', phone: '', message: '' });
            }, 5000);
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('Error adding document: ', err);
            if (err.message === 'timeout') {
                setError('تعذر الإرسال. يرجى التحقق من اتصالك بالإنترنت والمحاول مجدداً.');
            } else {
                setError('حدث خطأ أثناء الإرسال. يرجى المحاولة مرة أخرى.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <section className="suggestions-section" id="suggestions">
            <div className="suggestions-container glass-card">
                <div className="suggestions-header">
                    <h2>{t('suggestions.title')}</h2>
                </div>

                {isSubmitted ? (
                    <div className="success-message-container">
                        <div className="success-icon">✅</div>
                        <h3>{t('suggestions.success.title')}</h3>
                        <p>{t('suggestions.success.desc')}</p>
                    </div>
                ) : (
                    <form className="suggestions-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="name">{t('suggestions.label.name')}</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder={t('suggestions.ph.name')}
                                className="form-input"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="type">{t('suggestions.label.type')}</label>
                            <div className="select-wrapper">
                                <select
                                    id="type"
                                    name="type"
                                    value={formData.type}
                                    onChange={handleChange}
                                    className="form-select"
                                >
                                    <option value="suggestion">{t('suggestions.opt.suggestion')}</option>
                                    <option value="technical">{t('suggestions.opt.technical')}</option>
                                    <option value="collaboration">{t('suggestions.opt.collaboration')}</option>
                                    <option value="complaint">{t('suggestions.opt.complaint')}</option>
                                    <option value="other">{t('suggestions.opt.other')}</option>
                                </select>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="contact">{t('suggestions.label.contact')}</label>
                            <input
                                type="email"
                                id="contact"
                                name="contact"
                                value={formData.contact}
                                onChange={handleChange}
                                placeholder={t('suggestions.ph.contact')}
                                className="form-input"
                            />
                            <small className="form-hint">{t('suggestions.hint.contact')}</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="phone">{t('suggestions.label.phone')}</label>
                            <input
                                type="tel"
                                id="phone"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder={t('suggestions.ph.phone')}
                                className="form-input"
                                dir="ltr"
                            />
                        </div>

                        <div className="form-group full-width">
                            <label htmlFor="message">{t('suggestions.label.message')}</label>
                            <textarea
                                id="message"
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                placeholder={t('suggestions.ph.message')}
                                className="form-textarea"
                                required
                            />
                        </div>

                        {error && <div className="error-message" style={{ color: '#ff6b6b', marginBottom: '10px', textAlign: 'center' }}>{error}</div>}

                        <button type="submit" className="submit-btn full-width" disabled={isLoading}>
                            <span>{isLoading ? t('suggestions.btn.sending') : t('suggestions.btn.submit')}</span>
                            <span>{isLoading ? '⏳' : '🚀'}</span>
                        </button>
                    </form>
                )}
            </div>
        </section>
    );
};

export default SuggestionsSection;
