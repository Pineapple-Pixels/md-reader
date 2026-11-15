import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { login, verifyToken, COOKIE_NAME, requireAuth, invalidateHydrateCache, signSession, signDefaultSession, setSessionCookie, clearSessionCookie, hydrateUser } from './lib/auth.js';
import { GOOGLE_ENABLED, FLOW_COOKIE, FLOW_TTL_MS, startGoogleFlow, readFlowCookie, finishGoogleFlow } from './lib/google.js';
import { migrateLegacyStorage } from './lib/storage.js';
import { DEFAULT_ORG_SLUG, listUserOrgs, setLastOrg } from './lib/orgs.js';
import { findByUsername, findById, updatePassword, verifyPassword, findOrProvisionGoogleUser } from './lib/users.js';
import { sql } from './lib/db.js';
import { seedAdminIfEmpty } from './lib/seed.js';
import { runMigrations } from './lib/migrate.js';
import { logger } from './lib/logger.js';
import { staticAssets } from './lib/static.js';
import apiRouter from './routes/api.js';
import publicApiRouter from './routes/public-api.js';
import adminApiRouter from './routes/admin-api.js';
import meApiRouter from './routes/me-api.js';

const app = express();

// Helmet con CSP ajustado.
// scriptSrc: no 'unsafe-inline' — el unico inline script (tema) va por hash.
// styleSrc: mantiene 'unsafe-inline' porque los componentes React usan
// `style={{}}` (inline styles) por todos lados; cambiarlo requiere un refactor.
// Hash sha256 del bloque <script>if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')</script>
// en client/index.html. Si ese bloque se toca, recalcular con:
//   node -e "console.log('sha256-'+require('crypto').createHash('sha256').update(\"<contenido>\").digest('base64'))"
// IMPORTANTE: helmet va ANTES que express.static para que los HTML estaticos tambien reciban CSP.
const THEME_SCRIPT_HASH = "'sha256-Ssp7JpZZ2d4wEELFIcdAEYZvuODuv2Pst+q1f5AUtBw='";
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com'],
      scriptSrc: ["'self'", THEME_SCRIPT_HASH, 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://fonts.gstatic.com', 'data:'],
    },
  },
}));

// Static assets (Vite builds → public/)
app.use(staticAssets('public', process.env['NODE_ENV'] === 'production'));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos, intenta mas tarde',
});

const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados comentarios, intenta mas tarde',
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas escrituras, intenta mas tarde',
});

const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas solicitudes, intenta mas tarde',
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth API endpoints
app.get('/api/auth/me', (req, res, next) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const token = cookies?.[COOKIE_NAME];
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) {
    res.json({ authenticated: false, google: GOOGLE_ENABLED });
    return;
  }
  Promise.all([hydrateUser(decoded), findById(decoded.userId), listUserOrgs(decoded.userId)])
    .then(([me, user, orgs]) => {
      if (!me || !user) {
        res.json({ authenticated: false, google: GOOGLE_ENABLED });
        return;
      }
      res.json({
        authenticated: true,
        user: me.username,
        role: me.role,
        displayName: user.displayName,
        org: me.orgSlug ? { slug: me.orgSlug, name: me.orgName ?? me.orgSlug, role: me.role } : null,
        orgs: orgs.map((o) => ({ slug: o.slug, name: o.name, role: o.role })),
        teams: me.teams,
      });
    })
    .catch(next);
});

// Moves the session to another organization the user belongs to.
app.post('/api/auth/switch-org', requireAuth, (req, res, next) => {
  const parsed = z.object({ slug: z.string().min(1).max(50) }).strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'slug es requerido' });
    return;
  }
  const me = req.user!;
  listUserOrgs(me.userId)
    .then(async (orgs) => {
      const target = orgs.find((o) => o.slug === parsed.data.slug.toLowerCase());
      if (!target) {
        res.status(404).json({ error: 'No perteneces a esa organizacion' });
        return;
      }
      await setLastOrg(me.userId, target.orgId);
      setSessionCookie(res, signSession({ id: me.userId, username: me.username }, target.orgId));
      res.json({ ok: true });
    })
    .catch(next);
});

const LoginBody = z.object({
  user: z.string().min(1),
  pass: z.string().min(1),
});

app.post('/api/auth/login', loginLimiter, (req, res, next) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'user y pass son requeridos' });
    return;
  }
  const { user, pass } = parsed.data;
  login(user, pass)
    .then((token) => {
      if (!token) {
        logger.warn('auth', `login failed: ${user}`);
        res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
        return;
      }
      setSessionCookie(res, token);
      res.json({ ok: true });
    })
    .catch(next);
});

const flowCookieOpts = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth/google',
};

// Its own budget: a whole class signing in at once must not lock out password logins or each other.
const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.redirect('/login?error=google_rate'),
});

