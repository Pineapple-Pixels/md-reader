CREATE TABLE IF NOT EXISTS teams (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teams_slug_lower_idx ON teams (LOWER(slug));

CREATE TABLE IF NOT EXISTS team_members (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (user_id, team_id)
);

CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members (team_id);
