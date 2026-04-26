export function MessageBar({ message }) {
  if (!message) return null;

  return (
    <div style={{
      background: '#12151c',
      border: '1px solid #f59e0b30',
      borderRadius: 8,
      padding: '10px 16px',
      marginBottom: 20,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', monospace",
      color: '#f59e0b',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 14 }}>{'>'}</span>
      {message}
    </div>
  );
}
