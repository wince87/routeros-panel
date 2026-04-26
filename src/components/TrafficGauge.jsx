import { formatSpeedNum } from '../utils/format';

export function TrafficGauge({ rx, tx, color, compact }) {
  const rxFmt = formatSpeedNum(rx);
  const txFmt = formatSpeedNum(tx);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: compact ? 8 : 12,
      padding: compact ? '8px 0 4px' : '14px 0 8px',
    }}>
      <div style={{
        background: '#0d1017',
        borderRadius: 8,
        padding: compact ? '8px 10px' : '12px 14px',
        border: '1px solid #1a1f2e',
      }}>
        <div style={{
          fontSize: compact ? 9 : 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#636b7e',
          marginBottom: compact ? 3 : 6,
          fontFamily: "'Outfit', sans-serif",
        }}>Download</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: compact ? 17 : 22,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            color: color || '#22c55e',
            lineHeight: 1,
          }}>{rxFmt.val}</span>
          <span style={{
            fontSize: compact ? 9 : 10,
            fontWeight: 500,
            color: '#636b7e',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{rxFmt.unit}</span>
        </div>
      </div>
      <div style={{
        background: '#0d1017',
        borderRadius: 8,
        padding: compact ? '8px 10px' : '12px 14px',
        border: '1px solid #1a1f2e',
      }}>
        <div style={{
          fontSize: compact ? 9 : 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: '#636b7e',
          marginBottom: compact ? 3 : 6,
          fontFamily: "'Outfit', sans-serif",
        }}>Upload</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: compact ? 17 : 22,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            color: color || '#f59e0b',
            lineHeight: 1,
          }}>{txFmt.val}</span>
          <span style={{
            fontSize: compact ? 9 : 10,
            fontWeight: 500,
            color: '#636b7e',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{txFmt.unit}</span>
        </div>
      </div>
    </div>
  );
}
