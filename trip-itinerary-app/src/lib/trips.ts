// Trip assembly: de-duplicating bookings, grouping them into trips, building the
// day-by-day timeline, and "leave by" estimates.

import type { Item, Place, Settings, Trip } from '../types';
import { addDays, datePart, daysBetween, eachDate, epochToLocal, localToEpoch } from './time';

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

const TRANSPORT = new Set(['flight', 'train', 'bus', 'ferry']);
export const isTransport = (i: Item) => TRANSPORT.has(i.kind);

/** Stable identity of a booking so update/cancellation emails replace rather than duplicate. */
export function itemKey(i: Item): string {
  const day = datePart(i.start);
  const norm = (s?: string) => (s ?? '').toUpperCase().replace(/\s+/g, '');
  if (isTransport(i) && i.number) return `${i.kind}|${norm(i.number)}|${day}`;
  if (i.kind === 'hotel') return `hotel|${norm(i.confirmation) || norm(i.location?.name ?? i.title)}|${i.confirmation ? '' : day}`;
  if (i.kind === 'car') return `car|${norm(i.confirmation) || day}`;
  if (i.confirmation) return `${i.kind}|${norm(i.confirmation)}|${day}`;
  return `${i.kind}|${norm(i.title)}|${i.start}`;
}

export function itemEndDate(i: Item): string {
  return datePart(i.end && i.end > i.start ? i.end : i.start);
}

/** Recompute a trip's date range, destination and default name from its items. */
export function recomputeTrip(trip: Trip, settings?: Pick<Settings, 'homeCity'>): Trip {
  const items = [...trip.items].sort((a, b) => a.start.localeCompare(b.start));
  // A hand-made trip named after a place ("Lisbon") gets weather/photos before any bookings.
  const fallbackDest = trip.destination ?? (trip.manualRange && trip.name ? { city: trip.name } : undefined);
  if (items.length === 0) return { ...trip, items, destination: fallbackDest };
  const starts = items.map((i) => datePart(i.start));
  const ends = items.map(itemEndDate);
  if (trip.manualRange) {
    starts.push(trip.startDate);
    ends.push(trip.endDate);
  }
  const startDate = starts.reduce((a, b) => (a < b ? a : b));
  const endDate = ends.reduce((a, b) => (a > b ? a : b));
  const cities = tripCities({ ...trip, items }, settings?.homeCity);
  const destination = cities[0]?.place ?? fallbackDest;
  const autoName =
    cities.length === 0
      ? 'New trip'
      : cities.length === 1
        ? cities[0].city
        : cities.length === 2
          ? `${cities[0].city} & ${cities[1].city}`
          : `${cities[0].city}, ${cities[1].city} & more`;
  return {
    ...trip,
    items,
    startDate,
    endDate,
    destination,
    name: trip.nameLocked ? trip.name : autoName,
  };
}

export interface CityStay {
  city: string;
  place: Place;
  nights: number;
  firstDate: string;
}

/** Cities visited, in order of first visit; home city excluded. */
export function tripCities(trip: Trip, homeCity?: string): CityStay[] {
  const items = trip.items.filter((i) => i.status !== 'cancelled');
  const firstFlight = items.find((i) => i.kind === 'flight');
  const home = (homeCity ?? firstFlight?.from?.city ?? '').toLowerCase();
  const map = new Map<string, CityStay>();
  const visit = (p: Place | undefined, date: string, nights: number) => {
    const city = p?.city?.trim();
    if (!city || city.toLowerCase() === home) return;
    const k = city.toLowerCase();
    const prev = map.get(k);
    if (prev) {
      prev.nights += nights;
      if (date < prev.firstDate) prev.firstDate = date;
    } else map.set(k, { city, place: p!, nights, firstDate: date });
  };
  for (const i of items) {
    if (i.kind === 'hotel') visit(i.location, datePart(i.start), Math.max(1, daysBetween(datePart(i.start), itemEndDate(i))));
    else if (isTransport(i)) visit(i.to, datePart(i.end ?? i.start), 0);
    else visit(i.location, datePart(i.start), 0);
  }
  return [...map.values()].sort((a, b) => b.nights - a.nights || a.firstDate.localeCompare(b.firstDate));
}

