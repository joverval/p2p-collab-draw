// tests/integration/yjs-sync.test.ts
// Simulate two peers sharing draw elements via Yjs CRDT.
// Each peer has its own Y.Doc; updates flow between them.

import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import type { DrawElement } from '../../src/shared/types';

function wireDocs(docA: Y.Doc, docB: Y.Doc): void {
  docA.on('update', (update: Uint8Array) => {
    Y.applyUpdate(docB, update, 'remote');
  });
  docB.on('update', (update: Uint8Array) => {
    Y.applyUpdate(docA, update, 'remote');
  });
}

function getElements(doc: Y.Doc): DrawElement[] {
  const arr = doc.getArray('elements');
  return arr.toArray().map(m => (m as Y.Map<any>).toJSON() as DrawElement);
}

function commitElement(doc: Y.Doc, element: DrawElement): void {
  doc.transact(() => {
    const ymap = new Y.Map();
    for (const [key, value] of Object.entries(element)) {
      ymap.set(key, value);
    }
    doc.getArray('elements').push([ymap]);
  });
}

function undoLast(doc: Y.Doc): void {
  const arr = doc.getArray('elements');
  if (arr.length === 0) return;
  doc.transact(() => {
    arr.delete(arr.length - 1, 1);
  });
}

function clearAll(doc: Y.Doc): void {
  const arr = doc.getArray('elements');
  if (arr.length === 0) return;
  doc.transact(() => {
    arr.delete(0, arr.length);
  });
}

function makePath(id: string, tool: string, points: { x: number; y: number }[], color = '#ff0000'): DrawElement {
  return { id, type: 'path', tool: tool as any, color, strokeWidth: 3, opacity: 1, points, peerId: 'peer-a', timestamp: 1000 };
}

function makeRect(id: string, x: number, y: number, w: number, h: number, color = '#00ff00'): DrawElement {
  return { id, type: 'rect', tool: 'rect', color, strokeWidth: 3, opacity: 1, points: [], x, y, width: w, height: h, peerId: 'peer-a', timestamp: 1000 };
}

function makeCircle(id: string, cx: number, cy: number, r: number, color = '#0000ff'): DrawElement {
  return { id, type: 'circle', tool: 'circle', color, strokeWidth: 3, opacity: 1, points: [], x: cx - r, y: cy - r, width: r * 2, height: r * 2, peerId: 'peer-a', timestamp: 1000 };
}

function makeLine(id: string, x1: number, y1: number, x2: number, y2: number, color = '#ffff00'): DrawElement {
  return { id, type: 'line', tool: 'line', color, strokeWidth: 3, opacity: 1, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], peerId: 'peer-a', timestamp: 1000 };
}

function makeFill(id: string, points: { x: number; y: number }[], color = '#ff00ff'): DrawElement {
  return { id, type: 'fill', tool: 'fill', color, strokeWidth: 0, opacity: 1, points, peerId: 'peer-a', timestamp: 1000 };
}

