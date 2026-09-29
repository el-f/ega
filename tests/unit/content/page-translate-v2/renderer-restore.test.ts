// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mountBilingual,
  mountInplace,
  appendDelta,
  finish,
  mountError,
} from '@/content/page-translate-v2/renderer';

function host(html: string): HTMLElement {
  document.body.innerHTML = html;
  const el = document.getElementById('orig');
  if (!el) throw new Error('orig missing');
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderer — the bilingual sibling is never a page component', () => {
  it('a custom element gets a plain neutral container, not a clone of its tag', () => {
    const original = host('<ytd-comment id="orig" style="display:block">こんにちは</ytd-comment>');
    const handle = mountBilingual({ id: 'nt-1', element: original, originalText: 'こんにちは' });
    expect(handle.target.tagName).toBe('DIV');
    expect(original.nextElementSibling).toBe(handle.target);
  });

  it('an inline source gets an inline container', () => {
    const original = host('<span id="orig">こんにちは</span>');
    const handle = mountBilingual({ id: 'nt-2', element: original, originalText: 'こんにちは' });
    expect(handle.target.tagName).toBe('SPAN');
  });

  it('a layout-bound child keeps its tag, or the row would break', () => {
    document.body.innerHTML = '<table><tbody><tr><td id="orig">ciao</td></tr></tbody></table>';
    const original = document.getElementById('orig') as HTMLElement;
    const handle = mountBilingual({ id: 'nt-3', element: original, originalText: 'ciao' });
    expect(handle.target.tagName).toBe('TD');
  });
});

describe('renderer — in-place revert cannot duplicate content', () => {
  it('skips the fragment append when the page re-populated the block mid-flight', () => {
    const original = host('<p id="orig">元の段落テキスト</p>');
    const handle = mountInplace({
      id: 'dup-1',
      element: original,
      originalText: '元の段落テキスト',
    });
    appendDelta(handle, '{"translation":"X"}');
    finish(handle);
    // A framework re-render puts its own node back next to our wrapper.
    original.appendChild(document.createTextNode('framework wrote this'));

    handle.revert();
    expect(original.textContent).toBe('framework wrote this');
    expect(document.querySelector('[data-ega-replaced="dup-1"]')).toBeNull();
  });

  it('still restores the original when the wrapper is the only child', () => {
    const original = host('<p id="orig">元の段落テキスト</p>');
    const handle = mountInplace({
      id: 'dup-2',
      element: original,
      originalText: '元の段落テキスト',
    });
    handle.revert();
    expect(original.textContent).toBe('元の段落テキスト');
  });
});

describe('renderer — the saved markup comes back, not flattened text', () => {
  const rich = '<p id="orig">read <a href="https://x.test" id="link">the docs</a> now</p>';

  it('showOriginal restores the links inside the block', () => {
    const original = host(rich);
    const handle = mountInplace({
      id: 'rt-1',
      element: original,
      originalText: 'read the docs now',
    });
    appendDelta(handle, '{"translation":"Translated."}');
    finish(handle);

    handle.showOriginal();
    expect(handle.target.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
    handle.showTranslation();
    expect(handle.target.textContent).toBe('Translated.');
    // A second peek still finds the markup — the first one must not have drained the saved copy.
    handle.showOriginal();
    expect(handle.target.querySelector('a')).not.toBeNull();
  });

  it('mountError restores the links instead of a flat copy', () => {
    const original = host(rich);
    const handle = mountInplace({
      id: 'rt-2',
      element: original,
      originalText: 'read the docs now',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'slow' }, { onRetry: () => {} });
    expect(handle.target.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
    expect(handle.target.querySelector('[data-ega-retry-block]')).not.toBeNull();
  });

  it('revert after a failed block still puts the page back exactly once', () => {
    const original = host(rich);
    const handle = mountInplace({
      id: 'rt-3',
      element: original,
      originalText: 'read the docs now',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'slow' });
    handle.revert();
    expect(original.querySelectorAll('a')).toHaveLength(1);
    expect(original.textContent).toBe('read the docs now');
  });

  it('a bilingual failure still leaves the original untouched above it', () => {
    const original = host(rich);
    const handle = mountBilingual({
      id: 'rt-4',
      element: original,
      originalText: 'read the docs now',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'slow' });
    expect(original.querySelector('a')).not.toBeNull();
    expect(handle.target.textContent).not.toContain('read the docs');
  });
});
