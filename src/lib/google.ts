import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL, JWT_SECRET } from './config.js';

// Google sign-in via the OpenID Connect authorization-code flow with PKCE.

export const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && PUBLIC_URL);
export const FLOW_COOKIE = 'google_flow';
export const FLOW_TTL_MS = 10 * 60 * 1000;

const REDIRECT_URI = `${PUBLIC_URL}/api/auth/google/callback`;
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

type Flow = { state: string; nonce: string; verifier: string };

const b64url = (buf: Buffer): string => buf.toString('base64url');

/** Builds the Google consent URL and the signed cookie value that must come back with the callback. */
export function startGoogleFlow(): { url: string; flowCookie: string } {
  const flow: Flow = {
    state: b64url(randomBytes(24)),
    nonce: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
  };
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: b64url(createHash('sha256').update(flow.verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    flowCookie: jwt.sign(flow, JWT_SECRET, { expiresIn: Math.floor(FLOW_TTL_MS / 1000) }),
  };
}

export function readFlowCookie(value: string | undefined): Flow | null {
  if (!value) return null;
  try {
    const f = jwt.verify(value, JWT_SECRET) as Record<string, unknown>;
    if (typeof f['state'] !== 'string' || typeof f['nonce'] !== 'string' || typeof f['verifier'] !== 'string') return null;
    return { state: f['state'], nonce: f['nonce'], verifier: f['verifier'] };
  } catch {
    return null;
  }
}

/** `hd` is the Google Workspace domain; absent for personal accounts, even with a school email. */
export type GoogleIdentity = { sub: string; email: string; name: string | null; hd: string | null };

/** Validates id_token claims; returns null on any mismatch. */
export function checkGoogleClaims(
  claims: unknown,
  expected: { clientId: string; nonce: string; nowMs: number },
): GoogleIdentity | null {
  if (typeof claims !== 'object' || claims === null) return null;
  const c = claims as Record<string, unknown>;
  if (typeof c['iss'] !== 'string' || !ISSUERS.includes(c['iss'])) return null;
  const aud = c['aud'];
  if (!(aud === expected.clientId || (Array.isArray(aud) && aud.includes(expected.clientId)))) return null;
  if (typeof c['exp'] !== 'number' || c['exp'] * 1000 <= expected.nowMs) return null;
  if (c['nonce'] !== expected.nonce) return null;
  if (c['email_verified'] !== true && c['email_verified'] !== 'true') return null;
  if (typeof c['sub'] !== 'string' || !c['sub']) return null;
  if (typeof c['email'] !== 'string' || !c['email'].includes('@')) return null;
  return {
    sub: c['sub'],
    email: c['email'],
    name: typeof c['name'] === 'string' ? c['name'] : null,
    hd: typeof c['hd'] === 'string' ? c['hd'].toLowerCase() : null,
  };
}

/**
 * Exchanges the authorization code and returns the verified identity.
 * The id_token comes straight from Google's token endpoint over TLS, so its claims are
 * trusted without a signature check (OpenID Connect Core 3.1.3.7).
 */
export async function finishGoogleFlow(code: string, flow: Flow): Promise<GoogleIdentity | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: flow.verifier,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id_token?: unknown };
  if (typeof body.id_token !== 'string') return null;
  return checkGoogleClaims(jwt.decode(body.id_token), {
    clientId: GOOGLE_CLIENT_ID,
    nonce: flow.nonce,
    nowMs: Date.now(),
  });
}