/** Where the traveler is on a given date (for the day's weather and sights). */
export function placeOnDate(trip: Trip, date: string): Place | undefined {
  const items = trip.items.filter((i) => i.status !== 'cancelled');
  const hotel = items.find((i) => i.kind === 'hotel' && datePart(i.start) <= date && date < itemEndDate(i));
  if (hotel?.location?.city) return hotel.location;
  const arrivals = items.filter((i) => isTransport(i) && datePart(i.end ?? i.start) <= date && i.to?.city);
  const lastArrival = arrivals[arrivals.length - 1];
  if (lastArrival && date <= trip.endDate) return lastArrival.to;
  return trip.destination;
}

/** Add bookings to trips: replace duplicates, apply cancellations, group into trips. */
export function mergeItems(trips: Trip[], incoming: Item[], settings?: Pick<Settings, 'homeCity'>): Trip[] {
  const live = trips.filter((t) => !t.deleted).map((t) => ({ ...t, items: [...t.items] }));
  const byKey = new Map<string, { trip: Trip; index: number }>();
  live.forEach((trip) => trip.items.forEach((item, index) => byKey.set(itemKey(item), { trip, index })));

  for (const raw of incoming) {
    const key = itemKey(raw);
    const hit = byKey.get(key);
    if (hit) {
      const prev = hit.trip.items[hit.index];
      if (raw.status === 'cancelled') {
        hit.trip.items.splice(hit.index, 1);
        byKey.delete(key);
        // Re-index the remaining items of this trip.
        hit.trip.items.forEach((item, index) => byKey.set(itemKey(item), { trip: hit.trip, index }));
      } else {
        // Newer email wins, but keep user notes and identity.
        hit.trip.items[hit.index] = { ...prev, ...stripEmpty(raw), id: prev.id, tripId: prev.tripId, notes: prev.notes ?? raw.notes };
      }
      continue;
    }
    if (raw.status === 'cancelled') continue;
    const start = datePart(raw.start);
    const end = itemEndDate(raw);
    let trip = live.find((t) => !t.sample && start <= addDays(t.endDate, 1) && end >= addDays(t.startDate, -1));
    if (!trip) {
      trip = { id: uid(), name: 'New trip', startDate: start, endDate: end, items: [], updatedAt: Date.now() };
      live.push(trip);
    }
    const item = { ...raw, tripId: trip.id };
    trip.items.push(item);
    trip.startDate = start < trip.startDate ? start : trip.startDate;
    trip.endDate = end > trip.endDate ? end : trip.endDate;
    byKey.set(key, { trip, index: trip.items.length - 1 });
  }

  // Merge trips whose ranges now touch (e.g. a hotel email bridged two flights).
  live.sort((a, b) => a.startDate.localeCompare(b.startDate));
  const merged: Trip[] = [];
  for (const t of live) {
    const prev = merged[merged.length - 1];
    if (prev && !prev.sample && !t.sample && t.items.length && prev.items.length && t.startDate <= addDays(prev.endDate, 1)) {
      prev.items.push(...t.items.map((i) => ({ ...i, tripId: prev.id })));
      prev.endDate = t.endDate > prev.endDate ? t.endDate : prev.endDate;
      prev.nameLocked ||= t.nameLocked;
      prev.packed = { ...t.packed, ...prev.packed };
      prev.updatedAt = Date.now();
    } else merged.push(t);
  }
  const removed = trips.filter((t) => !t.deleted && !merged.some((m) => m.id === t.id));
  return [
    ...merged.filter((t) => t.items.length > 0).map((t) => ({ ...recomputeTrip(t, settings), updatedAt: Date.now() })),
    // Trips absorbed into another (or emptied) become tombstones so sync can delete them.
    ...removed.map((t) => ({ ...t, deleted: true, items: [], updatedAt: Date.now() })),
    ...merged.filter((t) => t.items.length === 0).map((t) => ({ ...t, deleted: true, updatedAt: Date.now() })),
  ];
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Partial<T>;
}

// ---------- Timeline ----------

export type EntryRole = 'single' | 'checkin' | 'checkout' | 'pickup' | 'dropoff';

export interface TimelineEntry {
  item: Item;
  role: EntryRole;
  /** Local wall-clock time for sorting/display, "YYYY-MM-DDTHH:mm". */
  at: string;
}

