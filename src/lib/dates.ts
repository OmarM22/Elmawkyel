/*
 * UTC calendar-date helpers ("YYYY-MM-DD" strings).
 * All arithmetic runs on UTC timestamps so results never shift with the
 * server/browser timezone (a local-midnight + toISOString round-trip
 * loses a day east of Greenwich — verified incident on the weekly page).
 */
const DAY_MS = 86_400_000;

export function addDays(dateStr: string, days: number): string {
  return new Date(Date.parse(`${dateStr}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}
