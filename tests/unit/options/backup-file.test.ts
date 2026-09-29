// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { handleImportFilePick } from '@/options/backup-file';

/** jsdom refuses a direct `files =`, and reports a file input's `value` as '' whatever you write — so the reset is recorded, not read back. */
function pickEvent(files: File[]): {
  ev: Event;
  input: HTMLInputElement;
  valueWrites: string[];
} {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  const valueWrites: string[] = [];
  Object.defineProperty(input, 'value', {
    get: () => '',
    set: (v: string) => valueWrites.push(v),
    configurable: true,
  });
  const ev = { currentTarget: input } as unknown as Event;
  return { ev, input, valueWrites };
}

describe('handleImportFilePick', () => {
  it('hands the first picked file to the importer', async () => {
    const onImport = vi.fn();
    const file = new File(['{}'], 'a.json', { type: 'application/json' });
    const { ev } = pickEvent([file]);

    await handleImportFilePick(ev, onImport);

    expect(onImport).toHaveBeenCalledWith(file);
  });

  it('clears the input before importing, so re-picking the same file still fires', async () => {
    const { ev, valueWrites } = pickEvent([new File(['{}'], 'a.json')]);
    let writesAtImport: number | null = null;

    await handleImportFilePick(ev, () => {
      writesAtImport = valueWrites.length;
    });

    expect(valueWrites).toEqual(['']);
    expect(writesAtImport).toBe(1);
  });

  it('clears the input even when the picker was dismissed', async () => {
    const { ev, valueWrites } = pickEvent([]);

    await handleImportFilePick(ev, vi.fn());

    expect(valueWrites).toEqual(['']);
  });

  it('does nothing when the picker was dismissed with no file', async () => {
    const onImport = vi.fn();
    const { ev } = pickEvent([]);

    await handleImportFilePick(ev, onImport);

    expect(onImport).not.toHaveBeenCalled();
  });

  it('awaits an async importer', async () => {
    let settled = false;
    const { ev } = pickEvent([new File(['{}'], 'a.json')]);

    await handleImportFilePick(ev, async () => {
      await Promise.resolve();
      settled = true;
    });

    expect(settled).toBe(true);
  });
});
