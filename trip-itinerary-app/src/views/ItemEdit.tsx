import { useMemo, useState } from 'preact/hooks';
import type { Item, ItemKind, Place, Trip } from '../types';
import { Icon } from '../components/Icon';
import { Empty, KIND_META, Link, usePageTitle } from '../components/ui';
import { geocodeCity } from '../lib/geo';
import { addDays, todayLocal } from '../lib/time';
import { isTransport, uid } from '../lib/trips';
import { goBack, navigate } from '../router';
import { newTrip, saveTrip, toast, upsertItem, useAppState } from '../state';

const KINDS: ItemKind[] = ['flight', 'hotel', 'train', 'bus', 'car', 'ferry', 'activity', 'restaurant', 'sight', 'note'];

const TIMEZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return [];
  }
})();

function guessTz(trip: Trip): string {
  const counts = new Map<string, number>();
  for (const i of trip.items) counts.set(i.startTz, (counts.get(i.startTz) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function ItemEdit({ tripId, itemId, date }: { tripId: string; itemId?: string; date?: string }) {
  const trip = useAppState((s) => s.trips.find((t) => t.id === tripId && !t.deleted));
  const existing = trip?.items.find((i) => i.id === itemId);
  const titleRef = usePageTitle(existing ? 'Edit plan' : 'Add a plan');

  const initial = useMemo<Item | undefined>(() => {
    if (!trip) return undefined;
    if (existing) return structuredClone(existing);
    const d = date ?? trip.startDate;
    return { id: uid(), kind: 'activity', title: '', start: `${d}T10:00`, startTz: guessTz(trip), source: 'manual', updatedAt: Date.now() };
  }, [trip?.id, itemId]);

  const [item, setItem] = useState<Item | undefined>(initial);
  const [tzTouched, setTzTouched] = useState(!!existing);

  if (!trip || !item) {
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

  const set = (patch: Partial<Item>) => setItem({ ...item, ...patch });
  const setPlace = (key: 'from' | 'to' | 'location', patch: Partial<Place>) => set({ [key]: { ...item[key], ...patch } });
  const transport = isTransport(item);
  const hasEnd = transport || item.kind === 'hotel' || item.kind === 'car' || item.kind === 'activity';

  const fillTzFromCity = async (city?: string, country?: string, which: 'start' | 'end' = 'start') => {
    if (!city || (which === 'start' && tzTouched)) return;
    const hit = await geocodeCity(city, country).catch(() => undefined);
    const tz = hit?.tz;
    if (tz) setItem((cur) => (cur ? { ...cur, ...(which === 'start' ? { startTz: tz } : { endTz: tz }) } : cur));
  };

  const save = async (e: Event) => {
    e.preventDefault();
    const clean: Item = {
      ...item,
      title: item.title.trim() || defaultTitle(item),
      travelers: item.travelers?.map((t) => t.trim()).filter(Boolean),
      end: hasEnd && item.end ? item.end : undefined,
      updatedAt: Date.now(),
    };
    if (clean.end && clean.end < clean.start && (clean.endTz ?? clean.startTz) === clean.startTz) {
      toast('The end time is before the start time.', 'error');
      return;
    }
    await upsertItem(trip.id, clean);
    toast(existing ? 'Saved' : 'Added to your trip', 'success');
    navigate(`/trip/${trip.id}/item/${clean.id}`, { replace: true });
  };

  return (
    <main id="main" class="page view-enter">
      <div class="title-row" style={{ paddingTop: '0.4rem' }}>
        <button class="btn small" type="button" onClick={() => goBack(`/trip/${trip.id}`)}>
          Cancel
        </button>
        <button class="btn small primary" type="submit" form="item-form">
          Save
        </button>
      </div>
      <h1 class="large-title" tabIndex={-1} ref={titleRef}>
        {existing ? 'Edit plan' : 'Add a plan'}
      </h1>

      <form id="item-form" class="stack" onSubmit={save}>
        <fieldset>
          <legend>Type</legend>
          <div class="chips" role="radiogroup" aria-label="Plan type" style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <button key={k} type="button" class="chip" role="radio" aria-checked={item.kind === k} aria-pressed={item.kind === k} onClick={() => set({ kind: k })}>
                <Icon name={KIND_META[k].icon} size={16} /> {KIND_META[k].label}
              </button>
            ))}
          </div>
        </fieldset>

        <div class="form-grid">
          <Field label="Title" full>
            <input class="input" value={item.title} placeholder={defaultTitle(item)} onInput={(e) => set({ title: val(e) })} />
          </Field>
          <Field label={transport ? 'Airline / operator' : 'Provider'}>
            <input class="input" value={item.provider ?? ''} onInput={(e) => set({ provider: val(e) || undefined })} />
          </Field>
          <Field label="Confirmation #">
            <input class="input" value={item.confirmation ?? ''} autocapitalize="characters" onInput={(e) => set({ confirmation: val(e) || undefined })} />
          </Field>
          {transport && (
            <Field label={item.kind === 'flight' ? 'Flight number' : 'Service number'}>
              <input class="input" value={item.number ?? ''} autocapitalize="characters" onInput={(e) => set({ number: val(e) || undefined })} />
            </Field>
          )}
          {transport && (
            <Field label="Seat">
              <input class="input" value={item.seat ?? ''} onInput={(e) => set({ seat: val(e) || undefined })} />
            </Field>
          )}
        </div>

        <fieldset class="form-grid">
          <legend>{item.kind === 'hotel' ? 'Check-in' : transport ? 'Departure' : 'When'}</legend>
          <Field label="Date">
            <input class="input" type="date" required value={item.start.slice(0, 10)} onInput={(e) => set({ start: `${val(e)}T${item.start.slice(11, 16) || '10:00'}` })} />
          </Field>
          <Field label="Local time">
            <input class="input" type="time" value={item.start.slice(11, 16)} onInput={(e) => set({ start: `${item.start.slice(0, 10)}T${val(e) || '00:00'}` })} />
          </Field>
          <Field label="Time zone" full>
            <input
              class="input"
              list="tz-list"
              value={item.startTz}
              onInput={(e) => {
                setTzTouched(true);
                set({ startTz: val(e) });
              }}
            />
          </Field>
        </fieldset>

        {transport && (
          <PlaceFields legend="From" place={item.from} code={item.kind === 'flight'} onChange={(p) => setPlace('from', p)} onCity={(c, co) => fillTzFromCity(c, co, 'start')} />
        )}

        {hasEnd && (
          <fieldset class="form-grid">
            <legend>{item.kind === 'hotel' ? 'Check-out' : transport ? 'Arrival' : item.kind === 'car' ? 'Return' : 'Ends'}</legend>
            <Field label="Date">
              <input
                class="input"
                type="date"
                value={item.end?.slice(0, 10) ?? ''}
                onInput={(e) => set({ end: val(e) ? `${val(e)}T${item.end?.slice(11, 16) || (item.kind === 'hotel' ? '11:00' : '12:00')}` : undefined })}
              />
            </Field>
            <Field label="Local time">
              <input class="input" type="time" value={item.end?.slice(11, 16) ?? ''} onInput={(e) => set({ end: `${item.end?.slice(0, 10) || item.start.slice(0, 10)}T${val(e) || '00:00'}` })} />
            </Field>
            {transport && (
              <Field label="Arrival time zone" full>
                <input class="input" list="tz-list" value={item.endTz ?? item.startTz} onInput={(e) => set({ endTz: val(e) })} />
              </Field>
            )}
          </fieldset>
        )}

        {transport && <PlaceFields legend="To" place={item.to} code={item.kind === 'flight'} onChange={(p) => setPlace('to', p)} onCity={(c, co) => fillTzFromCity(c, co, 'end')} />}

        {!transport && item.kind !== 'note' && (
          <PlaceFields legend="Location" place={item.location} onChange={(p) => setPlace('location', p)} onCity={(c, co) => fillTzFromCity(c, co, 'start')} phone />
        )}

        <div class="form-grid">
          <Field label="Travelers (comma separated)" full>
            <input class="input" value={item.travelers?.join(', ') ?? ''} onInput={(e) => set({ travelers: val(e).split(',') })} />
          </Field>
          <Field label="Notes" full>
            <textarea class="input" value={item.notes ?? ''} onInput={(e) => set({ notes: val(e) || undefined })} />
          </Field>
        </div>

        <button class="btn primary block" type="submit">
          {existing ? 'Save changes' : 'Add to trip'}
        </button>
      </form>
      <datalist id="tz-list">
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz} />
        ))}
      </datalist>
    </main>
  );
}

