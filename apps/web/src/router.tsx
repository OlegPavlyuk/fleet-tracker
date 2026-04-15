import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/drones/:id/history', element: <History /> },
    ],
  },
]);
