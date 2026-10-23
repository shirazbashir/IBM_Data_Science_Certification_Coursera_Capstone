import { Toasts } from './components/ui';
import { useRoute } from './router';
import { useAppState } from './state';
import { ImportView } from './views/ImportView';
import { ItemDetail } from './views/ItemDetail';
import { ItemEdit, NewTrip } from './views/ItemEdit';
import { SettingsView } from './views/SettingsView';
import { SharedTrip } from './views/SharedTrip';
import { TripsList } from './views/TripsList';
import { TripView } from './views/TripView';

export function App() {
  const route = useRoute();
  const ready = useAppState((s) => s.ready);
  if (!ready) return <div class="page" aria-busy="true" />;

  let view;
  switch (route.name) {
    case 'trip':
      view = <TripView key={route.tripId} tripId={route.tripId} tab={route.tab} />;
      break;
    case 'item':
      view = <ItemDetail key={route.itemId} tripId={route.tripId} itemId={route.itemId} />;
      break;
    case 'edit':
      view = <ItemEdit key={`${route.tripId}:${route.itemId}`} tripId={route.tripId} itemId={route.itemId} date={route.date} />;
      break;
    case 'newTrip':
      view = <NewTrip />;
      break;
    case 'import':
      view = <ImportView />;
      break;
    case 'settings':
      view = <SettingsView />;
      break;
    case 'shared':
      view = <SharedTrip shareId={route.shareId} />;
      break;
    default:
      view = <TripsList />;
  }
  return (
    <>
      <a class="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      {view}
      <Toasts />
    </>
  );
}
