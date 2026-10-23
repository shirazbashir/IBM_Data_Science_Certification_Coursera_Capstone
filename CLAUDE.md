# Project context for Claude

This repository started as an IBM Data Science capstone (see `README.md`). It now also contains **Wayfare**, an iPhone-first trip itinerary app in `trip-itinerary-app/`. Almost all active work is on Wayfare, on branch `claude/trip-itinerary-iphone-app-htceqr`.

## Working with this user

- **Ask clarifying questions before executing a task.** This is the user's standing preference.
- The user is not a developer. Prefer browser and dashboard steps over terminal commands; they said "I don't want to install anything."
- Give step-by-step instructions with exact menu names. Offer to walk through screenshots when something doesn't match.

## What Wayfare is (agreed requirements)

The original ask: a stunning, accessible PWA for iPhone, similar to TripIt. It scans the user's Gmail and builds a complete, easy-to-read trip itinerary. It should offer manual and automatic sightseeing suggestions, plus directions to railway stations, buses and airports. Each trip should show airport terminal info, hotel check-in and check-out times and addresses, day and night temperatures with clothing advice, wind chill, and sunrise and sunset.

Decisions the user made (don't relitigate):

| Topic | Decision |
|---|---|
| Scope | Working MVP (not just a prototype) |
| Email access | Gmail OAuth (read-only scope), Google app kept in **Testing** mode (up to 100 named test users, no Google security review) |
| Extraction | Claude API in a backend (structured output), not regex or schema.org alone |
| Hosting | Cloudflare. The user picked "Pages + Workers"; it's implemented as **one Worker with static assets** (Cloudflare's current recommended setup, same free tier). The user was told this. |
| Places and maps | Free and open data plus Apple Maps deep links (Open-Meteo, Wikipedia, OpenStreetMap). No Google Maps key. |
| Visual style | iOS-native, frosted glass, large titles, automatic dark mode |
| Storage | On-device (IndexedDB) **plus** Cloudflare D1 sync tied to the Google account |
| Units | Imperial (°F, mph) and 12-hour times by default, with toggles in Settings |
| Clothing advice | Rule-based (no LLM) |
| MVP extras | Offline mode, share and export (read-only link plus `.ics`), push reminders, multiple travelers |
| Similar-app features | Research was done (`trip-itinerary-app/docs/FEATURE-RESEARCH.md`). **Nothing from that shortlist is built yet.** The user picks what comes next. |
| Code location | A folder in this repo for now ("start here, move later") |

## Architecture

```
trip-itinerary-app/
  src/                 Preact + TypeScript PWA (Vite). Hash router (src/router.ts).
    state.ts           tiny observable store persisted to IndexedDB
    lib/time.ts        wall-clock + IANA tz math (times stored as local "YYYY-MM-DDTHH:mm" + tz)
    lib/sun.ts         sunrise/sunset/golden hour, computed on device (NOAA formulas)
    lib/weather.ts     Open-Meteo forecast (16 days) + archive "typical" (same dates last year)
    lib/clothing.ts    what-to-wear rules + packing list
    lib/trips.ts       dedupe (itemKey), mergeItems (grouping/cancellations), timeline, leaveBy
    lib/autoplan.ts    "Fill my free time" with sights; fuzzy alreadyPlanned()
    lib/places.ts      Wikipedia geosearch sights (ranked by pageviews), Overpass stations, cover photos
    lib/geo.ts         Open-Meteo geocoding (cities) + Nominatim (addresses, 1 req/s throttle)
    lib/gmail.ts       Gmail search + MIME/HTML→text in the browser; calls /api/extract per email
    lib/api.ts         Google Identity Services token client + Worker API client
    lib/sync.ts        D1 sync (dirty-set, last-write-wins per trip) + reminder computation
    lib/ics.ts         calendar export with VALARMs
    demo.ts            sample data used only when built with VITE_DEMO=1
  public/sw.js         offline shell, Wikimedia photo cache, push handler
  worker/index.ts      /api routes (config, extract, trips, share, push) + cron for reminders
  worker/extract.ts    Claude call: claude-opus-5-5, effort "medium", JSON-schema structured output,
                       server-side fallbacks "default" (beta server-side-fallback-2026-07-01)
  worker/webpush.ts    VAPID + RFC 8291 aes128gcm encryption on WebCrypto
  worker/schema.sql    D1 tables (trips, shares, push_subs, reminders, usage)
  tests/               Vitest
  docs/SETUP.md        deploy guide (browser-only Option A + terminal Option B)
  docs/FEATURE-RESEARCH.md
```