export interface TimelineDay {
  date: string;
  entries: TimelineEntry[];
  /** Hotel you are staying at overnight (not checking in/out today). */
  stayingAt?: Item;
}

export function hasTraveler(item: Item, traveler: string | undefined): boolean {
  if (!traveler) return true;
  if (!item.travelers?.length) return true; // unassigned items belong to everyone
  return item.travelers.some((t) => t.toLowerCase() === traveler.toLowerCase());
}

export function timeline(trip: Trip, traveler?: string): TimelineDay[] {
  const items = trip.items.filter((i) => i.status !== 'cancelled' && hasTraveler(i, traveler));
  const days = new Map<string, TimelineDay>(eachDate(trip.startDate, trip.endDate).map((d) => [d, { date: d, entries: [] }]));
  const push = (entry: TimelineEntry) => days.get(datePart(entry.at))?.entries.push(entry);

  for (const item of items) {
    if (item.kind === 'hotel') {
      const inTime = item.start.length > 10 ? item.start : `${item.start}T${item.checkInTime ?? '15:00'}`;
      push({ item, role: 'checkin', at: inTime });
      if (item.end) {
        const outTime = item.end.length > 10 ? item.end : `${item.end}T${item.checkOutTime ?? '11:00'}`;
        push({ item, role: 'checkout', at: outTime });
        for (const d of eachDate(addDays(datePart(item.start), 1), addDays(datePart(item.end), -1))) {
          const day = days.get(d);
          if (day && !day.stayingAt) day.stayingAt = item;
        }
      }
    } else if (item.kind === 'car' && item.end && datePart(item.end) !== datePart(item.start)) {
      push({ item, role: 'pickup', at: item.start });
      push({ item, role: 'dropoff', at: item.end });
    } else {
      push({ item, role: 'single', at: item.start });
    }
  }
  for (const day of days.values()) day.entries.sort((a, b) => a.at.localeCompare(b.at) || roleOrder(a.role) - roleOrder(b.role));
  return [...days.values()];
}

const roleOrder = (r: EntryRole) => (r === 'checkout' ? 0 : r === 'checkin' ? 2 : 1);

/** Item-specific duration, using both time zones (so flights across zones are right). */
export function itemDurationMs(i: Item): number | undefined {
  if (!i.end || i.kind === 'hotel') return undefined;
  const ms = localToEpoch(i.end, i.endTz ?? i.startTz) - localToEpoch(i.start, i.startTz);
  return ms > 0 ? ms : undefined;
}

// ---------- Leave-by estimates ----------

export interface LeaveBy {
  /** Absolute instant to leave. */
  epoch: number;
  /** Local wall-clock leave time in the departure zone. */
  local: string;
  explanation: string;
}

/**
 * When to leave for a departure: airport/station buffer plus a travel-time allowance.
 * This is a planning estimate; live traffic isn't considered.
 */
export function leaveBy(i: Item, s: Pick<Settings, 'intlBufferHours' | 'domesticBufferHours'>, travelMin = 45): LeaveBy | undefined {
  if (!isTransport(i) || i.start.length <= 10) return undefined;
  const depart = localToEpoch(i.start, i.startTz);
  let bufferMin: number;
  let why: string;
  if (i.kind === 'flight') {
    const intl = !!(i.from?.country && i.to?.country && i.from.country.toLowerCase() !== i.to.country.toLowerCase());
    bufferMin = (intl ? s.intlBufferHours : s.domesticBufferHours) * 60;
    why = `${intl ? 'International' : 'Domestic'} flight: be at the airport ${bufferMin / 60}h early`;
  } else {
    bufferMin = 20;
    why = 'Be at the station 20 min early';
    travelMin = Math.min(travelMin, 30);
  }
  const epoch = depart - (bufferMin + travelMin) * 60_000;
  return { epoch, local: epochToLocal(epoch, i.startTz), explanation: `${why}, plus ~${travelMin} min to get there.` };
}

export function tripTravelers(trip: Trip): string[] {
  const set = new Map<string, string>();
  for (const i of trip.items) for (const t of i.travelers ?? []) set.set(t.toLowerCase(), t);
  return [...set.values()];
}

export function tripStatus(trip: Trip, today: string): 'upcoming' | 'now' | 'past' {
  if (today < trip.startDate) return 'upcoming';
  if (today > trip.endDate) return 'past';
  return 'now';
}
