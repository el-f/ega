// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSelectionInfo, isEditableRange } from '@/content/selection';

function selectIn(node: Node, start: number, end: number): void {
  const r = document.createRange();
  r.setStart(node, start);
  r.setEnd(node, end);
  const sel = window.getSelection();
  if (!sel) throw new Error('no selection API');
  sel.removeAllRanges();
  sel.addRange(r);
}

function textNode(id: string): Node {
  const el = document.getElementById(id);
  const first = el?.firstChild;
  if (!first) throw new Error(`fixture #${id} missing`);
  return first;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('cross-block context traversal', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<h2 id="head">Chapter One</h2>' +
      '<p id="p1">First paragraph text.</p>' +
      '<p id="p2">Second paragraph starts here.</p>' +
      '<p id="p3">Third paragraph after.</p>';
  });

  it('a selection at block start pulls beforeText from the previous blocks', () => {
    selectIn(textNode('p2'), 0, 6);
    const info = getSelectionInfo();
    expect(info?.text).toBe('Second');
    expect(info?.beforeText).toBe('Chapter One\nFirst paragraph text.');
  });

  it('a selection at block end pulls afterText from the next block', () => {
    const p2 = textNode('p2');
    const len = (p2.textContent ?? '').length;
    selectIn(p2, 7, len);
    const info = getSelectionInfo();
    expect(info?.afterText).toBe('Third paragraph after.');
  });

  it('mid-block selection keeps the same-block slices on both sides', () => {
    selectIn(textNode('p2'), 7, 16);
    const info = getSelectionInfo();
    expect(info?.text).toBe('paragraph');
    expect(info?.beforeText.endsWith('Second ')).toBe(true);
    expect(info?.beforeText.startsWith('Chapter One\n')).toBe(true);
    expect(info?.afterText.startsWith(' starts here.')).toBe(true);
  });

  it('respects the char budget on each side, keeping the text nearest the selection', () => {
    selectIn(textNode('p2'), 0, 6);
    const info = getSelectionInfo(10);
    expect(info?.beforeText.length).toBeLessThanOrEqual(10);
    expect('Chapter One\nFirst paragraph text.'.endsWith(info?.beforeText ?? '!')).toBe(true);
    expect(info?.afterText.length).toBeLessThanOrEqual(10);
  });
});

describe('traversal skips invisible and boilerplate subtrees', () => {
  it('excludes nav, hidden, aria-hidden, display:none and script content', () => {
    document.body.innerHTML =
      '<p id="p1">Visible before.</p>' +
      '<nav>Menu Home About</nav>' +
      '<div role="navigation">Breadcrumbs</div>' +
      '<div hidden>Hidden div text</div>' +
      '<div aria-hidden="true">SR-hidden text</div>' +
      '<div style="display:none">Styled-out text</div>' +
      '<script>var secret = 1;</script>' +
      '<p id="p2">Selection paragraph.</p>';
    selectIn(textNode('p2'), 0, 9);
    const info = getSelectionInfo();
    expect(info?.beforeText).toBe('Visible before.');
  });

  it("excludes the extension's own inline wrappers", () => {
    document.body.innerHTML =
      '<p id="p1">Real text.<span data-ega-replaced="r1">Injected translation</span></p>' +
      '<p id="p2">Selection paragraph.</p>';
    selectIn(textNode('p2'), 0, 9);
    const info = getSelectionInfo();
    expect(info?.beforeText).toBe('Real text.');
  });
});

describe('isEditableRange — the inline-replace guard', () => {
  it('is true for a range that covers an <input> (selectNode form)', () => {
    document.body.innerHTML = '<div id="wrap"><input type="text" value="typed text"></div>';
    const input = document.querySelector('input');
    if (!input) throw new Error('fixture input missing');
    const r = document.createRange();
    r.selectNode(input);
    expect(isEditableRange(r)).toBe(true);
  });

  it('is true for a range that covers a <textarea>', () => {
    document.body.innerHTML = '<div><textarea>draft</textarea></div>';
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('fixture textarea missing');
    const r = document.createRange();
    r.selectNode(ta);
    expect(isEditableRange(r)).toBe(true);
  });

  it('is true for a text range inside contenteditable', () => {
    document.body.innerHTML = '<div contenteditable="true" id="ed">editable words</div>';
    const t = textNode('ed');
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 8);
    expect(isEditableRange(r)).toBe(true);
  });

  it('is false for a plain paragraph range', () => {
    document.body.innerHTML = '<p id="p1">plain words</p>';
    const t = textNode('p1');
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 5);
    expect(isEditableRange(r)).toBe(false);
  });
});
