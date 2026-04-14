import { EventEmitter } from 'node:events';
import type { TelemetryMessage, StateSnapshot } from '@fleet-tracker/shared';

export class StateManager extends EventEmitter {
  private readonly states = new Map<string, StateSnapshot>();

  update(droneId: string, msg: TelemetryMessage): StateSnapshot {
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
    };

    this.states.set(droneId, snapshot);
    this.emit('state-changed', snapshot);
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
