/**
 * Course Status Checker Component
 * Allows students to check status of their bookings and donations
 */

import React, { useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useLanguage } from '../contexts/LanguageContext';
import { searchBookingsByPhone, searchDonationsByPhone } from '../services/courseStatusService';
import toast from 'react-hot-toast';
import './CourseStatusChecker.css';

const CourseStatusChecker = ({ isOpen, onClose }) => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [phoneNumber, setPhoneNumber] = useState('');
    const [fullName, setFullName] = useState('');
    const [activeTab, setActiveTab] = useState('bookings');
    const [bookingResults, setBookingResults] = useState(null);
    const [donationResults, setDonationResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [isEnabled, setIsEnabled] = useState(true);

    React.useEffect(() => {
        let isMounted = true;

        getDoc(doc(db, 'system_configs', 'global_settings'))
            .then((snapshot) => {
                if (!isMounted || !snapshot.exists()) return;
                const setting = snapshot.data().material_status_checker_enabled;
                setIsEnabled(setting !== false && setting !== '0');
            })
            .catch((error) => console.warn('Failed to load material status checker setting:', error));

        return () => {
            isMounted = false;
        };
    }, []);

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved':
                return '#27ae60';
            case 'pending':
                return '#f39c12';
            case 'rejected':
                return '#e74c3c';
            default:
                return '#95a5a6';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'approved':
                return '✅';
            case 'pending':
                return '⏳';
            case 'rejected':
                return '❌';
            default:
                return '📋';
        }
    };

    const getStatusText = (status) => {
        const statusLabels = {
            approved: { ar: 'موافق عليه', en: 'Approved' },
            pending: { ar: 'قيد الانتظار', en: 'Pending' },
            rejected: { ar: 'مرفوض', en: 'Rejected' }
        };
        return statusLabels[status]?.[isAr ? 'ar' : 'en'] || status;
    };

    const handleSearch = async (e) => {
        e.preventDefault();

        if (!phoneNumber.trim()) {
            toast.error(isAr ? 'الرجاء إدخال رقم الهاتف' : 'Please enter your phone number');
            return;
        }

        setLoading(true);
        setSearched(true);

        try {
            // Search both bookings and donations in parallel
            const [bookingsRes, donationsRes] = await Promise.all([
                searchBookingsByPhone(phoneNumber),
                searchDonationsByPhone(phoneNumber)
            ]);

            setBookingResults(bookingsRes.success ? bookingsRes.data : []);
            setDonationResults(donationsRes.success ? donationsRes.data : []);

            if (!bookingsRes.success && !donationsRes.success) {
                toast.error(isAr ? 'خطأ في البحث' : 'Error searching');
            }
        } catch (error) {
            console.error('Search error:', error);
            toast.error(isAr ? 'حدث خطأ أثناء البحث' : 'An error occurred during search');
        } finally {
            setLoading(false);
        }
    };

    const handleNewSearch = () => {
        setPhoneNumber('');
        setFullName('');
        setBookingResults(null);
        setDonationResults(null);
        setSearched(false);
        setActiveTab('bookings');
    };

    const BookingCard = ({ booking }) => (
        <div className="status-card">
            <div className="status-header">
                <h3>{booking.courseName}</h3>
                <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(booking.status) }}
                >
                    {getStatusIcon(booking.status)} {getStatusText(booking.status)}
                </span>
            </div>

            <div className="status-details">
                <div className="detail-item">
                    <span className="label">📚 {isAr ? 'اسم المقرر' : 'Course Name'}</span>
                    <span className="value">{booking.courseName}</span>
                </div>

                {booking.courseCode && (
                    <div className="detail-item">
                        <span className="label">🔢 {isAr ? 'رمز المقرر' : 'Course Code'}</span>
                        <span className="value">{booking.courseCode}</span>
                    </div>
                )}

                {booking.faculty && (
                    <div className="detail-item">
                        <span className="label">🏛️ {isAr ? 'الكلي' : 'Faculty'}</span>
                        <span className="value">{booking.faculty}</span>
                    </div>
                )}

                <div className="detail-item">
                    <span className="label">📅 {isAr ? 'تاريخخ الطلب' : 'Submitted Date'}</span>
                    <span className="value">
                        {booking.submittedAt?.toLocaleDateString(isAr ? 'ar-IQ' : 'en-US')}
                    </span>
                </div>

                {booking.approvedAt && (
                    <div className="detail-item">
                        <span className="label">✔️ {isAr ? 'تاريخخ الموافقة' : 'Approval Date'}</span>
                        <span className="value">
                            {booking.approvedAt.toLocaleDateString(isAr ? 'ar-IQ' : 'en-US')}
                        </span>
                    </div>
                )}

                {booking.approvedBy && (
                    <div className="detail-item">
                        <span className="label">👤 {isAr ? 'وافق من قبل' : 'Approved By'}</span>
                        <span className="value">{booking.approvedBy}</span>
                    </div>
                )}

                {booking.notes && (
                    <div className="detail-item">
                        <span className="label">📝 {isAr ? 'ملاحظات' : 'Notes'}</span>
                        <span className="value note">{booking.notes}</span>
                    </div>
                )}
            </div>
        </div>
    );

    const DonationCard = ({ donation }) => {
        const courseNamesText = donation.courseNames?.join(', ');

        return (
            <div className="status-card">
                <div className="status-header">
                    <h3>{courseNamesText ? courseNamesText : isAr ? 'مواد متعدد' : 'Multiple Courses'}</h3>
                    <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(donation.status) }}
                    >
                        {getStatusIcon(donation.status)} {getStatusText(donation.status)}
                    </span>
                </div>

                <div className="status-details">
                    <div className="detail-item">
                        <span className="label">🎓 {isAr ? 'المقررات المختبرع بها' : 'Donated Courses'}</span>
                        <span className="value">
                            {courseNamesText ? courseNamesText : isAr ? 'غير محدد' : 'Not specified'}
                        </span>
                    </div>

                    {donation.faculty && (
                        <div className="detail-item">
                            <span className="label">🏛️ {isAr ? 'الكلي' : 'Faculty'}</span>
                            <span className="value">{donation.faculty}</span>
                        </div>
                    )}

                    <div className="detail-item">
                        <span className="label">📅 {isAr ? 'تاريخخ الطلب' : 'Submitted Date'}</span>
                        <span className="value">
                            {donation.submittedAt?.toLocaleDateString(isAr ? 'ar-IQ' : 'en-US')}
                        </span>
                    </div>

                    {donation.resourcesOffered && donation.resourcesOffered.length > 0 && (
                        <div className="detail-item">
                            <span className="label">📦 {isAr ? 'الموارد المقدم' : 'Resources Offered'}</span>
                            <span className="value">
                                {donation.resourcesOffered.join(', ')}
                            </span>
                        </div>
                    )}

                    {donation.approvedAt && (
                        <div className="detail-item">
                            <span className="label">✔️ {isAr ? 'تاريخخ الموافقة' : 'Approval Date'}</span>
                            <span className="value">
                                {donation.approvedAt.toLocaleDateString(isAr ? 'ar-IQ' : 'en-US')}
                            </span>
                        </div>
                    )}

                    {donation.approvedBy && (
                        <div className="detail-item">
                            <span className="label">👤 {isAr ? 'وافق من قبل' : 'Approved By'}</span>
                            <span className="value">{donation.approvedBy}</span>
                        </div>
                    )}

                    {donation.notes && (
                        <div className="detail-item">
                            <span className="label">📝 {isAr ? 'ملاحظات' : 'Notes'}</span>
                            <span className="value note">{donation.notes}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (!isOpen || !isEnabled) return null;

    return (
        <div className="course-status-checker-overlay" onClick={onClose}>
            <div
                className="status-checker-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <button className="close-modal" onClick={onClose}>×</button>

                <div className="modal-header">
                    <h2>📊 {isAr ? 'فحص حال المقررات' : 'Course Status Checker'}</h2>
                    <p>
                        {isAr
                            ? 'تحقق من حالة الموافقة على مقرراتك المحجوزة والمختبرع بها'
                            : 'Check the approval status of your booked and donated courses'}
                    </p>
                </div>

                {!searched ? (
                    <form onSubmit={handleSearch} className="status-search-form">
                        <div className="form-group">
                            <label>📱 {isAr ? 'رقم الهاتف' : 'Phone Number'}</label>
                            <input
                                type="tel"
                                placeholder={isAr ? '0790000000' : '0790000000'}
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                maxLength="10"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>👤 {isAr ? 'اسمك الكامل (اختياري)' : 'Full Name (Optional)'}</label>
                            <input
                                type="text"
                                placeholder={isAr ? 'أحمد محمد' : 'Ahmed Mohammed'}
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                            />
                        </div>

                        <button
                            type="submit"
                            className="submit-btn"
                            disabled={loading}
                        >
                            {loading ? (
                                <>⏳ {isAr ? 'جاري البحث...' : 'Searching...'}</>
                            ) : (
                                <>🔍 {isAr ? 'بحث' : 'Search'}</>
                            )}
                        </button>
                    </form>
                ) : (
                    <>
                        <div className="search-results-header">
                            <p>
                                {isAr ? 'النتائج لـ: ' : 'Results for: '}
                                <strong>{phoneNumber}</strong>
                            </p>
                            <button
                                className="new-search-btn"
                                onClick={handleNewSearch}
                            >
                                {isAr ? '← بحث جديد' : '← New Search'}
                            </button>
                        </div>

                        <div className="status-tabs">
                            <button
                                className={`tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
                                onClick={() => setActiveTab('bookings')}
                            >
                                📖 {isAr ? 'الحجوزات' : 'Bookings'}
                                {bookingResults?.length > 0 && <span className="count">{bookingResults.length}</span>}
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'donations' ? 'active' : ''}`}
                                onClick={() => setActiveTab('donations')}
                            >
                                🎁 {isAr ? 'التبرعات' : 'Donations'}
                                {donationResults?.length > 0 && <span className="count">{donationResults.length}</span>}
                            </button>
                        </div>

                        <div className="results-container">
                            {activeTab === 'bookings' && (
                                <div className="results-section">
                                    {bookingResults?.length > 0 ? (
                                        <div className="cards-grid">
                                            {bookingResults.map((booking) => (
                                                <BookingCard key={booking.id} booking={booking} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <p>📭 {isAr ? 'لا توجد حجوزات' : 'No bookings found'}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'donations' && (
                                <div className="results-section">
                                    {donationResults?.length > 0 ? (
                                        <div className="cards-grid">
                                            {donationResults.map((donation) => (
                                                <DonationCard key={donation.id} donation={donation} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="empty-state">
                                            <p>📭 {isAr ? 'لا توجد تبرعات' : 'No donations found'}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CourseStatusChecker;
