/*
 * Deterministic financial arithmetic.
 * All money is handled as integer halalas (1 SAR = 100 halalas) to avoid
 * floating-point errors. Display values are formatted, never computed, as floats.
 */

/** Convert a SAR decimal amount to integer halalas (rounds half away from float error). */
export function toHalalas(sar: number | string): number {
  const [int, frac = ""] = String(sar).split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const sign = String(sar).trim().startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(int)) * 100 + Number(fracPadded));
}

/** Multiply a daily rate (SAR) by days, returning integer halalas. */
export function mulRateDays(rateSar: number | string, days: number): number {
  return toHalalas(rateSar) * days;
}

/** Multiply rate by fractional hours (e.g. half day 0.5). Hours have 1 decimal place. */
export function mulRateHours(rateSar: number | string, hours: number): number {
  return Math.round((toHalalas(rateSar) * Math.round(hours * 10)) / 10);
}

/** Sum halalas. */
export function sumHalalas(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Format halalas as Arabic SAR display string, e.g. 120000 -> "1,200.00 ر.س". */
export function formatSAR(halalas: number): string {
  const sign = halalas < 0 ? "-" : "";
  const abs = Math.abs(halalas);
  const sar = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${sar.toLocaleString("en-US")}.${frac} ر.س`;
}
