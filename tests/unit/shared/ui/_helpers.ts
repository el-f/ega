import { createRawSnippet, type Snippet } from 'svelte';
import type { ActionKind } from '@/shared/ui/action-icons';

/** Plain text as a Svelte 5 Snippet — a bare `() => 'text'` neither type-checks nor renders. */
export function textSnippet(text: string): Snippet {
  return createRawSnippet(() => ({
    render: () => `<span>${text}</span>`,
  }));
}

/** Asserts the icon KIND, which a presence-only check would miss when icons get swapped. */
export function expectIconKind(el: Element, kind: ActionKind): void {
  const found = el.querySelector(`[data-action-icon="${kind}"]`);
  if (!found) {
    throw new Error(
      `Expected [data-action-icon="${kind}"] inside element, got: ${el.innerHTML.slice(0, 200)}`,
    );
  }
}