function PlaceFields(props: { legend: string; place?: Place; code?: boolean; phone?: boolean; onChange: (p: Partial<Place>) => void; onCity: (city?: string, country?: string) => void }) {
  const p = props.place ?? {};
  return (
    <fieldset class="form-grid">
      <legend>{props.legend}</legend>
      <Field label={props.code ? 'Airport name' : 'Name'} full={!props.code}>
        <input class="input" value={p.name ?? ''} onInput={(e) => props.onChange({ name: val(e) || undefined })} />
      </Field>
      {props.code && (
        <Field label="Airport code">
          <input class="input" value={p.code ?? ''} maxLength={4} autocapitalize="characters" onInput={(e) => props.onChange({ code: val(e).toUpperCase() || undefined })} />
        </Field>
      )}
      {props.code && (
        <Field label="Terminal">
          <input class="input" value={p.terminal ?? ''} onInput={(e) => props.onChange({ terminal: val(e) || undefined })} />
        </Field>
      )}
      {!props.code && (
        <Field label="Address" full>
          <input class="input" value={p.address ?? ''} autocomplete="street-address" onInput={(e) => props.onChange({ address: val(e) || undefined, lat: undefined, lon: undefined })} />
        </Field>
      )}
      <Field label="City">
        <input class="input" value={p.city ?? ''} onInput={(e) => props.onChange({ city: val(e) || undefined })} onBlur={() => props.onCity(p.city, p.country)} />
      </Field>
      <Field label="Country">
        <input class="input" value={p.country ?? ''} onInput={(e) => props.onChange({ country: val(e) || undefined })} />
      </Field>
      {props.phone && (
        <Field label="Phone" full>
          <input class="input" type="tel" value={p.phone ?? ''} onInput={(e) => props.onChange({ phone: val(e) || undefined })} />
        </Field>
      )}
    </fieldset>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: preact.ComponentChildren }) {
  return (
    <label class={`field${full ? ' full' : ''}`}>
      <span class="label">{label}</span>
      {children}
    </label>
  );
}

