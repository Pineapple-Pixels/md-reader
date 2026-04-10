// Express Request augmentation.
// `req.user` lo setea el middleware requireAuth/requireTokenOrAuth con
// el payload JWT hidratado con teams desde la DB.
import type { AuthUser } from '../src/lib/auth.ts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
