// Demo mode (build with VITE_DEMO=1): answers the app's outside data requests with
// built-in sample data, for hosts that can't reach weather, Wikipedia or OpenStreetMap.

const dates = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = new Date(`${a}T00:00Z`); d <= new Date(`${b}T00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};

function forecast(u: URL) {
  const t = dates(u.searchParams.get('start_date')!, u.searchParams.get('end_date')!);
  const lat = Number(u.searchParams.get('latitude'));
  const shift = lat > 55 ? -6 : lat > 40 ? 0 : lat > 30 ? 4 : 18;
  const codes = [3, 61, 2, 80, 1, 63, 45, 0, 3, 2];
  const n = (i: number, a: number, s: number) => +(a + Math.sin(i * 1.7) * s).toFixed(1);
  return {
    daily: {
      time: t,
      weather_code: t.map((_, i) => codes[i % codes.length]),
      temperature_2m_max: t.map((_, i) => n(i, 52 + shift, 4)),
      temperature_2m_min: t.map((_, i) => n(i, 41 + shift, 3)),
      apparent_temperature_max: t.map((_, i) => n(i, 48 + shift, 4)),
      apparent_temperature_min: t.map((_, i) => n(i, 34 + shift, 3)),
      precipitation_probability_max: t.map((_, i) => [20, 75, 30, 55, 10, 85, 15][i % 7]),
      precipitation_sum: t.map(() => 0.05),
      wind_speed_10m_max: t.map((_, i) => n(i, 13, 6)),
      wind_gusts_10m_max: t.map((_, i) => n(i, 28, 8)),
      uv_index_max: t.map(() => (shift > 10 ? 6 : 1.5)),
    },
  };
}

/** A small illustrated city skyline as a data URI (stands in for destination photos). */
export function skyline(hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,58%)"/><stop offset="1" stop-color="hsl(${hue + 30},70%,82%)"/></linearGradient></defs><rect width="1200" height="800" fill="url(#s)"/><circle cx="900" cy="250" r="90" fill="#ffe9a8" opacity=".9"/><path d="M0 560 L80 560 L80 420 L140 420 L140 380 L170 330 L200 380 L200 560 L260 560 L260 460 L330 460 L330 300 L360 260 L390 300 L390 560 L470 560 L470 400 L560 400 L560 520 L640 520 L640 340 L700 340 L700 250 L720 200 L740 250 L740 560 L820 560 L820 430 L900 430 L900 560 L1000 560 L1000 380 L1060 380 L1060 560 L1200 560 L1200 800 L0 800Z" fill="hsl(${hue + 200},35%,22%)" opacity=".85"/><path d="M0 640 C300 600 600 690 1200 630 L1200 800 L0 800Z" fill="hsl(${hue + 200},40%,15%)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const SIGHTS: Record<string, [string, string][]> = {
  london: [
    ['Tower of London', 'Historic castle on the Thames'], ['British Museum', 'Museum of human history and culture'],
    ['Tower Bridge', 'Victorian bascule bridge'], ['National Gallery', 'Art museum on Trafalgar Square'],
    ["St Paul's Cathedral", 'Wren’s domed cathedral'], ['Covent Garden', 'Market, street performers and shops'],
    ['Sky Garden', 'Free public garden with city views'], ['Somerset House', 'Arts centre with a riverside courtyard'],
  ],
  edinburgh: [
    ['Edinburgh Castle', 'Fortress on Castle Rock'], ['Royal Mile', 'Historic street through the Old Town'],
    ["Arthur's Seat", 'Extinct volcano with panoramic views'], ['National Museum of Scotland', 'Natural and cultural history'],
    ['Calton Hill', 'Monuments and city views'], ['Palace of Holyroodhouse', 'Official Scottish royal residence'],
    ['Dean Village', 'Riverside former mill village'], ['Scottish National Gallery', 'Fine art on the Mound'],
  ],
  tokyo: [
    ['Senso-ji', 'Tokyo’s oldest Buddhist temple'], ['Meiji Shrine', 'Shinto shrine in a forested park'],
    ['Shibuya Crossing', 'The famous scramble crossing'], ['Tokyo Skytree', 'Broadcasting tower and observation decks'],
    ['Shinjuku Gyoen', 'Large national garden'], ['teamLab Planets', 'Immersive digital art museum'],
    ['Tsukiji Outer Market', 'Street food and seafood stalls'], ['Tokyo National Museum', 'Japanese art and antiquities'],
  ],
};

function sights(lat: number, lon: number) {
  const city = lat > 55 ? 'edinburgh' : lat > 40 ? 'london' : 'tokyo';
  return {
    query: {
      pages: SIGHTS[city].map(([title, description], i) => ({
        pageid: 1000 + i + (city.length * 100),
        title,
        description,
        extract: `${title} is one of the most visited places in the city. ${description}.`,
        thumbnail: { source: skyline((i * 47 + city.length * 20) % 360) },
        coordinates: [{ lat: lat + (i - 4) * 0.004, lon: lon + ((i % 3) - 1) * 0.006 }],
        pageviews: { a: 100000 - i * 9000 },
      })),
    },
  };
}

function stations(lat: number, lon: number) {
  const near = (dLat: number, dLon: number) => ({ lat: lat + dLat, lon: lon + dLon });
  const names = lat > 55
    ? [['Edinburgh Waverley', 'rail'], ['St Andrew Square', 'tram'], ['Edinburgh Bus Station', 'bus'], ['Haymarket', 'rail']]
    : lat > 40
      ? [['Holborn', 'metro'], ["King's Cross St Pancras", 'rail'], ['Victoria Coach Station', 'bus'], ['Paddington', 'rail']]
      : [['Shinjuku', 'rail'], ['Tochōmae', 'metro'], ['Shinjuku Expressway Bus Terminal', 'bus'], ['Yoyogi', 'rail']];
  const offs = [[0.001, -0.001], [0.012, -0.004], [0.006, 0.01], [-0.015, 0.02]];
  return {
    elements: names.map(([name, kind], i) => ({
      type: 'node',
      id: i + 1,
      ...near(offs[i][0], offs[i][1]),
      tags: kind === 'bus' ? { name, amenity: 'bus_station' } : kind === 'tram' ? { name, railway: 'tram_stop' } : { name, railway: 'station', ...(kind === 'metro' ? { station: 'subway' } : {}) },
    })),
  };
}

const CITIES: Record<string, [number, number, string, string]> = {
  london: [51.507, -0.1276, 'Europe/London', 'United Kingdom'],
  edinburgh: [55.953, -3.1883, 'Europe/London', 'United Kingdom'],
  tokyo: [35.6764, 139.65, 'Asia/Tokyo', 'Japan'],
  'new york': [40.7128, -74.006, 'America/New_York', 'United States'],
};

export function demoResponse(url: string, init?: RequestInit): unknown {
  const u = new URL(url);
  if (u.hostname.includes('geocoding-api')) {
    const name = (u.searchParams.get('name') ?? '').toLowerCase();
    const c = CITIES[name] ?? CITIES.london;
    return { results: [{ latitude: c[0], longitude: c[1], timezone: c[2], name: u.searchParams.get('name'), country: c[3], country_code: '' }] };
  }
  if (u.hostname.includes('open-meteo')) return forecast(u);
  if (u.hostname.includes('wikipedia')) {
    if (u.searchParams.get('generator') === 'geosearch') {
      const [lat, lon] = u.searchParams.get('ggscoord')!.split('|').map(Number);
      return sights(lat, lon);
    }
    const t = u.searchParams.get('titles') ?? '';
    return { query: { pages: [{ title: t, thumbnail: { source: skyline((t.length * 37) % 360) } }] } };
  }
  if (u.hostname.includes('overpass')) {
    const q = String((init?.body as URLSearchParams | undefined)?.get?.('data') ?? '');
    const m = /around:\d+,(-?[\d.]+),(-?[\d.]+)/.exec(q);
    return stations(m ? +m[1] : 51.5, m ? +m[2] : -0.12);
  }
  if (u.hostname.includes('nominatim')) {
    const q = (u.searchParams.get('q') ?? '').toLowerCase();
    const key = Object.keys(CITIES).find((k) => q.includes(k)) ?? 'london';
    return [{ lat: String(CITIES[key][0]), lon: String(CITIES[key][1]), display_name: q }];
  }
  throw new Error('Not available in the demo');
}
