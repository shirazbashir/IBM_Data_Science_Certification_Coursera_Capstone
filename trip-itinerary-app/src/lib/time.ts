// Wall-clock + time zone helpers. All functions are pure and work offline.

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC at instant `epochMs`, in ms (e.g. -4h for New York in summer). */
export function tzOffsetMs(epochMs: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Parse "YYYY-MM-DDTHH:mm" (or a bare date) into numeric parts. */
export function parseLocal(local: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local);
  if (!m) throw new Error(`Bad local time: ${local}`);
  return {
    y: +m[1],
    mo: +m[2],
    d: +m[3],
    h: m[4] ? +m[4] : 0,
    mi: m[5] ? +m[5] : 0,
    hasTime: !!m[4],
  };
}

/** Convert a local wall-clock time in `tz` to an absolute epoch (ms). */
export function localToEpoch(local: string, tz: string): number {
  const { y, mo, d, h, mi } = parseLocal(local);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (!isValidTz(tz)) return guess;
  let epoch = guess - tzOffsetMs(guess, tz);
  // A second pass settles DST transitions.
  epoch = guess - tzOffsetMs(epoch, tz);
  return epoch;
}

/** Format an absolute instant as local "YYYY-MM-DDTHH:mm" in `tz`. */
export function epochToLocal(epochMs: number, tz: string): string {
  const shifted = new Date(epochMs + (isValidTz(tz) ? tzOffsetMs(epochMs, tz) : 0));
  return shifted.toISOString().slice(0, 16);
}

export function datePart(local: string): string {
  return local.slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const { y, mo, d } = parseLocal(date);
  return new Date(Date.UTC(y, mo - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const pa = parseLocal(a);
  const pb = parseLocal(b);
  return Math.round((Date.UTC(pb.y, pb.mo - 1, pb.d) - Date.UTC(pa.y, pa.mo - 1, pa.d)) / 86_400_000);
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Today's date in the device time zone. */
export function todayLocal(now = Date.now()): string {
  return epochToLocal(now, Intl.DateTimeFormat().resolvedOptions().timeZone).slice(0, 10);
}

export function formatClock(hhmm: string, hour12: boolean): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!hour12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "6:30 PM" from "2026-11-02T18:30". */
export function formatLocalTime(local: string, hour12: boolean): string {
  return formatClock(local.slice(11, 16), hour12);
}

/** Format an instant in a zone, e.g. sunrise times. */
export function formatEpochTime(epochMs: number, tz: string, hour12: boolean): string {
  return formatLocalTime(epochToLocal(epochMs, tz), hour12);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function weekdayIndex(date: string): number {
  const { y, mo, d } = parseLocal(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** "Mon, Nov 2" */
export function formatDateShort(date: string): string {
  const { mo, d } = parseLocal(date);
  return `${WEEKDAY[weekdayIndex(date)]}, ${MONTH[mo - 1]} ${d}`;
}

/** "Monday, November 2" — used for screen-reader labels and day headers. */
export function formatDateLong(date: string): string {
  const { mo, d } = parseLocal(date);
  return `${WEEKDAY_LONG[weekdayIndex(date)]}, ${MONTH_LONG[mo - 1]} ${d}`;
}

/** "Nov 2 – 9, 2026" or "Oct 30 – Nov 4, 2026". */
export function formatRange(start: string, end: string): string {
  const a = parseLocal(start);
  const b = parseLocal(end);
  if (start === end) return `${MONTH[a.mo - 1]} ${a.d}, ${a.y}`;
  if (a.y !== b.y) return `${MONTH[a.mo - 1]} ${a.d}, ${a.y} – ${MONTH[b.mo - 1]} ${b.d}, ${b.y}`;
  if (a.mo === b.mo) return `${MONTH[a.mo - 1]} ${a.d} – ${b.d}, ${a.y}`;
  return `${MONTH[a.mo - 1]} ${a.d} – ${MONTH[b.mo - 1]} ${b.d}, ${a.y}`;
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "in 7 days", "tomorrow", "today", "ended". */
export function relativeDays(fromDate: string, toDate: string): string {
  const n = daysBetween(fromDate, toDate);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1) return `In ${n} days`;
  if (n === -1) return 'Yesterday';
  return `${-n} days ago`;
}
