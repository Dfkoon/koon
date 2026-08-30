/**
 * Admin Course Status Manager Component
 * For admins to review, approve/reject bookings and donations
 */

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import {
    getPendingBookings,
    getPendingDonations,
    updateBookingStatus,
    updateDonationStatus
} from '../services/courseStatusService';
import toast from 'react-hot-toast';
import './AdminCourseStatusManager.css';

const AdminCourseStatusManager = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [activeTab, setActiveTab] = useState('bookings');
    const [bookings, setBookings] = useState([]);
    const [donations, setDonations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [actioningItem, setActioningItem] = useState(null);
    const [approvalNotes, setApprovalNotes] = useState('');

    useEffect(() => {
        loadPendingItems();
    }, []);

    const loadPendingItems = async () => {
        setLoading(true);
        try {
            const [bookingsRes, donationsRes] = await Promise.all([
                getPendingBookings(),
                getPendingDonations()
            ]);

            if (bookingsRes.success) {
                setBookings(bookingsRes.data);
            }
            if (donationsRes.success) {
                setDonations(donationsRes.data);
            }
        } catch (error) {
            console.error('Error loading pending items:', error);
            toast.error(isAr ? 'خطأ في تحميل الطلبات' : 'Error loading requests');
        } finally {
            setLoading(false);
        }
    };

    const handleApproveBooking = async (bookingId) => {
        try {
            const result = await updateBookingStatus(bookingId, 'approved', {
                name: 'Admin',
                notes: approvalNotes
            });

            if (result.success) {
                toast.success(isAr ? 'تمت الموافقة على الطلب' : 'Request approved');
                setBookings(bookings.filter(b => b.id !== bookingId));
                setApprovalNotes('');
                setActioningItem(null);
            }
        } catch (error) {
            toast.error(isAr ? 'خطأ في الموافقة' : 'Error approving request');
        }
    };

    const handleRejectBooking = async (bookingId) => {
        try {
            const result = await updateBookingStatus(bookingId, 'rejected', {
                name: 'Admin',
                notes: approvalNotes
            });

            if (result.success) {
                toast.success(isAr ? 'تم رفض الطلب' : 'Request rejected');
                setBookings(bookings.filter(b => b.id !== bookingId));
                setApprovalNotes('');
                setActioningItem(null);
            }
        } catch (error) {
            toast.error(isAr ? 'خطأ في الرفض' : 'Error rejecting request');
        }
    };

    const handleApproveDonation = async (donationId) => {
        try {
            const result = await updateDonationStatus(donationId, 'approved', {
                name: 'Admin',
                notes: approvalNotes
            });

            if (result.success) {
                toast.success(isAr ? 'تمت الموافقة على التبرع' : 'Donation approved');
                setDonations(donations.filter(d => d.id !== donationId));
                setApprovalNotes('');
                setActioningItem(null);
            }
        } catch (error) {
            toast.error(isAr ? 'خطأ في الموافقة' : 'Error approving donation');
        }
    };

    const handleRejectDonation = async (donationId) => {
        try {
            const result = await updateDonationStatus(donationId, 'rejected', {
                name: 'Admin',
                notes: approvalNotes
            });

            if (result.success) {
                toast.success(isAr ? 'تم رفض التبرع' : 'Donation rejected');
                setDonations(donations.filter(d => d.id !== donationId));
                setApprovalNotes('');
                setActioningItem(null);
            }
        } catch (error) {
            toast.error(isAr ? 'خطأ في الرفض' : 'Error rejecting donation');
        }
    };

    const BookingRequestCard = ({ booking }) => (
        <div className="request-card">
            <div className="request-header">
                <div>
                    <h3>{booking.courseName}</h3>
                    <p className="student-info">
                        👤 {booking.studentName} | 📱 {booking.phoneNumber}
                    </p>
                </div>
                <span className="request-id">#{booking.id.slice(0, 8)}</span>
            </div>

            <div className="request-details">
                <div className="detail">
                    <span className="label">📚 {isAr ? 'اسم المقرر' : 'Course Name'}</span>
                    <span className="value">{booking.courseName}</span>
                </div>

                {booking.courseCode && (
                    <div className="detail">
                        <span className="label">🔢 {isAr ? 'رمز المقرر' : 'Course Code'}</span>
                        <span className="value">{booking.courseCode}</span>
                    </div>
                )}

                {booking.faculty && (
                    <div className="detail">
                        <span className="label">🏛️ {isAr ? 'الكلي' : 'Faculty'}</span>
                        <span className="value">{booking.faculty}</span>
                    </div>
                )}

                <div className="detail">
                    <span className="label">📅 {isAr ? 'تاريخخ الطلب' : 'Submitted'}</span>
                    <span className="value">
                        {booking.submittedAt?.toLocaleDateString(isAr ? 'ar-IQ' : 'en-US')}
                    </span>
                </div>

                {booking.email && (
                    <div className="detail">
                        <span className="label">📧 {isAr ? 'البريد الإلكتروني' : 'Email'}</span>
                        <span className="value">{booking.email}</span>
                    </div>
                )}
            </div>

            {actioningItem === booking.id ? (
                <div className="approval-section">
                    <textarea
                        placeholder={isAr ? 'أضف ملاحظاتك (اختياري)' : 'Add your notes (optional)'}
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        maxLength={500}
                    />
                    <div className="action-buttons">
                        <button
                            className="btn-approve"
                            onClick={() => handleApproveBooking(booking.id)}
                        >
                            ✅ {isAr ? 'وافق' : 'Approve'}
                        </button>
                        <button
                            className="btn-reject"
                            onClick={() => handleRejectBooking(booking.id)}
                        >
                            ❌ {isAr ? 'رفض' : 'Reject'}
                        </button>
                        <button
                            className="btn-cancel"
                            onClick={() => {
                                setActioningItem(null);
                                setApprovalNotes('');
                            }}
                        >
                            {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    className="btn-review"
                    onClick={() => setActioningItem(booking.id)}
                >
                    🔍 {isAr ? 'مراجع' : 'Review'}
                </button>
            )}
        </div>
    );

    const DonationRequestCard = ({ donation }) => (
        <div className="request-card">
            <div className="request-header">
                <div>
                    <h3>
                        {donation.courseNames?.join(', ') || (isAr ? 'مواد متعدد' : 'Multiple Courses')}
                    </h3>
                    <p className="student-info">
                        👤 {donation.donorName} | 📱 {donation.phoneNumber}
                    </p>
                </div>
                <span className="request-id">#{donation.id.slice(0, 8)}</span>
            </div>

            <div className="request-details">
                <div className="detail">
                    <span className="label">🎓 {isAr ? 'المقررات المختبرع بها' : 'Donated Courses'}</span>
                    <span className="value">
                        {donation.courseNames?.join(', ') || (isAr ? 'غير محدد' : 'Not specified')}
                    </span>
                </div>

                {donation.faculty && (
                    <div className="detail">
                        <span className="label">🏛️ {isAr ? 'الكلي' : 'Faculty'}</span>
                        <span className="value">{donation.faculty}</span>
                    </div>
                )}

                <div className="detail">
                    <span className="label">📅 {isAr ? 'تاريخخ الطلب' : 'Submitted'}</span>
                    <span className="value">
                        {donation.submittedAt?.toLocaleDateString(isAr ? 'ar-IQ' : 'en-US')}
                    </span>
                </div>

                {donation.resourcesOffered && donation.resourcesOffered.length > 0 && (
                    <div className="detail">
                        <span className="label">📦 {isAr ? 'الموارد المقدم' : 'Resources'}</span>
                        <span className="value">{donation.resourcesOffered.join(', ')}</span>
                    </div>
                )}

                {donation.email && (
                    <div className="detail">
                        <span className="label">📧 {isAr ? 'البريد الإلكتروني' : 'Email'}</span>
                        <span className="value">{donation.email}</span>
                    </div>
                )}
            </div>

            {actioningItem === donation.id ? (
                <div className="approval-section">
                    <textarea
                        placeholder={isAr ? 'أضف ملاحظاتك (اختياري)' : 'Add your notes (optional)'}
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        maxLength={500}
                    />
                    <div className="action-buttons">
                        <button
                            className="btn-approve"
                            onClick={() => handleApproveDonation(donation.id)}
                        >
                            ✅ {isAr ? 'وافق' : 'Approve'}
                        </button>
                        <button
                            className="btn-reject"
                            onClick={() => handleRejectDonation(donation.id)}
                        >
                            ❌ {isAr ? 'رفض' : 'Reject'}
                        </button>
                        <button
                            className="btn-cancel"
                            onClick={() => {
                                setActioningItem(null);
                                setApprovalNotes('');
                            }}
                        >
                            {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    className="btn-review"
                    onClick={() => setActioningItem(donation.id)}
                >
                    🔍 {isAr ? 'مراجع' : 'Review'}
                </button>
            )}
        </div>
    );

    return (
        <div className="admin-status-manager">
            <div className="manager-header">
                <h2>⚙️ {isAr ? 'إدار حالات الطلبات' : 'Manage Request Status'}</h2>
                <button
                    className="refresh-btn"
                    onClick={loadPendingItems}
                    disabled={loading}
                >
                    {loading ? '⏳' : '🔄'} {isAr ? 'تحديث' : 'Refresh'}
                </button>
            </div>

            <div className="manager-tabs">
                <button
                    className={`tab ${activeTab === 'bookings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('bookings')}
                >
                    📖 {isAr ? 'الحجوزات' : 'Bookings'}
                    {bookings.length > 0 && <span className="badge">{bookings.length}</span>}
                </button>
                <button
                    className={`tab ${activeTab === 'donations' ? 'active' : ''}`}
                    onClick={() => setActiveTab('donations')}
                >
                    🎁 {isAr ? 'التبرعات' : 'Donations'}
                    {donations.length > 0 && <span className="badge">{donations.length}</span>}
                </button>
            </div>

            <div className="manager-content">
                {activeTab === 'bookings' && (
                    <div className="requests-list">
                        {bookings.length > 0 ? (
                            bookings.map((booking) => (
                                <BookingRequestCard key={booking.id} booking={booking} />
                            ))
                        ) : (
                            <div className="empty-message">
                                ✅ {isAr ? 'لا توجد طلبات معلق' : 'No pending requests'}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'donations' && (
                    <div className="requests-list">
                        {donations.length > 0 ? (
                            donations.map((donation) => (
                                <DonationRequestCard key={donation.id} donation={donation} />
                            ))
                        ) : (
                            <div className="empty-message">
                                ✅ {isAr ? 'لا توجد تبرعات معلق' : 'No pending donations'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminCourseStatusManager;
