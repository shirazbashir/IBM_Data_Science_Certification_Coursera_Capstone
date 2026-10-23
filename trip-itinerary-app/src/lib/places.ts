// Points of interest from open data, no API keys:
//  • Sightseeing: Wikipedia geosearch, ranked by 30-day page views (a good popularity proxy),
//    with photos and short descriptions.
//  • Stations: OpenStreetMap via the Overpass API (rail, metro, bus stations).
//  • Trip cover photos: the destination's Wikipedia lead image.

import { cached, fetchJson } from './db';
import { distanceKm, type GeoPoint } from './geo';

const WEEK = 7 * 86_400_000;

export interface Sight {
  id: string;
  name: string;
  description?: string;
  extract?: string;
  imageUrl?: string;
  lat: number;
  lon: number;
  distanceKm: number;
  popularity: number;
  url: string;
}

interface WikiPage {
  pageid: number;
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  coordinates?: { lat: number; lon: number }[];
  pageviews?: Record<string, number | null>;
}

const NOT_A_SIGHT =
  /\b(station|stop|school|hospital|street|road|avenue|ward|district|borough|constituency|company|hotel|neighbourhood|neighborhood|suburb|parish|electoral|apartment|office building|bank|tube|line|bus|retailer|restaurant chain|business|organisation|organization|human settlement|village|census)\b/i;

export function nearbySights(at: GeoPoint, radiusM = 10_000): Promise<Sight[]> {
  const key = `sights:${at.lat.toFixed(3)},${at.lon.toFixed(3)}:${radiusM}`;
  return cached(key, WEEK, async () => {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'geosearch',
      ggscoord: `${at.lat}|${at.lon}`,
      ggsradius: String(Math.min(radiusM, 10_000)),
      ggslimit: '50',
      prop: 'pageimages|description|coordinates|pageviews|extracts',
      piprop: 'thumbnail',
      pithumbsize: '640',
      exintro: '1',
      explaintext: '1',
      exsentences: '2',
      exlimit: '20',
      pvipdays: '30',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const data = await fetchJson<{ query?: { pages: WikiPage[] } }>(`https://en.wikipedia.org/w/api.php?${params}`);
    const sights: Sight[] = [];
    for (const p of data.query?.pages ?? []) {
      const c = p.coordinates?.[0];
      if (!c) continue;
      if (NOT_A_SIGHT.test(`${p.title} ${p.description ?? ''}`)) continue;
      const popularity = Object.values(p.pageviews ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0);
      sights.push({
        id: `wiki-${p.pageid}`,
        name: p.title,
        description: p.description,
        extract: p.extract,
        imageUrl: p.thumbnail?.source,
        lat: c.lat,
        lon: c.lon,
        distanceKm: distanceKm(at, c),
        popularity,
        url: `https://en.m.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      });
    }
    // Popular first; photos make for a better card so give them a nudge.
    return sights.sort((a, b) => b.popularity * (b.imageUrl ? 1.5 : 1) - a.popularity * (a.imageUrl ? 1.5 : 1));
  });
}

export type StationKind = 'rail' | 'metro' | 'bus' | 'tram';

export interface Station {
  id: string;
  name: string;
  kind: StationKind;
  lat: number;
  lon: number;
  distanceKm: number;
}

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function nearbyStations(at: GeoPoint, radiusM = 2500): Promise<Station[]> {
  const key = `stations:${at.lat.toFixed(3)},${at.lon.toFixed(3)}:${radiusM}`;
  return cached(key, 4 * WEEK, async () => {
    const around = `(around:${radiusM},${at.lat},${at.lon})`;
    const q = `[out:json][timeout:20];(
      node${around}[railway=station];
      node${around}[railway=halt];
      node${around}[amenity=bus_station];
      way${around}[amenity=bus_station];
      node${around}[railway=tram_stop][name];
    );out center 80;`;
    const data = await fetchJson<{ elements: OverpassEl[] }>('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: new URLSearchParams({ data: q }),
    });
    const seen = new Set<string>();
    const out: Station[] = [];
    for (const el of data.elements) {
      const t = el.tags ?? {};
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!t.name || lat == null || lon == null) continue;
      const kind: StationKind =
        t.amenity === 'bus_station'
          ? 'bus'
          : t.railway === 'tram_stop'
            ? 'tram'
            : t.station === 'subway' || t.subway === 'yes' || t.station === 'light_rail'
              ? 'metro'
              : 'rail';
      const dedupe = `${kind}:${t.name}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ id: `${el.type}-${el.id}`, name: t.name, kind, lat, lon, distanceKm: distanceKm(at, { lat, lon }) });
    }
    out.sort((a, b) => a.distanceKm - b.distanceKm);
    // Keep the nearest few of each kind.
    const counts: Record<string, number> = {};
    return out.filter((s) => (counts[s.kind] = (counts[s.kind] ?? 0) + 1) <= 3);
  });
}

export function coverImage(city: string): Promise<string | undefined> {
  return cached(`cover:${city.toLowerCase()}`, 30 * 86_400_000, async () => {
    const params = new URLSearchParams({
      action: 'query',
      titles: city,
      prop: 'pageimages',
      piprop: 'thumbnail',
      pithumbsize: '1280',
      redirects: '1',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    const data = await fetchJson<{ query?: { pages: WikiPage[] } }>(`https://en.wikipedia.org/w/api.php?${params}`);
    return data.query?.pages?.[0]?.thumbnail?.source;
  });
}
