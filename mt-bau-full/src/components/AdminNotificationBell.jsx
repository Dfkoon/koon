import React, { useState, useEffect, useRef } from 'react';
import {
  collection, query, orderBy, limit, onSnapshot,
  updateDoc, doc, writeBatch, where, getDocs
} from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Type → icon mapping ──────────────────────────────────────────────────────
const TYPE_ICON = {
  new_donation: '📦',
  new_application: '🙋',
  new_booking: '🔖',
  new_report: '🚨',
  general: '🔔',
};

const TYPE_COLOR = {
  new_donation: '#0ea5e9',
  new_application: '#8b5cf6',
  new_booking: '#f59e0b',
  new_report: '#ef4444',
  general: '#64748b',
};

function timeAgo(ts) {
  if (!ts) return '';
  const now = Date.now();
  const t = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function AdminNotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const bellRef = useRef(null);
  const [animateBell, setAnimateBell] = useState(false);
  const prevUnread = useRef(0);

  // Live listener – last 30 notifications ordered newest first
  useEffect(() => {
    const q = query(
      collection(db, 'admin_notifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifs(items);
      const unread = items.filter(n => !n.read).length;
      if (unread > prevUnread.current && prevUnread.current !== undefined) {
        setAnimateBell(true);
        setTimeout(() => setAnimateBell(false), 800);
        // Play pleasant harmonic 2-tone chime if browser allows
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            const ctx = new AudioContext();
            const now = ctx.currentTime;
            
            // Tone 1: High crisp bell note
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
            gain1.gain.setValueAtTime(0, now);
            gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.45);

            // Tone 2: Harmonic pleasant chime
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1046.50, now + 0.08); // C6
            gain2.gain.setValueAtTime(0, now + 0.08);
            gain2.gain.linearRampToValueAtTime(0.12, now + 0.1);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.55);
          }
        } catch (_) {}
      }
      prevUnread.current = unread;
    }, (err) => console.warn('[NotificationBell] listener error:', err));
    return () => unsub();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (open && panelRef.current && !panelRef.current.contains(e.target) && !bellRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unreadCount = notifs.filter(n => !n.read).length;

  const markRead = async (id) => {
    try { await updateDoc(doc(db, 'admin_notifications', id), { read: true }); }
    catch (_) {}
  };

  const markAllRead = async () => {
    const unread = notifs.filter(n => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'admin_notifications', n.id), { read: true }));
    try { await batch.commit(); } catch (_) {}
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* ── Bell Button ─────────────────────────────────────────── */}
      <button
        ref={bellRef}
        onClick={() => { setOpen(o => !o); if (!open) markAllRead(); }}
        style={{
          background: open ? '#f0f9ff' : '#ffffff',
          border: `2px solid ${open ? '#0ea5e9' : '#e2e8f0'}`,
          borderRadius: '12px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontWeight: 700,
          fontSize: '15px',
          color: '#0f172a',
          transition: 'all 0.2s',
          animation: animateBell ? 'bellShake 0.5s ease' : 'none',
          boxShadow: unreadCount > 0 ? '0 0 0 3px rgba(14,165,233,0.2)' : 'none',
        }}
        title="الإشعارات"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            background: '#ef4444',
            color: '#fff',
            borderRadius: '9999px',
            padding: '1px 7px',
            fontSize: '12px',
            fontWeight: 900,
            minWidth: '20px',
            textAlign: 'center',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown Panel ──────────────────────────────────────── */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '340px',
            maxHeight: '480px',
            overflowY: 'auto',
            background: '#ffffff',
            borderRadius: '18px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
            zIndex: 99999,
            direction: 'rtl',
            fontFamily: "'Tajawal', system-ui, sans-serif",
            animation: 'bellPanelIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            background: '#fff',
            borderRadius: '18px 18px 0 0',
          }}>
            <span style={{ fontWeight: 900, fontSize: '15px', color: '#0f172a' }}>
              🔔 الإشعارات {unreadCount > 0 && <span style={{ color: '#ef4444' }}>({unreadCount})</span>}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0ea5e9',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: '6px',
                }}
              >
                تعليم الكل مقروء
              </button>
            )}
          </div>

          {/* Notification List */}
          {notifs.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>📭</div>
              لا توجد إشعارات
            </div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f8fafc',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  background: n.read ? '#fff' : '#f0f9ff',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = n.read ? '#fff' : '#f0f9ff'}
              >
                {/* Type icon circle */}
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: `${TYPE_COLOR[n.type] || '#64748b'}15`,
                  border: `1.5px solid ${TYPE_COLOR[n.type] || '#64748b'}30`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  flexShrink: 0,
                }}>
                  {TYPE_ICON[n.type] || '🔔'}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: n.read ? 600 : 800,
                    fontSize: '13.5px',
                    color: '#0f172a',
                    marginBottom: '2px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {n.titleAr}
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.4, marginBottom: '4px' }}>
                    {n.bodyAr}
                  </div>
                  {n.meta?.phone && (
                    <div style={{ fontSize: '11.5px', color: '#0ea5e9', fontWeight: 700 }}>
                      📞 {n.meta.phone}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#0ea5e9',
                    flexShrink: 0,
                    marginTop: '4px',
                  }} />
                )}
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        @keyframes bellShake {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(-18deg); }
          30% { transform: rotate(18deg); }
          45% { transform: rotate(-14deg); }
          60% { transform: rotate(14deg); }
          75% { transform: rotate(-8deg); }
          90% { transform: rotate(8deg); }
        }
        @keyframes bellPanelIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}
