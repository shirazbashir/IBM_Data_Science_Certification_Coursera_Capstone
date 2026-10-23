import { useEffect, useState } from 'preact/hooks';
import type { Trip } from '../types';
import { Icon } from '../components/Icon';
import { Link, TabBar, usePageTitle } from '../components/ui';
import { accessToken, serverConfig, signIn, type ServerConfig } from '../lib/api';
import { scanGmail, type ScanProgress } from '../lib/gmail';
import { syncNow } from '../lib/sync';
import { formatRange } from '../lib/time';
import { importItems, toast, useAppState } from '../state';

export function ImportView() {
  const titleRef = usePageTitle('Scan Gmail');
  const auth = useAppState((s) => s.auth);
  const [cfg, setCfg] = useState<ServerConfig>();
  const [progress, setProgress] = useState<ScanProgress>();
  const [result, setResult] = useState<Trip[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => void serverConfig().then(setCfg), []);

  const expired = auth && auth.expiresAt < Date.now();

  const connect = async () => {
    setError(undefined);
    try {
      await signIn(false);
      toast('Gmail connected', 'success');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const scan = async (rescan = false) => {
    setError(undefined);
    setResult(undefined);
    setBusy(true);
    try {
      await accessToken(true); // renew from this tap if needed
      const items = await scanGmail(setProgress, { rescan });
      const trips = await importItems(items);
      setResult(trips);
      void syncNow();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const notReady = cfg && (!cfg.googleClientId || !cfg.extraction);

  return (
    <>
      <main id="main" class="page view-enter">
        <h1 class="large-title" tabIndex={-1} ref={titleRef}>
          Scan Gmail
        </h1>

        <div class="card stack">
          <div class="row" style={{ alignItems: 'flex-start' }}>
            <span style={{ fontSize: '2.4rem' }} aria-hidden="true">
              ✉️
            </span>
            <div>
              <strong>Turn booking emails into an itinerary</strong>
              <p class="footnote" style={{ margin: '0.3rem 0 0' }}>
                Wayfare searches your Gmail (read-only) for flight, hotel, train, bus, car and activity confirmations from the last year, then
                Claude reads each one and pulls out times, terminals, seats, addresses and confirmation numbers. Your emails are not stored.
              </p>
            </div>
          </div>

          {notReady && (
            <p class="banner" role="note">
              <Icon name="settings" /> The server isn’t fully set up yet ({!cfg!.googleClientId ? 'Google client ID' : 'Claude API key'} missing). Follow docs/SETUP.md. Meanwhile, explore the sample trips.
            </p>
          )}

          {!auth || expired ? (
            <button class="btn primary block" onClick={connect} disabled={!cfg?.googleClientId}>
              <Icon name="mail" /> {expired ? 'Reconnect Gmail' : 'Connect Gmail'}
            </button>
          ) : (
            <>
              <div class="row">
                {auth.picture ? (
                  <img src={auth.picture} alt="" width={36} height={36} style={{ borderRadius: '50%' }} referrerpolicy="no-referrer" />
                ) : (
                  <Icon name="user" />
                )}
                <span class="footnote">
                  Connected as <strong>{auth.email}</strong>
                </span>
              </div>
              <button class="btn primary block" onClick={() => scan(false)} disabled={busy || !cfg?.extraction}>
                <Icon name="refresh" /> {busy ? 'Scanning…' : 'Scan for new bookings'}
              </button>
              <button class="btn block small" onClick={() => scan(true)} disabled={busy || !cfg?.extraction}>
                Re-scan everything
              </button>
            </>
          )}
        </div>

        {error && (
          <p class="banner" role="alert" style={{ color: 'var(--danger)', marginTop: '1rem' }}>
            {error}
          </p>
        )}

        {progress && (
          <section class="card stack" style={{ marginTop: '1rem' }} aria-live="polite">
            <div class="row">
              <strong>
                {progress.phase === 'searching'
                  ? 'Searching your inbox…'
                  : progress.phase === 'reading'
                    ? `Reading ${progress.done} of ${progress.total} emails`
                    : 'Scan complete'}
              </strong>
              <span class="spacer" />
              <span class="footnote">{progress.found} bookings found</span>
            </div>
            <div class="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Scan progress">
              <span style={{ width: `${progress.phase === 'done' ? 100 : pct}%` }} />
            </div>
            {progress.current && <div class="footnote" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{progress.current}</div>}
            {progress.phase === 'done' && progress.total === 0 && <div class="footnote">No new booking emails since your last scan.</div>}
            {progress.errors.length > 0 && (
              <details>
                <summary class="footnote">{progress.errors.length} emails couldn’t be read</summary>
                <ul class="footnote">
                  {[...new Set(progress.errors)].slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        {result && result.length > 0 && (
          <section>
            <h2 class="section-title">Updated trips</h2>
            <ul class="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {result.map((t) => (
                <li key={t.id}>
                  <Link href={`/trip/${t.id}`} class="trip-row">
                    <span style={{ fontSize: '1.8rem' }} aria-hidden="true">
                      🧳
                    </span>
                    <span>
                      <h3>{t.name}</h3>
                      <span class="footnote">
                        {formatRange(t.startDate, t.endDate)} · {t.items.length} plans
                      </span>
                    </span>
                    <span class="spacer" />
                    <Icon name="chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <h2 class="section-title">Privacy</h2>
        <ul class="list footnote" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <li class="list-row">Read-only Gmail access, and only emails that look like travel confirmations are opened.</li>
          <li class="list-row">Email text is sent to Claude to extract the booking details, then discarded.</li>
          <li class="list-row">Your trips are saved on this iPhone and synced to your own Wayfare server.</li>
        </ul>
      </main>
      <TabBar active="import" />
    </>
  );
}
