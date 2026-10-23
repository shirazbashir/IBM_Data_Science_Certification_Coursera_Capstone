import { render } from 'preact';
import { App } from './app';
import { startSync } from './lib/sync';
import { loadState } from './state';
import './styles.css';

// Photos are decorative: if one can't load (offline, removed), hide it so the gradient shows.
document.addEventListener(
  'error',
  (e) => {
    if (e.target instanceof HTMLImageElement) e.target.style.visibility = 'hidden';
  },
  true,
);

render(<App />, document.getElementById('app')!);

void loadState().then(startSync);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
