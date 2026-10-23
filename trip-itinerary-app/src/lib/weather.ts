// Daily weather from Open-Meteo (free, no API key).
// Within the 16-day forecast window we use the live forecast; further out we show
// "typical" weather from the same dates last year so you can still plan what to pack.

import type { DayWeather } from '../types';
import { cached, fetchJson } from './db';
import { addDays, daysBetween, todayLocal } from './time';

const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'uv_index_max',
].join(',');

const ARCHIVE_DAILY = DAILY.replace('precipitation_probability_max,', '');

interface OpenMeteoDaily {
  daily?: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    apparent_temperature_max: (number | null)[];
    apparent_temperature_min: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    precipitation_sum?: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    wind_gusts_10m_max?: (number | null)[];
    uv_index_max?: (number | null)[];
  };
}

const UNITS = 'temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto';

function toDays(data: OpenMeteoDaily, basis: DayWeather['basis'], shiftYears = 0): DayWeather[] {
  const d = data.daily;
  if (!d) return [];
  const out: DayWeather[] = [];
  d.time.forEach((date, i) => {
    const hi = d.temperature_2m_max[i];
    const lo = d.temperature_2m_min[i];
    if (hi == null || lo == null) return;
    const precip = d.precipitation_sum?.[i] ?? undefined;
    out.push({
      date: shiftYears ? `${+date.slice(0, 4) + shiftYears}${date.slice(4)}` : date,
      hiF: hi,
      loF: lo,
      feelsHiF: d.apparent_temperature_max[i] ?? hi,
      feelsLoF: d.apparent_temperature_min[i] ?? lo,
      windMph: d.wind_speed_10m_max[i] ?? 0,
      gustMph: d.wind_gusts_10m_max?.[i] ?? undefined,
      // The archive has no probability; approximate it from measured precipitation.
      rainChance: d.precipitation_probability_max?.[i] ?? (precip == null ? 0 : precip >= 0.1 ? 70 : precip > 0.01 ? 35 : 5),
      precipIn: precip ?? undefined,
      uv: d.uv_index_max?.[i] ?? undefined,
      code: d.weather_code[i] ?? 0,
      basis,
    });
  });
  return out;
}

const FORECAST_DAYS = 16;

/** Weather for each date in [start, end] at a location. Missing days are simply absent. */
export async function weatherForRange(lat: number, lon: number, start: string, end: string): Promise<DayWeather[]> {
  const today = todayLocal();
  const lastForecast = addDays(today, FORECAST_DAYS - 1);
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}:${start}:${end}`;
  return cached(key, 3 * 3600_000, async () => {
    const result: DayWeather[] = [];
    const fStart = start > today ? start : today;
    const fEnd = end < lastForecast ? end : lastForecast;
    if (fStart <= fEnd) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=${DAILY}&${UNITS}&start_date=${fStart}&end_date=${fEnd}`;
      result.push(...toDays(await fetchJson<OpenMeteoDaily>(url), 'forecast'));
    }
    // Dates beyond the forecast (or in the past): use the same dates one year earlier.
    const typical = [start, end].map((d) => `${+d.slice(0, 4) - 1}${d.slice(4)}`);
    const needTypical = end > lastForecast || start < today;
    if (needTypical && daysBetween(typical[1], today) > 5) {
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&daily=${ARCHIVE_DAILY}&${UNITS}&start_date=${typical[0]}&end_date=${typical[1]}`;
      const have = new Set(result.map((r) => r.date));
      for (const day of toDays(await fetchJson<OpenMeteoDaily>(url), 'typical', 1)) {
        if (!have.has(day.date)) result.push(day);
      }
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  });
}

/** WMO weather code → emoji + description. */
export function describeWeather(code: number): { emoji: string; text: string } {
  if (code === 0) return { emoji: '☀️', text: 'Clear' };
  if (code === 1) return { emoji: '🌤️', text: 'Mostly clear' };
  if (code === 2) return { emoji: '⛅', text: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', text: 'Overcast' };
  if (code === 45 || code === 48) return { emoji: '🌫️', text: 'Fog' };
  if (code >= 51 && code <= 57) return { emoji: '🌦️', text: 'Drizzle' };
  if (code >= 61 && code <= 67) return { emoji: '🌧️', text: code >= 65 ? 'Heavy rain' : 'Rain' };
  if (code >= 71 && code <= 77) return { emoji: '🌨️', text: 'Snow' };
  if (code >= 80 && code <= 82) return { emoji: '🌦️', text: 'Showers' };
  if (code === 85 || code === 86) return { emoji: '🌨️', text: 'Snow showers' };
  if (code >= 95) return { emoji: '⛈️', text: 'Thunderstorms' };
  return { emoji: '🌡️', text: 'Weather' };
}
