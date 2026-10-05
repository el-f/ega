// @vitest-environment jsdom
// Drafts live at module scope. This file has its own module instance, so its unload-guard checks start clean.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { chromeMock, resetChromeMock } from '../../mocks/chrome';
import { confirmDialog } from '@/shared/components/confirmDialog';
import { toastStore } from '@/shared/components/toastStore';
import { getCustomLanguages, getSettings } from '@/shared/storage';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

const Languages = (await import('@/options/tabs/Languages.svelte')).default;

const KEY = 'ega.customLanguages';
let id = '';
let uid = 0;

function seed(): void {
  uid += 1;
  id = `unsaved-${uid}`;
  chromeMock.storage.local._raw.set(KEY, [
    { id, label: `Unsaved Lang ${uid}`, hint: 'first hint', examples: [], createdAt: 1 },
  ]);
}
/** Writes the stored language the way another window or an import would. */
function storeLang(patch: Record<string, unknown>): void {
  const cur = chromeMock.storage.local._raw.get(KEY) as Record<string, unknown>[];
  chromeMock.storage.local._raw.set(
    KEY,
    cur.map((c) => (c['id'] === id ? { ...c, ...patch } : c)),
  );
}

const rowEl = (): Element | undefined =>
  [...document.querySelectorAll('.variety-row')].find((r) =>
    r.textContent.includes(`Unsaved Lang ${uid}`),
  );
const nameBtn = (): HTMLButtonElement => {
  const el = rowEl()?.querySelector<HTMLButtonElement>('button.variety-label-inline');
  if (!el) throw new Error('name button not found');
  return el;
};
const hint = (): HTMLTextAreaElement => {
  const el = document.getElementById(`hint-${id}`);
  if (!(el instanceof HTMLTextAreaElement)) throw new Error('hint field not found');
  return el;
};
const commitButton = (label: string): HTMLButtonElement => {
  const b = [...document.querySelectorAll<HTMLButtonElement>('.variety-commit-row button')].find(
    (x) => x.textContent.trim() === label,
  );
  if (!b) throw new Error(`${label} button not found`);
  return b;
};
/** True when the page would ask before closing. */
function unloadBlocked(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

async function openAndEdit(text: string): Promise<void> {
  await waitFor(() => expect(rowEl()).toBeTruthy());
  await fireEvent.click(nameBtn());
  await waitFor(() => expect(hint().value).toBe('first hint'));
  await fireEvent.input(hint(), { target: { value: text } });
  await waitFor(() => expect(rowEl()?.querySelector('.badge-unsaved')).toBeTruthy());
}

async function importFile(bundle: unknown): Promise<void> {
  const input = await waitFor(() => {
    const el = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!el) throw new Error('file input not found');
    return el;
  });
  const file = new File([JSON.stringify(bundle)], 'varieties.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await fireEvent.change(input);
}

function bundleWithHint(h: string): unknown {
  return {
    egaVarieties: {
      v: 1,
      exportedAt: '2026-05-01T00:00:00.000Z',
      customLanguages: [{ id, label: `Unsaved Lang ${uid}`, hint: h, examples: [], createdAt: 1 }],
      varietyOverrides: {},
      disabledVarieties: [],
    },
  };
}

describe('Languages tab — the unload guard follows the drafts, not the tab', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('does not ask before unload when nothing is unsaved', async () => {
    seed();
    render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    expect(unloadBlocked()).toBe(false);
  });

  it('still asks after the user edits a hint and switches to another tab', async () => {
    seed();
    const view = render(Languages);
    await openAndEdit('edited hint');
    view.unmount();
    await waitFor(() => expect(rowEl()).toBeUndefined());
    await waitFor(() => expect(unloadBlocked()).toBe(true));

    // Discard ends the draft and the guard with it.
    render(Languages);
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    await fireEvent.click(await waitFor(() => commitButton('Discard changes')));
    await waitFor(() => expect(unloadBlocked()).toBe(false));
  });

  it('Discard changes puts focus on the row name, not the page', async () => {
    seed();
    render(Languages);
    await openAndEdit('edited hint');
    const discard = commitButton('Discard changes');
    discard.focus();
    await fireEvent.click(discard);
    await waitFor(() => expect(document.activeElement).toBe(nameBtn()));
  });

  it('Cancel on the add form puts focus on the add button', async () => {
    seed();
    const { findByRole, getByRole } = render(Languages);
    await fireEvent.click(await findByRole('button', { name: 'Add custom language' }));
    const cancel = await findByRole('button', { name: 'Cancel' });
    cancel.focus();
    await fireEvent.click(cancel);
    await waitFor(() =>
      expect(document.activeElement).toBe(getByRole('button', { name: 'Add custom language' })),
    );
  });

  it('a deleted row with an unsaved prompt leaves no unload prompt behind', async () => {
    seed();
    render(Languages, { props: { s: await getSettings() } });
    await waitFor(() => expect(rowEl()).toBeTruthy());
    await fireEvent.click(nameBtn());
    const open = await waitFor(() => {
      const b = rowEl()?.querySelector<HTMLButtonElement>('[data-ega-variety-prompt-open]');
      if (!b) throw new Error('prompt open button not found');
      return b;
    });
    await fireEvent.click(open);
    const user = await waitFor(
      () => {
        const el = rowEl()?.querySelector<HTMLTextAreaElement>('[data-ega-template-user] textarea');
        if (!el) throw new Error('prompt editor not found');
        return el;
      },
      { timeout: 5_000 },
    );
    await fireEvent.input(user, { target: { value: 'My prompt {{text}}' } });
    await waitFor(() => expect(unloadBlocked()).toBe(true));

    const del = rowEl()?.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete custom language"]',
    );
    if (!del) throw new Error('delete button not found');
    await fireEvent.click(del);
    await waitFor(() => expect(rowEl()).toBeUndefined());
    await waitFor(() => expect(unloadBlocked()).toBe(false));
  });
});

