import { useEffect, useState } from 'preact/hooks';
import type { DayWeather, Place, Trip } from './types';
import { geocodeCity, locate, type GeoPoint } from './lib/geo';
import { coverImage } from './lib/places';
import { sunTimes, type SunTimes } from './lib/sun';
import { datePart, eachDate, isValidTz } from './lib/time';
import { isTransport, placeOnDate } from './lib/trips';
import { weatherForRange } from './lib/weather';

export interface DayInfo {
  date: string;
  place?: Place;
  point?: GeoPoint;
  tz: string;
  weather?: DayWeather;
  sun?: SunTimes;
}

/** Best time zone for where you are on `date`. */
function tzOnDate(trip: Trip, date: string, fallback: string): string {
  const items = trip.items.filter((i) => i.status !== 'cancelled');
  const hotel = items.find((i) => i.kind === 'hotel' && datePart(i.start) <= date && (!i.end || date <= datePart(i.end)));
  if (hotel) return hotel.startTz;
  const arrival = [...items].reverse().find((i) => isTransport(i) && datePart(i.end ?? i.start) <= date);
  if (arrival) return arrival.endTz ?? arrival.startTz;
  const any = items.find((i) => datePart(i.start) === date);
  return any?.startTz ?? fallback;
}

/** Location, weather and sun times for every day of a trip. */
export function useTripDays(trip: Trip | undefined): { days: Map<string, DayInfo>; loading: boolean; error?: string } {
  const [state, setState] = useState<{ days: Map<string, DayInfo>; loading: boolean; error?: string }>({ days: new Map(), loading: true });
  const key = trip ? `${trip.id}:${trip.updatedAt}` : '';

  useEffect(() => {
    if (!trip) return;
    let alive = true;
    (async () => {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const dates = eachDate(trip.startDate, trip.endDate);
      const places = dates.map((d) => placeOnDate(trip, d));
      // One lookup per city: prefer a precise hotel location, fall back to the city centre.
      const cityPoint = new Map<string, Promise<GeoPoint | undefined>>();
      const pointFor = (p?: Place) => {
        if (!p?.city) return Promise.resolve(undefined);
        const k = p.city.toLowerCase();
        if (!cityPoint.has(k)) {
          const hotel = trip.items.find((i) => i.kind === 'hotel' && i.location?.city?.toLowerCase() === k)?.location;
          cityPoint.set(k, locate(hotel ?? p).then((pt) => pt ?? geocodeCity(p.city!, p.country)).catch(() => undefined));
        }
        return cityPoint.get(k)!;
      };
      const points = await Promise.all(places.map(pointFor));
      const wxByCity = new Map<string, Promise<DayWeather[]>>();
      let error: string | undefined;
      const days = new Map<string, DayInfo>();
      await Promise.all(
        dates.map(async (date, i) => {
          const place = places[i];
          const point = points[i];
          const tzGuess = tzOnDate(trip, date, deviceTz);
          const tz = isValidTz(tzGuess) ? tzGuess : point?.tz ?? deviceTz;
          const info: DayInfo = { date, place, point, tz };
          if (point) {
            info.sun = sunTimes(date, point.lat, point.lon, tz);
            const k = `${point.lat.toFixed(2)},${point.lon.toFixed(2)}`;
            if (!wxByCity.has(k)) wxByCity.set(k, weatherForRange(point.lat, point.lon, trip.startDate, trip.endDate));
            try {
              info.weather = (await wxByCity.get(k)!).find((w) => w.date === date);
            } catch (e) {
              error = navigator.onLine ? (e as Error).message : 'Offline: weather will load when you reconnect.';
            }
          }
          days.set(date, info);
        }),
      );
      if (alive) setState({ days, loading: false, error });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export function useCover(trip: Trip | undefined): string | undefined {
  const city = trip?.destination?.city;
  const [url, setUrl] = useState<string | undefined>(trip?.coverUrl);
  useEffect(() => {
    if (trip?.coverUrl) return setUrl(trip.coverUrl);
    if (!city) return setUrl(undefined);
    let alive = true;
    coverImage(city).then((u) => alive && setUrl(u), () => undefined);
    return () => {
      alive = false;
    };
  }, [city, trip?.coverUrl]);
  return url;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return online;
}
