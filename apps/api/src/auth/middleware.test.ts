import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireAuth } from './middleware.js';
import { signToken } from './jwt.js';

const SECRET = 'test-secret-that-is-at-least-32-chars-long';

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

function makeRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe('requireAuth middleware', () => {
  it('calls next() and attaches user when token is valid', async () => {
    const token = await signToken({ sub: 'user-1', email: 'a@b.com' }, SECRET, '1h');
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as Request & { user: unknown }).user).toMatchObject({
      sub: 'user-1',
      email: 'a@b.com',
    });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is invalid', async () => {
    const req = makeReq('Bearer not.a.jwt');
    const res = makeRes();
    const next = vi.fn();

    await requireAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
