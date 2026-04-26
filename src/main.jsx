import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProtectedRoute } from './components/ProtectedRoute';
import App from './App';
import LoginPage from './pages/LoginPage';
import IspPage from './pages/IspPage';
import DashboardPage from './pages/DashboardPage';
import SetupPage from './pages/SetupPage';
import WireGuardPage from './pages/WireGuardPage';
import ClientsPage from './pages/ClientsPage';
import HotspotPage from './pages/HotspotPage';
import RoutesPage from './pages/RoutesPage';
import BackupPage from './pages/BackupPage';
import FirewallPage from './pages/FirewallPage';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute><App /></ProtectedRoute>,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'isp', element: <IspPage /> },
      { path: 'setup', element: <SetupPage /> },
      { path: 'wireguard', element: <WireGuardPage /> },
      { path: 'routes', element: <RoutesPage /> },
      { path: 'firewall', element: <FirewallPage /> },
      { path: 'clients', element: <ClientsPage /> },
      { path: 'hotspot', element: <HotspotPage /> },
      { path: 'backup', element: <BackupPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </ErrorBoundary>
);
