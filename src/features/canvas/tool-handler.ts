// tool-handler.ts — unified pointer event handler for drawing tools
// Handles mousedown/touchdown → mousemove → mouseup lifecycle,
// renders in-progress strokes on foreground SVG, commits via callback.
// Shape tools (rect/circle/line) use click-drag; fill uses single click.

import { renderInProgress } from './svg-renderer';
import { simplifyPath } from './path-simplify';
import type { DrawElement, Tool } from '../../shared/types';
import { pencilTool } from './tools/pencil';
import { brushTool } from './tools/brush';
import { eraserTool } from './tools/eraser';
import {
  setShapeFgSvg,
  onShapePointerDown,
  onShapePointerMove,
  onShapePointerUp,
  cancelShapeDrag,
  type ShapeTool,
} from './tools/shapes';
import { computeFill } from './tools/fill';

interface ToolConfig {
  type: Tool;
  defaultStrokeWidth: number;
  defaultOpacity: number;
  defaultColor?: string;
}

const TOOL_CONFIGS: Record<string, ToolConfig> = {
  pencil: pencilTool,
  brush: brushTool,
  eraser: eraserTool,
  rect: { type: 'rect', defaultStrokeWidth: 3, defaultOpacity: 1 },
  circle: { type: 'circle', defaultStrokeWidth: 3, defaultOpacity: 1 },
  line: { type: 'line', defaultStrokeWidth: 3, defaultOpacity: 1 },
  fill: { type: 'fill', defaultStrokeWidth: 0, defaultOpacity: 1 },
};

const SHAPE_TOOLS: ReadonlySet<string> = new Set(['rect', 'circle', 'line']);

export function setupToolHandler(
  canvasEl: HTMLElement,
  fgSvg: SVGSVGElement,
  onCommit: (el: DrawElement) => void,
  bgSvg?: SVGSVGElement,
) {
  let active = false;
  let points: { x: number; y: number }[] = [];
  let activeTool: Tool = 'pencil';
  let currentColor = '#FFFFFF';
  let currentStrokeWidth = 1;
  let currentOpacity = 1;

  // Wire shape tools to foreground SVG
  setShapeFgSvg(fgSvg);

  function getPos(e: PointerEvent): { x: number; y: number } {
    const rect = canvasEl.getBoundingClientRect();
    const svg = canvasEl as unknown as SVGSVGElement;
    const vb = svg.viewBox?.baseVal;
    const scaleX = (vb && vb.width > 0) ? vb.width / rect.width : 1;
    const scaleY = (vb && vb.height > 0) ? vb.height / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function applyToolDefaults(tool: Tool) {
    const cfg = TOOL_CONFIGS[tool];
    if (!cfg) return;
    cancelShapeDrag(); // cancel any in-progress shape drag on tool switch
    activeTool = tool;
    currentStrokeWidth = cfg.defaultStrokeWidth;
    currentOpacity = cfg.defaultOpacity;
    if (cfg.defaultColor !== undefined) currentColor = cfg.defaultColor;
  }

  // ── Pointer events ──

  canvasEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // Fill tool: handled separately via click (no drag)
    if (activeTool === 'fill') return;

    // Shape tools: click-drag
    if (SHAPE_TOOLS.has(activeTool)) {
      canvasEl.setPointerCapture(e.pointerId);
      onShapePointerDown(e, canvasEl, activeTool as ShapeTool, currentColor, currentStrokeWidth);
      active = true;
      return;
    }

    // Freehand tools (pencil/brush/eraser)
    canvasEl.setPointerCapture(e.pointerId);
    active = true;
    points = [getPos(e)];
  });

  window.addEventListener('pointermove', (e: PointerEvent) => {
    if (!active) return;

    // Shape tools: update preview
    if (SHAPE_TOOLS.has(activeTool)) {
      onShapePointerMove(e, canvasEl);
      return;
    }

    // Freehand tools
    points.push(getPos(e));
    const preview: DrawElement = {
      id: '',
      type: 'path',
      tool: activeTool,
      color: currentColor,
      strokeWidth: currentStrokeWidth,
      opacity: currentOpacity,
      points: [...points],
      peerId: '',
      timestamp: Date.now(),
    };
    renderInProgress(fgSvg, preview);
  });

  window.addEventListener('pointerup', (e: PointerEvent) => {
    if (!active) return;
    active = false;

    try { canvasEl.releasePointerCapture(e.pointerId); } catch { /* already released */ }

    // Shape tools: commit shape
    if (SHAPE_TOOLS.has(activeTool)) {
      const element = onShapePointerUp(e, canvasEl);
      renderInProgress(fgSvg, null);
      if (element) onCommit(element);
      return;
    }

    // Freehand tools
    const simplified = simplifyPath(points, 2.0);
    renderInProgress(fgSvg, null);

    if (simplified.length < 2) return;

    const element: DrawElement = {
      id: crypto.randomUUID(),
      type: 'path',
      tool: activeTool,
      color: currentColor,
      strokeWidth: currentStrokeWidth,
      opacity: currentOpacity,
      points: simplified,
      peerId: '',
      timestamp: Date.now(),
    };

    onCommit(element);
  });

  // ── Fill tool: single click (no drag) ──

  canvasEl.addEventListener('click', async (e: MouseEvent) => {
    if (activeTool !== 'fill') return;
    const pos = getPos(e as PointerEvent);

    const svg = bgSvg ?? (document.getElementById('bg-canvas') as unknown as SVGSVGElement | null);
    if (!svg) return;

    const element = await computeFill(svg, pos.x, pos.y, currentColor);
    if (element) onCommit(element);
  });

  return {
    setTool: applyToolDefaults,
    setColor: (c: string) => { currentColor = c; },
    setStrokeWidth: (w: number) => { currentStrokeWidth = w; },
    setOpacity: (o: number) => { currentOpacity = o; },
    getTool: () => activeTool,
    getColor: () => currentColor,
    getStrokeWidth: () => currentStrokeWidth,
    getOpacity: () => currentOpacity,
  };
}