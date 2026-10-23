// Core data model shared by the app (and mirrored by the Worker's extraction schema).
//
// Times are stored as *local wall-clock* ISO strings ("2026-11-02T18:30") plus an
// IANA time zone, exactly as they appear on a ticket. That keeps display trivial
// ("depart 6:30 PM local") and lets us convert to an absolute instant when needed.

export type ItemKind =
  | 'flight'
  | 'hotel'
  | 'train'
  | 'bus'
  | 'car'
  | 'ferry'
  | 'activity'
  | 'restaurant'
  | 'sight'
  | 'note';

export interface Place {
  name?: string;
  address?: string;
  city?: string;
  country?: string;
  /** IATA airport code or station code. */
  code?: string;
  terminal?: string;
  lat?: number;
  lon?: number;
  phone?: string;
}

export interface Item {
  id: string;
  tripId?: string;
  kind: ItemKind;
  title: string;
  /** Local wall-clock start, "YYYY-MM-DDTHH:mm". */
  start: string;
  startTz: string;
  end?: string;
  endTz?: string;
  from?: Place;
  to?: Place;
  /** Hotel, restaurant, activity or sight location. */
  location?: Place;
  provider?: string;
  confirmation?: string;
  /** Flight number, train number, etc. */
  number?: string;
  seat?: string;
  cabin?: string;
  gate?: string;
  platform?: string;
  coach?: string;
  /** Hotel policy times, "HH:mm". */
  checkInTime?: string;
  checkOutTime?: string;
  travelers?: string[];
  notes?: string;
  url?: string;
  imageUrl?: string;
  status?: 'confirmed' | 'cancelled';
  source: 'gmail' | 'manual' | 'recommended' | 'sample';
  emailId?: string;
  updatedAt: number;
}

export interface Trip {
  id: string;
  name: string;
  /** User renamed the trip, so don't auto-name it. */
  nameLocked?: boolean;
  /** Created by hand with explicit dates: the range never shrinks below them. */
  manualRange?: boolean;
  /** "YYYY-MM-DD" in destination local time. */
  startDate: string;
  endDate: string;
  destination?: Place;
  coverUrl?: string;
  items: Item[];
  packed?: Record<string, boolean>;
  sample?: boolean;
  deleted?: boolean;
  updatedAt: number;
}

export interface Settings {
  units: 'imperial' | 'metric';
  hour12: boolean;
  homeCity?: string;
  /** Hours before an international flight to arrive at the airport. */
  intlBufferHours: number;
  domesticBufferHours: number;
  reminders: boolean;
  showSamples: boolean;
}

export interface DayWeather {
  date: string;
  /** All temperatures °F, wind mph — converted at display time. */
  hiF: number;
  loF: number;
  feelsHiF: number;
  feelsLoF: number;
  windMph: number;
  gustMph?: number;
  rainChance: number;
  precipIn?: number;
  uv?: number;
  code: number;
  /** "forecast" from the live model, "typical" from last year's observations. */
  basis: 'forecast' | 'typical';
}
