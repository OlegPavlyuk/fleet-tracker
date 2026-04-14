import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorMiddleware } from '../../errors/middleware.js';
import { createAuthRouter } from '../routes.js';
import type { AuthDeps } from '../routes.js';

interface AuthBody {
  token: string;
  user: { id: string; email: string };
}

// Minimal in-memory user store to test routes without a real DB
function makeDeps(): AuthDeps {
  const store = new Map<string, { id: string; email: string; passwordHash: string }>();
  return {
    findUserByEmail: vi.fn((email: string) => Promise.resolve(store.get(email) ?? null)),
    createUser: vi.fn((id: string, email: string, passwordHash: string) => {
      const user = { id, email, passwordHash };
      store.set(email, user);
      return Promise.resolve(user);
    }),
  };
}

function buildApp(deps: AuthDeps) {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(deps));
  app.use(errorMiddleware);
  return app;
}

describe('POST /auth/register', () => {
  let deps: AuthDeps;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    deps = makeDeps();
    app = buildApp(deps);
  });

  it('returns 201 with token on valid registration', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'user@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    const body = res.body as AuthBody;
    expect(typeof body.token).toBe('string');
    expect(body.user).toMatchObject({ email: 'user@example.com' });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 409 when email is already registered', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'password123' });

    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'a@b.com', password: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('POST /auth/login', () => {
  let deps: AuthDeps;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    deps = makeDeps();
    app = buildApp(deps);
    // Pre-register a user
    await request(app)
      .post('/auth/register')
      .send({ email: 'login@example.com', password: 'password123' });
  });

  it('returns 200 with token on valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('returns 401 when password is wrong', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpassword' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when user does not exist', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  let deps: AuthDeps;
  let app: ReturnType<typeof buildApp>;
  let token: string;

  beforeEach(async () => {
    deps = makeDeps();
    app = buildApp(deps);
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'me@example.com', password: 'password123' });
    token = (res.body as AuthBody).token;
  });

  it('returns 200 with user info when authenticated', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect((res.body as AuthBody).user).toMatchObject({ email: 'me@example.com' });
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });
});
