import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRouterData } from '../contexts/RouterDataContext';
import { LayoutDashboard, ArrowUpDown, Settings, Shield, Route, Users, Wifi, DatabaseBackup, LogOut, Flame } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/isp', label: 'ISP', icon: ArrowUpDown },
  { path: '/setup', label: 'Setup', icon: Settings },
  { path: '/wireguard', label: 'WireGuard', icon: Shield },
  { path: '/routes', label: 'Routes', icon: Route },
  { path: '/firewall', label: 'Firewall', icon: Flame },
  { path: '/clients', label: 'Clients', icon: Users },
  { path: '/hotspot', label: 'Hotspot', icon: Wifi },
  { path: '/backup', label: 'Backup', icon: DatabaseBackup },
];

export function Sidebar() {
  const { logout } = useAuth();
  const { identity } = useRouterData();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{
      width: 56,
      minHeight: '100vh',
      background: '#0d1017',
      borderRight: '1px solid #1a1f2e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px 0',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 100,
    }}>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: '#12151c',
        border: '1px solid #1a1f2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        fontSize: 14,
        fontWeight: 800,
        color: '#22c55e',
      }}>
        R
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              width: 40,
              height: 40,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
              background: isActive ? '#22c55e15' : 'transparent',
              color: isActive ? '#22c55e' : '#636b7e',
              border: isActive ? '1px solid #22c55e30' : '1px solid transparent',
              transition: 'all 0.2s ease',
            })}
            title={item.label}
          >
            <item.icon size={18} strokeWidth={1.8} />
          </NavLink>
        ))}
      </nav>

      {identity && (
        <div style={{
          fontSize: 8,
          color: '#636b7e',
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
          marginBottom: 8,
          maxWidth: 48,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{identity.name}</div>
      )}

      <button
        onClick={handleLogout}
        title="Logout"
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          color: '#636b7e',
          border: '1px solid transparent',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <LogOut size={18} strokeWidth={1.8} />
      </button>
    </div>
  );
}
