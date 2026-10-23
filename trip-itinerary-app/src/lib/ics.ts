// iCalendar (.ics) export. Opening the file on iPhone offers "Add All" to Calendar,
// and the built-in alarms give reliable reminders even without push notifications.

import type { Item, Trip } from '../types';
import { isTransport, leaveBy } from './trips';
import { localToEpoch } from './time';
import { placeQuery } from './maps';

const KIND_LABEL: Record<Item['kind'], string> = {
  flight: '✈️',
  hotel: '🏨',
  train: '🚆',
  bus: '🚌',
  car: '🚗',
  ferry: '⛴️',
  activity: '🎟️',
  restaurant: '🍽️',
  sight: '📍',
  note: '📝',
};

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

function utc(epoch: number): string {
  return new Date(epoch).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Fold lines longer than 75 octets as RFC 5545 requires. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      out.push(cur);
      cur = ' ' + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

function eventsFor(item: Item, settings: { intlBufferHours: number; domesticBufferHours: number }): string[][] {
  const start = localToEpoch(item.start.length > 10 ? item.start : `${item.start}T09:00`, item.startTz);
  const endTz = item.endTz ?? item.startTz;
  const details = [
    item.confirmation && `Confirmation: ${item.confirmation}`,
    item.number && `Number: ${item.number}`,
    item.from?.terminal && `Departs terminal ${item.from.terminal}`,
    item.seat && `Seat ${item.seat}`,
    item.travelers?.length && `Travelers: ${item.travelers.join(', ')}`,
    item.notes,
  ]
    .filter(Boolean)
    .join('\n');

  const ev = (uid: string, title: string, s: number, e: number, location: string, alarmMin?: number) => {
    const lines = [
      'BEGIN:VEVENT',
      `UID:${uid}@wayfare`,
      `DTSTAMP:${utc(Date.now())}`,
      `DTSTART:${utc(s)}`,
      `DTEND:${utc(Math.max(e, s + 15 * 60_000))}`,
      `SUMMARY:${esc(title)}`,
      location && `LOCATION:${esc(location)}`,
      details && `DESCRIPTION:${esc(details)}`,
    ].filter(Boolean) as string[];
    if (alarmMin !== undefined) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:-PT${alarmMin}M`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
    return lines;
  };

  const icon = KIND_LABEL[item.kind];
  if (item.kind === 'hotel') {
    const inAt = localToEpoch(item.start.length > 10 ? item.start : `${item.start}T${item.checkInTime ?? '15:00'}`, item.startTz);
    const out = [ev(`${item.id}-in`, `${icon} Check in: ${item.title}`, inAt, inAt + 30 * 60_000, placeQuery(item.location), 120)];
    if (item.end) {
      const outAt = localToEpoch(item.end.length > 10 ? item.end : `${item.end}T${item.checkOutTime ?? '11:00'}`, endTz);
      out.push(ev(`${item.id}-out`, `${icon} Check out: ${item.title}`, outAt - 30 * 60_000, outAt, placeQuery(item.location), 60));
    }
    return out;
  }
  const end = item.end ? localToEpoch(item.end, endTz) : start + 60 * 60_000;
  const where = isTransport(item) ? placeQuery(item.from) : placeQuery(item.location);
  const lb = leaveBy(item, settings);
  const alarm = lb ? Math.max(0, Math.round((start - lb.epoch) / 60_000) + 15) : 60;
  const out = [ev(item.id, `${icon} ${item.title}`, start, end, where, alarm)];
  if (item.kind === 'flight') {
    // Online check-in usually opens 24h before departure.
    out.push(ev(`${item.id}-checkin`, `${icon} Check in online: ${item.number ?? item.title}`, start - 24 * 3600_000, start - 24 * 3600_000 + 15 * 60_000, '', 0));
  }
  return out;
}

export function tripToIcs(trip: Trip, settings: { intlBufferHours: number; domesticBufferHours: number }, only?: Item): string {
  const items = (only ? [only] : trip.items).filter((i) => i.status !== 'cancelled');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wayfare//Trip Itinerary//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(trip.name)}`,
    ...items.flatMap((i) => eventsFor(i, settings).flat()),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^\w.-]+/g, '-');
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
