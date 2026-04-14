import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  function setValidEnv() {
    process.env['DATABASE_URL'] = 'postgres://postgres:password@localhost:5432/fleet_tracker';
    process.env['JWT_SECRET'] = 'a-sufficiently-long-secret-value-32chars';
    process.env['JWT_EXPIRES_IN'] = '15m';
    process.env['PORT'] = '3000';
    process.env['NODE_ENV'] = 'test';
  }

  it('throws on missing DATABASE_URL', async () => {
    setValidEnv();
    delete process.env['DATABASE_URL'];
    await expect(import('./config.js')).rejects.toThrow();
  });

  it('throws on missing JWT_SECRET', async () => {
    setValidEnv();
    delete process.env['JWT_SECRET'];
    await expect(import('./config.js')).rejects.toThrow();
  });

  it('throws when JWT_SECRET is shorter than 32 chars', async () => {
    setValidEnv();
    process.env['JWT_SECRET'] = 'short';
    await expect(import('./config.js')).rejects.toThrow();
  });

  it('returns valid config when all vars present', async () => {
    setValidEnv();
    const { config } = await import('./config.js');
    expect(config.databaseUrl).toBe('postgres://postgres:password@localhost:5432/fleet_tracker');
    expect(config.jwtSecret).toBe('a-sufficiently-long-secret-value-32chars');
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('test');
  });

  it('defaults PORT to 3000', async () => {
    setValidEnv();
    delete process.env['PORT'];
    const { config } = await import('./config.js');
    expect(config.port).toBe(3000);
  });

  it('defaults NODE_ENV to development', async () => {
    setValidEnv();
    delete process.env['NODE_ENV'];
    const { config } = await import('./config.js');
    expect(config.nodeEnv).toBe('development');
  });
});
