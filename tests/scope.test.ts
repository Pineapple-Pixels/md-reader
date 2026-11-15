import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { resolveScope, ScopeError } from '../src/lib/storage.js';
import { STORAGE_DIR } from '../src/lib/config.js';
import type { AuthUser } from '../src/lib/auth.js';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  userId: 7,
  username: 'ana',
  role: 'member',
  orgId: 1,
  orgSlug: 'facu-a',
  orgName: 'Facu A',
  teams: [{ slug: 'catedra', name: 'Catedra', role: 'member' }],
  ...over,
});

function status(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof ScopeError) return err.status;
    throw err;
  }
  return undefined;
}

describe('resolveScope', () => {
  it('rejects empty and unknown scopes', () => {
    expect(status(() => resolveScope('', user()))).toBe(400);
    expect(status(() => resolveScope('otro', user()))).toBe(400);
  });

  it('puts me and team inside the user org, with org-prefixed ids', () => {
    const me = resolveScope('me', user());
    expect(me.basePath).toBe(join(STORAGE_DIR, 'orgs', 'facu-a', 'users', '7'));
    expect(me.id).toBe('facu-a/me:7');

    const team = resolveScope('team:catedra', user());
    expect(team.basePath).toBe(join(STORAGE_DIR, 'orgs', 'facu-a', 'teams', 'catedra'));
    expect(team.id).toBe('facu-a/team:catedra');
  });

  it('same team slug in two orgs never shares storage or comments', () => {
    const a = resolveScope('team:catedra', user());
    const b = resolveScope('team:catedra', user({ orgId: 2, orgSlug: 'facu-b' }));
    expect(a.basePath).not.toBe(b.basePath);
    expect(a.id).not.toBe(b.id);
  });

  it('requires auth and membership for private scopes', () => {
    expect(status(() => resolveScope('me', undefined))).toBe(401);
    expect(status(() => resolveScope('team:catedra', undefined))).toBe(401);
    expect(status(() => resolveScope('team:otro', user()))).toBe(403);
    expect(status(() => resolveScope('team:../x', user()))).toBe(400);
  });

  it('public: admins of the org write, its members comment', () => {
    const admin = resolveScope('public', user({ role: 'admin' }));
    expect(admin.basePath).toBe(join(STORAGE_DIR, 'orgs', 'facu-a', 'public'));
    expect(admin).toMatchObject({ id: 'facu-a/public', canWrite: true, canComment: true });
    expect(resolveScope('public', user())).toMatchObject({ canWrite: false, canComment: true });
  });

  it('public of another org is read-only, even for its admins', () => {
    const other = resolveScope('public:facu-b', user({ role: 'admin' }));
    expect(other).toMatchObject({ id: 'facu-b/public', canWrite: false, canComment: false });
    expect(resolveScope('public:facu-b', undefined)).toMatchObject({ canWrite: false, canComment: false });
  });

  it('should refuse private scopes when the account belongs to no org', () => {
    const noOrg = user({ orgId: null, orgSlug: null, orgName: null, role: null, teams: [] });
    expect(status(() => resolveScope('me', noOrg))).toBe(403);
    expect(status(() => resolveScope('public', noOrg))).toBe(403);
    expect(resolveScope('public:facu-a', noOrg)).toMatchObject({ canWrite: false, canComment: false });
  });

  it('public without an org needs a session; bad org slugs are rejected', () => {
    expect(status(() => resolveScope('public', undefined))).toBe(401);
    expect(status(() => resolveScope('public:../../etc', undefined))).toBe(400);
  });
});
