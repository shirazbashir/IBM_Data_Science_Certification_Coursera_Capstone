import type { DayInfo } from '../hooks';
import type { Settings } from '../types';
import { adviseClothing } from '../lib/clothing';
import { formatDateLong, formatDateShort, formatDuration, formatEpochTime } from '../lib/time';
import { speed, temp, tempLong, windChillF } from '../lib/units';
import { describeWeather } from '../lib/weather';
import { Icon } from './Icon';

export function WeatherPill({ info, settings }: { info?: DayInfo; settings: Settings }) {
  const w = info?.weather;
  if (!w) return null;
  const d = describeWeather(w.code);
  return (
    <span
      class="day-wx"
      role="img"
      aria-label={`${d.text}, high ${tempLong(w.hiF, settings.units)}, low ${tempLong(w.loF, settings.units)}${w.basis === 'typical' ? ', typical for this date' : ''}`}
    >
      <span aria-hidden="true">{d.emoji}</span>
      <span aria-hidden="true">{temp(w.hiF, settings.units)}</span>
      <span class="lo" aria-hidden="true">
        {temp(w.loF, settings.units)}
      </span>
    </span>
  );
}

export function SunLine({ info, settings }: { info?: DayInfo; settings: Settings }) {
  const s = info?.sun;
  if (!s || !info) return null;
  if (s.polar) return <span class="day-sub">{s.polar === 'day' ? 'Midnight sun: no sunset' : 'Polar night: no sunrise'}</span>;
  return (
    <span class="day-sub row" style={{ gap: '0.6rem' }}>
      <span class="row" style={{ gap: '0.2rem' }}>
        <Icon name="sunrise" size={15} />
        <span class="sr-only">Sunrise</span> {formatEpochTime(s.sunrise!, info.tz, settings.hour12)}
      </span>
      <span class="row" style={{ gap: '0.2rem' }}>
        <Icon name="sunset" size={15} />
        <span class="sr-only">Sunset</span> {formatEpochTime(s.sunset!, info.tz, settings.hour12)}
      </span>
    </span>
  );
}

/** Full day card: day/night temps, feels-like, wind chill, wind, rain, UV, sun, what to wear. */
export function DayWeatherCard({ info, settings, heading = true }: { info: DayInfo; settings: Settings; heading?: boolean }) {
  const w = info.weather;
  const s = info.sun;
  const u = settings.units;
  const where = info.place?.city;
  if (!w) {
    return (
      <article class="card wx-card" aria-label={formatDateLong(info.date)}>
        {heading && <h3 style={{ margin: 0 }}>{formatDateShort(info.date)}</h3>}
        <p class="muted" style={{ margin: 0 }}>
          {where ? `Weather for ${where} isn’t available yet.` : 'Add a hotel or destination to see weather.'}
        </p>
      </article>
    );
  }
  const d = describeWeather(w.code);
  const chill = windChillF(w.loF, w.windMph);
  const wear = adviseClothing(w);
  return (
    <article class="card wx-card" aria-label={`${formatDateLong(info.date)}${where ? ` in ${where}` : ''}`}>
      {heading && (
        <div class="row">
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{formatDateShort(info.date)}</h3>
          <span class="spacer" />
          {where && <span class="footnote">{where}</span>}
        </div>
      )}
      <div class="wx-top">
        <span class="wx-emoji" role="img" aria-label={d.text}>
          {d.emoji}
        </span>
        <div class="wx-temps">
          <div>
            <div class="l">Day</div>
            <div class="t">{temp(w.hiF, u)}</div>
          </div>
          <div>
            <div class="l">Night</div>
            <div class="t">{temp(w.loF, u)}</div>
          </div>
        </div>
        <span class="spacer" />
        <div class="footnote" style={{ textAlign: 'right' }}>
          {d.text}
          {w.basis === 'typical' && (
            <div>
              <span class="pill">Typical · last year</span>
            </div>
          )}
        </div>
      </div>
      <div class="wx-grid">
        <div class="wx-stat">
          <div class="l">Feels like</div>
          <div class="v">
            {temp(w.feelsHiF, u)} / {temp(w.feelsLoF, u)}
          </div>
        </div>
        <div class="wx-stat">
          <div class="l">Wind chill</div>
          <div class="v">{chill === undefined ? '—' : temp(chill, u)}</div>
        </div>
        <div class="wx-stat">
          <div class="l">
            <Icon name="wind" size={12} /> Wind
          </div>
          <div class="v">
            {speed(w.windMph, u)}
            {w.gustMph && w.gustMph > w.windMph + 8 ? <span class="footnote"> · gusts {speed(w.gustMph, u)}</span> : null}
          </div>
        </div>
        <div class="wx-stat">
          <div class="l">
            <Icon name="drop" size={12} /> Rain
          </div>
          <div class="v">{Math.round(w.rainChance)}%</div>
        </div>
        {w.uv !== undefined && (
          <div class="wx-stat">
            <div class="l">UV index</div>
            <div class="v">
              {Math.round(w.uv)} <span class="footnote">{uvWord(w.uv)}</span>
            </div>
          </div>
        )}
        {s && !s.polar && (
          <>
            <div class="wx-stat">
              <div class="l">
                <Icon name="sunrise" size={12} /> Sunrise
              </div>
              <div class="v">{formatEpochTime(s.sunrise!, info.tz, settings.hour12)}</div>
            </div>
            <div class="wx-stat">
              <div class="l">
                <Icon name="sunset" size={12} /> Sunset
              </div>
              <div class="v">{formatEpochTime(s.sunset!, info.tz, settings.hour12)}</div>
            </div>
            <div class="wx-stat">
              <div class="l">Daylight</div>
              <div class="v">{formatDuration(s.daylightMs)}</div>
            </div>
            {s.goldenHour && (
              <div class="wx-stat">
                <div class="l">Golden hour</div>
                <div class="v">{formatEpochTime(s.goldenHour, info.tz, settings.hour12)}</div>
              </div>
            )}
          </>
        )}
      </div>
      {wear.items.length > 0 && (
        <div>
          <div class="footnote" style={{ fontWeight: 700, marginBottom: '0.35rem' }}>
            <Icon name="shirt" size={14} /> What to wear
          </div>
          <ul class="wear" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {wear.items.map((i) => (
              <li key={i.id} class="pill">
                <span aria-hidden="true">{i.emoji}</span> {i.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function uvWord(uv: number): string {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}
