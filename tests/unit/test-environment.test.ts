import { describe, expect, it } from 'vitest';

// jsdom comes only from a line-1 pragma; a node file must not see a document a jsdom file left in its worker.
describe('the default test environment', () => {
  it('has no DOM globals, whatever ran in this worker before it', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(typeof localStorage).toBe('undefined');
  });

  it('carries the self alias the service worker registers its listeners on', () => {
    expect(self).toBe(globalThis);
    expect(typeof self.addEventListener).toBe('function');
    expect(typeof self.removeEventListener).toBe('function');
    expect(typeof self.dispatchEvent).toBe('function');
  });
});