const val = (e: Event) => (e.target as HTMLInputElement).value;

function defaultTitle(i: Item): string {
  if (isTransport(i) && (i.from?.city || i.to?.city)) return `${i.from?.city ?? '?'} → ${i.to?.city ?? '?'}`;
  return i.location?.name ?? KIND_META[i.kind].label;
}

export function NewTrip() {
  const titleRef = usePageTitle('New trip');
  const today = todayLocal();
  const [name, setName] = useState('');
  const [start, setStart] = useState(addDays(today, 14));
  const [end, setEnd] = useState(addDays(today, 18));
  return (
    <main id="main" class="page view-enter">
      <div class="title-row" style={{ paddingTop: '0.4rem' }}>
        <button class="btn small" type="button" onClick={() => goBack('/')}>
          Cancel
        </button>
      </div>
      <h1 class="large-title" tabIndex={-1} ref={titleRef}>
        New trip
      </h1>
      <form
        class="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (end < start) return toast('The trip ends before it starts.', 'error');
          const t = newTrip(name.trim() || 'My trip', start, end);
          await saveTrip(t);
          navigate(`/trip/${t.id}/add?date=${start}`, { replace: true });
        }}
      >
        <label class="field">
          <span class="label">Where are you going?</span>
          <input class="input" required placeholder="e.g. Lisbon" value={name} onInput={(e) => setName(val(e))} />
        </label>
        <div class="form-grid">
          <label class="field">
            <span class="label">Starts</span>
            <input class="input" type="date" required value={start} onInput={(e) => setStart(val(e))} />
          </label>
          <label class="field">
            <span class="label">Ends</span>
            <input class="input" type="date" required value={end} min={start} onInput={(e) => setEnd(val(e))} />
          </label>
        </div>
        <button class="btn primary block" type="submit">
          Create trip
        </button>
      </form>
    </main>
  );
}
