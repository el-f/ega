import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { pushAuditEntry, clearAuditLog } from '@/shared/audit-log';
import { chromeMock } from '../mocks/chrome';
import { asBackendIdUnsafe } from '@/shared/brands';

describe('pushAuditEntry — broadcast', () => {
  beforeEach(() => {
    chromeMock.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
  });

  it('broadcasts audit:append when entry carries an error', async () => {
    await pushAuditEntry({
      task: 'translate',
      sourceLang: 'auto',
      targetLang: 'en',
      backend: asBackendIdUnsafe('anthropic'),
      model: 'claude-x',
      systemPrompt: 's',
      userPrompt: 'u',
      response: '',
      latencyMs: 0,
      cacheHit: false,
      error: { code: 'NETWORK', message: 'Service unavailable' },
    });
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledTimes(1);
    const call = (chromeMock.runtime.sendMessage as Mock).mock.calls[0]?.[0] as {
      kind: string;
      entry: { error: { message: string } };
    };
    expect(call.kind).toBe('audit:append');
    expect(call.entry.error.message).toBe('Service unavailable');
    await clearAuditLog();
  });

  it('puts only the declared fields on the wire — no prompt, no response', async () => {
    await pushAuditEntry({
      task: 'translate',
      sourceLang: 'auto',
      targetLang: 'en',
      backend: asBackendIdUnsafe('anthropic'),
      model: 'claude-x',
      systemPrompt: 'SYSTEM SECRET',
      userPrompt: 'the page text the user selected',
      response: 'half an answer',
      latencyMs: 0,
      cacheHit: false,
      requestId: 'req-1',
      surface: 'sidepanel',
      error: { code: 'NETWORK', message: 'Service unavailable' },
    });
    const call = (chromeMock.runtime.sendMessage as Mock).mock.calls[0]?.[0] as {
      entry: Record<string, unknown>;
    };
    expect(Object.keys(call.entry).sort()).toEqual(['error', 'requestId', 'surface', 'task']);
    expect(JSON.stringify(call.entry)).not.toContain('SYSTEM SECRET');
    expect(JSON.stringify(call.entry)).not.toContain('page text');
    await clearAuditLog();
  });

  it('omits requestId and surface when the entry carries neither', async () => {
    await pushAuditEntry({
      task: 'backend-test',
      sourceLang: 'auto',
      targetLang: 'en',
      backend: asBackendIdUnsafe('anthropic'),
      model: 'claude-x',
      systemPrompt: 's',
      userPrompt: 'u',
      response: '',
      latencyMs: 0,
      cacheHit: false,
      error: { code: 'AUTH', message: 'bad key' },
    });
    const call = (chromeMock.runtime.sendMessage as Mock).mock.calls[0]?.[0] as {
      entry: Record<string, unknown>;
    };
    expect(Object.keys(call.entry).sort()).toEqual(['error', 'task']);
    await clearAuditLog();
  });

  it('does NOT broadcast on success entries', async () => {
    await pushAuditEntry({
      task: 'translate',
      sourceLang: 'auto',
      targetLang: 'en',
      backend: asBackendIdUnsafe('anthropic'),
      model: 'claude-x',
      systemPrompt: 's',
      userPrompt: 'u',
      response: 'Hello world',
      latencyMs: 0,
      cacheHit: false,
    });
    expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
    await clearAuditLog();
  });
});
