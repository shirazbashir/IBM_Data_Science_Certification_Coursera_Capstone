// Hash router: works from a static host, from the Home Screen, and offline.

import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'trips' }
  | { name: 'trip'; tripId: string; tab: TripTab }
  | { name: 'item'; tripId: string; itemId: string }
  | { name: 'edit'; tripId: string; itemId?: string; date?: string }
  | { name: 'newTrip' }
  | { name: 'import' }
  | { name: 'settings' }
  | { name: 'shared'; shareId: string };

export type TripTab = 'itinerary' | 'weather' | 'explore' | 'info';
const TABS: TripTab[] = ['itinerary', 'weather', 'explore', 'info'];

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  switch (parts[0]) {
    case 'trip':
      if (!parts[1]) break;
      if (parts[2] === 'item' && parts[3] && parts[4] === 'edit') return { name: 'edit', tripId: parts[1], itemId: parts[3] };
      if (parts[2] === 'item' && parts[3]) return { name: 'item', tripId: parts[1], itemId: parts[3] };
      if (parts[2] === 'add') return { name: 'edit', tripId: parts[1], date: params.get('date') ?? undefined };
      return { name: 'trip', tripId: parts[1], tab: TABS.includes(parts[2] as TripTab) ? (parts[2] as TripTab) : 'itinerary' };
    case 'new':
      return { name: 'newTrip' };
    case 'import':
      return { name: 'import' };
    case 'settings':
      return { name: 'settings' };
    case 'shared':
      if (parts[1]) return { name: 'shared', shareId: parts[1] };
  }
  return { name: 'trips' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

// Number of in-app navigations we can safely step back through.
let depth = 0;
window.addEventListener('popstate', () => (depth = Math.max(0, depth - 1)));

export function navigate(path: string, { replace = false } = {}) {
  const hash = `#${path}`;
  if (replace) history.replaceState(null, '', hash);
  else {
    history.pushState(null, '', hash);
    depth += 1;
  }
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Back within the app if possible; otherwise (deep link) go to a sensible parent. */
export function goBack(fallback: string) {
  if (depth > 0) history.back();
  else navigate(fallback, { replace: true });
}
