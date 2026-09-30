/**
 * ponytail: one runnable check for Eastern draw-time parsing.
 * Run: npx tsx src/lib/raffleDates.selfcheck.ts
 */
import {
  formatRaffleDate,
  fromRaffleDateTimeLocalValue,
  isRaffleDrawDue,
  parseRaffleDrawDate,
  toRaffleDateTimeLocalValue,
} from './raffleDates';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const winter = parseRaffleDrawDate('2026-01-15T20:30');
assert(
  winter.toISOString() === '2026-01-16T01:30:00.000Z',
  `winter got ${winter.toISOString()}`,
);

const summer = parseRaffleDrawDate('2026-07-15T20:30');
assert(
  summer.toISOString() === '2026-07-16T00:30:00.000Z',
  `summer got ${summer.toISOString()}`,
);

const legacy = parseRaffleDrawDate('2026-01-15');
assert(
  legacy.toISOString() === '2026-01-16T04:59:59.000Z',
  `legacy got ${legacy.toISOString()}`,
);

// PostgREST fake-Z must still mean Eastern wall clock (not UTC)
const fakeZ = parseRaffleDrawDate('2026-09-28T15:00:00.000Z');
assert(
  fakeZ.toISOString() === '2026-09-28T19:00:00.000Z',
  `fakeZ got ${fakeZ.toISOString()}`,
);
assert(
  !isRaffleDrawDue('2026-09-28T15:00', new Date('2026-09-28T18:00:00.000Z')),
  '3pm ET must not be due at 2pm ET',
);
assert(
  isRaffleDrawDue('2026-09-28T15:00', new Date('2026-09-28T19:00:00.000Z')),
  '3pm ET must be due at 3pm ET',
);

assert(toRaffleDateTimeLocalValue('2026-01-15') === '2026-01-15T23:59', 'legacy local');
assert(fromRaffleDateTimeLocalValue('2026-01-15T20:30') === '2026-01-15T20:30', 'from local');
assert(formatRaffleDate('2026-01-15T20:30').includes('2026'), 'format year');
assert(/EST|EDT/.test(formatRaffleDate('2026-01-15T20:30')), 'format zone');

console.log('raffleDates.selfcheck: ok');
