import bcrypt from 'bcryptjs';
import { sql } from './db.js';

const BCRYPT_COST = 12;

export type UserRole = 'admin' | 'member';

export type User = {
  id: number;
  username: string;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
};

type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  display_name: string | null;
  role: UserRole;
  created_at: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function findByUsername(username: string): Promise<(User & { passwordHash: string }) | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, password_hash, display_name, role, created_at
    FROM users
    WHERE LOWER(username) = LOWER(${username})
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { ...toUser(row), passwordHash: row.password_hash };
}

export async function findById(id: number): Promise<User | null> {
  const rows = await sql<UserRow[]>`
    SELECT id, username, password_hash, display_name, role, created_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toUser(row) : null;
}

export async function countUsers(): Promise<number> {
  const rows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM users`;
  return Number(rows[0]?.count ?? '0');
}

export async function createUser(params: {
  username: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}): Promise<User> {
  const passwordHash = await hashPassword(params.password);
  const rows = await sql<UserRow[]>`
    INSERT INTO users (username, password_hash, display_name, role)
    VALUES (
      ${params.username},
      ${passwordHash},
      ${params.displayName ?? null},
      ${params.role ?? 'member'}
    )
    RETURNING id, username, password_hash, display_name, role, created_at
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

export async function deleteUser(username: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM users
    WHERE LOWER(username) = LOWER(${username})
  `;
  return result.count > 0;
}

export async function listUsers(opts?: { limit?: number; offset?: number }): Promise<{ data: User[]; total: number }> {
  const countRows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM users`;
  const total = Number(countRows[0]?.count ?? '0');
  const limit = opts?.limit ?? total;
  const offset = opts?.offset ?? 0;
  const rows = await sql<UserRow[]>`
    SELECT id, username, password_hash, display_name, role, created_at
    FROM users
    ORDER BY id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return { data: rows.map(toUser), total };
}
