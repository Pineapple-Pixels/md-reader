CREATE TABLE IF NOT EXISTS organizations (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organizations (slug, name) VALUES ('default', 'Default') ON CONFLICT (slug) DO NOTHING;

ALTER TABLE users ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE users SET org_id = (SELECT id FROM organizations WHERE slug = 'default');
ALTER TABLE users ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN google_sub TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));
CREATE INDEX users_org_idx ON users (org_id);

ALTER TABLE teams ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE teams SET org_id = (SELECT id FROM organizations WHERE slug = 'default');
ALTER TABLE teams ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE teams DROP CONSTRAINT teams_slug_key;
DROP INDEX IF EXISTS teams_slug_lower_idx;
CREATE UNIQUE INDEX teams_org_slug_idx ON teams (org_id, LOWER(slug));

UPDATE comments SET scope_id = 'default/' || scope_id;
