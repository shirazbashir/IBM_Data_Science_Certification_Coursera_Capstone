// Tiny IndexedDB key/value layer. Everything the app shows is kept here so it works offline.

const DB_NAME = 'wayfare';
const STORES = ['trips', 'cache', 'kv'] as const;
type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key));
export const idbSet = (store: StoreName, key: string, value: unknown) =>
  run(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined);
export const idbDel = (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
export const idbAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll());
export const idbClear = (store: StoreName) => run(store, 'readwrite', (s) => s.clear()).then(() => undefined);

interface Cached<T> {
  t: number;
  v: T;
}

/**
 * Fetch-through cache. Returns a fresh cached value if younger than `ttlMs`; otherwise
 * calls `load`. If `load` fails (offline), falls back to any stale cached value.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = await idbGet<Cached<T>>('cache', key).catch(() => undefined);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  try {
    const v = await load();
    await idbSet('cache', key, { t: Date.now(), v } satisfies Cached<T>).catch(() => undefined);
    return v;
  } catch (err) {
    if (hit) return hit.v;
    throw err;
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}