describe('Languages tab — import with unsaved edits', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('asks first, and declining keeps the edit and the stored language', async () => {
    seed();
    render(Languages);
    await openAndEdit('my hint');
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await importFile(bundleWithHint('imported hint'));
    await waitFor(() =>
      expect(confirmDialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Discard unsaved language edits?' }),
      ),
    );
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(hint().value).toBe('my hint');
    expect((await getCustomLanguages())[0]?.hint).toBe('first hint');
  });

  it('after confirming, the open row shows the imported values and nothing is left unsaved', async () => {
    seed();
    render(Languages);
    await openAndEdit('my hint');
    await importFile(bundleWithHint('imported hint'));
    await waitFor(() => expect(hint().value).toBe('imported hint'));
    expect(rowEl()?.querySelector('.badge-unsaved')).toBeNull();
    expect(unloadBlocked()).toBe(false);
  });
});

describe('Languages tab — Save after the stored language moved', () => {
  beforeEach(() => {
    resetChromeMock();
    vi.restoreAllMocks();
    vi.mocked(confirmDialog).mockResolvedValue(true);
  });

  it('keeps a change made elsewhere to a field the user did not edit', async () => {
    seed();
    render(Languages);
    await openAndEdit('my hint');
    storeLang({ examples: [{ src: 'marhaba', tgt: 'hello' }] });
    await fireEvent.click(commitButton('Save language'));
    await waitFor(async () => expect((await getCustomLanguages())[0]?.hint).toBe('my hint'));
    expect((await getCustomLanguages())[0]?.examples).toEqual([{ src: 'marhaba', tgt: 'hello' }]);
  });

  it('refuses to overwrite a field the user edited that also changed elsewhere, and says so', async () => {
    seed();
    const push = vi.spyOn(toastStore, 'push');
    render(Languages);
    await openAndEdit('my hint');
    storeLang({ hint: 'their hint' });
    await fireEvent.click(commitButton('Save language'));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Nothing was saved') }),
      ),
    );
    expect((await getCustomLanguages())[0]?.hint).toBe('their hint');
    expect(hint().value).toBe('my hint');
  });
});
