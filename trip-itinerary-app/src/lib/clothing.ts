// Rule-based "what to wear" advice from a day's weather. Temperatures in °F, wind in mph.

import type { DayWeather } from '../types';
import { windChillF } from './units';

export interface WearItem {
  id: string;
  emoji: string;
  label: string;
}

export interface WearAdvice {
  /** One-line summary, e.g. "Warm coat, hat & gloves; umbrella". */
  summary: string;
  items: WearItem[];
  /** Coldest effective temperature considered (min of feels-like and wind chill). */
  coldestF: number;
}

const W = {
  thermal: { id: 'thermal', emoji: '🧦', label: 'Thermal base layer' },
  parka: { id: 'parka', emoji: '🧥', label: 'Insulated winter coat' },
  coat: { id: 'coat', emoji: '🧥', label: 'Warm coat' },
  jacket: { id: 'jacket', emoji: '🧥', label: 'Light jacket' },
  sweater: { id: 'sweater', emoji: '🧶', label: 'Sweater or fleece' },
  layers: { id: 'layers', emoji: '👕', label: 'Layers you can peel off' },
  tee: { id: 'tee', emoji: '👕', label: 'T-shirt' },
  breathable: { id: 'breathable', emoji: '🩳', label: 'Light, breathable clothes' },
  hat: { id: 'hat', emoji: '🧢', label: 'Warm hat' },
  gloves: { id: 'gloves', emoji: '🧤', label: 'Gloves' },
  scarf: { id: 'scarf', emoji: '🧣', label: 'Scarf' },
  boots: { id: 'boots', emoji: '🥾', label: 'Insulated, grippy boots' },
  umbrella: { id: 'umbrella', emoji: '☂️', label: 'Umbrella or rain jacket' },
  waterproof: { id: 'waterproof', emoji: '👟', label: 'Waterproof shoes' },
  shell: { id: 'shell', emoji: '🌬️', label: 'Windproof shell' },
  sunscreen: { id: 'sunscreen', emoji: '🧴', label: 'Sunscreen' },
  sunglasses: { id: 'sunglasses', emoji: '🕶️', label: 'Sunglasses' },
  sunhat: { id: 'sunhat', emoji: '👒', label: 'Sun hat' },
  water: { id: 'water', emoji: '💧', label: 'Water bottle' },
} satisfies Record<string, WearItem>;

export function adviseClothing(w: DayWeather): WearAdvice {
  const chill = windChillF(w.loF, w.windMph);
  const coldestF = Math.min(w.feelsLoF, chill ?? Infinity, w.loF);
  const items: WearItem[] = [];
  const add = (...xs: WearItem[]) => xs.forEach((x) => items.some((i) => i.id === x.id) || items.push(x));

  if (coldestF < 20) add(W.parka, W.thermal, W.hat, W.gloves, W.scarf, W.boots);
  else if (coldestF < 33) add(W.coat, W.sweater, W.hat, W.gloves, W.scarf);
  else if (coldestF < 46) add(W.coat, W.sweater);
  else if (coldestF < 58) add(W.jacket, W.sweater);
  else if (w.feelsHiF < 78) add(W.tee, W.jacket);
  else add(W.breathable, W.water);

  if (w.feelsHiF - coldestF >= 18) add(W.layers);
  if (w.rainChance >= 40) add(W.umbrella);
  if (w.rainChance >= 70) add(W.waterproof);
  if (w.windMph >= 18 || (w.gustMph ?? 0) >= 30) add(W.shell);
  if ((w.uv ?? 0) >= 6) add(W.sunscreen, W.sunglasses, W.sunhat);
  else if ((w.uv ?? 0) >= 3) add(W.sunglasses);
  if (w.feelsHiF >= 88) add(W.water);

  return { items, coldestF, summary: summarize(items) };
}

function summarize(items: WearItem[]): string {
  const labels = items.slice(0, 3).map((i) => i.label.toLowerCase());
  if (labels.length === 0) return '';
  const s = labels.join(', ');
  return s[0].toUpperCase() + s.slice(1);
}

export interface PackEntry extends WearItem {
  /** How many trip days call for this item. */
  days: number;
}

/** Union of clothing advice across a trip, most-needed first. */
export function packingList(days: DayWeather[]): PackEntry[] {
  const map = new Map<string, PackEntry>();
  for (const d of days) {
    for (const item of adviseClothing(d).items) {
      const prev = map.get(item.id);
      if (prev) prev.days += 1;
      else map.set(item.id, { ...item, days: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.days - a.days);
}
