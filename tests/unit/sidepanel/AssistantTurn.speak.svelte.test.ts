// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import ConversationStream from '@/sidepanel/conversation/ConversationStream.svelte';
import type { AssistantTurnData } from '@/sidepanel/state/conversation';
import { asLangSelection } from '@/shared/brands';
import { metaText, openMenu } from './_reply';

/** jsdom has no speech engine; this one records what was said and ends on cancel, as Chrome does. */
class FakeUtterance {
  lang = '';
  voice: { name: string } | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
const spoken: FakeUtterance[] = [];
// A network voice reads the text on a server, so it must never be picked.
const VOICES = [
  { name: 'Google español', lang: 'es-ES', localService: false, default: false },
  { name: 'Sabina', lang: 'es-MX', localService: true, default: false },
  { name: 'Zira', lang: 'en-US', localService: true, default: true },
  { name: 'Hortense', lang: 'fr-FR', localService: true, default: false },
  { name: 'Jon', lang: 'nb-NO', localService: true, default: false },
];
let voices: typeof VOICES = VOICES;
let voicesChanged: (() => void) | null = null;
const synth = {
  getVoices: vi.fn(() => voices),
  speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
  cancel: vi.fn(() => {
    for (const u of spoken.splice(0)) u.onerror?.();
  }),
  addEventListener: vi.fn((_: string, fn: () => void) => (voicesChanged = fn)),
  removeEventListener: vi.fn(() => (voicesChanged = null)),
};

function doneTurn(overrides: Partial<AssistantTurnData> = {}): AssistantTurnData {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 1,
    kind: 'translate',
    status: 'done',
    content: 'hola amigo',
    attachedToTurnId: 'u1',
    ...overrides,
  };
}

/** Reading shows in the meta line as "Reading aloud · Stop"; the Stop is the only control there. */
const reading = (c: HTMLElement): boolean => c.querySelector('[data-ega-meta-stop]') !== null;

/** The voice list is read asynchronously, so the read starts a few microtasks after the click. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function press(c: HTMLElement): Promise<void> {
  await openMenu(c, 'more');
  const item = document.querySelector<HTMLElement>('[data-ega-speak]');
  if (!item) throw new Error('no Read aloud item');
  await fireEvent.click(item);
  await settle();
}

beforeEach(() => {
  voices = VOICES;
  voicesChanged = null;
  spoken.length = 0;
  synth.speak.mockClear();
  synth.cancel.mockClear();
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AssistantTurn — read the answer aloud', () => {
  it('reads the answer in the language it answers in', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    expect(reading(container)).toBe(false);
    await press(container);

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0]?.text).toBe('hola amigo');
    expect(spoken[0]?.voice?.name).toBe('Sabina');
    expect(spoken[0]?.lang).toBe('es-MX');
    expect(reading(container)).toBe(true);
  });

  it('waits for the voice list when the browser has not loaded it yet', async () => {
    voices = [];
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    expect(synth.speak).not.toHaveBeenCalled();

    voices = VOICES;
    if (!voicesChanged) throw new Error('never waited for voiceschanged');
    voicesChanged();
    await settle();

    expect(spoken[0]?.voice?.name).toBe('Sabina');
    expect(synth.removeEventListener).toHaveBeenCalled();
  });

  it('reads nothing when the turn goes away while the voice list loads', async () => {
    voices = [];
    const { container, unmount } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    unmount();

    voices = VOICES;
    voicesChanged?.();
    await settle();

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('a language-change variant reads in its own language', async () => {
    const turn = doneTurn({
      variants: [
        { id: 'v1', status: 'done', content: 'bonjour', targetLang: asLangSelection('fr') },
      ],
      activeVariantIdx: 0,
      content: 'bonjour',
    });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Hortense');
  });

  it('reads a Reword answer in the language of the input, not the target', async () => {
    const turn = doneTurn({ kind: 'reword', detectedLang: 'fr', content: 'autrement dit' });
    const { container } = render(AssistantTurn, {
      props: { turn, onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Hortense');
  });

  it('reads a Grammar answer in the source the send named when the model named none', async () => {
    const turn = doneTurn({ kind: 'grammar', content: 'corrigé' });
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        sourceLang: asLangSelection('fr'),
        targetLang: asLangSelection('es'),
      },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Hortense');
  });

  it('the stream hands each answer the source its send named', async () => {
    const user = {
      id: 'u1',
      role: 'user' as const,
      kind: 'grammar' as const,
      status: 'idle' as const,
      content: 'je suis allé',
      createdAt: 1,
      dispatch: {
        sourceLang: asLangSelection('fr'),
        targetLang: asLangSelection('es'),
        stream: true,
      },
    };
    const { container } = render(ConversationStream, {
      props: {
        turns: [user, doneTurn({ kind: 'grammar', content: 'je suis allé' })],
        focusedTurnId: null,
        onRetry: vi.fn(),
        onFocusChange: vi.fn(),
      },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Hortense');
  });

  it('a swap variant on a Grammar answer still reads in the input language', async () => {
    const turn = doneTurn({
      kind: 'grammar',
      content: 'corrigé',
      variants: [
        {
          id: 'v1',
          status: 'done',
          content: 'corrigé',
          sourceLang: asLangSelection('es'),
          targetLang: asLangSelection('fr'),
        },
      ],
      activeVariantIdx: 0,
    });
    const { container } = render(AssistantTurn, {
      props: {
        turn,
        onRetry: vi.fn(),
        sourceLang: asLangSelection('fr'),
        targetLang: asLangSelection('es'),
      },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Hortense');
  });

  it('reads Norwegian with a voice tagged nb', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('no') },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Jon');
  });

  it('reads a target that is not a language code with the default local voice', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('arabizi') },
    });
    await press(container);
    expect(spoken[0]?.voice?.name).toBe('Zira');
  });

  it('reads nothing, and says so, when no local voice speaks the language', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('de') },
    });
    await press(container);

    expect(synth.speak).not.toHaveBeenCalled();
    // Said next to the reply, not in a toast at the far end of the panel.
    expect(metaText(container)[0]).toBe('No voice for German on this computer');
    expect(reading(container)).toBe(false);
  });

  it('never falls back to a network voice', async () => {
    voices = VOICES.filter((v) => !v.localService);
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);

    expect(synth.speak).not.toHaveBeenCalled();
    expect(reading(container)).toBe(false);
  });

  it('a second press stops it and the button goes back', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    await press(container);

    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(reading(container)).toBe(false);
  });

  it('a late end event from the stopped read does not flip the new one', async () => {
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    const first = spoken[0];
    await press(container);
    await press(container);

    first?.onend?.();
    await settle();
    expect(reading(container)).toBe(true);
  });

  it('stops reading when a refine replaces the answer', async () => {
    const { container, rerender } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn(), targetLang: asLangSelection('es') },
    });
    await press(container);
    expect(synth.speak).toHaveBeenCalledTimes(1);

    await rerender({ turn: doneTurn({ status: 'pending', content: '' }) });
    expect(synth.cancel).toHaveBeenCalled();

    await rerender({ turn: doneTurn({ content: 'hola de nuevo' }) });
    expect(reading(container)).toBe(false);
  });

  it('offers nothing to read where the browser has no speech engine', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    const { container } = render(AssistantTurn, {
      props: { turn: doneTurn(), onRetry: vi.fn() },
    });
    await openMenu(container, 'more');
    expect(document.querySelector('[data-ega-speak]')).toBeNull();
  });
});