Key conventions:
- Times are local wall clock plus an IANA time zone, never UTC strings. Convert with `localToEpoch` and `epochToLocal`.
- Sun times must be shown in the time zone of the place they were computed for (see `tzForCity` in `src/hooks.ts`).
- All outside data goes through `fetchJson`/`cached` in `src/lib/db.ts` (IndexedDB cache with a stale fallback when offline).
- Use `Link`/`navigate` from `src/components/ui.tsx` and `src/router.ts` for in-app links, so the back-stack depth stays correct.
- Colors are CSS tokens in `src/styles.css`, with light, OS-dark and `[data-theme="dark"]` variants. Keep WCAG AA contrast.
- Worker auth: Google access token → `tokeninfo` check (audience must equal `GOOGLE_CLIENT_ID`), plus an optional `ALLOWED_EMAILS` allowlist. There's a daily extraction cap per user.

## Commands (run in `trip-itinerary-app/`)

```bash
npm install
npm run typecheck   # app + worker
npm test            # vitest, 34 tests
npm run build       # → dist/
npm run worker:dev  # app + API on http://localhost:8787 (needs: npm run db:init:local)
VITE_DEMO=1 npx vite build --base ./ --outDir dist-demo   # self-contained demo build
```

## Verified vs not verified

Verified in the cloud sandbox:
- Typecheck is clean and all 34 tests pass. That includes the RFC 8291 push-encryption test vector, the NWS wind-chill table, DST handling and trip merging.
- The local Worker passed checks of its API routes; the D1 last-write-wins SQL was also checked.
- The offline reload works (service worker plus IndexedDB).
- axe-core reports 0 violations on every screen, in both light and dark mode.
- Screens were reviewed at iPhone size.

**Not yet verified end to end**, because the sandbox had no keys and its network policy blocks those hosts:
- Real Gmail OAuth.
- Real Claude extraction.
- Live Open-Meteo, Wikipedia and OpenStreetMap calls. These were tested with realistic mocks only.
- Web Push delivery to a real iPhone.

Bugs found and fixed during testing (for awareness):
- A render race left the app stuck on a blank loading screen when IndexedDB loaded before the first subscription. Fixed in `useAppState`.
- Sun times on travel days were shown in the wrong time zone.
- Auto-plan suggested sights that were already booked under a longer name, and missed arrivals from overnight flights.

## Status and next steps

- The code is pushed to `claude/trip-itinerary-iphone-app-htceqr`. No pull request has been opened yet; ask before opening one.
- A private demo was published from the original account at https://claude.ai/artifact/P729QD3cTsAi44ysyz4ekJ. It uses sample data, and Gmail, sync and downloads are disabled. Another account can't open it unless it is shared from the page's Share menu. To republish it from a new account, build with `VITE_DEMO=1`, inline the JS and CSS into one HTML fragment (title, style, `#app` div, module script), and publish that.
- **The user has not deployed yet.** They were given the browser-only steps (Cloudflare dashboard D1 + Import a repository; Google Auth Platform in Testing mode with an authorized JavaScript origin set to the workers.dev URL; `ANTHROPIC_API_KEY` secret; `GOOGLE_CLIENT_ID` text variable). Push reminders also need VAPID keys (`npm run vapid`), which require a terminal; Calendar export is the no-install alternative.
- Next features: the user should choose from `docs/FEATURE-RESEARCH.md`. The top recommendations are live flight-status alerts (needs a paid flight-data API), a map for each day with route lines (MapLibre + OSM), and a document vault (R2).

## Small known gaps

- `confirm()` is used for delete actions, so delete does nothing inside the claude.ai artifact viewer (it works in the real deployment).
- Wikipedia photos load cross-origin without credits beyond "Photo: Wikipedia". Consider adding the attribution properly.
- `Leave by` uses a fixed 45-minute travel allowance; there's no live traffic.
