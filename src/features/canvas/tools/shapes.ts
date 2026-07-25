// shapes.ts — click-drag shape tools: rectangle, circle, line
// Each tool works as MS Paint: mousedown records start, mousemove previews
// outline on foreground SVG, mouseup commits final shape to Y.Array.

import { renderInProgress } from '../svg-renderer';
import type { DrawElement } from '../../../shared/types';

export type ShapeTool = 'rect' | 'circle' | 'line';

interface ShapeDrag {
  tool: ShapeTool;
  startX: number;
  startY: number;
  color: string;
  strokeWidth: number;
}

let drag: ShapeDrag | null = null;
let _fgSvg: SVGSVGElement | null = null;

function getPos(e: PointerEvent, el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

/** Build preview DrawElement from start point + current point. */
function buildPreview(
  tool: ShapeTool,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  strokeWidth: number,
): DrawElement {
  const base = { id: '', tool, color, strokeWidth, opacity: 1, points: [], peerId: '', timestamp: 0 };
  if (tool === 'rect') {
    return { ...base, type: 'rect', x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  if (tool === 'circle') {
    const radius = Math.hypot(x2 - x1, y2 - y1);
    return { ...base, type: 'circle', x: x1 - radius, y: y1 - radius, width: radius * 2, height: radius * 2 };
  }
  // line
  return { ...base, type: 'line', points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] };
}

/** Set the foreground SVG for preview rendering. */
export function setShapeFgSvg(svg: SVGSVGElement): void {
  _fgSvg = svg;
}

/** True if a shape drag is currently in progress. */
export function isDragging(): boolean {
  return drag !== null;
}

export function onShapePointerDown(
  e: PointerEvent,
  canvasEl: HTMLElement,
  tool: ShapeTool,
  color: string,
  strokeWidth: number,
): void {
  const pos = getPos(e, canvasEl);
  drag = { tool, startX: pos.x, startY: pos.y, color, strokeWidth };
}

export function onShapePointerMove(e: PointerEvent, canvasEl: HTMLElement): boolean {
  if (!drag || !_fgSvg) return false;
  const pos = getPos(e, canvasEl);
  const preview = buildPreview(drag.tool, drag.startX, drag.startY, pos.x, pos.y, drag.color, drag.strokeWidth);
  renderInProgress(_fgSvg, preview);
  return true;
}

export function onShapePointerUp(e: PointerEvent, canvasEl: HTMLElement): DrawElement | null {
  if (!drag) return null;
  const pos = getPos(e, canvasEl);
  const element = buildPreview(drag.tool, drag.startX, drag.startY, pos.x, pos.y, drag.color, drag.strokeWidth);
  element.id = crypto.randomUUID();
  element.timestamp = Date.now();
  drag = null;
  // Skip zero-size shapes
  if ((element.type === 'rect' || element.type === 'circle') && ((element.width ?? 0) < 2 && (element.height ?? 0) < 2)) {
    return null;
  }
  return element;
}

/** Cancel in-progress shape drag (e.g., on tool switch). */
export function cancelShapeDrag(): void {
  drag = null;
  if (_fgSvg) renderInProgress(_fgSvg, null);
}