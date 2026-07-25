// tests/unit/canvas/svg-renderer.test.ts
// Verify each DrawElement type produces correct SVG markup.

import { describe, it, expect } from 'vitest';
import { renderSvg, renderInProgress } from '../../../src/features/canvas/svg-renderer';
import type { DrawElement } from '../../../src/shared/types';

function makeEl(overrides: Partial<DrawElement> = {}): DrawElement {
  return {
    id: 'test-1',
    type: 'path',
    tool: 'pencil',
    color: '#ff0000',
    strokeWidth: 3,
    opacity: 1,
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    peerId: 'peer-a',
    timestamp: 1000,
    ...overrides,
  } as DrawElement;
}

function svgRoot(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  return svg as unknown as SVGSVGElement;
}

function renderOne(el: DrawElement): SVGElement[] {
  const container = svgRoot();
  renderSvg(container, [el]);
  return Array.from(container.children) as SVGElement[];
}

describe('renderSvg', () => {
  it('clears container before rendering', () => {
    const container = svgRoot();
    const old = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    container.appendChild(old);

    renderSvg(container, [makeEl()]);

    expect(container.children.length).toBe(1);
    expect(container.children[0].tagName).toBe('path');
  });

  it('renders empty array as empty container', () => {
    const container = svgRoot();
    renderSvg(container, []);
    expect(container.children.length).toBe(0);
  });

  it('sets data-element-id on every element', () => {
    const el = makeEl({ id: 'my-id' });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('data-element-id')).toBe('my-id');
  });
});

describe('path element (pencil/brush/eraser)', () => {
  it('renders SVG <path> with correct d attribute', () => {
    const el = makeEl({ type: 'path', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 10 }] });
    const nodes = renderOne(el);
    expect(nodes[0].tagName).toBe('path');
    expect(nodes[0].getAttribute('d')).toBe('M 10 20 L 30 40 L 50 10');
  });

  it('sets fill=none and stroke attributes', () => {
    const el = makeEl({ type: 'path', color: '#0f0', strokeWidth: 5 });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('fill')).toBe('none');
    expect(nodes[0].getAttribute('stroke')).toBe('#0f0');
    expect(nodes[0].getAttribute('stroke-width')).toBe('5');
    expect(nodes[0].getAttribute('stroke-linecap')).toBe('round');
    expect(nodes[0].getAttribute('stroke-linejoin')).toBe('round');
  });

  it('renders opacity < 1', () => {
    const el = makeEl({ type: 'path', opacity: 0.5 });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('opacity')).toBe('0.5');
  });

  it('skips opacity when 1 (default)', () => {
    const el = makeEl({ type: 'path', opacity: 1 });
    const nodes = renderOne(el);
    expect(nodes[0].hasAttribute('opacity')).toBe(false);
  });

  it('handles single-point path gracefully', () => {
    const el = makeEl({ type: 'path', points: [{ x: 10, y: 20 }] });
    // ponytail: returns 'M x y' with no L segments
    expect(() => renderOne(el)).not.toThrow();
  });
});

describe('rect element', () => {
  it('renders SVG <rect> with correct geometry', () => {
    const el = makeEl({ type: 'rect', x: 10, y: 20, width: 100, height: 50 });
    const nodes = renderOne(el);
    expect(nodes[0].tagName).toBe('rect');
    expect(nodes[0].getAttribute('x')).toBe('10');
    expect(nodes[0].getAttribute('y')).toBe('20');
    expect(nodes[0].getAttribute('width')).toBe('100');
    expect(nodes[0].getAttribute('height')).toBe('50');
  });

  it('sets fill=none and stroke', () => {
    const el = makeEl({ type: 'rect', color: '#00f', strokeWidth: 2 });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('fill')).toBe('none');
    expect(nodes[0].getAttribute('stroke')).toBe('#00f');
    expect(nodes[0].getAttribute('stroke-width')).toBe('2');
  });

  it('defaults missing coordinates to 0', () => {
    const el = makeEl({ type: 'rect' });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('x')).toBe('0');
    expect(nodes[0].getAttribute('y')).toBe('0');
    expect(nodes[0].getAttribute('width')).toBe('0');
    expect(nodes[0].getAttribute('height')).toBe('0');
  });
});

