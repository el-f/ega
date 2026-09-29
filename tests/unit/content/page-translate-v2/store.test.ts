// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { PageStore } from '@/content/page-translate-v2/store';

function el(): HTMLElement {
  return document.createElement('p');
}

describe('PageStore', () => {
  let store: PageStore;
  beforeEach(() => {
    store = new PageStore();
  });

  it('set/get a block entry by id', () => {
    const element = el();
    store.set({ id: 'b-1', element, mode: 'bilingual', text: 'src' });
    const got = store.get('b-1');
    expect(got?.element).toBe(element);
    expect(got?.mode).toBe('bilingual');
  });

  it('indexes by requestId once dispatched', () => {
    store.set({ id: 'b-1', element: el(), mode: 'bilingual', text: 'src' });
    store.bindRequest('b-1', 'req-9');
    expect(store.blockIdForRequest('req-9')).toBe('b-1');
    expect(store.get('b-1')?.requestId).toBe('req-9');
  });

  it('rebinding a block updates the request index and drops the old key', () => {
    store.set({ id: 'b-1', element: el(), mode: 'bilingual', text: 'src' });
    store.bindRequest('b-1', 'req-1');
    store.bindRequest('b-1', 'req-2');
    expect(store.blockIdForRequest('req-1')).toBeUndefined();
    expect(store.blockIdForRequest('req-2')).toBe('b-1');
  });

  it('unbindRequest drops the request index key so an old id no longer routes', () => {
    store.set({ id: 'b-1', element: el(), mode: 'bilingual', text: 'src' });
    store.bindRequest('b-1', 'req-1');
    store.unbindRequest('b-1');
    expect(store.blockIdForRequest('req-1')).toBeUndefined();
    expect(store.get('b-1')?.requestId).toBeUndefined();
  });

  it('re-set + bindRequest (the retry path) leaves exactly one live mapping when the old id is unbound first', () => {
    // A retry re-sets the entry; unbind the old id first or its mapping leaks.
    const element = el();
    store.set({ id: 'b-1', element, mode: 'bilingual', text: 'src' });
    store.bindRequest('b-1', 'req-old');

    store.unbindRequest('b-1');
    store.set({ id: 'b-1', element, mode: 'bilingual', text: 'src' });
    store.bindRequest('b-1', 'req-new');

    expect(store.blockIdForRequest('req-old')).toBeUndefined();
    expect(store.blockIdForRequest('req-new')).toBe('b-1');
  });

  it('forEach visits every entry', () => {
    store.set({ id: 'b-1', element: el(), mode: 'bilingual', text: 'a' });
    store.set({ id: 'b-2', element: el(), mode: 'inplace', text: 'b' });
    const ids: string[] = [];
    store.forEach((e) => ids.push(e.id));
    expect(ids.sort()).toEqual(['b-1', 'b-2']);
  });

  it('clear empties both indexes', () => {
    store.set({ id: 'b-1', element: el(), mode: 'bilingual', text: 'a' });
    store.bindRequest('b-1', 'req-1');
    store.clear();
    expect(store.get('b-1')).toBeUndefined();
    expect(store.blockIdForRequest('req-1')).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it('revertAll runs each entry revert callback then clears', () => {
    let reverted = 0;
    store.set({ id: 'b-1', element: el(), mode: 'bilingual', text: 'a', revert: () => reverted++ });
    store.set({ id: 'b-2', element: el(), mode: 'inplace', text: 'b', revert: () => reverted++ });
    store.revertAll();
    expect(reverted).toBe(2);
    expect(store.size).toBe(0);
  });

  it('revertAll survives a throwing revert callback', () => {
    let reverted = 0;
    store.set({
      id: 'b-1',
      element: el(),
      mode: 'bilingual',
      text: 'a',
      revert: () => {
        throw new Error('boom');
      },
    });
    store.set({ id: 'b-2', element: el(), mode: 'inplace', text: 'b', revert: () => reverted++ });
    expect(() => store.revertAll()).not.toThrow();
    expect(reverted).toBe(1);
    expect(store.size).toBe(0);
  });
});
