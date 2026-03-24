// API Base URL - point to your Next.js backend
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://chaffle.org';

// Supabase
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Stripe
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

// Stripe Terminal — set to 'true' only for local dev without a physical M2 reader
export const STRIPE_TERMINAL_SIMULATED = process.env.EXPO_PUBLIC_STRIPE_TERMINAL_SIMULATED === 'true';

// Admin email
export const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL || '';

// Ticket tiers
export const TICKET_TIERS = [
  { price: 5, quantity: 1 },
  { price: 10, quantity: 3 },
  { price: 20, quantity: 10 },
  { price: 40, quantity: 40 },
  { price: 100, quantity: 200 },
  { price: 250, quantity: 500 },
] as const;

// Theme colors — matched to the web app's globals.css / Tailwind config
export const COLORS = {
  // Primary: HSL(194, 43%, 48%) — the teal/cyan brand color
  primary: '#4697AF',
  primaryDark: '#3A7D93',
  primaryLight: '#5CADC4',

  // Foreground / text: HSL(222.2, 84%, 4.9%)
  foreground: '#020617',

  // Secondary: HSL(0, 0%, 56%) — neutral gray
  secondary: '#8F8F8F',
  secondaryForeground: '#0F172A',

  // Accent / muted: HSL(210, 40%, 96.1%)
  accent: '#F1F5F9',
  accentForeground: '#0F172A',

  // Destructive: HSL(0, 84.2%, 60.2%)
  destructive: '#EF4444',

  // Semantic
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',

  // Surfaces
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F9FAFB',    // gray-50 — navbar bg on web
  card: '#FFFFFF',

  // Text
  text: '#020617',
  textSecondary: '#64748B',    // muted-foreground
  textLight: '#94A3B8',        // slate-400

  // Borders
  border: '#E2E8F0',           // HSL(214.3, 31.8%, 91.4%)
  inputBorder: '#E2E8F0',
  ring: '#020617',

  // Misc
  disabled: '#CBD5E1',         // slate-300
  gold: '#FFC107',
  teal800: '#115E59',          // used on raffle info cards in web
  black: '#000000',
  white: '#FFFFFF',
} as const;

// Password validation regex
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Social links
export const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/profile.php?id=61560541843920',
  instagram: 'https://www.instagram.com/chafflefundraising',
  twitter: 'https://x.com/chafflellc',
  website: 'https://chaffle.org',
} as const;
