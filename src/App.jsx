import { Outlet } from 'react-router-dom';
import { RouterDataProvider } from './contexts/RouterDataContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

export default function App() {
  return (
    <RouterDataProvider>
      <div style={{
        minHeight: '100vh',
        background: '#0a0c10',
        position: 'relative',
      }}>
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(ellipse at 20% 0%, #22c55e05 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, #3b82f605 0%, transparent 60%)',
          pointerEvents: 'none',
        }} />

        <Sidebar />

        <main style={{
          marginLeft: 56,
          padding: '24px 28px 60px',
          maxWidth: 1200,
          position: 'relative',
        }}>
          <Header />
          <Outlet />
        </main>
      </div>
    </RouterDataProvider>
  );
}
