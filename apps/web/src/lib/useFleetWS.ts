import { useEffect } from 'react';
import { FleetWSClient } from './ws.js';
import { useDroneStore } from './droneStore.js';

export function useFleetWS(token: string | null): void {
  const setSnapshot = useDroneStore((s) => s.setSnapshot);
  const updateDrone = useDroneStore((s) => s.updateDrone);

  useEffect(() => {
    if (!token) return;
    const client = new FleetWSClient(token, {
      onSnapshot: setSnapshot,
      onUpdate: updateDrone,
    });
    return () => client.close();
  }, [token, setSnapshot, updateDrone]);
}
