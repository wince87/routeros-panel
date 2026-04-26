import { useState, useEffect, useCallback } from 'react';
import { api, apiList } from '../api';
import { useMessage } from '../hooks/useMessage';
import { MessageBar } from '../components/MessageBar';

export default function BackupPage() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, showMsg] = useMessage();

  const fetchBackups = useCallback(async () => {
    const files = await apiList('GET', '/file?type=backup');
    setBackups([...files].sort((a, b) => (b['last-modified'] || '').localeCompare(a['last-modified'] || '')));
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const name = `panel-${Date.now()}`;
      await api('POST', '/system/backup/save', { name });
      showMsg(`Backup created: ${name}.backup`);
      await fetchBackups();
    } catch (e) {
      showMsg('Backup failed');
    }
    setLoading(false);
  };

  const handleRestore = async (fileName) => {
    if (!window.confirm(`Restore "${fileName}"? Router will reboot.`)) return;
    setLoading(true);
    try {
      await api('POST', '/system/backup/load', { name: fileName, password: '' });
      showMsg(`Restoring ${fileName}... Router will reboot`);
    } catch (e) {
      showMsg('Restore failed');
    }
    setLoading(false);
  };

  const handleDeleteBackup = async (id) => {
    setLoading(true);
    try {
      await api('DELETE', `/file/${id}`);
      showMsg('Backup deleted');
      await fetchBackups();
    } catch (e) {
      showMsg('Delete failed');
    }
    setLoading(false);
  };

  const S = {
    card: { background: '#12151c', borderRadius: 12, border: '1px solid #1a1f2e', padding: 16 },
    lbl: { fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#636b7e', fontFamily: "'Outfit', sans-serif" },
    mono: { fontFamily: "'JetBrains Mono', monospace", color: '#eef0f4' },
    btn: (c, sm) => ({ padding: sm ? '4px 10px' : '6px 14px', fontSize: sm ? 9 : 10, fontWeight: 600, fontFamily: "'Outfit', sans-serif", textTransform: 'uppercase', letterSpacing: '0.08em', borderRadius: 6, cursor: loading ? 'default' : 'pointer', background: `${c}12`, color: c, border: `1px solid ${c}30`, transition: 'all 0.2s ease', opacity: loading ? 0.5 : 1 }),
  };

  return (
    <>
      <MessageBar message={message} />
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#eef0f4', letterSpacing: '-0.01em' }}>Backup / Restore</span>
          <button onClick={handleBackup} disabled={loading} style={S.btn('#22c55e')}>Create</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {backups.length === 0 && (
            <div style={{ ...S.mono, fontSize: 10, color: '#636b7e', padding: '8px 0' }}>No backups</div>
          )}
          {backups.map(b => (
            <div key={b['.id']} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 10px', background: '#0d1017', borderRadius: 8, border: '1px solid #1a1f2e',
            }}>
              <div>
                <div style={{ ...S.mono, fontSize: 11, fontWeight: 500 }}>{b.name}</div>
                <div style={{ ...S.mono, fontSize: 9, color: '#636b7e', marginTop: 2 }}>
                  {b['last-modified']} — {(parseInt(b.size) / 1024).toFixed(1)} KB
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => handleRestore(b.name)} disabled={loading} style={S.btn('#f59e0b', true)}>Restore</button>
                <button onClick={() => handleDeleteBackup(b['.id'])} disabled={loading} style={{ ...S.btn('#ef4444', true), padding: '4px 8px' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
