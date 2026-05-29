import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, query, orderBy, getDocs, doc, runTransaction, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { CheckCircle, Phone, MessageSquare, LogOut, Package, ExternalLink, Search, Clock } from 'lucide-react';
import './CoordinatorPortal.css';

const CoordinatorPortal = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [coordinator, setCoordinator] = useState(null); // 'ali' or 'sara'
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState('all'); // all, contacted, uncontacted
    const [removingIds, setRemovingIds] = useState([]);

    // Hardcoded auth as requested
    const ACCOUNTS = {
        'ali@makanak.com': { id: 'ali', name: 'علي', role: 'تنسيق الذكور', password: 'ali' },
        'sara@makanak.com': { id: 'sara', name: 'سارة', role: 'تنسيق الإناث', password: 'sara' }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        const mail = email.trim().toLowerCase();
        const account = ACCOUNTS[mail];
        if (account && account.password === password) {
            setCoordinator(account);
            fetchAssignments(account.id);
        } else {
            toast.error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }
    };

    const handleLogout = () => {
        setCoordinator(null);
        setEmail('');
        setPassword('');
        setAssignments([]);
    };

    const determineCoordinator = (materialName) => {
        // Fallback if not assigned: default to ali
        return 'ali';
    };

    const logActivity = async (coordId, coordName, actionType, materialName, studentName) => {
        try {
            await addDoc(collection(db, 'coordinatorLogs'), {
                coordinatorId: coordId,
                coordinatorName: coordName,
                actionType, // 'CONTACT' or 'DELIVER' or 'UNCONTACT'
                materialName,
                studentName,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("Failed to log activity", e);
        }
    };

    const fetchAssignments = async (coordId) => {
        setLoading(true);
        try {
            const q = query(collection(db, 'materialDonations'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            const allDonations = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            let processed = [];

            allDonations.forEach(donation => {
                const materials = Array.isArray(donation.materials) ? donation.materials : (donation.itemName ? [donation.itemName] : []);
                
                materials.forEach((m, idx) => {
                    const materialObj = typeof m === 'object' && m !== null ? m : { name: m, status: donation.status || 'pending' };
                    if (!materialObj.status) materialObj.status = donation.status || 'pending';
                    
                    const mName = materialObj.name || '';
                    const assignedTo = materialObj.coordinator || determineCoordinator(mName);
                    
                    // Only fetch reserved materials for this coordinator
                    if (materialObj.status === 'reserved' && assignedTo === coordId && materialObj.takerInfo) {
                        processed.push({
                            donationId: donation.id,
                            materialIndex: idx,
                            uniqueKey: `${donation.id}-${idx}`,
                            materialName: mName,
                            takerName: materialObj.takerInfo.name,
                            takerPhone: materialObj.takerInfo.phone,
                            bookedAt: materialObj.takerInfo.bookedAt || donation.createdAt?.toDate?.()?.toISOString() || null,
                            donorName: donation.studentName,
                            status: materialObj.status,
                            contacted: materialObj.contacted || false,
                        });
                    }
                });
            });

            setAssignments(processed);

        } catch (error) {
            console.error('Error fetching assignments:', error);
            toast.error('حدث خطأ في جلب البيانات');
        }
        setLoading(false);
    };

    const handleMarkContacted = async (donationId, materialIndex, isContacted) => {
        try {
            const donationRef = doc(db, 'materialDonations', donationId);
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(donationRef);
                if (!docSnap.exists()) return;

                const data = docSnap.data();
                const materials = Array.isArray(data.materials) ? [...data.materials] : (data.itemName ? [data.itemName] : []);
                let item = typeof materials[materialIndex] === 'object' ? { ...materials[materialIndex] } : { name: materials[materialIndex], status: 'reserved' };
                
                item.contacted = !isContacted;
                materials[materialIndex] = item;

                transaction.update(donationRef, { materials });
            });
            
            toast.success(isContacted ? 'تم إلغاء التواصل' : 'تم تأكيد التواصل');
            
            const targetItem = assignments.find(a => a.donationId === donationId && a.materialIndex === materialIndex);
            if (targetItem) {
                logActivity(
                    coordinator.id, 
                    coordinator.name, 
                    isContacted ? 'UNCONTACT' : 'CONTACT', 
                    targetItem.materialName, 
                    targetItem.takerName
                );
            }

            fetchAssignments(coordinator.id); // Refresh
        } catch (e) {
            toast.error('فشل في التحديث');
        }
    };

    const triggerDelivery = (donationId, materialIndex, uniqueKey) => {
        const confirm = window.confirm('هل أنت متأكد من تسليم المادة للطالب؟ هذا الإجراء سينهي الطلب.');
        if (!confirm) return;

        // Start animation
        setRemovingIds(prev => [...prev, uniqueKey]);

        // Execute actual removal after animation
        setTimeout(() => {
            handleMarkDelivered(donationId, materialIndex);
        }, 400); // 400ms CSS transition
    };

    const handleMarkDelivered = async (donationId, materialIndex) => {
        try {
            const donationRef = doc(db, 'materialDonations', donationId);
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(donationRef);
                if (!docSnap.exists()) return;

                const data = docSnap.data();
                const materials = Array.isArray(data.materials) ? [...data.materials] : (data.itemName ? [data.itemName] : []);
                let item = typeof materials[materialIndex] === 'object' ? { ...materials[materialIndex] } : { name: materials[materialIndex] };
                
                item.status = 'completed'; // Changed to completed
                materials[materialIndex] = item;

                transaction.update(donationRef, { materials });
            });
            
            toast.success('تم تسليم المادة بنجاح 🚀');

            const targetItem = assignments.find(a => a.donationId === donationId && a.materialIndex === materialIndex);
            if (targetItem) {
                 logActivity(coordinator.id, coordinator.name, 'DELIVER', targetItem.materialName, targetItem.takerName);
            }

            fetchAssignments(coordinator.id); 
            setRemovingIds(prev => prev.filter(k => k !== `${donationId}-${materialIndex}`));
        } catch (e) {
            toast.error('فشل في التحديث');
            setRemovingIds(prev => prev.filter(k => k !== `${donationId}-${materialIndex}`));
        }
    };

    const getWhatsappLink = (phone, receiverName, materialName) => {
        if (!phone) return '';
        const cleanPhone = phone.toString().replace(/[^\d+]/g, '');
        const number = cleanPhone.startsWith('0') ? '962' + cleanPhone.substring(1) : cleanPhone;
        const msg = encodeURIComponent(`مرحباً ${receiverName}، مادتك (${materialName}) جاهزة للاستلام من النادي، يرجى التواصل لتحديد موعد الاستلام.`);
        return `https://wa.me/${number}?text=${msg}`;
    };

    const formatTime = (isoString) => {
        if (!isoString) return '';
        try {
            return new Date(isoString).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        } catch { return ''; }
    };

    const filteredAssignments = assignments.filter(item => {
        const matchesSearch = item.takerName.includes(searchQuery) || item.materialName.includes(searchQuery) || item.donorName.includes(searchQuery);
        const matchesFilter = filterType === 'all' 
            ? true 
            : filterType === 'contacted' ? item.contacted 
            : !item.contacted;
        return matchesSearch && matchesFilter;
    });

    if (!coordinator) {
        return (
            <div className="coord-login-container">
                <div className="coord-blur-bg"></div>
                <div className="coord-login-card">
                    <div className="coord-icon-wrapper">
                        <Package size={48} className="coord-icon" />
                    </div>
                    <h1>بوابة المنسقين</h1>
                    <p>أدخل الرمز الخاص بك للوصول للكشوفات</p>
                    
                    <form onSubmit={handleLogin} className="coord-form">
                        <input
                            type="email"
                            placeholder="البريد الإلكتروني"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="coord-input"
                            required
                        />
                        <input
                            type="password"
                            placeholder="كلمة المرور"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="coord-input"
                            required
                            style={{marginTop: '10px'}}
                        />
                        <button type="submit" className="coord-btn-primary">تسجيل الدخول</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="coord-dashboard">
            <header className="coord-header">
                <div>
                    <h2>مرحباً، {coordinator.name} 👋</h2>
                    <span className="coord-role-badge">{coordinator.role}</span>
                </div>
                <button onClick={handleLogout} className="coord-btn-logout">
                    <LogOut size={20} />
                </button>
            </header>

            <main className="coord-main">
                <div className="coord-stats">
                    <div className="coord-stat-card">
                        <h3>قيد التسليم</h3>
                        <strong>{assignments.length}</strong>
                    </div>
                    <div className="coord-stat-card">
                        <h3>تم التواصل</h3>
                        <strong>{assignments.filter(a => a.contacted).length}</strong>
                    </div>
                </div>

                <div className="coord-controls">
                    <div className="coord-search-box">
                        <Search size={18} className="coord-search-icon" />
                        <input 
                            type="text" 
                            placeholder="ابحث عن طالب أو مادة..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="coord-filters">
                        <button className={`coord-filter-btn ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>الكل</button>
                        <button className={`coord-filter-btn ${filterType === 'uncontacted' ? 'active' : ''}`} onClick={() => setFilterType('uncontacted')}>لم يتم التواصل</button>
                        <button className={`coord-filter-btn ${filterType === 'contacted' ? 'active' : ''}`} onClick={() => setFilterType('contacted')}>تم التواصل</button>
                    </div>
                </div>

                <div className="coord-list-section">
                    <h3>الكشوفات الميدانية ({filteredAssignments.length})</h3>
                    {loading ? (
                        <p className="coord-loading">جاري جلب الكشوفات...</p>
                    ) : filteredAssignments.length === 0 ? (
                        <div className="coord-empty">
                            <CheckCircle size={48} opacity={0.5} />
                            <p>لا يوجد كشوفات مطابقة!</p>
                        </div>
                    ) : (
                        <div className="coord-cards">
                            {filteredAssignments.map((item, idx) => (
                                <div key={item.uniqueKey} className={`coord-task-card ${item.contacted ? 'is-contacted' : ''} ${removingIds.includes(item.uniqueKey) ? 'is-removing' : ''}`}>
                                    <div className="coord-task-header">
                                        <h4>{item.takerName}</h4>
                                        <div className="coord-contacts">
                                            <a href={`tel:${item.takerPhone}`} className="icon-btn call" title="اتصال">
                                                <Phone size={18} />
                                            </a>
                                            <a href={getWhatsappLink(item.takerPhone, item.takerName, item.materialName)} target="_blank" rel="noreferrer" className="icon-btn wa" title="واتساب">
                                                <MessageSquare size={18} />
                                            </a>
                                        </div>
                                    </div>
                                    <div className="coord-task-body">
                                        <p><strong>المادة:</strong> {item.materialName}</p>
                                        <p><strong>المتبرع:</strong> {item.donorName}</p>
                                        {item.bookedAt && (
                                            <p style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '0.8rem', marginTop: '10px' }}>
                                                <Clock size={14} /> تم الحجز: {formatTime(item.bookedAt)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="coord-task-actions">
                                        <button 
                                            className={`coord-btn-outline ${item.contacted ? 'active' : ''}`}
                                            onClick={() => handleMarkContacted(item.donationId, item.materialIndex, item.contacted)}
                                        >
                                            {item.contacted ? 'تم التواصل (' : 'لم يتم التواصل'}
                                            {item.contacted && <CheckCircle size={16} style={{display: 'inline', verticalAlign: 'middle', marginLeft: '4px'}} />}
                                            {item.contacted && ')'}
                                        </button>
                                        <button 
                                            className="coord-btn-success"
                                            onClick={() => triggerDelivery(item.donationId, item.materialIndex, item.uniqueKey)}
                                        >
                                            <CheckCircle size={18} /> تم التسليم
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default CoordinatorPortal;
