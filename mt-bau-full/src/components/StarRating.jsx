import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import './StarRating.css';

/**
 * StarRating - Reusable star rating component
 * @param {string} itemId - Unique ID for the item being rated
 * @param {string} itemTitle - Title for accessibility
 * @param {number} maxStars - Max stars (default 5)
 */
const StarRating = ({ itemId, itemTitle = '', maxStars = 5, compact = false }) => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const storageKey = `koon_rating_${itemId}`;
    const allRatingsKey = `koon_all_ratings_${itemId}`;

    const [userRating, setUserRating] = useState(() => {
        try { return parseInt(localStorage.getItem(storageKey)) || 0; } catch { return 0; }
    });

    const [hovered, setHovered] = useState(0);
    const [avgRating, setAvgRating] = useState(0);
    const [totalVotes, setTotalVotes] = useState(0);
    const [submitted, setSubmitted] = useState(!!userRating);
    const [animating, setAnimating] = useState(false);

    // Load stored ratings summary
    useEffect(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(allRatingsKey) || '{"sum":0,"count":0}');
            if (stored.count > 0) {
                setAvgRating(stored.sum / stored.count);
                setTotalVotes(stored.count);
            }
        } catch { /* ignore */ }
    }, [itemId]);

    const handleRate = async (star) => {
        if (submitted) return;

        try {
            const stored = JSON.parse(localStorage.getItem(allRatingsKey) || '{"sum":0,"count":0}');
            const updated = { sum: stored.sum + star, count: stored.count + 1 };
            localStorage.setItem(allRatingsKey, JSON.stringify(updated));
            localStorage.setItem(storageKey, star.toString());

            setUserRating(star);
            setAvgRating(updated.sum / updated.count);
            setTotalVotes(updated.count);
            setSubmitted(true);
            setAnimating(true);
            setTimeout(() => setAnimating(false), 600);
        } catch { /* ignore */ }

        // ── Write to Firebase ──
        try {
            await addDoc(collection(db, 'material_ratings'), {
                itemId,
                itemTitle,
                rating: star,
                type: 'star',
                timestamp: serverTimestamp(),
            });
        } catch { /* silently fail — localStorage is the fallback */ }
    };

    const displayRating = hovered || userRating;
    const showAvg = totalVotes > 0;

    if (compact) {
        return (
            <div className="star-rating-compact">
                <span className="star-compact-icon">⭐</span>
                <span className="star-compact-val">{showAvg ? avgRating.toFixed(1) : '-'}</span>
                {showAvg && <span className="star-compact-count">({totalVotes})</span>}
            </div>
        );
    }

    return (
        <div className={`star-rating-wrapper ${animating ? 'rating-success' : ''}`}>
            {!submitted ? (
                <div className="star-rating-interactive">
                    <span className="rate-label">{isAr ? 'قيّم هذا المرجع:' : 'Rate this material:'}</span>
                    <div className="stars-row">
                        {Array.from({ length: maxStars }, (_, i) => i + 1).map(star => (
                            <button
                                key={star}
                                className={`star-btn ${star <= displayRating ? 'filled' : ''}`}
                                onMouseEnter={() => setHovered(star)}
                                onMouseLeave={() => setHovered(0)}
                                onClick={() => handleRate(star)}
                                aria-label={`Rate ${star} out of ${maxStars}`}
                                title={isAr ? `${star} من ${maxStars}` : `${star} of ${maxStars}`}
                            >
                                {star <= displayRating ? '★' : '☆'}
                            </button>
                        ))}
                    </div>
                    {showAvg && (
                        <span className="avg-display">
                            {isAr ? `تقييم المستدمين: ${avgRating.toFixed(1)}/5 (${totalVotes} تقييم)` : `Avg: ${avgRating.toFixed(1)}/5 (${totalVotes} ratings)`}
                        </span>
                    )}
                </div>
            ) : (
                <div className="star-rating-done">
                    <div className="stars-row readonly">
                        {Array.from({ length: maxStars }, (_, i) => i + 1).map(star => (
                            <span key={star} className={`star-btn ${star <= userRating ? 'filled' : ''}`}>
                                {star <= userRating ? '★' : '☆'}
                            </span>
                        ))}
                    </div>
                    <span className="thanks-msg">
                        {isAr ? `✅ شكراً! تقييمك: ${userRating}/5` : `✅ Thanks! Your rating: ${userRating}/5`}
                        {showAvg && ` · ${isAr ? 'المتوسط:' : 'Avg:'} ${avgRating.toFixed(1)}`}
                    </span>
                </div>
            )}
        </div>
    );
};

export default StarRating;
