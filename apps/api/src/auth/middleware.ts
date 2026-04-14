import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from './jwt.js';
import { config } from '../config.js';

export interface AuthenticatedRequest extends Request {
  user: TokenPayload;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, config.jwtSecret);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}
