import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, epochToLocal, formatClock, formatRange, localToEpoch, tzOffsetMs } from '../src/lib/time';

describe('time zones', () => {
  it('converts wall-clock to epoch across zones', () => {
    // 19:30 in New York on 2 Nov 2026 (EST, UTC-5) is 00:30 UTC next day.
    expect(new Date(localToEpoch('2026-11-02T19:30', 'America/New_York')).toISOString()).toBe('2026-11-03T00:30:00.000Z');
    expect(new Date(localToEpoch('2026-07-01T09:00', 'Europe/London')).toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(new Date(localToEpoch('2026-12-01T13:00', 'Asia/Tokyo')).toISOString()).toBe('2026-12-01T04:00:00.000Z');
  });

  it('handles the DST changeover day', () => {
    // US DST ends 1 Nov 2026; 12:00 that day is EST (UTC-5).
    expect(new Date(localToEpoch('2026-11-01T12:00', 'America/New_York')).toISOString()).toBe('2026-11-01T17:00:00.000Z');
    expect(tzOffsetMs(Date.UTC(2026, 6, 1), 'America/New_York')).toBe(-4 * 3600_000);
  });

  it('round-trips epoch to local', () => {
    const e = localToEpoch('2026-11-08T07:35', 'Europe/London');
    expect(epochToLocal(e, 'Europe/London')).toBe('2026-11-08T07:35');
    expect(epochToLocal(e, 'America/New_York')).toBe('2026-11-08T02:35');
  });
});

describe('formatting', () => {
  it('formats clocks', () => {
    expect(formatClock('00:05', true)).toBe('12:05 AM');
    expect(formatClock('12:00', true)).toBe('12:00 PM');
    expect(formatClock('19:30', true)).toBe('7:30 PM');
    expect(formatClock('7:05', false)).toBe('07:05');
  });
  it('formats ranges', () => {
    expect(formatRange('2026-11-02', '2026-11-09')).toBe('Nov 2 – 9, 2026');
    expect(formatRange('2026-10-30', '2026-11-04')).toBe('Oct 30 – Nov 4, 2026');
    expect(formatRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
  });
  it('does date math', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-11-02', '2026-11-09')).toBe(7);
  });
});
