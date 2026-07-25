// tests/unit/canvas/tools.test.ts
// Verify each tool produces correct DrawElement shapes.

import { describe, it, expect, beforeEach } from 'vitest';

// ── Tool configs ──

import { pencilTool } from '../../../src/features/canvas/tools/pencil';
import { brushTool } from '../../../src/features/canvas/tools/brush';
import { eraserTool } from '../../../src/features/canvas/tools/eraser';

describe('pencil tool config', () => {
  it('has correct defaults', () => {
    expect(pencilTool.type).toBe('pencil');
    expect(pencilTool.defaultStrokeWidth).toBe(1);
    expect(pencilTool.defaultOpacity).toBe(1);
  });

  it('has no defaultColor (uses current selected)', () => {
    expect(pencilTool).not.toHaveProperty('defaultColor');
  });
});

describe('brush tool config', () => {
  it('has correct defaults', () => {
    expect(brushTool.type).toBe('brush');
    expect(brushTool.defaultStrokeWidth).toBe(5);
    expect(brushTool.defaultOpacity).toBe(0.8);
  });
});

describe('eraser tool config', () => {
  it('has correct defaults including bg-matching color', () => {
    expect(eraserTool.type).toBe('eraser');
    expect(eraserTool.defaultStrokeWidth).toBe(20);
    expect(eraserTool.defaultOpacity).toBe(1);
    expect(eraserTool.defaultColor).toBe('#1e1e1e');
  });
});

// ── Shape tools (shapes.ts) ──

import {
  setShapeFgSvg,
  onShapePointerDown,
  onShapePointerMove,
  onShapePointerUp,
  cancelShapeDrag,
  isDragging,
} from '../../../src/features/canvas/tools/shapes';

function createCanvasEl(): HTMLElement {
  const el = document.createElement('div');
  // Mock getBoundingClientRect
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 }) as DOMRect;
  return el;
}

function createFgSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  return svg as unknown as SVGSVGElement;
}

function createPointerEvent(overrides: Partial<PointerEventInit> = {}): PointerEvent {
  const defaults: PointerEventInit = {
    clientX: 100,
    clientY: 200,
    button: 0,
    pointerId: 1,
    bubbles: true,
  };
  return new PointerEvent('pointermove', { ...defaults, ...overrides });
}

