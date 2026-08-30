import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { coursesData, categories, faculties } from '../../data/coursesData';

const AdminCourses = ({ volunteerMode = false, canDelete = true, canEdit = true, canAdd = true }) => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [selectedFaculty, setSelectedFaculty] = useState('ai');
    const [selectedSpecialization, setSelectedSpecialization] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('mandatoryUniversity');
    
    // Db overrides state
    const [dbCourses, setDbCourses] = useState([]);
    const [loading, setLoading] = useState(true);

    // Edit/Add modal state
    const [showModal, setShowModal] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [courseForm, setCourseForm] = useState({
        id: '',
        name: '',
        nameEn: '',
        icon: '',
        category: 'mandatoryUniversity',
        specialization: '',
        files: {
            pdf: '',
            book: '',
            summary: '',
            questions: '',
            solutions: '',
            link: ''
        }
    });

    // Fetch db overrides
    useEffect(() => {
        const unsub = onSnapshot(collection(db, 'academic_courses'), (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDbCourses(list);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching db courses:", err);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // Helper: Merge static courses with db overrides
    const getMergedCourses = () => {
        let list = [...(coursesData[selectedCategory] || [])];

        dbCourses.forEach(dbC => {
            if (dbC.category === selectedCategory) {
                const idx = list.findIndex(c => String(c.id) === String(dbC.id));
                if (dbC.deleted) {
                    if (idx > -1) list.splice(idx, 1);
                } else {
                    const mapped = {
                        id: dbC.id,
                        name: dbC.name,
                        nameEn: dbC.nameEn,
                        icon: dbC.icon || '',
                        specialization: dbC.specialization || null,
                        files: dbC.files || {}
                    };
                    if (idx > -1) {
                        list[idx] = mapped;
                    } else if (dbC.custom) {
                        list.push(mapped);
                    }
                }
            }
        });

        if (selectedSpecialization !== 'all') {
            list = list.filter(c => c.specialization === selectedSpecialization);
        }

        return list;
    };

    const handleSaveCourse = async (e) => {
        e.preventDefault();
        if (!courseForm.name || !courseForm.id) {
            toast.error(isAr ? 'الرجاء ملء الحقول المطلوب' : 'Please fill required fields');
            return;
        }

        try {
            const courseId = String(courseForm.id).trim();
            const courseRef = doc(db, 'academic_courses', courseId);
            
            const payload = {
                id: courseId,
                name: courseForm.name,
                nameEn: courseForm.nameEn,
                icon: courseForm.icon || '',
                category: courseForm.category,
                specialization: courseForm.specialization || null,
                files: courseForm.files || {},
                deleted: false,
                custom: editingCourse ? (editingCourse.custom || false) : true
            };

            // Keep local storage updated
            try {
                const localCourses = JSON.parse(localStorage.getItem('koon_local_academic_courses') || '{}');
                localCourses[courseId] = payload;
                localStorage.setItem('koon_local_academic_courses', JSON.stringify(localCourses));
            } catch (e) {}

            try {
                await setDoc(courseRef, payload, { merge: true });
                toast.success(isAr ? 'تم حفظ المادة ونشرها في السحاب بنجاح!' : 'Course saved and published to cloud successfully!');
            } catch (cloudErr) {
                console.error('Cloud save fallback for academic_courses:', cloudErr);
                toast.error(isAr ? `تنبيه: تم الحفظ محلياً فقط! فشل حفظ السحاب: ${cloudErr?.message || cloudErr}` : `Warning: Saved locally only! Cloud save failed: ${cloudErr?.message || cloudErr}`);
            }

            setShowModal(false);
        } catch (err) {
            console.error("Error saving course:", err);
            toast.error(isAr ? `خطأ أثناء الحفظ: ${err.message || err}` : `Save error: ${err.message || err}`);
            setShowModal(false);
        }
    };

    const handleDeleteCourse = async (course) => {
        if (!window.confirm(isAr ? `هل أنت متأكد من حذف مادة "${course.name}"؟` : `Delete course "${course.name}"?`)) return;

        try {
            const courseId = String(course.id);
            const courseRef = doc(db, 'academic_courses', courseId);
            
            await setDoc(courseRef, {
                id: courseId,
                category: selectedCategory,
                deleted: true
            }, { merge: true });
            
            toast.success(isAr ? 'تم حذف المادة بنجاح' : 'Course deleted successfully');
        } catch (err) {
            console.error("Error deleting course:", err);
            toast.error(isAr ? 'فشل الحذف' : 'Failed to delete');
        }
    };

    const openAddModal = () => {
        setEditingCourse(null);
        setCourseForm({
            id: 'custom_' + Date.now(),
            name: '',
            nameEn: '',
            icon: '',
            category: selectedCategory,
            specialization: selectedSpecialization === 'all' ? '' : selectedSpecialization,
            files: { pdf: '', book: '', summary: '', questions: '', solutions: '', link: '' }
        });
        setShowModal(true);
    };

    const openEditModal = (course) => {
        const dbOverride = dbCourses.find(c => String(c.id) === String(course.id));
        setEditingCourse(course);
        setCourseForm({
            id: course.id,
            name: course.name,
            nameEn: course.nameEn || '',
            icon: course.icon || '',
            category: selectedCategory,
            specialization: course.specialization || '',
            files: {
                pdf: course.files?.pdf || '',
                book: course.files?.book || '',
                summary: course.files?.summary || '',
                questions: course.files?.questions || '',
                solutions: course.files?.solutions || '',
                link: course.files?.link || ''
            },
            custom: dbOverride ? (dbOverride.custom || false) : false
        });
        setShowModal(true);
    };

    const filteredCategories = categories.filter(cat => {
        return cat.faculty === 'all' || cat.faculty === selectedFaculty;
    });

    const activeSpecializations = faculties.find(f => f.id === selectedFaculty)?.specializations || [];
    const mergedCourses = getMergedCourses();

    if (loading) {
        return (
            <div className="admin-loading-container">
                <div className="admin-spinner" />
                <p>{isAr ? 'جاري تحميل المواد الدراسية...' : 'Loading courses...'}</p>
            </div>
        );
    }

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <h3 className="admin-section-title">
                <span>{isAr ? 'إدارة المواد الدراسيةة' : 'Manage Study Materials'}</span>
            </h3>

            {/* Filters Card */}
            <div className="admin-glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    
                    {/* Faculty */}
                    <div className="filter-group" style={{ flex: '1 1 180px' }}>
                        <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                            {isAr ? 'الكلي:' : 'Faculty:'}
                        </label>
                        <select 
                            className="admin-input-field" 
                            style={{ width: '100%' }}
                            value={selectedFaculty} 
                            onChange={e => {
                                setSelectedFaculty(e.target.value);
                                setSelectedSpecialization('all');
                                setSelectedCategory('mandatoryUniversity');
                            }}
                        >
                            {faculties.map(f => (
                                <option key={f.id} value={f.id}>{isAr ? f.name : f.nameEn}</option>
                            ))}
                        </select>
                    </div>

                    {/* Specialization */}
                    {activeSpecializations.length > 0 && (
                        <div className="filter-group" style={{ flex: '1 1 180px' }}>
                            <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                                {isAr ? 'التخصص الفرعي:' : 'Specialization:'}
                            </label>
                            <select 
                                className="admin-input-field" 
                                style={{ width: '100%' }}
                                value={selectedSpecialization} 
                                onChange={e => setSelectedSpecialization(e.target.value)}
                            >
                                <option value="all">{isAr ? 'كل التخصصات' : 'All Specializations'}</option>
                                {activeSpecializations.map(s => (
                                    <option key={s.id} value={s.id}>{isAr ? s.name : s.nameEn}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Category */}
                    <div className="filter-group" style={{ flex: '1 1 200px' }}>
                        <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem' }}>
                            {isAr ? 'التصنيف:' : 'Category:'}
                        </label>
                        <select 
                            className="admin-input-field" 
                            style={{ width: '100%' }}
                            value={selectedCategory} 
                            onChange={e => setSelectedCategory(e.target.value)}
                        >
                            {filteredCategories.map(c => (
                                <option key={c.id} value={c.id}>{isAr ? c.name : c.nameEn}</option>
                            ))}
                        </select>
                    </div>

                    {/* Add button */}
                    {canAdd && (
                        <div style={{ flex: '0 0 auto' }}>
                            <button className="admin-action-btn approve" style={{ padding: '0.6rem 1.4rem' }} onClick={openAddModal}>
                                {isAr ? 'اضافة مادة جديدة' : 'Add New Course'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Courses List */}
            <div className="admin-glass-card" style={{ padding: '1.5rem' }}>
                <h4 style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--adm-text)',
                    marginBottom: '1.2rem',
                    paddingBottom: '0.75rem',
                    borderBottom: '1px solid var(--adm-divider)'
                }}>
                    {isAr ? 'قائمة المواد المتوفر' : 'Available Courses'} ({mergedCourses.length})
                </h4>

                {mergedCourses.length === 0 ? (
                    <div className="admin-empty-state" style={{ padding: '3rem 1rem' }}>
                        <p>{isAr ? 'لا توجد مواد في هذا التصنيف' : 'No courses found in this category'}</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '1rem' }}>
                        {mergedCourses.map(course => (
                            <div key={course.id} className="suggestion-admin-card" style={{ padding: '1.1rem' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                                        {course.icon && <span style={{ fontSize: '1.3rem' }}>{course.icon}</span>}
                                        <span style={{ fontWeight: 700, color: 'var(--adm-text)', fontSize: '0.92rem', lineHeight: 1.4 }}>
                                            {isAr ? course.name : (course.nameEn || course.name)}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--adm-muted)', marginBottom: '0.8rem' }}>
                                        ID: {course.id}
                                    </div>

                                    {/* File badges */}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.8rem' }}>
                                        {course.files?.pdf && (
                                            <span style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--adm-danger)', border: '1px solid rgba(239,68,68,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                PDF
                                            </span>
                                        )}
                                        {course.files?.book && (
                                            <span style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--adm-success)', border: '1px solid rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                {isAr ? 'كتاب المادة' : 'Book'}
                                            </span>
                                        )}
                                        {course.files?.summary && (
                                            <span style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                {isAr ? 'تلايص' : 'Summary'}
                                            </span>
                                        )}
                                        {course.files?.questions && (
                                            <span style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--adm-success)', border: '1px solid rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                {isAr ? 'اسئل' : 'Questions'}
                                            </span>
                                        )}
                                        {course.files?.solutions && (
                                            <span style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--adm-warning)', border: '1px solid rgba(245,158,11,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                {isAr ? 'حلول' : 'Solutions'}
                                            </span>
                                        )}
                                        {course.files?.link && (
                                            <span style={{ background: 'var(--adm-surface-card)', color: 'var(--adm-muted)', border: '1px solid var(--adm-border)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                                Drive
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--adm-divider)', paddingTop: '0.8rem', marginTop: '0.5rem' }}>
                                    {canEdit && (
                                        <button 
                                            className="admin-action-btn edit-q" 
                                            style={{ flex: 1 }}
                                            onClick={() => openEditModal(course)}
                                        >
                                            {isAr ? 'تعديل' : 'Edit'}
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button 
                                            className="admin-action-btn delete" 
                                            style={{ flex: 1 }}
                                            onClick={() => handleDeleteCourse(course)}
                                        >
                                            {isAr ? 'حذف' : 'Delete'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Add / Edit Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, padding: '1rem'
                }}>
                    <div className="admin-glass-card" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
                        <h4 style={{
                            color: 'var(--adm-text)',
                            fontSize: '1.15rem',
                            fontWeight: 800,
                            marginBottom: '1.5rem',
                            paddingBottom: '0.75rem',
                            borderBottom: '1px solid var(--adm-divider)'
                        }}>
                            {editingCourse ? (isAr ? 'تعديل مادة' : 'Edit Course') : (isAr ? 'إضافة مادة جديدة' : 'Add New Course')}
                        </h4>

                        <form onSubmit={handleSaveCourse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            
                            {/* Course ID */}
                            <div>
                                <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                                    {isAr ? 'معرف المادة الفريد (ID):' : 'Unique Course ID:'}
                                </label>
                                <input 
                                    type="text" 
                                    className="admin-input-field"
                                    style={{ width: '100%' }}
                                    value={courseForm.id}
                                    onChange={e => setCourseForm({...courseForm, id: e.target.value})}
                                    disabled={editingCourse !== null}
                                    placeholder={isAr ? 'مثال: university_math101' : 'e.g. university_math101'}
                                    required
                                />
                            </div>

                            {/* Name Ar */}
                            <div>
                                <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                                    {isAr ? 'اسم المادة بالعربي:' : 'Course Name (Arabic):'}
                                </label>
                                <input 
                                    type="text" 
                                    className="admin-input-field"
                                    style={{ width: '100%' }}
                                    value={courseForm.name}
                                    onChange={e => setCourseForm({...courseForm, name: e.target.value})}
                                    required
                                />
                            </div>

                            {/* Name En */}
                            <div>
                                <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                                    {isAr ? 'اسم المادة بالإنجليزي:' : 'Course Name (English):'}
                                </label>
                                <input 
                                    type="text" 
                                    className="admin-input-field"
                                    style={{ width: '100%' }}
                                    value={courseForm.nameEn}
                                    onChange={e => setCourseForm({...courseForm, nameEn: e.target.value})}
                                />
                            </div>

                            {/* Icon & Specialization */}
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ flex: '0 0 100px' }}>
                                    <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                                        {isAr ? 'الأيقون:' : 'Icon:'}
                                    </label>
                                    <input 
                                        type="text" 
                                        className="admin-input-field"
                                        style={{ width: '100%' }}
                                        value={courseForm.icon}
                                        onChange={e => setCourseForm({...courseForm, icon: e.target.value})}
                                        placeholder="📚"
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.82rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>
                                        {isAr ? 'التخصص:' : 'Specialization:'}
                                    </label>
                                    <select 
                                        className="admin-input-field"
                                        style={{ width: '100%' }}
                                        value={courseForm.specialization}
                                        onChange={e => setCourseForm({...courseForm, specialization: e.target.value})}
                                    >
                                        <option value="">{isAr ? 'عام / لا يوجد' : 'General / None'}</option>
                                        {activeSpecializations.map(s => (
                                            <option key={s.id} value={s.id}>{isAr ? s.name : s.nameEn}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Links Section */}
                            <div style={{ borderTop: '1px solid var(--adm-divider)', paddingTop: '1rem', marginTop: '0.25rem' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--adm-warning)', display: 'block', marginBottom: '0.8rem' }}>
                                    {isAr ? 'روابط الملفات والمحرك الدراسي:' : 'Study Resource Links:'}
                                </span>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {[
                                        { key: 'pdf', label: isAr ? 'رابط ملف PDF الاساسي:' : 'PDF File Link:' },
                                        { key: 'book', label: isAr ? 'رابط كتاب المادة:' : 'Textbook Link:' },
                                        { key: 'summary', label: isAr ? 'رابط التلايص والشروحات:' : 'Summaries Link:' },
                                        { key: 'questions', label: isAr ? 'رابط اسئل السنوات السابق:' : 'Past Papers Link:' },
                                        { key: 'solutions', label: isAr ? 'رابط الحلول والاجابات:' : 'Solutions Link:' },
                                        { key: 'link', label: isAr ? 'رابط المجلد العام (Drive):' : 'General Drive Link:' }
                                    ].map(({ key, label }) => (
                                        <div key={key}>
                                            <label style={{ fontSize: '0.78rem', color: 'var(--adm-muted)', display: 'block', marginBottom: '0.3rem' }}>
                                                {label}
                                            </label>
                                            <input 
                                                type="url" 
                                                className="admin-input-field"
                                                style={{ width: '100%' }}
                                                value={courseForm.files[key] || ''}
                                                onChange={e => setCourseForm({
                                                    ...courseForm, 
                                                    files: { ...courseForm.files, [key]: e.target.value }
                                                })}
                                                placeholder="https://drive.google.com/..."
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', borderTop: '1px solid var(--adm-divider)', paddingTop: '1rem' }}>
                                <button
                                    type="button"
                                    className="admin-action-btn decline"
                                    style={{ flex: 1, height: '44px' }}
                                    onClick={() => setShowModal(false)}
                                >
                                    {isAr ? 'إلغاء' : 'Cancel'}
                                </button>
                                <button
                                    type="submit"
                                    className="admin-action-btn approve"
                                    style={{ flex: 2, height: '44px' }}
                                >
                                    {isAr ? 'حفظ البيانات' : 'Save'}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default AdminCourses;
