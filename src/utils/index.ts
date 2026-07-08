import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { STORAGE_BUCKET, SUPABASE_URL } from '../constants';

dayjs.extend(customParseFormat);

const DRAW_DATE_FORMATS = [
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'MM/DD/YYYY',
  'M/D/YYYY',
  'MMM D, YYYY',
  'MMMM D, YYYY',
] as const;

/**
 * Parse raffle draw dates reliably.
 * Bare YYYY-MM-DD is preferred (web date input); falls back to common US formats / ISO.
 */
export function parseAppDate(
  value: string | Date | null | undefined,
): dayjs.Dayjs | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const d = dayjs(value);
    return d.isValid() ? d : null;
  }

  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'invalid date') {
    return null;
  }

  // Date-only ISO: treat as local calendar day (avoid UTC midnight shift).
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = dayjs(raw, 'YYYY-MM-DD', true);
    return d.isValid() ? d : null;
  }

  for (const fmt of DRAW_DATE_FORMATS) {
    const d = dayjs(raw, fmt, true);
    if (d.isValid()) return d;
  }

  const fallback = dayjs(raw);
  return fallback.isValid() ? fallback : null;
}

export function isValidAppDate(value: string | Date | null | undefined): boolean {
  return parseAppDate(value) !== null;
}

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date string. Invalid/empty values return "—" (never "Invalid Date").
 */
export function formatDate(
  date: string | Date | null | undefined,
  format: string = 'MMM D, YYYY',
): string {
  const parsed = parseAppDate(date);
  return parsed ? parsed.format(format) : '—';
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (password.length < 8) errors.push('At least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter');
  if (!/\d/.test(password)) errors.push('At least one number');
  if (!/[@$!%*?&]/.test(password)) errors.push('At least one special character (@$!%*?&)');
  return { valid: errors.length === 0, errors };
}

/**
 * Validate image file
 */
export function isImageValid(uri: string): boolean {
  const ext = uri.split('.').pop()?.toLowerCase();
  return ['png', 'jpeg', 'jpg', 'svg'].includes(ext || '');
}

/**
 * Strip HTML tags from a string (for rendering rich text as plain text)
 */
export function stripHtml(html: string | null): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

/**
 * Generate a short UUID-like display ID from a full UUID
 */
export function shortId(uuid: string): string {
  return uuid.slice(0, 8).toUpperCase();
}

/**
 * Calculate pot amount (50% of total sold)
 */
export function calculatePot(totalAmount: number): number {
  return Math.floor(totalAmount / 2);
}

/**
 * Resolve an image path to a full URL.
 * Handles relative Supabase storage paths stored in the DB by the web app
 * (e.g. /public/<raffleId>/background/<file>).
 */
export function resolveImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return undefined;

  // Paths already include /object/... should not double-prefix.
  if (url.includes('/storage/v1/object/')) {
    return url.startsWith('http') ? url : `${base}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  let path = url.startsWith('/') ? url.slice(1) : url;
  // Web loader serves as /object/public/<bucket>/<src>
  if (!path.startsWith('public/') && !path.startsWith(`${STORAGE_BUCKET}/`)) {
    // Legacy relative paths without bucket — treat as object key under public bucket.
  }
  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

/**
 * Get the user's public IP address
 */
export async function getPublicIp(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return '0.0.0.0';
  }
}

/** First UUID segment, uppercase — matches web getTicketReferenceId. */
export function getTicketReferenceId(ticketId: string): string {
  return ticketId.split('-')[0].toUpperCase();
}
