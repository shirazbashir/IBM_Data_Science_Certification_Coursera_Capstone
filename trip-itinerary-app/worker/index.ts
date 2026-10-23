// Wayfare Worker: serves the PWA (static assets) and the /api backend.
//
//   GET  /api/config              public runtime config
//   POST /api/extract             email → bookings (Claude)          [auth]
//   GET  /api/trips?since=        trips changed since cursor         [auth]
//   PUT  /api/trips               upsert trips (last-write-wins)     [auth]
//   POST /api/share               create a read-only share link      [auth]
//   GET  /api/share/:id           read a shared trip                 [public]
//   POST /api/push/subscribe      register a Web Push subscription   [auth]
//   PUT  /api/push/reminders      replace upcoming reminders         [auth]
//   cron (every 5 min)            send due reminders

import { extractBookings, type EmailInput } from './extract';
import { b64u, sendPush, type VapidConfig } from './webpush';

export interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  ALLOWED_EMAILS?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
  MAX_EXTRACTIONS_PER_DAY?: string;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// ---------- Auth: verify the Google access token the app already holds ----------

interface User {
  sub: string;
  email: string;
}

const tokenCache = new Map<string, { user: User; until: number }>();

async function requireUser(req: Request, env: Env): Promise<User> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in required');
  const hit = tokenCache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new HttpError(401, 'Your Google session expired. Please reconnect.');
  const info = (await res.json()) as { aud?: string; azp?: string; sub?: string; email?: string; email_verified?: string; expires_in?: string };
  if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID && info.azp !== env.GOOGLE_CLIENT_ID) {
    throw new HttpError(401, 'Token was not issued for this app');
  }
  if (!info.sub || !info.email || info.email_verified !== 'true') throw new HttpError(401, 'A verified Google email is required');
  const allowed = (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(info.email.toLowerCase())) throw new HttpError(403, `${info.email} is not allowed to use this Wayfare server`);

  const user = { sub: info.sub, email: info.email };
  const ttl = Math.min(Number(info.expires_in ?? 300), 300) * 1000;
  tokenCache.set(token, { user, until: Date.now() + ttl });
  if (tokenCache.size > 500) tokenCache.delete(tokenCache.keys().next().value!);
  return user;
}

function db(env: Env): D1Database {
  if (!env.DB) throw new HttpError(503, 'Sync database not configured');
  return env.DB;
}

