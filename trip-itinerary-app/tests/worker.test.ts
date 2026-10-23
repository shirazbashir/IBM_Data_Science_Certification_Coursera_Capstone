import { describe, expect, it } from 'vitest';
import { OUTPUT_SCHEMA, toItem } from '../worker/extract';
import { b64u, encryptPayload, vapidAuth } from '../worker/webpush';

describe('extraction output mapping', () => {
  it('converts snake_case + nulls to app items', () => {
    const item = toItem({
      kind: 'flight', status: 'confirmed', title: 'JFK → LHR', provider: 'British Airways', confirmation: 'K7XQ2P', number: 'BA 178',
      start: '2026-11-02T19:30', start_tz: 'America/New_York', end: '2026-11-03T07:35', end_tz: 'Europe/London',
      from: { name: 'JFK', address: null, city: 'New York', country: 'United States', code: 'JFK', terminal: '8', phone: null },
      to: null, location: null, seat: null, cabin: null, gate: null, platform: null, coach: null,
      check_in_time: null, check_out_time: null, travelers: [], notes: null,
    });
    expect(item).toEqual({
      kind: 'flight', status: 'confirmed', title: 'JFK → LHR', provider: 'British Airways', confirmation: 'K7XQ2P', number: 'BA 178',
      start: '2026-11-02T19:30', startTz: 'America/New_York', end: '2026-11-03T07:35', endTz: 'Europe/London',
      from: { name: 'JFK', city: 'New York', country: 'United States', code: 'JFK', terminal: '8' },
    });
  });

  it('has a strict schema (every object closed, every property required)', () => {
    const check = (s: Record<string, unknown>) => {
      if (s.properties) {
        expect(s.additionalProperties).toBe(false);
        expect(new Set(s.required as string[])).toEqual(new Set(Object.keys(s.properties as object)));
        Object.values(s.properties as object).forEach((p) => check(p as Record<string, unknown>));
      }
      if (s.items) check(s.items as Record<string, unknown>);
    };
    check(OUTPUT_SCHEMA as unknown as Record<string, unknown>);
  });
});

// RFC 8291 Appendix A test vector.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function keyPairFromRaw(priv: string, pub: string): Promise<CryptoKeyPair> {
  const p = b64u.decode(pub);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.encode(p.slice(1, 33)), y: b64u.encode(p.slice(33, 65)) };
  return {
    privateKey: await crypto.subtle.importKey('jwk', { ...jwk, d: priv }, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

describe('web push encryption', () => {
  it('matches the RFC 8291 test vector', async () => {
    const out = await encryptPayload(new TextEncoder().encode(RFC.plaintext), RFC.uaPublic, RFC.auth, {
      asKeyPair: await keyPairFromRaw(RFC.asPrivate, RFC.asPublic),
      salt: b64u.decode(RFC.salt),
    });
    expect(b64u.encode(out)).toBe(RFC.body);
  });

  it('signs a verifiable VAPID JWT', async () => {
    const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pub = b64u.encode(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
    const header = await vapidAuth('https://web.push.apple.com/abc', pub, await crypto.subtle.exportKey('jwk', keys.privateKey), 'mailto:a@b.c');
    const [, t] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    const [h, c, s] = t.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64u.decode(c))).aud).toBe('https://web.push.apple.com');
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey, b64u.decode(s), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });
});