describe('shape tools', () => {
  let canvasEl: HTMLElement;
  let fgSvg: SVGSVGElement;

  beforeEach(() => {
    canvasEl = createCanvasEl();
    fgSvg = createFgSvg();
    setShapeFgSvg(fgSvg);
  });

  describe('onShapePointerDown', () => {
    it('starts a drag', () => {
      const e = createPointerEvent();
      onShapePointerDown(e, canvasEl, 'rect', '#ff0000', 3);
      expect(isDragging()).toBe(true);
    });
  });

  describe('onShapePointerMove', () => {
    it('draws preview on foreground SVG during drag', () => {
      const downE = createPointerEvent({ clientX: 50, clientY: 50 });
      onShapePointerDown(downE, canvasEl, 'rect', '#ff0000', 3);

      const moveE = createPointerEvent({ clientX: 150, clientY: 120 });
      onShapePointerMove(moveE, canvasEl);

      // Preview rendered on fgSvg
      expect(fgSvg.children.length).toBeGreaterThanOrEqual(1);
    });

    it('returns false when not dragging', () => {
      cancelShapeDrag();
      const moved = onShapePointerMove(createPointerEvent(), canvasEl);
      expect(moved).toBe(false);
    });
  });

  describe('onShapePointerUp — rect', () => {
    it('produces correct rect DrawElement', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 50, clientY: 50 }),
        canvasEl, 'rect', '#ff0000', 3,
      );
      const upE = createPointerEvent({ clientX: 150, clientY: 120 });
      const element = onShapePointerUp(upE, canvasEl);

      expect(element).not.toBeNull();
      expect(element!.type).toBe('rect');
      expect(element!.tool).toBe('rect');
      expect(element!.color).toBe('#ff0000');
      expect(element!.strokeWidth).toBe(3);
      expect(element!.x).toBe(50);
      expect(element!.y).toBe(50);
      expect(element!.width).toBe(100);
      expect(element!.height).toBe(70);
      expect(element!.id).toBeTruthy(); // UUID assigned
      expect(element!.timestamp).toBeGreaterThan(0);
    });

    it('handles drag in any direction (negative width/height normalized)', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 200, clientY: 100 }),
        canvasEl, 'rect', '#00f', 2,
      );
      const upE = createPointerEvent({ clientX: 50, clientY: 20 });
      const element = onShapePointerUp(upE, canvasEl);

      expect(element).not.toBeNull();
      // x/y should be min, width/height should be absolute
      expect(element!.x).toBe(50);
      expect(element!.y).toBe(20);
      expect(element!.width).toBe(150);
      expect(element!.height).toBe(80);
    });

    it('returns null for zero-size rect (both dims < 2)', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 100, clientY: 100 }),
        canvasEl, 'rect', '#000', 1,
      );
      const upE = createPointerEvent({ clientX: 101, clientY: 101 });
      const element = onShapePointerUp(upE, canvasEl);
      expect(element).toBeNull();
    });
  });

  describe('onShapePointerUp — circle', () => {
    it('produces correct circle DrawElement', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 100, clientY: 100 }),
        canvasEl, 'circle', '#0f0', 2,
      );
      const upE = createPointerEvent({ clientX: 160, clientY: 100 }); // radius=60
      const element = onShapePointerUp(upE, canvasEl);

      expect(element).not.toBeNull();
      expect(element!.type).toBe('circle');
      expect(element!.tool).toBe('circle');
      expect(element!.color).toBe('#0f0');
      expect(element!.strokeWidth).toBe(2);
      // radius = distance(100,100 → 160,100) = 60
      // x = cx - r = 100-60=40, y = cy - r = 100-60=40
      expect(element!.x).toBe(40);
      expect(element!.y).toBe(40);
      expect(element!.width).toBe(120);
      expect(element!.height).toBe(120);
    });

    it('returns null for zero-size circle (< 2)', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 100, clientY: 100 }),
        canvasEl, 'circle', '#000', 1,
      );
      // radius = 0 → width = height = 0, both < 2
      const upE = createPointerEvent({ clientX: 100, clientY: 100 });
      const element = onShapePointerUp(upE, canvasEl);
      expect(element).toBeNull();
    });
  });

  describe('onShapePointerUp — line', () => {
    it('produces correct line DrawElement', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 10, clientY: 20 }),
        canvasEl, 'line', '#fff', 1,
      );
      const upE = createPointerEvent({ clientX: 100, clientY: 200 });
      const element = onShapePointerUp(upE, canvasEl);

      expect(element).not.toBeNull();
      expect(element!.type).toBe('line');
      expect(element!.tool).toBe('line');
      expect(element!.points).toEqual([
        { x: 10, y: 20 },
        { x: 100, y: 200 },
      ]);
      expect(element!.color).toBe('#fff');
    });

    it('does not reject zero-length lines (line tool has no size check)', () => {
      onShapePointerDown(
        createPointerEvent({ clientX: 50, clientY: 50 }),
        canvasEl, 'line', '#000', 1,
      );
      const upE = createPointerEvent({ clientX: 50, clientY: 50 });
      const element = onShapePointerUp(upE, canvasEl);
      // Lines of zero length are still valid line elements
      expect(element).not.toBeNull();
    });
  });

  describe('cancelShapeDrag', () => {
    it('resets drag state and clears preview', () => {
      onShapePointerDown(createPointerEvent(), canvasEl, 'rect', '#f00', 3);
      onShapePointerMove(createPointerEvent({ clientX: 200, clientY: 200 }), canvasEl);
      expect(isDragging()).toBe(true);

      cancelShapeDrag();
      expect(isDragging()).toBe(false);
      expect(fgSvg.children.length).toBe(0);
    });
  });
});