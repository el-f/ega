// @vitest-environment jsdom
import { retryButton, chipText } from '@tests/_helpers/page-translate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mountBilingual,
  mountInplace,
  appendDelta,
  finish,
  mountError,
  setGlobalOriginalView,
} from '@/content/page-translate-v2/renderer';

function block(tag: string, text: string): HTMLElement {
  document.body.innerHTML = `<${tag} id="orig">${text}</${tag}>`;
  const el = document.getElementById('orig');
  if (!el) throw new Error('orig missing');
  return el;
}

describe('renderer — bilingual mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('inserts a neutral sibling block after the original', () => {
    const original = block('article', '東京タワー');
    const handle = mountBilingual({ id: 'b-1', element: original, originalText: '東京タワー' });
    const sibling = original.nextElementSibling as HTMLElement;
    // Never a page-defined tag: cloning it can instantiate a live page component.
    expect(sibling.tagName).toBe('DIV');
    expect(sibling.hasAttribute('data-ega-tx')).toBe(true);
    expect(sibling.getAttribute('data-ega-id')).toBe('b-1');
    expect(original.textContent).toBe('東京タワー'); // original untouched
    expect(handle.target).toBe(sibling);
  });

  it.each(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'figcaption'])(
    'keeps the %s tag, so the translation keeps its meaning and its box',
    (tag) => {
      const original = block(tag, '東京タワー');
      mountBilingual({ id: `b-${tag}`, element: original, originalText: '東京タワー' });
      expect(original.nextElementSibling?.tagName).toBe(tag.toUpperCase());
    },
  );

  it.each(['td', 'th'])('puts the translation inside a %s, so the row keeps its cells', (tag) => {
    // A bare <td> is dropped by the HTML parser, so this one needs its table.
    document.body.innerHTML = `<table><tr><${tag} id="orig">東京タワー</${tag}></tr></table>`;
    const original = document.getElementById('orig') as HTMLElement;
    const handle = mountBilingual({
      id: `b-${tag}`,
      element: original,
      originalText: '東京タワー',
    });
    expect(original.nextElementSibling).toBeNull();
    expect(handle.target.parentElement).toBe(original);
    expect(handle.target.tagName).toBe('DIV');
  });

  it.each(['li', 'dd', 'dt'])(
    'puts the translation inside a %s, so the list keeps its items',
    (tag) => {
      const original = block(tag, '東京タワー');
      const handle = mountBilingual({
        id: `b-${tag}`,
        element: original,
        originalText: '東京タワー',
      });
      expect(handle.target.parentElement).toBe(original);
      expect(original.nextElementSibling).toBeNull();
    },
  );

  it('sets dir="auto" on the translated sibling but not the original', () => {
    // Translating into an RTL language needs dir="auto" on the sibling; the original keeps its own direction.
    const original = block('h2', '東京タワー');
    const handle = mountBilingual({ id: 'b-dir', element: original, originalText: '東京タワー' });
    expect(handle.target.getAttribute('dir')).toBe('auto');
    expect(original.getAttribute('dir')).toBeNull();
  });

  it('shows a streaming placeholder until the first real delta', () => {
    const original = block('p', 'これは段落です。');
    const handle = mountBilingual({
      id: 'b-2',
      element: original,
      originalText: 'これは段落です。',
    });
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('streaming');
    appendDelta(handle, '{"translation":"Tokyo');
    // envelope-only / partial JSON keeps the placeholder, no premature text
    appendDelta(handle, ' Tower"}');
    expect(handle.target.textContent).toContain('Tokyo Tower');
  });

  it('finish flips state to ok and renders the final translation', () => {
    const original = block('p', 'これは段落です。');
    const handle = mountBilingual({
      id: 'b-3',
      element: original,
      originalText: 'これは段落です。',
    });
    appendDelta(handle, '{"translation":"Final text."}');
    finish(handle);
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('ok');
    expect(handle.target.textContent).toContain('Final text.');
  });

  it('mountError flips state to error without dumping the raw error as text', () => {
    const original = block('p', 'これは段落です。');
    const handle = mountBilingual({
      id: 'b-4',
      element: original,
      originalText: 'これは段落です。',
    });
    mountError(handle, { code: 'TIMEOUT', message: 'too slow' });
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('error');
    // The raw transport error must NOT become the block's translation text.
    expect(handle.target.textContent).not.toContain('too slow');
    expect(handle.target.textContent).not.toContain('TIMEOUT');
    // …the chip names the cause from the catalog, with no hover-only title and never the bare code.
    const chip = handle.target.querySelector('[data-ega-tx-error]');
    expect(chip?.hasAttribute('title')).toBe(false);
    expect(chipText(handle.target)).toBe('No answer in time');
    // An alert mark leads the title; screen readers skip it and read the words.
    const mark = chip?.shadowRoot?.querySelector('.chip')?.firstElementChild;
    expect(mark?.tagName.toLowerCase()).toBe('svg');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    // Original stays intact above the failed sibling.
    expect(original.textContent).toBe('これは段落です。');
  });

  it('revert removes the inserted sibling and leaves the original intact', () => {
    const original = block('p', 'これは段落です。');
    const handle = mountBilingual({
      id: 'b-5',
      element: original,
      originalText: 'これは段落です。',
    });
    expect(original.nextElementSibling).not.toBeNull();
    handle.revert();
    expect(original.nextElementSibling).toBeNull();
    expect(original.textContent).toBe('これは段落です。');
  });
});

