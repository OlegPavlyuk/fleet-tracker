import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { signToken, verifyToken } from './jwt.js';

const SECRET = 'test-secret-that-is-at-least-32-chars-long';

describe('signToken', () => {
  it('returns a JWT string with three dot-separated parts', async () => {
    const token = await signToken({ sub: 'user-1', email: 'a@b.com' }, SECRET, '15m');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });
});

describe('verifyToken', () => {
  it('returns payload matching what was signed', async () => {
    const token = await signToken({ sub: 'user-42', email: 'test@example.com' }, SECRET, '1h');
    const payload = await verifyToken(token, SECRET);
    expect(payload.sub).toBe('user-42');
    expect(payload.email).toBe('test@example.com');
  });

  it('throws when token is signed with a different secret', async () => {
    const token = await signToken({ sub: 'x', email: 'x@x.com' }, SECRET, '1h');
    await expect(verifyToken(token, 'wrong-secret-with-min-32-chars-padding')).rejects.toThrow();
  });

  it('throws when token is expired', async () => {
    // Build token with exp already in the past, bypassing signToken's string format
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ email: 'x@x.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('x')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    await expect(verifyToken(token, SECRET)).rejects.toThrow();
  });
});
