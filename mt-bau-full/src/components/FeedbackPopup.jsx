import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { sendAdminNotification } from '../services/notificationService';
import './FeedbackPopup.css';

const FeedbackPopup = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const [rating, setRating] = useState(0);
    const [message, setMessage] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (rating < 1) {
            setError(t('feedbackPopup.error.rating'));
            return;
        }

        if (!message.trim()) {
            setError(t('feedbackPopup.error.message'));
            return;
        }

        setIsLoading(true);

        try {
            await addDoc(collection(db, 'suggestions'), {
                type: 'feedback',
                rating,
                message: message.trim(),
                status: 'new',
                read: false,
                timestamp: serverTimestamp(),
            });

            // Send real-time admin notification
            sendAdminNotification(
                'general',
                `تقييم ورأي جديد من طالب (${rating} ⭐)`,
                `وصل رأي جديد: "${message.trim().slice(0, 80)}"`,
                { rating, message: message.trim() }
            );

            // Mark permanently so popup never shows again for this device/user
            localStorage.setItem('koon_rated_v1', 'true');
            onClose();
        } catch (err) {
            console.error('Feedback submit error:', err);
            setError(t('feedbackPopup.error.submit'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleSkip = () => {
        // Permanently dismiss - will never show again
        localStorage.setItem('koon_rated_v1', 'true');
        onClose();
    };


    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="feedback-popup-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="feedback-popup-card glass-card"
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="feedback-icon">⭐</div>
                        <h3 className="feedback-title">{t('feedbackPopup.title')}</h3>
                        <p className="feedback-text">{t('feedbackPopup.subtitle')}</p>

                        <form className="feedback-form" onSubmit={handleSubmit}>
                            <label className="feedback-label" htmlFor="feedback-rating">
                                {t('feedbackPopup.ratingLabel')}
                            </label>
                            <div className="star-rating" id="feedback-rating">
                                {[1, 2, 3, 4, 5].map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={`star-button ${rating >= value ? 'selected' : ''}`}
                                        onClick={() => setRating(value)}
                                        aria-label={`${value} ${t('feedbackPopup.starLabel')}`}
                                    >
                                        ★
                                    </button>
                                ))}
                            </div>

                            <label className="feedback-label" htmlFor="feedback-message">
                                {t('feedbackPopup.messageLabel')}
                            </label>
                            <textarea
                                id="feedback-message"
                                rows="5"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder={t('feedbackPopup.messagePlaceholder')}
                                className="feedback-textarea"
                            />

                            {error && <div className="feedback-error">{error}</div>}

                            <button type="submit" className="feedback-submit-btn" disabled={isLoading}>
                                {isLoading ? t('feedbackPopup.submitting') : t('feedbackPopup.submitBtn')}
                            </button>

                            <button
                                type="button"
                                onClick={handleSkip}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(100,100,120,0.7)',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    marginTop: '8px',
                                    textDecoration: 'underline',
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'center',
                                    padding: '4px'
                                }}
                            >
                                {t ? (t('feedbackPopup.skip') || 'لن أقيّم') : 'لن أقيّم'}
                            </button>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default FeedbackPopup;
