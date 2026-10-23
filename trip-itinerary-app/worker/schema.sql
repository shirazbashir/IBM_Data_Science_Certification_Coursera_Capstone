-- Wayfare D1 schema. Apply with: npm run db:init (remote) or npm run db:init:local

CREATE TABLE IF NOT EXISTS trips (
  user TEXT NOT NULL,              -- Google account id (sub)
  id TEXT NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,     -- client edit time (last-write-wins)
  modified INTEGER NOT NULL,       -- server receive time (sync cursor)
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user, id)
);
CREATE INDEX IF NOT EXISTS trips_user_modified ON trips (user, modified);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subs (
  id TEXT PRIMARY KEY,             -- hash of endpoint
  user TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user);

CREATE TABLE IF NOT EXISTS reminders (
  user TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user, id)
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders (sent, at);

CREATE TABLE IF NOT EXISTS usage (
  user TEXT NOT NULL,
  day TEXT NOT NULL,
  extractions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user, day)
);
