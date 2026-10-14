import { describe, it, expect, vi } from 'vitest';
import { mutateSettingsMidFlight } from '../../e2e/flows/_harness';

describe('mutateSettingsMidFlight', () => {
  it('writes patch via page.evaluate and returns a cleanup that restores prior state', async () => {
    const writes: Record<string, unknown>[] = [];
    const prior = { cacheEnabled: true };
    const page = {
      evaluate: vi.fn(
        async (_fn: unknown, arg: { kind: string; patch?: Record<string, unknown> }) => {
          if (arg.kind === 'read') return prior;
          if (arg.kind === 'write') {
            if (arg.patch) writes.push(arg.patch);
            return undefined;
          }
          if (arg.kind === 'waitFrame') return undefined;
          throw new Error(`unexpected ${arg.kind}`);
        },
      ),
    } as unknown as Parameters<typeof mutateSettingsMidFlight>[0];

    const cleanup = await mutateSettingsMidFlight(page, { cacheEnabled: false });
    expect(writes).toEqual([{ cacheEnabled: false }]);

    await cleanup();
    expect(writes).toEqual([{ cacheEnabled: false }, { cacheEnabled: true }]);
  });

  it('supports settle: next-frame by awaiting one frame after write', async () => {
    let evaluateCount = 0;
    const page = {
      evaluate: vi.fn(async (_fn: unknown, arg: { kind: string }) => {
        evaluateCount += 1;
        if (arg.kind === 'read') return {};
        if (arg.kind === 'write') return undefined;
        if (arg.kind === 'waitFrame') return undefined;
        return undefined;
      }),
    } as unknown as Parameters<typeof mutateSettingsMidFlight>[0];

    await mutateSettingsMidFlight(page, { theme: 'dark' }, { settle: 'next-frame' });
    // read + write + waitFrame = 3
    expect(evaluateCount).toBeGreaterThanOrEqual(3);
  });
});
