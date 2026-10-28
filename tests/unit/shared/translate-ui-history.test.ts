import { it, expect, beforeEach, type Mock } from 'vitest';
import { sendTranslateStart } from '@/shared/translate-ui';

beforeEach(() => {
  (chrome.runtime.sendMessage as Mock).mockClear();
  (chrome.runtime.sendMessage as Mock).mockResolvedValue({ ok: true });
});

it('forwards conversationHistory in the translate:start options', async () => {
  await sendTranslateStart({
    requestId: 'r1',
    text: 'q',
    sourceLang: 'auto',
    targetLang: 'auto',
    explain: false,
    stream: false,
    conversationHistory: [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ],
  });
  const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
  expect(msg.kind).toBe('translate:start');
  expect(msg.options.conversationHistory).toEqual([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ]);
});

it('puts siteOrigin beside context, where the worker reads it, and omits it when absent', async () => {
  const base = {
    text: 'q',
    sourceLang: 'auto',
    targetLang: 'auto',
    explain: false,
    stream: false,
  } as const;
  await sendTranslateStart({ ...base, requestId: 'r3', siteOrigin: 'https://rules.test' });
  await sendTranslateStart({ ...base, requestId: 'r4' });
  const [withSite, without] = (chrome.runtime.sendMessage as Mock).mock.calls.map((c) => c[0]);
  expect(withSite.siteOrigin).toBe('https://rules.test');
  expect('siteOrigin' in withSite.options).toBe(false);
  expect('siteOrigin' in without).toBe(false);
});

it('omits conversationHistory when not provided (no empty array on wire)', async () => {
  await sendTranslateStart({
    requestId: 'r2',
    text: 'q',
    sourceLang: 'auto',
    targetLang: 'auto',
    explain: false,
    stream: false,
  });
  const msg = (chrome.runtime.sendMessage as Mock).mock.calls[0]?.[0];
  expect('conversationHistory' in msg.options).toBe(false);
});
