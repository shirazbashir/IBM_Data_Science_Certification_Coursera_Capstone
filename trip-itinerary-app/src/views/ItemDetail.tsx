import type { ComponentChildren } from 'preact';
import type { Item, Place, Settings, Trip } from '../types';
import { Icon } from '../components/Icon';
import { CopyButton, Empty, KIND_META, Link, TabBar, useAsync, usePageTitle } from '../components/ui';
import { DayWeatherCard } from '../components/Weather';
import { useTripDays } from '../hooks';
import { formatDistance, locate } from '../lib/geo';
import { downloadIcs, tripToIcs } from '../lib/ics';
import { directionsUrl, mapUrl, placeQuery, type TravelMode } from '../lib/maps';
import { nearbyStations, type Station } from '../lib/places';
import { datePart, daysBetween, formatClock, formatDateShort, formatDuration, formatLocalTime } from '../lib/time';
import { isTransport, itemDurationMs, itemEndDate, leaveBy } from '../lib/trips';
import { goBack, navigate } from '../router';
import { removeItem, toast, useAppState } from '../state';

export function ItemDetail({ tripId, itemId }: { tripId: string; itemId: string }) {
  const trip = useAppState((s) => s.trips.find((t) => t.id === tripId));
  const settings = useAppState((s) => s.settings);
  const item = trip?.items.find((i) => i.id === itemId);
  const titleRef = usePageTitle(item?.title ?? 'Plan');
  const days = useTripDays(trip);

  if (!trip || !item) {
    return (
      <main id="main" class="page">
        <Empty art="🔎" title="This plan no longer exists">
          <Link class="btn" href={trip ? `/trip/${tripId}` : '/'}>
            Back
          </Link>
        </Empty>
      </main>
    );
  }

  const meta = KIND_META[item.kind];
  const transport = isTransport(item);
  const duration = itemDurationMs(item);
  const lb = leaveBy(item, settings);
  const dayInfo = days.days.get(item.kind === 'hotel' ? datePart(item.start) : datePart(item.end ?? item.start));
  const fromHotel = transport ? hotelBefore(trip, item) : undefined;
  const toHotel = transport ? hotelAfter(trip, item) : undefined;
  const nights = item.kind === 'hotel' && item.end ? daysBetween(datePart(item.start), datePart(item.end)) : 0;
  const place = item.location;

  return (
    <>
      <main id="main" class="page flush view-enter">
        <header class={`detail-hero k-${item.kind}`}>
          {item.imageUrl && <img class="cover" src={item.imageUrl} alt="" />}
          <div class="top-actions">
            <button class="icon-btn on-image" aria-label="Back" onClick={() => goBack(`/trip/${trip.id}`)}>
              <Icon name="back" />
            </button>
            <Link class="icon-btn on-image" href={`/trip/${trip.id}/item/${item.id}/edit`} aria-label="Edit">
              <Icon name="edit" />
            </Link>
          </div>
          <div class="kicker">
            {meta.label}
            {item.provider ? ` · ${item.provider}` : ''}
            {item.number ? ` · ${item.number}` : ''}
          </div>
          <h1 tabIndex={-1} ref={titleRef}>
            {item.title}
          </h1>
          {transport ? (
            <div style={{ marginTop: '0.8rem' }}>
              <div class="route">
                <span class="code">{item.from?.code ?? shortName(item.from)}</span>
                <span class="line" aria-hidden="true" />
                <Icon name={meta.icon} size={20} />
                <span class="line" aria-hidden="true" />
                <span class="code">{item.to?.code ?? shortName(item.to)}</span>
              </div>
              <div class="times">
                <span>
                  {formatDateShort(datePart(item.start))}
                  <br />
                  {formatLocalTime(item.start, settings.hour12)}
                </span>
                {duration && <span style={{ alignSelf: 'center', opacity: 0.9 }}>{formatDuration(duration)}</span>}
                {item.end && (
                  <span style={{ textAlign: 'right' }}>
                    {formatDateShort(datePart(item.end))}
                    <br />
                    {formatLocalTime(item.end, settings.hour12)}
                  </span>
                )}
              </div>
              <p class="sr-only">
                Departs {item.from?.name} {formatDateShort(datePart(item.start))} at {formatLocalTime(item.start, settings.hour12)} local time
                {item.end ? `, arrives ${item.to?.name} ${formatDateShort(datePart(item.end))} at ${formatLocalTime(item.end, settings.hour12)} local time` : ''}.
              </p>
            </div>
          ) : (
            <p style={{ margin: '0.4rem 0 0', fontWeight: 600 }}>
              {formatDateShort(datePart(item.start))}
              {item.kind !== 'hotel' && item.start.length > 10 ? ` · ${formatLocalTime(item.start, settings.hour12)}` : ''}
              {item.kind === 'hotel' && item.end ? ` – ${formatDateShort(itemEndDate(item))} · ${nights} ${nights === 1 ? 'night' : 'nights'}` : ''}
            </p>
          )}
        </header>

        <div style={{ padding: '0 1rem' }} class="stack">
          {item.status === 'cancelled' && <p class="banner" style={{ color: 'var(--danger)' }}>This booking was cancelled.</p>}

          {lb && (
            <div class="callout" role="note">
              <Icon name="clock" size={28} />
              <div>
                <div class="footnote">Leave by</div>
                <div class="big">{formatLocalTime(lb.local, settings.hour12)}</div>
                <div class="footnote">{lb.explanation} Live traffic isn’t included.</div>
              </div>
            </div>
          )}

          <Facts item={item} settings={settings} nights={nights} />

          {transport && (
            <Section title="Getting there">
              <DirectionRow label={`To ${placeName(item.from)}`} sub="From your current location" to={item.from} />
              {fromHotel?.location && <DirectionRow label={`From ${fromHotel.title}`} sub={`To ${placeName(item.from)}`} from={fromHotel.location} to={item.from} />}
              {item.kind === 'flight' && item.from?.terminal && (
                <a class="list-row" href={mapUrl({ name: `Terminal ${item.from.terminal}, ${item.from.name ?? item.from.code + ' Airport'}`, city: item.from.city })} target="_blank" rel="noopener">
                  <Icon name="map" />
                  <span>
                    Find Terminal {item.from.terminal} at {item.from.code ?? item.from.name}
                    <br />
                    <span class="footnote">Opens the terminal in Apple Maps (indoor maps where available)</span>
                  </span>
                </a>
              )}
            </Section>
          )}
          {transport && (
            <Section title="On arrival">
              {item.kind === 'flight' && item.to?.terminal && (
                <div class="list-row">
                  <Icon name="flight" />
                  <span>
                    Arrives at Terminal {item.to.terminal}, {item.to.name ?? item.to.code}
                  </span>
                </div>
              )}
              {toHotel?.location ? (
                <DirectionRow label={`To ${toHotel.title}`} sub={`From ${placeName(item.to)} by public transport`} from={item.to} to={toHotel.location} />
              ) : (
                <DirectionRow label={`From ${placeName(item.to)}`} sub="Directions into town" from={item.to} to={{ city: item.to?.city, name: item.to?.city }} />
              )}
            </Section>
          )}

          {!transport && place && (
            <Section title="Location">
              {(place.address || place.name) && (
                <div class="list-row">
                  <Icon name="sight" />
                  <span style={{ minWidth: 0 }}>{place.address ?? place.name}</span>
                  <span class="spacer" />
                  <CopyButton text={placeQuery(place)} label="Copy address" />
                </div>
              )}
              {place.phone && (
                <a class="list-row" href={`tel:${place.phone.replace(/[^\d+]/g, '')}`}>
                  <Icon name="phone" />
                  {place.phone}
                </a>
              )}
              <div class="list-row" style={{ flexWrap: 'wrap' }}>
                <ModeButton to={place} mode="transit" />
                <ModeButton to={place} mode="walking" />
                <ModeButton to={place} mode="driving" />
              </div>
            </Section>
          )}

          {item.kind === 'hotel' && place && <NearbyStations place={place} settings={settings} />}

          {dayInfo && (
            <>
              <h2 class="section-title" style={{ marginBottom: 0 }}>
                Weather {item.kind === 'hotel' ? 'at check-in' : transport ? 'on arrival' : 'that day'}
              </h2>
              <DayWeatherCard info={dayInfo} settings={settings} heading={false} />
            </>
          )}

          {(item.travelers?.length || item.notes || item.url) && (
            <Section title="Details">
              {item.travelers?.length ? (
                <div class="list-row">
                  <Icon name="user" />
                  <span>{item.travelers.join(', ')}</span>
                </div>
              ) : null}
              {item.notes && <div class="list-row" style={{ whiteSpace: 'pre-wrap', alignItems: 'flex-start' }}><Icon name="note" /><span>{item.notes}</span></div>}
              {item.url && (
                <a class="list-row" href={item.url} target="_blank" rel="noopener">
                  <Icon name="ext" /> More information
                </a>
              )}
            </Section>
          )}

          <Section title="Actions">
            <button class="list-row" onClick={() => downloadIcs(`${item.title}.ics`, tripToIcs(trip, settings, item))}>
              <Icon name="calendar" /> Add to Calendar
            </button>
            <Link class="list-row" href={`/trip/${trip.id}/item/${item.id}/edit`}>
              <Icon name="edit" /> Edit
            </Link>
            <button
              class="list-row"
              style={{ color: 'var(--danger)' }}
              onClick={async () => {
                if (!confirm(`Remove “${item.title}” from this trip?`)) return;
                await removeItem(trip.id, item.id);
                toast('Removed');
                navigate(`/trip/${trip.id}`, { replace: true });
              }}
            >
              <Icon name="trash" /> Remove from trip
            </button>
          </Section>
          {item.source === 'gmail' && <p class="footnote center">Imported from Gmail</p>}
        </div>
      </main>
      <TabBar active="none" />
    </>
  );
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section>
      <h2 class="section-title">{title}</h2>
      <div class="list">{children}</div>
    </section>
  );
}

