import { useParams } from 'react-router-dom';

export function History() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1>Drone History</h1>
      <p>Drone: {id}</p>
      <p>History view — coming in Step 15</p>
    </div>
  );
}
