// @vitest-environment jsdom
import { retryButton } from '@tests/_helpers/page-translate';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mountInplace,
  mountBilingual,
  appendDelta,
  finish,
  mountError,
} from '@/content/page-translate-v2/renderer';

// One phase per block, read by the peek handlers and by render(): a settled wrapper is never repainted.

const rich = '<p id="orig">read <a href="https://x.test" id="link">the docs</a> now</p>';

function host(html: string): HTMLElement {
  document.body.innerHTML = html;
  const el = document.getElementById('orig');
  if (!el) throw new Error('orig missing');
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderer — the block phase', () => {
  it('starts streaming, settles to ok on finish, and mirrors onto the state attribute', () => {
    const handle = mountInplace({
      id: 'ph-1',
      element: host(rich),
      originalText: 'read the docs now',
    });
    expect(handle.phase).toBe('streaming');
    appendDelta(handle, 'Translated.');
    finish(handle);
    expect(handle.phase).toBe('ok');
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('ok');
  });

  // Press-and-hold peek is a mouse extra; Show original on the pill is the documented path, so no hover-only hint.
  it('a settled in-place block carries no title', () => {
    const handle = mountInplace({ id: 'ph-h', element: host(rich), originalText: 'x' });
    finish(handle);
    expect(handle.target.hasAttribute('title')).toBe(false);
  });

  it('settles to error on mountError', () => {
    const handle = mountBilingual({
      id: 'ph-2',
      element: host(rich),
      originalText: 'read the docs now',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'slow' });
    expect(handle.phase).toBe('error');
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('error');
  });

  it('a late delta after finish does not wipe the peeked original', () => {
    const handle = mountInplace({
      id: 'ph-3',
      element: host(rich),
      originalText: 'read the docs now',
    });
    appendDelta(handle, 'Translated.');
    finish(handle);
    handle.showOriginal();
    expect(handle.target.querySelector('a')).not.toBeNull();

    appendDelta(handle, 'Translated. More.');

    expect(handle.target.querySelector('a')).not.toBeNull();
    expect(handle.phase).toBe('ok');
  });

  it('a late delta or done after an error keeps the chip and the retry button', () => {
    const handle = mountInplace({
      id: 'ph-4',
      element: host(rich),
      originalText: 'read the docs now',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'slow' }, { onRetry: () => {} });

    appendDelta(handle, 'late');
    finish(handle);

    expect(handle.phase).toBe('error');
    expect(handle.target.querySelector('[data-ega-tx-error]')).not.toBeNull();
    expect(retryButton(handle.target)).not.toBeNull();
    expect(handle.target.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
  });

  it('a peek before the block settles is a no-op', () => {
    const handle = mountInplace({
      id: 'ph-5',
      element: host(rich),
      originalText: 'read the docs now',
    });
    appendDelta(handle, 'Trans');
    handle.showOriginal();
    expect(handle.target.querySelector('a')).toBeNull();
    expect(handle.target.textContent).toBe('Trans');
  });

  // The host's children live in the fragment, and a node the page adds lands in the host, beside the wrapper.
  it('streaming writes touch only the wrapper; a node the page adds to the host survives', () => {
    const original = host(rich);
    const handle = mountInplace({
      id: 'ph-6',
      element: original,
      originalText: 'read the docs now',
    });
    const pageNode = document.createTextNode('framework wrote this');
    original.appendChild(pageNode);

    appendDelta(handle, 'Translated.');
    finish(handle);

    expect(pageNode.parentNode).toBe(original);
    expect(handle.target.textContent).toBe('Translated.');
    expect(handle.originalNodes?.querySelector('a')).not.toBeNull();
  });
});
