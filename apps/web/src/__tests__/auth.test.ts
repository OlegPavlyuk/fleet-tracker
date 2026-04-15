import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '../lib/auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, user: null });
    localStorage.clear();
  });

  it('starts with no token and no user', () => {
    const { token, user } = useAuthStore.getState();
    expect(token).toBeNull();
    expect(user).toBeNull();
  });

  it('login sets token and user', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    expect(useAuthStore.getState().token).toBe('tok1');
    expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('logout clears token and user', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('login persists to localStorage under fleet-auth key', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    const raw = localStorage.getItem('fleet-auth');
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!) as { state: { token: string } };
    expect(stored.state.token).toBe('tok1');
  });

  it('logout sets token to null in localStorage', () => {
    useAuthStore.getState().login('tok1', { id: 'u1', email: 'a@b.com' });
    useAuthStore.getState().logout();
    const raw = localStorage.getItem('fleet-auth') ?? '{}';
    const stored = JSON.parse(raw) as { state?: { token?: unknown } };
    expect(stored.state?.token).toBeNull();
  });

  it('rehydrates token from pre-seeded localStorage', async () => {
    localStorage.setItem(
      'fleet-auth',
      JSON.stringify({
        state: { token: 'restored', user: { id: 'u2', email: 'x@y.com' } },
        version: 0,
      }),
    );
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().token).toBe('restored');
    expect(useAuthStore.getState().user).toEqual({ id: 'u2', email: 'x@y.com' });
  });
});
