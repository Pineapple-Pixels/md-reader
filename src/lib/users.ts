import bcrypt from 'bcryptjs';
import { sql } from './db.js';
import { findOrgByEmailDomain, joinByDomain, acceptInvites } from './orgs.js';

const BCRYPT_COST = 12;

/** Role inside one organization (org_members.role). */
export type UserRole = 'admin' | 'member';

/** An account. Organizations it belongs to live in org_members (see orgs.ts). */
export type User = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  createdAt: Date;
};

type UserRow = {
  id: number;
  username: string;
  password_hash: string | null;
  display_name: string | null;
  email: string | null;
  created_at: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function findByUsername(username: string): Promise<(User & { passwordHash: string | null }) | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, password_hash, display_name, email, created_at
    FROM users WHERE LOWER(username) = LOWER(${username}) LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { ...toUser(row), passwordHash: row.password_hash };
}

export async function findById(id: number): Promise<User | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, password_hash, display_name, email, created_at FROM users WHERE id = ${id} LIMIT 1
  `;
  const row = rows[0];
  return row ? toUser(row) : null;
}

export async function countUsers(): Promise<number> {
  const rows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM users`;
  return Number(rows[0]?.count ?? '0');
}

/** Without a password the account can only sign in with Google. `email` must be Google-verified. */
export async function createUser(params: {
  username: string;
  password?: string;
  email?: string;
  googleSub?: string;
  displayName?: string;
}): Promise<User> {
  const passwordHash = params.password ? await hashPassword(params.password) : null;
  const rows = await sql<UserRow[]>`
    INSERT INTO users (username, password_hash, display_name, email, google_sub)
    VALUES (
      ${params.username},
      ${passwordHash},
      ${params.displayName ?? null},
      ${params.email?.toLowerCase() ?? null},
      ${params.googleSub ?? null}
    )
    RETURNING id, username, password_hash, display_name, email, created_at
  `;
  const row = rows[0];
  if (!row) throw new Error('createUser: insert no devolvio filas');
  return toUser(row);
}

export async function updatePassword(username: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  const result = await sql`
    UPDATE users
    SET password_hash = ${passwordHash}
    WHERE LOWER(username) = LOWER(${username})
  `;
  return result.count > 0;
}

/** Deletes the whole account (all orgs). Admins of an org remove members instead (orgs.ts). */
export async function deleteUser(username: string): Promise<boolean> {
  const result = await sql`DELETE FROM users WHERE LOWER(username) = LOWER(${username})`;
  return result.count > 0;
}

/**
 * Resolves a verified Google identity to an account, creating it on first sign-in.
 * A new account belongs to no organization: it joins the orgs that invited its email, and
 * the org whose domain admits a Workspace account of that domain (`hd`). Personal Google
 * accounts (no `hd`, e.g. gmail) only get in by invitation.
 */
export async function findOrProvisionGoogleUser(identity: {
  sub: string;
  email: string;
  name: string | null;
  hd: string | null;
}): Promise<User> {
  const email = identity.email.toLowerCase();
  const fields = sql`id, username, password_hash, display_name, email, created_at`;

  // Google just verified this address for this identity: no other account keeps it.
  await sql`UPDATE users SET email = NULL WHERE LOWER(email) = ${email} AND google_sub IS DISTINCT FROM ${identity.sub}`;

  let user: User | null = null;
  const bySub = await sql<UserRow[]>`
    UPDATE users SET email = ${email} WHERE google_sub = ${identity.sub} RETURNING ${fields}
  `;
  if (bySub[0]) user = toUser(bySub[0]);

  // A local account may already use this address as its username; keep both apart.
  const taken = !user && (await sql`SELECT 1 FROM users WHERE LOWER(username) = ${email}`).count > 0;
  user ??= await createUser({
    username: taken ? `${email}#${identity.sub.slice(-6)}` : email,
    email,
    googleSub: identity.sub,
    ...(identity.name ? { displayName: identity.name } : {}),
  });

  await acceptInvites(user.id, email);
  const domain = email.split('@')[1];
  const byDomain = domain && identity.hd === domain ? await findOrgByEmailDomain(domain) : null;
  if (byDomain) await joinByDomain(byDomain.id, user.id);
  return user;
}
