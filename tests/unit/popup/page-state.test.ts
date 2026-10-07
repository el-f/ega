import { describe, it, expect, vi } from 'vitest';
import { askPage, pageAccess, popupPageState, siteLabel, tabAccess } from '@/popup/page-state';

// Ega has no "tabs" permission: Chrome gives it a tab's url only where its host permissions reach.
describe('tabAccess', () => {
  it.each([
    ['a website', { id: 7, url: 'https://example.com/a' }, undefined, 'ok'],
    [
      'the Web Store, whose url Ega can read',
      { id: 7, url: 'https://chromewebstore.google.com/detail/x' },
      undefined,
      'restricted',
    ],
    [
      'a chrome:// page or the New Tab page: an id, no url',
      { id: 7, windowId: 1 },
      undefined,
      'restricted',
    ],
    ['the popup page itself, opened as a tab', { id: 7, windowId: 1 }, 7, 'unknown'],
    ['no tab at all', null, undefined, 'unknown'],
  ])('%s', (_, tab, ownTabId, expected) => {
    expect(tabAccess(tab, ownTabId)).toBe(expected);
  });
});

describe('pageAccess', () => {
  it.each([
    ['https://example.com/a', 'ok'],
    ['http://example.com/', 'ok'],
    ['file:///C:/notes.html', 'ok'],
    ['chrome://extensions/', 'restricted'],
    ['edge://settings', 'restricted'],
    ['view-source:https://example.com/', 'restricted'],
    ['chrome-extension://abc/page.html', 'restricted'],
    ['https://chromewebstore.google.com/detail/x', 'restricted'],
    ['https://chrome.google.com/webstore/detail/x', 'restricted'],
    ['https://chrome.google.com/search', 'ok'],
    [undefined, 'restricted'],
    ['not a url', 'restricted'],
  ])('%s is %s', (url, expected) => {
    expect(pageAccess(url)).toBe(expected);
  });
});

describe('popupPageState', () => {
  const base = { access: 'ok' as const, reply: { text: '' }, rejected: false, siteOff: false };
  it.each([
    [{ ...base, access: 'restricted' as const, siteOff: true, rejected: true }, 'restricted'],
    [{ ...base, siteOff: true, rejected: true }, 'site-off'],
    [{ ...base, rejected: true, reply: undefined }, 'not-running'],
    [{ ...base, reply: { text: 'x', heldBack: { reason: 'english' as const } } }, 'held-back'],
    [
      { ...base, siteOff: true, reply: { text: 'x', heldBack: { reason: 'english' as const } } },
      'site-off',
    ],
    [{ ...base, reply: undefined }, 'default'],
    [{ ...base, access: 'unknown' as const, siteOff: true, rejected: true }, 'default'],
    [base, 'default'],
  ])('%o is %s', (input, expected) => {
    expect(popupPageState(input)).toBe(expected);
  });
});

describe('siteLabel', () => {
  it('drops www. and keeps both ends of a long host', () => {
    expect(siteLabel('https://www.example.com/x')).toEqual({
      full: 'example.com',
      short: 'example.com',
    });
    const long = 'a-very-long-subdomain-name.under-another-long-name.example.org';
    const got = siteLabel(`https://${long}/`);
    expect(got.full).toBe(long);
    expect(got.short.startsWith('a-very-long-')).toBe(true);
    expect(got.short.endsWith('example.org')).toBe(true);
    expect(got.short).toContain('…');
    expect(siteLabel(undefined).full).toBe('this page');
  });
});

describe('askPage', () => {
  it('reports a page with no receiver as not running', async () => {
    const got = await askPage(1, () => Promise.reject(new Error('Receiving end does not exist')));
    expect(got).toEqual({ reply: undefined, rejected: true });
  });

  it('treats a page that does not answer within 500 ms as running with nothing held back', async () => {
    vi.useFakeTimers();
    try {
      const pending = askPage(1, () => new Promise(() => {}));
      await vi.advanceTimersByTimeAsync(500);
      expect(await pending).toEqual({ reply: undefined, rejected: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes the answer through', async () => {
    const reply = { text: 'hi', heldBack: { reason: 'too-short' as const, minLength: 6 } };
    expect(await askPage(1, () => Promise.resolve(reply))).toEqual({ reply, rejected: false });
  });
});
