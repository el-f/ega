// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';

class FakeRecognition {
  lang = '';
  interimResults = false;
  continuous = false;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

const baseProps = () => ({
  value: '',
  sourceLang: 'auto',
  targetLang: 'en',
  swapDisabled: false,
  task: 'translate' as const,
  tone: 'neutral' as const,
  usesTone: false,
  varieties: [],
  pageContextLevel: 'minimal' as const,
  attachedImage: null,
  turns: [] as const,
  inflight: false,
  streaming: true,
  onSwap: vi.fn(),
  onContextLevelChange: vi.fn(),
  onAttachImage: vi.fn(),
  onClearAttachedImage: vi.fn(),
  onSend: vi.fn(),
  onCancel: vi.fn(),
  onToggleStreaming: vi.fn(),
});

describe('InputRow — accessible names and tooltips', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('composer textarea carries an accessible name (aria-label)', () => {
    const { container } = render(InputRow, { props: baseProps() });
    const ta = container.querySelector('textarea#sp-text');
    expect(ta?.getAttribute('aria-label')).toBe('Message');
    // Placeholder stays as a hint.
    expect(ta?.getAttribute('placeholder') ?? '').not.toBe('');
  });

  it('mic button exposes a hover tooltip mirroring its dictation state', () => {
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    const { container } = render(InputRow, { props: baseProps() });
    const mic = container.querySelector('[data-ega-mic]');
    expect(mic).not.toBeNull();
    expect(mic?.getAttribute('data-tooltip')).toBe('Dictate in English');
    // top-end: the send row sits at the right viewport edge, where a centered tooltip collapses.
    expect(mic?.getAttribute('data-tooltip-placement')).toBe('top-end');
  });

  // Composer swap button migrated from native `title` to the
  // shared data-tooltip mechanism so it matches its row-mates' styling.
  it('composer swap button uses data-tooltip, not native title', () => {
    const { container } = render(InputRow, { props: baseProps() });
    const swap = container.querySelector('.swap');
    expect(swap).not.toBeNull();
    expect(swap?.hasAttribute('title')).toBe(false);
    expect(swap?.getAttribute('data-tooltip')).toBe('Swap source and target');
    expect(swap?.getAttribute('data-tooltip-placement')).toBe('top');
    // aria-label stays as the accessible name.
    expect(swap?.getAttribute('aria-label')).toBe('Swap source and target');
  });
});
