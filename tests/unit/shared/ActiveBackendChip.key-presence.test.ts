// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { parseSettings } from '@/shared/settings-schema';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { asBackendIdUnsafe } from '@/shared/brands';
import ActiveBackendChip from '@/shared/components/ActiveBackendChip.svelte';
import { sendMsg } from '@/shared/messages';
import type * as MessagesModule from '@/shared/messages';

// The chip asks the SW for the probe, so the message helper is the seam.
vi.mock('@/shared/messages', async (importOriginal) => {
  const mod = await importOriginal<typeof MessagesModule>();
  return { ...mod, sendMsg: vi.fn() };
});

const probeMock = vi.mocked(sendMsg);

beforeEach(() => {
  probeMock.mockReset();
});

// The router skips a backend with no key, so the chip must not name it.
describe('ActiveBackendChip — key presence', () => {
  it('shows the empty state when no enabled backend has a key', () => {
    const s = parseSettings({
      backendOrder: ['anthropic', 'openai'],
      disabledBackends: [],
      anthropicApiKey: '',
      openaiApiKey: '',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    expect(container.querySelector('.chip-name')?.textContent).toBe('Set up backend');
    expect(container.querySelector('.chip-dot')).toBeNull();
  });

  it('names the first backend that has a key', () => {
    const s = parseSettings({
      backendOrder: ['anthropic', 'openai'],
      disabledBackends: [],
      anthropicApiKey: '',
      openaiApiKey: 'test-key',
      model: { ...DEFAULT_SETTINGS.model, openai: 'gpt-5-mini' },
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    expect(container.querySelector('.chip-name')?.textContent.trim()).toBe('OpenAI');
    // The model shows on each reply, so the chip never carries a raw id.
    expect(container.textContent).not.toContain('gpt-5-mini');
  });
});

// For key-less backends (native, ollama) reachability, not key presence, is readiness.
describe('ActiveBackendChip — key-less backends need the probe', () => {
  it('shows "Checking" while the probe is in flight, never the backend name', async () => {
    probeMock.mockReturnValue(new Promise(() => {}));
    const s = parseSettings({
      backendOrder: ['native'],
      disabledBackends: [],
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    await tick();
    expect(container.querySelector('.chip-name')?.textContent).toBe('Checking');
  });

  it('falls to the empty state when the probe finds nothing reachable', async () => {
    probeMock.mockResolvedValue({ available: { native: false }, active: null });
    const s = parseSettings({
      backendOrder: ['native'],
      disabledBackends: [],
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    await waitFor(() => {
      expect(container.querySelector('.chip-name')?.textContent).toBe('Set up backend');
    });
    expect(container.querySelector('.chip-dot')).toBeNull();
  });

  it('names a key-less backend once the probe saw it reachable', async () => {
    probeMock.mockResolvedValue({
      available: { native: true },
      active: asBackendIdUnsafe('native'),
    });
    const s = parseSettings({
      backendOrder: ['native'],
      disabledBackends: [],
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    await waitFor(() => {
      expect(container.querySelector('.chip-name')?.textContent).toContain('Claude Code or Codex');
    });
  });

  it('probes again when the server URL changes, inside the 30 s window', async () => {
    probeMock.mockResolvedValueOnce({ available: { ollama: false }, active: null });
    probeMock.mockResolvedValueOnce({
      available: { ollama: true },
      active: asBackendIdUnsafe('ollama'),
    });
    const s = parseSettings({ backendOrder: ['ollama'], disabledBackends: [] });
    const { container, rerender } = render(ActiveBackendChip, {
      props: { settings: s, onJump: () => {} },
    });
    await waitFor(() => {
      expect(container.querySelector('.chip-name')?.textContent).toBe('Set up backend');
    });
    await rerender({ settings: { ...s, ollamaUrl: 'http://127.0.0.1:11435' }, onJump: () => {} });
    await waitFor(() => {
      expect(container.querySelector('.chip-name')?.textContent).toContain('Ollama');
    });
    expect(probeMock).toHaveBeenCalledTimes(2);
  });

  it('drops a probe answer that arrives after the chain changed, and asks again', async () => {
    let answerFirst: (r: unknown) => void = () => {};
    probeMock.mockReturnValueOnce(new Promise((r) => (answerFirst = r)) as never);
    probeMock.mockResolvedValueOnce({ available: { native: false }, active: null });
    const s = parseSettings({ backendOrder: ['native'], disabledBackends: [] });
    const { container, rerender } = render(ActiveBackendChip, {
      props: { settings: s, onJump: () => {} },
    });
    await tick();
    await rerender({
      settings: { ...s, localServerUrl: 'http://127.0.0.1:1235' },
      onJump: () => {},
    });
    answerFirst({ available: { native: true }, active: asBackendIdUnsafe('native') });
    await waitFor(() => {
      expect(container.querySelector('.chip-name')?.textContent).toBe('Set up backend');
    });
    expect(probeMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.chip-dot')).toBeNull();
  });

  it('popover says a keyed backend missing its key needs a key', async () => {
    probeMock.mockReturnValue(new Promise(() => {}));
    const s = parseSettings({
      backendOrder: ['anthropic', 'openai'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
      openaiApiKey: '',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    const chip = container.querySelector<HTMLButtonElement>('.active-backend-chip');
    if (!chip) throw new Error('chip not rendered');
    chip.click();
    await waitFor(() => {
      const rows = Array.from(document.body.querySelectorAll<HTMLElement>('.chain-row'));
      const openaiRow = rows.find((r) => /OpenAI/.test(String(r.textContent)));
      expect(openaiRow?.querySelector('.chain-status')?.textContent).toBe('Needs a key');
    });
  });

  it('skips the probe when a keyed backend with a key sits first in the order', async () => {
    const s = parseSettings({
      backendOrder: ['anthropic', 'native'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    await tick();
    expect(container.querySelector('.chip-name')?.textContent.trim()).toBe('Anthropic');
    expect(probeMock).not.toHaveBeenCalled();
  });
});

// jsdom has no layout: these check which labels hold the chip's width, so the probe landing does not resize it.
describe('ActiveBackendChip — one width before and after the probe (R63)', () => {
  const held = (container: Element): (string | null)[] =>
    [...container.querySelectorAll('.chip-sizer')].map((s) => s.getAttribute('data-label'));

  it('holds Checking, every key-less name ahead of the first keyed one, and that name', async () => {
    probeMock.mockReturnValue(new Promise(() => {}));
    const s = parseSettings({
      backendOrder: ['native', 'openai', 'ollama', 'anthropic', 'gemini'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
      geminiApiKey: 'test-key',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    await tick();
    // The keyed one names the chip until the probe says a key-less one ahead of it is up.
    expect(container.querySelector('.chip-name')?.textContent).toBe('Anthropic');
    expect(held(container)).toEqual(['Checking', 'Claude Code or Codex', 'Ollama', 'Anthropic']);
    for (const sizer of container.querySelectorAll('.chip-sizer')) {
      expect(sizer.getAttribute('aria-hidden')).toBe('true');
      expect(sizer.classList.contains('has-dot')).toBe(true);
    }
  });

  it('holds Set up backend, without the dot room, when no keyed backend is ready', async () => {
    probeMock.mockResolvedValue({ available: { native: false }, active: null });
    const s = parseSettings({ backendOrder: ['native', 'anthropic'], disabledBackends: [] });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    expect(held(container)).toEqual(['Checking', 'Claude Code or Codex', 'Set up backend']);
    await waitFor(() => {
      expect(container.querySelector('.chip-name')?.textContent).toBe('Set up backend');
    });
    const setUp = container.querySelector('.chip-sizer[data-label="Set up backend"]');
    expect(setUp?.classList.contains('has-dot')).toBe(false);
  });

  it('holds only the name when a keyed backend leads, since nothing can change it', () => {
    const s = parseSettings({
      backendOrder: ['anthropic', 'native'],
      disabledBackends: [],
      anthropicApiKey: 'test-key',
    });
    const { container } = render(ActiveBackendChip, { props: { settings: s, onJump: () => {} } });
    expect(held(container)).toEqual(['Anthropic']);
  });
});
