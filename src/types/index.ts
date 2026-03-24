// Database model types matching the Prisma schema
export interface Ticket {
  id: string;
  isFree: boolean;
  buyerName: string;
  buyerEmail: string;
  phone: string | null;
  address: string | null;
  isWinner: boolean;
  amount: number;
  quantity: number;
  stripeSession: any;
  ip: string;
  donation_formId: string | null;
  paid: boolean;
  created_at: string;
  updated_at: string;
  donation_form?: {
    title: string | null;
    id: string;
  };
}

export interface DonationForm {
  id: string;
  title: string | null;
  mission_statement: string | null;
  charity_info: string | null;
  donation_amount_information: string | null;
  rules: string | null;
  backgroundImage: string | null;
  images: string[];
  created_at: string;
  updated_at: string;
  stripeAccount: StripeAccount | null;
  draw_date: string | null;
  min_ticket_price: number | null;
  raffleLocation: string | null;
  secure_link?: SecureLink | null;
  _count?: {
    tickets: number;
  };
}

export interface StripeAccount {
  id: string;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  [key: string]: any;
}

export interface SecureLink {
  id: string;
  raffleId: string;
  expired: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketTotalByRaffle {
  donation_formId: string;
  _sum: {
    quantity: number | null;
    amount: number | null;
  };
}

export interface CreateTicketPayload {
  email: string;
  name: string;
  amount: number;
  quantity: number;
  raffleId: string;
  ip: string;
  isFree?: boolean;
  paid?: boolean;
  phone: string;
  address: string;
}

export interface CreateCheckoutPayload {
  isApplicationAmount?: boolean;
  quantity: number;
  raffleAccount: string;
  amount: number;
  email: string;
  ticketId: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface AdminLoginData {
  email: string;
  password: string;
}

export interface UpdateFormPayload {
  id: string;
  title?: string | null;
  mission_statement?: string | null;
  charity_info?: string | null;
  donation_amount_information?: string | null;
  rules?: string | null;
  backgroundImage?: string | null;
  images?: string[];
  draw_date?: string | null;
  min_ticket_price?: number | null;
  raffleLocation?: string | null;
  stripeAccount?: any;
}

// ── Stripe Terminal types ─────────────────────────────────────────

export type ReaderConnectionStatus = 'not_connected' | 'connecting' | 'connected';

export type TerminalPaymentStatus =
  | 'idle'
  | 'creating_intent'
  | 'waiting_for_input'
  | 'processing'
  | 'success'
  | 'error';

export interface TerminalPaymentResult {
  paymentIntentId: string;
  status: string;
  amount: number;
  ticketId?: string;
}

// Navigation types
export type RootStackParamList = {
  MainTabs: undefined;
  Raffle: { id: string };
  BuyTickets: { raffleId: string; donationForm: DonationForm };
  PaymentSuccess: { ticketId: string; quantity: number };
  FreeTicket: { raffleId: string };
  Contact: undefined;
  Rules: { id: string };
  PrivacyPolicy: undefined;
  GeoRestricted: undefined;
  // Admin
  AdminLogin: undefined;
  AdminDashboard: undefined;
  EditRaffle: { id: string };
  PreviewRaffle: { id: string };
  AdminTickets: undefined;
  AdminWinners: undefined;
  InPersonPayment: { id: string };
  StripeConnectLink: { raffleId: string };
};

export type MainTabParamList = {
  Home: undefined;
  About: undefined;
  Contact: undefined;
  AdminLogin: undefined;
};
