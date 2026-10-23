import { useEffect, useState } from 'preact/hooks';
import { Icon } from '../components/Icon';
import { Link, Switch, TabBar, usePageTitle } from '../components/ui';
import { serverConfig, signIn, signOut, type ServerConfig } from '../lib/api';
import { idbClear } from '../lib/db';
import { disableReminders, enableReminders, isStandalone, syncNow } from '../lib/sync';
import { purgeTrip, restoreSamples, toast, updateSettings, useAppState } from '../state';

export function SettingsView() {
  const titleRef = usePageTitle('Settings');
  const settings = useAppState((s) => s.settings);
  const auth = useAppState((s) => s.auth);
  const trips = useAppState((s) => s.trips);
  const syncing = useAppState((s) => s.syncing);
  const lastSync = useAppState((s) => s.lastSync);
  const [cfg, setCfg] = useState<ServerConfig>();
  useEffect(() => void serverConfig().then(setCfg), []);

  const toggleReminders = async (on: boolean) => {
    try {
      if (on) {
        await enableReminders();
        toast('Reminders on: check-in, leave-for-the-airport, hotel times', 'success');
      } else {
        await disableReminders();
        toast('Reminders off');
      }
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(trips.filter((t) => !t.deleted && !t.sample), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wayfare-trips.json';
    a.click();
  };

  return (
    <>
      <main id="main" class="page view-enter">
        <h1 class="large-title" tabIndex={-1} ref={titleRef}>
          Settings
        </h1>

        <h2 class="section-title">Units & time</h2>
        <div class="list">
          <div class="list-row">
            <span id="units-label">Temperature & wind</span>
            <span class="spacer" />
            <div class="segmented" role="radiogroup" aria-labelledby="units-label" style={{ minWidth: '9rem' }}>
              {(['imperial', 'metric'] as const).map((u) => (
                <button key={u} role="radio" aria-checked={settings.units === u} onClick={() => updateSettings({ units: u })}>
                  {u === 'imperial' ? '°F · mph' : '°C · km/h'}
                </button>
              ))}
            </div>
          </div>
          <div class="list-row">
            <span>12-hour clock</span>
            <span class="spacer" />
            <Switch label="12-hour clock" checked={settings.hour12} onChange={(v) => updateSettings({ hour12: v })} />
          </div>
        </div>

        <h2 class="section-title">Airport timing</h2>
        <div class="list">
          <label class="list-row">
            <span>Arrive before international flights</span>
            <select class="input" style={{ width: 'auto', marginLeft: 'auto' }} value={settings.intlBufferHours} onChange={(e) => updateSettings({ intlBufferHours: +(e.target as HTMLSelectElement).value })}>
              {[2, 2.5, 3, 3.5, 4].map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </label>
          <label class="list-row">
            <span>Arrive before domestic flights</span>
            <select class="input" style={{ width: 'auto', marginLeft: 'auto' }} value={settings.domesticBufferHours} onChange={(e) => updateSettings({ domesticBufferHours: +(e.target as HTMLSelectElement).value })}>
              {[1, 1.5, 2, 2.5, 3].map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </label>
          <label class="list-row">
            <span>Home city</span>
            <input
              class="input"
              style={{ maxWidth: '11rem', marginLeft: 'auto' }}
              placeholder="Auto"
              value={settings.homeCity ?? ''}
              onChange={(e) => updateSettings({ homeCity: (e.target as HTMLInputElement).value.trim() || undefined })}
            />
          </label>
        </div>
        <p class="footnote">Your home city is left out of trip names and sightseeing suggestions.</p>

        <h2 class="section-title">Reminders</h2>
        <div class="list">
          <div class="list-row">
            <Icon name="bell" />
            <span>
              Push notifications
              <br />
              <span class="footnote">Check-in opens, time to leave, hotel check-in and check-out.</span>
            </span>
            <span class="spacer" />
            <Switch label="Push notification reminders" checked={settings.reminders} disabled={!auth} onChange={toggleReminders} />
          </div>
        </div>
        {!isStandalone() && (
          <p class="footnote">
            On iPhone, notifications work once Wayfare is on your Home Screen: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Prefer
            calendar alerts? Use “Add to Calendar” in any trip.
          </p>
        )}

        <h2 class="section-title">Account & sync</h2>
        <div class="list">
          {auth ? (
            <>
              <div class="list-row">
                <Icon name="user" />
                <span>
                  {auth.name ?? auth.email}
                  <br />
                  <span class="footnote">{auth.email}</span>
                </span>
              </div>
              <button class="list-row" onClick={() => syncNow({ quiet: false })} disabled={syncing || !cfg?.sync}>
                <Icon name="refresh" />
                <span>
                  {syncing ? 'Syncing…' : 'Sync now'}
                  <br />
                  <span class="footnote">
                    {!cfg?.sync ? 'Sync server not configured' : lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Not synced yet'}
                  </span>
                </span>
              </button>
              <button class="list-row" onClick={() => signOut().then(() => toast('Signed out'))} style={{ color: 'var(--danger)' }}>
                Sign out
              </button>
            </>
          ) : (
            <button class="list-row" onClick={() => signIn().catch((e: Error) => toast(e.message, 'error'))} disabled={!cfg?.googleClientId}>
              <Icon name="mail" /> Connect Google account
            </button>
          )}
        </div>

        <h2 class="section-title">Data</h2>
        <div class="list">
          <div class="list-row">
            <span>Show sample trips</span>
            <span class="spacer" />
            <Switch label="Show sample trips" checked={settings.showSamples} onChange={(v) => updateSettings({ showSamples: v })} />
          </div>
          {!trips.some((t) => t.sample) && (
            <button class="list-row" onClick={() => restoreSamples().then(() => toast('Sample trips restored'))}>
              Restore sample trips
            </button>
          )}
          <button class="list-row" onClick={exportData}>
            <Icon name="share" /> Export my trips (JSON)
          </button>
          <button
            class="list-row"
            style={{ color: 'var(--danger)' }}
            onClick={async () => {
              if (!confirm('Remove all trips and cached data from this device? Synced trips will download again when you sign in.')) return;
              await Promise.all(trips.map((t) => purgeTrip(t.id)));
              await idbClear('cache');
              toast('Device data cleared');
            }}
          >
            <Icon name="trash" /> Clear data on this device
          </button>
        </div>

        <p class="footnote center" style={{ marginTop: '1.5rem' }}>
          Wayfare 0.1 · Weather by Open-Meteo · Sights from Wikipedia · Maps data © OpenStreetMap contributors · Booking extraction by Claude
          <br />
          <Link href="/">Back to trips</Link>
        </p>
      </main>
      <TabBar active="settings" />
    </>
  );
}
