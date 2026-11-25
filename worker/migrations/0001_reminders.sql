-- Habit reminders. The server only knows habits the user turned a reminder on
-- for: the habit's name, emoji and time. Everything else stays on the device.
CREATE TABLE reminders (
  user_id   INTEGER NOT NULL,
  habit_id  TEXT    NOT NULL,
  name      TEXT    NOT NULL,
  emoji     TEXT    NOT NULL DEFAULT '',
  time      TEXT    NOT NULL,          -- "HH:MM", the user's local time
  tz        TEXT    NOT NULL,          -- IANA time zone, e.g. "Europe/Moscow"
  lang      TEXT    NOT NULL DEFAULT 'ru',
  last_sent TEXT,                      -- local day "YYYY-MM-DD" of the last reminder
  done_day  TEXT,                      -- local day the habit was marked done
  PRIMARY KEY (user_id, habit_id)
);

-- "Done" pressed in the bot: waits here until the app picks it up on next open
CREATE TABLE marks (
  user_id  INTEGER NOT NULL,
  habit_id TEXT    NOT NULL,
  day      TEXT    NOT NULL,
  PRIMARY KEY (user_id, habit_id, day)
);
