import { useNavigate } from 'react-router-dom';
import { DroneList } from '../components/DroneList';
import { Map } from '../components/Map';
import { useAuthStore } from '../lib/auth';
import { useFleetWS } from '../lib/useFleetWS.js';

export function Dashboard() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);

  useFleetWS(token);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <span>Fleet Tracker</span>
        <button onClick={handleLogout}>Logout</button>
      </header>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <aside style={{ width: 240, overflowY: 'auto', borderRight: '1px solid #ccc' }}>
          <DroneList />
        </aside>
        <main style={{ flex: 1 }}>
          <Map />
        </main>
      </div>
    </div>
  );
}
