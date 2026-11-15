ALTER TABLE organizations ADD COLUMN design JSONB;
ALTER TABLE organizations ADD COLUMN logo TEXT;

CREATE TABLE IF NOT EXISTS user_themes (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  tokens     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_themes_user_idx ON user_themes (user_id);

ALTER TABLE users ADD COLUMN active_theme TEXT;
