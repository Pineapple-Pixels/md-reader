import { sql } from './db.js';

export type Org = {
  id: number;
  slug: string;
  name: string;
  allowedDomains: string[];
};

type OrgRow = { id: number; slug: string; name: string; allowed_domains: string[] };

const toOrg = (r: OrgRow): Org => ({ id: r.id, slug: r.slug, name: r.name, allowedDomains: r.allowed_domains });

export const DEFAULT_ORG_SLUG = 'default';

export async function findOrgBySlug(slug: string): Promise<Org | null> {
  const rows = await sql<OrgRow[]>`
    SELECT id, slug, name, allowed_domains FROM organizations WHERE slug = ${slug.toLowerCase()} LIMIT 1
  `;
  return rows[0] ? toOrg(rows[0]) : null;
}

/** The org that auto-admits users of this email domain, if exactly one does. */
export async function findOrgByEmailDomain(domain: string): Promise<Org | null> {
  const rows = await sql<OrgRow[]>`
    SELECT id, slug, name, allowed_domains FROM organizations
    WHERE ${domain.toLowerCase()} = ANY(allowed_domains)
    LIMIT 2
  `;
  return rows.length === 1 && rows[0] ? toOrg(rows[0]) : null;
}

export async function createOrg(params: { slug: string; name: string; allowedDomains?: string[] }): Promise<Org> {
  const domains = (params.allowedDomains ?? []).map((d) => d.toLowerCase());
  const rows = await sql<OrgRow[]>`
    INSERT INTO organizations (slug, name, allowed_domains)
    VALUES (${params.slug.toLowerCase()}, ${params.name}, ${domains})
    RETURNING id, slug, name, allowed_domains
  `;
  if (!rows[0]) throw new Error('createOrg: insert no devolvio filas');
  return toOrg(rows[0]);
}

export async function listOrgs(): Promise<Org[]> {
  const rows = await sql<OrgRow[]>`SELECT id, slug, name, allowed_domains FROM organizations ORDER BY slug`;
  return rows.map(toOrg);
}

export async function requireOrg(slug: string | undefined): Promise<Org> {
  const org = await findOrgBySlug(slug ?? DEFAULT_ORG_SLUG);
  if (!org) throw new Error(`organizacion no encontrada: ${slug ?? DEFAULT_ORG_SLUG}`);
  return org;
}

// ---------- Memberships (a user can belong to many orgs, with a role in each) ----------

export type OrgRole = 'admin' | 'member';
export type Membership = { orgId: number; slug: string; name: string; role: OrgRole };
export type OrgMember = { id: number; username: string; displayName: string | null; email: string | null; role: OrgRole; createdAt: Date };

/**
 * An explicit addition by the org (admin, invite, CLI): it also lifts a previous removal.
 * `keepRole`: when already a member, leave the current role alone.
 */
export async function addOrgMember(orgId: number, userId: number, role: OrgRole = 'member', opts?: { keepRole?: boolean }): Promise<void> {
  await sql`DELETE FROM org_removals WHERE org_id = ${orgId} AND user_id = ${userId}`;
  if (opts?.keepRole) {
    await sql`INSERT INTO org_members (user_id, org_id, role) VALUES (${userId}, ${orgId}, ${role}) ON CONFLICT DO NOTHING`;
  } else {
    await sql`
      INSERT INTO org_members (user_id, org_id, role) VALUES (${userId}, ${orgId}, ${role})
      ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role
    `;
  }
}

/**
 * Removes the user from the org and from its teams; the account and other orgs stay. The
 * removal is remembered so domain auto-join does not bring them back on their next sign-in.
 */
export async function removeOrgMember(orgId: number, userId: number): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`DELETE FROM team_members WHERE user_id = ${userId} AND team_id IN (SELECT id FROM teams WHERE org_id = ${orgId})`;
    const r = await tx`DELETE FROM org_members WHERE user_id = ${userId} AND org_id = ${orgId}`;
    if (r.count > 0) {
      await tx`INSERT INTO org_removals (org_id, user_id) VALUES (${orgId}, ${userId}) ON CONFLICT DO NOTHING`;
    }
    return r.count > 0;
  });
}

/** Domain auto-join: never re-adds someone the org removed, never changes an existing role. */
export async function joinByDomain(orgId: number, userId: number): Promise<void> {
  await sql`
    INSERT INTO org_members (user_id, org_id, role)
    SELECT ${userId}, ${orgId}, 'member'
    WHERE NOT EXISTS (SELECT 1 FROM org_removals WHERE org_id = ${orgId} AND user_id = ${userId})
    ON CONFLICT DO NOTHING
  `;
}

export async function getMembership(userId: number, orgId: number): Promise<Membership | null> {
  const rows = await sql<{ slug: string; name: string; role: OrgRole }[]>`
    SELECT o.slug, o.name, m.role FROM org_members m JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = ${userId} AND m.org_id = ${orgId}
  `;
  return rows[0] ? { orgId, ...rows[0] } : null;
}

export async function listUserOrgs(userId: number): Promise<Membership[]> {
  const rows = await sql<{ org_id: number; slug: string; name: string; role: OrgRole }[]>`
    SELECT m.org_id, o.slug, o.name, m.role FROM org_members m JOIN organizations o ON o.id = m.org_id
    WHERE m.user_id = ${userId} ORDER BY o.name
  `;
  return rows.map((r) => ({ orgId: r.org_id, slug: r.slug, name: r.name, role: r.role }));
}

