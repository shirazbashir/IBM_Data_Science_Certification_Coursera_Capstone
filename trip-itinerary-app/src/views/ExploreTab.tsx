import { useMemo, useState } from 'preact/hooks';
import type { Settings, Trip } from '../types';
import { Icon } from '../components/Icon';
import { Empty, useAsync } from '../components/ui';
import { autoPlan, sightToItem } from '../lib/autoplan';
import { formatDistance, geocodeCity, locate } from '../lib/geo';
import { mapUrl } from '../lib/maps';
import { nearbySights, type Sight } from '../lib/places';
import { eachDate, formatDateShort } from '../lib/time';
import { placeOnDate, tripCities } from '../lib/trips';
import { saveTrip, toast, upsertItem, useAppState } from '../state';

export function ExploreTab({ trip, settings }: { trip: Trip; settings: Settings }) {
  const homeCity = useAppState((s) => s.settings.homeCity);
  const cities = tripCities(trip, homeCity);
  const [cityName, setCityName] = useState(cities[0]?.city);
  const city = cities.find((c) => c.city === cityName) ?? cities[0];
  const hotel = trip.items.find((i) => i.kind === 'hotel' && i.location?.city?.toLowerCase() === city?.city.toLowerCase());
  const tz = hotel?.startTz ?? trip.items.find((i) => i.to?.city === city?.city)?.endTz ?? trip.items[0]?.startTz ?? 'UTC';
  const dates = useMemo(
    () => eachDate(trip.startDate, trip.endDate).filter((d) => placeOnDate(trip, d)?.city?.toLowerCase() === city?.city.toLowerCase()),
    [trip, city?.city],
  );

  const sights = useAsync(async () => {
    if (!city) return { list: [] as Sight[], from: '' };
    const base = (await locate(hotel?.location ?? city.place)) ?? (await geocodeCity(city.city, city.place.country));
    if (!base) throw new Error(`Couldn’t find ${city.city} on the map.`);
    return { list: await nearbySights(base), from: hotel ? hotel.title : `${city.city} centre` };
  }, [city?.city, hotel?.id]);

  if (!city) {
    return (
      <Empty art="🧭" title="Nothing to explore yet">
        <p class="muted" style={{ margin: 0 }}>
          Add a hotel or a destination and Wayfare will suggest sights nearby.
        </p>
      </Empty>
    );
  }

  const inTrip = new Set(trip.items.map((i) => i.title.toLowerCase()));

  const runAutoPlan = async () => {
    const list = sights.data?.list ?? [];
    const added = autoPlan(trip, city.city, list, tz, dates);
    if (!added.length) return toast('Your days here are already full. Add sights one by one below.');
    await saveTrip({ ...trip, items: [...trip.items, ...added.map((i) => ({ ...i, tripId: trip.id }))] });
    toast(`Added ${added.length} suggested ${added.length === 1 ? 'sight' : 'sights'} to your free time`, 'success');
  };

  return (
    <div>
      {cities.length > 1 && (
        <div class="chips" role="group" aria-label="City" style={{ marginTop: '1rem' }}>
          {cities.map((c) => (
            <button key={c.city} class="chip" aria-pressed={c.city === city.city} onClick={() => setCityName(c.city)}>
              {c.city}
            </button>
          ))}
        </div>
      )}

      <div class="callout" style={{ marginTop: '1rem' }}>
        <span style={{ fontSize: '1.6rem' }} aria-hidden="true">
          ✨
        </span>
        <div class="stack" style={{ gap: '0.4rem' }}>
          <div>
            <strong>Auto-plan {city.city}</strong>
            <div class="footnote">Adds the most popular nearby sights to your free mornings and afternoons. You can remove any of them.</div>
          </div>
          <button class="btn primary small" style={{ justifySelf: 'start' }} onClick={runAutoPlan} disabled={!sights.data?.list.length}>
            <Icon name="sparkles" size={18} /> Fill my free time
          </button>
        </div>
      </div>

      <h2 class="section-title">Top sights in {city.city}</h2>
      {sights.data && <p class="footnote" style={{ marginTop: '-0.3rem' }}>Distances from {sights.data.from}. Most popular first.</p>}
      {sights.loading && (
        <div class="sight-grid" aria-busy="true" aria-label="Loading sights">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} class="skeleton" style={{ height: '15rem' }} />
          ))}
        </div>
      )}
      {sights.error && <p class="banner">{navigator.onLine ? sights.error.message : 'You’re offline. Sights will load when you reconnect.'}</p>}
      {sights.data && (
        <ul class="sight-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sights.data.list.slice(0, 24).map((s) => (
            <SightCard key={s.id} sight={s} added={inTrip.has(s.name.toLowerCase())} dates={dates} settings={settings} onAdd={(date) => upsertItem(trip.id, sightToItem(s, date, '10:00', tz, city.city, 'manual'))} />
          ))}
        </ul>
      )}
      <p class="footnote center" style={{ marginTop: '1rem' }}>
        Sights from Wikipedia, ranked by how many people read about them.
      </p>
    </div>
  );
}

function SightCard({ sight, added, dates, settings, onAdd }: { sight: Sight; added: boolean; dates: string[]; settings: Settings; onAdd: (date: string) => void }) {
  const [picking, setPicking] = useState(false);
  const id = `pick-${sight.id}`;
  return (
    <li class="sight">
      <div class="img">{sight.imageUrl ? <img src={sight.imageUrl} alt="" loading="lazy" /> : null}</div>
      <div class="txt">
        <h3>{sight.name}</h3>
        <span class="caption">
          {formatDistance(sight.distanceKm, settings.units)} away{sight.description ? ` · ${sight.description}` : ''}
        </span>
        {sight.extract && <p>{sight.extract}</p>}
        {picking ? (
          <div class="field">
            <label for={id}>Add to which day?</label>
            <select
              id={id}
              class="input"
              onChange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v) {
                  onAdd(v);
                  setPicking(false);
                  toast(`${sight.name} added to ${formatDateShort(v)}`, 'success');
                }
              }}
            >
              <option value="">Choose a day…</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatDateShort(d)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div class="row" style={{ marginTop: '0.3rem' }}>
            <button class="btn small primary" disabled={added || dates.length === 0} onClick={() => setPicking(true)} aria-label={added ? `${sight.name} is in your plans` : `Add ${sight.name} to a day`}>
              <Icon name={added ? 'check' : 'plus'} size={16} /> {added ? 'Added' : 'Add'}
            </button>
            <a class="btn small" href={mapUrl({ name: sight.name, lat: sight.lat, lon: sight.lon })} target="_blank" rel="noopener" aria-label={`Open ${sight.name} in Maps`}>
              <Icon name="map" size={16} /> Map
            </a>
            <a class="btn small" href={sight.url} target="_blank" rel="noopener" aria-label={`Read about ${sight.name}`}>
              <Icon name="ext" size={16} />
            </a>
          </div>
        )}
      </div>
    </li>
  );
}
