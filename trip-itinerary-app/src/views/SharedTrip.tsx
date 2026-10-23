import { Icon } from '../components/Icon';
import { Empty, gradientFor, Link, useAsync, usePageTitle } from '../components/ui';
import { useCover, useTripDays } from '../hooks';
import { fetchShare } from '../lib/api';
import { formatRange, todayLocal } from '../lib/time';
import { uid } from '../lib/trips';
import { navigate } from '../router';
import { putTrips, toast, useAppState } from '../state';
import { Itinerary } from './TripView';

/** Read-only view of a trip someone shared with you. */
export function SharedTrip({ shareId }: { shareId: string }) {
  const settings = useAppState((s) => s.settings);
  const res = useAsync(() => fetchShare(shareId), [shareId]);
  const trip = res.data?.trip;
  const titleRef = usePageTitle(trip ? `${trip.name} (shared)` : 'Shared trip');
  const cover = useCover(trip);
  const days = useTripDays(trip);

  if (res.loading) return <main id="main" class="page" aria-busy="true"><div class="skeleton" style={{ height: '16rem', marginTop: '1rem' }} /></main>;
  if (!trip) {
    return (
      <main id="main" class="page">
        <Empty art="🔗" title="This link isn’t available">
          <p class="muted">{res.error?.message ?? 'It may have been removed.'}</p>
          <Link class="btn" href="/">Open Wayfare</Link>
        </Empty>
      </main>
    );
  }

  const save = async () => {
    const id = uid();
    await putTrips([{ ...trip, id, sample: false, items: trip.items.map((i) => ({ ...i, id: uid(), tripId: id })), updatedAt: Date.now() }]);
    toast('Saved to your trips', 'success');
    navigate(`/trip/${id}`, { replace: true });
  };

  return (
    <main id="main" class="page flush view-enter">
      <header class="trip-header" style={{ '--hero-grad': gradientFor(trip.name) }}>
        {cover && <img class="cover" src={cover} alt="" />}
        <div class="head-body">
          <p class="footnote" style={{ color: '#fff', opacity: 0.9 }}>Shared itinerary · read-only</p>
          <h1 tabIndex={-1} ref={titleRef}>{trip.name}</h1>
          <p>{formatRange(trip.startDate, trip.endDate)}</p>
        </div>
      </header>
      <div style={{ padding: '1rem' }}>
        <button class="btn primary block" onClick={save}>
          <Icon name="plus" /> Save a copy to my trips
        </button>
        <Itinerary trip={trip} days={days.days} settings={settings} today={todayLocal()} readOnly />
      </div>
    </main>
  );
}
