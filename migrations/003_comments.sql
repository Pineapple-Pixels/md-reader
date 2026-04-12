CREATE TABLE IF NOT EXISTS comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_id   TEXT NOT NULL,          -- 'me:1', 'team:team-ai', 'public'
  file       TEXT NOT NULL,          -- relative path within scope, e.g. 'notes.md'
  line       INTEGER,                -- source line number (null = general/block comment)
  text       TEXT NOT NULL,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author     TEXT NOT NULL,          -- denormalized display name (survives user deletion)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_scope_file_idx ON comments (scope_id, file);
CREATE INDEX IF NOT EXISTS comments_scope_file_line_idx ON comments (scope_id, file, line);
