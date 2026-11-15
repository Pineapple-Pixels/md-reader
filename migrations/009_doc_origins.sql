-- Where a team's document was copied from ("Copiar a equipo"). One row per copied file;
-- the label is frozen at copy time so it reads the same after renames.
CREATE TABLE IF NOT EXISTS doc_origins (
  scope_id   TEXT NOT NULL,
  path       TEXT NOT NULL,
  from_label TEXT NOT NULL,
  from_path  TEXT NOT NULL,
  by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_id, path)
);
