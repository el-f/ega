// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Component } from 'svelte';

// Add no per-component stubs: a mount failure here is a real bug, so fix the component.

// Required props differ per component, so mount propless and let runtime defaults fill in.
type Importer = () => Promise<{ default: unknown }>;

const TARGETS: Array<[string, Importer]> = [
  ['options/Options', () => import('@/options/Options.svelte')],
  ['options/tabs/Translate', () => import('@/options/tabs/Translate.svelte')],
  ['options/tabs/SelectionBubble', () => import('@/options/tabs/SelectionBubble.svelte')],
  ['options/tabs/Backends', () => import('@/options/tabs/Backends.svelte')],
  ['options/tabs/Tasks', () => import('@/options/tabs/Tasks.svelte')],
  ['options/tabs/Languages', () => import('@/options/tabs/Languages.svelte')],
  ['options/tabs/Glossary', () => import('@/options/tabs/Glossary.svelte')],
  ['options/tabs/Advanced', () => import('@/options/tabs/Advanced.svelte')],
  ['options/tabs/About', () => import('@/options/tabs/About.svelte')],
  ['popup/Popup', () => import('@/popup/Popup.svelte')],
];

describe('options boot smoke', () => {
  // Under parallel load the first mount pulls the whole route-split graph, so the timeout is high.
  test.each(TARGETS)(
    '%s mounts without throwing and produces DOM',
    async (_name, importer) => {
      const mod = await importer();
      const Cmp = mod.default as Component<Record<string, never>>;
      const { container, unmount } = render(Cmp);
      try {
        expect(container).toBeTruthy();
        expect(container.innerHTML.length).toBeGreaterThan(0);
      } finally {
        unmount();
      }
    },
    60_000,
  );
});
