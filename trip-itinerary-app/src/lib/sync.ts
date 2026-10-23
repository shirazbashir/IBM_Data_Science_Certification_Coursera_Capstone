// Cross-device sync (Cloudflare D1) and reminder scheduling (Web Push).
// The phone is the source of truth for offline use; the server is last-write-wins per trip.

import type { Item, Settings, Trip } from '../types';
import { getState, onTripsChanged, putTrips, setState, toast, updateSettings } from '../state';
import { fetchRemoteTrips, pushRemoteTrips, saveReminders, savePushSubscription, serverConfig, SignInRequired, type ReminderInput } from './api';
import { idbGet, idbSet } from './db';
import { isTransport, leaveBy } from './trips';
import { localToEpoch } from './time';

let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | undefined;

// Trips edited locally and not yet uploaded (persisted so offline edits survive restarts).
let dirty = new Set<string>();
const saveDirty = () => idbSet('kv', 'dirty', [...dirty]).catch(() => undefined);

export async function startSync() {
  dirty = new Set((await idbGet<string[]>('kv', 'dirty')) ?? []);
  onTripsChanged((changed) => {
    for (const t of changed) if (!t.sample) dirty.add(t.id);
    void saveDirty();
    scheduleSync();
  });
  window.addEventListener('online', () => scheduleSync(0));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(0));
  scheduleSync(0);
}

export function scheduleSync(delay = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow().catch(() => undefined), delay);
}

export async function syncNow({ quiet = true } = {}): Promise<void> {
  if (running) return running;
  running = (async () => {
    const s = getState();
    if (!s.auth || s.auth.expiresAt < Date.now() || !navigator.onLine) return;
    const cfg = await serverConfig();
    if (!cfg.sync) return;
    setState({ syncing: true });
    try {
      const since = s.lastSync ?? 0;
      const remote = await fetchRemoteTrips(since);
      const local = new Map(getState().trips.map((t) => [t.id, t]));
      const incoming = remote.trips.filter((r) => {
        const l = local.get(r.id);
        return !l || r.updatedAt > l.updatedAt;
      });
      if (incoming.length) await putTrips(incoming, { silent: true });
      const outgoing = getState().trips.filter((t) => dirty.has(t.id) && !t.sample && !incoming.some((i) => i.id === t.id));
      if (outgoing.length) await pushRemoteTrips(outgoing);
      for (const t of outgoing) dirty.delete(t.id);
      for (const t of incoming) dirty.delete(t.id);
      await saveDirty();
      setState({ lastSync: remote.now });
      await idbSet('kv', 'lastSync', remote.now);
      if (getState().settings.reminders) await uploadReminders().catch(() => undefined);
      if (!quiet) toast('Synced', 'success');
    } catch (err) {
      if (!quiet || !(err instanceof SignInRequired)) toast(`Sync failed: ${(err as Error).message}`, 'error');
    } finally {
      setState({ syncing: false });
    }
  })().finally(() => (running = undefined));
  return running;
}

// ---------- Reminders ----------

const KIND_ICON: Partial<Record<Item['kind'], string>> = { flight: '✈️', train: '🚆', bus: '🚌', ferry: '⛴️', hotel: '🏨' };

export function computeReminders(trips: Trip[], settings: Settings, now = Date.now()): ReminderInput[] {
  const out: ReminderInput[] = [];
  for (const trip of trips) {
    if (trip.deleted || trip.sample) continue;
    for (const i of trip.items) {
      if (i.status === 'cancelled' || i.start.length <= 10) continue;
      const url = `/#/trip/${trip.id}/item/${i.id}`;
      const icon = KIND_ICON[i.kind] ?? '📍';
      const start = localToEpoch(i.start, i.startTz);
      if (i.kind === 'flight') {
        out.push({ id: `${i.id}:checkin`, at: start - 24 * 3600_000, title: `${icon} Check-in is open`, body: `${i.number ?? i.title} · ${i.from?.code ?? ''} → ${i.to?.code ?? ''}. Check in online now.`, url });
      }
      if (isTransport(i)) {
        const lb = leaveBy(i, settings);
        if (lb) {
          out.push({ id: `${i.id}:leave`, at: lb.epoch - 15 * 60_000, title: `${icon} Leave in 15 minutes`, body: `${i.title}${i.from?.terminal ? ` · Terminal ${i.from.terminal}` : ''}. ${lb.explanation}`, url });
        }
      }
      if (i.kind === 'hotel') {
        out.push({ id: `${i.id}:checkin`, at: start - 2 * 3600_000, title: `${icon} Hotel check-in today`, body: `${i.title} from ${i.checkInTime ?? i.start.slice(11)}. ${i.location?.address ?? ''}`, url });
        if (i.end && i.end.length > 10) {
          out.push({ id: `${i.id}:checkout`, at: localToEpoch(i.end, i.endTz ?? i.startTz) - 90 * 60_000, title: `${icon} Check-out soon`, body: `${i.title}: check out by ${i.checkOutTime ?? i.end.slice(11)}.`, url });
        }
      }
    }
  }
  return out.filter((r) => r.at > now);
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** iOS only allows web push for apps added to the Home Screen. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function urlB64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Must be called from a tap (permission prompt). */
export async function enableReminders(): Promise<void> {
  if (!pushSupported()) throw new Error(isStandalone() ? 'Notifications are not supported on this device.' : 'On iPhone, add Wayfare to your Home Screen first (Share → Add to Home Screen), then enable reminders from there.');
  const cfg = await serverConfig();
  if (!cfg.vapidPublicKey) throw new Error('Push reminders are not configured on the server yet. See docs/SETUP.md.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. You can change this in Settings → Notifications.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(cfg.vapidPublicKey) }));
  await savePushSubscription(sub.toJSON());
  await updateSettings({ reminders: true });
  await uploadReminders();
}

export async function disableReminders() {
  await updateSettings({ reminders: false });
  await saveReminders([]).catch(() => undefined);
  const reg = await navigator.serviceWorker?.getRegistration();
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
}

export function uploadReminders() {
  const s = getState();
  return saveReminders(computeReminders(s.trips, s.settings));
}
