// Client for the Wayfare Worker (/api) and Google sign-in.

import type { Item, Trip } from '../types';
import { getState, setAuth, type Auth } from '../state';

export interface ServerConfig {
  googleClientId?: string;
  vapidPublicKey?: string;
  extraction: boolean;
  sync: boolean;
}

let configPromise: Promise<ServerConfig> | undefined;

/** Runtime config from the Worker. Falls back to "offline/demo" when no backend is reachable. */
export function serverConfig(): Promise<ServerConfig> {
  configPromise ??= fetch('/api/config')
    .then((r) => (r.ok ? (r.json() as Promise<ServerConfig>) : Promise.reject(new Error(String(r.status)))))
    .catch(() => {
      configPromise = undefined; // retry next time (e.g. when back online)
      return {
        googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
        extraction: false,
        sync: false,
      };
    });
  return configPromise;
}

// ---------- Google Identity Services ----------

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const SCOPES = `openid email profile ${GMAIL_SCOPE}`;

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type: string; message?: string }) => void;
  }): { requestAccessToken(o?: { prompt?: string; login_hint?: string }): void };
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let gisPromise: Promise<GoogleOAuth2> | undefined;
function loadGis(): Promise<GoogleOAuth2> {
  gisPromise ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve(window.google.accounts.oauth2);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google.accounts.oauth2) : reject(new Error('Google sign-in failed to load')));
    s.onerror = () => {
      gisPromise = undefined;
      reject(new Error('Could not load Google sign-in. Are you online?'));
    };
    document.head.append(s);
  });
  return gisPromise;
}

/** Interactive (or silent, when `silent` and already consented) Google sign-in. */
export async function signIn(silent = false): Promise<Auth> {
  const cfg = await serverConfig();
  if (!cfg.googleClientId) throw new Error('Google sign-in is not configured yet. See docs/SETUP.md.');
  const oauth2 = await loadGis();
  const token = await new Promise<TokenResponse>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: cfg.googleClientId!,
      scope: SCOPES,
      callback: (r) => (r.error ? reject(new Error(r.error_description ?? r.error)) : resolve(r)),
      error_callback: (e) => reject(new Error(e.message ?? e.type)),
    });
    client.requestAccessToken({ prompt: silent ? '' : 'consent', login_hint: getState().auth?.email });
  });
  if (!token.scope.includes(GMAIL_SCOPE)) throw new Error('Gmail access was not granted. Please allow “View your email messages” to scan for bookings.');
  const profile = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((r) => r.json() as Promise<{ email?: string; name?: string; picture?: string }>);
  const auth: Auth = {
    token: token.access_token,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    expiresAt: Date.now() + (token.expires_in - 60) * 1000,
  };
  await setAuth(auth);
  return auth;
}

export async function signOut() {
  const auth = getState().auth;
  if (auth) {
    try {
      (await loadGis()).revoke(auth.token);
    } catch {
      /* already offline; local sign-out still happens */
    }
  }
  await setAuth(undefined);
}

export class SignInRequired extends Error {
  constructor() {
    super('Your Google session expired. Tap “Connect Gmail” to continue.');
  }
}

/**
 * A valid access token. Google tokens last an hour; renewing one opens a Google popup,
 * which iOS only allows from a tap, so pass `interactive` only from a click handler.
 */
export async function accessToken(interactive = false): Promise<string> {
  const auth = getState().auth;
  if (auth && auth.expiresAt > Date.now()) return auth.token;
  if (!interactive) throw new SignInRequired();
  return (await signIn(!!auth)).token;
}

// ---------- Worker API ----------

async function api<T>(path: string, init: RequestInit = {}, authed = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (authed) headers.set('Authorization', `Bearer ${await accessToken()}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export interface EmailInput {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  /** schema.org JSON-LD embedded in the email HTML, if any. */
  structured?: string;
}

export interface ExtractResult {
  isTravel: boolean;
  items: Omit<Item, 'id' | 'updatedAt' | 'source'>[];
}

export const extractBookings = (email: EmailInput) =>
  api<ExtractResult>('/extract', { method: 'POST', body: JSON.stringify(email) });

export const fetchRemoteTrips = (since = 0) => api<{ trips: Trip[]; now: number }>(`/trips?since=${since}`);

export const pushRemoteTrips = (trips: Trip[]) => api<{ ok: true }>('/trips', { method: 'PUT', body: JSON.stringify({ trips }) });

export const createShare = (trip: Trip) => api<{ id: string }>('/share', { method: 'POST', body: JSON.stringify({ trip }) });

export const fetchShare = (id: string) => api<{ trip: Trip }>(`/share/${encodeURIComponent(id)}`, {}, false);

export interface ReminderInput {
  id: string;
  at: number;
  title: string;
  body: string;
  url: string;
}

export const savePushSubscription = (subscription: PushSubscriptionJSON) =>
  api<{ id: string }>('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });

export const saveReminders = (reminders: ReminderInput[]) =>
  api<{ ok: true }>('/push/reminders', { method: 'PUT', body: JSON.stringify({ reminders }) });
