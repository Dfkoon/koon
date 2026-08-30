import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './TimetableBuilder.css';

const DAYS = [
  { id: 'sun', ar: 'الأحد', en: 'Sunday' },
  { id: 'mon', ar: 'الإثنين', en: 'Monday' },
  { id: 'tue', ar: 'الثلاثاء', en: 'Tuesday' },
  { id: 'wed', ar: 'الأربعاء', en: 'Wednesday' },
  { id: 'thu', ar: 'الخميس', en: 'Thursday' },
];

const TIME_SLOTS = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00'
];

const TimetableBuilder = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [courses, setCourses] = useState(() => {
    try {
      const saved = localStorage.getItem('koon_timetable_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [newCourse, setNewCourse] = useState({
    name: '',
    code: '',
    room: '',
    instructor: '',
    day: 'sun',
    startTime: '09:00',
    endTime: '10:00',
    color: '#e02b20'
  });

  const [collisionError, setCollisionError] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('koon_timetable_v1', JSON.stringify(courses));
    } catch (e) {
      console.error('Failed to save timetable:', e);
    }
  }, [courses]);

  const handleAddCourse = (e) => {
    e.preventDefault();
    if (!newCourse.name.trim()) return;

    // Check for collision (time overlap on the same day)
    const hasCollision = courses.some((c) => {
      if (c.day !== newCourse.day) return false;
      const startA = c.startTime;
      const endA = c.endTime;
      const startB = newCourse.startTime;
      const endB = newCourse.endTime;
      return (startB < endA && endB > startA);
    });

    if (hasCollision) {
      setCollisionError(
        isAr
          ? '⚠️ يوجد تعارض في الوقت مع محاضر أرى بنفس اليوم!'
          : '⚠️ Time collision detected with another lecture on the same day!'
      );
      return;
    }

    setCollisionError('');
    setCourses([...courses, { ...newCourse, id: Date.now().toString() }]);
    setNewCourse({
      name: '',
      code: '',
      room: '',
      instructor: '',
      day: 'sun',
      startTime: '09:00',
      endTime: '10:00',
      color: getRandomColor()
    });
  };

  const getRandomColor = () => {
    const colors = ['#e02b20', '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleDeleteCourse = (id) => {
    setCourses(courses.filter((c) => c.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm(isAr ? 'هل أنت تأكد من مسح الجدول كاملاً؟' : 'Are you sure you want to clear the full timetable?')) {
      setCourses([]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="timetable-builder-container">
      <div className="timetable-header">
        <div className="title-area">
          <h2>🗓️ {isAr ? 'مولد ومنظّم الجدول الدراسي الأسبوعي' : 'Weekly Timetable Builder'}</h2>
          <p>{isAr ? 'قم بإضاف محاضراتك وتأكد من عدم وجود تعارض في الأوقات بكل سهول' : 'Add your lectures and verify there are no time conflicts easily'}</p>
        </div>

        <div className="actions-area">
          {courses.length > 0 && (
            <>
              <button className="btn-print" onClick={handlePrint}>
                🖨️ {isAr ? 'طباع / حفظ PDF' : 'Print / Save PDF'}
              </button>
              <button className="btn-clear" onClick={handleClearAll}>
                🗑️ {isAr ? 'مسح الجدول' : 'Clear All'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="timetable-grid-layout">
        {/* Form Card */}
        <div className="course-form-card">
          <h3>➕ {isAr ? 'إضاف محاضر جديد' : 'Add New Lecture'}</h3>
          {collisionError && <div className="collision-alert">{collisionError}</div>}

          <form onSubmit={handleAddCourse} className="course-form">
            <div className="form-group">
              <label>{isAr ? 'اسم المادة *' : 'Subject Name *'}</label>
              <input
                type="text"
                required
                placeholder={isAr ? 'مثال: تفاضل 1' : 'e.g. Calculus 1'}
                value={newCourse.name}
                onChange={(e) => setNewCourse({ ...newCourse, name: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{isAr ? 'رمز المادة' : 'Course Code'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: 0301101' : 'e.g. 0301101'}
                  value={newCourse.code}
                  onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>{isAr ? 'القاع / المبنى' : 'Room / Building'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: قاع 201' : 'e.g. Room 201'}
                  value={newCourse.room}
                  onChange={(e) => setNewCourse({ ...newCourse, room: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{isAr ? 'اليوم *' : 'Day *'}</label>
                <select
                  value={newCourse.day}
                  onChange={(e) => setNewCourse({ ...newCourse, day: e.target.value })}
                >
                  {DAYS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {isAr ? d.ar : d.en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{isAr ? 'من' : 'Start'}</label>
                <select
                  value={newCourse.startTime}
                  onChange={(e) => setNewCourse({ ...newCourse, startTime: e.target.value })}
                >
                  {TIME_SLOTS.slice(0, -1).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{isAr ? 'إلى' : 'End'}</label>
                <select
                  value={newCourse.endTime}
                  onChange={(e) => setNewCourse({ ...newCourse, endTime: e.target.value })}
                >
                  {TIME_SLOTS.slice(1).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn-add-course">
              ✨ {isAr ? 'إضاف للجدول' : 'Add to Timetable'}
            </button>
          </form>
        </div>

        {/* Visual Weekly Grid */}
        <div className="timetable-visual-card">
          <div className="timetable-printable-area">
            <div className="timetable-grid-header">
              <div className="day-header-cell">{isAr ? 'اليوم / الوقت' : 'Day / Time'}</div>
              {DAYS.map((d) => (
                <div key={d.id} className="day-header-cell">{isAr ? d.ar : d.en}</div>
              ))}
            </div>

            <div className="timetable-grid-body">
              {DAYS.map((d) => {
                const dayCourses = courses.filter((c) => c.day === d.id);
                return (
                  <div key={d.id} className="timetable-day-col">
                    <div className="day-name-badge">{isAr ? d.ar : d.en}</div>
                    <div className="day-courses-list">
                      {dayCourses.length === 0 ? (
                        <div className="no-courses-slot">{isAr ? 'لا يوجد محاضرات' : 'No lectures'}</div>
                      ) : (
                        dayCourses.map((course) => (
                          <div
                            key={course.id}
                            className="timetable-course-chip"
                            style={{ borderRightColor: course.color, borderLeftColor: course.color }}
                          >
                            <div className="course-chip-header">
                              <span className="course-chip-title">{course.name}</span>
                              <button
                                className="btn-del-course"
                                onClick={() => handleDeleteCourse(course.id)}
                                title={isAr ? 'حذف' : 'Delete'}
                              >
                                ✕
                              </button>
                            </div>
                            <div className="course-chip-meta">
                              <span>⏰ {course.startTime} - {course.endTime}</span>
                              {course.room && <span>📍 {course.room}</span>}
                              {course.code && <span>🆔 {course.code}</span>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimetableBuilder;
