// ─── Admin Real-Time Notification Service ─────────────────────────────────────
// Writes to Firestore `admin_notifications` collection.
// Coordinators and Admin pick these up live via onSnapshot in AdminNotificationBell.

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Send a real-time notification to all connected coordinators / admins.
 *
 * @param {'new_donation'|'new_application'|'new_report'|'new_booking'|'general'} type
 * @param {string} titleAr  - Arabic short title
 * @param {string} bodyAr   - Arabic detail message
 * @param {Object} [meta]   - Optional extra data (docId, studentName, phone …)
 */
export async function sendAdminNotification(type, titleAr, bodyAr, meta = {}) {
  try {
    await addDoc(collection(db, 'admin_notifications'), {
      type,
      titleAr,
      bodyAr,
      meta,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-critical – silently swallow so it never breaks the user flow
    console.warn('[notificationService] Failed to send admin notification:', err);
  }
}