describe('renderer — mountError retry button', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a retry button when onRetry is provided', () => {
    document.body.innerHTML = '<p id="orig">これは段落です。</p>';
    const el = document.getElementById('orig') as HTMLElement;
    const handle = mountBilingual({ id: 'b-r1', element: el, originalText: 'これは段落です。' });
    const onRetry = vi.fn();
    mountError(handle, { code: 'TIMEOUT', message: 'too slow' }, { onRetry });
    const btn = retryButton(handle.target);
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Try again');
    // The button is described by the chip's title, so the cause is read with it.
    const title =
      btn?.getRootNode() instanceof ShadowRoot
        ? (btn.getRootNode() as ShadowRoot).getElementById(
            btn.getAttribute('aria-describedby') ?? '',
          )
        : null;
    expect(title?.textContent).toBe('No answer in time');
    (btn as HTMLButtonElement).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render a retry button when onRetry is absent', () => {
    document.body.innerHTML = '<p id="orig">これは段落です。</p>';
    const el = document.getElementById('orig') as HTMLElement;
    const handle = mountBilingual({ id: 'b-r2', element: el, originalText: 'これは段落です。' });
    mountError(handle, { code: 'TIMEOUT', message: 'too slow' });
    const btn = retryButton(handle.target);
    expect(btn).toBeNull();
  });
});

describe('renderer — in-place mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('replaces the original text with a streaming placeholder keyed by block id', () => {
    const original = block('p', 'これは段落です。');
    const handle = mountInplace({ id: 'b-6', element: original, originalText: 'これは段落です。' });
    const wrapper = document.querySelector('[data-ega-replaced="b-6"]');
    expect(wrapper).not.toBeNull();
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('streaming');
  });

  it('sets dir="auto" on the in-place replacement wrapper', () => {
    // The translation streams into this wrapper. dir="auto" makes an RTL
    // translation (Arabic/Hebrew) render with correct bidi.
    const original = block('p', 'これは段落です。');
    const handle = mountInplace({
      id: 'b-dir-ip',
      element: original,
      originalText: 'これは段落です。',
    });
    expect(handle.target.getAttribute('dir')).toBe('auto');
  });

  it('appendDelta + finish render the translation in place', () => {
    const original = block('p', 'これは段落です。');
    const handle = mountInplace({ id: 'b-7', element: original, originalText: 'これは段落です。' });
    appendDelta(handle, '{"translation":"Replaced."}');
    finish(handle);
    expect(handle.target.textContent).toContain('Replaced.');
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('ok');
  });

  it('revert restores the original content', () => {
    const original = block('p', 'これは元の段落です。');
    const handle = mountInplace({
      id: 'b-8',
      element: original,
      originalText: 'これは元の段落です。',
    });
    appendDelta(handle, '{"translation":"X"}');
    finish(handle);
    handle.revert();
    expect(document.body.textContent).toContain('これは元の段落です。');
    expect(document.querySelector('[data-ega-replaced="b-8"]')).toBeNull();
  });

  it('mountError restores the readable original in place — never the raw error', () => {
    const original = block('p', 'これは元の段落です。');
    const handle = mountInplace({
      id: 'b-err',
      element: original,
      originalText: 'これは元の段落です。',
    });
    appendDelta(handle, '{"translation":"partial');
    mountError(
      handle,
      { code: 'RATE_LIMIT', message: 'gemini: RATE_LIMIT' },
      { onRetry: () => {} },
    );
    expect(handle.target.getAttribute('data-ega-tx-state')).toBe('error');
    // Reader sees the original, not "RATE_LIMIT: gemini: RATE_LIMIT".
    expect(handle.target.textContent).toContain('これは元の段落です。');
    expect(handle.target.textContent).not.toContain('RATE_LIMIT');
    expect(retryButton(handle.target)).not.toBeNull();
    // In-place too: the chip names the cause in the catalog's words.
    expect(chipText(handle.target)).toContain('Too many requests');
  });

  it('revert is idempotent — a second call does not double-insert the original', () => {
    const original = block('p', '元の段落テキスト');
    const handle = mountInplace({ id: 'b-9', element: original, originalText: '元の段落テキスト' });
    appendDelta(handle, '{"translation":"X"}');
    finish(handle);
    handle.revert();
    handle.revert();
    // The original appears exactly once — cloneNode would have re-inserted it.
    const count = document.body.textContent.split('元の段落テキスト').length - 1;
    expect(count).toBe(1);
  });
});

