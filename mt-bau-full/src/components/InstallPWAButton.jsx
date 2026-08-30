import React, { useState, useEffect } from 'react';

const InstallPWAButton = ({ isAr = true }) => {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showGuideModal, setShowGuideModal] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const iosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(iosDevice);

        // Check standalone mode
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        setIsStandalone(isStandaloneMode);

        // Listen for browser install prompt
        const handleBeforeInstallPrompt = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', () => {
            setIsStandalone(true);
            setDeferredPrompt(null);
        });

        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleClick = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setIsStandalone(true);
            }
            setDeferredPrompt(null);
        } else {
            setShowGuideModal(true);
        }
    };

    if (isStandalone || dismissed) return null;

    return (
        <>
            {/* Sleek Makanak Brand Floating Capsule */}
            <div style={{
                position: 'fixed',
                bottom: '1.4rem',
                left: isAr ? '1.4rem' : 'auto',
                right: isAr ? 'auto' : '1.4rem',
                zIndex: 99990,
                direction: isAr ? 'rtl' : 'ltr',
                animation: 'pwaSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
                <style>{`
                    @keyframes pwaSlideUp {
                        from { opacity: 0; transform: translateY(24px) scale(0.95); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>
                <div style={{
                    background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.96))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(211, 47, 47, 0.35)',
                    borderRadius: '50px',
                    padding: '5px 8px 5px 14px',
                    boxShadow: '0 12px 35px rgba(0, 0, 0, 0.45), 0 0 20px rgba(211, 47, 47, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                }}>
                    <button
                        onClick={handleClick}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ffffff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontWeight: '700',
                            fontSize: '0.86rem',
                            padding: '4px 0',
                            fontFamily: "'Tajawal', 'IBM Plex Sans Arabic', sans-serif",
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <span style={{
                            fontSize: '0.95rem',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'linear-gradient(135deg, #d32f2f, #b71c1c)',
                            color: '#ffffff',
                            boxShadow: '0 2px 10px rgba(211, 47, 47, 0.4)',
                            flexShrink: 0
                        }}>
                            📲
                        </span>
                        <span style={{ color: '#ffffff', fontWeight: '700' }}>
                            {isAr ? 'التثبيت وإنشاء اختصار' : 'Install & Add Shortcut'}
                        </span>
                    </button>

                    <button
                        onClick={() => setDismissed(true)}
                        title={isAr ? 'إغلاق' : 'Close'}
                        style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: 'rgba(255, 255, 255, 0.6)',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            transition: 'all 0.2s ease',
                            flexShrink: 0
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.background = 'rgba(211, 47, 47, 0.4)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Step-by-Step Guide Modal in Makanak Crimson Theme */}
            {showGuideModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 99999,
                    background: 'rgba(10, 10, 15, 0.85)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.2rem',
                    direction: isAr ? 'rtl' : 'ltr',
                    fontFamily: "'Tajawal', 'IBM Plex Sans Arabic', sans-serif"
                }} onClick={() => setShowGuideModal(false)}>
                    <div style={{
                        background: 'linear-gradient(145deg, #0f172a, #1e293b)',
                        border: '1.5px solid rgba(211, 47, 47, 0.4)',
                        borderRadius: '24px',
                        padding: '1.8rem',
                        maxWidth: '420px',
                        width: '100%',
                        color: '#ffffff',
                        boxShadow: '0 25px 70px rgba(0, 0, 0, 0.8), 0 0 30px rgba(211, 47, 47, 0.2)',
                        animation: 'modalPop 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} onClick={e => e.stopPropagation()}>
                        <style>{`
                            @keyframes modalPop {
                                from { opacity: 0; transform: scale(0.92); }
                                to { opacity: 1; transform: scale(1); }
                            }
                        `}</style>

                        {/* Title */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #d32f2f, #b71c1c)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1.2rem',
                                    boxShadow: '0 4px 12px rgba(211, 47, 47, 0.35)'
                                }}>
                                    📲
                                </span>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#ffffff', fontWeight: 800 }}>
                                    {isAr ? 'التثبيت وإنشاء اختصار للتطبيق' : 'Install & Add Shortcut'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowGuideModal(false)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    border: 'none',
                                    color: 'rgba(255,255,255,0.7)',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(211,47,47,0.4)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Instructions matching Chrome / Safari exact menus */}
                        {isIOS ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)' }}>
                                    {isAr ? 'لتثبيت التطبيق على جهاز الآيفون (iPhone/iPad):' : 'To install on iPhone/iPad:'}
                                </p>
                                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                        <span style={{ background: '#d32f2f', color: '#ffffff', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>1</span>
                                        <span>{isAr ? 'اضغط على زر المشارك في أسفل Safari' : 'Tap Share button in Safari'} <strong style={{ color: '#fbbf24' }}>(⎋)</strong></span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        <span style={{ background: '#d32f2f', color: '#ffffff', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>2</span>
                                        <span>{isAr ? 'اختر "إضاف إلى الشاش الرئيسي"' : 'Select "Add to Home Screen"'} <strong style={{ color: '#fbbf24' }}>(➕)</strong></span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem', lineHeight: 1.6 }}>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)' }}>
                                    {isAr ? 'خطوات التثبيت المباشر من متصفح كروم / أندرويد:' : 'Direct installation steps for Chrome:'}
                                </p>
                                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.8rem' }}>
                                        <span style={{ background: '#d32f2f', color: '#ffffff', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>1</span>
                                        <span>{isAr ? 'اضغط على نقاط القائم الثلاث أعلى المختصفح' : 'Tap menu dots'} <strong style={{ color: '#fbbf24' }}>()</strong></span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        <span style={{ background: '#d32f2f', color: '#ffffff', fontWeight: 800, width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>2</span>
                                        <span>{isAr ? 'اختر الخيار:' : 'Choose:'} <strong style={{ color: '#4ade80' }}>"التثبيت وإنشاء اختصار" 📲</strong></span>
                                    </div>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => setShowGuideModal(false)}
                            style={{
                                width: '100%',
                                marginTop: '1.4rem',
                                background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)',
                                border: 'none',
                                color: '#ffffff',
                                padding: '0.75rem',
                                borderRadius: '14px',
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(211, 47, 47, 0.4)',
                                transition: 'transform 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            {isAr ? 'فهمت ذلك 👍' : 'Got it 👍'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default InstallPWAButton;
