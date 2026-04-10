// Express Request augmentation.
// `req.user` lo setea el middleware requireAuth/requireTokenOrAuth con
// el payload decodificado del JWT.
import type { AuthPayload } from '../src/lib/auth.ts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export {};
