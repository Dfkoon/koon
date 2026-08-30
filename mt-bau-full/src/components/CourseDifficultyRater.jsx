import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import './CourseDifficultyRater.css';

const STORAGE_KEY = 'koon_course_difficulty_v1';

const LEVELS = [
    { value: 1, emoji: '😌', labelAr: 'سهل جداً', labelEn: 'Very Easy', color: '#10b981' },
    { value: 2, emoji: '🙂', labelAr: 'سهل', labelEn: 'Easy', color: '#34d399' },
    { value: 3, emoji: '😐', labelAr: 'متوسط', labelEn: 'Medium', color: '#f59e0b' },
    { value: 4, emoji: '😤', labelAr: 'صعب', labelEn: 'Hard', color: '#f97316' },
    { value: 5, emoji: '😱', labelAr: 'صعب جداً', labelEn: 'Very Hard', color: '#e02b20' },
];

/**
 * CourseDifficultyRater
 * Shows a quick emoji picker to rate how hard the user finds this course.
 * Ratings are stored in localStorage keyed by courseId.
 */
const CourseDifficultyRater = ({ courseId, courseName }) => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [selected, setSelected] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return stored[courseId] || null;
        } catch { return null; }
    });

    const [hovered, setHovered] = useState(null);
    const [showThanks, setShowThanks] = useState(false);

    const handleRate = async (val) => {
        if (selected) return; // already rated
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            stored[courseId] = val;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch { /* ignore */ }
        setSelected(val);
        setShowThanks(true);
        setTimeout(() => setShowThanks(false), 2500);

        // ── Write to Firebase ──
        const levelLabel = LEVELS.find(l => l.value === val);
        try {
            await addDoc(collection(db, 'material_ratings'), {
                itemId: courseId,
                itemTitle: courseName,
                rating: val,
                ratingLabel: levelLabel?.labelAr || '',
                ratingLabelEn: levelLabel?.labelEn || '',
                type: 'difficulty',
                timestamp: serverTimestamp(),
            });
        } catch { /* silently fail */ }
    };

    const active = hovered || selected;
    const activeLevel = LEVELS.find(l => l.value === active);

    return (
        <div className="difficulty-rater-wrapper">
            <div className="difficulty-rater-label">
                {isAr ? '⚡ صعوب المادة:' : '⚡ Course Difficulty:'}
            </div>
            <div className="difficulty-emojis">
                {LEVELS.map(level => (
                    <button
                        key={level.value}
                        className={`difficulty-emoji-btn ${selected === level.value ? 'selected' : ''} ${selected && selected !== level.value ? 'dimmed' : ''}`}
                        onMouseEnter={() => !selected && setHovered(level.value)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => handleRate(level.value)}
                        aria-label={isAr ? level.labelAr : level.labelEn}
                        title={isAr ? level.labelAr : level.labelEn}
                        disabled={!!selected}
                        style={selected === level.value ? { '--emoji-color': level.color } : {}}
                    >
                        {level.emoji}
                    </button>
                ))}
            </div>
            {activeLevel && (
                <span className="difficulty-active-label" style={{ color: activeLevel.color }}>
                    {isAr ? activeLevel.labelAr : activeLevel.labelEn}
                </span>
            )}
            {showThanks && (
                <span className="difficulty-thanks">
                    {isAr ? '✅ شكراً لتقييمك!' : '✅ Thanks for rating!'}
                </span>
            )}
        </div>
    );
};

export default CourseDifficultyRater;
