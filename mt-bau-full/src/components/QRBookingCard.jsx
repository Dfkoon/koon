import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/**
 * QRBookingCard - Shows a QR code for a student booking.
 * Student shows this QR code to the coordinator on campus for quick scan & handover.
 * 
 * Props:
 *  - bookingId: unique ID for the booking
 *  - studentName: student's name
 *  - materialName: name of the booked material
 *  - donorName: donor's name
 *  - coordinatorName: assigned coordinator
 *  - pickupDate: scheduled pickup date
 *  - pickupTime: scheduled pickup time
 *  - isAr: boolean for Arabic language
 */
const QRBookingCard = ({
    bookingId,
    studentName,
    materialName,
    donorName,
    coordinatorName,
    pickupDate,
    pickupTime,
    isAr = true,
    onClose
}) => {
    const [copied, setCopied] = useState(false);

    const qrPayload = JSON.stringify({
        type: 'makanak_booking',
        id: bookingId,
        student: studentName,
        material: materialName,
        date: pickupDate,
        time: pickupTime
    });

    const handleCopy = () => {
        navigator.clipboard?.writeText(bookingId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem'
        }} onClick={onClose}>
            <div style={{
                background: 'linear-gradient(145deg, #0d1b2a, #1a2d45)',
                border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: '24px',
                padding: '2rem',
                maxWidth: '360px',
                width: '100%',
                textAlign: 'center',
                direction: isAr ? 'rtl' : 'ltr',
                boxShadow: '0 20px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                animation: 'popIn 0.3s ease-out'
            }} onClick={e => e.stopPropagation()}>
                <style>{`
                    @keyframes popIn {
                        from { opacity: 0; transform: scale(0.85); }
                        to   { opacity: 1; transform: scale(1); }
                    }
                `}</style>

                {/* Header */}
                <div style={{ marginBottom: '1.2rem' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.3rem' }}>📦</div>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>
                        {isAr ? 'بطاق استلام الحجز' : 'Booking QR Card'}
                    </h3>
                    <p style={{ margin: '0.3rem 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                        {isAr ? 'أرِ هذا الكود للمنسق عند الاستلام' : 'Show this code to the coordinator on pickup'}
                    </p>
                </div>

                {/* QR Code */}
                <div style={{
                    background: '#fff',
                    borderRadius: '16px',
                    padding: '1rem',
                    display: 'inline-block',
                    marginBottom: '1.2rem',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}>
                    <QRCodeSVG
                        value={qrPayload}
                        size={180}
                        bgColor="#ffffff"
                        fgColor="#0d1b2a"
                        level="M"
                    />
                </div>

                {/* Details */}
                <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px',
                    padding: '0.9rem',
                    marginBottom: '1rem',
                    textAlign: 'right'
                }}>
                    {[
                        { label: isAr ? '📦 المادة:' : '📦 Material:', value: materialName },
                        { label: isAr ? '👤 الاسم:' : '👤 Student:', value: studentName },
                        { label: isAr ? '🎁 المختبرع:' : '🎁 Donor:', value: donorName },
                        { label: isAr ? '🧑‍💼 المنسق:' : '🧑‍💼 Coordinator:', value: coordinatorName },
                        { label: isAr ? '📅 الموعد:' : '📅 Date:', value: `${pickupDate || '—'} ${pickupTime ? `الساع ${pickupTime}` : ''}` },
                    ].map((row, i) => row.value && (
                        <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '0.3rem 0',
                            borderBottom: i < 4 ? '1px dashed rgba(255,255,255,0.07)' : 'none'
                        }}>
                            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>{row.label}</span>
                            <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.82rem', marginRight: '0.5rem' }}>{row.value}</span>
                        </div>
                    ))}
                </div>

                {/* Booking ID */}
                <div style={{
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px dashed rgba(251,191,36,0.3)',
                    borderRadius: '8px',
                    padding: '0.5rem 0.8rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                }} onClick={handleCopy}>
                    <span style={{ color: '#fbbf24', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                        #{bookingId?.slice(-8)?.toUpperCase() || 'N/A'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: copied ? '#55efc4' : 'rgba(255,255,255,0.3)' }}>
                        {copied ? (isAr ? '✅ تم النس' : '✅ Copied') : (isAr ? '📋 انس' : '📋 Copy')}
                    </span>
                </div>

                {/* Close Button */}
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.7)',
                    borderRadius: '10px',
                    padding: '0.6rem 1.5rem',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    width: '100%',
                    transition: 'all 0.15s ease'
                }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                >
                    {isAr ? '✖ إغلاق' : '✖ Close'}
                </button>
            </div>
        </div>
    );
};

export default QRBookingCard;
