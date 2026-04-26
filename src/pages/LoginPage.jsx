import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [ip, setIp] = useState('192.168.88.1');
  const [protocol, setProtocol] = useState('https');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = btoa(`${username}:${password}`);
      const target = `${protocol}://${ip}`;
      const res = await fetch('/api/system/identity', {
        cache: 'no-store',
        headers: {
          'Authorization': `Basic ${token}`,
          'Content-Type': 'application/json',
          'X-Router-Target': target,
        },
      });
      if (res.status === 401) {
        setError('Invalid credentials');
        setLoading(false);
        return;
      }
      if (res.status === 502) {
        setError(protocol === 'https'
          ? 'Router unreachable on HTTPS. Enable www-ssl on the router or switch to HTTP.'
          : 'Router unreachable. Check IP and that www service is enabled.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(`Connection failed (${res.status})`);
        setLoading(false);
        return;
      }
      login(ip, username, password, protocol);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError('Network error: cannot reach the local proxy');
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 14px',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#eef0f4',
    background: '#0d1017',
    border: '1px solid #1a1f2e',
    borderRadius: 8,
    outline: 'none',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: '#636b7e',
    fontFamily: "'Outfit', sans-serif",
    marginBottom: 6,
    display: 'block',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0c10',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    }}>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(ellipse at 30% 20%, #22c55e06 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, #3b82f606 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: 380,
        background: '#12151c',
        borderRadius: 16,
        border: '1px solid #1a1f2e',
        padding: '40px 32px',
        position: 'relative',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            color: '#eef0f4',
            letterSpacing: '-0.03em',
            lineHeight: 1,
            marginBottom: 8,
          }}>
            <span style={{ color: '#22c55e' }}>.</span>router<span style={{ color: '#3b82f6' }}>/</span>panel
          </h1>
          <span style={{
            fontSize: 11,
            color: '#636b7e',
            fontFamily: "'JetBrains Mono', monospace",
          }}>MikroTik REST Gateway</span>
        </div>

        {error && (
          <div style={{
            background: '#ef444512',
            border: '1px solid #ef444530',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 20,
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#ef4444',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Router IP</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{
                display: 'flex',
                background: '#0d1017',
                border: '1px solid #1a1f2e',
                borderRadius: 8,
                overflow: 'hidden',
                flexShrink: 0,
              }}>
                {['http', 'https'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProtocol(p)}
                    style={{
                      padding: '12px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: protocol === p ? '#22c55e' : '#636b7e',
                      background: protocol === p ? '#22c55e12' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >{p}</button>
                ))}
              </div>
              <input
                type="text"
                value={ip}
                onChange={e => setIp(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>
            {protocol === 'http' && (
              <div style={{
                marginTop: 8,
                padding: '8px 10px',
                background: '#f59e0b10',
                border: '1px solid #f59e0b30',
                borderRadius: 6,
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#f59e0b',
              }}>⚠ HTTP transmits credentials in cleartext. Prefer HTTPS.</div>
            )}
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 0',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              borderRadius: 8,
              cursor: loading ? 'default' : 'pointer',
              background: '#22c55e18',
              color: '#22c55e',
              border: '1px solid #22c55e40',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
