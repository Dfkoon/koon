import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './GPACalculator.css';

const GPACalculator = () => {
    const { t, language } = useLanguage();
    const isAr = language === 'ar';

    // Toggle: true for New System (2025/2026), false for Old System
    const [isNewSystem, setIsNewSystem] = useState(true);

    const [subjects, setSubjects] = useState([
        { id: 1, name: '', hours: 3, grade: '', isRetake: false, prevGrade: '' },
        { id: 2, name: '', hours: 3, grade: '', isRetake: false, prevGrade: '' },
        { id: 3, name: '', hours: 3, grade: '', isRetake: false, prevGrade: '' },
        { id: 4, name: '', hours: 3, grade: '', isRetake: false, prevGrade: '' }
    ]);

    const [currentGPA, setCurrentGPA] = useState('');
    const [completedHours, setCompletedHours] = useState('');

    const [semesterGPA, setSemesterGPA] = useState(0);
    const [expectedCumulativeGPA, setExpectedCumulativeGPA] = useState(0);
    const [expectedHours, setExpectedHours] = useState(0);
    const [rating, setRating] = useState('');

    // Grade Points Mapping
    const newSystemPoints = {
        'A': 4.00, 'A-': 3.75, 'B+': 3.50, 'B': 3.25, 'B-': 3.00,
        'C+': 2.75, 'C': 2.50, 'C-': 2.00, 'D+': 1.75, 'D': 1.25, 'D-': 1.00, 'F': 0.50
    };

    const oldSystemPoints = {
        'A': 4.00, 'A-': 3.75, 'B+': 3.50, 'B': 3.00, 'B-': 2.75,
        'C+': 2.50, 'C': 2.00, 'C-': 1.75, 'D+': 1.50, 'D': 1.00, 'D-': 0.75, 'F': 0.50
    };

    const retakeAllowedGrades = ['C-', 'D+', 'D', 'D-', 'F'];

    const getPoints = (grade) => {
        const pointsMap = isNewSystem ? newSystemPoints : oldSystemPoints;
        return pointsMap[grade] || 0;
    };

    const calculateGPA = () => {
        let semesterTotalPoints = 0;
        let semesterTotalHours = 0;

        subjects.forEach(sub => {
            if (sub.grade && sub.hours) {
                const points = getPoints(sub.grade);
                semesterTotalPoints += points * parseFloat(sub.hours);
                semesterTotalHours += parseFloat(sub.hours);
            }
        });

        const semGPA = semesterTotalHours > 0 ? (semesterTotalPoints / semesterTotalHours) : 0;
        setSemesterGPA(semGPA);
        updateRating(semGPA);

        // Cumulative Calculation
        if (currentGPA && completedHours) {
            let totalPointsAccumulated = parseFloat(currentGPA) * parseFloat(completedHours);
            let totalHoursAccumulated = parseFloat(completedHours);

            subjects.forEach(sub => {
                if (sub.grade && sub.hours) {
                    const h = parseFloat(sub.hours);
                    const p = getPoints(sub.grade);

                    if (sub.isRetake && sub.prevGrade) {
                        const prevP = getPoints(sub.prevGrade);
                        // For retake: Subtract old points, add new points. Hours stay the same.
                        totalPointsAccumulated += (p * h) - (prevP * h);
                    } else {
                        // For new material: Add new points and add new hours.
                        totalPointsAccumulated += (p * h);
                        totalHoursAccumulated += h;
                    }
                }
            });

            const expGPA = totalHoursAccumulated > 0 ? (totalPointsAccumulated / totalHoursAccumulated) : 0;
            setExpectedCumulativeGPA(expGPA);
            setExpectedHours(totalHoursAccumulated);
        } else {
            setExpectedCumulativeGPA(0);
            setExpectedHours(0);
        }
    };

    const updateRating = (gpa) => {
        if (gpa >= 3.65) setRating(isAr ? 'ممتاز' : 'Excellent');
        else if (gpa >= 3.00) setRating(isAr ? 'جيد جداً' : 'Very Good');
        else if (gpa >= 2.50) setRating(isAr ? 'جيد' : 'Good');
        else if (gpa >= 2.00) setRating(isAr ? 'مقبول' : 'Satisfactory');
        else if (gpa > 0) setRating(isAr ? 'ضعيف' : 'Weak');
        else setRating('-');
    };

    useEffect(() => {
        calculateGPA();
    }, [subjects, isNewSystem, currentGPA, completedHours]);

    const handleSubjectChange = (id, field, value) => {
        setSubjects(prev => prev.map(sub =>
            sub.id === id ? { ...sub, [field]: value } : sub
        ));
    };

    const addSubject = () => {
        const newId = subjects.length > 0 ? Math.max(...subjects.map(s => s.id)) + 1 : 1;
        setSubjects([...subjects, { id: newId, name: '', hours: 3, grade: '', isRetake: false, prevGrade: '' }]);
    };

    const removeSubject = (id) => {
        setSubjects(prev => prev.filter(s => s.id !== id));
    };

    const grades = Object.keys(newSystemPoints);

    return (
        <div className="gpa-calculator-container">
            <div className="gpa-header">
                <h2>{t('gpa.title')}</h2>
                <p className="gpa-hint-text">{t('gpa.retake_hint')}</p>
                <div className="gpa-system-toggle">
                    <button
                        className={`toggle-btn ${!isNewSystem ? 'active' : ''}`}
                        onClick={() => setIsNewSystem(false)}
                    >
                        {t('gpa.system.old')}
                    </button>
                    <button
                        className={`toggle-btn ${isNewSystem ? 'active' : ''}`}
                        onClick={() => setIsNewSystem(true)}
                    >
                        {t('gpa.system.new')}
                    </button>
                </div>
            </div>

            <div className="gpa-grid">
                <div className="subjects-column">
                    <div className="subject-row header">
                        <span>{t('gpa.subject')}</span>
                        <span>{t('gpa.hours')}</span>
                        <span>{t('gpa.grade')}</span>
                        <span>{t('gpa.retake')}</span>
                        <span></span>
                    </div>

                    {subjects.map(subject => (
                        <div key={subject.id} className="subject-item-wrapper">
                            <div className="subject-row">
                                <input
                                    type="text"
                                    className="gpa-input"
                                    placeholder={t('gpa.subject_ph')}
                                    value={subject.name}
                                    onChange={(e) => handleSubjectChange(subject.id, 'name', e.target.value)}
                                />
                                <input
                                    type="number"
                                    className="gpa-input"
                                    min="1" max="10"
                                    value={subject.hours}
                                    onChange={(e) => handleSubjectChange(subject.id, 'hours', e.target.value)}
                                />
                                <select
                                    className="gpa-input"
                                    value={subject.grade}
                                    onChange={(e) => handleSubjectChange(subject.id, 'grade', e.target.value)}
                                >
                                    <option value="">-</option>
                                    {grades.map(g => (
                                        <option key={g} value={g}>{g}</option>
                                    ))}
                                </select>
                                <div className="retake-checkbox-col">
                                    <input
                                        type="checkbox"
                                        className="retake-checkbox"
                                        checked={subject.isRetake}
                                        onChange={(e) => handleSubjectChange(subject.id, 'isRetake', e.target.checked)}
                                    />
                                </div>
                                <button className="remove-subject-btn" onClick={() => removeSubject(subject.id)}>×</button>
                            </div>

                            {subject.isRetake && (
                                <div className="retake-details-row animated-slide-down">
                                    <label>{t('gpa.prev_grade')}:</label>
                                    <select
                                        className="gpa-input compact"
                                        value={subject.prevGrade}
                                        onChange={(e) => handleSubjectChange(subject.id, 'prevGrade', e.target.value)}
                                    >
                                        <option value="">-</option>
                                        {retakeAllowedGrades.map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    ))}

                    <button className="add-subject-btn" onClick={addSubject}>
                        + {t('gpa.add_subject')}
                    </button>
                </div>

                <div className="results-column">
                    <div className="gpa-result-card">
                        <span className="gpa-label">{t('gpa.semester_result')}</span>
                        <div className="gpa-value">{semesterGPA.toFixed(2)}</div>
                        <span className="gpa-rating">{rating}</span>
                    </div>

                    <div className="cumulative-section">
                        <h3>📈 {t('gpa.cumulative_calc')}</h3>
                        <div className="cumulative-inputs">
                            <div className="input-wrapper">
                                <label>{t('gpa.current_gpa')}</label>
                                <input
                                    type="number"
                                    className="gpa-input"
                                    placeholder="0.00"
                                    value={currentGPA}
                                    onChange={(e) => setCurrentGPA(e.target.value)}
                                />
                            </div>
                            <div className="input-wrapper">
                                <label>{t('gpa.passed_hours')}</label>
                                <input
                                    type="number"
                                    className="gpa-input"
                                    placeholder="0"
                                    value={completedHours}
                                    onChange={(e) => setCompletedHours(e.target.value)}
                                />
                            </div>
                        </div>
                        {expectedCumulativeGPA > 0 && (
                            <>
                                <div className="expected-gpa">
                                    <span>{t('gpa.expected_cumulative')}</span>
                                    <strong>{expectedCumulativeGPA.toFixed(2)}</strong>
                                </div>
                                <div className="expected-gpa">
                                    <span>{t('gpa.expected_hours')}</span>
                                    <strong>{expectedHours}</strong>
                                </div>
                            </>
                        )}
                    </div>

                    <p className="gpa-estimation-disclaimer">
                        {t('gpa.disclaimer')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default GPACalculator;
