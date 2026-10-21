const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** 1234.5 -> "1,234.50" */
export function money(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "2026-09-12" -> "09/12/2026" */
export function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/** "2026-09-12" -> "September 12, 2026" */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-09-12" -> "09-12-2026" (the EIN letter's style) */
export function dashDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

export function monthName(iso: string): string {
  return MONTHS[Number(iso.slice(5, 7)) - 1] as string;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last day of the given year and month (1-12). */
export function endOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** "SSN 512-40-6789" style digits kept only as the last four. */
export function lastFour(digits: string): string {
  return digits.replace(/\D/g, "").slice(-4);
}
