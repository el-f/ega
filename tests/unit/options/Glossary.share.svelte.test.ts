// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { resetChromeMock, chromeMock } from '../../mocks/chrome';
import { parseSettings } from '@/shared/settings-schema';

vi.mock('@/shared/components/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));
const download = vi.fn();
vi.mock('@/shared/download-file', () => ({
  downloadJsonFile: (...a: unknown[]) => download(...a),
}));

const Glossary = (await import('@/options/tabs/Glossary.svelte')).default;

const MINE = { term: 'Firebolt', translation: 'Saeta de Fuego', caseSensitive: false };

describe('Glossary tab — share the glossary as a file', () => {
  beforeEach(() => {
    resetChromeMock();
    download.mockClear();
    chromeMock.storage.local._raw.set('ega.settings', parseSettings({ glossary: [MINE] }));
  });

  it('exports the entries to a glossary file', async () => {
    const { getByRole, findByText } = render(Glossary);
    await fireEvent.click(getByRole('button', { name: /export glossary/i }));
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [name, bundle] = download.mock.calls[0] as [
      string,
      { egaGlossary: { entries: unknown[] } },
    ];
    expect(name).toMatch(/^ega-glossary-\d{4}-\d{2}-\d{2}\.json$/);
    expect(bundle.egaGlossary.entries).toEqual([MINE]);
    await findByText('Exported 1 entry.');
  });

  it('imports a file, adds the new terms and lists them', async () => {
    const { container, findByText } = render(Glossary);
    const input = await waitFor(() => {
      const el = container.querySelector<HTMLInputElement>('input[type="file"]');
      if (!el) throw new Error('no file input');
      return el;
    });
    const file = new File(
      [
        JSON.stringify({
          egaGlossary: { v: 1, entries: [MINE, { term: 'Nimbus', translation: 'Nimbo' }] },
        }),
      ],
      'glossary.json',
      { type: 'application/json' },
    );
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
    await findByText('Added 1 entry. Skipped 1 for a term you already have.');
    await waitFor(() => expect(container.querySelectorAll('.glossary-row')).toHaveLength(2));
  });
});
