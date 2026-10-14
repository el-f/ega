import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { warm, resetPortManagerForTest } from '@/shared/cli-session/port-manager';

function mockPort() {
  return {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
  };
}

const connectNativeMock = chrome.runtime.connectNative as unknown as Mock;

beforeEach(() => {
  resetPortManagerForTest();
});

// The host keys the warm child by model; a warm child on another model is killed by the first real translate.
describe('warm() carries the configured model', () => {
  it('puts the model on the warm-session frame', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    void warm('claude', 30_000, 'claude-opus-4-7');
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'warm-session',
        backend: 'claude',
        model: 'claude-opus-4-7',
      }),
    );
  });

  it('omits the field when no model is configured', () => {
    const port = mockPort();
    connectNativeMock.mockReturnValue(port);
    void warm('claude');
    const frame = port.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(frame['kind']).toBe('warm-session');
    expect('model' in frame).toBe(false);
  });
});
