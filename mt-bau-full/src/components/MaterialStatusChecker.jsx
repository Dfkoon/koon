import React, { useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    findDonationsByPhone,
    findBookingsByPhone
} from '../utils/exchangeLocalStorage';
import './MaterialStatusChecker.css';

/**
 * Material Status Checker Component
 * Allows users to check the status of their donations and bookings
 * Real-time lookup against Firestore collection 'materialDonations'
 */
const MaterialStatusChecker = ({ isAr }) => {
    const [phoneInput, setPhoneInput] = useState('');
    const [nameInput, setNameInput] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [searching, setSearching] = useState(false);
    const [activeResultTab, setActiveResultTab] = useState('bookings');

    const searchFirestore = async (rawPhone) => {
        const cleanDigits = String(rawPhone).trim().replace(/\D/g, '');
        const basePhone = cleanDigits.replace(/^(00962|962|0)/, '');

        const matchesPhone = (val) => {
            if (!val) return false;
            const testDigits = String(val).trim().replace(/\D/g, '').replace(/^(00962|962|0)/, '');
            if (!testDigits || !basePhone) return false;
            return testDigits === basePhone || testDigits.endsWith(basePhone) || basePhone.endsWith(testDigits);
        };

        const donationsFound = [];
        const bookingsFound = [];

        try {
            const q = query(collection(db, 'materialDonations'), orderBy('createdAt', 'desc'));
            const snapshot = await getDocs(q);

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.deleted) return;

                const isDonor = matchesPhone(data.phoneNumber) || 
                                matchesPhone(data.confirmPhoneNumber) || 
                                matchesPhone(data.alternatePhone) || 
                                matchesPhone(data.donorPhone);

                // 1. إذا كان صاحب الطلب هو المتبرع
                if (isDonor) {
                    const rawMaterials = data.materials || (data.itemName ? [data.itemName] : (data.materialName ? [data.materialName] : []));
                    const studentName = data.studentName || data.donorName || (isAr ? 'طالب متبرع' : 'Donor');

                    if (rawMaterials.length > 0) {
                        const matChips = rawMaterials.map(m => typeof m === 'object' ? (m.name || '') : m).filter(Boolean);
                        let mainStatus = data.status || 'submitted';
                        const hasReserved = rawMaterials.some(m => typeof m === 'object' && (m.status === 'reserved' || m.takerInfo));
                        if (hasReserved) mainStatus = 'booked';

                        donationsFound.push({
                            id: docSnap.id,
                            studentName: studentName,
                            phoneNumber: data.phoneNumber || data.donorPhone || '',
                            materials: matChips,
                            status: mainStatus,
                            submittedAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || new Date().toISOString()
                        });
                    }
                }

                // 2. البحث عن حجوزات (سواء داخل مصفوفة materials أو على مستوى المستند)
                const materialsList = data.materials || [];
                materialsList.forEach((m, idx) => {
                    if (typeof m !== 'object' || !m) return;
                    const taker = m.takerInfo || {};
                    const isBooker = matchesPhone(taker.phone);
                    if (isBooker && (m.status === 'reserved' || m.status === 'completed' || data.status === 'reserved')) {
                        bookingsFound.push({
                            id: `booking-${docSnap.id}-${idx}`,
                            name: taker.name || (isAr ? 'طالب حاجز' : 'Booker'),
                            phoneNumber: taker.phone || '',
                            materialName: m.name || data.materialName || '',
                            donorName: data.studentName || data.donorName || '',
                            donorPhone: data.phoneNumber || data.donorPhone || '',
                            status: m.status === 'completed' ? 'completed' : 'booked',
                            bookedAt: taker.bookedAt?.toDate?.()?.toISOString?.() || taker.bookedAt || data.updatedAt || data.createdAt || new Date().toISOString()
                        });
                    }
                });

                // حجوزات مباشرة تمت من لوحة التحكم
                if (data.bookerPhone && matchesPhone(data.bookerPhone)) {
                    bookingsFound.push({
                        id: `booking-admin-${docSnap.id}`,
                        name: data.bookerName || (isAr ? 'طالب حاجز' : 'Booker'),
                        phoneNumber: data.bookerPhone,
                        materialName: data.materialName || '',
                        donorName: data.donorName || data.studentName || '',
                        donorPhone: data.donorPhone || data.phoneNumber || '',
                        status: data.status === 'completed' ? 'completed' : 'booked',
                        bookedAt: data.bookedAt || data.updatedAt || data.createdAt || new Date().toISOString()
                    });
                }
            });
        } catch (err) {
            console.warn('Firestore lookup error in MaterialStatusChecker:', err);
        }

        // دمج مع الذاكرة المحلية كاحتياط
        try {
            const lsDonations = findDonationsByPhone(cleanDigits);
            lsDonations.forEach(ls => {
                if (!donationsFound.some(d => d.id === ls.id)) {
                    donationsFound.push(ls);
                }
            });
            const lsBookings = findBookingsByPhone(cleanDigits);
            lsBookings.forEach(lb => {
                if (!bookingsFound.some(b => b.materialName === lb.materialName)) {
                    bookingsFound.push(lb);
                }
            });
        } catch (e) {}

        return {
            donations: donationsFound,
            bookings: bookingsFound
        };
    };

    const handleSearch = async (e) => {
        e.preventDefault();

        const cleanPhone = phoneInput.trim().replace(/\D/g, '');
        if (!cleanPhone) {
            alert(isAr ? 'الرجاء إدخال رقم الهاتف المسجل' : 'Please enter your registered phone number');
            return;
        }

        setSearching(true);
        try {
            const results = await searchFirestore(cleanPhone);

            const filteredDonations = results.donations.filter(d =>
                !nameInput.trim() || (d.studentName && d.studentName.toLowerCase().includes(nameInput.toLowerCase()))
            );
            const filteredBookings = results.bookings.filter(b =>
                !nameInput.trim() || (b.name && b.name.toLowerCase().includes(nameInput.toLowerCase()))
            );

            setSearchResults({
                donations: filteredDonations,
                bookings: filteredBookings,
                phone: cleanPhone,
                name: nameInput.trim()
            });

            // اختر التبويب الأنسب تلقائياً
            if (filteredBookings.length > 0) {
                setActiveResultTab('bookings');
            } else if (filteredDonations.length > 0) {
                setActiveResultTab('donations');
            } else {
                setActiveResultTab('bookings');
            }
        } catch (err) {
            console.error('Search error:', err);
        } finally {
            setSearching(false);
            setHasSearched(true);
        }
    };

    const handleClearSearch = () => {
        setPhoneInput('');
        setNameInput('');
        setSearchResults(null);
        setHasSearched(false);
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            pending: { 
                label: isAr ? 'قيد المراجعة والتدقيق' : 'Under Review', 
                bg: 'rgba(217, 119, 6, 0.12)', 
                color: '#d97706' 
            },
            submitted: { 
                label: isAr ? 'قيد المراجعة والتدقيق' : 'Under Review', 
                bg: 'rgba(217, 119, 6, 0.12)', 
                color: '#d97706' 
            },
            approved: { 
                label: isAr ? 'معتمد — جاهز للتسليم' : 'Approved — Ready', 
                bg: 'rgba(37, 99, 235, 0.12)', 
                color: '#2563eb' 
            },
            rejected: { 
                label: isAr ? 'تم الإلغاء / مرفوض' : 'Cancelled / Rejected', 
                bg: 'rgba(220, 38, 38, 0.12)', 
                color: '#dc2626' 
            },
            completed: { 
                label: isAr ? 'مكتمل — تم الاستلام' : 'Completed — Delivered', 
                bg: 'rgba(22, 163, 74, 0.12)', 
                color: '#16a34a' 
            },
            reserved: { 
                label: isAr ? 'محجوز رسمياً' : 'Booked', 
                bg: 'rgba(79, 70, 229, 0.12)', 
                color: '#4f46e5' 
            },
            booked: { 
                label: isAr ? 'محجوز رسمياً' : 'Booked', 
                bg: 'rgba(79, 70, 229, 0.12)', 
                color: '#4f46e5' 
            }
        };

        return statusMap[status] || { 
            label: status, 
            bg: 'rgba(100, 116, 139, 0.12)', 
            color: '#64748b' 
        };
    };

    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString);
            return isAr
                ? date.toLocaleDateString('ar-JO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
        } catch {
            return dateString;
        }
    };

    return (
        <div className="material-status-checker-container">
            {/* Header */}
            <div className="status-checker-header">
                <span className="status-checker-tag">
                    {isAr ? 'الاستعلام الفوري' : 'Live Tracking'}
                </span>
                <h2 className="status-checker-title">
                    {isAr ? 'متابعة حالة طلباتك' : 'Track Your Requests Status'}
                </h2>
                <p className="status-checker-subtitle">
                    {isAr
                        ? 'استعلم عن حالة تبرعاتك بالمواد أو المواد التي قمت بحجزها عبر إدخال رقم هاتفك المسجل'
                        : 'Check the status of your material donations or bookings by entering your registered phone number'}
                </p>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="status-checker-form">
                <div className="status-form-grid">
                    <div className="status-field-group">
                        <label className="status-field-label">
                            <span>{isAr ? 'رقم الهاتف المسجل' : 'Registered Phone Number'}<span className="status-required-mark">*</span></span>
                        </label>
                        <div className="status-phone-group">
                            <span className="status-phone-prefix">
                                +962
                            </span>
                            <input
                                type="tel"
                                className="status-phone-input"
                                placeholder={isAr ? '07XXXXXXXX أو 7XXXXXXXX' : '07XXXXXXXX'}
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                maxLength="10"
                                required
                            />
                        </div>
                    </div>

                    <div className="status-field-group">
                        <label className="status-field-label">
                            <span>{isAr ? 'الاسم الكامل' : 'Full Name'}</span>
                            <span className="status-optional-badge">{isAr ? '(اختياري)' : '(Optional)'}</span>
                        </label>
                        <div className="status-input-wrapper">
                            <input
                                type="text"
                                className="status-text-input"
                                placeholder={isAr ? 'اسم الطالب المسجل في الطلب' : 'Student name in request'}
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="status-actions-row">
                    <button type="submit" className="status-btn-search" disabled={searching}>
                        {searching ? (
                            <span>⏳ {isAr ? 'جاري الاستعلام...' : 'Searching...'}</span>
                        ) : (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <span>{isAr ? 'استعلام عن الحالة' : 'Check Status'}</span>
                            </>
                        )}
                    </button>
                    {hasSearched && (
                        <button type="button" onClick={handleClearSearch} className="status-btn-clear">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                <path d="M21 3v5h-5"></path>
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                <path d="M3 21v-5h5"></path>
                            </svg>
                            <span>{isAr ? 'بحث جديد' : 'New Search'}</span>
                        </button>
                    )}
                </div>
            </form>

            {/* Results Section */}
            {hasSearched && searchResults && (
                <div className="status-results-wrapper">
                    <div className="status-results-header">
                        <h3>{isAr ? 'سجل الطلبات المرتبطة برقمك' : 'Requests Linked to Your Number'}</h3>
                        <span className="status-count-badge">
                            {isAr
                                ? `${searchResults.donations.length + searchResults.bookings.length} طلبات مسجلة`
                                : `${searchResults.donations.length + searchResults.bookings.length} records`}
                        </span>
                    </div>

                    {/* Results Tabs */}
                    <div className="status-tabs-nav">
                        <button
                            type="button"
                            className={`status-tab-btn ${activeResultTab === 'bookings' ? 'active' : ''}`}
                            onClick={() => setActiveResultTab('bookings')}
                        >
                            <span>{isAr ? 'المواد المحجوزة' : 'Booked Materials'}</span>
                            <span className="status-tab-count">{searchResults.bookings.length}</span>
                        </button>
                        <button
                            type="button"
                            className={`status-tab-btn ${activeResultTab === 'donations' ? 'active' : ''}`}
                            onClick={() => setActiveResultTab('donations')}
                        >
                            <span>{isAr ? 'المواد المتبرع بها' : 'Donated Materials'}</span>
                            <span className="status-tab-count">{searchResults.donations.length}</span>
                        </button>
                    </div>

                    {/* Bookings Tab */}
                    {activeResultTab === 'bookings' && (
                        <div className="status-tab-content">
                            {searchResults.bookings.length > 0 ? (
                                <div className="status-cards-grid">
                                    {searchResults.bookings.map((booking, idx) => {
                                        const statusInfo = getStatusBadge(booking.status || 'booked');
                                        return (
                                            <div key={idx} className="status-item-card">
                                                <div className="status-card-top">
                                                    <h4 className="status-card-name">
                                                        {booking.name || (isAr ? 'طالب حاجز' : 'Booker')}
                                                    </h4>
                                                    <span 
                                                        className="status-pill" 
                                                        style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
                                                    >
                                                        <span className="status-pill-dot"></span>
                                                        <span>{statusInfo.label}</span>
                                                    </span>
                                                </div>

                                                <div className="status-card-body">
                                                    <div className="status-info-cell">
                                                        <span className="cell-title">📚 {isAr ? 'المادة المحجوزة' : 'Booked Material'}</span>
                                                        <span className="cell-value" style={{ fontWeight: '700', color: '#38bdf8' }}>{booking.materialName}</span>
                                                    </div>

                                                    <div className="status-info-cell">
                                                        <span className="cell-title">📅 {isAr ? 'تاريخ الحجز' : 'Booking Date'}</span>
                                                        <span className="cell-value">{formatDate(booking.bookedAt)}</span>
                                                    </div>

                                                    {booking.donorName && (
                                                        <div className="status-info-cell">
                                                            <span className="cell-title">👤 {isAr ? 'المتبرع' : 'Donor'}</span>
                                                            <span className="cell-value">{booking.donorName}</span>
                                                        </div>
                                                    )}

                                                    {booking.donorPhone && (
                                                        <div className="status-info-cell">
                                                            <span className="cell-title">📱 {isAr ? 'هاتف المتبرع' : 'Donor Phone'}</span>
                                                            <span className="cell-value" dir="ltr">{booking.donorPhone}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="status-empty-box">
                                    <h4>{isAr ? 'لا توجد حجوزات مسجلة بهذا الرقم' : 'No bookings found'}</h4>
                                    <p>{isAr ? 'تأكد من كتابة نفس رقم الهاتف الذي استخدمته عند إتمام حجز المادة.' : 'Please ensure you entered the same phone number used when booking.'}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Donations Tab */}
                    {activeResultTab === 'donations' && (
                        <div className="status-tab-content">
                            {searchResults.donations.length > 0 ? (
                                <div className="status-cards-grid">
                                    {searchResults.donations.map((donation, idx) => {
                                        const statusInfo = getStatusBadge(donation.status || 'submitted');
                                        return (
                                            <div key={idx} className="status-item-card">
                                                <div className="status-card-top">
                                                    <h4 className="status-card-name">
                                                        {donation.studentName}
                                                    </h4>
                                                    <span 
                                                        className="status-pill" 
                                                        style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}
                                                    >
                                                        <span className="status-pill-dot"></span>
                                                        <span>{statusInfo.label}</span>
                                                    </span>
                                                </div>

                                                <div className="status-card-body">
                                                    <div className="status-info-cell">
                                                        <span className="cell-title">📱 {isAr ? 'رقم الهاتف' : 'Phone'}</span>
                                                        <span className="cell-value" dir="ltr">{donation.phoneNumber || '—'}</span>
                                                    </div>

                                                    <div className="status-info-cell">
                                                        <span className="cell-title">📅 {isAr ? 'تاريخ التقديم' : 'Submitted Date'}</span>
                                                        <span className="cell-value">{formatDate(donation.submittedAt)}</span>
                                                    </div>

                                                    <div className="status-info-cell" style={{ gridColumn: '1 / -1' }}>
                                                        <span className="cell-title">📚 {isAr ? 'المواد المدرجة بالتبرع' : 'Donated Materials'}</span>
                                                        <div className="status-materials-tags">
                                                            {donation.materials && donation.materials.length > 0 ? (
                                                                donation.materials.map((material, mIdx) => (
                                                                    <span key={mIdx} className="status-material-chip">
                                                                        {material.name || material}
                                                                    </span>
                                                                ))
                                                            ) : (
                                                                <span className="cell-value">{isAr ? 'غير محدد' : 'None'}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="status-empty-box">
                                    <h4>{isAr ? 'لا توجد تبرعات مسجلة بهذا الرقم' : 'No donations found'}</h4>
                                    <p>{isAr ? 'تأكد من كتابة نفس رقم الهاتف الذي استخدمته عند إرسال نموذج التبرع.' : 'Please ensure you entered the same phone number used during submission.'}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notice Banner */}
                    <div className="status-notice-banner">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        <span>
                            {isAr
                                ? 'سيقوم منسقو الحملة بالتواصل معك عبر الواتساب فور تحديث مرحلة التسليم أو الاستلام.'
                                : 'Campaign coordinators will contact you via WhatsApp once handover details are updated.'}
                        </span>
                    </div>
                </div>
            )}

            {/* No Results Overall */}
            {hasSearched && searchResults && (searchResults.donations.length === 0 && searchResults.bookings.length === 0) && (
                <div className="status-empty-box" style={{ marginTop: '1.5rem' }}>
                    <h4>{isAr ? 'لم يتم العثور على أي طلبات مسجلة' : 'No Registered Requests Found'}</h4>
                    <p>
                        {isAr
                            ? 'لم نجد أي تبرع أو حجز مرتبط برقم الهاتف المدخل. يرجى التأكد من صحة الرقم والمحاولة مجدداً.'
                            : 'No donations or bookings found for the entered phone number. Please check the number and try again.'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default MaterialStatusChecker;
