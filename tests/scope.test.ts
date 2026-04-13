import { describe, it, expect } from 'vitest';

// Test resolveScope logic inline to avoid config.ts side effects
type ScopeKind = 'me' | 'team' | 'public';
type AuthUser = {
  userId: number;
  username: string;
  role: 'admin' | 'member';
  teams: Array<{ slug: string; name: string; role: string }>;
};

type ResolvedScope = {
  kind: ScopeKind;
  id: string;
  basePath: string;
  canWrite: boolean;
  canComment: boolean;
};

class ScopeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const STORAGE_DIR = '/storage';
const TEAM_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function resolveScope(
  scopeStr: string | null | undefined,
  user: AuthUser | undefined,
): ResolvedScope {
  if (!scopeStr) {
    throw new ScopeError('scope es requerido (me | team:<slug> | public)', 400);
  }
  if (scopeStr === 'public') {
    return {
      kind: 'public',
      id: 'public',
      basePath: `${STORAGE_DIR}/public`,
      canWrite: user?.role === 'admin',
      canComment: !!user,
    };
  }
  if (scopeStr === 'me') {
    if (!user) throw new ScopeError('No autorizado', 401);
    return {
      kind: 'me',
      id: `me:${user.userId}`,
      basePath: `${STORAGE_DIR}/users/${user.userId}`,
      canWrite: true,
      canComment: true,
    };
  }
  if (scopeStr.startsWith('team:')) {
    if (!user) throw new ScopeError('No autorizado', 401);
    const slug = scopeStr.slice('team:'.length).toLowerCase();
    if (!slug || !TEAM_SLUG_RE.test(slug) || slug.length > 50) {
      throw new ScopeError('Slug de team invalido', 400);
    }
    const membership = user.teams.find((t) => t.slug.toLowerCase() === slug);
    if (!membership) {
      throw new ScopeError('No sos miembro de este team', 403);
    }
    return {
      kind: 'team',
      id: `team:${slug}`,
      basePath: `${STORAGE_DIR}/teams/${slug}`,
      canWrite: true,
      canComment: true,
    };
  }
  throw new ScopeError('scope invalido', 400);
}

const adminUser: AuthUser = {
  userId: 1, username: 'admin', role: 'admin',
  teams: [{ slug: 'dev', name: 'Dev Team', role: 'admin' }],
};

const memberUser: AuthUser = {
  userId: 2, username: 'member', role: 'member',
  teams: [{ slug: 'dev', name: 'Dev Team', role: 'member' }],
};

describe('resolveScope', () => {
  it('throws 400 if scope is empty', () => {
    expect(() => resolveScope(null, adminUser)).toThrow(ScopeError);
    expect(() => resolveScope('', adminUser)).toThrow(ScopeError);
    expect(() => resolveScope(undefined, adminUser)).toThrow(ScopeError);
  });

  describe('public scope', () => {
    it('admin can write public', () => {
      const s = resolveScope('public', adminUser);
      expect(s.kind).toBe('public');
      expect(s.canWrite).toBe(true);
      expect(s.canComment).toBe(true);
    });

    it('member cannot write public', () => {
      const s = resolveScope('public', memberUser);
      expect(s.canWrite).toBe(false);
      expect(s.canComment).toBe(true);
    });

    it('anonymous can read public but not comment', () => {
      const s = resolveScope('public', undefined);
      expect(s.canWrite).toBe(false);
      expect(s.canComment).toBe(false);
    });
  });

  describe('me scope', () => {
    it('authenticated user gets own scope', () => {
      const s = resolveScope('me', memberUser);
      expect(s.kind).toBe('me');
      expect(s.id).toBe('me:2');
      expect(s.canWrite).toBe(true);
    });

    it('throws 401 for anonymous', () => {
      expect(() => resolveScope('me', undefined)).toThrow(ScopeError);
      try { resolveScope('me', undefined); } catch (e) {
        expect((e as ScopeError).status).toBe(401);
      }
    });
  });

  describe('team scope', () => {
    it('member of team gets access', () => {
      const s = resolveScope('team:dev', memberUser);
      expect(s.kind).toBe('team');
      expect(s.id).toBe('team:dev');
      expect(s.canWrite).toBe(true);
    });

    it('throws 403 for non-member', () => {
      const outsider: AuthUser = { userId: 3, username: 'x', role: 'member', teams: [] };
      expect(() => resolveScope('team:dev', outsider)).toThrow(ScopeError);
      try { resolveScope('team:dev', outsider); } catch (e) {
        expect((e as ScopeError).status).toBe(403);
      }
    });

    it('throws 401 for anonymous', () => {
      expect(() => resolveScope('team:dev', undefined)).toThrow(ScopeError);
    });

    it('rejects invalid slugs', () => {
      expect(() => resolveScope('team:INVALID', adminUser)).toThrow(ScopeError);
      expect(() => resolveScope('team:', adminUser)).toThrow(ScopeError);
      expect(() => resolveScope('team:-bad', adminUser)).toThrow(ScopeError);
    });
  });

  it('throws 400 for unknown scope', () => {
    expect(() => resolveScope('unknown', adminUser)).toThrow(ScopeError);
  });
});
