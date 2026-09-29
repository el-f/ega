// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isSensitiveTarget, selectionIsSensitive } from '@/content/safety';

describe('isSensitiveTarget', () => {
  it('returns false for null', () => {
    expect(isSensitiveTarget(null)).toBe(false);
  });

  it('returns true for password input', () => {
    const el = document.createElement('input');
    el.type = 'password';
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('returns false for plain div', () => {
    const el = document.createElement('div');
    expect(isSensitiveTarget(el)).toBe(false);
  });

  it('returns true for element with data-ega-skip', () => {
    const el = document.createElement('div');
    el.setAttribute('data-ega-skip', '');
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('returns true for contenteditable element', () => {
    const el = document.createElement('div');
    el.contentEditable = 'true';
    document.body.appendChild(el);
    try {
      expect(isSensitiveTarget(el)).toBe(true);
    } finally {
      el.remove();
    }
  });

  it('returns true for element with role=textbox', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'textbox');
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('returns false for element with role=button', () => {
    const el = document.createElement('div');
    el.setAttribute('role', 'button');
    expect(isSensitiveTarget(el)).toBe(false);
  });

  it('returns true for child of data-ega-skip ancestor', () => {
    const parent = document.createElement('div');
    parent.setAttribute('data-ega-skip', '');
    const child = document.createElement('span');
    parent.appendChild(child);
    expect(isSensitiveTarget(child)).toBe(true);
  });

  it('returns false for contenteditable=false', () => {
    const el = document.createElement('div');
    el.contentEditable = 'false';
    document.body.appendChild(el);
    try {
      expect(isSensitiveTarget(el)).toBe(false);
    } finally {
      el.remove();
    }
  });
});

describe('isSensitiveTarget — textareas and label text', () => {
  function withDom<T>(html: string, fn: (root: HTMLElement) => T): T {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    try {
      return fn(root);
    } finally {
      root.remove();
    }
  }

  it('returns true for a textarea named password', () => {
    const el = document.createElement('textarea');
    el.name = 'password';
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('returns true for a textarea with autocomplete=one-time-code', () => {
    const el = document.createElement('textarea');
    el.setAttribute('autocomplete', 'one-time-code');
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('returns false for a plain comment textarea', () => {
    const el = document.createElement('textarea');
    el.name = 'comment';
    expect(isSensitiveTarget(el)).toBe(false);
  });

  it('reads the placeholder', () => {
    const el = document.createElement('input');
    el.placeholder = 'Enter your OTP';
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('reads the title', () => {
    const el = document.createElement('input');
    el.title = 'API key';
    expect(isSensitiveTarget(el)).toBe(true);
  });

  it('reads a <label for> that names the field', () => {
    withDom('<label for="f1">Recovery phrase</label><input id="f1" name="x">', (root) => {
      expect(isSensitiveTarget(root.querySelector('input'))).toBe(true);
    });
  });

  it('reads a wrapping <label>', () => {
    withDom('<label>Seed phrase<textarea name="x"></textarea></label>', (root) => {
      expect(isSensitiveTarget(root.querySelector('textarea'))).toBe(true);
    });
  });

  it('reads aria-labelledby', () => {
    withDom('<span id="lb">Private key</span><input aria-labelledby="lb" name="x">', (root) => {
      expect(isSensitiveTarget(root.querySelector('input'))).toBe(true);
    });
  });

  it('leaves a normally labeled field alone', () => {
    withDom('<label for="f2">Your full name</label><input id="f2" name="fullname">', (root) => {
      expect(isSensitiveTarget(root.querySelector('input'))).toBe(false);
    });
  });

  it.each([
    'otp',
    'totp',
    '2fa',
    'mfa',
    'verification-code',
    'secret',
    'token',
    'api-key',
    'private-key',
    'seed-phrase',
    'mnemonic',
    'recovery',
    'iban',
    'routing',
    'tax-id',
  ])('flags a field named %s', (name) => {
    const el = document.createElement('input');
    el.name = name;
    expect(isSensitiveTarget(el)).toBe(true);
  });
});

describe('selectionIsSensitive (hotkey and context-menu paths)', () => {
  it('flags a focused card field with no range, and a range inside one', () => {
    const card = document.createElement('input');
    card.setAttribute('autocomplete', 'cc-number');
    document.body.appendChild(card);
    expect(selectionIsSensitive(undefined, card)).toBe(true);

    const wrap = document.createElement('div');
    wrap.setAttribute('data-ega-skip', '');
    wrap.textContent = '4111 1111 1111 1111';
    document.body.appendChild(wrap);
    const range = document.createRange();
    range.selectNodeContents(wrap);
    expect(selectionIsSensitive(range, document.body)).toBe(true);
  });

  it('passes a plain paragraph selection with focus on body', () => {
    const p = document.createElement('p');
    p.textContent = 'salam';
    document.body.appendChild(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    expect(selectionIsSensitive(range, document.body)).toBe(false);
    expect(selectionIsSensitive(undefined, null)).toBe(false);
  });
});

describe('selectionIsSensitive leaves rich-text composers alone', () => {
  it('passes a selection inside a contenteditable or role=textbox editor', () => {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.textContent = 'sabah el kheir';
    document.body.appendChild(editor);
    const range = document.createRange();
    range.selectNodeContents(editor);
    expect(selectionIsSensitive(range, editor)).toBe(false);

    const box = document.createElement('div');
    box.setAttribute('role', 'textbox');
    document.body.appendChild(box);
    expect(selectionIsSensitive(undefined, box)).toBe(false);
  });
});
