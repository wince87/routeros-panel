export function StatusDot({ active }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: active ? '#22c55e' : '#ef4444',
      boxShadow: active ? '0 0 8px #22c55e88' : '0 0 8px #ef444488',
    }} />
  );
}
