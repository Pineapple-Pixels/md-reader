import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { login, verifyToken, COOKIE_NAME } from './lib/auth.js';
import apiRouter from './routes/api.js';
import publicApiRouter from './routes/public-api.js';

const app = express();

// Static assets (Vite builds → public/)
app.use(express.static('public', {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
}));

// Helmet con CSP ajustado:
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'data:'],
    },
  },
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Rate limit para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos, intenta mas tarde',
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth API endpoints
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.json({ authenticated: false });
  const decoded = verifyToken(token);
  if (decoded) return res.json({ authenticated: true, user: decoded.user });
  res.json({ authenticated: false });
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { user, pass } = req.body;
  const token = login(user, pass);
  if (!token) return res.status(401).json({ error: 'Usuario o contrasena incorrectos' });
  res.cookie(COOKIE_NAME, token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

// Public API routes (no auth)
app.use('/api/public', publicApiRouter);

// Private API routes (auth required)
app.use('/api', apiRouter);

// SPA fallback: serve index.html for all other routes
const spaHtml = resolve('public', 'index.html');
app.get('/{*path}', (req, res) => {
  if (existsSync(spaHtml)) {
    res.sendFile(spaHtml);
  } else {
    res.status(404).send('Build the client first: npm run build');
  }
});

app.use((err, req, res, next) => {
  console.error('ERROR:', err.message, err.stack);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3500;
app.listen(PORT, () => console.log(`Docs server en http://localhost:${PORT}/`));
