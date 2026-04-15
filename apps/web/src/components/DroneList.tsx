import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { DroneResponse } from '../lib/api.js';
import { api } from '../lib/api.js';
import { useDroneStore } from '../lib/droneStore.js';

export function DroneList() {
  const drones = useDroneStore((s) => s.drones);
  const selectedId = useDroneStore((s) => s.selectedId);
  const selectDrone = useDroneStore((s) => s.selectDrone);

  const { data: droneList = [] } = useQuery<DroneResponse[]>({
    queryKey: ['drones'],
    queryFn: api.drones.list,
    staleTime: 10 * 60 * 1000, // 10 min — names rarely change
  });

  const nameMap = useMemo(
    () => new Map<string, string>(droneList.map((d) => [d.id, d.name])),
    [droneList],
  );

  const sorted = useMemo(
    () =>
      [...drones.values()].sort((a, b) =>
        (nameMap.get(a.droneId) ?? a.droneId).localeCompare(nameMap.get(b.droneId) ?? b.droneId),
      ),
    [drones, nameMap],
  );

  if (sorted.length === 0) {
    return (
      <div style={{ padding: '1rem', color: '#888', fontSize: '0.875rem' }}>No drones online</div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {sorted.map((drone) => {
        const isSelected = drone.droneId === selectedId;
        const statusColor =
          drone.status === 'active' ? '#4ade80' : drone.status === 'idle' ? '#facc15' : '#94a3b8';
        return (
          <li
            key={drone.droneId}
            onClick={() => selectDrone(drone.droneId)}
            style={{
              padding: '0.5rem 0.75rem',
              cursor: 'pointer',
              backgroundColor: isSelected ? '#e2e8f0' : 'transparent',
              borderLeft: `3px solid ${statusColor}`,
              marginBottom: 2,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {nameMap.get(drone.droneId) ?? drone.droneId}
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#666',
                display: 'flex',
                gap: '0.5rem',
              }}
            >
              <span style={{ color: statusColor }}>● {drone.status}</span>
              <span>{drone.battery_pct.toFixed(0)}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
