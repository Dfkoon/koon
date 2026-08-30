import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
    findDonationsByPhone,
    findBookingsByPhone
} from '../utils/exchangeLocalStorage';

/**
 * Material Status Checker Component
 * Allows users to check the status of their donations and bookings
 * Displays results inline without modal
 */
const MaterialStatusChecker = ({ isAr, isEnabledProp }) => {
    const [isEnabled, setIsEnabled] = useState(isEnabledProp !== undefined ? Boolean(isEnabledProp) : false);
    const [phoneInput, setPhoneInput] = useState('');
    const [nameInput, setNameInput] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeResultTab, setActiveResultTab] = useState('donations');

    useEffect(() => {
        if (isEnabledProp !== undefined) {
            setIsEnabled(Boolean(isEnabledProp));
        }
    }, [isEnabledProp]);

    useEffect(() => {
        try {
            const unsub = onSnapshot(
                doc(db, 'system_configs', 'global_settings'),
                (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.data();
                        const setting = data.material_status_checker_enabled;
                        setIsEnabled(setting === true || setting === '1' || setting === 1);
                    } else {
                        setIsEnabled(false);
                    }
                },
                (error) => {
                    console.warn('Failed to load material status checker setting:', error);
                }
            );

            return () => unsub();
        } catch (e) {
            console.error('Error setting up settings listener:', e);
        }
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();

        if (!phoneInput.trim()) {
            alert(isAr ? 'الرجاء إدخال رقم الهاتف' : 'Please enter your phone number');
            return;
        }

        const donations = findDonationsByPhone(phoneInput);
        const bookings = findBookingsByPhone(phoneInput);

        setSearchResults({
            donations: donations.filter(d =>
                !nameInput.trim() || d.studentName.toLowerCase().includes(nameInput.toLowerCase())
            ),
            bookings: bookings.filter(b =>
                !nameInput.trim() || b.name.toLowerCase().includes(nameInput.toLowerCase())
            ),
            phone: phoneInput.trim(),
            name: nameInput.trim()
        });

        setHasSearched(true);
        setActiveResultTab('donations');
    };

    const handleClearSearch = () => {
        setPhoneInput('');
        setNameInput('');
        setSearchResults(null);
        setHasSearched(false);
    };

    const getStatusBadge = (status) => {
        const statusMap = {
            submitted: { label: isAr ? 'معلق' : 'Pending', color: '#f39c12', icon: '⏳' },
            approved: { label: isAr ? 'معتمد' : 'Approved', color: '#27ae60', icon: '✅' },
            rejected: { label: isAr ? 'مرفوض' : 'Rejected', color: '#e74c3c', icon: '❌' },
            completed: { label: isAr ? 'مكتمل' : 'Completed', color: '#9b59b6', icon: '✨' },
            booked: { label: isAr ? 'محجوز' : 'Booked', color: '#3498db', icon: '📌' }
        };

        return statusMap[status] || { label: status, color: '#95a5a6', icon: '•' };
    };

    const formatDate = (dateString) => {
        try {
            const date = new Date(dateString);
            return isAr
                ? date.toLocaleDateString('ar-SA', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : date.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
        } catch {
            return dateString;
        }
    };

    if (!isEnabled) return null;

    return (
        <div className="material-status-checker-container">
            <div className="status-checker-header">
                <h2 className="status-checker-title">
                    {isAr ? '📋 معرف حال طلباتك' : '📋 Check Your Requests Status'}
                </h2>
                <p className="status-checker-subtitle">
                    {isAr
                        ? 'ابحث عن حال تبرعاتك والمواد المحجوز'
                        : 'Search for the status of your donations and bookings'}
                </p>
            </div>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="status-checker-form">
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">
                            📱 {isAr ? 'رقم الهاتف' : 'Phone Number'}
                        </label>
                        <input
                            type="tel"
                            className="form-input status-form-input"
                            placeholder={isAr ? '0790000000' : '0790000000'}
                            value={phoneInput}
                            onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                            maxLength="10"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">
                            👤 {isAr ? 'الاسم (اختياري)' : 'Name (Optional)'}
                        </label>
                        <input
                            type="text"
                            className="form-input status-form-input"
                            placeholder={isAr ? 'اسمك الكامل' : 'Your full name'}
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                        />
                    </div>
                </div>

                <div className="form-actions">
                    <button type="submit" className="btn btn-search">
                        🔍 {isAr ? 'بحث' : 'Search'}
                    </button>
                    {hasSearched && (
                        <button type="button" onClick={handleClearSearch} className="btn btn-clear">
                            🔄 {isAr ? 'حذف البحث' : 'Clear'}
                        </button>
                    )}
                </div>
            </form>

            {/* Results Section */}
            {hasSearched && searchResults && (
                <div className="status-results-section">
                    <div className="results-header">
                        <h3>{isAr ? 'نتائج البحث' : 'Search Results'}</h3>
                        <p className="results-info">
                            {isAr
                                ? `تم العثور على ${searchResults.donations.length + searchResults.bookings.length} نتيج`
                                : `Found ${searchResults.donations.length + searchResults.bookings.length} results`}
                        </p>
                    </div>

                    {/* Results Tabs */}
                    <div className="results-tabs">
                        <button
                            className={`tab-btn ${activeResultTab === 'donations' ? 'active' : ''}`}
                            onClick={() => setActiveResultTab('donations')}
                        >
                            🎁 {isAr ? 'التبرعات' : 'Donations'} ({searchResults.donations.length})
                        </button>
                        <button
                            className={`tab-btn ${activeResultTab === 'bookings' ? 'active' : ''}`}
                            onClick={() => setActiveResultTab('bookings')}
                        >
                            📦 {isAr ? 'الحجوزات' : 'Bookings'} ({searchResults.bookings.length})
                        </button>
                    </div>

                    {/* Donations Tab */}
                    {activeResultTab === 'donations' && (
                        <div className="results-content">
                            {searchResults.donations.length > 0 ? (
                                <div className="results-list">
                                    {searchResults.donations.map((donation, idx) => {
                                        const statusInfo = getStatusBadge(donation.status || 'submitted');
                                        return (
                                            <div key={idx} className="result-card">
                                                <div className="card-header">
                                                    <div className="card-title">
                                                        <span className="status-icon">{statusInfo.icon}</span>
                                                        <h4>{donation.studentName}</h4>
                                                    </div>
                                                    <span className="status-badge" style={{ backgroundColor: statusInfo.color }}>
                                                        {statusInfo.label}
                                                    </span>
                                                </div>

                                                <div className="card-content">
                                                    <div className="info-row">
                                                        <span className="label">📱 {isAr ? 'الهاتف' : 'Phone'}:</span>
                                                        <span className="value">{donation.phoneNumber || donation.phone || '—'}</span>
                                                    </div>

                                                    <div className="info-row">
                                                        <span className="label">📚 {isAr ? 'المواد' : 'Materials'}:</span>
                                                        <div className="materials-list">
                                                            {donation.materials && donation.materials.length > 0 ? (
                                                                <ul>
                                                                    {donation.materials.map((material, mIdx) => (
                                                                        <li key={mIdx}>
                                                                            • {material.name || material}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            ) : (
                                                                <span>{isAr ? 'لا توجد مواد' : 'No materials'}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="info-row">
                                                        <span className="label">📅 {isAr ? 'التاريخ' : 'Date'}:</span>
                                                        <span className="value">{formatDate(donation.submittedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <p>{isAr ? 'لا توجد تبرعات مسجل' : 'No donations found'}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Bookings Tab */}
                    {activeResultTab === 'bookings' && (
                        <div className="results-content">
                            {searchResults.bookings.length > 0 ? (
                                <div className="results-list">
                                    {searchResults.bookings.map((booking, idx) => {
                                        const statusInfo = getStatusBadge(booking.status || 'booked');
                                        return (
                                            <div key={idx} className="result-card">
                                                <div className="card-header">
                                                    <div className="card-title">
                                                        <span className="status-icon">{statusInfo.icon}</span>
                                                        <h4>{booking.name}</h4>
                                                    </div>
                                                    <span className="status-badge" style={{ backgroundColor: statusInfo.color }}>
                                                        {statusInfo.label}
                                                    </span>
                                                </div>

                                                <div className="card-content">
                                                    <div className="info-row">
                                                        <span className="label">📱 {isAr ? 'الهاتف' : 'Phone'}:</span>
                                                        <span className="value">{booking.phoneNumber || booking.phone || '—'}</span>
                                                    </div>

                                                    <div className="info-row">
                                                        <span className="label">📖 {isAr ? 'المادة المحجوز' : 'Booked Material'}:</span>
                                                        <span className="value">{booking.materialName}</span>
                                                    </div>

                                                    <div className="info-row">
                                                        <span className="label">{isAr ? 'بيانات المختبرع' : 'Donor Info'}:</span>
                                                        <div className="donor-info">
                                                            <p>📛 {isAr ? 'الاسم' : 'Name'}: {booking.donorName}</p>
                                                            <p>📱 {isAr ? 'الهاتف' : 'Phone'}: {booking.donorPhone}</p>
                                                        </div>
                                                    </div>

                                                    <div className="info-row">
                                                        <span className="label">📅 {isAr ? 'تاريخخ الحجز' : 'Booking Date'}:</span>
                                                        <span className="value">{formatDate(booking.bookedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    <p>{isAr ? 'لا توجد حجوزات مسجل' : 'No bookings found'}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Info Note */}
                    <div className="results-note">
                        <p>
                            ℹ️ {isAr
                                ? 'سيتم إبارك عند تحديث حال طلبك من قبل الفريق الإداري'
                                : 'You will be notified when your request status is updated by the admin team'}
                        </p>
                    </div>
                </div>
            )}

            {/* No Results State */}
            {hasSearched && searchResults && (searchResults.donations.length === 0 && searchResults.bookings.length === 0) && (
                <div className="no-results-state">
                    <p className="no-results-emoji">🔍</p>
                    <h3>{isAr ? 'لم يتم العثور على نتائج' : 'No Results Found'}</h3>
                    <p>
                        {isAr
                            ? 'لا توجد تبرعات أو حجوزات مسجل برقم الهاتف المدل'
                            : 'No donations or bookings found for the entered phone number'}
                    </p>
                </div>
            )}
        </div>
    );
};

export default MaterialStatusChecker;
