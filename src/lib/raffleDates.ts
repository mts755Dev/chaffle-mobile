/** Raffle draw times are always US Eastern (EST/EDT) — mirrors web lib/raffleDates.ts. */
export const RAFFLE_TIMEZONE = 'America/New_York';

/**
 * Interpret draw_date as Eastern wall time → UTC Date.
 * - `YYYY-MM-DD` (legacy) → end of that day in Eastern (23:59:59)
 * - `YYYY-MM-DDTHH:mm` / `YYYY-MM-DDTHH:mm:ss` → that Eastern local time
 * - ISO with non-zero offset → absolute instant
 * - Trailing Z / ±00:00 is treated as Eastern wall clock (PostgREST often
 *   appends Z to timezone-less values; naive UTC would draw 4h early in EDT)
 */
export function parseRaffleDrawDate(value: string): Date {
  let trimmed = value.trim().replace(' ', 'T');
  if (!trimmed) return new Date(NaN);

  // Strip false UTC markers; keep real non-zero offsets as absolute.
  const fakeUtc = trimmed.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)(?:Z|[+-]00:00)$/i,
  );
  if (fakeUtc) {
    trimmed = fakeUtc[1];
  } else if (/[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }

  const [year, month, day] = trimmed.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return new Date(NaN);

  let hour = 23;
  let minute = 59;
  let second = 59;
  const timeMatch = trimmed.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
    second = Number(timeMatch[3] ?? 0);
  }

  return easternLocalToUtc(year, month, day, hour, minute, second);
}

/** Format draw time in Eastern for display (includes EST/EDT). */
export function formatRaffleDate(value: string | Date): string {
  const date =
    value instanceof Date ? value : parseRaffleDrawDate(String(value));
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: RAFFLE_TIMEZONE,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

/** Value for datetime-local style input — Eastern wall clock, no zone. */
export function toRaffleDateTimeLocalValue(
  value: string | null | undefined,
): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T23:59`;
  }

  const localMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (localMatch && !/[zZ]|[+-]\d{2}:\d{2}/.test(trimmed)) {
    return `${localMatch[1]}T${localMatch[2]}:${localMatch[3]}`;
  }

  const date = parseRaffleDrawDate(trimmed);
  if (Number.isNaN(date.getTime())) return '';

  const parts = easternParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Persist datetime-local as Eastern wall time string. */
export function fromRaffleDateTimeLocalValue(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return value.trim();
  return `${match[1]}T${match[2]}:${match[3]}`;
}

/** True when Eastern wall-clock draw_date is at or before `now`. */
export function isRaffleDrawDue(
  drawDate: string | null | undefined,
  now = new Date(),
): boolean {
  if (!drawDate) return false;
  const due = parseRaffleDrawDate(drawDate);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() <= now.getTime();
}

function easternParts(date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: RAFFLE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  );
  let hour = map.hour ?? '00';
  if (hour === '24') hour = '00';
  return {
    year: map.year!,
    month: map.month!,
    day: map.day!,
    hour,
    minute: map.minute!,
    second: map.second!,
  };
}

function easternLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desiredAsUtc;

  for (let i = 0; i < 3; i++) {
    const parts = easternParts(new Date(guess));
    const asLocal = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += desiredAsUtc - asLocal;
  }

  return new Date(guess);
}
