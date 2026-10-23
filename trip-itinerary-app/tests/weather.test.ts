import { describe, expect, it } from 'vitest';
import { adviseClothing, packingList } from '../src/lib/clothing';
import { sunTimes } from '../src/lib/sun';
import { epochToLocal } from '../src/lib/time';
import { fToC, windChillF } from '../src/lib/units';
import type { DayWeather } from '../src/types';

const day = (p: Partial<DayWeather>): DayWeather => ({
  date: '2026-11-10', hiF: 60, loF: 50, feelsHiF: 60, feelsLoF: 50, windMph: 5, rainChance: 10, uv: 2, code: 1, basis: 'forecast', ...p,
});

describe('wind chill', () => {
  it('matches the NWS table', () => {
    // NWS chart: 30°F with 15 mph wind feels like 19°F; 0°F with 20 mph is -22°F.
    expect(Math.round(windChillF(30, 15)!)).toBe(19);
    expect(Math.round(windChillF(0, 20)!)).toBe(-22);
  });
  it('is undefined when warm or calm', () => {
    expect(windChillF(55, 20)).toBeUndefined();
    expect(windChillF(30, 2)).toBeUndefined();
  });
  it('converts units', () => expect(fToC(212)).toBe(100));
});

describe('sun times', () => {
  it('London around the winter solstice', () => {
    const s = sunTimes('2026-12-21', 51.5074, -0.1278, 'Europe/London');
    expect(epochToLocal(s.sunrise!, 'Europe/London').slice(11)).toMatch(/^08:0[0-9]$/);
    expect(epochToLocal(s.sunset!, 'Europe/London').slice(11)).toMatch(/^15:5[0-9]$/);
  });
  it('New York in summer (DST)', () => {
    const s = sunTimes('2026-06-21', 40.7128, -74.006, 'America/New_York');
    expect(epochToLocal(s.sunrise!, 'America/New_York').slice(11)).toMatch(/^05:2[0-9]$/);
    expect(epochToLocal(s.sunset!, 'America/New_York').slice(11)).toMatch(/^20:3[0-9]$/);
  });
  it('reports polar night in Tromsø in December', () => {
    expect(sunTimes('2026-12-21', 69.65, 18.96, 'Europe/Oslo').polar).toBe('night');
  });
});

describe('clothing advice', () => {
  it('bundles up for a windy freezing day', () => {
    const ids = adviseClothing(day({ hiF: 30, loF: 18, feelsHiF: 22, feelsLoF: 8, windMph: 22 })).items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['parka', 'gloves', 'hat', 'shell']));
  });
  it('suggests rain gear and sun protection when needed', () => {
    expect(adviseClothing(day({ rainChance: 80 })).items.map((i) => i.id)).toEqual(expect.arrayContaining(['umbrella', 'waterproof']));
    expect(adviseClothing(day({ hiF: 90, loF: 75, feelsHiF: 95, feelsLoF: 76, uv: 9 })).items.map((i) => i.id)).toEqual(
      expect.arrayContaining(['breathable', 'sunscreen', 'water']),
    );
  });
  it('builds a packing list counted by days', () => {
    const list = packingList([day({ rainChance: 70 }), day({ rainChance: 10 })]);
    expect(list.find((p) => p.id === 'umbrella')?.days).toBe(1);
    expect(list[0].days).toBe(2);
  });
});