/** The org a session opens in: the last one used if still a member, else the oldest membership, else none. */
export async function defaultOrgId(userId: number): Promise<number | null> {
  const rows = await sql<{ org_id: number }[]>`
    SELECT m.org_id FROM org_members m JOIN users u ON u.id = m.user_id
    WHERE m.user_id = ${userId}
    ORDER BY (m.org_id = u.last_org_id) DESC NULLS LAST, m.created_at ASC
    LIMIT 1
  `;
  return rows[0]?.org_id ?? null;
}

export async function setLastOrg(userId: number, orgId: number): Promise<void> {
  await sql`UPDATE users SET last_org_id = ${orgId} WHERE id = ${userId}`;
}

/** `localPassword`: a password account with no Google identity (the only kind an admin may reset). */
export async function findMember(orgId: number, username: string): Promise<(OrgMember & { orgCount: number; localPassword: boolean }) | null> {
  const rows = await sql<(OrgMember & { org_count: number; local_password: boolean; display_name: string | null; created_at: Date })[]>`
    SELECT u.id, u.username, u.display_name, u.email, m.role, u.created_at,
           (SELECT COUNT(*)::int FROM org_members x WHERE x.user_id = u.id) AS org_count,
           (u.password_hash IS NOT NULL AND u.google_sub IS NULL) AS local_password
    FROM org_members m JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ${orgId} AND LOWER(u.username) = LOWER(${username})
  `;
  const r = rows[0];
  return r ? {
    id: r.id, username: r.username, displayName: r.display_name, email: r.email, role: r.role,
    createdAt: r.created_at, orgCount: r.org_count, localPassword: r.local_password,
  } : null;
}

export async function setMemberRole(orgId: number, userId: number, role: OrgRole): Promise<void> {
  await sql`UPDATE org_members SET role = ${role} WHERE org_id = ${orgId} AND user_id = ${userId}`;
}

export async function listOrgMembers(orgId: number, opts?: { limit?: number; offset?: number }): Promise<{ data: OrgMember[]; total: number }> {
  const countRows = await sql<{ count: string }[]>`SELECT COUNT(*)::text AS count FROM org_members WHERE org_id = ${orgId}`;
  const total = Number(countRows[0]?.count ?? '0');
  const rows = await sql<{ id: number; username: string; display_name: string | null; email: string | null; role: OrgRole; created_at: Date }[]>`
    SELECT u.id, u.username, u.display_name, u.email, m.role, u.created_at
    FROM org_members m JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ${orgId}
    ORDER BY u.username
    LIMIT ${opts?.limit ?? total} OFFSET ${opts?.offset ?? 0}
  `;
  return {
    data: rows.map((r) => ({ id: r.id, username: r.username, displayName: r.display_name, email: r.email, role: r.role, createdAt: r.created_at })),
    total,
  };
}

// ---------- Invitations (by email; consumed when that email signs in with Google) ----------

export type Invite = { email: string; role: OrgRole; createdAt: Date };

/**
 * Adds the account whose Google-verified email matches right away; otherwise leaves a pending
 * invite that only that verified email can accept.
 */
export async function inviteToOrg(orgId: number, email: string, role: OrgRole, invitedBy: number): Promise<'added' | 'invited'> {
  const e = email.toLowerCase();
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM users WHERE LOWER(email) = ${e} AND google_sub IS NOT NULL LIMIT 1
  `;
  if (existing[0]) {
    await addOrgMember(orgId, existing[0].id, role, { keepRole: true });
    return 'added';
  }
  await sql`
    INSERT INTO org_invites (org_id, email, role, invited_by) VALUES (${orgId}, ${e}, ${role}, ${invitedBy})
    ON CONFLICT (org_id, email) DO UPDATE SET role = EXCLUDED.role
  `;
  return 'invited';
}

export async function listInvites(orgId: number): Promise<Invite[]> {
  const rows = await sql<{ email: string; role: OrgRole; created_at: Date }[]>`
    SELECT email, role, created_at FROM org_invites WHERE org_id = ${orgId} ORDER BY created_at DESC
  `;
  return rows.map((r) => ({ email: r.email, role: r.role, createdAt: r.created_at }));
}

export async function deleteInvite(orgId: number, email: string): Promise<boolean> {
  const r = await sql`DELETE FROM org_invites WHERE org_id = ${orgId} AND email = ${email.toLowerCase()}`;
  return r.count > 0;
}

/** Turns every pending invite for this verified email into a membership (lifting old removals). */
export async function acceptInvites(userId: number, email: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM org_removals
      WHERE user_id = ${userId} AND org_id IN (SELECT org_id FROM org_invites WHERE email = ${email.toLowerCase()})
    `;
    await tx`
      INSERT INTO org_members (user_id, org_id, role)
      SELECT ${userId}, org_id, role FROM org_invites WHERE email = ${email.toLowerCase()}
      ON CONFLICT DO NOTHING
    `;
    await tx`DELETE FROM org_invites WHERE email = ${email.toLowerCase()}`;
  });
}
