CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  body        TEXT NOT NULL,
  visibility  TEXT NOT NULL CHECK (visibility IN ('public', 'private')),
  code_hash   TEXT NOT NULL UNIQUE,
  answer      TEXT,
  created_at  TEXT NOT NULL,
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS messages_answered ON messages (answered_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  ts  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_key_ts ON rate_limits (key, ts);
