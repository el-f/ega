import { describe, it, expect, beforeEach } from 'vitest';
import { readAuditLog } from '@/shared/audit-log';

const good = {
  id: 'e1',
  ts: 1,
  task: 'translate',
  sourceLang: 'auto',
  targetLang: 'en',
  backend: 'gemini',
  model: 'm',
  systemPrompt: 's',
  userPrompt: 'u',
  response: 'r',
  latencyMs: 10,
  cacheHit: false,
};

beforeEach(async () => {
  await chrome.storage.local.clear();
});

describe('readAuditLog with a damaged entry', () => {
  it('keeps the readable entries and drops the bad one alone', async () => {
    await chrome.storage.local.set({
      egaAuditLog: {
        version: 1,
        entries: [good, { id: 'broken' }, { ...good, id: 'e2' }],
      },
    });
    const entries = await readAuditLog();
    expect(entries.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});
