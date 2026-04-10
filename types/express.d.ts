// Express Request augmentation.
// `req.user` lo setea el middleware requireAuth/requireTokenOrAuth con
// el payload decodificado del JWT.
import type { JwtPayload } from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload | string;
    }
  }
}

export {};
