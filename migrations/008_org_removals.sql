-- People an org removed: domain auto-join must not bring them back. An invite or an admin
-- adding them again clears the mark.
CREATE TABLE IF NOT EXISTS org_removals (
  org_id     INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- Accounts without password or Google identity were admin-made placeholders whose email was
-- never verified. Nobody could ever sign in to them: turn them into pending invites instead.
INSERT INTO org_invites (org_id, email, role)
SELECT m.org_id, LOWER(u.email), m.role
FROM users u JOIN org_members m ON m.user_id = u.id
WHERE u.google_sub IS NULL AND u.password_hash IS NULL AND u.email IS NOT NULL
ON CONFLICT (org_id, email) DO NOTHING;
DELETE FROM users WHERE google_sub IS NULL AND password_hash IS NULL;

-- From here on users.email only holds addresses verified by Google.
UPDATE users SET email = NULL WHERE google_sub IS NULL;
