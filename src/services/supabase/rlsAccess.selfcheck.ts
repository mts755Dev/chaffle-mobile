/**
 * ponytail: assert public catalogue vs private ticket PII access (migration 017).
 * Run: npx tsx src/services/supabase/rlsAccess.selfcheck.ts
 */
import fs from 'fs';
import path from 'path';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const raffleApiPath = path.join(__dirname, '../api/raffleApi.ts');
const ticketExportPath = path.join(__dirname, '../api/ticketExportApi.ts');
const raffleSrc = fs.readFileSync(raffleApiPath, 'utf8');
const exportSrc = fs.readFileSync(ticketExportPath, 'utf8');

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const raffle = strip(raffleSrc);
const exp = strip(exportSrc);

assert(
  raffle.includes("getDonationForms:") &&
    /getDonationForms:[\s\S]*?supabasePublic\s*\n?\s*\.from\('donation_form'\)/.test(raffle),
  'getDonationForms must use supabasePublic',
);

assert(
  /getDonationFormById:[\s\S]*?supabasePublic\s*\n?\s*\.from\('donation_form'\)/.test(raffle),
  'getDonationFormById must use supabasePublic (Preview / eye icon)',
);

assert(
  raffle.includes('PUBLIC_DONATION_FORM_COLUMNS'),
  'public donation_form reads must use column allowlist (no select *)',
);

assert(
  /getTicketsAmountByRaffle:[\s\S]*?raffle_public_totals/.test(raffle),
  'getTicketsAmountByRaffle must use raffle_public_totals RPC',
);

assert(
  /getPaidTickets:[\s\S]*?supabase\s*\n?\s*\.from\('ticket'\)/.test(raffle) &&
    !/getPaidTickets:[\s\S]*?supabasePublic\s*\n?\s*\.from\('ticket'\)/.test(raffle),
  'getPaidTickets must use authenticated supabase only (no anon PII)',
);

assert(
  /getWinnerTickets:[\s\S]*?supabase\s*\n?\s*\.from\('ticket'\)/.test(raffle) &&
    !/getWinnerTickets:[\s\S]*?supabasePublic\s*\n?\s*\.from\('ticket'\)/.test(raffle),
  'getWinnerTickets must use authenticated supabase only (no anon PII)',
);

assert(
  /hasRaffleWinner:[\s\S]*?supabasePublic\s*\n?\s*\.from\('donation_form'\)/.test(raffle),
  'hasRaffleWinner must use public donation_form.winnerTicketId',
);

assert(
  /supabasePublic\s*\n?\s*\.from\('donation_form'\)/.test(exp),
  'ticket export raffle lookup must use supabasePublic',
);

assert(
  !/supabasePublic\s*\n?\s*\.from\('ticket'\)/.test(exp),
  'ticket export must not fall back to anon ticket SELECT (PII)',
);

assert(
  /createDonationForm:[\s\S]*?supabase\s*\n?\s*\.from\('donation_form'\)/.test(raffle),
  'createDonationForm must use authenticated supabase',
);
assert(
  /updateForm:[\s\S]*?supabase\s*\n?\s*\.from\('donation_form'\)/.test(raffle),
  'updateForm must use authenticated supabase',
);

console.log(
  'rlsAccess.selfcheck: ok — catalogue public; ticket PII authenticated; totals via RPC',
);
