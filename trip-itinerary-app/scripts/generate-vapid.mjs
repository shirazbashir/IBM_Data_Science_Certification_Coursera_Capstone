// Generates a VAPID key pair for Web Push reminders.
// Usage: npm run vapid  — then store the values as Worker secrets (see docs/SETUP.md).
const { subtle } = globalThis.crypto;
const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await subtle.exportKey('raw', keys.publicKey));
const publicKey = Buffer.from(raw).toString('base64url');
const privateJwk = JSON.stringify(await subtle.exportKey('jwk', keys.privateKey));
console.log('VAPID_PUBLIC_KEY=' + publicKey);
console.log('VAPID_PRIVATE_JWK=' + privateJwk);
console.log('\nSet them with:\n  npx wrangler secret put VAPID_PUBLIC_KEY\n  npx wrangler secret put VAPID_PRIVATE_JWK');
