import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './jwt.js';
import { requireAuth, type AuthenticatedRequest } from './middleware.js';
import { config } from '../config.js';
import { ValidationError, ConflictError, UnauthorizedError } from '../errors/index.js';

const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export interface AuthDeps {
  findUserByEmail: (
    email: string,
  ) => Promise<{ id: string; email: string; passwordHash: string } | null>;
  createUser: (
    id: string,
    email: string,
    passwordHash: string,
  ) => Promise<{ id: string; email: string; passwordHash: string }>;
}

export function createAuthRouter(deps: AuthDeps): Router {
  const router = Router();

  router.post('/register', async (req, res, next) => {
    try {
      const result = RegisterSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError(result.error.issues[0]?.message ?? 'Validation failed');
      }
      const { email, password } = result.data;

      const existing = await deps.findUserByEmail(email);
      if (existing) throw new ConflictError('Email already registered');

      const passwordHash = await hashPassword(password);
      const user = await deps.createUser(randomUUID(), email, passwordHash);
      const token = await signToken(
        { sub: user.id, email: user.email },
        config.jwtSecret,
        config.jwtExpiresIn,
      );

      res.status(201).json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const result = LoginSchema.safeParse(req.body);
      if (!result.success) throw new ValidationError('Invalid request body');
      const { email, password } = result.data;

      const user = await deps.findUserByEmail(email);
      if (!user) throw new UnauthorizedError('Invalid credentials');

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) throw new UnauthorizedError('Invalid credentials');

      const token = await signToken(
        { sub: user.id, email: user.email },
        config.jwtSecret,
        config.jwtExpiresIn,
      );

      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth, (req, res) => {
    const { user } = req as AuthenticatedRequest;
    res.json({ user: { id: user.sub, email: user.email } });
  });

  return router;
}
