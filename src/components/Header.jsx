import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function Header() {
  const [time, setTime] = useState(new Date());
  const { auth } = useAuth();

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
      paddingBottom: 16,
      borderBottom: '1px solid #1a1f2e',
    }}>
      <div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 800,
          color: '#eef0f4',
          letterSpacing: '-0.03em',
          lineHeight: 1,
          marginBottom: 4,
        }}>
          <span style={{ color: '#22c55e' }}>.</span>mikrotik<span style={{ color: '#3b82f6' }}>/</span>panel
        </h1>
        <span style={{
          fontSize: 11,
          color: '#636b7e',
          fontFamily: "'JetBrains Mono', monospace",
        }}>MikroTik REST Gateway — {auth?.ip || '192.168.88.1'}</span>
      </div>
      <div style={{
        textAlign: 'right',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        <div style={{
          fontSize: 20,
          fontWeight: 300,
          color: '#eef0f4',
          letterSpacing: '0.05em',
        }}>
          {time.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div style={{
          fontSize: 10,
          color: '#636b7e',
        }}>
          {time.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </header>
  );
}
