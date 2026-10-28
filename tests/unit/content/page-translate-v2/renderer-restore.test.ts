// @vitest-environment jsdom
import { retryButton } from '@tests/_helpers/page-translate';
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

  it('a cell keeps the translation inside it, or the row would gain a cell', () => {
    document.body.innerHTML = '<table><tbody><tr><td id="orig">ciao</td></tr></tbody></table>';
    const original = document.getElementById('orig') as HTMLElement;
    const handle = mountBilingual({ id: 'nt-3', element: original, originalText: 'ciao' });
    expect(handle.target.parentElement).toBe(original);
    expect(original.parentElement?.children).toHaveLength(1);
    handle.revert();
    expect(original.querySelector('[data-ega-tx]')).toBeNull();
  });
});

describe('renderer — Replace text keeps the page nodes where they are', () => {
  it('a framework can still remove or insert next to its nodes after the block is translated', () => {
    const original = host('<p id="orig">Hallo <b>Welt</b> heute</p>');
    const [own, bold] = [...original.childNodes];
    const handle = mountInplace({ id: 'k11-1', element: original, originalText: 'Hallo Welt heute' });
    finish(handle, 'Hello world today');
    expect(own?.parentNode).toBe(original);
    expect(bold?.parentNode).toBe(original);
    expect(() => original.insertBefore(document.createTextNode('new '), own ?? null)).not.toThrow();
    expect(() => own && original.removeChild(own)).not.toThrow();
    expect(handle.target.textContent).toBe('Hello world today');
  });

  it('hides the page nodes while the translation shows, and shows them again on revert', () => {
    const original = host('<p id="orig">Hallo <b>Welt</b> heute</p>');
    const bold = original.querySelector('b');
    const handle = mountInplace({ id: 'k11-2', element: original, originalText: 'Hallo Welt heute' });
    finish(handle, 'Hello world today');
    expect(bold?.hasAttribute('data-ega-hidden')).toBe(true);
    expect(original.firstChild?.textContent).toBe('');
    handle.revert();
    expect(original.innerHTML).toBe('Hallo <b>Welt</b> heute');
    expect(original.querySelector('b')).toBe(bold);
  });

  it('a text node the page rewrote while translated keeps its newer words on revert', () => {
    const original = host('<p id="orig">Alt</p>');
    const own = original.firstChild as Text;
    const handle = mountInplace({ id: 'k11-3', element: original, originalText: 'Alt' });
    finish(handle, 'Old');
    own.data = 'Neu';
    handle.revert();
    expect(original.textContent).toBe('Neu');
  });
});

describe('renderer — in-place revert cannot duplicate content', () => {
  it('keeps a child the page added to the block, and puts the block words back', () => {
    const original = host('<p id="orig">Guten Morgen allerseits</p>');
    const handle = mountInplace({
      id: 'dup-1',
      element: original,
      originalText: 'Guten Morgen allerseits',
    });
    finish(handle, 'Good morning everyone');
    const badge = document.createElement('span');
    badge.textContent = ' (edited)';
    original.append(badge);

    handle.revert();
    expect(original.textContent).toBe('Guten Morgen allerseits (edited)');
    expect(document.querySelector('[data-ega-replaced="dup-1"]')).toBeNull();
  });

  it('a page that replaced its own nodes mid-flight shows only its new words after revert', () => {
    const original = host('<p id="orig">元の段落テキスト</p>');
    const handle = mountInplace({
      id: 'dup-3',
      element: original,
      originalText: '元の段落テキスト',
    });
    appendDelta(handle, 'X');
    finish(handle);
    // A framework re-render drops its old node and writes a new one next to the wrapper.
    const own = original.firstChild;
    if (own) original.removeChild(own);
    original.prepend(document.createTextNode('framework wrote this'));

    handle.revert();
    expect(original.textContent).toBe('framework wrote this');
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
    appendDelta(handle, 'Translated.');
    finish(handle);

    handle.showOriginal();
    expect(handle.target.querySelector('a')?.getAttribute('href')).toBe('https://x.test');
    handle.showTranslation();
    expect(handle.target.textContent).toBe('Translated.');
    // A second peek still finds the markup — the first one must not have drained the saved copy.
    handle.showOriginal();
    expect(handle.target.querySelector('a')).not.toBeNull();
  });

  it('mountError shows the page words again, links and all, with the chip after them', () => {
    const original = host(rich);
    const link = original.querySelector('a');
    const handle = mountInplace({
      id: 'rt-2',
      element: original,
      originalText: 'read the docs now',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'slow' }, { onRetry: () => {} });
    expect(original.querySelector('a')).toBe(link);
    expect(link?.hasAttribute('data-ega-hidden')).toBe(false);
    expect(original.firstChild?.textContent).toBe('read ');
    expect(handle.target.textContent).toBe('');
    expect(retryButton(handle.target)).not.toBeNull();
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
