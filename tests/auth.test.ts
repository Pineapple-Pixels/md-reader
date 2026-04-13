import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';

// Test verifyToken logic inline to avoid importing config.ts side effects
const TEST_SECRET = 'test-secret-for-unit-tests';

type AuthPayload = {
  userId: number;
  username: string;
  role: 'admin' | 'member';
};

function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, TEST_SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;
    const { userId, username, role } = decoded as Record<string, unknown>;
    if (typeof userId !== 'number' || typeof username !== 'string') return null;
    if (role !== 'admin' && role !== 'member') return null;
    return { userId, username, role };
  } catch {
    return null;
  }
}

describe('verifyToken', () => {
  it('decodes a valid token', () => {
    const payload: AuthPayload = { userId: 1, username: 'admin', role: 'admin' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken(token);
    expect(result).toMatchObject(payload);
  });

  it('returns null for expired tokens', () => {
    const payload: AuthPayload = { userId: 1, username: 'admin', role: 'admin' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '-1s' });
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for tokens signed with wrong secret', () => {
    const payload: AuthPayload = { userId: 1, username: 'admin', role: 'admin' };
    const token = jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });
    expect(verifyToken(token)).toBeNull();
  });

  it('returns null for invalid token strings', () => {
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });

  it('rejects tokens with invalid role', () => {
    const token = jwt.sign({ userId: 1, username: 'x', role: 'superadmin' }, TEST_SECRET);
    expect(verifyToken(token)).toBeNull();
  });

  it('rejects tokens missing required fields', () => {
    const token = jwt.sign({ username: 'x', role: 'admin' }, TEST_SECRET);
    expect(verifyToken(token)).toBeNull();
  });
});