async function body<T>(req: Request, maxBytes = 2_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

const randomId = (bytes = 12) => b64u.encode(crypto.getRandomValues(new Uint8Array(bytes)));

async function sha256(s: string): Promise<string> {
  return b64u.encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

// ---------- Routes ----------

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  if (path === '/config' && method === 'GET') {
    return json({
      googleClientId: env.GOOGLE_CLIENT_ID || undefined,
      vapidPublicKey: env.VAPID_PUBLIC_KEY || undefined,
      extraction: !!env.ANTHROPIC_API_KEY,
      sync: !!env.DB,
    });
  }

  const share = /^\/share\/([\w-]{8,40})$/.exec(path);
  if (share && method === 'GET') {
    const row = await db(env).prepare('SELECT json FROM shares WHERE id = ?').bind(share[1]).first<{ json: string }>();
    if (!row) throw new HttpError(404, 'This shared trip no longer exists');
    return json({ trip: JSON.parse(row.json) });
  }

  const user = await requireUser(req, env);

  if (path === '/extract' && method === 'POST') {
    if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'ANTHROPIC_API_KEY is not set on the server');
    const email = await body<EmailInput>(req, 1_500_000);
    if (typeof email?.text !== 'string') throw new HttpError(400, 'Missing email text');
    await countExtraction(env, user);
    return json(await extractBookings(env.ANTHROPIC_API_KEY, email));
  }

  if (path === '/trips' && method === 'GET') {
    const since = Number(url.searchParams.get('since') ?? 0) || 0;
    const now = Date.now();
    const rows = await db(env)
      .prepare('SELECT json FROM trips WHERE user = ? AND modified > ? ORDER BY modified')
      .bind(user.sub, since)
      .all<{ json: string }>();
    return json({ trips: rows.results.map((r) => JSON.parse(r.json)), now });
  }

  if (path === '/trips' && method === 'PUT') {
    const { trips } = await body<{ trips: { id: string; updatedAt: number; deleted?: boolean }[] }>(req, 5_000_000);
    if (!Array.isArray(trips)) throw new HttpError(400, 'Expected { trips: [] }');
    const now = Date.now();
    const stmt = db(env).prepare(
      `INSERT INTO trips (user, id, json, updated_at, modified, deleted) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT (user, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, modified = excluded.modified, deleted = excluded.deleted
       WHERE excluded.updated_at >= trips.updated_at`,
    );
    const valid = trips.filter((t) => typeof t?.id === 'string' && typeof t.updatedAt === 'number');
    if (valid.length) await db(env).batch(valid.map((t) => stmt.bind(user.sub, t.id, JSON.stringify(t), t.updatedAt, now, t.deleted ? 1 : 0)));
    return json({ ok: true });
  }

  if (path === '/share' && method === 'POST') {
    const { trip } = await body<{ trip: { name?: string } }>(req);
    if (!trip?.name) throw new HttpError(400, 'Missing trip');
    const id = randomId();
    await db(env).prepare('INSERT INTO shares (id, user, json, created_at) VALUES (?, ?, ?, ?)').bind(id, user.sub, JSON.stringify(trip), Date.now()).run();
    return json({ id });
  }

  if (path === '/push/subscribe' && method === 'POST') {
    const { subscription } = await body<{ subscription: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }>(req);
    const { endpoint, keys } = subscription ?? {};
    if (!endpoint || !keys?.p256dh || !keys.auth || !/^https:\/\//.test(endpoint)) throw new HttpError(400, 'Invalid push subscription');
    const id = await sha256(endpoint);
    await db(env)
      .prepare(
        `INSERT INTO push_subs (id, user, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET user = excluded.user, p256dh = excluded.p256dh, auth = excluded.auth`,
      )
      .bind(id, user.sub, endpoint, keys.p256dh, keys.auth, Date.now())
      .run();
    return json({ id });
  }

  if (path === '/push/reminders' && method === 'PUT') {
    const { reminders } = await body<{ reminders: { id: string; at: number; title: string; body: string; url: string }[] }>(req);
    if (!Array.isArray(reminders)) throw new HttpError(400, 'Expected { reminders: [] }');
    const d = db(env);
    const insert = d.prepare('INSERT OR IGNORE INTO reminders (user, id, at, title, body, url, sent) VALUES (?, ?, ?, ?, ?, ?, 0)');
    await d.batch([
      d.prepare('DELETE FROM reminders WHERE user = ? AND sent = 0').bind(user.sub),
      ...reminders
        .filter((r) => typeof r.id === 'string' && typeof r.at === 'number')
        .slice(0, 500)
        .map((r) => insert.bind(user.sub, r.id, r.at, String(r.title).slice(0, 120), String(r.body).slice(0, 400), String(r.url).slice(0, 300))),
    ]);
    return json({ ok: true });
  }

  throw new HttpError(404, 'Not found');
}

async function countExtraction(env: Env, user: User) {
  if (!env.DB) return;
  const limit = Number(env.MAX_EXTRACTIONS_PER_DAY ?? 400);
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `INSERT INTO usage (user, day, extractions) VALUES (?, ?, 1)
     ON CONFLICT (user, day) DO UPDATE SET extractions = extractions + 1 RETURNING extractions`,
  )
    .bind(user.sub, day)
    .first<{ extractions: number }>();
  if (row && row.extractions > limit) throw new HttpError(429, `Daily limit of ${limit} emails reached. Try again tomorrow.`);
}

// ---------- Scheduled reminders ----------

async function sendDueReminders(env: Env) {
  if (!env.DB || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK) return;
  const vapid: VapidConfig = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) as JsonWebKey,
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  };
  const now = Date.now();
  const due = await env.DB.prepare('SELECT user, id, title, body, url FROM reminders WHERE sent = 0 AND at <= ? AND at > ? LIMIT 200')
    .bind(now, now - 6 * 3600_000)
    .all<{ user: string; id: string; title: string; body: string; url: string }>();
  for (const r of due.results) {
    const subs = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE user = ?')
      .bind(r.user)
      .all<{ id: string; endpoint: string; p256dh: string; auth: string }>();
    for (const s of subs.results) {
      try {
        const status = await sendPush(s, { title: r.title, body: r.body, url: r.url, tag: r.id }, vapid);
        if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(s.id).run();
      } catch (err) {
        console.error('push failed', (err as Error).message);
      }
    }
    await env.DB.prepare('UPDATE reminders SET sent = 1 WHERE user = ? AND id = ?').bind(r.user, r.id).run();
  }
  // Housekeeping: forget old reminders.
  await env.DB.prepare('DELETE FROM reminders WHERE at < ?').bind(now - 30 * 86_400_000).run();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(req, env, url);
      } catch (err) {
        if (err instanceof HttpError) return new Response(err.message, { status: err.status });
        console.error(err);
        return new Response(`Server error: ${(err as Error).message}`, { status: 500 });
      }
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendDueReminders(env));
  },
} satisfies ExportedHandler<Env>;
