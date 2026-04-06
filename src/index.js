import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { login, COOKIE_NAME, requireAuth } from './lib/auth.js';
import { renderLogin } from './views/login.js';
import pubRouter from './routes/public.js';
import privRouter from './routes/private.js';
import apiRouter from './routes/api.js';

const app = express();

// Static assets (Vite builds → public/)
app.use(express.static('public', {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : 0,
  immutable: process.env.NODE_ENV === 'production',
}));

// Helmet con CSP ajustado al uso real:
// - 'unsafe-inline' en style-src: las vistas usan estilos inline
// - 'unsafe-inline' en script-src: las vistas generan scripts inline (doc.js, editor.js, project.js, etc.)
// - cdnjs.cloudflare.com permitido para highlight.js cargado desde layout/project
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

// Rate limit solo para el login para prevenir brute-force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiados intentos, intenta mas tarde',
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Auth routes
app.get('/login', (req, res) => res.send(renderLogin()));

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { user, pass } = req.body;
  const token = login(user, pass);
  if (!token) return res.send(renderLogin('Usuario o contrasena incorrectos'));
  res.cookie(COOKIE_NAME, token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
  res.redirect('/');
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect('/login');
});

// Public routes (no auth)
app.use('/pub', pubRouter);

// Private routes (auth required)
app.use('/api', apiRouter);
app.use('/', requireAuth, privRouter);

app.use((err, req, res, next) => {
  console.error('ERROR:', err.message, err.stack);
  res.status(500).send('Error: ' + err.message);
});

const PORT = process.env.PORT || 3500;
app.listen(PORT, () => console.log(`Docs server en http://localhost:${PORT}/`));
