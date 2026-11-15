import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { checkGoogleClaims, readFlowCookie } from '../src/lib/google.js';
import { JWT_SECRET } from '../src/lib/config.js';

const NOW = 1_800_000_000_000;
const expected = { clientId: 'client-123', nonce: 'n-1', nowMs: NOW };
const good = {
  iss: 'https://accounts.google.com',
  aud: 'client-123',
  exp: NOW / 1000 + 300,
  nonce: 'n-1',
  email_verified: true,
  sub: '1099',
  email: 'ana@facu.edu.ar',
  name: 'Ana',
};

describe('checkGoogleClaims', () => {
  it('accepts a valid id_token payload', () => {
    expect(checkGoogleClaims(good, expected)).toEqual({ sub: '1099', email: 'ana@facu.edu.ar', name: 'Ana', hd: null });
  });

  it('should report the Workspace domain when the hd claim is present', () => {
    expect(checkGoogleClaims({ ...good, hd: 'Facu.edu.ar' }, expected)?.hd).toBe('facu.edu.ar');
  });

  it.each([
    ['issuer', { iss: 'https://evil.example' }],
    ['audience', { aud: 'other-client' }],
    ['expiry', { exp: NOW / 1000 - 1 }],
    ['nonce', { nonce: 'replayed' }],
    ['unverified email', { email_verified: false }],
    ['missing sub', { sub: '' }],
    ['malformed email', { email: 'nope' }],
  ])('rejects a bad %s', (_label, override) => {
    expect(checkGoogleClaims({ ...good, ...override }, expected)).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(checkGoogleClaims(null, expected)).toBeNull();
    expect(checkGoogleClaims('x', expected)).toBeNull();
  });
});

describe('readFlowCookie', () => {
  const flow = { state: 's', nonce: 'n', verifier: 'v' };

  it('reads a cookie signed by the server', () => {
    expect(readFlowCookie(jwt.sign(flow, JWT_SECRET))).toEqual(flow);
  });

  it('rejects forged, expired or missing cookies', () => {
    expect(readFlowCookie(jwt.sign(flow, 'forged'))).toBeNull();
    expect(readFlowCookie(jwt.sign(flow, JWT_SECRET, { expiresIn: -1 }))).toBeNull();
    expect(readFlowCookie(undefined)).toBeNull();
  });
});
