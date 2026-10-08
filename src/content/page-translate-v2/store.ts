export type RenderMode = 'bilingual' | 'inplace';

export interface BlockEntry {
  id: string;
  element: Element;
  mode: RenderMode;
  text: string;
  /** Language detected at segmentation. Carried so an auto-retry re-dispatches
   *  with the same hint instead of forcing the router back to auto-detect. */
  detectedLang?: string;
  /** Whole page: only the element's leading run, so a retry mounts the run again, not the whole element. */
  run?: boolean;
  requestId?: string;
  /** Restores this block's original DOM; set by the renderer on mount. */
  revert?: () => void;
  /** Renderer-supplied view toggle used by the settled pill's Show original / Show translation. */
  showOriginal?: () => void;
  showTranslation?: () => void;
}

/** Block identity, render mode and the request-to-block map the chunk router needs; no DOM I/O of its own. */
export class PageStore {
  private byId = new Map<string, BlockEntry>();
  private requestToBlock = new Map<string, string>();

  set(entry: BlockEntry): void {
    this.byId.set(entry.id, entry);
    if (entry.requestId) this.requestToBlock.set(entry.requestId, entry.id);
  }

  get(id: string): BlockEntry | undefined {
    return this.byId.get(id);
  }

  /** Attach a router requestId to a block; rebinding drops the prior key so
   *  a retry's old in-flight id can't route to a stale block. */
  bindRequest(blockId: string, requestId: string): void {
    const entry = this.byId.get(blockId);
    if (!entry) return;
    if (entry.requestId) this.requestToBlock.delete(entry.requestId);
    entry.requestId = requestId;
    this.requestToBlock.set(requestId, blockId);
  }

  /** Drops a block's requestId mapping. Call it before a retry re-set, or the old id leaks and a late chunk still routes. */
  unbindRequest(blockId: string): void {
    const entry = this.byId.get(blockId);
    if (!entry?.requestId) return;
    this.requestToBlock.delete(entry.requestId);
    delete entry.requestId;
  }

  /** Forgets a block and its request mapping, so a late chunk for it routes nowhere. */
  delete(id: string): void {
    this.unbindRequest(id);
    this.byId.delete(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  blockIdForRequest(requestId: string): string | undefined {
    return this.requestToBlock.get(requestId);
  }

  forEach(fn: (entry: BlockEntry) => void): void {
    for (const entry of this.byId.values()) fn(entry);
  }

  get size(): number {
    return this.byId.size;
  }

  clear(): void {
    this.byId.clear();
    this.requestToBlock.clear();
  }

  revertAll(): void {
    for (const entry of this.byId.values()) {
      try {
        entry.revert?.();
      } catch {
        /* a single block's revert must not block the rest */
      }
    }
    this.clear();
  }
}
