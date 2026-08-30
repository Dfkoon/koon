import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { plansData } from '../data/plansData';
import './SmartAdvisor.css';

const SmartAdvisor = () => {
    const { language, t } = useLanguage();
    const [step, setStep] = useState(0); // 0: Plan Type, 1: Major, 2: Courses, 3: Recommendations
    const [formData, setFormData] = useState({
        planType: '',
        major: '',
        year: '1',
    });
    const [passedCourses, setPassedCourses] = useState([]);
    const [recommendations, setRecommendations] = useState([]);

    const majors = formData.planType ? Object.keys(plansData[formData.planType] || {}) : [];

    const handlePlanTypeSelection = (type) => {
        setFormData({ ...formData, planType: type, major: '' });
        setStep(1);
    };

    const handleMajorChange = (majorId) => {
        setFormData({ ...formData, major: majorId });
        setPassedCourses([]);
    };

    const toggleCourse = (courseId) => {
        if (passedCourses.includes(courseId)) {
            setPassedCourses(passedCourses.filter(id => id !== courseId));
        } else {
            setPassedCourses([...passedCourses, courseId]);
        }
    };

    const generateRecommendations = () => {
        if (!formData.major || !formData.planType) return;

        const currentPlan = plansData[formData.planType][formData.major];
        const allCourses = currentPlan.semesters.flatMap(sem => sem.courses);

        const suggest = allCourses.filter(course => {
            const isPassed = passedCourses.includes(course.id);
            const prereqPassed = !course.prereq || passedCourses.includes(course.prereq);
            return !isPassed && prereqPassed;
        });

        setRecommendations(suggest.slice(0, 6));
        setStep(3);
    };

    return (
        <div className="smart-advisor-container glass-card" id="smart-advisor">
            <div className="advisor-header">
                <h3>
                    {language === 'ar' ? 'مستشار طلابي ✨' : 'Student Advisor ✨'}
                    <span className="beta-badge">{language === 'ar' ? '(نس تجريبي)' : '(Beta Version)'}</span>
                </h3>
                <p>{language === 'ar' ? 'ساعدنا في معرف وضعك الأكاديمي لنقترح عليك أفضل المواد للفصل القادم' : 'Tell us your progress so we can suggest the best courses for your next semester'}</p>
            </div>

            <div className="advisor-steps-indicator">
                <div className={`step-dot ${step >= 0 ? 'active' : ''}`}>P</div>
                <div className="step-line"></div>
                <div className={`step-dot ${step >= 1 ? 'active' : ''}`}>M</div>
                <div className="step-line"></div>
                <div className={`step-dot ${step >= 2 ? 'active' : ''}`}>C</div>
                <div className="step-line"></div>
                <div className={`step-dot ${step >= 3 ? 'active' : ''}`}>R</div>
            </div>

            {step === 0 && (
                <div className="advisor-step fade-in">
                    <h4>{language === 'ar' ? 'أهلاً بك! في أي سن التحقت بالجامعة؟' : 'Welcome! When did you join the university?'}</h4>
                    <div className="plan-type-grid">
                        <div className="plan-option-card" onClick={() => handlePlanTypeSelection('old')}>
                            <div className="plan-badge-icon">📜</div>
                            <h5>{language === 'ar' ? 'الخطط الدراسية القديم' : 'Old Academic Plans'}</h5>
                            <p>{language === 'ar' ? 'تشمل الأجيال: 2003، 2004، 2005، 2006' : 'Generations: 2003, 2004, 2005, 2006'}</p>
                        </div>
                        <div className="plan-option-card">
                            <div className="plan-badge-icon">✨</div>
                            <h5>{language === 'ar' ? 'الخطط الدراسية الجديد' : 'New Academic Plans'}</h5>
                            <p>{language === 'ar' ? 'تشمل جيل 2007 والأجيال القادم (2008، 2009...)' : 'Generation 2007 and beyond (2008, 2009...)'}</p>
                            <div className="under-construction-overlay">
                                <span>{language === 'ar' ? 'قريباً... (جاري العمل عليها)' : 'Coming Soon... (Under Construction)'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === 1 && (
                <div className="advisor-step fade-in">
                    <button className="back-step-btn" onClick={() => setStep(0)}>←</button>
                    <h4>{language === 'ar' ? 'اختر تخصصك' : 'Select your Major'}</h4>
                    <div className="major-grid">
                        {majors.map(mId => (
                            <button
                                key={mId}
                                className={`major-option ${formData.major === mId ? 'active' : ''}`}
                                onClick={() => handleMajorChange(mId)}
                            >
                                {language === 'ar' ? plansData[formData.planType][mId].name : plansData[formData.planType][mId].nameEn}
                                {plansData[formData.planType][mId].description && (
                                    <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.7, marginTop: '5px' }}>
                                        {plansData[formData.planType][mId].description}
                                    </span>
                                )}
                            </button>
                        ))}
                        {majors.length === 0 && <p style={{ textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)' }}>{language === 'ar' ? 'نعتذر، الخطط لهذه الفئ قيد العمل حالياً...' : 'Sorry, plans for this category are currently under development...'}</p>}
                    </div>

                    {majors.length > 0 && (
                        <button
                            className="advisor-next-btn"
                            disabled={!formData.major}
                            onClick={() => setStep(2)}
                        >
                            {language === 'ar' ? 'التالي: المواد المقطوع' : 'Next: Passed Courses'}
                        </button>
                    )}
                    {majors.length === 0 && (
                        <button className="advisor-reset-btn" onClick={() => setStep(0)}>
                            {language === 'ar' ? 'رجوع للاختيار' : 'Back to Selection'}
                        </button>
                    )}
                </div>
            )}

            {step === 2 && (
                <div className="advisor-step fade-in">
                    <button className="back-step-btn" onClick={() => setStep(1)}>←</button>
                    <h4>{language === 'ar' ? 'حدد المواد التي نجحت بها سابقاً' : 'Select courses you have passed'}</h4>
                    <div className="courses-check-list">
                        {plansData[formData.planType][formData.major].semesters.map(sem => (
                            <div key={sem.id} className="semester-block">
                                <h5>{sem.name}</h5>
                                <div className="courses-grid-mini">
                                    {sem.courses.map(course => (
                                        <div
                                            key={course.id}
                                            className={`course-check-item ${passedCourses.includes(course.id) ? 'checked' : ''}`}
                                            onClick={() => toggleCourse(course.id)}
                                        >
                                            <span className="check-box"></span>
                                            <div className="course-check-info">
                                                <span className="name">{language === 'ar' ? course.name : course.nameEn}</span>
                                                <span className="credits">{course.credits} {language === 'ar' ? 'ساعات' : 'Hrs'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="advisor-actions">
                        <button className="advisor-next-btn" onClick={generateRecommendations}>
                            {language === 'ar' ? 'عرض الاقتراحات 🚀' : 'View Suggestions 🚀'}
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="advisor-step fade-in">
                    <h4>{language === 'ar' ? 'المواد المقترح تسجيلها للفصل القادم:' : 'Recommended courses for next semester:'}</h4>
                    <div className="recommendations-list">
                        {recommendations.length > 0 ? (
                            recommendations.map(course => (
                                <div key={course.id} className="recommendation-card">
                                    <div className="rec-icon">📖</div>
                                    <div className="rec-info">
                                        <h5>{language === 'ar' ? course.name : course.nameEn}</h5>
                                        <p>{course.credits} {language === 'ar' ? 'ساعات معتمد' : 'Credit Hours'}</p>
                                    </div>
                                    {course.prereq && (
                                        <div className="rec-prereq">
                                            <span>{language === 'ar' ? 'المتطلب:' : 'Prereq:'}</span>
                                            <span className="prereq-name">
                                                {language === 'ar'
                                                    ? plansData[formData.planType][formData.major].semesters.flatMap(s => s.courses).find(c => c.id === course.prereq)?.name
                                                    : plansData[formData.planType][formData.major].semesters.flatMap(s => s.courses).find(c => c.id === course.prereq)?.nameEn
                                                }
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <p className="no-rec">{language === 'ar' ? 'لا توجد توصيات حالياً، تأكد من اختيار تخصصك وإدخال وضعك الأكاديمي بدقة.' : 'No recommendations available. Please ensure you entered your progress correctly.'}</p>
                        )}
                    </div>

                    <button className="advisor-reset-btn" onClick={() => setStep(0)}>
                        {language === 'ar' ? 'إعاد تعيين 🔄' : 'Reset Advisor 🔄'}
                    </button>
                </div>
            )}
        </div>
    );
};

export default SmartAdvisor;
