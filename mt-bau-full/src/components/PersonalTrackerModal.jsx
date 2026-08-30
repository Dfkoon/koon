import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    getUserProfile,
    findDonationsByPhone,
    findBookingsByPhone
} from '../utils/exchangeLocalStorage';

/**
 * Personal Tracker Component
 * Allows students to track their donations and bookings
 */
const PersonalTrackerModal = ({ isOpen, onClose, isAr }) => {
    const [isEnabled, setIsEnabled] = useState(true);
    const [activeTab, setActiveTab] = useState('donations');
    const [phoneInput, setPhoneInput] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [savedProfile, setSavedProfile] = useState(null);

    useEffect(() => {
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

    useEffect(() => {
        const profile = getUserProfile();
        if (profile) {
            setSavedProfile(profile);
            setPhoneInput(profile.phone);
        }
    }, [isOpen]);

    const handleSearch = () => {
        if (!phoneInput.trim()) {
            alert(isAr ? 'الرجاء إدخال رقم الهاتف' : 'Please enter your phone number');
            return;
        }

        setSearching(true);
        try {
            const donations = findDonationsByPhone(phoneInput);
            const bookings = findBookingsByPhone(phoneInput);
            setSearchResults({
                donations,
                bookings,
                phone: phoneInput.trim()
            });
        } finally {
            setSearching(false);
        }
    };

    const handleEnterKey = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    if (!isOpen || !isEnabled) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="tracker-modal glass-card"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '600px',
                    maxHeight: '80vh',
                    overflowY: 'auto'
                }}
            >
                <button className="close-modal" onClick={onClose}>×</button>

                <div className="modal-header">
                    <h2>📊 {isAr ? 'متابع طلباتك' : 'Track Your Requests'}</h2>
                    <p>
                        {isAr
                            ? 'تتبع حال تبرعاتك والمواد المحجوز'
                            : 'Monitor your donations and booked materials'}
                    </p>
                </div>

                {/* Search Section */}
                {!searchResults && (
                    <div className="tracker-search-section">
                        <div className="form-group">
                            <label>
                                📱 {isAr ? 'رقم الهاتف' : 'Phone Number'}
                            </label>
                            <input
                                type="tel"
                                className="form-input"
                                placeholder={isAr ? '0790000000' : '0790000000'}
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                onKeyPress={handleEnterKey}
                                maxLength="10"
                            />
                            <small style={{ opacity: 0.7, marginTop: '4px', display: 'block' }}>
                                {isAr
                                    ? 'الرقم المستدم عند التبرع أو الحجز'
                                    : 'The phone number used during donation or booking'}
                            </small>
                        </div>

                        <button
                            className="submit-btn full-width"
                            onClick={handleSearch}
                            disabled={searching}
                        >
                            {searching ? (isAr ? '⏳ جاري البحث...' : '⏳ Searching...') : (isAr ? '🔍 بحث' : '🔍 Search')}
                        </button>

                        {savedProfile && (
                            <div style={{
                                background: 'rgba(52, 152, 219, 0.1)',
                                border: '1px solid rgba(52, 152, 219, 0.3)',
                                padding: '12px',
                                borderRadius: '8px',
                                marginTop: '12px'
                            }}>
                                <p style={{ margin: '0 0 8px 0', fontSize: '0.9em', opacity: 0.8 }}>
                                    {isAr ? '📌 البيانات المحفوظ:' : '📌 Saved Profile:'}
                                </p>
                                <p style={{ margin: '0', fontWeight: '600' }}>
                                    {savedProfile.name} - {savedProfile.phone}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Results Section */}
                {searchResults && (
                    <>
                        <div className="tracker-results-header">
                            <p style={{ marginBottom: '12px' }}>
                                {isAr ? 'البيانات المتعلق برقم:' : 'Data for:'} <strong>{searchResults.phone}</strong>
                            </p>
                            <button
                                className="link-button"
                                onClick={() => {
                                    setSearchResults(null);
                                    setPhoneInput('');
                                }}
                                style={{ fontSize: '0.9em' }}
                            >
                                {isAr ? '← بحث جديد' : '← New Search'}
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="tracker-tabs">
                            <button
                                className={`tracker-tab-btn ${activeTab === 'donations' ? 'active' : ''}`}
                                onClick={() => setActiveTab('donations')}
                            >
                                📦 {isAr ? 'التبرعات' : 'Donations'} ({searchResults.donations.length})
                            </button>
                            <button
                                className={`tracker-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
                                onClick={() => setActiveTab('bookings')}
                            >
                                🔒 {isAr ? 'الحجوزات' : 'Bookings'} ({searchResults.bookings.length})
                            </button>
                        </div>

                        {/* Donations Tab */}
                        {activeTab === 'donations' && (
                            <div className="tracker-content">
                                {searchResults.donations.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px', textAlign: 'center' }}>
                                        📭 {isAr ? 'لا توجد تبرعات' : 'No donations found'}
                                    </div>
                                ) : (
                                    <div className="tracker-items-list">
                                        {searchResults.donations.map((donation, idx) => (
                                            <div key={idx} className="tracker-item">
                                                <div className="tracker-item-header">
                                                    <span className="tracker-item-title">
                                                        {isAr ? 'تبرع #' : 'Donation #'}{idx + 1}
                                                    </span>
                                                    <span className={`status-badge status-${donation.status}`}>
                                                        {donation.status === 'submitted'
                                                            ? (isAr ? '✅ مسجل' : '✅ Submitted')
                                                            : donation.status}
                                                    </span>
                                                </div>
                                                <div className="tracker-item-content">
                                                    <p>
                                                        <strong>{isAr ? 'الاسم:' : 'Name:'}</strong> {donation.studentName}
                                                    </p>
                                                    <p>
                                                        <strong>{isAr ? 'الهاتف:' : 'Phone:'}</strong> {donation.phoneNumber}
                                                    </p>
                                                    <p>
                                                        <strong>{isAr ? 'المواد:' : 'Materials:'}</strong>
                                                        <br />
                                                        {donation.materials && donation.materials.map((m, i) => (
                                                            <span key={i} style={{ display: 'block', marginLeft: '16px' }}>
                                                                • {typeof m === 'object' ? m.name : m}
                                                            </span>
                                                        ))}
                                                    </p>
                                                    <p style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                                        <strong>{isAr ? 'التاريخ:' : 'Date:'}</strong>{' '}
                                                        {new Date(donation.submittedAt).toLocaleDateString(
                                                            isAr ? 'ar-JO' : 'en-US'
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="tracker-item-note">
                                                    {isAr
                                                        ? '💡 ستتم مراجع تبرعك من قبل المنسقين. سيصلك إشعار عند تفعيل طلبك.'
                                                        : '💡 Your donation will be reviewed by coordinators. You will receive a notification when approved.'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Bookings Tab */}
                        {activeTab === 'bookings' && (
                            <div className="tracker-content">
                                {searchResults.bookings.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px', textAlign: 'center' }}>
                                        📭 {isAr ? 'لا توجد حجوزات' : 'No bookings found'}
                                    </div>
                                ) : (
                                    <div className="tracker-items-list">
                                        {searchResults.bookings.map((booking, idx) => (
                                            <div key={idx} className="tracker-item">
                                                <div className="tracker-item-header">
                                                    <span className="tracker-item-title">
                                                        {isAr ? 'حجز #' : 'Booking #'}{idx + 1}
                                                    </span>
                                                    <span className={`status-badge status-${booking.status}`}>
                                                        {booking.status === 'booked'
                                                            ? (isAr ? '🔒 محجوز' : '🔒 Booked')
                                                            : booking.status}
                                                    </span>
                                                </div>
                                                <div className="tracker-item-content">
                                                    <p>
                                                        <strong>{isAr ? 'الاسم:' : 'Name:'}</strong> {booking.studentName}
                                                    </p>
                                                    <p>
                                                        <strong>{isAr ? 'الهاتف:' : 'Phone:'}</strong> {booking.phoneNumber}
                                                    </p>
                                                    <p>
                                                        <strong>{isAr ? 'المادة المحجوز:' : 'Booked Material:'}</strong> {booking.materialName}
                                                    </p>
                                                    <p>
                                                        <strong>{isAr ? 'المختبرع:' : 'Donor:'}</strong> {booking.donorName} ({booking.donorPhone})
                                                    </p>
                                                    <p style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                                        <strong>{isAr ? 'التاريخ:' : 'Date:'}</strong>{' '}
                                                        {new Date(booking.bookedAt).toLocaleDateString(
                                                            isAr ? 'ar-JO' : 'en-US'
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="tracker-item-note">
                                                    {isAr
                                                        ? '📋 سيتم التواصل معك من قبل المختبرع لتنسيق التسليم.'
                                                        : '📋 The donor will contact you to coordinate delivery.'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                <style>{`
                    .tracker-tabs {
                        display: flex;
                        gap: 8px;
                        margin: 16px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    }

                    .tracker-tab-btn {
                        padding: 10px 16px;
                        background: transparent;
                        border: none;
                        color: rgba(255, 255, 255, 0.6);
                        cursor: pointer;
                        border-bottom: 3px solid transparent;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    }

                    .tracker-tab-btn.active {
                        color: white;
                        border-bottom-color: var(--primary, #3498db);
                    }

                    .tracker-tab-btn:hover {
                        color: white;
                    }

                    .tracker-items-list {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        margin-top: 12px;
                    }

                    .tracker-item {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 12px;
                        padding: 12px;
                        overflow: hidden;
                    }

                    .tracker-item-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }

                    .tracker-item-title {
                        font-weight: 600;
                        font-size: 0.95em;
                    }

                    .tracker-item-content {
                        font-size: 0.9em;
                        line-height: 1.6;
                    }

                    .tracker-item-content p {
                        margin: 6px 0;
                    }

                    .tracker-item-note {
                        margin-top: 8px;
                        padding: 8px;
                        background: rgba(52, 152, 219, 0.1);
                        border-left: 3px solid rgba(52, 152, 219, 0.5);
                        font-size: 0.85em;
                        border-radius: 4px;
                    }

                    .link-button {
                        background: none;
                        border: none;
                        color: var(--primary, #3498db);
                        cursor: pointer;
                        text-decoration: none;
                        padding: 0;
                        font-size: inherit;
                    }

                    .link-button:hover {
                        text-decoration: underline;
                    }

                    .tracker-search-section {
                        padding: 12px 0;
                    }

                    .tracker-results-header {
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 8px;
                        margin-bottom: 12px;
                    }

                    .tracker-results-header p {
                        margin: 0;
                    }

                    @media (max-width: 600px) {
                        .tracker-modal {
                            max-width: 100% !important;
                            margin: 0 16px;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default PersonalTrackerModal;