describe('circle element', () => {
  it('renders SVG <circle> with computed cx/cy/r', () => {
    const el = makeEl({ type: 'circle', x: 50, y: 50, width: 40, height: 40 });
    const nodes = renderOne(el);
    expect(nodes[0].tagName).toBe('circle');
    // cx = x + width/2 = 50 + 20 = 70
    expect(nodes[0].getAttribute('cx')).toBe('70');
    expect(nodes[0].getAttribute('cy')).toBe('70');
    // r = max(width, height) / 2 = 20
    expect(nodes[0].getAttribute('r')).toBe('20');
  });

  it('uses larger dimension for radius', () => {
    const el = makeEl({ type: 'circle', x: 0, y: 0, width: 60, height: 30 });
    const nodes = renderOne(el);
    // r = max(60, 30)/2 = 30
    expect(nodes[0].getAttribute('r')).toBe('30');
  });

  it('sets fill=none and stroke', () => {
    const el = makeEl({ type: 'circle', color: '#ff0', strokeWidth: 4 });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('fill')).toBe('none');
    expect(nodes[0].getAttribute('stroke')).toBe('#ff0');
    expect(nodes[0].getAttribute('stroke-width')).toBe('4');
  });
});

describe('line element', () => {
  it('renders SVG <line> from two points', () => {
    const el = makeEl({ type: 'line', points: [{ x: 10, y: 20 }, { x: 100, y: 200 }] });
    const nodes = renderOne(el);
    expect(nodes[0].tagName).toBe('line');
    expect(nodes[0].getAttribute('x1')).toBe('10');
    expect(nodes[0].getAttribute('y1')).toBe('20');
    expect(nodes[0].getAttribute('x2')).toBe('100');
    expect(nodes[0].getAttribute('y2')).toBe('200');
  });

  it('defaults to first point when only one point given', () => {
    const el = makeEl({ type: 'line', points: [{ x: 42, y: 42 }] });
    const nodes = renderOne(el);
    // p1 falls back to p0
    expect(nodes[0].getAttribute('x1')).toBe('42');
    expect(nodes[0].getAttribute('x2')).toBe('42');
  });

  it('sets stroke attributes, no fill (line has no fill)', () => {
    const el = makeEl({ type: 'line', color: '#aaa', strokeWidth: 1 });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('stroke')).toBe('#aaa');
    expect(nodes[0].getAttribute('stroke-width')).toBe('1');
  });
});

describe('fill element', () => {
  it('renders SVG <polygon> with points attribute', () => {
    const el = makeEl({ type: 'fill', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 25, y: 50 }] });
    const nodes = renderOne(el);
    expect(nodes[0].tagName).toBe('polygon');
    expect(nodes[0].getAttribute('points')).toBe('0,0 50,0 25,50');
  });

  it('sets fill color (solid, not outline)', () => {
    const el = makeEl({ type: 'fill', color: '#00ff00' });
    const nodes = renderOne(el);
    expect(nodes[0].getAttribute('fill')).toBe('#00ff00');
  });
});

describe('unknown element type', () => {
  it('skips elements with no builder', () => {
    const container = svgRoot();
    const el = makeEl({ type: 'unknown-type' as any });
    renderSvg(container, [el]);
    // No builder registered, should skip silently
    expect(container.children.length).toBe(0);
  });
});

describe('renderInProgress', () => {
  it('renders single element on foreground layer', () => {
    const svg = svgRoot();
    const el = makeEl({ type: 'rect', x: 10, y: 10, width: 50, height: 50 });
    renderInProgress(svg, el);
    expect(svg.children.length).toBe(1);
    expect(svg.children[0].tagName).toBe('rect');
  });

  it('clears previous element before rendering new one', () => {
    const svg = svgRoot();
    renderInProgress(svg, makeEl({ type: 'circle' }));
    renderInProgress(svg, makeEl({ type: 'rect' }));
    expect(svg.children.length).toBe(1);
    expect(svg.children[0].tagName).toBe('rect');
  });

  it('clears when null passed', () => {
    const svg = svgRoot();
    renderInProgress(svg, makeEl());
    renderInProgress(svg, null);
    expect(svg.children.length).toBe(0);
  });
});