// Finds booking emails in Gmail (read-only) and turns them into itinerary items.
// Emails are read in the browser; only the text of likely-travel emails is sent to the
// Worker for extraction, and nothing from the email is stored server-side.

import type { Item } from '../types';
import { accessToken, extractBookings, type EmailInput } from './api';
import { idbGet, idbSet } from './db';
import { isValidTz } from './time';
import { uid } from './trips';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Gmail search for confirmations from the last year (and upcoming trips booked earlier). */
export const DEFAULT_QUERY = [
  'newer_than:1y',
  '-in:chats',
  '{',
  'subject:(confirmation OR confirmed OR itinerary OR booking OR reservation OR "e-ticket" OR eticket OR "boarding pass" OR "your trip" OR "your flight" OR "your stay" OR "check-in" OR receipt)',
  'from:(airbnb OR booking.com OR expedia OR hotels.com OR marriott OR hilton OR hyatt OR ihg OR accor OR delta OR united OR aa.com OR britishairways OR ba.com OR lufthansa OR emirates OR qatarairways OR jetblue OR southwest OR alaskaair OR aircanada OR klm OR airfrance OR ryanair OR easyjet OR amtrak OR trainline OR lner OR eurostar OR sncf OR flixbus OR greyhound OR hertz OR avis OR enterprise OR sixt OR viator OR getyourguide OR opentable OR resy OR tripadvisor OR kayak OR priceline OR agoda OR trip.com OR vrbo)',
  '}',
].join(' ');

const SEEN_KEY = 'gmail:seen';

interface GmailPart {
  mimeType: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}

interface GmailMessage {
  id: string;
  internalDate: string;
  snippet: string;
  payload: GmailPart;
}

async function gmail<T>(path: string): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`Gmail error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

function b64urlDecode(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function findParts(part: GmailPart, mime: string, out: string[] = []): string[] {
  if (part.mimeType === mime && part.body?.data) out.push(b64urlDecode(part.body.data));
  for (const p of part.parts ?? []) findParts(p, mime, out);
  return out;
}

/** Readable text from email HTML, keeping table cells and line breaks apart. */
export function htmlToText(html: string): { text: string; structured?: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const structured = [...doc.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => s.textContent?.trim())
    .filter(Boolean)
    .join('\n');
  doc.querySelectorAll('script, style, head, noscript').forEach((n) => n.remove());
  doc.querySelectorAll('br').forEach((n) => n.replaceWith('\n'));
  doc.querySelectorAll('p, div, tr, li, h1, h2, h3, h4, table').forEach((n) => n.append('\n'));
  doc.querySelectorAll('td, th').forEach((n) => n.append(' \t '));
  const text = (doc.body?.textContent ?? '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, structured: structured || undefined };
}

export function messageToEmail(m: GmailMessage): EmailInput {
  const header = (n: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? '';
  const plain = findParts(m.payload, 'text/plain').join('\n');
  const html = findParts(m.payload, 'text/html').join('\n');
  const fromHtml = html ? htmlToText(html) : undefined;
  // Prefer HTML-derived text when the plain part is a stub ("view this email in your browser").
  const text = fromHtml && fromHtml.text.length > plain.length * 0.8 ? fromHtml.text : plain || fromHtml?.text || m.snippet;
  return {
    id: m.id,
    subject: header('subject'),
    from: header('from'),
    date: new Date(Number(m.internalDate)).toISOString(),
    text,
    structured: fromHtml?.structured,
  };
}

export interface ScanProgress {
  phase: 'searching' | 'reading' | 'done';
  total: number;
  done: number;
  found: number;
  current?: string;
  errors: string[];
}

/** Scan Gmail for new booking emails. Already-processed messages are skipped. */
export async function scanGmail(onProgress: (p: ScanProgress) => void, { rescan = false, max = 150 } = {}): Promise<Item[]> {
  const p: ScanProgress = { phase: 'searching', total: 0, done: 0, found: 0, errors: [] };
  onProgress({ ...p });

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ q: DEFAULT_QUERY, maxResults: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(`/messages?${q}`);
    ids.push(...(page.messages ?? []).map((m) => m.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < max);

  const seen = rescan ? {} : ((await idbGet<Record<string, number>>('kv', SEEN_KEY)) ?? {});
  const todo = ids.slice(0, max).filter((id) => !seen[id]).reverse(); // oldest first so updates win
  p.phase = 'reading';
  p.total = todo.length;
  onProgress({ ...p });

  const byEmail = new Map<string, Item[]>();
  const queue = [...todo];
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const msg = await gmail<GmailMessage>(`/messages/${id}?format=full`);
        const email = messageToEmail(msg);
        p.current = email.subject;
        onProgress({ ...p });
        const result = await extractBookings(email);
        const found = result.items.map((raw) => normalizeItem(raw, email.id));
        byEmail.set(id, found);
        p.found += found.length;
        seen[id] = Date.now();
      } catch (err) {
        p.errors.push((err as Error).message);
      } finally {
        p.done += 1;
        onProgress({ ...p });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await idbSet('kv', SEEN_KEY, seen);
  p.phase = 'done';
  p.current = undefined;
  onProgress({ ...p });
  // Return in email order so later updates/cancellations apply on top of earlier bookings.
  return todo.flatMap((id) => byEmail.get(id) ?? []);
}

/** Fill in defaults and drop anything malformed from the model's output. */
export function normalizeItem(raw: Omit<Item, 'id' | 'updatedAt' | 'source'>, emailId?: string): Item {
  const tz = isValidTz(raw.startTz) ? raw.startTz : 'UTC';
  return {
    ...raw,
    id: uid(),
    title: raw.title || raw.provider || raw.kind,
    startTz: tz,
    endTz: raw.endTz && isValidTz(raw.endTz) ? raw.endTz : raw.end ? tz : undefined,
    source: 'gmail',
    emailId,
    updatedAt: Date.now(),
  };
}
