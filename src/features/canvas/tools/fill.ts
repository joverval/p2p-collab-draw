// fill.ts — flood fill via canvas snapshot → SVG polygon
// SVG has no native fill: render current drawing to <canvas>,
// run flood-fill, trace contour, commit as <polygon>.

import { simplifyPath } from '../path-simplify';
import type { DrawElement } from '../../../shared/types';

interface Point { x: number; y: number; }

// ── Color matching (with tolerance for anti-aliasing) ──

const TOLERANCE = 8;

function colorMatch(r1: number, g1: number, b1: number, a1: number, r2: number, g2: number, b2: number, a2: number): boolean {
  return Math.abs(r1 - r2) <= TOLERANCE
    && Math.abs(g1 - g2) <= TOLERANCE
    && Math.abs(b1 - b2) <= TOLERANCE
    && Math.abs(a1 - a2) <= TOLERANCE;
}

// ── Flood fill mask (4-way, iterative stack) ──

function floodFillMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  startX: number,
  startY: number,
  tR: number, tG: number, tB: number, tA: number,
): Uint8Array {
  const visited = new Uint8Array(w * h);
  const stack: number[] = [startY * w + startX]; // flat array stack

  while (stack.length > 0) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;

    const pi = idx * 4;
    if (!colorMatch(data[pi], data[pi + 1], data[pi + 2], data[pi + 3], tR, tG, tB, tA)) continue;

    visited[idx] = 1;

    const x = idx % w;
    const y = (idx / w) | 0;

    if (x + 1 < w) stack.push(idx + 1);
    if (x - 1 >= 0) stack.push(idx - 1);
    if (y + 1 < h) stack.push(idx + w);
    if (y - 1 >= 0) stack.push(idx - w);

    // ponytail: guard against runaway fill on huge canvases
    if (stack.length > w * h) break;
  }

  return visited;
}

// ── Moore neighborhood contour tracing ──

function traceContour(mask: Uint8Array, w: number, h: number): Point[] {
  // Find topmost-leftmost filled pixel
  let startX = -1, startY = -1;
  for (let y = 0; y < h && startX === -1; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        let boundary = false;
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) {
          boundary = true;
        } else if (!mask[y * w + (x + 1)] || !mask[y * w + (x - 1)]
          || !mask[(y + 1) * w + x] || !mask[(y - 1) * w + x]) {
          boundary = true;
        }
        if (boundary) { startX = x; startY = y; break; }
      }
    }
  }
  if (startX === -1) return [];

  // 8-directional: clockwise from N
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  const points: Point[] = [];
  const seen = new Set<number>();
  const key = (x: number, y: number) => y * w + x;

  let cx = startX, cy = startY;
  let dir = 0; // start searching right

  // Walk boundary until we return to start
  for (let iter = 0; iter < w * h * 2; iter++) {
    const k = key(cx, cy);
    // If we've seen this pixel before and we have enough points, close
    if (seen.has(k) && points.length > 3) {
      // Check if we're near the start
      if (Math.abs(cx - startX) <= 1 && Math.abs(cy - startY) <= 1) break;
    }
    seen.add(k);
    points.push({ x: cx, y: cy });

    // Find next boundary pixel: scan counter-clockwise from current dir
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i) % 8;
      const nx = cx + dx[nd];
      const ny = cy + dy[nd];

      if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx]) {
        // Check this is a boundary pixel
        let isBoundary = (nx === 0 || nx === w - 1 || ny === 0 || ny === h - 1);
        if (!isBoundary) {
          isBoundary = !mask[ny * w + (nx + 1)] || !mask[ny * w + (nx - 1)]
            || !mask[(ny + 1) * w + nx] || !mask[(ny - 1) * w + nx];
        }
        if (isBoundary) {
          cx = nx;
          cy = ny;
          dir = (nd + 6) % 8; // turn back ~180 for right-hand rule
          found = true;
          break;
        }
      }
    }
    if (!found) break; // dead end
  }

  return points;
}

// ── Public API ──

let canvas: HTMLCanvasElement | null = null;

function getCanvas(w: number, h: number): CanvasRenderingContext2D {
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    document.body.appendChild(canvas);
  }
  canvas.width = w;
  canvas.height = h;
  return canvas.getContext('2d')!;
}

/**
 * Render the bg-canvas SVG to a hidden canvas, flood-fill from (cx,cy),
 * trace the filled region's contour, and return a DrawElement polygon.
 * Returns null if no fillable region found or contour too small.
 */
export async function computeFill(
  bgSvg: SVGSVGElement,
  cx: number,
  cy: number,
  fillColor: string,
): Promise<DrawElement | null> {
  const w = bgSvg.clientWidth || 800;
  const h = bgSvg.clientHeight || 600;
  if (w < 1 || h < 1) return null;

  const ctx = getCanvas(w, h);

  // Render SVG → canvas
  const svgString = new XMLSerializer().serializeToString(bgSvg);
  // ponytail: inline width/height on root for correct scaling
  const sized = svgString.replace('<svg', `<svg width="${w}" height="${h}"`);
  const blob = new Blob([sized], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      const ix = Math.max(0, Math.min(w - 1, Math.floor(cx)));
      const iy = Math.max(0, Math.min(h - 1, Math.floor(cy)));
      const pi = (iy * w + ix) * 4;
      const tR = data[pi];
      const tG = data[pi + 1];
      const tB = data[pi + 2];
      const tA = data[pi + 3];

      const mask = floodFillMask(data, w, h, ix, iy, tR, tG, tB, tA);
      const contour = traceContour(mask, w, h);

      if (contour.length < 3) {
        resolve(null);
        return;
      }

      const simplified = simplifyPath(contour, 2.0);

      if (simplified.length < 3) {
        resolve(null);
        return;
      }

      resolve({
        id: crypto.randomUUID(),
        type: 'fill',
        tool: 'fill',
        color: fillColor,
        strokeWidth: 0,
        opacity: 1,
        points: simplified,
        peerId: '',
        timestamp: Date.now(),
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}