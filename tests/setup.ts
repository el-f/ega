import 'fake-indexeddb/auto';
import { vi, beforeEach } from 'vitest';
import { chromeMock, resetChromeMock } from './mocks/chrome';
import { installFetchMock, clearFetchHandler } from './mocks/fetch';
import { resetOpenRouterReasoningForTest } from '@/shared/backends/openrouter-reasoning';
import { resetOllamaModelCapsForTest } from '@/shared/backends/ollama-show';

vi.mock('@/content/shadow.css?inline', () => ({ default: '' }));

// @ts-expect-error — inject chrome.* into globalThis for modules under test
globalThis.chrome = chromeMock;

installFetchMock();

// node's globalThis has no EventTarget methods and background/index.ts calls self.addEventListener at import.
if ((globalThis as { self?: unknown }).self === undefined) {
  const bus = new EventTarget();
  for (const m of ['addEventListener', 'removeEventListener', 'dispatchEvent'] as const) {
    if (typeof (globalThis as Record<string, unknown>)[m] !== 'function') {
      (globalThis as Record<string, unknown>)[m] = bus[m].bind(bus);
    }
  }
  (globalThis as { self?: unknown }).self = globalThis;
}

// jsdom has no matchMedia; svelte-sonner's Toaster reads it for the color scheme.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
    writable: true,
  });
}

// jsdom has no ResizeObserver; Bits UI Command creates one.
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
    StubResizeObserver;
}

// jsdom has no scrollIntoView (the TS types claim it does); Bits UI Command calls it on keyboard nav.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// jsdom has no element.animate; Svelte's transition:slide calls it even at duration 0.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function (this: Element, _keyframes, _options) {
    const anim = {
      onfinish: null as null | (() => void),
      oncancel: null as null | (() => void),
      cancel(): void {},
      finish(): void {
        this.onfinish?.();
      },
    };
    queueMicrotask(() => anim.onfinish?.());
    return anim as unknown as Animation;
  };
}

if (!('clipboard' in navigator)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    writable: true,
  });
}

// jsdom's Range lacks getBoundingClientRect — polyfill with a zero rect.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function () {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  Range.prototype.getClientRects = function () {
    return {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    } as unknown as DOMRectList;
  };
}

beforeEach(() => {
  resetChromeMock();
  clearFetchHandler();
  // Both keep a model lookup in module memory, which would carry one test's fetch answer into the next.
  resetOpenRouterReasoningForTest();
  resetOllamaModelCapsForTest();
});