describe('Yjs two-peer element sync', () => {
  let docA: Y.Doc;
  let docB: Y.Doc;

  beforeEach(() => {
    docA = new Y.Doc();
    docB = new Y.Doc();
    wireDocs(docA, docB);
  });

  it('freehand path drawn on peer A appears on peer B', () => {
    const path = makePath('p1', 'pencil', [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 10 },
    ]);

    commitElement(docA, path);

    const elementsB = getElements(docB);
    expect(elementsB.length).toBe(1);
    expect(elementsB[0].id).toBe('p1');
    expect(elementsB[0].type).toBe('path');
    expect(elementsB[0].points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 10 },
    ]);
  });

  it('shape tools (rect, circle, line) appear on both peers', () => {
    commitElement(docA, makeRect('r1', 10, 20, 100, 50, '#0f0'));
    commitElement(docA, makeCircle('c1', 200, 150, 60, '#00f'));
    commitElement(docA, makeLine('l1', 0, 0, 300, 200, '#ff0'));

    const elementsB = getElements(docB);
    expect(elementsB.length).toBe(3);

    // Rect
    expect(elementsB[0].type).toBe('rect');
    expect(elementsB[0].x).toBe(10);
    expect(elementsB[0].y).toBe(20);
    expect(elementsB[0].width).toBe(100);
    expect(elementsB[0].height).toBe(50);

    // Circle
    expect(elementsB[1].type).toBe('circle');
    expect(elementsB[1].x).toBe(140);
    expect(elementsB[1].y).toBe(90);
    expect(elementsB[1].width).toBe(120);

    // Line
    expect(elementsB[2].type).toBe('line');
    expect(elementsB[2].points[0]).toEqual({ x: 0, y: 0 });
    expect(elementsB[2].points[1]).toEqual({ x: 300, y: 200 });
  });

  it('undo removes element from both peers', () => {
    commitElement(docA, makePath('p1', 'pencil', [{ x: 0, y: 0 }, { x: 10, y: 10 }]));
    commitElement(docA, makePath('p2', 'brush', [{ x: 20, y: 20 }, { x: 30, y: 30 }]));

    expect(getElements(docA).length).toBe(2);
    expect(getElements(docB).length).toBe(2);

    undoLast(docA);

    expect(getElements(docA).length).toBe(1);
    expect(getElements(docA)[0].id).toBe('p1');

    expect(getElements(docB).length).toBe(1);
    expect(getElements(docB)[0].id).toBe('p1');
  });

  it('clear canvas empties both peers', () => {
    commitElement(docA, makeRect('r1', 0, 0, 10, 10));
    commitElement(docA, makePath('p1', 'pencil', [{ x: 0, y: 0 }, { x: 1, y: 1 }]));
    commitElement(docA, makeCircle('c1', 100, 100, 10));

    expect(getElements(docA).length).toBe(3);

    clearAll(docA);

    expect(getElements(docA).length).toBe(0);
    expect(getElements(docB).length).toBe(0);
  });

  it('fill polygon elements sync between peers', () => {
    const fill = makeFill('f1', [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 25, y: 50 },
    ], '#ff00ff');

    commitElement(docA, fill);

    const elementsB = getElements(docB);
    expect(elementsB.length).toBe(1);
    expect(elementsB[0].type).toBe('fill');
    expect(elementsB[0].color).toBe('#ff00ff');
    expect(elementsB[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 25, y: 50 },
    ]);
  });

  it('undo on empty array is no-op for both peers', () => {
    expect(() => undoLast(docA)).not.toThrow();
    expect(getElements(docA).length).toBe(0);
    expect(getElements(docB).length).toBe(0);
  });

  it('clear on empty array is no-op for both peers', () => {
    expect(() => clearAll(docA)).not.toThrow();
    expect(getElements(docA).length).toBe(0);
    expect(getElements(docB).length).toBe(0);
  });

  it('draw operations from peer B also sync to peer A', () => {
    commitElement(docB, makePath('pb1', 'brush', [{ x: 100, y: 100 }, { x: 200, y: 200 }], '#fff'));
    commitElement(docB, makeRect('rb1', 50, 50, 100, 100, '#0f0'));

    const elementsA = getElements(docA);
    expect(elementsA.length).toBe(2);
    expect(elementsA[0].id).toBe('pb1');
    expect(elementsA[0].type).toBe('path');
    expect(elementsA[1].id).toBe('rb1');
    expect(elementsA[1].type).toBe('rect');
  });

  it('interleaved operations from both peers converge', () => {
    // Peer A draws path
    commitElement(docA, makePath('a1', 'pencil', [{ x: 0, y: 0 }, { x: 10, y: 10 }]));
    // Peer B draws rect
    commitElement(docB, makeRect('b1', 20, 20, 40, 40));
    // Peer A draws circle
    commitElement(docA, makeCircle('a2', 60, 60, 20));

    const elementsA = getElements(docA);
    const elementsB = getElements(docB);

    expect(elementsA.length).toBe(3);
    expect(elementsB.length).toBe(3);

    // Both should have the same order (Yjs CRDT convergence)
    const idsA = elementsA.map(e => e.id);
    const idsB = elementsB.map(e => e.id);
    expect(idsA).toEqual(idsB);
  });
});