// Fill free time with recommended sights: up to two per free day, one on travel days
// (scheduled after you arrive), skipping anything already in the trip.

import type { Item, Trip } from '../types';
import type { Sight } from './places';
import { datePart } from './time';
import { isTransport, placeOnDate, uid } from './trips';

export function sightToItem(s: Sight, date: string, time: string, tz: string, city?: string, source: Item['source'] = 'recommended'): Item {
  return {
    id: uid(),
    kind: 'sight',
    title: s.name,
    start: `${date}T${time}`,
    startTz: tz,
    location: { name: s.name, city, lat: s.lat, lon: s.lon },
    notes: s.extract ?? s.description,
    imageUrl: s.imageUrl,
    url: s.url,
    source,
    updatedAt: Date.now(),
  };
}

const PLANNED = new Set<Item['kind']>(['activity', 'sight', 'restaurant']);

export function autoPlan(trip: Trip, city: string, sights: Sight[], tz: string, dates: string[]): Item[] {
  const taken = new Set(trip.items.map((i) => i.title.toLowerCase()));
  const pool = sights.filter((s) => !taken.has(s.name.toLowerCase()));
  const out: Item[] = [];
  const live = trip.items.filter((i) => i.status !== 'cancelled');

  for (const date of dates) {
    if (placeOnDate(trip, date)?.city?.toLowerCase() !== city.toLowerCase()) continue;
    const onDay = live.filter((i) => datePart(i.start) === date);
    const planned = onDay.filter((i) => PLANNED.has(i.kind)).length;
    // Overnight flights depart the day before, so match arrivals on their arrival date.
    const arriving = live.filter((i) => isTransport(i) && datePart(i.end ?? i.start) === date && i.to?.city?.toLowerCase() === city.toLowerCase());
    const departing = onDay.filter((i) => isTransport(i) && i.from?.city?.toLowerCase() === city.toLowerCase());
    if (departing.some((i) => i.start.slice(11) < '15:00')) continue; // leaving early: no time
    let slots: string[];
    if (arriving.length) {
      const lastArrival = arriving.map((i) => (i.end ?? i.start).slice(11, 16)).sort().pop() ?? '12:00';
      slots = lastArrival < '15:00' ? ['17:00'] : [];
    } else slots = ['10:00', '14:30'];
    for (const time of slots.slice(planned)) {
      const s = pool.shift();
      if (!s) return out;
      out.push(sightToItem(s, date, time, tz, city));
    }
  }
  return out;
}
