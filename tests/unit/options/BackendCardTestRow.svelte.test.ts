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
    expect(btn.querySelector('[data-ega-inline-spinner]')).not.toBeNull();
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

  it.each([
    ['AUTH', 'anthropic', 'Check the key above, then test again.'],
    ['TIMEOUT', 'anthropic', 'Test again, or raise Text answer timeout under Timeouts and checks.'],
    ['RATE_LIMIT', 'anthropic', 'Wait a minute, then test again.'],
    ['SERVER', 'anthropic', 'Try again in a moment.'],
    ['NETWORK', 'ollama', 'Check that it is running at the address above, then test again.'],
    ['NATIVE_NOT_INSTALLED', 'native', 'Follow the install steps above, then click Recheck.'],
  ])('a %s failure on %s says what to do next', (code, backend, next) => {
    const { container } = render(BackendCardTestRow, {
      props: props({ id: asBackendIdUnsafe(backend), testResult: 'raw', testErrCode: code }),
    });
    expect(container.querySelector('[data-ega-test-next]')?.textContent.trim()).toBe(next);
  });

  it('a CLI config failure blames a system config or an Ega setting and shows the CLI message open', () => {
    const said = 'Error loading config.toml: invalid transport\nin `mcp_servers.cua_repl`';
    const { container } = render(BackendCardTestRow, {
      props: props({
        id: asBackendIdUnsafe('native'),
        testResult: `CLI config error: ${said}`,
        testErrCode: 'NATIVE_CLI_CONFIG',
      }),
    });
    const failure = container.querySelector('[data-ega-test-failure]');
    expect(failure?.getAttribute('data-ega-test-failure')).toBe('NATIVE_CLI_CONFIG');
    expect(failure?.querySelector('.be-fail-title')?.textContent.trim()).toBe('CLI config error');
    expect(failure?.querySelector('.be-fail-text')?.textContent.trim()).toBe(
      'The CLI could not load its settings: a system-wide config, or a setting Ega passes, is invalid.',
    );
    // Ega runs the CLI without the user's own config file, so the copy must not send them to fix it.
    expect(failure?.textContent).not.toMatch(/fix the file/i);
    // The old copy blamed a missing or logged-out CLI, which was not the cause.
    expect(failure?.textContent).not.toMatch(/installed and logged in/);
    expect(container.querySelector('[data-ega-test-next]')).toBeNull();
    const details = failure?.querySelector('details');
    expect(details?.open).toBe(true);
    expect(details?.textContent).toContain('Error loading config.toml: invalid transport');
    expect(details?.textContent).toContain('Code: NATIVE_CLI_CONFIG');
  });

  it('other failures keep Details closed', () => {
    const { container } = render(BackendCardTestRow, {
      props: props({ testResult: 'HTTP 401 invalid x-api-key', testErrCode: 'AUTH' }),
    });
    expect(container.querySelector('details')?.open).toBe(false);
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
  it('a running test that can stop turns the same button into Stop and says what it waits on', async () => {
    const onStop = vi.fn();
    const p = props({ id: asBackendIdUnsafe('ollama'), onStop });
    const { getByTestId, container, rerender } = render(BackendCardTestRow, { props: p });
    const btn = getByTestId('backend-card-test-ollama') as HTMLButtonElement;
    await rerender({
      ...p,
      testRunning: true,
      progress: 'Loading gemma4:26b into memory...',
      testElapsedMs: 82_400,
    });
    expect(getByTestId('backend-card-test-ollama')).toBe(btn);
    expect(btn.textContent.trim()).toBe('Stop');
    expect(btn.getAttribute('aria-disabled')).toBeNull();
    expect(container.querySelector('[data-ega-test-progress]')?.textContent.trim()).toBe(
      'Loading gemma4:26b into memory...',
    );
    // The clock ticks every second, so screen readers skip it.
    const clock = container.querySelector('[data-ega-test-clock]');
    expect(clock?.textContent).toBe('1:22');
    expect(clock?.getAttribute('aria-hidden')).toBe('true');
    await fireEvent.click(btn);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(p.onTest).not.toHaveBeenCalled();
  });

  it('a loaded model shows where it sits, with Unload beside Test now when no test runs', async () => {
    const onUnload = vi.fn();
    const p = props({
      id: asBackendIdUnsafe('ollama'),
      memoryLine: 'Loaded: 4.0 GB on the GPU, 13 GB in RAM',
      onUnload,
    });
    const { container, getByTestId, queryByTestId, rerender } = render(BackendCardTestRow, {
      props: p,
    });
    expect(container.querySelector('[data-ega-ollama-memory]')?.textContent).toBe(
      'Loaded: 4.0 GB on the GPU, 13 GB in RAM',
    );
    const unload = getByTestId('backend-card-unload-ollama');
    expect(unload.closest('.be-test-row')).toBe(
      getByTestId('backend-card-test-ollama').closest('.be-test-row'),
    );
    await fireEvent.click(unload);
    expect(onUnload).toHaveBeenCalledTimes(1);
    await rerender({ ...p, unloading: true });
    expect(unload.textContent.trim()).toBe('Unloading...');
    await fireEvent.click(unload);
    expect(onUnload).toHaveBeenCalledTimes(1);
    await rerender({ ...p, testRunning: true, onStop: vi.fn() });
    expect(queryByTestId('backend-card-unload-ollama')).toBeNull();
  });
});
