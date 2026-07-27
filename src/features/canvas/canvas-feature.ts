// CanvasFeature — implements CollaborationFeature for the shell
// Owns Yjs draw element state, delegates send/receive to FeatureContext

import * as Y from 'yjs';
import type { CollaborationFeature, FeatureContext, DrawElement } from '../../shared/types';

export class CanvasFeature implements CollaborationFeature {
  private ydoc: Y.Doc | null = null;
  private elementsArray: Y.Array<Y.Map<any>> | null = null;
  private ctx: FeatureContext | null = null;

  // Callbacks
  onElementsChanged?: (elements: DrawElement[]) => void;

  start(ctx: FeatureContext): void {
    this.ctx = ctx;
    this.ydoc = new Y.Doc();
    this.elementsArray = this.ydoc.getArray('elements');

    // Broadcast local Yjs deltas via FeatureContext
    this.ydoc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== 'remote') {
        console.log(`[canvas] sending yjs update: ${update.length} bytes`);
        ctx.sendFeatureData(update);
      }
    });

    // Notify renderer on every array change
    this.elementsArray.observe(() => {
      this.onElementsChanged?.(this.getElementsSnapshot());
    });
  }

  onConnected(): void {}

  onDisconnected(): void {}

  onPeerJoined(peerId: string): void {
    if (!this.ctx?.isHost() || !this.ydoc) return;
    const fullState = Y.encodeStateAsUpdate(this.ydoc);
    this.ctx.sendFeatureDataToPeer(peerId, fullState);
  }

  handleFeatureData(data: Uint8Array, _peerId?: string): void {
    if (!this.ydoc) return;
    try {
      Y.applyUpdate(this.ydoc, data, 'remote');
    } catch (e) { console.error('[canvas] yjs applyUpdate failed:', e); }
  }

  getElementsSnapshot(): DrawElement[] {
    return this.elementsArray?.toArray().map(m => m.toJSON() as DrawElement) ?? [];
  }

  commitElement(element: DrawElement): void {
    if (!this.ydoc || !this.elementsArray) return;
    this.ydoc.transact(() => {
      const ymap = new Y.Map();
      for (const [key, value] of Object.entries(element)) {
        ymap.set(key, value);
      }
      this.elementsArray!.push([ymap]);
    });
  }

  undoLastElement(): void {
    if (!this.ydoc || !this.elementsArray || this.elementsArray.length === 0) return;
    this.ydoc.transact(() => {
      this.elementsArray!.delete(this.elementsArray!.length - 1, 1);
    });
  }

  clearElements(): void {
    if (!this.ydoc || !this.elementsArray || this.elementsArray.length === 0) return;
    this.ydoc.transact(() => {
      this.elementsArray!.delete(0, this.elementsArray!.length);
    });
  }

  get doc(): Y.Doc | null { return this.ydoc; }

  destroy(): void {
    this.ydoc?.destroy();
    this.ydoc = null;
    this.elementsArray = null;
    this.ctx = null;
  }
}