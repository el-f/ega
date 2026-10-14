import { describe, it, expect, vi } from 'vitest';
import { captureCrossSurfaceBus, type CrossSurfaceMessage } from '../../e2e/flows/_harness';

describe('captureCrossSurfaceBus', () => {
  it('returns an async iterator that yields filtered events in arrival order', async () => {
    const context = {
      on: vi.fn(),
      pages: () => [],
    } as unknown as Parameters<typeof captureCrossSurfaceBus>[0];

    const queue = captureCrossSurfaceBus(context, (msg) => msg.channel === 'audit-log:append');

    queue._push({ channel: 'audit-log:append', payload: { sev: 'success' }, at: 1 });
    queue._push({ channel: 'theme:change', payload: { theme: 'dark' }, at: 2 });
    queue._push({ channel: 'audit-log:append', payload: { sev: 'error' }, at: 3 });

    const first = await queue.next();
    expect(first.done).toBe(false);
    expect((first.value as CrossSurfaceMessage).channel).toBe('audit-log:append');
    expect((first.value as CrossSurfaceMessage).payload).toEqual({ sev: 'success' });

    const second = await queue.next();
    expect((second.value as CrossSurfaceMessage).payload).toEqual({ sev: 'error' });
  });

  it('blocks until a matching message arrives', async () => {
    const context = {
      on: vi.fn(),
      pages: () => [],
    } as unknown as Parameters<typeof captureCrossSurfaceBus>[0];
    const queue = captureCrossSurfaceBus(context, (msg) => msg.channel === 'theme:change');

    let resolved: CrossSurfaceMessage | null = null;
    const pending = queue.next().then((r) => {
      resolved = r.value as CrossSurfaceMessage;
      return undefined;
    });

    expect(resolved).toBeNull();
    queue._push({ channel: 'theme:change', payload: { theme: 'light' }, at: 1 });
    await pending;
    expect(resolved).not.toBeNull();
    const r = resolved as unknown as CrossSurfaceMessage;
    expect(r.channel).toBe('theme:change');
  });
});