describe('renderer — no hover-original pop in bilingual mode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('hovering the sibling never appends the original text (it is already on the page)', () => {
    const original = block('p', 'これは元の文です。');
    const handle = mountBilingual({
      id: 'bh-1',
      element: original,
      originalText: 'これは元の文です。',
    });
    appendDelta(handle, '{"translation":"Translated."}');
    finish(handle);
    handle.target.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(handle.target.textContent).toBe('Translated.');
  });
});

describe('renderer — pill view toggle (showOriginal / showTranslation)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('bilingual: showOriginal hides the inserted sibling, showTranslation brings it back', () => {
    const original = block('p', 'これは元の文です。');
    const handle = mountBilingual({
      id: 'vt-1',
      element: original,
      originalText: 'これは元の文です。',
    });
    appendDelta(handle, '{"translation":"Translated."}');
    finish(handle);
    handle.showOriginal();
    expect(handle.target.style.display).toBe('none');
    expect(original.isConnected).toBe(true);
    handle.showTranslation();
    expect(handle.target.style.display).toBe('');
    expect(handle.target.textContent).toBe('Translated.');
  });

  it('inplace: showOriginal swaps the wrapper text to the original, showTranslation restores', () => {
    const original = block('p', 'これは元の段落です。');
    const handle = mountInplace({
      id: 'vt-2',
      element: original,
      originalText: 'これは元の段落です。',
    });
    appendDelta(handle, '{"translation":"Replaced."}');
    finish(handle);
    handle.showOriginal();
    expect(handle.target.textContent).toBe('これは元の段落です。');
    handle.showTranslation();
    expect(handle.target.textContent).toBe('Replaced.');
  });

  it('inplace: showOriginal no-ops on an errored wrapper (chip stays intact)', () => {
    const original = block('p', 'これは元の段落です。');
    const handle = mountInplace({
      id: 'vt-3',
      element: original,
      originalText: 'これは元の段落です。',
    });
    mountError(handle, { code: 'NETWORK', message: 'x' }, { onRetry: () => {} });
    handle.showOriginal();
    expect(handle.target.querySelector('[data-ega-tx-error]')).not.toBeNull();
    expect(retryButton(handle.target)).not.toBeNull();
    expect(handle.target.textContent).toContain('これは元の段落です。');
  });
});

describe('renderer — hover-original affordance (inplace)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mousedown on wrapper shows original text; mouseup restores translation', () => {
    const original = block('p', 'これは元の段落テキスト。');
    const handle = mountInplace({
      id: 'ip-1',
      element: original,
      originalText: 'これは元の段落テキスト。',
    });
    appendDelta(handle, '{"translation":"Translation text."}');
    finish(handle);
    expect(handle.target.textContent).toContain('Translation text.');
    handle.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handle.target.textContent).toBe('これは元の段落テキスト。');
    handle.target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(handle.target.textContent).toContain('Translation text.');
  });

  it('restores the translation when the pointer leaves before the button is released', () => {
    const original = block('p', 'これは元の段落テキスト。');
    const handle = mountInplace({
      id: 'ip-2',
      element: original,
      originalText: 'これは元の段落テキスト。',
    });
    appendDelta(handle, '{"translation":"Translation text."}');
    finish(handle);

    // Drag-select past the last line: mouseup lands on another element, so only mouseleave fires.
    handle.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    handle.target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(handle.target.textContent).toContain('Translation text.');
  });

  it('a second peek after the pointer left still shows the original, not a stale copy', () => {
    const original = block('p', 'これは元の段落テキスト。');
    const handle = mountInplace({
      id: 'ip-3',
      element: original,
      originalText: 'これは元の段落テキスト。',
    });
    appendDelta(handle, '{"translation":"Translation text."}');
    finish(handle);

    handle.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    handle.target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    handle.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handle.target.textContent).toBe('これは元の段落テキスト。');
    handle.target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(handle.target.textContent).toContain('Translation text.');
  });
});

