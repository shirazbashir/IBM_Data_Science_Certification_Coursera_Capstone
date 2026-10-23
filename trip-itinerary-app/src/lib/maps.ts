// Deep links that open Apple Maps (native on iPhone) with directions.

import type { Place } from '../types';

export type TravelMode = 'transit' | 'driving' | 'walking';

const DIRFLG: Record<TravelMode, string> = { transit: 'r', driving: 'd', walking: 'w' };

/** A human/geocodable description of a place, most specific first. */
export function placeQuery(p: Place | undefined): string {
  if (!p) return '';
  if (p.address) return p.name && !p.address.includes(p.name) ? `${p.name}, ${p.address}` : p.address;
  const parts = [p.name, p.terminal && `Terminal ${p.terminal}`, p.city, p.country].filter(Boolean);
  if (p.code && !p.name) parts.unshift(`${p.code} Airport`);
  return parts.join(', ');
}

function point(p: Place | undefined): string {
  if (p?.lat != null && p?.lon != null) return `${p.lat},${p.lon}`;
  return placeQuery(p);
}

/** Directions to `to`, optionally from `from` (defaults to current location). */
export function directionsUrl(to: Place | undefined, from?: Place, mode: TravelMode = 'transit'): string {
  const params = new URLSearchParams();
  if (from) params.set('saddr', point(from));
  params.set('daddr', point(to));
  params.set('dirflg', DIRFLG[mode]);
  return `https://maps.apple.com/?${params}`;
}

export function mapUrl(p: Place | undefined): string {
  const params = new URLSearchParams();
  if (p?.lat != null && p?.lon != null) {
    params.set('ll', `${p.lat},${p.lon}`);
    params.set('q', p.name ?? placeQuery(p));
  } else {
    params.set('q', placeQuery(p));
  }
  return `https://maps.apple.com/?${params}`;
}
