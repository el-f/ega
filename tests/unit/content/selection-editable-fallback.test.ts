// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSelectionInfo } from '@/content/selection';

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
