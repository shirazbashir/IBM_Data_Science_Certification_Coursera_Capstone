import { useState } from 'preact/hooks';
import type { Settings, Trip } from '../types';
import { Icon } from '../components/Icon';
import { Empty, gradientFor, KIND_META, KindDot, Link, TabBar, usePageTitle } from '../components/ui';
import { SunLine, WeatherPill } from '../components/Weather';
import { useCover, useTripDays, type DayInfo } from '../hooks';
import { goBack, navigate, type TripTab } from '../router';
import { useAppState } from '../state';
import { daysBetween, formatDateLong, formatDateMedium, formatDuration, formatLocalTime, formatRange, relativeDays, todayLocal } from '../lib/time';
import { isTransport, itemDurationMs, leaveBy, timeline, tripTravelers, type TimelineEntry } from '../lib/trips';
import { ExploreTab } from './ExploreTab';
import { InfoTab } from './InfoTab';
import { WeatherTab } from './WeatherTab';

const TAB_LABEL: Record<TripTab, string> = { itinerary: 'Plans', weather: 'Weather', explore: 'Explore', info: 'Info' };

export function TripView({ tripId, tab }: { tripId: string; tab: TripTab }) {
  const trip = useAppState((s) => s.trips.find((t) => t.id === tripId && !t.deleted));
  const settings = useAppState((s) => s.settings);
  const titleRef = usePageTitle(trip?.name ?? 'Trip');
  const cover = useCover(trip);
  const days = useTripDays(trip);
  const [traveler, setTraveler] = useState<string | undefined>();

  if (!trip) {
    return (
      <main id="main" class="page">
        <Empty art="🧭" title="Trip not found">
          <Link class="btn" href="/">
            Back to trips
          </Link>
        </Empty>
      </main>
    );
  }

  const today = todayLocal();
  const travelers = tripTravelers(trip);
  const nights = daysBetween(trip.startDate, trip.endDate);

  return (
    <>
      <main id="main" class="page flush view-enter">
        <header class="trip-header" style={{ '--hero-grad': gradientFor(trip.name) }}>
          {cover && <img class="cover" src={cover} alt="" />}
          <div class="top-actions">
            <button class="icon-btn on-image" aria-label="Back to trips" onClick={() => goBack('/')}>
              <Icon name="back" />
            </button>
            <Link class="icon-btn on-image" href={`/trip/${trip.id}/add`} aria-label="Add a plan to this trip">
              <Icon name="plus" />
            </Link>
          </div>
          <div class="head-body">
            <h1 tabIndex={-1} ref={titleRef}>
              {trip.name}
            </h1>
            <p>
              {formatRange(trip.startDate, trip.endDate)} · {nights} {nights === 1 ? 'night' : 'nights'}
              {today < trip.startDate ? ` · ${relativeDays(today, trip.startDate)}` : ''}
            </p>
          </div>
          {cover && <span class="photo-credit">Photo: Wikipedia</span>}
        </header>

        <div class="sticky-tabs" style={{ paddingTop: '0.6rem' }}>
          <div class="segmented" role="tablist" aria-label="Trip sections">
            {(Object.keys(TAB_LABEL) as TripTab[]).map((t) => (
              <button
                key={t}
                role="tab"
                id={`tab-${t}`}
                aria-controls="trip-panel"
                aria-selected={tab === t}
                onClick={() => navigate(`/trip/${trip.id}${t === 'itinerary' ? '' : `/${t}`}`, { replace: true })}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          {travelers.length > 1 && (tab === 'itinerary' || tab === 'info') && (
            <div class="chips" role="group" aria-label="Show plans for" style={{ marginTop: '0.6rem' }}>
              <button class="chip" aria-pressed={!traveler} onClick={() => setTraveler(undefined)}>
                Everyone
              </button>
              {travelers.map((t) => (
                <button key={t} class="chip" aria-pressed={traveler === t} onClick={() => setTraveler(t)}>
                  <Icon name="user" size={14} /> {t.split(' ')[0]}
                </button>
              ))}
            </div>
          )}
        </div>

        <section id="trip-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} style={{ padding: '0 1rem' }}>
          {tab === 'itinerary' && <Itinerary trip={trip} days={days.days} settings={settings} traveler={traveler} today={today} />}
          {tab === 'weather' && <WeatherTab trip={trip} days={days} settings={settings} />}
          {tab === 'explore' && <ExploreTab trip={trip} settings={settings} />}
          {tab === 'info' && <InfoTab trip={trip} settings={settings} traveler={traveler} />}
        </section>
      </main>
      <TabBar active="none" />
    </>
  );
}

export function Itinerary(props: { trip: Trip; days: Map<string, DayInfo>; settings: Settings; traveler?: string; today: string; readOnly?: boolean }) {
  const { trip, days, settings, traveler, today, readOnly } = props;
  const tl = timeline(trip, traveler);
  if (trip.items.length === 0) {
    return (
      <Empty art="📝" title="No plans yet">
        <p class="muted" style={{ margin: 0 }}>
          Add flights, hotels, and things to do — or scan Gmail.
        </p>
        <Link class="btn primary" href={`/trip/${trip.id}/add`}>
          <Icon name="plus" /> Add a plan
        </Link>
      </Empty>
    );
  }
  return (
    <div>
      {tl.map((day, idx) => {
        const info = days.get(day.date);
        const isToday = day.date === today;
        return (
          <section key={day.date} class="day" aria-labelledby={`day-${day.date}`} id={`d-${day.date}`}>
            <div class="day-header">
              <div>
                <h2 id={`day-${day.date}`}>
                  {isToday ? 'Today · ' : ''}
                  {formatDateMedium(day.date)}
                </h2>
                <div class="row wrap" style={{ gap: '0.5rem' }}>
                  <span class="day-sub">
                    Day {idx + 1}
                    {info?.place?.city ? ` · ${info.place.city}` : ''}
                  </span>
                  <SunLine info={info} settings={settings} />
                </div>
              </div>
              {readOnly ? (
                <WeatherPill info={info} settings={settings} />
              ) : (
                <Link href={`/trip/${trip.id}/weather`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <WeatherPill info={info} settings={settings} />
                </Link>
              )}
            </div>
            {readOnly ? (
              day.stayingAt && (
                <div class="staying">
                  <Icon name="hotel" size={16} /> Staying at {day.stayingAt.title}
                </div>
              )
            ) : day.stayingAt && day.entries.length === 0 ? null : day.stayingAt ? (
              <Link class="staying" href={`/trip/${trip.id}/item/${day.stayingAt.id}`}>
                <Icon name="hotel" size={16} /> Staying at {day.stayingAt.title}
              </Link>
            ) : null}
            {day.entries.length === 0 && readOnly ? (
              <div class="free-day">Free day</div>
            ) : day.entries.length === 0 ? (
              <Link class="free-day" href={`/trip/${trip.id}/explore`} style={{ textDecoration: 'none' }}>
                <Icon name="sparkles" />
                <span>
                  {day.stayingAt ? `Free day at ${day.stayingAt.title}. ` : 'Free day. '}
                  <strong style={{ color: 'var(--tint)' }}>Find things to do</strong>
                </span>
              </Link>
            ) : (
              <ol class="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {day.entries.map((e) => (
                  <li key={`${e.item.id}-${e.role}`}>
                    <Entry entry={e} trip={trip} settings={settings} readOnly={readOnly} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Entry({ entry, trip, settings, readOnly }: { entry: TimelineEntry; trip: Trip; settings: Settings; readOnly?: boolean }) {
  const { item, role } = entry;
  const time = entry.at.length > 10 ? formatLocalTime(entry.at, settings.hour12) : '';
  let label = time;
  if (role === 'checkin') label = `Check-in · from ${time}`;
  if (role === 'checkout') label = `Check-out · by ${time}`;
  if (role === 'pickup') label = `Pick up · ${time}`;
  if (role === 'dropoff') label = `Drop off · ${time}`;
  if (isTransport(item) && item.end) label = `${time} – ${formatLocalTime(item.end, settings.hour12)}`;

  const duration = itemDurationMs(item);
  const lb = role === 'single' ? leaveBy(item, settings) : undefined;
  const nights = item.kind === 'hotel' && item.end ? daysBetween(item.start.slice(0, 10), item.end.slice(0, 10)) : 0;
  const where = item.location?.address ?? (item.location?.name !== item.title ? item.location?.name : undefined);

  const body = (
    <>
      <KindDot item={item} />
      <div class="body">
        <div class="time">
          <span class="sr-only">{KIND_META[item.kind].label}, </span>
          {label}
        </div>
        <h3>{item.title}</h3>
        {isTransport(item) && (item.from?.code || item.to?.code) ? (
          <div class="route" aria-label={`From ${item.from?.name ?? item.from?.code} to ${item.to?.name ?? item.to?.code}`}>
            <span class="code">{item.from?.code}</span>
            <span class="line" aria-hidden="true" />
            <Icon name={KIND_META[item.kind].icon} size={16} />
            <span class="line" aria-hidden="true" />
            <span class="code">{item.to?.code}</span>
          </div>
        ) : isTransport(item) ? (
          <div class="meta">
            {item.from?.name} → {item.to?.name}
          </div>
        ) : where ? (
          <div class="meta">{where}</div>
        ) : null}
        <div class="meta">
          {[item.provider, item.number, duration && formatDuration(duration)].filter(Boolean).join(' · ')}
        </div>
        <div class="pills">
          {item.from?.terminal && role === 'single' && <span class="pill">Terminal {item.from.terminal}</span>}
          {item.gate && <span class="pill">Gate {item.gate}</span>}
          {item.platform && <span class="pill">Platform {item.platform}</span>}
          {item.coach && <span class="pill">Coach {item.coach}</span>}
          {item.seat && <span class="pill">Seat {item.seat}</span>}
          {role === 'checkin' && nights > 0 && (
            <span class="pill">
              {nights} {nights === 1 ? 'night' : 'nights'}
            </span>
          )}
          {lb && <span class="pill tint">Leave by {formatLocalTime(lb.local, settings.hour12)}</span>}
          {item.source === 'recommended' && <span class="pill">Suggested</span>}
          {item.travelers && item.travelers.length > 0 && item.travelers.length < tripTravelers(trip).length && (
            <span class="pill">
              <Icon name="user" size={12} /> {item.travelers.map((t) => t.split(' ')[0]).join(', ')}
            </span>
          )}
        </div>
      </div>
    </>
  );
  return readOnly ? (
    <div class={`entry k-${item.kind}`}>{body}</div>
  ) : (
    <Link href={`/trip/${trip.id}/item/${item.id}`} class={`entry k-${item.kind}`}>
      {body}
    </Link>
  );
}
