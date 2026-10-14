// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { toast } from 'svelte-sonner';
import { tick } from 'svelte';
import SidePanel from '@/sidepanel/SidePanel.svelte';

afterEach(() => {
  vi.clearAllMocks();
});

describe('SidePanel — Toaster mount', () => {
  it('pushed toast renders into the DOM (Toaster mounted)', async () => {
    render(SidePanel);
    await tick();
    toast.error('refine-failed');
    await waitFor(() => {
      const li = document.body.querySelector('[data-sonner-toast]');
      if (!li) throw new Error('toast li not rendered');
      expect(li.textContent).toContain('refine-failed');
    });
  });
});
