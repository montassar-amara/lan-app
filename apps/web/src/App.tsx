import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Protected } from './components/Protected';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <Protected><Dashboard /></Protected> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return <RouterProvider router={router} />;
}
