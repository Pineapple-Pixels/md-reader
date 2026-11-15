-- users.email now only holds addresses verified by Google. Emails typed by an admin on
-- password accounts were never verified and could bind someone else's Google sign-in.
UPDATE users SET email = NULL WHERE google_sub IS NULL AND password_hash IS NOT NULL;
