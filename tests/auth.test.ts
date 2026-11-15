import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyToken, signSession } from '../src/lib/auth.js';
import { JWT_SECRET } from '../src/lib/config.js';

const account = { id: 1, username: 'ana' };

describe('verifyToken', () => {
  it('should round-trip a session opened in an org', () => {
    expect(verifyToken(signSession(account, 3))).toEqual({ userId: 1, username: 'ana', orgId: 3 });
  });

  it('should round-trip a session of an account without org', () => {
    expect(verifyToken(signSession(account, null))).toEqual({ userId: 1, username: 'ana', orgId: null });
  });

  it('should reject pre-organization tokens without orgId', () => {
    const old = jwt.sign({ userId: 1, username: 'ana', role: 'admin' }, JWT_SECRET);
    expect(verifyToken(old)).toBeNull();
  });

  it('should reject other secrets, bad org ids, expired and garbage tokens', () => {
    const payload = { userId: 1, username: 'ana', orgId: 3 };
    expect(verifyToken(jwt.sign(payload, 'otro-secreto'))).toBeNull();
    expect(verifyToken(jwt.sign({ ...payload, orgId: 'facu-a' }, JWT_SECRET))).toBeNull();
    expect(verifyToken(jwt.sign(payload, JWT_SECRET, { expiresIn: -10 }))).toBeNull();
    expect(verifyToken('not-a-token')).toBeNull();
    expect(verifyToken('')).toBeNull();
  });
});
