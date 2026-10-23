import { render } from 'preact';
import { App } from './app';
import { startSync } from './lib/sync';
import { loadState } from './state';
import './styles.css';

render(<App />, document.getElementById('app')!);

void loadState().then(startSync);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
