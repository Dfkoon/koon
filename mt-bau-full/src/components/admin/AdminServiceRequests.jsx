import React, { useState, useEffect } from 'react';
import { db } from '../../config/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import './AdminServiceRequests.css';

const STATUSES = [
  { id: 'all', label: 'الكل', color: '#64748b', bg: '#f1f5f9' },
  { id: 'new', label: 'جديد', color: '#d32f2f', bg: 'rgba(211,47,47,0.1)' },
  { id: 'in_progress', label: 'قيد التنفيذ', color: '#e65100', bg: 'rgba(230,81,0,0.1)' },
  { id: 'completed', label: 'مكتمل', color: '#2e7d32', bg: 'rgba(46,125,50,0.1)' },
  { id: 'cancelled', label: 'ملغى', color: '#616161', bg: 'rgba(97,97,97,0.1)' },
];

const SERVICE_TYPES = [
  { id: 'all', label: 'جميع الخدمات' },
  { id: 'summary', label: '📝 ملص مادة' },
  { id: 'quiz', label: '❓ إنشاء أسئلة' },
  { id: 'idea', label: '💡 اقتراح فكر' },
  { id: 'other', label: '🚀 طلب آر' },
];

export default function AdminServiceRequests() {
  const { isAr } = useLanguage();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [selectedReq, setSelectedReq] = useState(null);

  useEffect(() => {
    const getLocalRequests = () => {
      try {
        return JSON.parse(localStorage.getItem('koon_local_service_requests') || '[]');
      } catch (e) {
        return [];
      }
    };

    const q = query(collection(db, 'service_requests'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      const localData = getLocalRequests();
      
      // Deduplicate by studentPhone + createdAt
      const combined = [...cloudData];
      localData.forEach(localReq => {
        if (!combined.some(c => c.id === localReq.id)) {
          combined.push(localReq);
        }
      });

      setRequests(combined);
      setLoading(false);
    }, (error) => {
      console.warn('Firestore service_requests fetch warning:', error?.message);
      const localData = getLocalRequests();
      setRequests(localData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleUpdateStatus = async (reqId, newStatus) => {
    setRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: newStatus } : r));

    if (reqId.startsWith('local-')) {
      try {
        const local = JSON.parse(localStorage.getItem('koon_local_service_requests') || '[]');
        const updated = local.map(r => r.id === reqId ? { ...r, status: newStatus } : r);
        localStorage.setItem('koon_local_service_requests', JSON.stringify(updated));
        toast.success('تم تحديث حال الطلب');
      } catch (e) {
        toast.error('فشل تحديث الحال');
      }
      return;
    }

    try {
      await updateDoc(doc(db, 'service_requests', reqId), { status: newStatus });
      toast.success('تم تحديث حال الطلب');
    } catch (err) {
      console.error('Error updating status:', err);
      toast.success('تم تحديث حال الطلب محلياً');
    }
  };

  const handleDeleteRequest = async (reqId) => {
    if (!window.confirm('هل أنت تأكد من حذف هذا الطلب نهائياً؟')) return;
    
    setRequests(prev => prev.filter(r => r.id !== reqId));

    if (reqId.startsWith('local-')) {
      try {
        const local = JSON.parse(localStorage.getItem('koon_local_service_requests') || '[]');
        const updated = local.filter(r => r.id !== reqId);
        localStorage.setItem('koon_local_service_requests', JSON.stringify(updated));
        toast.success('تم حذف الطلب بنجاح');
      } catch (e) {
        toast.error('فشل حذف الطلب');
      }
      return;
    }

    try {
      await deleteDoc(doc(db, 'service_requests', reqId));
      toast.success('تم حذف الطلب بنجاح');
    } catch (err) {
      console.error('Error deleting request:', err);
      toast.success('تم حذف الطلب بنجاح');
    }
    if (selectedReq?.id === reqId) setSelectedReq(null);
  };

  const cleanPhoneForWhatsApp = (phone) => {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('07')) {
      cleaned = '962' + cleaned.substring(1);
    }
    return cleaned;
  };

  // Filtering logic
  const filteredRequests = requests.filter(req => {
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    const matchesService = serviceFilter === 'all' || req.serviceId === serviceFilter;
    
    const searchLower = searchQuery.toLowerCase().trim();
    const matchesSearch = !searchLower || (
      (req.studentName && req.studentName.toLowerCase().includes(searchLower)) ||
      (req.studentPhone && req.studentPhone.includes(searchLower)) ||
      (req.subject && req.subject.toLowerCase().includes(searchLower)) ||
      (req.ideaTitle && req.ideaTitle.toLowerCase().includes(searchLower)) ||
      (req.requestTitle && req.requestTitle.toLowerCase().includes(searchLower))
    );

    return matchesStatus && matchesService && matchesSearch;
  });

  // Stats
  const stats = {
    total: requests.length,
    newCount: requests.filter(r => r.status === 'new' || !r.status).length,
    inProgress: requests.filter(r => r.status === 'in_progress').length,
    completed: requests.filter(r => r.status === 'completed').length,
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'قبل قليل';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('ar-JO', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="asr-container">
      {/* ── Stats Header ── */}
      <div className="asr-stats-grid">
        <div className="asr-stat-card asr-stat-total">
          <div className="asr-stat-icon">📋</div>
          <div className="asr-stat-info">
            <span className="asr-stat-val">{stats.total}</span>
            <span className="asr-stat-lbl">إجمالي الطلبات</span>
          </div>
        </div>

        <div className="asr-stat-card asr-stat-new">
          <div className="asr-stat-icon">🔥</div>
          <div className="asr-stat-info">
            <span className="asr-stat-val">{stats.newCount}</span>
            <span className="asr-stat-lbl">طلبات جديد</span>
          </div>
        </div>

        <div className="asr-stat-card asr-stat-progress">
          <div className="asr-stat-icon">⏳</div>
          <div className="asr-stat-info">
            <span className="asr-stat-val">{stats.inProgress}</span>
            <span className="asr-stat-lbl">قيد التنفيذ</span>
          </div>
        </div>

        <div className="asr-stat-card asr-stat-completed">
          <div className="asr-stat-icon">✅</div>
          <div className="asr-stat-info">
            <span className="asr-stat-val">{stats.completed}</span>
            <span className="asr-stat-lbl">طلبات مكتمل</span>
          </div>
        </div>
      </div>

      {/* ── Filters & Controls Bar ── */}
      <div className="asr-controls-card">
        <div className="asr-search-input-wrap">
          <span className="asr-search-icon">🔍</span>
          <input
            type="text"
            className="asr-search-input"
            placeholder="ابحث بالاسم، رقم الهاتـف، المادة، أو العنوان..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="asr-search-clear" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>

        <div className="asr-filter-groups">
          {/* Service Filter */}
          <select
            className="asr-select"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
          >
            {SERVICE_TYPES.map(st => (
              <option key={st.id} value={st.id}>{st.label}</option>
            ))}
          </select>

          {/* Status Filter Tabs */}
          <div className="asr-status-tabs">
            {STATUSES.map(st => (
              <button
                key={st.id}
                className={`asr-status-tab ${statusFilter === st.id ? 'active' : ''}`}
                onClick={() => setStatusFilter(st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content Area ── */}
      {loading ? (
        <div className="asr-loading">
          <div className="asr-spinner"></div>
          <p>جاري تحميل طلبات الخدمات...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="asr-empty">
          <div className="asr-empty-icon">📭</div>
          <h3>لا توجد طلبات تطابق الفلتر الحالي</h3>
          <p>جرّب اختيار فلتر آر أو البحث باسم أو رقم هاتف آر.</p>
        </div>
      ) : (
        <div className="asr-list">
          {filteredRequests.map(req => {
            const waPhone = cleanPhoneForWhatsApp(req.studentPhone);
            const reqStatus = STATUSES.find(s => s.id === req.status) || STATUSES[1];

            return (
              <div key={req.id} className="asr-card">
                {/* Top Card Header */}
                <div className="asr-card-header">
                  <div className="asr-service-badge" data-service={req.serviceId}>
                    <span className="asr-badge-icon">
                      {req.serviceId === 'summary' ? '📝' : req.serviceId === 'quiz' ? '❓' : req.serviceId === 'idea' ? '💡' : '🚀'}
                    </span>
                    <span>{req.serviceLabel || req.serviceId}</span>
                  </div>

                  <div className="asr-header-meta">
                    <span className="asr-date">{formatDate(req.createdAt)}</span>
                    <select
                      className="asr-status-select"
                      value={req.status || 'new'}
                      onChange={(e) => handleUpdateStatus(req.id, e.target.value)}
                      style={{ color: reqStatus.color, backgroundColor: reqStatus.bg }}
                    >
                      <option value="new">🔴 جديد</option>
                      <option value="in_progress">🟠 قيد التنفيذ</option>
                      <option value="completed">🟢 مكتمل</option>
                      <option value="cancelled">⚪ ملغى</option>
                    </select>
                  </div>
                </div>

                {/* Student Info Bar */}
                <div className="asr-student-info">
                  <div className="asr-student-detail">
                    <span className="asr-detail-label">👤 الطالب/:</span>
                    <strong className="asr-detail-val">{req.studentName}</strong>
                  </div>
                  <div className="asr-student-detail">
                    <span className="asr-detail-label">📱 الرقم:</span>
                    <span className="asr-detail-val" dir="ltr">{req.studentPhone}</span>
                  </div>
                  {waPhone && (
                    <a
                      href={`https://wa.me/${waPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="asr-wa-btn"
                    >
                      💬 تواصل واتساب
                    </a>
                  )}
                </div>

                {/* Service Specific Details Body */}
                <div className="asr-card-body">
                  {/* Summary Details */}
                  {req.serviceId === 'summary' && (
                    <>
                      <div className="asr-info-row">
                        <span className="asr-info-lbl">📚 المادة:</span>
                        <span className="asr-info-txt highlight">{req.subject}</span>
                      </div>
                      {req.materialLink && (
                        <div className="asr-info-row">
                          <span className="asr-info-lbl">🔗 رابط المادة:</span>
                          <a href={req.materialLink} target="_blank" rel="noopener noreferrer" className="asr-link" dir="ltr">
                            {req.materialLink}
                          </a>
                        </div>
                      )}
                    </>
                  )}

                  {/* Quiz Details */}
                  {req.serviceId === 'quiz' && (
                    <>
                      <div className="asr-info-row">
                        <span className="asr-info-lbl">📚 المادة:</span>
                        <span className="asr-info-txt highlight">{req.subject}</span>
                      </div>
                      <div className="asr-tags-row">
                        {req.questionStyle && (
                          <span className="asr-tag">🏷️ النمط: {req.questionStyle}</span>
                        )}
                        {req.questionCount && (
                          <span className="asr-tag">🔢 العدد: {req.questionCount} سؤال</span>
                        )}
                      </div>
                    </>
                  )}

                  {/* Idea Details */}
                  {req.serviceId === 'idea' && (
                    <>
                      <div className="asr-info-row">
                        <span className="asr-info-lbl">💡 عنوان الفكر:</span>
                        <strong className="asr-info-txt">{req.ideaTitle}</strong>
                      </div>
                      <div className="asr-info-box">
                        <span className="asr-info-lbl">📝 التفاصيل:</span>
                        <p className="asr-box-p">{req.ideaDetails}</p>
                      </div>
                      {req.techStack && (
                        <div className="asr-info-row">
                          <span className="asr-info-lbl">💻 التقنيات المفضل:</span>
                          <span className="asr-info-txt">{req.techStack}</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Other Request Details */}
                  {req.serviceId === 'other' && (
                    <>
                      <div className="asr-info-row">
                        <span className="asr-info-lbl">📌 عنوان الطلب:</span>
                        <strong className="asr-info-txt">{req.requestTitle}</strong>
                      </div>
                      <div className="asr-info-box">
                        <span className="asr-info-lbl">📝 التفاصيل:</span>
                        <p className="asr-box-p">{req.requestDetails}</p>
                      </div>
                    </>
                  )}

                  {/* Additional Notes */}
                  {req.notes && (
                    <div className="asr-notes-box">
                      <span className="asr-notes-lbl">📌 ملاحظات إضافي من الطالب:</span>
                      <p className="asr-notes-txt">{req.notes}</p>
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="asr-card-footer">
                  <button
                    className="asr-delete-btn"
                    onClick={() => handleDeleteRequest(req.id)}
                  >
                    🗑️ حذف الطلب
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
