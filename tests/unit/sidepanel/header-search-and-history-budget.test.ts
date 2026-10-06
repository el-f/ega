// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { searchTurns } from '@/sidepanel/state/conversation';
import { estimateTokens, chatContextLabel } from '@/shared/chat-history';
import LanguagePicker from '@/shared/components/LanguagePicker.svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import type { UserTurnData } from '@/sidepanel/state/conversation';
import type { Variety } from '@/shared/types';

const turn = (over: Partial<UserTurnData> = {}): UserTurnData => ({
  createdAt: 1,
  id: 'u1',
  role: 'user',
  kind: 'translate',
  status: 'idle',
  content: 'hola',
  ...over,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('the header stops changing shape', () => {
  const src = readFileSync('src/sidepanel/SidePanel.svelte', 'utf8');

  it('keeps the export items in the More menu, disabled on an empty thread', () => {
    const menu = readFileSync('src/sidepanel/HeaderMoreMenu.svelte', 'utf8');
    expect(src).toMatch(/<HeaderMoreMenu\s+\{isEmptyThread\}/);
    expect(src).not.toMatch(/\{#if conversation\.turns\.length > 0\}/);
    expect(menu).toMatch(/disabled=\{isEmptyThread\}[\s\S]{0,80}?data-ega-export-markdown/);
    expect(menu).toMatch(/disabled=\{isEmptyThread\}[\s\S]{0,80}?data-ega-export-json/);
  });

  it('names the export by site and day instead of one fixed filename', () => {
    expect(src).not.toMatch(/'ega-conversation\.json'/);
    expect(src).toMatch(/function exportFileName/);
    expect(src).toMatch(/Saved \$\{a\.download\}/);
  });

  it('never wraps: every control keeps its width and only the backend chip gives some up', () => {
    const header = /\.sp-header \{([^}]*)\}/.exec(src)?.[1] ?? '';
    expect(header).not.toMatch(/flex-wrap:\s*wrap/);
    expect(src).toMatch(/\.sp-header > :global\(\*\) \{\s*flex-shrink: 0;/);
    expect(src).toMatch(/\.sp-header > :global\(\.active-backend-chip\) \{\s*flex-shrink: 1;/);
  });
});

describe('search matches text typed without its marks', () => {
  it('finds pointed Hebrew from an unpointed query', () => {
    const turns = [turn({ id: 'u1', content: 'שָׁלוֹם עוֹלָם' })];
    expect(searchTurns(turns, 'שלום')).toHaveLength(1);
  });

  it('finds decomposed text pasted from a PDF', () => {
    const turns = [turn({ id: 'u1', content: 'école' })];
    expect(searchTurns(turns, 'école')).toHaveLength(1);
  });

  it('still matches plain ASCII case-insensitively', () => {
    const turns = [turn({ id: 'u1', content: 'Hello World' })];
    expect(searchTurns(turns, 'hello')).toHaveLength(1);
    expect(searchTurns(turns, 'nope')).toHaveLength(0);
  });
});

describe('the history budget counts non-Latin scripts at their real cost', () => {
  it('charges Hebrew and CJK more than Latin per character', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('שלום')).toBe(2);
    expect(estimateTokens('你好世界')).toBe(4);
  });

  it('stays 0 for empty and at least 1 for anything', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a')).toBe(1);
  });

  it('does not count the exchange that is still streaming', () => {
    const history = [
      { role: 'user' as const, status: 'idle' as const, content: 'one' },
      { role: 'assistant' as const, status: 'done' as const, content: 'first' },
      { role: 'user' as const, status: 'idle' as const, content: 'two' },
      { role: 'assistant' as const, status: 'streaming' as const, content: 'partial' },
    ];
    expect(chatContextLabel(history, { budgetTokens: 1000 })).toBe('Using 2 earlier messages');
  });
});

describe('a language value with no option still shows', () => {
  it('renders the raw value rather than an empty box', () => {
    const { container } = render(LanguagePicker, {
      props: { id: 'lp1', value: 'a-variety-that-was-deleted', varieties: [] as Variety[] },
    });
    const orphan = container.querySelector('[data-ega-lang-orphan]');
    expect(orphan?.textContent).toBe('a-variety-that-was-deleted');
  });

  it('names a disabled variety as disabled', () => {
    const varieties = [
      { id: 'arabizi', label: 'Arabizi', kind: 'builtin', disabled: true },
    ] as unknown as Variety[];
    const { container } = render(LanguagePicker, {
      props: { id: 'lp2', value: 'arabizi', varieties },
    });
    expect(container.querySelector('[data-ega-lang-orphan]')?.textContent).toBe(
      'Arabizi (disabled)',
    );
  });

  it('adds nothing when the value has a real option', () => {
    const { container } = render(LanguagePicker, {
      props: { id: 'lp3', value: 'en', varieties: [] as Variety[] },
    });
    expect(container.querySelector('[data-ega-lang-orphan]')).toBeNull();
  });
});

describe('a keyless first run says what to do', () => {
  it('offers backend setup in the empty state, and only when no backend is ready', async () => {
    const onSetUpBackend = vi.fn();
    const { container, rerender } = render(ConversationStream, {
      props: {
        turns: [],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
        backendReady: false,
        onSetUpBackend,
      },
    });
    const cta = container.querySelector<HTMLButtonElement>('[data-ega-sidepanel-empty] button');
    expect(cta?.textContent.trim()).toBe('Set up a backend');
    await fireEvent.click(cta as HTMLButtonElement);
    expect(onSetUpBackend).toHaveBeenCalledTimes(1);

    await rerender({
      turns: [],
      focusedTurnId: null,
      onRetry: vi.fn(),
      onFocusChange: vi.fn(),
      backendReady: true,
      onSetUpBackend,
    });
    expect(container.querySelector('[data-ega-sidepanel-empty] button')).toBeNull();
  });
});
