import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { FleetWSClient } from '../lib/ws';

const snap: StateSnapshot = {
  droneId: 'd1',
  ts: 1000,
  lat: 50.4,
  lng: 30.5,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
  status: 'active',
};

// Minimal mock that captures event listeners and lets tests emit events
class MockWebSocket {
  static last: MockWebSocket;
  url: string;
  private listeners: Record<string, Array<(e: unknown) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockWebSocket.last = this;
  }

  addEventListener(type: string, fn: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(fn);
  }

  close() {}

  /** Test helper: trigger a listener */
  emit(type: string, event: unknown) {
    this.listeners[type]?.forEach((fn) => fn(event));
  }
}

describe('FleetWSClient', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens WebSocket with token in query string', () => {
    const client = new FleetWSClient('abc123', { onSnapshot: vi.fn(), onUpdate: vi.fn() });
    expect(MockWebSocket.last.url).toContain('token=abc123');
    client.close();
  });

  it('dispatches onSnapshot when snapshot message arrives', () => {
    const onSnapshot = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot, onUpdate: vi.fn() });

    MockWebSocket.last.emit('message', {
      data: JSON.stringify({ type: 'snapshot', payload: [snap] }),
    });

    expect(onSnapshot).toHaveBeenCalledOnce();
    expect(onSnapshot).toHaveBeenCalledWith([snap]);
    client.close();
  });

  it('dispatches onUpdate when update message arrives', () => {
    const onUpdate = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot: vi.fn(), onUpdate });

    MockWebSocket.last.emit('message', {
      data: JSON.stringify({ type: 'update', payload: snap }),
    });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(snap);
    client.close();
  });

  it('does NOT call callbacks after close()', () => {
    const onSnapshot = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot, onUpdate: vi.fn() });
    client.close();

    MockWebSocket.last.emit('message', {
      data: JSON.stringify({ type: 'snapshot', payload: [snap] }),
    });

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON without throwing', () => {
    const onSnapshot = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot, onUpdate: vi.fn() });

    expect(() => {
      MockWebSocket.last.emit('message', { data: '{not-json' });
    }).not.toThrow();

    expect(onSnapshot).not.toHaveBeenCalled();
    client.close();
  });

  it('ignores unknown message types without throwing', () => {
    const onUpdate = vi.fn();
    const client = new FleetWSClient('tok', { onSnapshot: vi.fn(), onUpdate });

    expect(() => {
      MockWebSocket.last.emit('message', {
        data: JSON.stringify({ type: 'error', message: 'oops' }),
      });
    }).not.toThrow();

    expect(onUpdate).not.toHaveBeenCalled();
    client.close();
  });
});