describe('renderer — global original view suspends per-wrapper peek (inplace)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setGlobalOriginalView(false);
  });

  afterEach(() => {
    setGlobalOriginalView(false);
  });

  it('mouse events cannot flip a block back while the global view shows originals', () => {
    const original = block('p', 'これは元の段落テキスト。');
    const handle = mountInplace({
      id: 'go-1',
      element: original,
      originalText: 'これは元の段落テキスト。',
    });
    appendDelta(handle, '{"translation":"Translation text."}');
    finish(handle);

    setGlobalOriginalView(true);
    handle.showOriginal();
    expect(handle.target.textContent).toBe('これは元の段落テキスト。');

    // The cursor passing over the wrapper must not restore the translation block-by-block.
    handle.target.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    handle.target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    handle.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handle.target.textContent).toBe('これは元の段落テキスト。');

    // The pill's own toggle still works.
    handle.showTranslation();
    expect(handle.target.textContent).toContain('Translation text.');
  });

  it('peek works again once the global view is back on translations', () => {
    const original = block('p', 'これは元の段落テキスト。');
    const handle = mountInplace({
      id: 'go-2',
      element: original,
      originalText: 'これは元の段落テキスト。',
    });
    appendDelta(handle, '{"translation":"Translation text."}');
    finish(handle);

    setGlobalOriginalView(true);
    handle.showOriginal();
    handle.showTranslation();
    setGlobalOriginalView(false);

    handle.target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(handle.target.textContent).toBe('これは元の段落テキスト。');
    handle.target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(handle.target.textContent).toContain('Translation text.');
  });
});

describe('renderer — one pending look in both modes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('Replace text keeps the original readable, dimmed, until the first words land', () => {
    document.body.innerHTML = '<p id="o">これは<b>元の</b>段落です。</p>';
    const el = document.getElementById('o') as HTMLElement;
    const handle = mountInplace({ id: 'pend-1', element: el, originalText: el.textContent });
    expect(handle.target.hasAttribute('data-ega-pending')).toBe(true);
    expect(handle.target.textContent).toBe('これは元の段落です。');
    expect(handle.target.querySelector('b')).not.toBeNull();
    appendDelta(handle, '{"translation":"');
    expect(handle.target.hasAttribute('data-ega-pending')).toBe(true);
    appendDelta(handle, 'This is');
    expect(handle.target.hasAttribute('data-ega-pending')).toBe(false);
    expect(handle.target.textContent).toBe('This is');
  });

  it('Show both starts with an empty, pending sibling and sizes a heading translation at 85%', () => {
    document.body.innerHTML = '<h2 id="h" style="font-size: 20px">見出し</h2>';
    const el = document.getElementById('h') as HTMLElement;
    const handle = mountBilingual({ id: 'pend-2', element: el, originalText: '見出し' });
    expect(handle.target.hasAttribute('data-ega-pending')).toBe(true);
    expect(handle.target.textContent).toBe('');
    expect(handle.target.style.fontSize).toBe('17px');
    finish(handle);
    expect(handle.target.hasAttribute('data-ega-pending')).toBe(false);
  });
});

describe('renderer — the chip offers the fix the catalog names first', () => {
  it('a failure a setting fixes offers Open settings, never a retry that would fail the same way', async () => {
    document.body.innerHTML = '<p id="o">これは段落です。</p>';
    const el = document.getElementById('o') as HTMLElement;
    const handle = mountBilingual({ id: 'fix-1', element: el, originalText: 'これは段落です。' });
    const send = vi.spyOn(chrome.runtime, 'sendMessage').mockResolvedValue(undefined);
    mountError(handle, { code: 'AUTH', message: '401 bad key' }, { onRetry: vi.fn() });
    expect(chipText(handle.target)).toBe('API key rejectedOpen settings');
    expect(retryButton(handle.target)).toBeNull();
    const btn = handle.target
      .querySelector('[data-ega-tx-error]')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-ega-chip-settings]');
    btn?.click();
    expect(send).toHaveBeenCalledWith({ kind: 'ui:open-options', tab: 'backends' });
  });
});
