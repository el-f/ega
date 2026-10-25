// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSelectionInfo, selectionRectOf, trackSelectionRect } from '@/content/selection';

// `window.getSelection()` returns nothing inside `<textarea>` / `<input>`; those fields carry their own `selectionStart` / `selectionEnd`.

describe('getSelectionInfo — editable fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns selection from a focused textarea', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello marhaba world';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(6, 13); // "marhaba"
    const info = getSelectionInfo();
    expect(info).not.toBeNull();
    expect(info?.text).toBe('marhaba');
  });

  it('returns selection from a focused text input', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'ahlan wa sahlan';
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(6, 8); // "wa"
    const info = getSelectionInfo();
    expect(info?.text).toBe('wa');
  });

  it('returns null when the field has no selection (collapsed caret)', () => {
    const ta = document.createElement('textarea');
    ta.value = 'hello';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(3, 3);
    expect(getSelectionInfo()).toBeNull();
  });

  it('returns null when selection is whitespace-only', () => {
    const ta = document.createElement('textarea');
    ta.value = '   marhaba   ';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, 3); // three spaces
    expect(getSelectionInfo()).toBeNull();
  });

  it('ignores non-textual input types', () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    document.body.appendChild(input);
    input.focus();
    expect(getSelectionInfo()).toBeNull();
  });

  it('populates beforeText and afterText from the field value', () => {
    const ta = document.createElement('textarea');
    ta.value = 'BEFORE marhaba AFTER';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(7, 14); // "marhaba"
    const info = getSelectionInfo();
    expect(info?.beforeText).toContain('BEFORE');
    expect(info?.afterText).toContain('AFTER');
  });
});

function box(top: number, bottom: number, left = 100, right = 700): DOMRect {
  return new DOMRect(left, top, right - left, bottom - top);
}

/** jsdom lays nothing out: the mirror's span reports `spanBox`, and `mirrors` keeps each mirror it measured in. */
function stubMirror(spanBox: () => DOMRect): { mirrors: HTMLElement[]; restore: () => void } {
  const real = HTMLSpanElement.prototype.getBoundingClientRect;
  const mirrors: HTMLElement[] = [];
  HTMLSpanElement.prototype.getBoundingClientRect = function (this: HTMLSpanElement) {
    if (this.parentElement) mirrors.push(this.parentElement);
    return spanBox();
  };
  return { mirrors, restore: () => (HTMLSpanElement.prototype.getBoundingClientRect = real) };
}

function codeView(value: string, fieldBox = box(81, 861)): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.style.whiteSpace = 'pre';
  ta.style.lineHeight = '20px';
  ta.getBoundingClientRect = () => fieldBox;
  document.body.appendChild(ta);
  ta.focus();
  return ta;
}

/** How a field selection travels: a range that wraps the field. */
function around(field: Element): Range {
  const range = document.createRange();
  range.selectNode(field);
  // Like Chromium: a range around one element reports that element's box.
  range.getBoundingClientRect = () => field.getBoundingClientRect();
  return range;
}

const LINES = Array.from({ length: 38 }, (_, i) => `line ${i} mar7aba habibi`).join('\n');

