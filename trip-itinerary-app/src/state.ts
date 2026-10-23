// App-wide state: a minimal observable store persisted to IndexedDB.

import { useEffect, useState } from 'preact/hooks';
import type { Item, Settings, Trip } from './types';
import { idbAll, idbDel, idbGet, idbSet } from './lib/db';
import { sampleTrips } from './lib/sample';
import { mergeItems, recomputeTrip, uid } from './lib/trips';

export interface Auth {
  token: string;
  email?: string;
  name?: string;
  picture?: string;
  expiresAt: number;
}

export interface Toast {
  id: number;
  text: string;
  tone?: 'info' | 'error' | 'success';
}

export interface AppState {
  ready: boolean;
  trips: Trip[];
  settings: Settings;
  auth?: Auth;
  syncing: boolean;
  lastSync?: number;
  toasts: Toast[];
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'imperial',
  hour12: true,
  intlBufferHours: 3,
  domesticBufferHours: 2,
  reminders: false,
  showSamples: true,
};

let state: AppState = { ready: false, trips: [], settings: DEFAULT_SETTINGS, syncing: false, toasts: [] };
const listeners = new Set<() => void>();

export const getState = () => state;

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function useAppState<T>(select: (s: AppState) => T): T {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return select(state);
}

/** Hooks other modules (sync, reminders) can attach to trip changes. */
const tripChangeHandlers = new Set<(changed: Trip[]) => void>();
export const onTripsChanged = (fn: (changed: Trip[]) => void) => tripChangeHandlers.add(fn);

let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'info') {
  const t = { id: ++toastId, text, tone };
  setState((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 4000);
}

export async function loadState() {
  const [trips, settings, auth, lastSync, seeded] = await Promise.all([
    idbAll<Trip>('trips'),
    idbGet<Settings>('kv', 'settings'),
    idbGet<Auth>('kv', 'auth'),
    idbGet<number>('kv', 'lastSync'),
    idbGet<boolean>('kv', 'seeded'),
  ]);
  let all = trips;
  if (!seeded) {
    all = sampleTrips();
    await Promise.all(all.map((t) => idbSet('trips', t.id, t)));
    await idbSet('kv', 'seeded', true);
  }
  setState({
    ready: true,
    trips: all,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    // Kept even when expired: we still know who you are, and renew on your next tap.
    auth,
    lastSync,
  });
}

export function visibleTrips(s: AppState): Trip[] {
  return s.trips.filter((t) => !t.deleted && (s.settings.showSamples || !t.sample)).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Persist trips (including tombstones) and notify listeners. */
export async function putTrips(changed: Trip[], { silent = false } = {}) {
  const ids = new Set(changed.map((t) => t.id));
  setState((s) => ({ trips: [...s.trips.filter((t) => !ids.has(t.id)), ...changed] }));
  await Promise.all(changed.map((t) => idbSet('trips', t.id, t)));
  if (!silent) tripChangeHandlers.forEach((fn) => fn(changed));
}

export function saveTrip(trip: Trip) {
  return putTrips([recomputeTrip({ ...trip, updatedAt: Date.now() }, state.settings)]);
}

export function deleteTrip(id: string) {
  const t = state.trips.find((x) => x.id === id);
  if (!t) return;
  return putTrips([{ ...t, deleted: true, items: [], updatedAt: Date.now() }]);
}

export async function purgeTrip(id: string) {
  setState((s) => ({ trips: s.trips.filter((t) => t.id !== id) }));
  await idbDel('trips', id);
}

export function upsertItem(tripId: string, item: Item) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;
  const items = trip.items.some((i) => i.id === item.id)
    ? trip.items.map((i) => (i.id === item.id ? { ...item, updatedAt: Date.now() } : i))
    : [...trip.items, { ...item, tripId, updatedAt: Date.now() }];
  return saveTrip({ ...trip, items });
}

export function removeItem(tripId: string, itemId: string) {
  const trip = state.trips.find((t) => t.id === tripId);
  if (!trip) return;
  return saveTrip({ ...trip, items: trip.items.filter((i) => i.id !== itemId) });
}

/** Import bookings found in email: de-dupe, group into trips, save. */
export async function importItems(items: Item[]): Promise<Trip[]> {
  const real = state.trips.filter((t) => !t.sample);
  const next = mergeItems(real, items, state.settings);
  const before = new Map(real.map((t) => [t.id, JSON.stringify(t)]));
  const changed = next.filter((t) => before.get(t.id) !== JSON.stringify(t));
  await putTrips(changed);
  return changed.filter((t) => !t.deleted);
}

export function newTrip(name: string, startDate: string, endDate: string): Trip {
  return { id: uid(), name, nameLocked: true, manualRange: true, startDate, endDate, items: [], updatedAt: Date.now() };
}

export async function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  await idbSet('kv', 'settings', settings);
}

export async function setAuth(auth: Auth | undefined) {
  setState({ auth });
  if (auth) await idbSet('kv', 'auth', auth);
  else await idbDel('kv', 'auth');
}

export async function restoreSamples() {
  const samples = sampleTrips();
  await putTrips(samples, { silent: true });
  await updateSettings({ showSamples: true });
}
