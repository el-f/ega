// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ShortcutOverlay from '@/shared/components/ShortcutOverlay.svelte';

describe('ShortcutOverlay cross-reference', () => {
  it('footer points users at the command palette', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {} },
    });
    const xref = container.querySelector('[data-ega-shortcut-xref]');
    expect(xref).not.toBeNull();
    expect(xref?.textContent ?? '').toMatch(/command palette/i);
    expect(xref?.textContent ?? '').toMatch(/K/);
  });

  it('exposes exactly one dialog carrying the role and the name', () => {
    const { getAllByRole } = render(ShortcutOverlay, {
      props: { open: true, onClose: () => {} },
    });
    const dialogs = getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.getAttribute('aria-label')).toBe('Keyboard shortcuts');
  });

  it('xref is absent when the overlay is closed', () => {
    const { container } = render(ShortcutOverlay, {
      props: { open: false, onClose: () => {} },
    });
    expect(container.querySelector('[data-ega-shortcut-xref]')).toBeNull();
  });

  it('Options-surface lists Cmd+, Cmd+Shift+R and Cmd+Shift+T rows', () => {
    render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, surface: 'options' },
    });
    const list = document.querySelector('.shortcut-list')?.textContent ?? '';
    expect(list).toMatch(/Search settings/);
    expect(list).toMatch(/Add a rule/);
    expect(list).toMatch(/Cycle theme/);
  });

  it('side-panel surface hides the Options-only rows', () => {
    render(ShortcutOverlay, {
      props: { open: true, onClose: () => {}, surface: 'sidepanel' },
    });
    const list = document.querySelector('.shortcut-list')?.textContent ?? '';
    expect(list).not.toMatch(/Search settings/);
    expect(list).not.toMatch(/Add a rule/);
    expect(list).not.toMatch(/Cycle theme/);
  });

  // The popup mounts neither CommandPalette nor this overlay, so naming it here was a promise nothing keeps.
  it('names only the surfaces that actually answer Ctrl+K', () => {
    render(ShortcutOverlay, { props: { open: true, onClose: () => {} } });
    const row = Array.from(document.querySelectorAll('.shortcut-row')).find((r) =>
      (r.querySelector('dt')?.textContent ?? '').includes('Command palette'),
    );
    expect(row?.querySelector('dt')?.textContent ?? '').not.toMatch(/Popup/);
  });
});
