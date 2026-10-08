// @vitest-environment jsdom
// A panel menu closed by a press outside leaves focus where the press put it; Esc still returns it to the trigger.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import AssistantTurn from '@/sidepanel/conversation/AssistantTurn.svelte';
import UserTurn from '@/sidepanel/conversation/UserTurn.svelte';
import HeaderMoreMenu from '@/sidepanel/HeaderMoreMenu.svelte';
import InputRow from '@/sidepanel/conversation/InputRow.svelte';
import { composerProps } from './_composer';
import { doneReply, replyProps } from './_reply';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** Focuses the trigger and opens its menu from the keyboard, as a user would; bits renders the menu in a portal. */
async function openFrom(trigger: HTMLElement): Promise<HTMLElement> {
  trigger.focus();
  await fireEvent.keyDown(trigger, { key: 'Enter' });
  const menu = await waitFor(() => {
    const m = document.querySelector<HTMLElement>('[role="menu"]');
    if (!m) throw new Error('menu not open');
    return m;
  });
  await waitFor(() => expect(menu.contains(document.activeElement)).toBe(true));
  return menu;
}

/** A mouse press on `el`, with the focus move the browser makes; the point lies outside the (unlaid-out) menu box. */
async function pressOn(el: HTMLElement): Promise<void> {
  const at = { clientX: 50, clientY: 50, button: 0, pointerType: 'mouse' };
  await fireEvent.pointerDown(el, at);
  el.focus();
  await fireEvent.pointerUp(el, at);
  await fireEvent.click(el, at);
}

const menuGone = (): Promise<void> =>
  waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull());

const triggers: { name: string; mount: () => HTMLElement }[] = [
  {
    name: 'the reply More menu',
    mount: () =>
      render(AssistantTurn, {
        props: replyProps(doneReply()),
      }).container.querySelector<HTMLElement>('[data-ega-action="more"]') as HTMLElement,
  },
  {
    name: 'the reply Refine menu',
    mount: () =>
      render(AssistantTurn, {
        props: replyProps(doneReply()),
      }).container.querySelector<HTMLElement>('[data-ega-action="refine"]') as HTMLElement,
  },
  {
    name: 'the message More menu',
    mount: () =>
      render(UserTurn, {
        props: {
          turn: {
            id: 'u1',
            role: 'user',
            kind: 'translate',
            status: 'idle',
            content: 'hola',
            createdAt: 1,
          },
        },
      }).container.querySelector<HTMLElement>('[data-ega-action="more"]') as HTMLElement,
  },
  {
    name: 'the header More menu',
    mount: () =>
      render(HeaderMoreMenu, {
        props: {
          isEmptyThread: false,
          bookmarkFilter: false,
          onCopyMarkdown: vi.fn(),
          onDownloadJson: vi.fn(),
          onShowShortcuts: vi.fn(),
          onOpenSettings: vi.fn(),
        },
      }).container.querySelector<HTMLElement>('[data-ega-header-more]') as HTMLElement,
  },
  {
    name: 'the composer Add menu',
    mount: () => {
      // Add is a menu only where dictation exists; without it, it is the paperclip button.
      vi.stubGlobal(
        'SpeechRecognition',
        class {
          start(): void {}
          stop(): void {}
        },
      );
      return render(InputRow, { props: composerProps() }).container.querySelector<HTMLElement>(
        '[data-ega-add]',
      ) as HTMLElement;
    },
  },
];

describe('panel menus and focus on close', () => {
  for (const t of triggers) {
    it(`${t.name}: a press on the message box leaves focus in the box`, async () => {
      const box = document.createElement('textarea');
      document.body.append(box);
      await openFrom(t.mount());
      await pressOn(box);
      await menuGone();
      expect(document.activeElement).toBe(box);
    });

    it(`${t.name}: Esc returns focus to the trigger`, async () => {
      const trigger = t.mount();
      const menu = await openFrom(trigger);
      await fireEvent.keyDown(menu, { key: 'Escape' });
      await menuGone();
      expect(document.activeElement).toBe(trigger);
    });
  }
});
