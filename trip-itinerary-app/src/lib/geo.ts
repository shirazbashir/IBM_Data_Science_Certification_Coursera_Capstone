// Geocoding with free services: Open-Meteo (cities, includes time zone) and
// OpenStreetMap Nominatim (street addresses, airports). Results are cached forever.

import type { Place } from '../types';
import { cached, fetchJson } from './db';

export interface GeoPoint {
  lat: number;
  lon: number;
  tz?: string;
  label?: string;
}

const FOREVER = 365 * 86_400_000;

export function geocodeCity(city: string, country?: string): Promise<GeoPoint | undefined> {
  const key = `geo:city:${city}|${country ?? ''}`.toLowerCase();
  return cached(key, FOREVER, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
    const data = await fetchJson<{
      results?: { latitude: number; longitude: number; timezone: string; name: string; country: string; country_code: string }[];
    }>(url);
    const results = data.results ?? [];
    const c = country?.toLowerCase();
    const hit =
      (c && results.find((r) => r.country.toLowerCase() === c || r.country_code.toLowerCase() === c)) || results[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude, tz: hit.timezone, label: `${hit.name}, ${hit.country}` } : undefined;
  });
}

// Nominatim's usage policy asks for at most one request per second.
let nominatimChain: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = nominatimChain.then(fn, fn);
  nominatimChain = next.then(
    () => new Promise((r) => setTimeout(r, 1100)),
    () => new Promise((r) => setTimeout(r, 1100)),
  );
  return next;
}

export function geocodeQuery(q: string): Promise<GeoPoint | undefined> {
  const key = `geo:q:${q}`.toLowerCase();
  return cached(key, FOREVER, () =>
    throttled(async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
      const data = await fetchJson<{ lat: string; lon: string; display_name: string }[]>(url, {
        headers: { Accept: 'application/json' },
      });
      return data[0] ? { lat: +data[0].lat, lon: +data[0].lon, label: data[0].display_name } : undefined;
    }),
  );
}

/** Best-effort coordinates for a place: explicit → address → airport code → city. */
export async function locate(place: Place | undefined): Promise<GeoPoint | undefined> {
  if (!place) return undefined;
  if (place.lat != null && place.lon != null) return { lat: place.lat, lon: place.lon };
  try {
    if (place.address) {
      const hit = await geocodeQuery(place.address);
      if (hit) return hit;
    }
    if (place.code && /^[A-Z]{3}$/.test(place.code)) {
      const hit = await geocodeQuery(`${place.code} airport`);
      if (hit) return hit;
    }
    if (place.name && place.city) {
      const hit = await geocodeQuery(`${place.name}, ${place.city}`);
      if (hit) return hit;
    }
    if (place.city) return await geocodeCity(place.city, place.country);
  } catch {
    // Offline or rate-limited: callers degrade gracefully.
  }
  return undefined;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(km: number, units: 'imperial' | 'metric'): string {
  if (units === 'metric') return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const mi = km * 0.621371;
  return mi < 0.2 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(1)} mi`;
}
