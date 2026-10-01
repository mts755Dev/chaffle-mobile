/**
 * ponytail: assert-based self-check for amount↔quantity binding (mobile copy).
 * Run from chaffle: npx tsx ../chaffle-mobile/src/utils/ticketPricing.selfcheck.ts
 */
import {
  assertValidTicketPricing,
  expectedQuantityForAmount,
  isValidPaidTicketPricing,
} from './ticketPricing';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(expectedQuantityForAmount(5) === 1, 'preset $5');
assert(isValidPaidTicketPricing(100, 200), 'preset $100');
assert(!isValidPaidTicketPricing(1, 10000), 'reject underpay');
assertValidTicketPricing({ amount: 0, quantity: 1, isFree: true });

console.log('ticketPricing.selfcheck (mobile): ok');
