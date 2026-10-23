// Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8291),
// implemented on WebCrypto so it runs in Cloudflare Workers without Node libraries.

export const b64u = {
  encode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(str: string): Uint8Array<ArrayBuffer> {
    const pad = '='.repeat((4 - (str.length % 4)) % 4);
    const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

const enc = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

export interface EncryptOptions {
  /** Fixed sender key pair and salt — only for test vectors. */
  asKeyPair?: CryptoKeyPair;
  salt?: Uint8Array<ArrayBuffer>;
}

/** Encrypt a push message body for a subscription (`p256dh`, `auth` from PushSubscription.toJSON()). */
export async function encryptPayload(payload: Uint8Array, p256dh: string, auth: string, opts: EncryptOptions = {}): Promise<Uint8Array> {
  const uaPublic = b64u.decode(p256dh);
  const authSecret = b64u.decode(auth);
  const asKeys = opts.asKeyPair ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // The WebCrypto field is `public` (Workers' type definitions spell it `$public`).
  const ecdhParams = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, asKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/** VAPID `Authorization` header value for a push service origin. */
export async function vapidAuth(endpoint: string, publicKey: string, privateJwk: JsonWebKey, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u.encode(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${publicKey}`;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidConfig {
  publicKey: string;
  privateJwk: JsonWebKey;
  subject: string;
}

/** Send one notification. Returns the push service HTTP status (404/410 = subscription gone). */
export async function sendPush(target: PushTarget, message: unknown, vapid: VapidConfig, ttlSeconds = 6 * 3600): Promise<number> {
  const body = await encryptPayload(enc(JSON.stringify(message)), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(target.endpoint, vapid.publicKey, vapid.privateJwk, vapid.subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}
