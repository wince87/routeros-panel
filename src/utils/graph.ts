export interface Pos {
  x: number;
  y: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export function getNodeSide(fromPos: Pos, toPos: Pos, nodeW: number, nodeH: number): [Side, Side] {
  const fcx = fromPos.x + nodeW / 2;
  const fcy = fromPos.y + nodeH / 2;
  const tcx = toPos.x + nodeW / 2;
  const tcy = toPos.y + nodeH / 2;
  const dx = tcx - fcx;
  const dy = tcy - fcy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx >= ady * 0.6) {
    return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

export function anchorPoint(pos: Pos, side: Side, offset: number, nodeW: number, nodeH: number): Pos {
  if (side === 'right') return { x: pos.x + nodeW, y: pos.y + nodeH / 2 + offset };
  if (side === 'left') return { x: pos.x, y: pos.y + nodeH / 2 + offset };
  if (side === 'bottom') return { x: pos.x + nodeW / 2 + offset, y: pos.y + nodeH };
  return { x: pos.x + nodeW / 2 + offset, y: pos.y };
}

export function edgePath(p1: Pos, p2: Pos, side1: Side, side2: Side): string {
  const horiz = side1 === 'left' || side1 === 'right';
  if (horiz) {
    const cp = Math.max(Math.abs(p2.x - p1.x) * 0.4, 50);
    const s1 = side1 === 'right' ? 1 : -1;
    const s2 = side2 === 'right' ? 1 : -1;
    return `M${p1.x},${p1.y} C${p1.x + cp * s1},${p1.y} ${p2.x + cp * s2},${p2.y} ${p2.x},${p2.y}`;
  }
  const cp = Math.max(Math.abs(p2.y - p1.y) * 0.4, 30);
  const s1 = side1 === 'bottom' ? 1 : -1;
  const s2 = side2 === 'bottom' ? 1 : -1;
  return `M${p1.x},${p1.y} C${p1.x},${p1.y + cp * s1} ${p2.x},${p2.y + cp * s2} ${p2.x},${p2.y}`;
}
