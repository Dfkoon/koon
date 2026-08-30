import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import './AdminCoordinatorApplications.css';

export default function AdminCoordinatorApplications() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'coordinatorApplications'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setApplications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error('Error fetching coordinator applications:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleDelete = async (appId) => {
        if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا الطلب نهائياً؟' : 'Are you sure you want to delete this application permanently?')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'coordinatorApplications', appId));
            toast.success(isAr ? 'تم حذف الطلب بنجاح' : 'Application deleted successfully');
        } catch (error) {
            console.error('Error deleting coordinator application:', error);
            toast.error(isAr ? 'فشل حذف الطلب' : 'Failed to delete application');
        }
    };

    const filteredApplications = applications.filter((app) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
            app.name?.toLowerCase().includes(q) ||
            app.email?.toLowerCase().includes(q) ||
            app.phoneNumber?.includes(q) ||
            app.motivation?.toLowerCase().includes(q)
        );
    });

    const formatDate = (timestamp) => {
        if (!timestamp) return '—';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('ar-JO', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="aca-container">
            <div className="aca-header">
                <div>
                    <h2>{isAr ? 'طلبات الانضمام لفريق التنسيق' : 'Coordinator Applications'}</h2>
                    <p>{isAr ? 'استعرض الطلبات المرسل من الطلاب للانضمام إلى فريق التنسيق وتابعها مباشر من لوح الإدار.' : 'Review applications submitted by students to join the coordination team.'}</p>
                </div>
                <div className="aca-summary">
                    <span>{isAr ? 'الإجمالي' : 'Total'}: <strong>{applications.length}</strong></span>
                    <span>{isAr ? 'المفلتر' : 'Filtered'}: <strong>{filteredApplications.length}</strong></span>
                </div>
            </div>

            <div className="aca-toolbar">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isAr ? 'ابحث بالاسم أو البريد أو رقم الهاتف أو الدافع...' : 'Search by name, email, phone, or motivation...'}
                    className="aca-search-input"
                />
            </div>

            {loading ? (
                <div className="aca-empty">{isAr ? 'جاري تحميل الطلبات...' : 'Loading applications...'}</div>
            ) : filteredApplications.length === 0 ? (
                <div className="aca-empty">{isAr ? 'لا توجد طلبات مطابق حالياً' : 'No matching applications found'}</div>
            ) : (
                <div className="aca-table-wrap">
                    <table className="aca-table">
                        <thead>
                            <tr>
                                <th>{isAr ? 'الاسم' : 'Name'}</th>
                                <th>{isAr ? 'الهاتف' : 'Phone'}</th>
                                <th>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                                <th>{isAr ? 'الدافع' : 'Motivation'}</th>
                                <th>{isAr ? 'تاريخخ التقديم' : 'Submitted'}</th>
                                <th>{isAr ? 'إجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredApplications.map((app) => (
                                <tr key={app.id}>
                                    <td>{app.name || '—'}</td>
                                    <td>{app.phoneNumber || '—'}</td>
                                    <td>{app.email || '—'}</td>
                                    <td className="aca-motivation-cell">{app.motivation || '—'}</td>
                                    <td>{formatDate(app.createdAt)}</td>
                                    <td>
                                        <button className="aca-delete-btn" onClick={() => handleDelete(app.id)}>
                                            {isAr ? 'حذف' : 'Delete'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
