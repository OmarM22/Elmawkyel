/*
 * Deterministic project-week math, shared by both stores.
 * weekNumber = floor(daysSinceProjectStart / 7) + 1 — identical derivation
 * in demo and Prisma modes is a correctness requirement (same attendance
 * must land in the same week regardless of backend).
 */
const DAY_MS = 86_400_000;

export function weekNumberFor(projectStart: string, dateStr: string): number {
  const start = Date.parse(`${projectStart}T00:00:00.000Z`);
  const d = Date.parse(`${dateStr}T00:00:00.000Z`);
  const diffDays = Math.max(0, Math.floor((d - start) / DAY_MS));
  return Math.floor(diffDays / 7) + 1;
}

export function weekBounds(
  projectStart: string,
  dateStr: string,
): { weekNumber: number; start: string; end: string } {
  const weekNumber = weekNumberFor(projectStart, dateStr);
  const start = Date.parse(`${projectStart}T00:00:00.000Z`);
  const toStr = (t: number): string => new Date(t).toISOString().slice(0, 10);
  return {
    weekNumber,
    start: toStr(start + (weekNumber - 1) * 7 * DAY_MS),
    end: toStr(start + ((weekNumber - 1) * 7 + 6) * DAY_MS),
  };
}
