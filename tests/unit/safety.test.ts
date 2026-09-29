// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isSensitiveTarget } from '@/content/safety';

describe('isSensitiveTarget', () => {
  it('rejects password inputs', () => {
    const i = document.createElement('input');
    i.type = 'password';
    expect(isSensitiveTarget(i)).toBe(true);
  });
  it('rejects cc autocomplete', () => {
    const i = document.createElement('input');
    i.autocomplete = 'cc-number';
    expect(isSensitiveTarget(i)).toBe(true);
  });
  it('rejects inputs inside [data-ega-skip]', () => {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-ega-skip', '');
    const i = document.createElement('input');
    wrap.appendChild(i);
    document.body.appendChild(wrap);
    expect(isSensitiveTarget(i)).toBe(true);
  });
  it('allows plain text inputs', () => {
    const i = document.createElement('input');
    i.type = 'text';
    expect(isSensitiveTarget(i)).toBe(false);
  });

  it('rejects inputs named cvv / card-number / ssn', () => {
    for (const name of ['cvv', 'card-number', 'creditcard', 'ssn', 'password', 'pin']) {
      const i = document.createElement('input');
      i.type = 'text';
      i.name = name;
      expect(isSensitiveTarget(i)).toBe(true);
    }
  });

  it('rejects inputs with sensitive aria-label', () => {
    const i = document.createElement('input');
    i.type = 'text';
    i.setAttribute('aria-label', 'Security code');
    expect(isSensitiveTarget(i)).toBe(true);
  });
});
