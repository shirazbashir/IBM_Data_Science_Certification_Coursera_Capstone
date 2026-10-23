import { describe, expect, it } from 'vitest';
import { autoPlan } from '../src/lib/autoplan';
import { tripToIcs } from '../src/lib/ics';
import { sampleTrips } from '../src/lib/sample';
import { itemKey, leaveBy, mergeItems, placeOnDate, timeline, tripCities } from '../src/lib/trips';
import type { Item } from '../src/types';
import type { Sight } from '../src/lib/places';

const base = { source: 'gmail' as const, updatedAt: 1 };
const flight = (p: Partial<Item> = {}): Item => ({
  ...base, id: 'f1', kind: 'flight', title: 'NYC → LON', number: 'BA 178',
  start: '2026-11-02T19:30', startTz: 'America/New_York', end: '2026-11-03T07:35', endTz: 'Europe/London',
  from: { code: 'JFK', city: 'New York', country: 'United States', terminal: '8' },
  to: { code: 'LHR', city: 'London', country: 'United Kingdom', terminal: '5' }, confirmation: 'ABC123', ...p,
});
const hotel = (p: Partial<Item> = {}): Item => ({
  ...base, id: 'h1', kind: 'hotel', title: 'The Hoxton', start: '2026-11-03T15:00', startTz: 'Europe/London',
  end: '2026-11-06T12:00', endTz: 'Europe/London', location: { name: 'The Hoxton', city: 'London', country: 'United Kingdom' },
  confirmation: 'HX1', ...p,
});
const back = (p: Partial<Item> = {}): Item => flight({
  id: 'f2', title: 'LON → NYC', number: 'BA 117', start: '2026-11-06T16:00', startTz: 'Europe/London', end: '2026-11-06T19:00', endTz: 'America/New_York',
  from: { code: 'LHR', city: 'London', country: 'United Kingdom' }, to: { code: 'JFK', city: 'New York', country: 'United States' }, ...p,
});

describe('mergeItems', () => {
  it('groups bookings into one trip named after the destination', () => {
    const trips = mergeItems([], [flight(), hotel(), back()]).filter((t) => !t.deleted);
    expect(trips).toHaveLength(1);
    expect(trips[0].name).toBe('London');
    expect(trips[0].startDate).toBe('2026-11-02');
    expect(trips[0].endDate).toBe('2026-11-06');
  });

  it('keeps unrelated trips apart', () => {
    const later = hotel({ id: 'h2', start: '2027-03-01T15:00', end: '2027-03-03T11:00', location: { city: 'Rome', country: 'Italy' }, confirmation: 'R1' });
    expect(mergeItems([], [flight(), hotel(), later]).filter((t) => !t.deleted)).toHaveLength(2);
  });

  it('replaces updated bookings instead of duplicating, and keeps user notes', () => {
    const [t1] = mergeItems([], [flight()]);
    t1.items[0].notes = 'aisle please';
    const [t2] = mergeItems([t1], [flight({ id: 'new', seat: '24A', from: { code: 'JFK', city: 'New York', terminal: '7' } })]).filter((t) => !t.deleted);
    expect(t2.items).toHaveLength(1);
    expect(t2.items[0].seat).toBe('24A');
    expect(t2.items[0].from?.terminal).toBe('7');
    expect(t2.items[0].notes).toBe('aisle please');
  });

  it('applies cancellations', () => {
    const [t1] = mergeItems([], [flight(), hotel()]);
    const [t2] = mergeItems([t1], [hotel({ id: 'x', status: 'cancelled' })]).filter((t) => !t.deleted);
    expect(t2.items.map((i) => i.kind)).toEqual(['flight']);
  });

  it('merges two trips when a booking bridges them', () => {
    const a = mergeItems([], [flight()]);
    const b = mergeItems(a, [back({ start: '2026-11-09T16:00', end: '2026-11-09T19:00' })]);
    expect(b.filter((t) => !t.deleted)).toHaveLength(2);
    const c = mergeItems(b, [hotel({ end: '2026-11-09T12:00' })]);
    expect(c.filter((t) => !t.deleted)).toHaveLength(1);
    expect(c.filter((t) => t.deleted)).toHaveLength(1); // tombstone for sync
  });

  it('builds stable dedupe keys', () => {
    expect(itemKey(flight())).toBe(itemKey(flight({ id: 'other', number: 'ba178' })));
  });
});

