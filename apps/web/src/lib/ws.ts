import type { ServerMessage, StateSnapshot } from '@fleet-tracker/shared';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const WS_BASE = apiUrl.replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws'));

interface FleetWSCallbacks {
  onSnapshot: (arr: StateSnapshot[]) => void;
  onUpdate: (snap: StateSnapshot) => void;
  onError?: (e: Event) => void;
}

export class FleetWSClient {
  private socket: WebSocket;
  private isClosed = false;

  constructor(token: string, callbacks: FleetWSCallbacks) {
    this.socket = new WebSocket(`${WS_BASE}/ws/stream?token=${encodeURIComponent(token)}`);

    this.socket.addEventListener('message', (e: MessageEvent) => {
      if (this.isClosed) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        console.warn('[FleetWSClient] failed to parse message', e.data);
        return;
      }
      if (msg.type === 'snapshot') callbacks.onSnapshot(msg.payload);
      else if (msg.type === 'update') callbacks.onUpdate(msg.payload);
    });

    this.socket.addEventListener('error', (e: Event) => {
      if (this.isClosed) return;
      console.warn('[FleetWSClient] socket error', e);
      callbacks.onError?.(e);
    });

    this.socket.addEventListener('close', () => {
      if (this.isClosed) return;
      console.warn('[FleetWSClient] socket closed unexpectedly');
    });
  }

  close(): void {
    this.isClosed = true;
    this.socket.close();
  }
}
