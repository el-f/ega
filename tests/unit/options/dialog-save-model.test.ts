// @vitest-environment jsdom
/**
 * Spec 5.1 across the three dialogs: each valid field saves on its own, an invalid field is held back and named
 * until it is fixed, closing with one asks first and names it, and a typed edit is never lost to blur, unmount,
 * page close or Export.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '@tests/mocks/chrome';
import { STORAGE_KEYS } from '@/shared/constants';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { getCustomLanguages, getCustomTasks, getSettings } from '@/shared/storage';
import { listVarieties } from '@/shared/varieties';
import { addCustomTask } from '@/shared/tasks';
import { TEXT_SAVE_DELAY_MS } from '@/options/components/dialog-saver.svelte';
import { flushAsync } from '@tests/_helpers/async';

vi.mock('@/shared/components/confirmDialog', () => ({ confirmDialog: vi.fn(async () => true) }));
const download = vi.fn();
vi.mock('@/shared/download-file', () => ({
  downloadJsonFile: (...a: unknown[]) => download(...a),
}));

const LanguageDialog = (await import('@/options/components/LanguageDialog.svelte')).default;
const CustomTaskDialog = (await import('@/options/components/CustomTaskDialog.svelte')).default;
const TaskEditDialog = (await import('@/options/components/TaskEditDialog.svelte')).default;

const confirm = vi.mocked(confirmDialog);

const CUSTOM = {
  id: 'custom-test-id',
  label: 'My Slang',
  hint: 'team speak',
  examples: [{ src: 'yo', tgt: 'hi' }],
  createdAt: 1000,
};
const TASK = {
  label: 'Polite reply',
  system: 'Be polite.',
  user: 'TEXT:\n{{text}}',
  output: 'plain' as const,
  pageContext: false,
  image: false,
  glossary: false,
};

function q<T extends Element = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`no ${sel}`);
  return el;
}
const status = (): string =>
  document.querySelector('[data-ega-dialog-status]')?.textContent.trim() ?? '';
// Long enough for the typing pause to end and the write to land.
const SAVED = { timeout: TEXT_SAVE_DELAY_MS + 1500 };
const done = (): Promise<boolean> => fireEvent.click(q('[data-ega-dialog-done]'));
const nameField = (): HTMLInputElement =>
  q<HTMLInputElement>('input[data-ega-language-name], [data-ega-language-name] input');
const taskName = (): HTMLInputElement =>
  q<HTMLInputElement>('input[data-ega-custom-task-name], [data-ega-custom-task-name] input');

async function openLanguage(id: string) {
  const s = await getSettings();
  const language = (await listVarieties({ enabledOnly: false })).find((v) => v.id === id) ?? null;
  const onClose = vi.fn();
  const utils = render(LanguageDialog, { props: { s, language, onClose, onSaved: vi.fn() } });
  return { ...utils, onClose };
}

async function setPattern(regex: string): Promise<void> {
  const body = q<HTMLDetailsElement>('[data-ega-language-detect]');
  body.open = true;
  await fireEvent.input(body.querySelector('input') as HTMLInputElement, {
    target: { value: regex },
  });
}

beforeEach(() => {
  resetChromeMock();
  confirm.mockReset();
  confirm.mockResolvedValue(true);
  download.mockClear();
});

describe('language dialog: each text field saves on its own', () => {
  beforeEach(() => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
  });

  it('an empty name is held back while the notes and an example still save', async () => {
    await openLanguage(CUSTOM.id);
    await fireEvent.input(nameField(), { target: { value: ' ' } });
    await fireEvent.input(q('[data-ega-language-notes]'), { target: { value: 'rewritten notes' } });
    await fireEvent.input(q('[data-ega-language-example="0"] input:nth-of-type(2)'), {
      target: { value: 'hello' },
    });
    await waitFor(async () => {
      const row = (await getCustomLanguages())[0];
      expect(row?.hint).toBe('rewritten notes');
      expect(row?.examples[0]?.tgt).toBe('hello');
    }, SAVED);
    expect((await getCustomLanguages())[0]?.label).toBe('My Slang');
    // The other fields saved, and the footer still names the one that did not.
    await flushAsync();
    expect(status()).toBe('Not saved: add a name');
  });

  it('closing with an empty name asks first and names the field', async () => {
    confirm.mockResolvedValueOnce(false);
    const { onClose } = await openLanguage(CUSTOM.id);
    await fireEvent.input(q('[data-ega-language-notes]'), { target: { value: '' } });
    await done();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'Close without this change?',
      body: 'Your last change to the notes is not valid, so it was not saved.',
      confirmLabel: 'Close anyway',
      cancelLabel: 'Keep editing',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect((await getCustomLanguages())[0]?.hint).toBe('team speak');
  });

  it('a bad pattern is held back while a notes edit of a built-in saves; the confirm names the pattern', async () => {
    const { onClose } = await openLanguage('arabizi');
    await setPattern('(oops');
    await fireEvent.input(q('[data-ega-language-notes]'), {
      target: { value: 'my arabizi notes' },
    });
    await waitFor(
      async () =>
        expect((await getSettings()).varietyOverrides['arabizi']?.hint).toBe('my arabizi notes'),
      SAVED,
    );
    await flushAsync();
    expect(status()).toBe('Not saved: the pattern is not valid');
    await done();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0].body).toBe(
      'Your last change to the auto-detect pattern is not valid, so it was not saved.',
    );
    expect((await getSettings()).varietyOverrides['arabizi']?.autoDetect).toBeUndefined();
  });

  it('two invalid fields are both named', async () => {
    await openLanguage(CUSTOM.id);
    await fireEvent.input(nameField(), { target: { value: '' } });
    await fireEvent.input(q('[data-ega-language-notes]'), { target: { value: '' } });
    await done();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0].body).toBe(
      'Your last changes to the name and the notes are not valid, so they were not saved.',
    );
  });

  it('fixing the field clears its error and saves it', async () => {
    await openLanguage(CUSTOM.id);
    await fireEvent.input(nameField(), { target: { value: '' } });
    await waitFor(() => expect(status()).toBe('Not saved: add a name'));
    await fireEvent.input(nameField(), { target: { value: 'Our Slang' } });
    await waitFor(
      async () => expect((await getCustomLanguages())[0]?.label).toBe('Our Slang'),
      SAVED,
    );
    await waitFor(() => expect(status()).toBe('Saved'));
    await done();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('custom task dialog: each field saves on its own', () => {
  it('a toggle clicked while the first create is still writing is written too', async () => {
    const local = chromeMock.storage.local;
    const realSet = local.set;
    let release: (() => void) | null = null;
    vi.spyOn(local, 'set').mockImplementation(((
      items: Record<string, unknown>,
      cb?: () => void,
    ) => {
      if (release === null && STORAGE_KEYS.customTasks in items) {
        return new Promise<void>((resolve) => {
          release = () => void realSet(items, cb).then(resolve);
        });
      }
      return realSet(items, cb);
    }) as typeof local.set);
    render(CustomTaskDialog, {
      props: { s: await getSettings(), onClose: vi.fn(), onSaved: vi.fn() },
    });
    await fireEvent.input(taskName(), { target: { value: 'Polite reply' } });
    await waitFor(() => expect(release).not.toBeNull(), { timeout: 2000 });
    await fireEvent.click(q<HTMLInputElement>('input[data-ega-custom-task-glossary]'));
    (release as unknown as () => void)();
    await waitFor(async () => expect((await getCustomTasks())[0]?.glossary).toBe(true));
    expect(await getCustomTasks()).toHaveLength(1);
  });

  it('a Message without {{text}} is held back while Effort still saves, and the footer keeps naming it', async () => {
    const row = await addCustomTask(TASK);
    const onClose = vi.fn();
    render(CustomTaskDialog, {
      props: { s: await getSettings(), row, onClose, onSaved: vi.fn() },
    });
    await fireEvent.input(q('[data-ega-template-user] textarea'), {
      target: { value: 'TEXT: nothing here' },
    });
    await fireEvent.click(q('[data-ega-custom-task-effort] [data-ega-effort-value="high"]'));
    await fireEvent.click(q<HTMLInputElement>('input[data-ega-custom-task-glossary]'));
    await waitFor(async () => {
      const stored = (await getCustomTasks())[0];
      expect(stored?.effort).toBe('high');
      expect(stored?.glossary).toBe(true);
    }, SAVED);
    expect((await getCustomTasks())[0]?.user).toBe(TASK.user);
    await flushAsync();
    expect(status()).toBe('Not saved: the message needs the Selected text variable');
    await done();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0]?.[0].body).toBe(
      'Your last change to the message is not valid, so it was not saved.',
    );
  });

  it('an empty name is held back while a prompt edit saves', async () => {
    const row = await addCustomTask(TASK);
    render(CustomTaskDialog, {
      props: { s: await getSettings(), row, onClose: vi.fn(), onSaved: vi.fn() },
    });
    await fireEvent.input(taskName(), { target: { value: '' } });
    await fireEvent.input(q('[data-ega-template-system] textarea'), {
      target: { value: 'Be very polite.' },
    });
    await waitFor(
      async () => expect((await getCustomTasks())[0]?.system).toBe('Be very polite.'),
      SAVED,
    );
    expect((await getCustomTasks())[0]?.label).toBe('Polite reply');
    await flushAsync();
    expect(status()).toBe('Not saved: add a name');
  });
});

describe('built-in task dialog: the footer keeps an unsaved field named', () => {
  it('a later Effort save does not hide the Message error', async () => {
    render(TaskEditDialog, {
      props: { s: await getSettings(), task: 'summarize', onClose: vi.fn(), onSaved: vi.fn() },
    });
    await fireEvent.input(q('[data-ega-template-user] textarea'), { target: { value: 'no slot' } });
    await waitFor(() =>
      expect(status()).toBe('Not saved: the message needs the Selected text variable'),
    );
    await fireEvent.click(q('[data-ega-task-effort] [data-ega-effort-value="high"]'));
    await waitFor(async () =>
      expect((await getSettings()).taskOverrides.summarize?.effort).toBe('high'),
    );
    await flushAsync();
    expect(status()).toBe('Not saved: the message needs the Selected text variable');
  });
});

describe('a typed edit is not lost', () => {
  it('leaving the field saves at once, before the pause ends', async () => {
    render(TaskEditDialog, {
      props: { s: await getSettings(), task: 'summarize', onClose: vi.fn(), onSaved: vi.fn() },
    });
    const ta = q<HTMLTextAreaElement>('[data-ega-template-system] textarea');
    await fireEvent.input(ta, { target: { value: 'Short rules.' } });
    await fireEvent.focusOut(ta);
    await waitFor(
      async () =>
        expect((await getSettings()).taskOverrides.summarize?.system).toBe('Short rules.'),
      { timeout: TEXT_SAVE_DELAY_MS / 2 },
    );
  });

  it('closing the page saves what is waiting', async () => {
    render(TaskEditDialog, {
      props: { s: await getSettings(), task: 'summarize', onClose: vi.fn(), onSaved: vi.fn() },
    });
    await fireEvent.input(q('[data-ega-template-system] textarea'), {
      target: { value: 'Page closes now.' },
    });
    window.dispatchEvent(new Event('pagehide'));
    await waitFor(
      async () =>
        expect((await getSettings()).taskOverrides.summarize?.system).toBe('Page closes now.'),
      { timeout: TEXT_SAVE_DELAY_MS / 2 },
    );
  });

  it('a dialog taken away inside the pause still saves what was typed', async () => {
    const { unmount } = render(TaskEditDialog, {
      props: { s: await getSettings(), task: 'summarize', onClose: vi.fn(), onSaved: vi.fn() },
    });
    await fireEvent.input(q('[data-ega-template-system] textarea'), {
      target: { value: 'Typed just before the tab switch.' },
    });
    unmount();
    await waitFor(
      async () =>
        expect((await getSettings()).taskOverrides.summarize?.system).toBe(
          'Typed just before the tab switch.',
        ),
      { timeout: TEXT_SAVE_DELAY_MS / 2 },
    );
  });

  it('a page close with a field held back asks the browser to warn', async () => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
    await openLanguage(CUSTOM.id);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    await fireEvent.input(q('[data-ega-language-notes]'), { target: { value: '' } });
    const held = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
  });

  it('Export writes the notes typed a moment ago', async () => {
    chromeMock.storage.local._raw.set(STORAGE_KEYS.customLanguages, [CUSTOM]);
    await openLanguage(CUSTOM.id);
    await fireEvent.input(q('[data-ega-language-notes]'), { target: { value: 'fresh notes' } });
    await fireEvent.click(q('[data-ega-language-export]'));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const bundle = download.mock.calls[0]?.[1] as { egaLanguage: { language: { hint: string } } };
    expect(bundle.egaLanguage.language.hint).toBe('fresh notes');
  });
});