describe('a textarea selection anchors to the selected text', () => {
  let restore = (): void => {};
  afterEach(() => restore());

  // The mirror is page DOM, so it must wait for the sensitive-field and site-off gates its callers run.
  it('getSelectionInfo returns the field rect and lays out nothing', () => {
    const stub = stubMirror(() => box(766, 820));
    restore = stub.restore;
    const ta = codeView(LINES);
    ta.setSelectionRange(LINES.indexOf('line 34'), LINES.indexOf('line 36'));
    const before = document.documentElement.childElementCount;
    const r = getSelectionInfo()?.rect;
    expect([r?.top, r?.bottom]).toEqual([81, 861]);
    expect(stub.mirrors).toEqual([]);
    expect(document.documentElement.childElementCount).toBe(before);
  });

  it('selectionRectOf measures the selected text, not the field', () => {
    ({ restore } = stubMirror(() => box(766, 820)));
    const ta = codeView(LINES);
    ta.setSelectionRange(LINES.indexOf('line 34'), LINES.indexOf('line 36'));
    const r = selectionRectOf(around(ta));
    expect([r.top, r.bottom]).toEqual([766, 820]);
  });

  it('a collapsed selection measures nothing and reads the field box', () => {
    const { mirrors, restore: undo } = stubMirror(() => box(766, 820));
    restore = undo;
    const ta = codeView(LINES);
    ta.setSelectionRange(5, 5);
    const r = selectionRectOf(around(ta));
    expect([r.top, r.bottom]).toEqual([81, 861]);
    expect(mirrors).toEqual([]);
  });

  it('a selection too long to mirror reads the field box', () => {
    const { mirrors, restore: undo } = stubMirror(() => box(766, 820));
    restore = undo;
    const ta = document.createElement('textarea');
    ta.value = 'mar7aba '.repeat(3000);
    ta.getBoundingClientRect = () => box(81, 861);
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(23000, 23010);
    const r = selectionRectOf(around(ta));
    expect([r.top, r.bottom]).toEqual([81, 861]);
    expect(mirrors).toEqual([]);
  });

  it('a selection below the field view is clipped to the field bottom', () => {
    ({ restore } = stubMirror(() => box(900, 940)));
    const ta = codeView(LINES);
    ta.setSelectionRange(10, 20);
    const r = selectionRectOf(around(ta));
    expect([r.top, r.bottom]).toEqual([861, 861]);
  });

  it('subtracts the field own scroll offsets', () => {
    ({ restore } = stubMirror(() => box(500, 520, 300, 400)));
    const ta = codeView(LINES);
    Object.defineProperty(ta, 'scrollTop', { configurable: true, value: 100 });
    Object.defineProperty(ta, 'scrollLeft', { configurable: true, value: 50 });
    ta.setSelectionRange(10, 20);
    const r = selectionRectOf(around(ta));
    expect([r.left, r.top, r.right, r.bottom]).toEqual([250, 400, 350, 420]);
  });

  it('leaves no mirror on the page, also when the measure throws', () => {
    ({ restore } = stubMirror(() => {
      throw new Error('layout failed');
    }));
    const ta = codeView(LINES);
    ta.setSelectionRange(10, 20);
    const before = document.documentElement.childElementCount;
    expect(() => selectionRectOf(around(ta))).toThrow('layout failed');
    expect(document.documentElement.childElementCount).toBe(before);
  });

  it('a code view mirrors from the first selected line, offset by the rows above it', () => {
    const stub = stubMirror(() => box(766, 820));
    restore = stub.restore;
    const ta = codeView(LINES);
    ta.setSelectionRange(LINES.indexOf('line 34') + 2, LINES.indexOf('line 36'));
    selectionRectOf(around(ta));
    const mirror = stub.mirrors[0];
    expect(mirror?.style.top).toBe(`${81 + 34 * 20}px`);
    expect(mirror?.textContent.startsWith('line 34')).toBe(true);
  });

  it('a code view mirrors only the selected lines, so a long file after them still measures', () => {
    const stub = stubMirror(() => box(120, 140));
    restore = stub.restore;
    const ta = codeView(`${LINES}\n${'x'.repeat(25_000)}`);
    const at = LINES.indexOf('line 1 ');
    ta.setSelectionRange(at + 2, at + 6);
    const r = selectionRectOf(around(ta));
    expect([r.top, r.bottom]).toEqual([120, 140]);
    expect(stub.mirrors).toHaveLength(1);
    expect(stub.mirrors[0]?.textContent).toBe('line 1 mar7aba habibi');
  });

  it('a wrapping field with line-height normal mirrors from its own top', () => {
    const stub = stubMirror(() => box(300, 320));
    restore = stub.restore;
    const ta = document.createElement('textarea');
    ta.value = LINES;
    ta.style.lineHeight = 'normal';
    ta.getBoundingClientRect = () => box(81, 861);
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(LINES.indexOf('line 34'), LINES.indexOf('line 36'));
    selectionRectOf(around(ta));
    expect(stub.mirrors[0]?.style.top).toBe('81px');
    expect(stub.mirrors[0]?.textContent.startsWith('line 0')).toBe(true);
  });

  it('an input keeps the field rect', () => {
    ({ restore } = stubMirror(() => box(766, 820)));
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'ahlan wa sahlan';
    input.getBoundingClientRect = () => box(300, 330);
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(6, 8);
    const r = selectionRectOf(around(input));
    expect([r.top, r.bottom]).toEqual([300, 330]);
  });

  it('any other range reports its own rect', () => {
    document.body.innerHTML = '<p id="p">mar7aba</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p') as HTMLElement);
    const own = box(10, 30);
    range.getBoundingClientRect = () => own;
    expect(selectionRectOf(range)).toBe(own);
  });
});

describe('trackSelectionRect', () => {
  let restore = (): void => {};
  afterEach(() => restore());

  it('measures once, then follows the field box with no new layout', () => {
    const stub = stubMirror(() => box(766, 820));
    restore = stub.restore;
    let fieldBox = box(81, 861);
    const ta = codeView(LINES);
    ta.getBoundingClientRect = () => fieldBox;
    ta.setSelectionRange(LINES.indexOf('line 34'), LINES.indexOf('line 36'));
    const at = trackSelectionRect(around(ta));
    expect(stub.mirrors).toHaveLength(1);
    // The page scrolls 100px: the field box moves, and the text moves with it.
    fieldBox = box(-19, 761);
    expect([at().top, at().bottom]).toEqual([666, 720]);
    expect(stub.mirrors).toHaveLength(1);
  });

  it('stays on the text it opened on when the field selection collapses or moves', () => {
    ({ restore } = stubMirror(() => box(766, 820)));
    const ta = codeView(LINES);
    ta.setSelectionRange(LINES.indexOf('line 34'), LINES.indexOf('line 36'));
    const at = trackSelectionRect(around(ta));
    ta.setSelectionRange(3, 3);
    expect([at().top, at().bottom]).toEqual([766, 820]);
    ta.setSelectionRange(0, 10);
    expect([at().top, at().bottom]).toEqual([766, 820]);
  });

  it('follows the field own scroll', () => {
    ({ restore } = stubMirror(() => box(500, 520, 300, 400)));
    const ta = codeView(LINES);
    ta.setSelectionRange(10, 20);
    const at = trackSelectionRect(around(ta));
    Object.defineProperty(ta, 'scrollTop', { configurable: true, value: 100 });
    expect([at().top, at().bottom]).toEqual([400, 420]);
  });

  // A selection the mirror cannot measure still follows the page: the live field box, not a frozen rect.
  it('falls back to the live field box when nothing could be measured', () => {
    ({ restore } = stubMirror(() => box(766, 820)));
    let fieldBox = box(81, 861);
    const ta = codeView(LINES);
    ta.getBoundingClientRect = () => fieldBox;
    ta.setSelectionRange(5, 5);
    const at = trackSelectionRect(around(ta));
    fieldBox = box(-19, 761);
    expect([at().top, at().bottom]).toEqual([-19, 761]);
  });
});
