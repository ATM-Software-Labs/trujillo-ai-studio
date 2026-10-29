-- Contadores de alta frecuencia. Sustituyen las escrituras KV de ops,
-- cuotas de tokens, cupo /v1, límites de correo e ideas.
-- Aplicar en remoto antes del deploy:
--   npx wrangler d1 migrations apply groq-discord-bot-counters --remote

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ideas_day ON ideas (day, created_at);

CREATE TABLE IF NOT EXISTS mail_tickets (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
