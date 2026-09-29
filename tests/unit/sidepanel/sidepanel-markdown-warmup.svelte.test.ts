// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';
import { markdownLoaderInternal } from '@/shared/components/markdown-loader';
import { resetMarkdownLoaderCache } from '@/shared/components/markdown-loader.test-utils';

beforeEach(async () => {
  await chrome.storage.local.clear();
  resetMarkdownLoaderCache();
});

afterEach(() => vi.clearAllMocks());

describe('SidePanel — markdown renderer warm-up', () => {
  it('loads the marked+dompurify chunk on mount, before any answer finishes', async () => {
    expect(markdownLoaderInternal.cached).toBeNull();
    render(SidePanel);
    await tick();
    expect(markdownLoaderInternal.cached).not.toBeNull();
  });
});
