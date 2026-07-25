// Ramer-Douglas-Peucker path simplification
// Reduces mouse event points (~200/stroke) to key points (~15) without visible quality loss

interface Point { x: number; y: number; }

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  const tClamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + tClamped * dx), p.y - (a.y + tClamped * dy));
}

export function simplifyPath(points: Point[], epsilon: number = 2.0): Point[] {
  if (points.length < 3) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    // Drop duplicate split point
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}