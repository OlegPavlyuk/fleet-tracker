import { EventEmitter } from 'node:events';
import type { TelemetryMessage, StateSnapshot } from '@fleet-tracker/shared';
import { stateUpdateDurationMs } from '../metrics/index.js';

interface TelemetryMeta {
  msgId?: string;
  serverRecvTs?: number;
  benchmarkId?: string;
}

export class StateManager extends EventEmitter {
  private readonly states = new Map<string, StateSnapshot>();

  update(droneId: string, msg: TelemetryMessage, meta?: TelemetryMeta): StateSnapshot {
    const t0 = performance.now();

    const snapshot: StateSnapshot = {
      droneId,
      ts: msg.ts,
      lat: msg.lat,
      lng: msg.lng,
      altitude_m: msg.altitude_m,
      heading_deg: msg.heading_deg,
      speed_mps: msg.speed_mps,
      battery_pct: msg.battery_pct,
      status: msg.battery_pct > 20 ? 'active' : 'idle',
      msg_id: meta?.msgId,
      server_recv_ts: meta?.serverRecvTs,
      benchmark_id: meta?.benchmarkId,
    };

    this.states.set(droneId, snapshot);
    this.emit('state-changed', snapshot);

    stateUpdateDurationMs.observe(performance.now() - t0);
    return snapshot;
  }

  get(droneId: string): StateSnapshot | undefined {
    return this.states.get(droneId);
  }

  getAll(): StateSnapshot[] {
    return [...this.states.values()];
  }

  get size(): number {
    return this.states.size;
  }
}
