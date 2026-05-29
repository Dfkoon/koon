import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { Clock, CheckCircle, Phone, PhoneOff, ArrowRight } from 'lucide-react';
import './AdminCoordinatorsLog.css';

const AdminCoordinatorsLog = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'coordinatorLogs'), orderBy('timestamp', 'desc'), limit(100));
            const snap = await getDocs(q);
            setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const formatTime = (timestamp) => {
        if (!timestamp) return 'غير متوفر';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
    };

    const getActionProps = (action) => {
        switch (action) {
            case 'DELIVER': return { text: 'قام بتسليم المادة', icon: <CheckCircle size={18} />, className: 'log-deliver' };
            case 'CONTACT': return { text: 'قام بتأكيد التواصل مع الطالب', icon: <Phone size={18} />, className: 'log-contact' };
            case 'UNCONTACT': return { text: 'قام بإلغاء التواصل', icon: <PhoneOff size={18} />, className: 'log-uncontact' };
            default: return { text: 'إجراء غير معروف', icon: <ArrowRight size={18} />, className: '' };
        }
    };

    return (
        <div className="admin-page-container coordinators-log-page">
            <div className="admin-page-header admin-header-flex">
                <div>
                    <h1>مراقبة أعمال المنسقين</h1>
                    <p>سجل حي يعرض كل حركات وإجراءات المنسقين الميدانيين (تسليم، اتصال).</p>
                </div>
                <button className="refresh-btn" onClick={fetchLogs}>
                    تحديث السجل <Clock size={16} style={{marginRight: '6px'}}/>
                </button>
            </div>

            <div className="admin-card">
                <div className="card-header">
                    <h2>آخر 100 حركة مسجلة</h2>
                </div>
                {loading ? (
                    <p style={{padding: '20px', textAlign: 'center', color: 'var(--admin-text-muted)'}}>جاري جلب السجل...</p>
                ) : logs.length === 0 ? (
                    <p className="empty-log-msg">لا يوجد أي حركات مسجلة حتى الآن.</p>
                ) : (
                    <div className="logs-timeline">
                        {logs.map((log) => {
                            const { text, icon, className } = getActionProps(log.actionType);
                            return (
                                <div key={log.id} className={`log-entry ${className}`}>
                                    <div className="log-time">{formatTime(log.timestamp)}</div>
                                    <div className="log-icon">{icon}</div>
                                    <div className="log-content">
                                        <div className="log-title">
                                            <strong>المُنسق {log.coordinatorName}</strong>
                                            <span className="action-text">{text}</span>
                                        </div>
                                        <p>المادة: <strong>{log.materialName}</strong> للطلبة <strong>{log.studentName}</strong></p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminCoordinatorsLog;
