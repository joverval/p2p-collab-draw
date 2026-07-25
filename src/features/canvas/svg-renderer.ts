// svg-renderer.ts — maps DrawElement[] to SVG DOM nodes
// One-shot render: clears container, builds fresh nodes from element array.

import type { DrawElement } from '../../shared/types';

/** Convert points array to SVG path data string. */
function pointsToD(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

/** Create an SVG element with common attributes from a DrawElement. */
function createBaseEl(tag: string, el: DrawElement): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  node.setAttribute('data-element-id', el.id);
  if (el.opacity !== undefined && el.opacity < 1) {
    node.setAttribute('opacity', String(el.opacity));
  }
  return node;
}

/** Build an SVG <path> for pencil/brush/eraser freehand strokes. */
function buildPath(el: DrawElement): SVGPathElement {
  const p = createBaseEl('path', el) as SVGPathElement;
  p.setAttribute('d', pointsToD(el.points));
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke', el.color);
  p.setAttribute('stroke-width', String(el.strokeWidth));
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  return p;
}

/** Build an SVG <rect>. */
function buildRect(el: DrawElement): SVGRectElement {
  const r = createBaseEl('rect', el) as SVGRectElement;
  r.setAttribute('x', String(el.x ?? 0));
  r.setAttribute('y', String(el.y ?? 0));
  r.setAttribute('width', String(el.width ?? 0));
  r.setAttribute('height', String(el.height ?? 0));
  r.setAttribute('fill', 'none');
  r.setAttribute('stroke', el.color);
  r.setAttribute('stroke-width', String(el.strokeWidth));
  return r;
}

/** Build an SVG <circle>. */
function buildCircle(el: DrawElement): SVGCircleElement {
  const c = createBaseEl('circle', el) as SVGCircleElement;
  const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
  const cy = (el.y ?? 0) + (el.height ?? 0) / 2;
  const r = Math.max((el.width ?? 0), (el.height ?? 0)) / 2;
  c.setAttribute('cx', String(cx));
  c.setAttribute('cy', String(cy));
  c.setAttribute('r', String(r));
  c.setAttribute('fill', 'none');
  c.setAttribute('stroke', el.color);
  c.setAttribute('stroke-width', String(el.strokeWidth));
  return c;
}

/** Build an SVG <line>. */
function buildLine(el: DrawElement): SVGLineElement {
  const l = createBaseEl('line', el) as SVGLineElement;
  const p0 = el.points[0] ?? { x: 0, y: 0 };
  const p1 = el.points[1] ?? p0;
  l.setAttribute('x1', String(p0.x));
  l.setAttribute('y1', String(p0.y));
  l.setAttribute('x2', String(p1.x));
  l.setAttribute('y2', String(p1.y));
  l.setAttribute('stroke', el.color);
  l.setAttribute('stroke-width', String(el.strokeWidth));
  return l;
}

/** Build an SVG <polygon> for fill tool. */
function buildFill(el: DrawElement): SVGPolygonElement {
  const p = createBaseEl('polygon', el) as SVGPolygonElement;
  const pts = el.points.map(pt => `${pt.x},${pt.y}`).join(' ');
  p.setAttribute('points', pts);
  p.setAttribute('fill', el.color);
  // ponytail: fill tool has no stroke
  return p;
}

const builders: Record<DrawElement['type'], (el: DrawElement) => SVGElement> = {
  path: buildPath,
  rect: buildRect,
  circle: buildCircle,
  line: buildLine,
  fill: buildFill,
};

/**
 * Render an array of DrawElements into an SVG container.
 * Rebuilds all nodes from scratch — Y.Array observer calls this on every change.
 */
export function renderSvg(container: SVGSVGElement, elements: DrawElement[]): void {
  // Clear all children
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  // Build new SVG nodes
  for (const el of elements) {
    try {
      const build = builders[el.type];
      if (build) {
        container.appendChild(build(el));
      }
    } catch {
      // ponytail: skip malformed elements, don't block the whole render
    }
  }
}

/** Render a single in-progress element on the foreground SVG layer. */
export function renderInProgress(svg: SVGSVGElement, element: DrawElement | null): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!element) return;
  try {
    const build = builders[element.type];
    if (build) svg.appendChild(build(element));
  } catch { /* skip */ }
}