# Wayfare: trip itineraries from your Gmail

Wayfare is an accessible progressive web app (PWA) designed for iPhone, in the spirit of TripIt. It scans Gmail for booking confirmations and uses Claude to extract the details. It then lays out each trip as a clear day-by-day timeline, with weather, clothing advice, sights and directions.

**Setup:** see [docs/SETUP.md](docs/SETUP.md). The app runs on sample trips until setup is done.
**Next features:** see [docs/FEATURE-RESEARCH.md](docs/FEATURE-RESEARCH.md) for a shortlist drawn from TripIt, Flighty, Wanderlog and Tripsy.

## Features

**Itinerary**
- Gmail scan (read-only) finds flights, hotels, trains, buses, ferries, car rentals, restaurants and activities. Claude extracts times, time zones, terminals, gates, seats, coaches, confirmation numbers, addresses and travelers.
- Booking-change emails update the existing entry instead of creating duplicates, and cancellation emails remove it. Bookings are grouped into trips automatically and named after the destination.
- The timeline shows each day with check-in and check-out as separate entries, "staying at" notes, flight duration across time zones, and free days.
- You can add or edit any plan by hand. Time zones are filled in from the city.
- Filter the itinerary by traveler when several people are on a trip.

**Getting around** (directions open in Apple Maps)
- Directions to the airport or station from where you are now, or from your hotel.
- Directions from the arrival airport to your next hotel.
- Departure and arrival terminals, with a "Find Terminal X" map link.
- Railway, metro and bus stations near each hotel, with distance and walking time.
- A "leave by" time for every departure, based on the airport or station buffer plus travel time.

**Weather and what to wear**
- Daily high and low (day and night), feels-like temperature, US National Weather Service wind chill, wind and gusts, rain chance, and UV index.
- The live forecast covers the next 16 days. Further out, the app shows "typical" weather from the same dates last year.
- Sunrise, sunset, daylight length and golden hour, calculated on the device so they work offline for any date.
- Clothing suggestions for each day (layers, rain gear, sun protection) and a trip packing checklist.

**Sightseeing**
- The most popular sights near your hotel, ranked by Wikipedia readership, with photos and short descriptions.
- Add a sight to a specific day, or use **Fill my free time** to schedule them automatically around your flights and existing plans.

**Everywhere**
- Works offline: trips, weather, sights and photos are cached on the device.
- Syncs across devices through Cloudflare D1, using your Google account.
- Read-only share links, plus Calendar export (`.ics`) with alerts.
- Push reminders for check-in opening, leave-for-the-airport, and hotel check-in and check-out.
- Imperial units (°F, mph) and 12-hour times by default, with metric and 24-hour options in Settings.

## Accessibility

- Text scales with the iPhone's Text Size setting (Dynamic Type), and the layout adapts to it.
- Works with VoiceOver: semantic landmarks, headings, and announced screen changes. Icons are labelled or hidden from screen readers, and toasts and progress are read out.
- Colour contrast meets WCAG AA in light and dark mode. Verified with axe-core on every screen, with zero violations.
- Respects Reduce Motion and Increase Contrast. Touch targets are at least 44 pt.

## Architecture

```
src/                 Preact + TypeScript PWA (≈40 KB gzipped JS)
  lib/time.ts        wall-clock + IANA time zone math
  lib/sun.ts         sunrise/sunset/golden hour (NOAA formulas, offline)
  lib/weather.ts     Open-Meteo forecast + last-year "typical" fallback
  lib/clothing.ts    rule-based what-to-wear + packing list
  lib/trips.ts       dedupe, trip grouping, timeline, leave-by
  lib/places.ts      Wikipedia sights, OSM stations, cover photos
  lib/gmail.ts       Gmail search + email → text in the browser
  lib/sync.ts        D1 sync + push reminder scheduling
public/sw.js         offline shell, photo cache, push notifications
worker/              Cloudflare Worker: /api + static assets
  extract.ts         Claude structured-output extraction
  webpush.ts         VAPID + RFC 8291 encryption on WebCrypto
  schema.sql         D1 tables
tests/               Vitest (time zones, wind chill, sun, trips, ics, push RFC vector)
```