function Facts({ item, settings, nights }: { item: Item; settings: Settings; nights: number }) {
  const facts: [string, string, boolean?][] = [];
  if (item.confirmation) facts.push(['Confirmation', item.confirmation, true]);
  if (item.kind === 'flight' && item.from?.terminal) facts.push(['Departs terminal', item.from.terminal]);
  if (item.kind === 'flight' && item.to?.terminal) facts.push(['Arrives terminal', item.to.terminal]);
  if (item.gate) facts.push(['Gate', item.gate]);
  if (item.platform) facts.push(['Platform', item.platform]);
  if (item.coach) facts.push(['Coach', item.coach]);
  if (item.seat) facts.push(['Seat', item.seat]);
  if (item.cabin) facts.push(['Class', item.cabin]);
  if (item.kind === 'hotel') {
    const inT = item.checkInTime ?? (item.start.length > 10 ? item.start.slice(11, 16) : undefined);
    const outT = item.checkOutTime ?? (item.end && item.end.length > 10 ? item.end.slice(11, 16) : undefined);
    if (inT) facts.push(['Check-in from', formatClock(inT, settings.hour12)]);
    if (outT) facts.push(['Check-out by', formatClock(outT, settings.hour12)]);
    if (nights) facts.push(['Nights', String(nights)]);
  }
  if (item.kind === 'car' && item.end) facts.push(['Return', `${formatDateShort(datePart(item.end))} ${formatLocalTime(item.end, settings.hour12)}`]);
  if (!facts.length) return null;
  return (
    <div class="facts" style={{ marginTop: '0.25rem' }}>
      {facts.map(([label, val, copy]) => (
        <div key={label} class="fact">
          <div class="label">{label}</div>
          <div class="row" style={{ justifyContent: 'space-between' }}>
            <div class="val" style={copy ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } : undefined}>
              {val}
            </div>
            {copy && <CopyButton text={val} label={`Copy ${label.toLowerCase()}`} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectionRow({ label, sub, from, to }: { label: string; sub: string; from?: Place; to?: Place }) {
  return (
    <div class="list-row" style={{ flexWrap: 'wrap' }}>
      <Icon name="directions" />
      <span style={{ flex: 1, minWidth: '10rem' }}>
        {label}
        <br />
        <span class="footnote">{sub}</span>
      </span>
      <span class="row" style={{ gap: '0.4rem' }}>
        <a class="btn small" href={directionsUrl(to, from, 'transit')} target="_blank" rel="noopener" aria-label={`${label}: public transport directions`}>
          <Icon name="train" size={16} /> Transit
        </a>
        <a class="btn small" href={directionsUrl(to, from, 'driving')} target="_blank" rel="noopener" aria-label={`${label}: driving directions`}>
          <Icon name="car" size={16} /> Drive
        </a>
      </span>
    </div>
  );
}

function ModeButton({ to, mode }: { to: Place; mode: TravelMode }) {
  const icon = mode === 'transit' ? 'train' : mode === 'walking' ? 'walk' : 'car';
  const label = mode === 'transit' ? 'Transit' : mode === 'walking' ? 'Walk' : 'Drive';
  return (
    <a class="btn small" href={directionsUrl(to, undefined, mode)} target="_blank" rel="noopener" aria-label={`${label} directions`}>
      <Icon name={icon} size={16} /> {label}
    </a>
  );
}

const STATION_LABEL: Record<Station['kind'], { icon: string; label: string }> = {
  rail: { icon: 'train', label: 'Railway station' },
  metro: { icon: 'train', label: 'Metro / subway' },
  tram: { icon: 'train', label: 'Tram stop' },
  bus: { icon: 'bus', label: 'Bus station' },
};

function NearbyStations({ place, settings }: { place: Place; settings: Settings }) {
  const res = useAsync(async () => {
    const at = await locate(place);
    if (!at) throw new Error('Couldn’t locate this address.');
    return { at, list: await nearbyStations(at) };
  }, [place.address, place.name]);

  return (
    <section>
      <h2 class="section-title">Stations nearby</h2>
      <div class="list" aria-busy={res.loading}>
        {res.loading && <div class="list-row footnote">Finding railway and bus stations…</div>}
        {res.error && <div class="list-row footnote">{navigator.onLine ? res.error.message : 'Available when you’re back online.'}</div>}
        {res.data?.list.length === 0 && <div class="list-row footnote">No stations within walking distance.</div>}
        {res.data?.list.slice(0, 8).map((s) => (
          <a key={s.id} class="list-row" href={directionsUrl({ name: s.name, lat: s.lat, lon: s.lon }, place, s.distanceKm < 1.2 ? 'walking' : 'transit')} target="_blank" rel="noopener">
            <Icon name={STATION_LABEL[s.kind].icon} />
            <span>
              {s.name}
              <br />
              <span class="footnote">{STATION_LABEL[s.kind].label}</span>
            </span>
            <span class="value footnote">
              {formatDistance(s.distanceKm, settings.units)}
              <br />~{Math.max(1, Math.round((s.distanceKm / 4.8) * 60))} min walk
            </span>
          </a>
        ))}
      </div>
      <p class="footnote" style={{ marginTop: '0.4rem' }}>
        Station data © OpenStreetMap contributors. Tap for directions from your hotel.
      </p>
    </section>
  );
}

const placeName = (p?: Place) => p?.name ?? (p?.code ? `${p.code} Airport` : p?.city ?? 'the station');
const shortName = (p?: Place) => (p?.name ?? p?.city ?? '').split(/[ ,]/)[0];

/** The hotel you're leaving from on the day of a departure. */
function hotelBefore(trip: Trip, item: Item) {
  const d = datePart(item.start);
  return trip.items.find((i) => i.kind === 'hotel' && i.status !== 'cancelled' && datePart(i.start) < d && itemEndDate(i) >= d);
}

/** The hotel you're heading to after an arrival. */
function hotelAfter(trip: Trip, item: Item) {
  const d = datePart(item.end ?? item.start);
  return trip.items.find((i) => i.kind === 'hotel' && i.status !== 'cancelled' && datePart(i.start) <= d && itemEndDate(i) > d && i.location?.city === item.to?.city);
}
