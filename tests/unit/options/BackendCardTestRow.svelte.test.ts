// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import BackendCardTestRow from '@/options/components/backend-card/BackendCardTestRow.svelte';
import { asBackendIdUnsafe } from '@/shared/brands';

function props(over: Record<string, unknown> = {}) {
  return {
    id: asBackendIdUnsafe('anthropic'),
    testRunning: false,
    testSucceeded: false,
    testResult: null,
    testErrCode: null,
    testLatencyMs: null,
    ollama403: false,
    onTest: vi.fn(),
    ...over,
  };
}

describe('BackendCardTestRow', () => {
  it('"Test now" calls back, and reads "Testing..." while a test runs', async () => {
    const p = props();
    const { getByTestId, rerender } = render(BackendCardTestRow, { props: p });
    const btn = getByTestId('backend-card-test-anthropic') as HTMLButtonElement;
    expect(btn.textContent.trim()).toBe('Test now');
    await fireEvent.click(btn);
    expect(p.onTest).toHaveBeenCalledTimes(1);
    await rerender({ ...p, testRunning: true });
    expect(btn.textContent.trim()).toBe('Testing...');
    // The label stays readable beside its spinner (the shared loading style hides it), and focus stays put.
    expect(btn.querySelector('.be-spinner')).not.toBeNull();
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-disabled')).toBe('true');
    await fireEvent.click(btn);
    expect(p.onTest).toHaveBeenCalledTimes(1);
  });

  it('a pass says how fast it answered and shows the answer', () => {
    const { container } = render(BackendCardTestRow, {
      props: props({ testSucceeded: true, testResult: 'Hello', testLatencyMs: 812 }),
    });
    expect(container.querySelector('.be-latency')?.textContent.trim()).toBe('Answered in 812 ms');
    expect(container.querySelector('[data-ega-test-answer]')?.textContent).toBe('Hello');
    expect(container.querySelector('[data-ega-test-failure]')).toBeNull();
  });

  it('seconds read with one decimal', () => {
    const { container } = render(BackendCardTestRow, {
      props: props({ testSucceeded: true, testResult: 'x', testLatencyMs: 2345 }),
    });
    expect(container.querySelector('.be-latency')?.textContent.trim()).toBe('Answered in 2.3 s');
  });

  it('a failure is a plain title and sentence; the code and raw text only under Details', () => {
    const { container } = render(BackendCardTestRow, {
      props: props({ testResult: 'HTTP 401 invalid x-api-key', testErrCode: 'AUTH' }),
    });
    const failure = container.querySelector('[data-ega-test-failure]');
    expect(failure?.getAttribute('role')).toBe('alert');
    expect(failure?.querySelector('.be-fail-title')?.textContent.trim()).toBe('API key rejected');
    expect(failure?.querySelector('.be-fail-text')?.textContent.trim()).toBe(
      'Anthropic did not accept the saved API key.',
    );
    const main = [...(failure?.querySelectorAll('.be-fail-title, .be-fail-text') ?? [])]
      .map((n) => n.textContent)
      .join(' ');
    expect(main).not.toMatch(/AUTH|401/);
    expect(failure?.querySelector('details')?.textContent).toContain('HTTP 401 invalid x-api-key');
  });

  it('an Ollama 403 says Ollama blocked Ega, with copy-ready steps behind Show steps', async () => {
    const write = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText: write } });
    const { container, getByRole } = render(BackendCardTestRow, {
      props: props({
        id: asBackendIdUnsafe('ollama'),
        testResult: 'HTTP 403 forbidden',
        testErrCode: 'REQUEST',
        ollama403: true,
        ollamaOrigin: 'chrome-extension://abc',
      }),
    });
    const help = container.querySelector('[data-testid="ollama-403-help"]');
    expect(help?.querySelector('.be-fail-title')?.textContent.trim()).toBe(
      'Ollama blocked the request from Ega',
    );
    expect(help?.querySelector('summary')?.textContent.trim()).toBe('Show steps');
    expect(container.querySelector('[data-ega-test-failure]')).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Copy', hidden: true }));
    expect(write).toHaveBeenCalledWith('chrome-extension://abc');
  });

  it('a note is a plain line, neither a pass nor a failure', () => {
    const { container } = render(BackendCardTestRow, {
      props: props({ testNote: 'The settings changed while the test ran. Test again.' }),
    });
    expect(container.querySelector('[data-ega-test-note]')?.textContent).toBe(
      'The settings changed while the test ran. Test again.',
    );
    expect(container.querySelector('[data-ega-test-failure]')).toBeNull();
  });
});
