import dayjs from 'dayjs';
import { SUPABASE_URL } from '../constants';

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
 * Format a date string
 */
export function formatDate(date: string | Date, format: string = 'MMM D, YYYY'): string {
  return dayjs(date).format(format);
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
 * Handles relative Supabase storage paths stored in the DB by the web app.
 */
export function resolveImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = SUPABASE_URL?.replace(/\/$/, '');
  if (!base) return undefined;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}/storage/v1/object/${path}`;
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
