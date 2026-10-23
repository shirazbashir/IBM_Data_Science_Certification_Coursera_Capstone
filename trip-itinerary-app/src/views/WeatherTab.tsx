import type { Settings, Trip } from '../types';
import { DayWeatherCard } from '../components/Weather';
import type { DayInfo } from '../hooks';
import { packingList } from '../lib/clothing';
import { temp } from '../lib/units';
import { saveTrip } from '../state';

export function WeatherTab({ trip, days, settings }: { trip: Trip; days: { days: Map<string, DayInfo>; loading: boolean; error?: string }; settings: Settings }) {
  const list = [...days.days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const wx = list.map((d) => d.weather).filter((w) => w !== undefined);
  const pack = packingList(wx);
  const packed = trip.packed ?? {};
  const typical = wx.some((w) => w.basis === 'typical');

  const toggle = (id: string, on: boolean) => saveTrip({ ...trip, packed: { ...packed, [id]: on } });

  if (days.loading) {
    return (
      <div class="stack" style={{ marginTop: '1rem' }} aria-busy="true" aria-label="Loading weather">
        {[0, 1, 2].map((i) => (
          <div key={i} class="skeleton" style={{ height: '9rem' }} />
        ))}
      </div>
    );
  }

  return (
    <div>
      {days.error && (
        <p class="banner" role="status" style={{ marginTop: '1rem' }}>
          {days.error}
        </p>
      )}
      {wx.length > 0 && (
        <>
          <h2 class="section-title">At a glance</h2>
          <div class="facts">
            <div class="fact">
              <div class="label">Warmest day</div>
              <div class="val">{temp(Math.max(...wx.map((w) => w.hiF)), settings.units)}</div>
            </div>
            <div class="fact">
              <div class="label">Coldest night</div>
              <div class="val">{temp(Math.min(...wx.map((w) => w.loF)), settings.units)}</div>
            </div>
            <div class="fact">
              <div class="label">Rainy days</div>
              <div class="val">
                {wx.filter((w) => w.rainChance >= 50).length} of {wx.length}
              </div>
            </div>
          </div>
          {typical && (
            <p class="footnote" style={{ marginTop: '0.6rem' }}>
              Live forecasts cover the next 16 days. Days marked “Typical” show what the weather was on the same dates last year.
            </p>
          )}
        </>
      )}

      {pack.length > 0 && (
        <>
          <h2 class="section-title">Packing list</h2>
          <fieldset class="list">
            <legend class="sr-only">Packing list based on the forecast</legend>
            {pack.map((p) => (
              <label key={p.id} class="list-row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!packed[p.id]}
                  onChange={(e) => toggle(p.id, (e.target as HTMLInputElement).checked)}
                  style={{ width: '1.3rem', height: '1.3rem', accentColor: 'var(--tint)' }}
                />
                <span aria-hidden="true" style={{ fontSize: '1.3rem' }}>
                  {p.emoji}
                </span>
                <span style={{ textDecoration: packed[p.id] ? 'line-through' : undefined, color: packed[p.id] ? 'var(--label-3)' : undefined }}>
                  {p.label}
                </span>
                <span class="value footnote">
                  {p.days === wx.length ? 'Every day' : `${p.days} ${p.days === 1 ? 'day' : 'days'}`}
                </span>
              </label>
            ))}
          </fieldset>
        </>
      )}

      <h2 class="section-title">Day by day</h2>
      <div class="stack">
        {list.map((d) => (
          <DayWeatherCard key={d.date} info={d} settings={settings} />
        ))}
      </div>
      <p class="footnote center" style={{ marginTop: '1rem' }}>
        Weather data by Open-Meteo.com. Sunrise and sunset calculated on your device.
      </p>
    </div>
  );
}
