import { useState, useRef, useEffect } from 'react';
import { StatusDot } from './StatusDot';
import { DataRow } from './DataRow';
import { api } from '../api';

export function ProviderCard({ data, route, iface, providerKey, isActive, accentColor, loading, onSwitch, mode, pccPercent }) {
  const providerName = data?.comment?.replace(/WAN\d?\s*/i, '').replace(/\(.*\)/, '').trim() || providerKey;
  const isPCC = mode === 'pcc';
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const saveName = async () => {
    const newName = editValue.trim();
    setEditing(false);
    if (!newName || newName === providerName || !data?.['.id']) return;
    try {
      await api('PATCH', `/ip/dhcp-client/${data['.id']}`, { comment: newName });
    } catch (e) { console.error('Provider rename:', e); }
  };

  return (
    <div style={{
      flex: 1,
      background: '#12151c',
      borderRadius: 12,
      border: `1px solid ${isActive ? accentColor + '40' : '#1a1f2e'}`,
      overflow: 'hidden',
      position: 'relative',
      transition: 'border-color 0.3s ease',
    }}>
      {isActive && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        }} />
      )}

      <div style={{ padding: isPCC ? '14px 16px 0' : '20px 20px 0' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: isPCC ? 2 : 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isPCC ? 8 : 10, flex: 1, minWidth: 0 }}>
            <StatusDot active={isActive} />
            {editing ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditing(false); }}
                style={{
                  fontSize: isPCC ? 15 : 18,
                  fontWeight: 700,
                  color: '#eef0f4',
                  letterSpacing: '-0.02em',
                  background: '#0d1017',
                  border: `1px solid ${accentColor}40`,
                  borderRadius: 4,
                  padding: '2px 6px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  flex: 1,
                  minWidth: 0,
                }}
              />
            ) : (
              <span
                onClick={() => { setEditValue(providerName); setEditing(true); }}
                style={{
                  fontSize: isPCC ? 15 : 18,
                  fontWeight: 700,
                  color: '#eef0f4',
                  letterSpacing: '-0.02em',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title="Click to rename"
              >{providerName}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {isPCC && (
              <span style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: accentColor,
                background: accentColor + '15',
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${accentColor}30`,
              }}>{pccPercent}%</span>
            )}
            <span style={{
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#636b7e',
              background: '#0d1017',
              padding: '3px 8px',
              borderRadius: 4,
              border: '1px solid #1a1f2e',
            }}>{iface}</span>
          </div>
        </div>

        <div style={{
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color: isActive ? accentColor : '#636b7e',
          fontWeight: 500,
          marginBottom: isPCC ? 8 : 14,
          paddingLeft: 18,
        }}>
          {isPCC ? 'PCC ACTIVE' : data?.status === 'bound' ? 'BOUND' : data?.status?.toUpperCase() || 'N/A'}
          {data?.disabled === 'true' && <span style={{ color: '#ef4444', marginLeft: 8 }}>DISABLED</span>}
        </div>
      </div>

      <div style={{ padding: isPCC ? '4px 16px 12px' : '8px 20px 16px' }}>
        <DataRow label="IP" value={data?.address || '—'} mono accent={isActive ? '#eef0f4' : undefined} />
        <DataRow label="Gateway" value={data?.gateway || '—'} mono />
        {!isPCC && <DataRow label="DHCP Server" value={data?.['dhcp-server'] || '—'} mono />}
        {!isPCC && <DataRow label="DNS" value={data?.['primary-dns'] ? `${data['primary-dns']} / ${data['secondary-dns']}` : '—'} mono />}
        <DataRow label="Lease" value={data?.['expires-after'] || '—'} mono accent={accentColor + 'cc'} />
        {!isPCC && <DataRow label="Distance" value={data?.['default-route-distance'] || '—'} mono />}
        {!isPCC && <DataRow label="Route Active" value={route?.active === 'true' ? 'Yes' : 'No'} accent={route?.active === 'true' ? '#22c55e' : '#ef4444'} />}
        {isPCC && <DataRow label="Load Share" value={`${pccPercent}%`} accent={accentColor} />}
      </div>

      {!isPCC && mode !== 'single-only' && (
        <div style={{ padding: '0 20px 20px' }}>
          <button
            onClick={() => onSwitch(providerKey)}
            disabled={loading || isActive}
            style={{
              width: '100%',
              padding: '10px 0',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              borderRadius: 8,
              cursor: loading || isActive ? 'default' : 'pointer',
              background: isActive ? '#1a1f2e' : accentColor + '18',
              color: isActive ? '#636b7e' : accentColor,
              border: `1px solid ${isActive ? '#1a1f2e' : accentColor + '30'}`,
              transition: 'all 0.2s ease',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {isActive ? 'Active' : loading ? 'Switching...' : 'Activate'}
          </button>
        </div>
      )}
    </div>
  );
}
