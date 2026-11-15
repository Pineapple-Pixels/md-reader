CREATE TABLE IF NOT EXISTS org_members (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);
CREATE INDEX org_members_org_idx ON org_members (org_id);

INSERT INTO org_members (user_id, org_id, role) SELECT id, org_id, role FROM users;

CREATE TABLE IF NOT EXISTS org_invites (
  org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, email)
);
CREATE INDEX org_invites_email_idx ON org_invites (email);

ALTER TABLE users ADD COLUMN last_org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
UPDATE users SET last_org_id = org_id;
ALTER TABLE users DROP COLUMN org_id;
ALTER TABLE users DROP COLUMN role;
