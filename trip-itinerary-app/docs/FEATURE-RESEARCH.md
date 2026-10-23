# Feature research: what similar apps do well

I surveyed TripIt (and TripIt Pro), Flighty, Wanderlog and Tripsy in October 2026. The table below shows what Wayfare already covers. After it is a ranked shortlist of features we could adopt.

**None of the shortlist has been built yet.** Pick the ones you want and they become the next round of work.

## Already in Wayfare v0.1

| Feature | Inspired by | Status |
|---|---|---|
| Build itineraries automatically from emails | TripIt (forward-to-plans@) and Wanderlog Pro (Gmail scan) | ✅ Gmail scan with Claude extraction |
| Offline access to the whole itinerary | TripIt, Wanderlog, Tripsy | ✅ IndexedDB plus a service worker |
| "Go Now": when to leave for the airport | TripIt Pro | ✅ "Leave by" time, with a push reminder |
| Check-in reminder 24 hours before a flight | TripIt Pro | ✅ Push notification and calendar alert |
| Share the itinerary with companions | TripIt, Tripsy, Wanderlog | ✅ Read-only link (editing is shortlist item 6) |
| Calendar sync | TripIt, Tripsy | ✅ `.ics` export with alerts |
| Sightseeing suggestions and auto-fill of free time | Wanderlog | ✅ Wikipedia-ranked sights and "Fill my free time" |
| Weather, packing list | Tripsy, Wanderlog | ✅ Plus wind chill, clothing advice, sunrise, sunset and golden hour |

## Shortlist (my recommended order)

Effort is per feature: S is under a day, M is 1–3 days, L is a week or more. Ongoing cost is per month for personal use.

| # | Feature | Seen in | What it gives you | Effort | Ongoing cost / dependency |
|---|---|---|---|---|---|
| 1 | **Live flight status**: delays, gate and terminal changes, cancellations | TripIt Pro, Flighty | Push alerts the moment a gate or time changes, with live status on the flight card | M | Needs a flight-data API, for example FlightAware AeroAPI (pay-per-query) or AeroDataBox. Expect a few dollars a month. |
| 2 | **Day map with route lines** | Wanderlog | Each day's stops pinned on a map, with walking lines between them | M | Free: MapLibre with OpenStreetMap tiles. Heavy use needs a tile host such as MapTiler (free tier). |
| 3 | **Document vault**: boarding passes, passport and visa scans, PDFs | Tripsy | Tickets kept offline alongside each booking | M | Cloudflare R2 storage (free tier). Files are encrypted on the device. |
| 4 | **"Today" view** | Flighty, TripIt | A single screen with what's next, a countdown and the leave-by time. Opens by default during a trip. | S | None |
| 5 | **Destination essentials**: currency and exchange rate, tipping norms, plug and voltage type, emergency numbers, entry and visa reminders | Common in travel guides | Practical "know before you go" facts for each country | S–M | Free exchange-rate API (for example Frankfurter / ECB). The rest is static data. |
| 6 | **Collaborative editing** with travel companions | Wanderlog, Tripsy | Others can add plans to a shared trip | M | Uses the existing D1 sync, plus per-trip members and permissions |
| 7 | **Budget and expense tracking with bill splitting** | Wanderlog | Costs pulled from confirmations, plus manual expenses and who-owes-whom | M | None. Claude can also extract prices from emails. |
| 8 | **Travel stats**: miles flown, countries, nights away | Flighty, Tripsy | A fun yearly recap | S | None |
| 9 | **Jet-lag helper** | Some flight apps | Sleep and light-exposure timing around long-haul flights, using the time zones we already have | S | None |
| 10 | **Seat and fare-drop alerts** | TripIt Pro | Alerts when a better seat opens or the fare drops (for refunds or credits) | L | Needs paid airline and fare data. Low value for the cost, so I'd skip it. |

### Not possible as a web app (needs a native iOS app)

- **Live Activities / Dynamic Island** (Flighty): no web API exists for these.
- **Home Screen widgets.** Shortlist item 4 is the closest a web app can get.
- **Apple Wallet passes.** We can link to the airline's Wallet pass, but not create one without a native app or a pass-signing certificate.

## Sources

- [TripIt or TripIt Pro? (TripIt Help Center)](https://help.tripit.com/en/support/solutions/articles/103000063396-tripit-or-tripit-pro-)
- [Review of TripIt (PilotPlans)](https://www.pilotplans.com/blog/review-of-tripit)
- [Best trip planning apps 2026 (TripProf)](https://tripprof.com/en/blog/best-trip-planning-apps-2026/)
- [Best travel apps for iPhone and iPad in 2026 (MacMyths)](https://macmyths.com/best-travel-apps-for-iphone-and-ipad-in-2026/)
- [Tripsy review (MacStories)](https://www.macstories.net/reviews/tripsy-review-the-ultimate-trip-planner-for-iphone-and-ipad/)
- [Tripsy adds Apple Intelligence and Shortcuts (AlternativeTo)](https://alternativeto.net/news/2025/5/tripsy-adds-apple-intelligence-chatgpt-travel-planning-and-shortcuts-automation/)
- [Wanderlog on the App Store](https://apps.apple.com/NG/app/id1476732439)
