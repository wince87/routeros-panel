export interface FormattedSpeed {
  val: string;
  unit: 'bps' | 'Kbps' | 'Mbps' | 'Gbps';
}

export function formatSpeedNum(bps: number | string | undefined): FormattedSpeed {
  const num = typeof bps === 'number' ? bps : parseInt(bps ?? '', 10) || 0;
  if (num >= 1_000_000_000) return { val: (num / 1_000_000_000).toFixed(1), unit: 'Gbps' };
  if (num >= 1_000_000) return { val: (num / 1_000_000).toFixed(1), unit: 'Mbps' };
  if (num >= 1_000) return { val: (num / 1_000).toFixed(1), unit: 'Kbps' };
  return { val: num.toString(), unit: 'bps' };
}
