// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { SHIPPED_TASK_VIEWS } from '@/shared/task-view';
import RulesEditor from '@/options/components/RulesEditor.svelte';
import type { Rule } from '@/shared/rules';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { DEFAULT_SETTINGS } from '@/shared/settings-defaults';
import { RULES_MAX } from '@/shared/settings-schema';
import type { Settings } from '@/shared/types';
import { toastStore, type ToastMsg } from '@/shared/components/toastStore';

function rule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: overrides.id ?? `r-${Math.random().toString(36).slice(2)}`,
    body: overrides.body ?? 'Never invent words.',
    category: overrides.category ?? 'never',
    scope: overrides.scope ?? { tasks: [] },
    source: overrides.source ?? 'manual',
    addedAt: overrides.addedAt ?? '2026-05-09T00:00:00.000Z',
    enabled: overrides.enabled ?? true,
  };
}

/** Renders the card with a parent that applies each write, as the tab does. */
function mount(rules: Rule[], write: (next: readonly Rule[]) => boolean = () => true) {
  const onUpdate = vi.fn(async (next: readonly Rule[]) => {
    const ok = write(next);
    if (ok) await utils.rerender({ rules: [...next], onUpdate });
    return ok;
  });
  const utils = render(RulesEditor, { props: { rules, onUpdate } });
  return { ...utils, onUpdate };
}