describe('timeline', () => {
  it('splits hotels into check-in and check-out and marks nights in between', () => {
    const [trip] = mergeItems([], [flight(), hotel(), back()]);
    const days = timeline(trip);
    expect(days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(days[0].entries.map((e) => e.item.kind)).toEqual(['flight']); // shown on its departure day
    expect(days[1].entries.map((e) => e.role)).toEqual(['checkin']);
    expect(days[2].stayingAt?.title).toBe('The Hoxton');
    expect(days[4].entries.map((e) => `${e.item.kind}:${e.role}`)).toEqual(['hotel:checkout', 'flight:single']);
  });

  it('filters by traveler (unassigned items belong to everyone)', () => {
    const [trip] = mergeItems([], [flight({ travelers: ['Sam Lee'] }), hotel()]);
    const days = timeline(trip, 'Alex Kim');
    expect(days.flatMap((d) => d.entries).map((e) => e.item.kind)).toEqual(['hotel', 'hotel']);
  });

  it('knows where you are each day', () => {
    const [trip] = mergeItems([], [flight(), hotel(), back()]);
    expect(placeOnDate(trip, '2026-11-04')?.city).toBe('London');
    expect(tripCities(trip).map((c) => c.city)).toEqual(['London']);
  });
});

describe('leave by', () => {
  it('uses the international buffer and departure time zone', () => {
    const lb = leaveBy(flight(), { intlBufferHours: 3, domesticBufferHours: 2 })!;
    // 19:30 − 3h − 45min = 15:45 local New York time.
    expect(lb.local).toBe('2026-11-02T15:45');
  });
  it('uses the domestic buffer for same-country flights', () => {
    const f = flight({ to: { code: 'LAX', city: 'Los Angeles', country: 'United States' } });
    expect(leaveBy(f, { intlBufferHours: 3, domesticBufferHours: 2 })!.local).toBe('2026-11-02T16:45');
  });
});

describe('calendar export', () => {
  it('emits valid-looking iCalendar with alarms', () => {
    const [trip] = mergeItems([], [flight(), hotel()]);
    const ics = tripToIcs(trip, { intlBufferHours: 3, domesticBufferHours: 2 });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261103T003000Z'); // 19:30 EST
    expect(ics).toContain('Check out: The Hoxton');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

describe('auto-plan', () => {
  const sight = (n: number): Sight => ({ id: `s${n}`, name: `Sight ${n}`, lat: 51.5, lon: -0.1, distanceKm: 1, popularity: 100 - n, url: '' });
  it('fills free days, fewer on arrival day, none on early departure day', () => {
    const [trip] = mergeItems([], [flight(), hotel(), back({ start: '2026-11-06T09:00', end: '2026-11-06T12:00' })]);
    const added = autoPlan(trip, 'London', [1, 2, 3, 4, 5, 6, 7, 8].map(sight), 'Europe/London', ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    const byDay = added.reduce<Record<string, number>>((m, i) => ((m[i.start.slice(0, 10)] = (m[i.start.slice(0, 10)] ?? 0) + 1), m), {});
    expect(byDay).toEqual({ '2026-11-03': 1, '2026-11-04': 2, '2026-11-05': 2 });
    expect(added[0].title).toBe('Sight 1');
  });
});

describe('sample data', () => {
  it('produces two well-formed trips', () => {
    const trips = sampleTrips('2026-10-23');
    expect(trips.map((t) => t.name)).toEqual(['London & Edinburgh', 'Tokyo']);
    expect(trips[0].startDate).toBe('2026-10-30');
  });
});
