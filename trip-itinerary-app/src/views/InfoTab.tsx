import { useState } from 'preact/hooks';
import type { Settings, Trip } from '../types';
import { Icon } from '../components/Icon';
import { CopyButton, KIND_META } from '../components/ui';
import { createShare, serverConfig } from '../lib/api';
import { downloadIcs, tripToIcs } from '../lib/ics';
import { hasTraveler, tripTravelers } from '../lib/trips';
import { navigate } from '../router';
import { deleteTrip, saveTrip, toast, useAppState } from '../state';

export function InfoTab({ trip, settings, traveler }: { trip: Trip; settings: Settings; traveler?: string }) {
  const auth = useAppState((s) => s.auth);
  const [name, setName] = useState(trip.name);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>();
  const travelers = tripTravelers(trip);
  const confirmations = trip.items.filter((i) => i.confirmation && i.status !== 'cancelled' && hasTraveler(i, traveler));

  const share = async () => {
    setSharing(true);
    try {
      const cfg = await serverConfig();
      if (!cfg.sync) throw new Error('Sharing needs the Wayfare server. See docs/SETUP.md.');
      if (!auth) throw new Error('Connect your Google account first (Scan Gmail tab).');
      const { id } = await createShare(trip);
      const url = `${location.origin}/#/shared/${id}`;
      setShareUrl(url);
      if (navigator.share) await navigator.share({ title: trip.name, text: `My itinerary for ${trip.name}`, url }).catch(() => undefined);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div>
      <h2 class="section-title">Trip name</h2>
      <form
        class="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) saveTrip({ ...trip, name: name.trim(), nameLocked: true }).then(() => toast('Trip renamed', 'success'));
        }}
      >
        <label class="sr-only" for="trip-name">
          Trip name
        </label>
        <input id="trip-name" class="input" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button class="btn primary" type="submit" disabled={name.trim() === trip.name}>
          Save
        </button>
      </form>

      {travelers.length > 0 && (
        <>
          <h2 class="section-title">Travelers</h2>
          <ul class="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {travelers.map((t) => (
              <li key={t} class="list-row">
                <Icon name="user" />
                {t}
                <span class="value footnote">{trip.items.filter((i) => hasTraveler(i, t) && i.status !== 'cancelled').length} plans</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 class="section-title">Share & export</h2>
      <div class="list">
        <button class="list-row" onClick={share} disabled={sharing}>
          <Icon name="share" />
          <span>
            Share read-only link
            <br />
            <span class="footnote">Anyone with the link can view this itinerary.</span>
          </span>
        </button>
        {shareUrl && (
          <div class="list-row">
            <span class="footnote" style={{ wordBreak: 'break-all' }}>
              {shareUrl}
            </span>
            <span class="spacer" />
            <CopyButton text={shareUrl} label="Copy share link" />
          </div>
        )}
        <button class="list-row" onClick={() => downloadIcs(`${trip.name}.ics`, tripToIcs(trip, settings))}>
          <Icon name="calendar" />
          <span>
            Add to Calendar
            <br />
            <span class="footnote">Every plan with alerts: check-in opens, leave for the airport, hotel times.</span>
          </span>
        </button>
      </div>

      {confirmations.length > 0 && (
        <>
          <h2 class="section-title">Confirmation numbers</h2>
          <ul class="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {confirmations.map((i) => (
              <li key={i.id} class="list-row">
                <span class={`k-${i.kind}`} style={{ color: 'var(--k)' }}>
                  <Icon name={KIND_META[i.kind].icon} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span class="footnote">{i.provider ?? i.title}</span>
                  <br />
                  <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.04em' }}>{i.confirmation}</strong>
                </span>
                <span class="spacer" />
                <CopyButton text={i.confirmation!} label={`Copy ${i.provider ?? i.title} confirmation`} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 class="section-title">Manage</h2>
      <div class="list">
        <button
          class="list-row"
          style={{ color: 'var(--danger)' }}
          onClick={async () => {
            if (!confirm(`Delete “${trip.name}” and all its plans?`)) return;
            await deleteTrip(trip.id);
            toast('Trip deleted');
            navigate('/', { replace: true });
          }}
        >
          <Icon name="trash" /> Delete trip
        </button>
      </div>
    </div>
  );
}
