// Sunrise / sunset / golden hour, computed on-device (works offline, any date).
// Based on the well-known NOAA-derived formulas popularised by SunCalc.

import { localToEpoch } from './time';

const rad = Math.PI / 180;
const dayMs = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const J0 = 0.0009;
const e = rad * 23.4397; // obliquity of the Earth

const toJulian = (ms: number) => ms / dayMs - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * dayMs;
const toDays = (ms: number) => toJulian(ms) - J2000;

const declination = (l: number) => Math.asin(Math.sin(e) * Math.sin(l));
const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
}
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, d: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

export interface SunTimes {
  /** Absolute instants (ms). `undefined` during polar day/night. */
  sunrise?: number;
  sunset?: number;
  /** Evening golden hour begins (sun 6° above horizon). */
  goldenHour?: number;
  /** End of civil twilight (sun 6° below horizon). */
  dusk?: number;
  /** Daylight length in ms (0 for polar night, 24h for midnight sun). */
  daylightMs: number;
  polar?: 'day' | 'night';
}

/** Sun times for local calendar `date` ("YYYY-MM-DD") at a location in time zone `tz`. */
export function sunTimes(date: string, lat: number, lon: number, tz: string): SunTimes {
  const noon = localToEpoch(`${date}T12:00`, tz);
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(noon);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);

  const setFor = (deg: number) => {
    const w = hourAngle(deg * rad, phi, dec);
    if (Number.isNaN(w)) return undefined;
    return solarTransitJ(approxTransit(w, lw, n), M, L);
  };

  const Jset = setFor(-0.833);
  if (Jset === undefined) {
    // Sun never crosses the horizon: decide polar day vs night from noon altitude.
    const noonAltitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec));
    const polar = noonAltitude > 0 ? 'day' : 'night';
    return { polar, daylightMs: polar === 'day' ? dayMs : 0 };
  }
  const Jrise = Jnoon - (Jset - Jnoon);
  const Jgolden = setFor(6);
  const Jdusk = setFor(-6);
  return {
    sunrise: fromJulian(Jrise),
    sunset: fromJulian(Jset),
    goldenHour: Jgolden === undefined ? undefined : fromJulian(Jgolden),
    dusk: Jdusk === undefined ? undefined : fromJulian(Jdusk),
    daylightMs: fromJulian(Jset) - fromJulian(Jrise),
  };
}
