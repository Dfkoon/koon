import React, { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function MaintenanceBanner({ enabled = false, message = '' }) {
  const [maintenanceState, setMaintenanceState] = useState({
    active: enabled,
    message: message || 'المنصة تحت الصيانة حالياً، نعود قريباً!'
  });

  useEffect(() => {
    try {
      const unsub = onSnapshot(
        doc(db, 'system_configs', 'global_settings'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            const isActive = data.maintenance_mode === true || data.maintenance_mode === '1' || data.maintenance_mode === 1;
            const customMessage = data.maintenance_message || 'المنصة تحت الصيانة حالياً، نعود قريباً!';
            setMaintenanceState({
              active: isActive,
              message: customMessage
            });
          } else {
            setMaintenanceState(prev => ({ ...prev, active: false }));
          }
        },
        (err) => {
          console.warn('Failed to subscribe to maintenance mode settings:', err);
        }
      );
      return () => unsub();
    } catch (e) {
      console.error('Maintenance listener error:', e);
    }
  }, []);

  // Don't block admin / coordinator portal routes so staff can still log in and manage the site
  const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
  const isStaffRoute = currentHash.includes('/portal') ||
    currentHash.includes('/admin') ||
    currentHash.includes('/volunteer-portal') ||
    currentHash.includes('/old-admin');

  if (!maintenanceState.active || isStaffRoute) {
    return null;
  }

  return (
    <>
      {/* Full-screen Fixed Backdrop */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        {/* Card */}
        <div style={{
          background: '#ffffff',
          borderRadius: '24px',
          border: '2px solid #f59e0b',
          boxShadow: '0 25px 50px -12px rgba(245, 158, 11, 0.25), 0 10px 25px rgba(0, 0, 0, 0.2)',
          padding: '44px 32px 36px',
          maxWidth: '480px',
          width: '100%',
          textAlign: 'center',
          direction: 'rtl',
          fontFamily: "'Tajawal', 'Segoe UI', system-ui, sans-serif",
          animation: 'mbPopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
          {/* Animated Icon */}
          <div style={{
            fontSize: '58px',
            marginBottom: '16px',
            lineHeight: 1,
            filter: 'drop-shadow(0 4px 10px rgba(245, 158, 11, 0.3))'
          }}>
            🚧
          </div>

          {/* Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#fef3c7',
            color: '#b45309',
            border: '1px solid #fde68a',
            borderRadius: '9999px',
            padding: '6px 18px',
            fontSize: '13.5px',
            fontWeight: 800,
            marginBottom: '16px',
          }}>
            <span>⚙️</span> وضع الصيانة مفعل
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: '24px',
            fontWeight: 900,
            color: '#0f172a',
            margin: '0 0 12px',
            letterSpacing: '-0.3px',
          }}>
            الموقع تحت الصيانة المؤقتة
          </h2>

          {/* Message configured by Admin */}
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '16px 20px',
            margin: '0 0 24px',
            color: '#334155',
            fontSize: '15px',
            lineHeight: 1.7,
            fontWeight: 600
          }}>
            {maintenanceState.message}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
                transition: 'transform 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <span>🔄</span> إعادة التحقق
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes mbPopIn {
          0% { opacity: 0; transform: scale(0.9) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}
