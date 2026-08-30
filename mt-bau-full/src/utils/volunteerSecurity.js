// src/utils/volunteerSecurity.js
// Security utilities for Volunteer Portal
// Handles: Rate Limiting, Input Sanitization, TOTP 2FA, Base32

// ─── Rate Limiting (In-memory, per session) ───────────────────────────────────
// Tracks failed login attempts per username to prevent brute force
const _attempts = {}; // { username: { count, firstAt } }
const RATE_LIMIT_MAX = 5;       // max failed attempts
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes in ms
const LOCKOUT_DURATION = 15 * 60 * 1000;  // 15 minutes lockout

export function checkRateLimit(username) {
  const key = username.toLowerCase().trim();
  const now = Date.now();
  const entry = _attempts[key];

  if (!entry) return { allowed: true, remaining: RATE_LIMIT_MAX };

  // Reset if window expired
  if (now - entry.firstAt > RATE_LIMIT_WINDOW) {
    delete _attempts[key];
    return { allowed: true, remaining: RATE_LIMIT_MAX };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const waitMs = LOCKOUT_DURATION - (now - entry.firstAt);
    const waitMin = Math.ceil(waitMs / 60000);
    return {
      allowed: false,
      waitMin,
      message: `تم تجاوز عدد المحاولات المسموح بها. حاول بعد ${waitMin} دقيقة.`,
      messageEn: `Too many attempts. Please try again in ${waitMin} minute(s).`,
    };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

export function recordFailedAttempt(username) {
  const key = username.toLowerCase().trim();
  const now = Date.now();
  if (!_attempts[key] || (now - _attempts[key].firstAt > RATE_LIMIT_WINDOW)) {
    _attempts[key] = { count: 1, firstAt: now };
  } else {
    _attempts[key].count += 1;
  }
}

export function clearAttempts(username) {
  const key = username.toLowerCase().trim();
  delete _attempts[key];
}

// ─── Input Sanitization ───────────────────────────────────────────────────────
// Strips HTML tags, SQL keywords, and dangerous characters
const DANGEROUS_PATTERNS = [
  /<[^>]*>/g,                            // HTML tags
  /javascript:/gi,                       // JS protocol
  /on\w+\s*=/gi,                         // Event handlers (onclick=, onerror=, etc.)
  /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b|\bEXEC\b)/gi, // SQL keywords
  /--/g,                                 // SQL comment
  /\/\*/g,                               // SQL block comment
  /\bOR\b\s+\d+\s*=\s*\d+/gi,          // OR 1=1 injection
  /[<>'"`;]/g,                           // Dangerous special chars in display contexts
];

export function sanitizeInput(str, { allowSpaces = true, maxLength = 200 } = {}) {
  if (typeof str !== 'string') return '';
  let cleaned = str;
  for (const pattern of DANGEROUS_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.trim();
  if (!allowSpaces) cleaned = cleaned.replace(/\s+/g, '');
  if (maxLength) cleaned = cleaned.slice(0, maxLength);
  return cleaned;
}

export function sanitizeUsername(str) {
  // Username: only alphanumeric, underscore, hyphen, dot — no spaces
  return (str || '').toLowerCase().replace(/[^a-z0-9_\-.]/g, '').slice(0, 40);
}

export function sanitizeEmail(str) {
  // Basic email sanitization — remove anything clearly injectionable
  return (str || '').replace(/[<>'"`;]/g, '').trim().slice(0, 100);
}

// ─── TOTP / 2FA Helpers (RFC 6238 — compatible with Google Authenticator) ─────
function base32tohex(base32) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  base32 = base32.replace(/=+$/, '');
  for (let i = 0; i < base32.length; i++) {
    const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) throw new Error('Invalid Base32 character');
    bits += val.toString(2).padStart(5, '0');
  }
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.substr(i, 4), 2).toString(16);
  }
  return hex;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let c = 0; c < hex.length; c += 2) {
    bytes[c / 2] = parseInt(hex.substr(c, 2), 16);
  }
  return bytes;
}

export async function getTOTPToken(secret, timeOffset = 0) {
  try {
    const secretClean = secret.replace(/\s+/g, '').toUpperCase();
    const keyBytes = hexToBytes(base32tohex(secretClean));
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw', keyBytes,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false, ['sign']
    );
    const counter = Math.floor((Date.now() / 1000 + timeOffset) / 30);
    const counterBytes = new Uint8Array(8);
    let temp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = temp & 0xff;
      temp = Math.floor(temp / 256);
    }
    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBytes);
    const digest = new Uint8Array(signature);
    const offset = digest[digest.length - 1] & 0xf;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    const otp = binary % 1000000;
    return otp.toString().padStart(6, '0');
  } catch (e) {
    console.error('TOTP error:', e);
    return '';
  }
}

// Verifies TOTP — checks current window ± one window (±30s) to account for clock drift
export async function verifyTOTP(secret, code) {
  if (!secret || !code || code.length !== 6) return false;
  for (const offset of [0, -30, 30]) {
    const expected = await getTOTPToken(secret, offset);
    if (expected && expected === code.trim()) return true;
  }
  return false;
}

// Generate a cryptographically random Base32 TOTP secret (20 chars = 100 bits)
export function generateBase32Secret(len = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => chars[b % 32]).join('');
}

// Build an otpauth:// URI for QR code generation
export function buildOtpAuthUri(secret, username, issuer = 'Makanak Al-Jamii') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(username)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
}

// Build QR code URL using free api.qrserver.com
export function buildQRCodeUrl(otpauthUri, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(otpauthUri)}&color=0f172a&bgcolor=ffffff`;
}
