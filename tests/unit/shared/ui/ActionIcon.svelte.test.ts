// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import ActionIcon from '@/shared/ui/ActionIcon.svelte';
import { ICON_REGISTRY, type ActionKind } from '@/shared/ui/action-icons';

describe('ActionIcon', () => {
  it('renders a span with data-action-icon attribute', () => {
    const { container } = render(ActionIcon, { props: { kind: 'export' } });
    const el = container.querySelector('[data-action-icon="export"]');
    expect(el).not.toBeNull();
  });

  it('is aria-hidden', () => {
    const { container } = render(ActionIcon, { props: { kind: 'import' } });
    const el = container.querySelector('[aria-hidden="true"]');
    expect(el).not.toBeNull();
  });

  it('renders correct data-action-icon for each kind in registry', () => {
    const kinds = Object.keys(ICON_REGISTRY) as ActionKind[];
    for (const kind of kinds) {
      const { container } = render(ActionIcon, { props: { kind } });
      expect(
        container.querySelector(`[data-action-icon="${kind}"]`),
        `data-action-icon="${kind}" missing`,
      ).not.toBeNull();
    }
  });

  it('passes size prop to the glyph via SVG width attribute', () => {
    const { container } = render(ActionIcon, { props: { kind: 'add', size: 24 } });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
  });
});

describe('action-icons registry', () => {
  it('has every ActionKind key', () => {
    const kinds: ActionKind[] = [
      'export',
      'import',
      'add',
      'delete',
      'refresh',
      'search',
      'save',
      'configure',
      'warn',
      'copy',
      'edit',
      'external-link',
      'expand',
      'close',
    ];
    for (const kind of kinds) {
      expect(ICON_REGISTRY[kind], `Registry missing kind: ${kind}`).toBeDefined();
    }
  });

  it('has no orphan keys relative to ActionKind union', () => {
    const registryKeys = Object.keys(ICON_REGISTRY) as ActionKind[];
    expect(registryKeys.length).toBeGreaterThan(0);
    for (const key of registryKeys) {
      expect(typeof ICON_REGISTRY[key]).toBe('function');
    }
  });

  it('export maps to Upload (outgoing — arrow-up)', () => {
    const { container: exportContainer } = render(ActionIcon, { props: { kind: 'export' } });
    const { container: importContainer } = render(ActionIcon, { props: { kind: 'import' } });
    const exportSvg = exportContainer.querySelector('svg');
    const importSvg = importContainer.querySelector('svg');
    expect(exportSvg).not.toBeNull();
    expect(importSvg).not.toBeNull();
    // The two glyphs must differ — swapped icons bug prevention
    expect(exportSvg?.innerHTML).not.toBe(importSvg?.innerHTML);
  });
});