function part(container: HTMLElement, id: string, sel: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-rule-id="${id}"] ${sel}`);
  if (!el) throw new Error(`missing ${sel} on ${id}`);
  return el;
}

async function openEditor(container: HTMLElement, id: string): Promise<void> {
  await fireEvent.click(part(container, id, '[data-ega-rule-edit]'));
  await waitFor(() => part(container, id, '[data-ega-rule-body-editor]'));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('RulesEditor rows', () => {
  it('show the whole text, a checkbox named "Use rule: …", and one meta line', () => {
    const { container, getByRole } = mount([
      rule({
        id: 'r1',
        body: 'Keep product names in English.',
        category: 'always',
        scope: { tasks: [] },
      }),
      rule({
        id: 'r2',
        body: 'Always preserve URLs verbatim across every task.',
        category: 'unknown',
        enabled: false,
        scope: { tasks: ['summarize', 'gone-task'], sites: ['twitter.com'] },
      }),
    ]);
    expect(
      getByRole('checkbox', { name: 'Use rule: Keep product names in English.' }),
    ).toBeTruthy();
    const off = getByRole('checkbox', {
      name: 'Use rule: Always preserve URLs verbatim across every task.',
    }) as HTMLInputElement;
    expect(off.checked).toBe(false);
    expect(part(container, 'r1', '[data-ega-rule-meta]').textContent).toBe('Always · All tasks');
    expect(part(container, 'r2', '[data-ega-rule-meta]').textContent).toBe(
      'Other · Summarize, Deleted task · twitter.com',
    );
    // No "On"/"Off" words and no "RULES (n)" heading: the checkbox says it.
    expect(container.textContent).not.toMatch(/RULES \(|\bOff\b/);
  });

  it('the checkbox flips enabled', async () => {
    const { container, onUpdate } = mount([rule({ id: 'r1', enabled: true })]);
    await fireEvent.click(part(container, 'r1', '[data-ega-rule-disable]'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.enabled).toBe(false);
  });

  it('Edit opens the fields below, focuses the text, and becomes Close; Esc closes back to Edit', async () => {
    const { container } = mount([rule({ id: 'r1', body: 'Old body.' })]);
    const edit = part(container, 'r1', '[data-ega-rule-edit]');
    expect(edit.getAttribute('aria-expanded')).toBe('false');
    await openEditor(container, 'r1');
    expect(edit.getAttribute('aria-expanded')).toBe('true');
    expect(edit.textContent.trim()).toBe('Close');
    const text = part(container, 'r1', '[data-ega-rule-body-editor]');
    await waitFor(() => expect(document.activeElement).toBe(text));
    await fireEvent.keyDown(text, { key: 'Escape' });
    await waitFor(() => expect(container.querySelector('[data-ega-rule-body-editor]')).toBeNull());
    expect(document.activeElement).toBe(part(container, 'r1', '[data-ega-rule-edit]'));
  });

  it('the text writes when it is left, and an empty text is refused in place', async () => {
    const { container, onUpdate } = mount([rule({ id: 'r1', body: 'Old body.' })]);
    await openEditor(container, 'r1');
    const text = part(container, 'r1', '[data-ega-rule-body-editor]') as HTMLTextAreaElement;
    await fireEvent.input(text, { target: { value: '   ' } });
    await fireEvent.blur(text);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(text.getAttribute('aria-invalid')).toBe('true');
    const why = document.getElementById(text.getAttribute('aria-describedby') ?? '');
    expect(why?.textContent).toBe('Write the rule text');
    await fireEvent.input(text, { target: { value: 'New body.' } });
    await fireEvent.blur(text);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.body).toBe('New body.');
    await waitFor(() => expect(container.textContent).toContain('Saved'));
  });

  it('Esc writes the text being typed before it closes', async () => {
    const { container, onUpdate } = mount([rule({ id: 'r1', body: 'Old body.' })]);
    await openEditor(container, 'r1');
    const text = part(container, 'r1', '[data-ega-rule-body-editor]');
    await fireEvent.input(text, { target: { value: 'Typed, then Esc.' } });
    await fireEvent.keyDown(text, { key: 'Escape' });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.body).toBe('Typed, then Esc.');
  });

  it('a text write that fails does not say Saved', async () => {
    const { container, onUpdate } = mount([rule({ id: 'r1', body: 'Old body.' })], () => false);
    await openEditor(container, 'r1');
    const text = part(container, 'r1', '[data-ega-rule-body-editor]');
    await fireEvent.input(text, { target: { value: 'New body.' } });
    await fireEvent.blur(text);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(container.textContent).not.toContain('Saved');
  });

  it('Type is a select of type names that writes the category', async () => {
    const { container, onUpdate } = mount([rule({ id: 'r1', category: 'never' })]);
    await openEditor(container, 'r1');
    const select = part(container, 'r1', 'select[data-ega-rule-category]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent.trim())).toEqual([
      'Always',
      'Never',
      'Prefer',
      'Format',
      'Other',
    ]);
    await fireEvent.change(select, { target: { value: 'prefer' } });
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.category).toBe('prefer');
  });

  it('Applies to: a task turns All tasks off, and the last task off turns it back on, with no toast', async () => {
    const push = vi.spyOn(toastStore, 'push');
    const { container, onUpdate } = mount([rule({ id: 'r1', scope: { tasks: [] } })]);
    await openEditor(container, 'r1');
    const all = part(container, 'r1', '[data-ega-rule-scope-all]');
    expect(all.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(part(container, 'r1', '[data-ega-rule-scope-task="summarize"]'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.scope).toEqual({ tasks: ['summarize'] });
    await waitFor(() =>
      expect(part(container, 'r1', '[data-ega-rule-scope-all]').getAttribute('aria-pressed')).toBe(
        'false',
      ),
    );
    await fireEvent.click(part(container, 'r1', '[data-ega-rule-scope-task="summarize"]'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    expect(onUpdate.mock.calls[1]?.[0][0]?.scope).toEqual({ tasks: [] });
    expect(push).not.toHaveBeenCalled();
  });

  it('sites write as hosts when the field is left, and an empty list drops the key', async () => {
    const { container, onUpdate } = mount([
      rule({ id: 'r1', scope: { tasks: ['translate'], sites: ['old.com'] } }),
    ]);
    await openEditor(container, 'r1');
    const sites = part(container, 'r1', '[data-ega-rule-sites]') as HTMLInputElement;
    expect(sites.value).toBe('old.com');
    await fireEvent.input(sites, { target: { value: 'https://www.Twitter.com/x, example.com' } });
    await fireEvent.blur(sites);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.scope).toEqual({
      tasks: ['translate'],
      sites: ['twitter.com', 'example.com'],
    });
    await fireEvent.input(sites, { target: { value: ' ' } });
    await fireEvent.blur(sites);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
    expect(onUpdate.mock.calls[1]?.[0][0]?.scope).toEqual({ tasks: ['translate'] });
  });
});

describe('RulesEditor delete', () => {
  it('Delete rule removes it at once, says Deleted "…" with Undo, and focus moves to the next row', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container, onUpdate } = mount([
      rule({ id: 'r1', body: 'First.' }),
      rule({ id: 'r2', body: 'Second.' }),
    ]);
    await openEditor(container, 'r1');
    await fireEvent.click(part(container, 'r1', '[data-ega-rule-delete]'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0].map((r) => r.id)).toEqual(['r2']);
    expect(push.mock.calls[0]?.[0].message).toBe('Deleted "First."');
    expect(push.mock.calls[0]?.[0].action?.label).toBe('Undo');
    await waitFor(() =>
      expect(document.activeElement).toBe(part(container, 'r2', '[data-ega-rule-disable]')),
    );
  });

  it('deleting the only rule moves focus to the empty state Add rule', async () => {
    vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container } = mount([rule({ id: 'r1' })]);
    await openEditor(container, 'r1');
    await fireEvent.click(part(container, 'r1', '[data-ega-rule-delete]'));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        container.ownerDocument.querySelector('[data-ega-rules-empty] button'),
      ),
    );
  });

  it('a failed delete offers no Undo', async () => {
    const push = vi.spyOn(toastStore, 'push').mockImplementation(() => {});
    const { container, onUpdate } = mount([rule({ id: 'r1' })], () => false);
    await openEditor(container, 'r1');
    await fireEvent.click(part(container, 'r1', '[data-ega-rule-delete]'));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(push).not.toHaveBeenCalled();
  });

  describe('Undo after delete A, then delete B', () => {
    beforeEach(() => resetChromeMock());

    it('splices A back into the stored rules, not the list captured at delete time', async () => {
      const captured: ToastMsg[] = [];
      vi.spyOn(toastStore, 'push').mockImplementation((entry) => {
        captured.push(entry);
      });
      const [r1, r2, r3] = [
        rule({ id: 'r1', body: 'Always preserve URLs.' }),
        rule({ id: 'r2', body: 'Prefer short sentences.' }),
        rule({ id: 'r3', body: 'Never abbreviate.' }),
      ];
      const seeded: Settings = {
        ...DEFAULT_SETTINGS,
        advanced: { ...DEFAULT_SETTINGS.advanced, rules: [r1, r2, r3] },
      };
      chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, seeded);
      const { container, onUpdate } = mount([r1, r2, r3], (next) => {
        chromeMock.storage.local._raw.set(STORAGE_KEYS.settings, {
          ...seeded,
          advanced: { ...seeded.advanced, rules: [...next] },
        });
        return true;
      });
      await openEditor(container, 'r1');
      await fireEvent.click(part(container, 'r1', '[data-ega-rule-delete]'));
      await waitFor(() => expect(captured).toHaveLength(1));
      await openEditor(container, 'r2');
      await fireEvent.click(part(container, 'r2', '[data-ega-rule-delete]'));
      await waitFor(() => expect(captured).toHaveLength(2));
      onUpdate.mockClear();
      captured[0]?.action?.onClick();
      await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
      expect(onUpdate.mock.calls[0]?.[0].map((r) => r.id)).toEqual(['r1', 'r3']);
      await waitFor(() =>
        expect(document.activeElement).toBe(part(container, 'r1', '[data-ega-rule-disable]')),
      );
    });
  });
});

describe('RulesEditor add', () => {
  it('empty: "No rules yet" with Add rule, and no header button', () => {
    const { container, getByText } = mount([]);
    expect(getByText('No rules yet')).toBeTruthy();
    expect(getByText('For example: Keep product names in English')).toBeTruthy();
    expect(container.querySelector('[data-ega-rules-add]')).toBeNull();
    expect(container.querySelector('[data-ega-rules-empty] button')?.textContent.trim()).toBe(
      'Add rule',
    );
  });

  it('Add rule opens the fields at the top as a draft and focuses the text', async () => {
    const { container } = mount([rule({ id: 'r1' })]);
    // The Add pattern: a secondary button with a plus icon, like Add language and New task.
    expect(container.querySelector('[data-ega-rules-add] [data-action-icon="add"]')).not.toBeNull();
    await fireEvent.click(container.querySelector('[data-ega-rules-add]') as HTMLElement);
    const draft = container.querySelector('[data-ega-rule-draft]');
    expect(draft).not.toBeNull();
    // The draft sits above the list.
    const list = container.querySelector('.rule-list') as Element;
    expect((draft?.compareDocumentPosition(list) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(container.querySelector('[data-ega-manual-body]')),
    );
  });

  it('an empty text says "Write the rule text" and adds nothing', async () => {
    const { container, onUpdate } = mount([]);
    await fireEvent.click(container.querySelector('[data-ega-rules-empty] button') as HTMLElement);
    await fireEvent.click(container.querySelector('[data-ega-manual-submit]') as HTMLElement);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Write the rule text');
  });

  it('adds the rule with its type guess, tasks and sites, then focuses the new row', async () => {
    const { container, onUpdate } = mount([]);
    await fireEvent.click(container.querySelector('[data-ega-rules-empty] button') as HTMLElement);
    const draft = container.querySelector('[data-ega-rule-draft]') as HTMLElement;
    await fireEvent.input(draft.querySelector('[data-ega-manual-body]') as HTMLElement, {
      target: { value: 'Never translate brand names.' },
    });
    expect((draft.querySelector('select[data-ega-rule-category]') as HTMLSelectElement).value).toBe(
      'never',
    );
    await fireEvent.click(
      draft.querySelector('[data-ega-rule-scope-task="summarize"]') as HTMLElement,
    );
    await fireEvent.input(draft.querySelector('[data-ega-manual-sites]') as HTMLElement, {
      target: { value: 'twitter.com' },
    });
    await fireEvent.click(draft.querySelector('[data-ega-manual-submit]') as HTMLElement);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    const added = onUpdate.mock.calls[0]?.[0][0];
    expect(added).toMatchObject({
      body: 'Never translate brand names.',
      category: 'never',
      scope: { tasks: ['summarize'], sites: ['twitter.com'] },
      enabled: true,
      source: 'manual',
    });
    await waitFor(() => expect(container.querySelector('[data-ega-rule-draft]')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        part(container, added?.id ?? '', '[data-ega-rule-disable]'),
      ),
    );
  });

  it('a picked type wins over the guess from the text', async () => {
    const { container, onUpdate } = mount([]);
    await fireEvent.click(container.querySelector('[data-ega-rules-empty] button') as HTMLElement);
    const draft = container.querySelector('[data-ega-rule-draft]') as HTMLElement;
    const select = draft.querySelector('select[data-ega-rule-category]') as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'format' } });
    await fireEvent.input(draft.querySelector('[data-ega-manual-body]') as HTMLElement, {
      target: { value: 'Never use bullet points.' },
    });
    expect(select.value).toBe('format');
    await fireEvent.click(draft.querySelector('[data-ega-manual-submit]') as HTMLElement);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate.mock.calls[0]?.[0][0]?.category).toBe('format');
  });

  it('a failed add keeps the draft open with its text', async () => {
    const { container, onUpdate } = mount([], () => false);
    await fireEvent.click(container.querySelector('[data-ega-rules-empty] button') as HTMLElement);
    const body = container.querySelector('[data-ega-manual-body]') as HTMLTextAreaElement;
    await fireEvent.input(body, { target: { value: 'Keep it.' } });
    await fireEvent.click(container.querySelector('[data-ega-manual-submit]') as HTMLElement);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(container.querySelector('[data-ega-rule-draft]')).not.toBeNull();
    expect((container.querySelector('[data-ega-manual-body]') as HTMLTextAreaElement).value).toBe(
      'Keep it.',
    );
  });

  it('Cancel closes the draft and focus goes back to Add rule', async () => {
    const { container } = mount([rule({ id: 'r1' })]);
    const add = container.querySelector('[data-ega-rules-add]') as HTMLElement;
    await fireEvent.click(add);
    const cancel = [...container.querySelectorAll('[data-ega-rule-draft] button')].find(
      (b) => b.textContent.trim() === 'Cancel',
    ) as HTMLElement;
    await fireEvent.click(cancel);
    await waitFor(() => expect(container.querySelector('[data-ega-rule-draft]')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(add));
  });

  it('at the cap, Add rule stays focusable, says why, and opens nothing', async () => {
    const rules = Array.from({ length: RULES_MAX }, (_, i) => rule({ id: `r${i}`, body: `R${i}` }));
    const { container } = mount(rules);
    const add = container.querySelector('[data-ega-rules-add]') as HTMLElement;
    expect(add.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      `You have the most rules Ega keeps (${RULES_MAX})`,
    );
    await fireEvent.click(add);
    expect(container.querySelector('[data-ega-rule-draft]')).toBeNull();
  });

  it('warns when the rules for one request pass the size limit', () => {
    const long = Array.from({ length: 20 }, (_, i) =>
      rule({
        id: `r${i}`,
        body: `Rule ${i}: ${'cite the clause every time. '.repeat(16)}`.slice(0, 480),
      }),
    );
    const { container } = mount(long);
    expect(container.querySelector('[data-ega-rules-budget-warn]')).not.toBeNull();
  });

  it('the new row scrolls into view without smooth motion under reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { container } = mount([rule({ id: 'r1' })]);
    await fireEvent.click(container.querySelector('[data-ega-rules-add]') as HTMLElement);
    await fireEvent.input(container.querySelector('[data-ega-manual-body]') as HTMLElement, {
      target: { value: 'Keep product names.' },
    });
    await fireEvent.click(container.querySelector('[data-ega-manual-submit]') as HTMLElement);
    await waitFor(() => expect(scroll).toHaveBeenCalled());
    for (const call of scroll.mock.calls) expect(call[0]).toMatchObject({ behavior: 'auto' });
  });

  it('uses the shipped task list when the tab passes none', async () => {
    const { container } = mount([rule({ id: 'r1' })]);
    await openEditor(container, 'r1');
    const names = [...container.querySelectorAll('[data-ega-rule-scope-task]')].map((b) =>
      b.textContent.trim(),
    );
    expect(names).toEqual(SHIPPED_TASK_VIEWS.map((v) => v.label));
  });
});
