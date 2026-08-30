import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './StudyProgressTracker.css';

const STORAGE_KEY = 'koon_study_progress_v1';

const PRESET_SUBJECTS = [
    { id: 'math', nameAr: 'تفاضل وتكامل', nameEn: 'Calculus', icon: '📐' },
    { id: 'phys', nameAr: 'فيزياء عام', nameEn: 'Physics', icon: '⚛️' },
    { id: 'prog', nameAr: 'أساسيات البرمج', nameEn: 'Programming', icon: '💻' },
    { id: 'arabic', nameAr: 'الاللغة العربية', nameEn: 'Arabic', icon: '📖' },
    { id: 'english', nameAr: 'الاللغة الإنجليزية', nameEn: 'English', icon: '🌐' },
];

const StudyProgressTracker = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [subjects, setSubjects] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : PRESET_SUBJECTS.map(s => ({
                ...s,
                progress: 0,
                target: 80,
                sessions: 0,
                lastStudied: null
            }));
        } catch { return []; }
    });

    const [addMode, setAddMode] = useState(false);
    const [newSubject, setNewSubject] = useState({ nameAr: '', nameEn: '', icon: '📚', progress: 0, target: 80, sessions: 0, lastStudied: null });

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(subjects));
        } catch { /* ignore */ }
    }, [subjects]);

    const updateProgress = (id, delta) => {
        setSubjects(prev => prev.map(s =>
            s.id === id
                ? { ...s, progress: Math.max(0, Math.min(100, s.progress + delta)), sessions: s.sessions + (delta > 0 ? 1 : 0), lastStudied: new Date().toISOString() }
                : s
        ));
    };

    const setProgressDirect = (id, val) => {
        setSubjects(prev => prev.map(s =>
            s.id === id ? { ...s, progress: Math.max(0, Math.min(100, parseInt(val) || 0)) } : s
        ));
    };

    const handleAddSubject = (e) => {
        e.preventDefault();
        const id = `custom_${Date.now()}`;
        setSubjects([...subjects, { ...newSubject, id }]);
        setNewSubject({ nameAr: '', nameEn: '', icon: '📚', progress: 0, target: 80, sessions: 0, lastStudied: null });
        setAddMode(false);
    };

    const removeSubject = (id) => {
        setSubjects(prev => prev.filter(s => s.id !== id));
    };

    const overallProgress = subjects.length > 0
        ? Math.round(subjects.reduce((sum, s) => sum + s.progress, 0) / subjects.length)
        : 0;

    return (
        <div className="progress-tracker-container">
            <div className="tracker-header">
                <div className="tracker-title">
                    <h3>📊 {isAr ? 'متتبع تقدم الدراس الشخصي' : 'Personal Study Progress Tracker'}</h3>
                    <p>{isAr ? 'راقب مسيرتك الدراسي وتقدمك في مواد الفصل بشكل يومي' : 'Monitor your academic journey and daily study progress per subject'}</p>
                </div>
                <div className="overall-circle">
                    <svg viewBox="0 0 36 36" className="circular-chart">
                        <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path
                            className="circle-fill"
                            strokeDasharray={`${overallProgress}, 100`}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <text x="18" y="20.35" className="percentage">{overallProgress}%</text>
                    </svg>
                    <span className="overall-label">{isAr ? 'الإجمالي' : 'Overall'}</span>
                </div>
            </div>

            <div className="subjects-tracker-list">
                {subjects.map(subject => {
                    const isGoalReached = subject.progress >= subject.target;
                    return (
                        <div key={subject.id} className={`subject-tracker-card ${isGoalReached ? 'goal-reached' : ''}`}>
                            <div className="subject-tracker-info">
                                <span className="subject-tracker-icon">{subject.icon}</span>
                                <div>
                                    <span className="subject-tracker-name">{isAr ? subject.nameAr : subject.nameEn}</span>
                                    <span className="sessions-count">
                                        {isAr ? `${subject.sessions} جلس دراسي` : `${subject.sessions} sessions`}
                                        {isGoalReached && <span className="goal-badge">🎯 {isAr ? 'تم!' : 'Done!'}</span>}
                                    </span>
                                </div>
                            </div>

                            <div className="progress-controls">
                                <div className="progress-bar-wrapper">
                                    <div className="progress-bar-track">
                                        <div
                                            className="progress-bar-fill"
                                            style={{
                                                width: `${subject.progress}%`,
                                                backgroundColor: isGoalReached ? '#10b981' : subject.progress > 50 ? '#f59e0b' : '#e02b20'
                                            }}
                                        />
                                        <div
                                            className="target-marker"
                                            style={{ left: `${subject.target}%` }}
                                            title={isAr ? `الهدف: ${subject.target}%` : `Target: ${subject.target}%`}
                                        />
                                    </div>
                                    <span className="progress-percent">{subject.progress}%</span>
                                </div>

                                <div className="progress-btns">
                                    <button onClick={() => updateProgress(subject.id, -10)} className="btn-dec">-10%</button>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={subject.progress}
                                        onChange={(e) => setProgressDirect(subject.id, e.target.value)}
                                        className="progress-slider"
                                    />
                                    <button onClick={() => updateProgress(subject.id, 10)} className="btn-inc">+10%</button>
                                    <button onClick={() => removeSubject(subject.id)} className="btn-remove-subject" title={isAr ? 'حذف' : 'Remove'}>✕</button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Add subject form */}
            {addMode ? (
                <form onSubmit={handleAddSubject} className="add-subject-form">
                    <input
                        type="text"
                        placeholder={isAr ? 'اسم المادة (عربي)' : 'Subject name (EN)'}
                        value={isAr ? newSubject.nameAr : newSubject.nameEn}
                        onChange={e => isAr
                            ? setNewSubject({ ...newSubject, nameAr: e.target.value })
                            : setNewSubject({ ...newSubject, nameEn: e.target.value })
                        }
                        required
                    />
                    <input
                        type="text"
                        placeholder="Icon emoji 📚"
                        value={newSubject.icon}
                        maxLength={4}
                        onChange={e => setNewSubject({ ...newSubject, icon: e.target.value })}
                        style={{ width: '80px' }}
                    />
                    <button type="submit" className="btn-confirm-add">✅</button>
                    <button type="button" onClick={() => setAddMode(false)} className="btn-cancel-add">✕</button>
                </form>
            ) : (
                <button className="btn-add-tracker-subject" onClick={() => setAddMode(true)}>
                    ＋ {isAr ? 'إضاف مادة جديد' : 'Add New Subject'}
                </button>
            )}
        </div>
    );
};

export default StudyProgressTracker;
