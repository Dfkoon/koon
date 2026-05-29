import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../config/firebase';
import {
    collection, getDocs, query, orderBy, doc, updateDoc,
    deleteDoc, runTransaction, addDoc, serverTimestamp
} from 'firebase/firestore';
import {
    getCustomCourses, addCustomCourse, deleteCustomCourse,
    getCustomQuizzes, addQuiz, updateQuiz, deleteQuiz
} from '../services/adminService';
import { faculties, categories } from '../data/coursesData';
import {
    Plus, Trash2, Link as LinkIcon, Save, X,
    BookOpen, GraduationCap, Heart, HelpCircle,
    RefreshCw, Phone, MessageSquare, Edit2, Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import './Admin.css';

const AdminMaterials = () => {
    // Tab State
    const [activeTab, setActiveTab] = useState('academic'); // academic | donations
    const [academicSubTab, setAcademicSubTab] = useState('resources'); // resources | quizzes

    // Courses/Resources State
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
    const [resourceFormData, setResourceFormData] = useState({
        name: '', nameEn: '', faculty: faculties[0]?.id || 'ai',
        categoryId: '', icon: '📚', files: {}
    });
    const [newFile, setNewFile] = useState({ type: 'questions', url: '' });

    // Quiz Builder State
    const [quizzes, setQuizzes] = useState([]);
    const [selectedCourseForQuiz, setSelectedCourseForQuiz] = useState(null);
    const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
    const [editingQuiz, setEditingQuiz] = useState(null);
    const [quizFormData, setQuizFormData] = useState({
        title: '', titleAr: '', icon: '📝', color: '#2196F3', questions: []
    });

    // Donations State
    const [donations, setDonations] = useState([]);
    const [donationsLoading, setDonationsLoading] = useState(false);
    const [donationFilter, setDonationFilter] = useState('all');

    const fileTypes = [
        { id: 'questions', label: 'Past Papers (أسئلة سنوات)' },
        { id: 'pdf', label: 'PDF/Slides' },
        { id: 'summary', label: 'Summary (ملخص)' },
        { id: 'book', label: 'Book (كتاب)' },
        { id: 'solutions', label: 'Solutions (حلول)' },
        { id: 'video', label: 'Video (فيديو)' },
        { id: 'link', label: 'External Link (رابط خارجي)' }
    ];

    useEffect(() => {
        if (activeTab === 'academic') {
            fetchCourses();
            if (academicSubTab === 'quizzes') fetchQuizzes();
        } else {
            fetchDonations();
        }
    }, [activeTab, academicSubTab]);

    const fetchCourses = async () => {
        setLoading(true);
        const data = await getCustomCourses();
        setCourses(data);
        setLoading(false);
    };

    const fetchQuizzes = async () => {
        const data = await getCustomQuizzes();
        setQuizzes(data);
    };

    const fetchDonations = async () => {
        setDonationsLoading(true);
        try {
            const q = query(collection(db, 'materialDonations'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            setDonations(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            toast.error('Failed to fetch donations');
        } finally {
            setDonationsLoading(false);
        }
    };

    // --- Academic Handlers ---
    const availableCategories = categories.filter(cat =>
        cat.faculty === 'all' || cat.faculty === resourceFormData.faculty
    );

    useEffect(() => {
        if (availableCategories.length > 0 && !availableCategories.find(c => c.id === resourceFormData.categoryId)) {
            setResourceFormData(prev => ({ ...prev, categoryId: availableCategories[0].id }));
        }
    }, [resourceFormData.faculty, availableCategories]);

    const handleAddFile = () => {
        if (!newFile.url) {
            toast.error('Please enter a URL');
            return;
        }
        setResourceFormData(prev => ({
            ...prev,
            files: { ...prev.files, [newFile.type]: newFile.url }
        }));
        setNewFile(prev => ({ ...prev, url: '' }));
    };

    const handleResourceSubmit = async (e) => {
        e.preventDefault();
        const toastId = toast.loading('Adding material...');
        const result = await addCustomCourse(resourceFormData);
        if (result.success) {
            toast.success('Material added!', { id: toastId });
            setIsResourceModalOpen(false);
            fetchCourses();
        } else toast.error('Error adding material', { id: toastId });
    };

    const handleDeleteCourse = async (courseId) => {
        if (window.confirm('Delete this material?')) {
            await deleteCustomCourse(courseId);
            fetchCourses();
        }
    };

    // --- Quiz Builder Handlers ---
    const handleAddQuiz = () => {
        if (!selectedCourseForQuiz) {
            toast.error('Select a course first');
            return;
        }
        setEditingQuiz(null);
        setQuizFormData({
            title: '', titleAr: '', icon: '📝', color: '#2196F3',
            materialId: selectedCourseForQuiz.id, questions: []
        });
        setIsQuizModalOpen(true);
    };

    const handleQuizSubmit = async (e) => {
        e.preventDefault();
        const toastId = toast.loading('Saving quiz...');
        const result = editingQuiz
            ? await updateQuiz(editingQuiz.id, quizFormData)
            : await addQuiz(quizFormData);

        if (result.success) {
            toast.success('Quiz saved!', { id: toastId });
            setIsQuizModalOpen(false);
            fetchQuizzes();
        } else toast.error('Error saving quiz', { id: toastId });
    };

    const addQuestion = () => {
        setQuizFormData(prev => ({
            ...prev,
            questions: [...prev.questions, {
                id: Date.now(), type: 'mcq', questionEn: '', options: [
                    { id: 'a', textEn: '' }, { id: 'b', textEn: '' },
                    { id: 'c', textEn: '' }, { id: 'd', textEn: '' }
                ], correctAnswer: 'a', marks: 1
            }]
        }));
    };

    const removeQuestion = (qId) => {
        setQuizFormData(prev => ({
            ...prev,
            questions: prev.questions.filter(q => q.id !== qId)
        }));
    };

    const updateQuestion = (qId, field, value) => {
        setQuizFormData(prev => ({
            ...prev,
            questions: prev.questions.map(q => q.id === qId ? { ...q, [field]: value } : q)
        }));
    };

    // --- Donation Handlers ---
    const handleDonationStatus = async (donationId, index, status) => {
        try {
            const donationRef = doc(db, 'materialDonations', donationId);
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(donationRef);
                const data = docSnap.data();
                const materials = [...(data.materials || [data.itemName])];
                if (typeof materials[index] === 'string') materials[index] = { name: materials[index] };
                materials[index].status = status;
                transaction.update(donationRef, { materials });
            });
            fetchDonations();
            toast.success('Status updated');
        } catch (e) { toast.error('Status update failed'); }
    };

    const flattenedDonations = useMemo(() => {
        return donations.flatMap(d => {
            const materials = d.materials || (d.itemName ? [d.itemName] : []);
            return materials.map((m, idx) => ({
                ...d, material: typeof m === 'string' ? { name: m, status: d.status || 'pending' } : m,
                originalIndex: idx
            }));
        });
    }, [donations]);

    const filteredDonations = flattenedDonations.filter(d =>
        donationFilter === 'all' || d.material.status === donationFilter
    );

    return (
        <div className="admin-page-container">
            {/* Top Level Nav */}
            <div className="admin-nav-tabs">
                <button className={activeTab === 'academic' ? 'active' : ''} onClick={() => setActiveTab('academic')}>
                    <GraduationCap size={18} /> الإدارة الأكاديمية
                </button>
                <button className={activeTab === 'donations' ? 'active' : ''} onClick={() => setActiveTab('donations')}>
                    <Heart size={18} /> إدارة التبرعات
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'academic' ? (
                    <motion.div key="academic" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        <div className="admin-page-header admin-header-flex">
                            <div>
                                <h1>إدارة المواد والاختبارات</h1>
                                <p>تحكم في مصادر التعلم وبنك الأسئلة التفاعلي.</p>
                            </div>
                            <div className="sub-tab-pills">
                                <button className={academicSubTab === 'resources' ? 'active' : ''} onClick={() => setAcademicSubTab('resources')}>
                                    <BookOpen size={16} /> المصادر والملفات
                                </button>
                                <button className={academicSubTab === 'quizzes' ? 'active' : ''} onClick={() => setAcademicSubTab('quizzes')}>
                                    <HelpCircle size={16} /> بنك الأسئلة (Quizzes)
                                </button>
                            </div>
                        </div>

                        {academicSubTab === 'resources' ? (
                            <div className="admin-card">
                                <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex' }}>
                                    <h2>قائمة المواد المضافة</h2>
                                    <button className="admin-btn" onClick={() => setIsResourceModalOpen(true)}><Plus size={18} /> مادة جديدة</button>
                                </div>
                                <div className="table-wrapper">
                                    <table className="admin-table">
                                        <thead>
                                            <tr><th>الأيقونة</th><th>الاسم</th><th>الكلية</th><th>الملفات</th><th>الإجراء</th></tr>
                                        </thead>
                                        <tbody>
                                            {courses.map(course => (
                                                <tr key={course.id}>
                                                    <td>{course.icon}</td>
                                                    <td>{course.name}</td>
                                                    <td>{faculties.find(f => f.id === course.faculty)?.name}</td>
                                                    <td>{Object.keys(course.files || {}).length}</td>
                                                    <td><button className="delete-icon" onClick={() => handleDeleteCourse(course.id)}><Trash2 size={18} /></button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="quiz-builder-layout">
                                <div className="course-picker-sidebar admin-card">
                                    <h3>اختر المادة</h3>
                                    <div className="sidebar-list">
                                        {courses.map(course => (
                                            <button key={course.id} className={selectedCourseForQuiz?.id === course.id ? 'active' : ''} onClick={() => setSelectedCourseForQuiz(course)}>
                                                <span>{course.icon}</span> {course.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="quiz-main-area">
                                    {selectedCourseForQuiz ? (
                                        <div className="admin-card">
                                            <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex' }}>
                                                <h2>الاختبارات المتوفرة لـ {selectedCourseForQuiz.name}</h2>
                                                <button className="admin-btn" onClick={handleAddQuiz}><Plus size={18} /> اختبار جديد</button>
                                            </div>
                                            <div className="quiz-grid-admin">
                                                {quizzes.filter(q => q.materialId === selectedCourseForQuiz.id).map(quiz => (
                                                    <div key={quiz.id} className="quiz-card-admin">
                                                        <div className="quiz-info">
                                                            <span className="quiz-icon">{quiz.icon}</span>
                                                            <h4>{quiz.titleAr || quiz.title}</h4>
                                                            <p>{quiz.questions?.length || 0} سؤال</p>
                                                        </div>
                                                        <div className="quiz-actions">
                                                            <button className="edit-btn" onClick={() => { setEditingQuiz(quiz); setQuizFormData(quiz); setIsQuizModalOpen(true); }}><Edit2 size={16} /></button>
                                                            <button className="delete-btn" onClick={() => { if (window.confirm('Delete quiz?')) deleteQuiz(quiz.id).then(fetchQuizzes); }}><Trash2 size={16} /></button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {quizzes.filter(q => q.materialId === selectedCourseForQuiz.id).length === 0 && (
                                                    <div className="empty-quiz-state">لا يوجد اختبارات بعد. ابدأ بإضافة أول اختبار للمادة.</div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="select-course-prompt">
                                            <Layout size={48} />
                                            <p>اختر مادة من القائمة الجانبية لإدارة اختباراتها</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key="donations" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                        <div className="admin-page-header">
                            <h1>إدارة طلبات التبرع</h1>
                            <p>تتبع المواد التي يتبرع بها الطلاب وطلبات الحجز.</p>
                        </div>
                        <div className="admin-card">
                            <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex' }}>
                                <div className="filter-pills">
                                    {['all', 'pending', 'approved', 'reserved', 'completed'].map(f => (
                                        <button key={f} className={donationFilter === f ? 'active' : ''} onClick={() => setDonationFilter(f)}>
                                            {f === 'all' ? 'الكل' : f === 'pending' ? 'جديد' : f === 'approved' ? 'متاح' : f === 'reserved' ? 'محجوز' : 'منتهي'}
                                        </button>
                                    ))}
                                </div>
                                <button className="refresh-btn" onClick={fetchDonations}><RefreshCw size={18} /></button>
                            </div>
                            <div className="table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr><th>المتبرع</th><th>المادة</th><th>الحالة</th><th>تواصل</th></tr>
                                    </thead>
                                    <tbody>
                                        {filteredDonations.map((d, i) => (
                                            <tr key={i}>
                                                <td>{d.studentName}</td>
                                                <td>{d.material.name}</td>
                                                <td>
                                                    <select className={`status-chip ${d.material.status}`} value={d.material.status} onChange={(e) => handleDonationStatus(d.id, d.originalIndex, e.target.value)}>
                                                        <option value="pending">جديد</option><option value="approved">متاح</option><option value="reserved">محجوز</option><option value="completed">منتهي</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <div className="links">
                                                        <a href={`tel:${d.phoneNumber}`}><Phone size={14} /></a>
                                                        <a href={`https://wa.me/${d.phoneNumber}`}><MessageSquare size={14} /></a>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Resource Modal */}
            {isResourceModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-content">
                        <div className="modal-header">
                            <h2>إضافة مادة دراسية جديدة</h2>
                            <button onClick={() => setIsResourceModalOpen(false)} className="close-btn"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleResourceSubmit}>
                            <div className="admin-form-grid">
                                <div className="admin-form-group">
                                    <label>اسم المادة (عربي) *</label>
                                    <input required className="admin-input" value={resourceFormData.name} onChange={e => setResourceFormData({ ...resourceFormData, name: e.target.value })} />
                                </div>
                                <div className="admin-form-group">
                                    <label>اسم المادة (إنجليزي)</label>
                                    <input className="admin-input" value={resourceFormData.nameEn} onChange={e => setResourceFormData({ ...resourceFormData, nameEn: e.target.value })} />
                                </div>
                            </div>
                            <div className="admin-form-grid">
                                <div className="admin-form-group">
                                    <label>الكلية</label>
                                    <select className="admin-input" value={resourceFormData.faculty} onChange={e => setResourceFormData({ ...resourceFormData, faculty: e.target.value })}>
                                        {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                </div>
                                <div className="admin-form-group">
                                    <label>أيقونة</label>
                                    <input className="admin-input" value={resourceFormData.icon} onChange={e => setResourceFormData({ ...resourceFormData, icon: e.target.value })} />
                                </div>
                            </div>
                            <div className="admin-form-group">
                                <label>التصنيف</label>
                                <select className="admin-input" value={resourceFormData.categoryId} onChange={e => setResourceFormData({ ...resourceFormData, categoryId: e.target.value })}>
                                    {availableCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                </select>
                            </div>
                            <div className="file-adder-section">
                                <h3>إضافة روابط وملفات</h3>
                                <div className="file-adder-controls">
                                    <select className="admin-input" value={newFile.type} onChange={e => setNewFile({ ...newFile, type: e.target.value })}>
                                        {fileTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                    <input className="admin-input" value={newFile.url} placeholder="ضع الرابط هنا..." onChange={e => setNewFile({ ...newFile, url: e.target.value })} />
                                    <button type="button" className="admin-btn" onClick={handleAddFile}>إضافة</button>
                                </div>
                                <div className="added-files-list">
                                    {Object.entries(resourceFormData.files).map(([type, url]) => (
                                        <div key={type} className="file-chip">
                                            <span>{fileTypes.find(t => t.id === type)?.label.split(' (')[0]}</span>
                                            <button type="button" onClick={() => {
                                                const newFiles = { ...resourceFormData.files };
                                                delete newFiles[type];
                                                setResourceFormData({ ...resourceFormData, files: newFiles });
                                            }}><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="admin-modal-actions">
                                <button type="button" className="admin-btn-secondary" onClick={() => setIsResourceModalOpen(false)}>إلغاء</button>
                                <button type="submit" className="admin-btn"><Save size={18} /> حفظ المادة</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Quiz Builder Modal */}
            {isQuizModalOpen && (
                <div className="admin-modal-overlay">
                    <div className="admin-modal-content wide-modal">
                        <div className="modal-header">
                            <div>
                                <h2>{editingQuiz ? 'تعديل الاختبار' : 'إنشاء اختبار جديد'}</h2>
                                <p>مادة: {selectedCourseForQuiz?.name}</p>
                            </div>
                            <button onClick={() => setIsQuizModalOpen(false)} className="close-btn"><X size={24} /></button>
                        </div>
                        <div className="quiz-edit-main">
                            <div className="quiz-meta-section">
                                <div className="admin-form-grid">
                                    <div className="admin-form-group">
                                        <label>عنوان الاختبار (عربي)</label>
                                        <input className="admin-input" value={quizFormData.titleAr} onChange={e => setQuizFormData({ ...quizFormData, titleAr: e.target.value })} />
                                    </div>
                                    <div className="admin-form-group">
                                        <label>عنوان الاختبار (إنجليزي)</label>
                                        <input className="admin-input" value={quizFormData.title} onChange={e => setQuizFormData({ ...quizFormData, title: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div className="questions-builder-container">
                                <div className="builder-header">
                                    <h3>الأسئلة ({quizFormData.questions.length})</h3>
                                    <button type="button" className="admin-btn-secondary" onClick={addQuestion}><Plus size={16} /> إضافة سؤال</button>
                                </div>
                                <div className="questions-scroll-area">
                                    {quizFormData.questions.map((q, qIdx) => (
                                        <div key={q.id} className="question-edit-card">
                                            <div className="q-card-header">
                                                <span>سؤال #{qIdx + 1}</span>
                                                <button type="button" onClick={() => removeQuestion(q.id)}><Trash2 size={16} /></button>
                                            </div>
                                            <textarea className="admin-input" value={q.questionEn} onChange={e => updateQuestion(q.id, 'questionEn', e.target.value)} rows={2} />
                                            <div className="options-grid">
                                                {q.options.map((opt, oIdx) => (
                                                    <div key={opt.id} className="option-input-group">
                                                        <input type="radio" checked={q.correctAnswer === opt.id} onChange={() => updateQuestion(q.id, 'correctAnswer', opt.id)} />
                                                        <input className="admin-input-compact" value={opt.textEn} onChange={e => {
                                                            const newOptions = [...q.options];
                                                            newOptions[oIdx].textEn = e.target.value;
                                                            updateQuestion(q.id, 'options', newOptions);
                                                        }} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="admin-modal-actions">
                            <button className="admin-btn-secondary" onClick={() => setIsQuizModalOpen(false)}>إلغاء</button>
                            <button className="admin-btn" onClick={handleQuizSubmit}><Save size={18} /> حفظ الاختبار</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminMaterials;