app.get('/api/auth/google', googleLimiter, (_req, res) => {
  if (!GOOGLE_ENABLED) {
    res.redirect('/login?error=google_off');
    return;
  }
  const { url, flowCookie } = startGoogleFlow();
  res.cookie(FLOW_COOKIE, flowCookie, { ...flowCookieOpts, maxAge: FLOW_TTL_MS });
  res.redirect(url);
});

app.get('/api/auth/google/callback', googleLimiter, (req, res) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const flow = readFlowCookie(cookies?.[FLOW_COOKIE]);
  res.clearCookie(FLOW_COOKIE, flowCookieOpts);
  const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
  if (!GOOGLE_ENABLED || !flow || !code || req.query['state'] !== flow.state) {
    res.redirect('/login?error=google');
    return;
  }
  (async () => {
    const identity = await finishGoogleFlow(code, flow);
    if (!identity) {
      res.redirect('/login?error=google');
      return;
    }
    const user = await findOrProvisionGoogleUser(identity);
    setSessionCookie(res, await signDefaultSession(user));
    res.redirect('/me');
  })().catch((err: unknown) => {
    logger.error('auth', 'google callback fallo', { err: String(err) });
    if (!res.headersSent) res.redirect('/login?error=google');
  });
});

// Self-service: cualquier user logueado puede cambiar su propio displayName
// y password. Para cambiar password se exige la actual (defensa contra
// session-hijack local). No permite cambiar username/role (eso es admin-only).
const UpdateMeBody = z.object({
  displayName: z.string().trim().max(100).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(4).max(200).optional(),
}).refine(
  (data) => (data.newPassword !== undefined) === (data.currentPassword !== undefined),
  { message: 'currentPassword y newPassword deben enviarse juntos' },
);

app.patch('/api/auth/me', requireAuth, (req, res, next) => {
  (async () => {
    const parsed = UpdateMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Body invalido' });
      return;
    }
    const { displayName, currentPassword, newPassword } = parsed.data;
    if (displayName === undefined && !newPassword) {
      res.status(400).json({ error: 'Nada para actualizar' });
      return;
    }
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }
    if (newPassword) {
      const full = await findByUsername(authUser.username);
      if (!full) {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }
      if (!full.passwordHash) {
        res.status(400).json({ error: 'Tu cuenta entra con Google y no tiene contrasena' });
        return;
      }
      const ok = await verifyPassword(currentPassword!, full.passwordHash);
      if (!ok) {
        res.status(401).json({ error: 'Password actual incorrecta' });
        return;
      }
      await updatePassword(authUser.username, newPassword);
    }
    if (displayName !== undefined) {
      await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${authUser.userId}`;
    }
    invalidateHydrateCache(authUser.userId);
    res.json({ ok: true });
  })().catch(next);
});

app.post('/api/auth/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// Rate limit comment creation (applies before routers)
app.post('/api/comments', commentLimiter);

// Rate limit file write operations
app.post('/api/push', writeLimiter);
app.post('/api/save', writeLimiter);
app.delete('/api/delete', writeLimiter);

// Public API routes (no auth, rate limited)
app.use('/api/public/:org', publicApiLimiter, publicApiRouter);

// The signed-in user's own settings (themes)
app.use('/api/me', meApiRouter);

// Admin API routes (auth + admin role)
app.use('/api/admin', adminApiRouter);

// Private API routes (auth required)
app.use('/api', apiRouter);

// SPA fallback: serve index.html for all other routes
const spaHtml = resolve('public', 'index.html');
app.get('/{*path}', (_req, res) => {
  if (existsSync(spaHtml)) {
    res.sendFile(spaHtml, { headers: { 'Cache-Control': 'no-cache' } });
  } else {
    res.status(404).send('Build the client first: npm run build');
  }
});

// Error handler — Express distingue error handlers por la aridad (4 args),
// asi que `_next` debe existir aunque no lo usemos.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('http', message, { stack });
  const clientMsg = process.env['NODE_ENV'] === 'production' ? 'Error interno del servidor' : message;
  res.status(500).json({ error: clientMsg });
});

const PORT = Number(process.env['PORT']) || 3500;

// Migraciones → seed admin → arrancar server.
runMigrations()
  .catch((err) => {
    logger.error('migrate', 'error durante migraciones', { err: String(err) });
  })
  .then(async () => {
    const moved = await migrateLegacyStorage(DEFAULT_ORG_SLUG);
    if (moved.length) logger.info('storage', `movido a orgs/${DEFAULT_ORG_SLUG}: ${moved.join(', ')}`);
  })
  .then(() => seedAdminIfEmpty())
  .catch((err) => {
    logger.error('seed', 'error durante el seed inicial', { err: String(err) });
  })
  .finally(() => {
    app.listen(PORT, () => logger.info('server', `Docs server en http://localhost:${PORT}/`));
  });
