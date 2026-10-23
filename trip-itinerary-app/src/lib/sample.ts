// Demo trips (dated relative to today) so the app is explorable before Gmail is connected.

import type { Item, Trip } from '../types';
import { addDays, todayLocal } from './time';
import { recomputeTrip } from './trips';

const NY = 'America/New_York';
const LON = 'Europe/London';
const TYO = 'Asia/Tokyo';

const JFK = { name: 'John F. Kennedy International', code: 'JFK', city: 'New York', country: 'United States', lat: 40.6413, lon: -73.7781 };
const LHR = { name: 'London Heathrow', code: 'LHR', city: 'London', country: 'United Kingdom', lat: 51.47, lon: -0.4543 };
const EDI = { name: 'Edinburgh Airport', code: 'EDI', city: 'Edinburgh', country: 'United Kingdom', lat: 55.9508, lon: -3.3615 };
const HND = { name: 'Tokyo Haneda', code: 'HND', city: 'Tokyo', country: 'Japan', lat: 35.5494, lon: 139.7798 };

export function sampleTrips(today = todayLocal()): Trip[] {
  const d = (n: number) => addDays(today, n);
  const now = Date.now();
  const travelers = ['Alex Morgan', 'Sam Morgan'];
  const base = { source: 'sample' as const, updatedAt: now, status: 'confirmed' as const };

  const uk: Item[] = [
    {
      ...base, id: 's-uk-1', kind: 'flight', title: 'New York → London', provider: 'British Airways', number: 'BA 178',
      start: `${d(7)}T19:30`, startTz: NY, end: `${d(8)}T07:35`, endTz: LON,
      from: { ...JFK, terminal: '8' }, to: { ...LHR, terminal: '5' },
      confirmation: 'K7XQ2P', seat: '24A, 24B', cabin: 'World Traveller Plus', travelers,
    },
    {
      ...base, id: 's-uk-2', kind: 'hotel', title: 'The Hoxton, Holborn', provider: 'The Hoxton',
      start: `${d(8)}T15:00`, startTz: LON, end: `${d(11)}T12:00`, endTz: LON, checkInTime: '15:00', checkOutTime: '12:00',
      location: { name: 'The Hoxton, Holborn', address: '199-206 High Holborn, London WC1V 7BD, United Kingdom', city: 'London', country: 'United Kingdom', lat: 51.5178, lon: -0.1197, phone: '+44 20 7661 3000' },
      confirmation: 'HX-448120', travelers, notes: 'Cosy room, 1 king bed. Early check-in requested.',
    },
    {
      ...base, id: 's-uk-3', kind: 'activity', title: 'Tower of London & Crown Jewels', provider: 'Historic Royal Palaces',
      start: `${d(9)}T10:00`, startTz: LON, end: `${d(9)}T13:00`, endTz: LON,
      location: { name: 'Tower of London', address: 'London EC3N 4AB, United Kingdom', city: 'London', country: 'United Kingdom', lat: 51.5081, lon: -0.0759 },
      confirmation: 'HRP-99120', travelers,
    },
    {
      ...base, id: 's-uk-4', kind: 'restaurant', title: 'Dinner at Dishoom Covent Garden',
      start: `${d(9)}T19:30`, startTz: LON,
      location: { name: 'Dishoom Covent Garden', address: "12 Upper St Martin's Lane, London WC2H 9FB, United Kingdom", city: 'London', country: 'United Kingdom', lat: 51.5124, lon: -0.1271 },
      confirmation: 'Table for 2', travelers,
    },
    {
      ...base, id: 's-uk-5', kind: 'train', title: 'London → Edinburgh', provider: 'LNER', number: 'LNER 1S11',
      start: `${d(11)}T10:00`, startTz: LON, end: `${d(11)}T14:21`, endTz: LON,
      from: { name: "London King's Cross", city: 'London', country: 'United Kingdom', lat: 51.5308, lon: -0.1238 },
      to: { name: 'Edinburgh Waverley', city: 'Edinburgh', country: 'United Kingdom', lat: 55.952, lon: -3.1899 },
      coach: 'C', seat: '42, 43', confirmation: 'LN7T3K9', travelers,
    },
    {
      ...base, id: 's-uk-6', kind: 'hotel', title: 'The Balmoral', provider: 'Rocco Forte Hotels',
      start: `${d(11)}T15:00`, startTz: LON, end: `${d(14)}T11:00`, endTz: LON, checkInTime: '15:00', checkOutTime: '11:00',
      location: { name: 'The Balmoral', address: '1 Princes Street, Edinburgh EH2 2EQ, United Kingdom', city: 'Edinburgh', country: 'United Kingdom', lat: 55.9533, lon: -3.1894, phone: '+44 131 556 2414' },
      confirmation: 'RF-2208841', travelers,
    },
    {
      ...base, id: 's-uk-7', kind: 'activity', title: 'Edinburgh Castle', provider: 'Historic Environment Scotland',
      start: `${d(12)}T09:30`, startTz: LON, end: `${d(12)}T12:00`, endTz: LON,
      location: { name: 'Edinburgh Castle', address: 'Castlehill, Edinburgh EH1 2NG, United Kingdom', city: 'Edinburgh', country: 'United Kingdom', lat: 55.9486, lon: -3.1999 },
      travelers: ['Alex Morgan'],
    },
    {
      ...base, id: 's-uk-8', kind: 'flight', title: 'Edinburgh → New York', provider: 'Delta', number: 'DL 209',
      start: `${d(14)}T11:15`, startTz: LON, end: `${d(14)}T14:05`, endTz: NY,
      from: { ...EDI }, to: { ...JFK, terminal: '4' },
      confirmation: 'GQ4M7R', seat: '31C, 31D', cabin: 'Main Cabin', travelers,
    },
  ];

  const tokyo: Item[] = [
    {
      ...base, id: 's-jp-1', kind: 'flight', title: 'New York → Tokyo', provider: 'Japan Airlines', number: 'JL 5',
      start: `${d(62)}T13:25`, startTz: NY, end: `${d(63)}T16:55`, endTz: TYO,
      from: { ...JFK, terminal: '8' }, to: { ...HND, terminal: '3' }, confirmation: 'JL5T8Q', seat: '12K', cabin: 'Premium Economy',
      travelers: ['Alex Morgan'],
    },
    {
      ...base, id: 's-jp-2', kind: 'hotel', title: 'Park Hyatt Tokyo', provider: 'Hyatt',
      start: `${d(63)}T15:00`, startTz: TYO, end: `${d(67)}T12:00`, endTz: TYO, checkInTime: '15:00', checkOutTime: '12:00',
      location: { name: 'Park Hyatt Tokyo', address: '3-7-1-2 Nishi-Shinjuku, Shinjuku-ku, Tokyo 163-1055, Japan', city: 'Tokyo', country: 'Japan', lat: 35.6856, lon: 139.6909 },
      confirmation: '71938822', travelers: ['Alex Morgan'],
    },
    {
      ...base, id: 's-jp-3', kind: 'flight', title: 'Tokyo → New York', provider: 'Japan Airlines', number: 'JL 6',
      start: `${d(67)}T11:05`, startTz: TYO, end: `${d(67)}T10:40`, endTz: NY,
      from: { ...HND, terminal: '3' }, to: { ...JFK, terminal: '8' }, confirmation: 'JL5T8Q', seat: '12K', travelers: ['Alex Morgan'],
    },
  ];

  return [
    recomputeTrip({ id: 'sample-uk', name: '', startDate: d(7), endDate: d(14), items: uk.map((i) => ({ ...i, tripId: 'sample-uk' })), sample: true, updatedAt: now }),
    recomputeTrip({ id: 'sample-jp', name: '', startDate: d(62), endDate: d(67), items: tokyo.map((i) => ({ ...i, tripId: 'sample-jp' })), sample: true, updatedAt: now }),
  ];
}
