import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDroneStore } from '../lib/droneStore';
import { useFleetWS } from '../lib/useFleetWS';

// vi.hoisted ensures these run before vi.mock hoisting
const { mockClose, MockFleetWSClient } = vi.hoisted<{
  mockClose: ReturnType<typeof vi.fn>;
  MockFleetWSClient: ReturnType<typeof vi.fn>;
}>(() => {
  const mockClose = vi.fn();
  const MockFleetWSClient = vi.fn().mockImplementation(() => ({ close: mockClose }));
  return { mockClose, MockFleetWSClient };
});

vi.mock('../lib/ws', () => ({
  FleetWSClient: MockFleetWSClient,
}));

describe('useFleetWS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates FleetWSClient with the provided token', () => {
    const { unmount } = renderHook(() => useFleetWS('my-token'));
    expect(MockFleetWSClient).toHaveBeenCalledOnce();
    expect(MockFleetWSClient).toHaveBeenCalledWith(
      'my-token',
      expect.objectContaining({
        onSnapshot: expect.any(Function) as unknown,
        onUpdate: expect.any(Function) as unknown,
      }),
    );
    unmount();
  });

  it('calls close() on unmount', () => {
    const { unmount } = renderHook(() => useFleetWS('tok'));
    unmount();
    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('does nothing when token is null', () => {
    renderHook(() => useFleetWS(null));
    expect(MockFleetWSClient).not.toHaveBeenCalled();
  });

  it('reconnects (new client) when token changes', () => {
    const { rerender, unmount } = renderHook(({ token }: { token: string }) => useFleetWS(token), {
      initialProps: { token: 'tok-a' },
    });
    expect(MockFleetWSClient).toHaveBeenCalledTimes(1);

    rerender({ token: 'tok-b' });

    // old client closed, new client created
    expect(mockClose).toHaveBeenCalledOnce();
    expect(MockFleetWSClient).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('onSnapshot callback calls store.setSnapshot', () => {
    renderHook(() => useFleetWS('tok'));
    const { onSnapshot } = MockFleetWSClient.mock.calls[0]![1] as {
      onSnapshot: (arr: unknown[]) => void;
    };
    const snap = {
      droneId: 'd1',
      ts: 1,
      lat: 0,
      lng: 0,
      altitude_m: 0,
      heading_deg: 0,
      speed_mps: 0,
      battery_pct: 100,
      status: 'active',
    };
    onSnapshot([snap]);
    expect(useDroneStore.getState().drones.get('d1')).toEqual(snap);
  });
});
