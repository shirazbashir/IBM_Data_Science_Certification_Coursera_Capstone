import type { Settings } from '../types';

export const fToC = (f: number) => ((f - 32) * 5) / 9;
export const mphToKmh = (mph: number) => mph * 1.609344;

export function temp(f: number, units: Settings['units']): string {
  return units === 'metric' ? `${Math.round(fToC(f))}°` : `${Math.round(f)}°`;
}

export function tempLong(f: number, units: Settings['units']): string {
  return units === 'metric' ? `${Math.round(fToC(f))} degrees Celsius` : `${Math.round(f)} degrees Fahrenheit`;
}

export function speed(mph: number, units: Settings['units']): string {
  return units === 'metric' ? `${Math.round(mphToKmh(mph))} km/h` : `${Math.round(mph)} mph`;
}

export function unitLabel(units: Settings['units']): string {
  return units === 'metric' ? '°C' : '°F';
}

/**
 * US National Weather Service wind chill (°F). Defined only for temperatures at or
 * below 50 °F and wind above 3 mph; returns undefined otherwise.
 */
export function windChillF(tempF: number, windMph: number): number | undefined {
  if (tempF > 50 || windMph <= 3) return undefined;
  const v = Math.pow(windMph, 0.16);
  return 35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v;
}
