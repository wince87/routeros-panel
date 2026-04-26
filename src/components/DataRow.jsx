export function DataRow({ label, value, mono, accent }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '6px 0',
      borderBottom: '1px solid #ffffff06',
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#636b7e',
        fontFamily: "'Outfit', sans-serif",
      }}>{label}</span>
      <span style={{
        fontSize: 12,
        fontFamily: mono ? "'JetBrains Mono', monospace" : "'Outfit', sans-serif",
        fontWeight: mono ? 400 : 500,
        color: accent || '#c8ccd4',
        letterSpacing: mono ? '0.02em' : 0,
      }}>{value}</span>
    </div>
  );
}
