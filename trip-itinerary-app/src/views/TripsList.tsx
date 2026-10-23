import { useState } from 'preact/hooks';
import type { Trip } from '../types';
import { Icon } from '../components/Icon';
import { Empty, gradientFor, Link, TabBar, usePageTitle } from '../components/ui';
import { useCover, useOnline, useTripDays } from '../hooks';
import { formatRange, relativeDays, todayLocal } from '../lib/time';
import { tripStatus } from '../lib/trips';
import { temp } from '../lib/units';
import { describeWeather } from '../lib/weather';
import { useAppState, visibleTrips } from '../state';

export function TripsList() {
  const trips = useAppState(visibleTrips);
  const settings = useAppState((s) => s.settings);
  const auth = useAppState((s) => s.auth);
  const online = useOnline();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const titleRef = usePageTitle('Trips');
  const today = todayLocal();

  const upcoming = trips.filter((t) => tripStatus(t, today) !== 'past');
  const past = trips.filter((t) => tripStatus(t, today) === 'past').reverse();
  const shown = tab === 'upcoming' ? upcoming : past;
  const [hero, ...rest] = tab === 'upcoming' ? shown : [undefined, ...shown];
  const hasSamples = trips.some((t) => t.sample);

  return (
    <>
      <main id="main" class="page view-enter">
        <div class="title-row">
          <h1 class="large-title" tabIndex={-1} ref={titleRef}>
            Trips
          </h1>
          <Link href="/new" class="icon-btn" aria-label="New trip">
            <Icon name="plus" />
          </Link>
        </div>

        {!online && (
          <p class="banner" role="status">
            <Icon name="globe" /> You’re offline. Your trips are saved on this iPhone.
          </p>
        )}

        {!auth && (
          <Link href="/import" class="banner" style={{ textDecoration: 'none', color: 'inherit', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.6rem' }} aria-hidden="true">
              ✉️
            </span>
            <span>
              <strong>Connect Gmail</strong>
              <br />
              <span class="footnote">Wayfare finds your flights, hotels and trains and builds the itinerary for you.</span>
            </span>
            <span class="spacer" />
            <Icon name="chevron" />
          </Link>
        )}

        <div class="segmented" role="tablist" aria-label="Trip list" style={{ marginBottom: '1rem' }}>
          {(['upcoming', 'past'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'upcoming' ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          tab === 'upcoming' ? (
            <Empty art="🧳" title="No upcoming trips">
              <p class="muted" style={{ margin: 0 }}>
                Scan Gmail for booking confirmations or add a trip by hand.
              </p>
              <div class="row">
                <Link href="/import" class="btn primary">
                  <Icon name="mail" /> Scan Gmail
                </Link>
                <Link href="/new" class="btn">
                  <Icon name="plus" /> New trip
                </Link>
              </div>
            </Empty>
          ) : (
            <Empty art="🗺️" title="No past trips yet" />
          )
        ) : (
          <div class="stack">
            {hero && <HeroCard trip={hero} today={today} units={settings.units} />}
            {rest.length > 0 && (
              <ul class="stack" style={{ listStyle: 'none', margin: hero ? '0.5rem 0 0' : 0, padding: 0 }}>
                {rest.map((t) => t && <TripRow key={t.id} trip={t} today={today} />)}
              </ul>
            )}
          </div>
        )}
        {hasSamples && (
          <p class="footnote center" style={{ marginTop: '1.5rem' }}>
            Trips marked “Sample” are demos. Hide them in <Link href="/settings">Settings</Link>.
          </p>
        )}
      </main>
      <TabBar active="trips" />
    </>
  );
}

function HeroCard({ trip, today, units }: { trip: Trip; today: string; units: 'imperial' | 'metric' }) {
  const cover = useCover(trip);
  const { days } = useTripDays(trip);
  const status = tripStatus(trip, today);
  const first = days.get(status === 'now' ? today : trip.startDate)?.weather;
  const wx = first && describeWeather(first.code);
  return (
    <Link href={`/trip/${trip.id}`} class="hero" style={{ '--hero-grad': gradientFor(trip.name) }}>
      {cover && <img class="cover" src={cover} alt="" loading="eager" />}
      <span class="badge">
        {status === 'now' ? 'Happening now' : relativeDays(today, trip.startDate)}
        {trip.sample ? ' · Sample' : ''}
      </span>
      <div class="hero-body">
        <h2>{trip.name}</h2>
        <p>{formatRange(trip.startDate, trip.endDate)}</p>
        {first && wx && (
          <div class="wx-glance">
            <span>
              <span aria-hidden="true">{wx.emoji}</span> {wx.text}
            </span>
            <span>
              {temp(first.hiF, units)} / {temp(first.loF, units)}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function TripRow({ trip, today }: { trip: Trip; today: string }) {
  const cover = useCover(trip);
  const status = tripStatus(trip, today);
  const count = trip.items.filter((i) => i.status !== 'cancelled').length;
  return (
    <li>
      <Link href={`/trip/${trip.id}`} class="trip-row">
        <span class="thumb" style={{ '--hero-grad': gradientFor(trip.name) }}>
          {cover && <img src={cover} alt="" loading="lazy" />}
        </span>
        <span style={{ minWidth: 0 }}>
          <h3>{trip.name}</h3>
          <span class="footnote">
            {formatRange(trip.startDate, trip.endDate)} · {count} {count === 1 ? 'plan' : 'plans'}
          </span>
          <br />
          <span class="caption">
            {status === 'past' ? relativeDays(today, trip.endDate) : relativeDays(today, trip.startDate)}
            {trip.sample ? ' · Sample' : ''}
          </span>
        </span>
        <span class="spacer" />
        <span class="muted">
          <Icon name="chevron" size={18} />
        </span>
      </Link>
    </li>
  );
}
