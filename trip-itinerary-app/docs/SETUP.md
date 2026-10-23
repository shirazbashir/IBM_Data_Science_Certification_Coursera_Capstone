# Setting up Wayfare

Plan on about 30 minutes. You need:

- a **Google account** (for Gmail access),
- a **Cloudflare account** (the free plan is enough),
- an **Anthropic API key** from <https://console.anthropic.com>.

Until you finish, the app runs on the built-in sample trips, so you can try the design straight away.

> **Hosting note.** Wayfare deploys as a single Cloudflare Worker that serves both the app and the `/api` backend from one address. This is Cloudflare's current recommended replacement for "Pages + Functions", and it's on the same free tier.

---

## Option A: deploy from your browser (nothing to install)

You can do all of this on a desktop or laptop browser. You'll only need your iPhone at the end.

1. **Create a Cloudflare account** at <https://dash.cloudflare.com/sign-up>. The free plan is enough.
2. **Create the database.** Go to **Storage & Databases → D1 SQL Database → Create**.
   - Name it `wayfare` and create it.
   - Open its **Console** tab, paste the whole contents of [`worker/schema.sql`](../worker/schema.sql), and click **Execute**.
   - Copy the **Database ID** shown on the database's page.
3. **Put the database ID into the code.** On GitHub, open `trip-itinerary-app/wrangler.jsonc` on the `claude/trip-itinerary-iphone-app-htceqr` branch.
   - Click the pencil icon to edit.
   - Replace `REPLACE_WITH_D1_DATABASE_ID` with the ID you copied.
   - Set `ALLOWED_EMAILS` to your Gmail address.
   - Click **Commit changes**.
4. **Connect the repository.** In Cloudflare, go to **Compute (Workers) → Create → Import a repository**.
   - Pick your GitHub repo and branch `claude/trip-itinerary-iphone-app-htceqr`.
   - **Root directory:** `trip-itinerary-app`
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
   - Click **Deploy**. When it finishes, copy your app's address (`https://wayfare.<something>.workers.dev`).
5. **Add your keys.** Open the Worker's **Settings → Variables and Secrets**, add each of the following, and save:
   - `ANTHROPIC_API_KEY` as a **Secret**. Create the key at <https://console.anthropic.com> → API Keys.
   - `GOOGLE_CLIENT_ID` as **Text**. You'll get it in step 2 of this guide.
6. **Optional: push reminders.** These need VAPID keys, which have to be generated from a terminal (`npm run vapid`). You can skip them, because **Add to Calendar** gives you alerts without them.

If the build fails, you can also deploy from your own computer with Option B.

## Option B: deploy from a terminal

### 1. Deploy to Cloudflare

```bash
cd trip-itinerary-app
npm install
npx wrangler login                   # opens a browser to authorise Wrangler

npx wrangler d1 create wayfare       # creates the sync database
#   → copy the printed database_id into wrangler.jsonc ("REPLACE_WITH_D1_DATABASE_ID")
npm run db:init                      # creates the tables

npx wrangler secret put ANTHROPIC_API_KEY      # paste your Anthropic key

npm run vapid                        # generates push-notification keys
npx wrangler secret put VAPID_PUBLIC_KEY       # paste the VAPID_PUBLIC_KEY value
npx wrangler secret put VAPID_PRIVATE_JWK      # paste the whole {...} JSON value

npm run deploy
```

`deploy` prints your app's address, for example `https://wayfare.<your-subdomain>.workers.dev`. Keep it handy for step 2.

Then edit the `vars` section of `wrangler.jsonc`:

| Variable | Set it to |
|---|---|
| `ALLOWED_EMAILS` | **Your Gmail address** (comma-separate others). This stops strangers from spending your Claude credits. |
| `VAPID_SUBJECT` | `mailto:` followed by your email |
| `GOOGLE_CLIENT_ID` | Filled in during step 2 |

Run `npm run deploy` again after any change.

## 2. Create the Google sign-in (Gmail read-only)

1. Open <https://console.cloud.google.com> and create a project, for example "Wayfare".
2. Go to **APIs & Services → Library**, search for **Gmail API**, and click **Enable**.
3. Go to **Google Auth Platform** (shown as "OAuth consent screen" in older consoles):
   - **Branding:** app name `Wayfare`, plus your email as the support and developer contact.
   - **Audience:** User type **External**. Leave the publishing status as **Testing**.
     Under **Test users**, add your Gmail address and anyone else who will use the app (up to 100).
   - **Data access:** add the scopes `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` and `.../auth/gmail.readonly`.
4. Go to **Clients → Create client**:
   - **Application type:** Web application
   - **Authorized JavaScript origins:** your Worker address from step 1 (for example `https://wayfare.<your-subdomain>.workers.dev`). For local development, also add `http://localhost:8787` and `http://localhost:5173`.
   - No redirect URIs are needed.
5. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`) into `GOOGLE_CLIENT_ID` in `wrangler.jsonc`, then run `npm run deploy`.

**Why testing mode?** Gmail read access is a "restricted" scope. Publishing the app to the general public would require Google's paid security assessment, but testing mode works for up to 100 named test users with no review.

What you'll notice in testing mode:

- Google shows an "app isn't verified" screen. Click **Continue**.
- Google may ask you to approve access again about once a week.

## 3. Install it on your iPhone

1. Open your Worker address in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. Open **Wayfare** from the Home Screen, go to **Scan Gmail → Connect Gmail**, and then tap **Scan for new bookings**.
4. Optional: go to **Settings → Push notifications** and turn reminders on. iOS only allows web notifications for apps opened from the Home Screen.

Prefer calendar alerts? Open a trip, go to **Info → Add to Calendar**, and choose **Add All**. Each event carries its own alerts.

---

## Local development

```bash
npm run db:init:local
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .dev.vars   # local secrets (git-ignored)
npm run worker:dev        # builds the app and serves app + API on http://localhost:8787
# or, for hot reload of the UI:
npm run dev               # Vite on :5173, with /api proxied to wrangler on :8787
```

Checks:

```bash
npm run typecheck
npm test
```

## Costs

| Service | Cost |
|---|---|
| Cloudflare Workers, D1 and cron | Free tier covers personal use |
| Open-Meteo (weather) | Free, no key needed |
| Wikipedia (sights and photos) | Free, no key needed |
| OpenStreetMap (stations, geocoding) | Free, no key needed |
| Claude | Billed per email read. A booking email is typically a few thousand tokens. Only new emails are read (already-scanned ones are skipped), and there's a per-user daily cap (`MAX_EXTRACTIONS_PER_DAY`, default 400). |

## Privacy

- **Gmail access:** read-only. The app searches only for travel-confirmation emails, and reads them in your browser.
- **Claude:** receives each matching email's text so it can extract the booking details. The Worker does not store email content.
- **Your trips:** stored on your device (IndexedDB) and in your own Cloudflare D1 database.
- **Shared links:** read-only copies of a trip, available to anyone who has the link.
