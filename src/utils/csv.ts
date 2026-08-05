/** CSV helpers — matches chaffle/lib/csv.ts (RFC 4180 + Excel BOM). */

/** Escape a single CSV field (RFC 4180). */
export function escapeCsvField(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return '';

  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Build a CSV string from headers + row objects. Includes UTF-8 BOM for Excel. */
export function buildCsv(
  headers: { key: string; label: string }[],
  rows: Record<string, string | number | boolean | null | undefined>[],
): string {
  const headerLine = headers.map((h) => escapeCsvField(h.label)).join(',');
  const bodyLines = rows.map((row) =>
    headers.map((h) => escapeCsvField(row[h.key])).join(','),
  );
  return `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}\r\n`;
}

/** Safe filename segment from a raffle title. */
export function slugifyFilename(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'raffle';
}
