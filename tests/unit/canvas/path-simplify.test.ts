// tests/unit/canvas/path-simplify.test.ts
// Verify Ramer-Douglas-Peucker reduces points without deviating beyond epsilon.

import { describe, it, expect } from 'vitest';
import { simplifyPath } from '../../../src/features/canvas/path-simplify';

interface Point { x: number; y: number; }

describe('simplifyPath', () => {
  it('returns same array for fewer than 3 points', () => {
    expect(simplifyPath([])).toEqual([]);
    expect(simplifyPath([{ x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }]);
    expect(simplifyPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
  });

  it('reduces collinear line to endpoints', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
      { x: 50, y: 0 },
    ];
    const result = simplifyPath(points, 2.0);
    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
    ]);
  });

  it('reduces nearly-straight line with small deviation below epsilon', () => {
    // Deviation of 1 from the line, epsilon=2, so it should simplify
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 1 },  // 1px off the straight line
      { x: 20, y: 0 },
    ];
    const result = simplifyPath(points, 2.0);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
  });

  it('preserves point with deviation exceeding epsilon', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },  // 5px off — exceeds epsilon=2
      { x: 20, y: 0 },
    ];
    const result = simplifyPath(points, 2.0);
    expect(result.length).toBe(3);
    expect(result[1]).toEqual({ x: 10, y: 5 });
  });

  it('preserves sharp corners (zigzag)', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
      { x: 30, y: 20 },
      { x: 50, y: 0 },
    ];
    const result = simplifyPath(points, 2.0);
    // All points deviate significantly from the start→end line
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('handles epsilon=0 (preserves everything)', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
      { x: 15, y: 0.1 },
      { x: 20, y: 0 },
    ];
    const result = simplifyPath(points, 0);
    // Even tiny deviations exceed epsilon=0
    expect(result.length).toBe(5);
  });

  it('always preserves first and last points', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 200 },
      { x: 300, y: 400 },
      { x: 500, y: 300 },
      { x: 600, y: 100 },
    ];
    const result = simplifyPath(points, 1000); // huge epsilon
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('simplifies real mouse stroke data', () => {
    // Simulated freehand stroke: ~30 points, mostly noisy around a curve
    const points: Point[] = [
      { x: 0, y: 100 },
      { x: 5, y: 101 }, { x: 10, y: 99 }, { x: 15, y: 100 },
      { x: 20, y: 95 }, { x: 25, y: 90 }, { x: 30, y: 88 },
      { x: 35, y: 85 }, { x: 40, y: 80 }, { x: 45, y: 78 },
      { x: 50, y: 75 }, { x: 55, y: 70 }, { x: 60, y: 68 },
      { x: 65, y: 65 }, { x: 70, y: 60 }, { x: 75, y: 58 },
      { x: 80, y: 55 }, { x: 85, y: 50 }, { x: 90, y: 48 },
      { x: 95, y: 45 }, { x: 100, y: 40 },
    ];
    const result = simplifyPath(points, 2.0);
    // Should reduce significantly
    expect(result.length).toBeLessThan(points.length);
    // Endpoints preserved
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('verifies no point deviates beyond epsilon from simplified path', () => {
    const points: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 1 }, { x: 4, y: 0 }, { x: 6, y: 2 },
      { x: 8, y: 1 }, { x: 10, y: 0 }, { x: 12, y: 1 },
      { x: 14, y: 0 }, { x: 16, y: 0 }, { x: 18, y: 1 },
      { x: 20, y: 0 }, { x: 22, y: 0 }, { x: 24, y: 2 },
      { x: 26, y: 1 }, { x: 28, y: 0 }, { x: 30, y: 0 },
    ];
    const epsilon = 2.0;
    const result = simplifyPath(points, epsilon);

    // For each original point, compute perpendicular distance to the
    // simplified polyline segment it falls on
    function pointToSegmentDist(p: Point, a: Point, b: Point): number {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    for (const orig of points) {
      let minDist = Infinity;
      for (let i = 0; i < result.length - 1; i++) {
        const d = pointToSegmentDist(orig, result[i], result[i + 1]);
        if (d < minDist) minDist = d;
      }
      // Allow epsilon + small floating-point tolerance
      expect(minDist).toBeLessThanOrEqual(epsilon + 0.001);
    }
  });
});