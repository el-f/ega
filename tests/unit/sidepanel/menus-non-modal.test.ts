import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// bits' default page lock (body pointer-events: none) swallows an outside click and drops focus to the body.
const FILES = [
  'src/sidepanel/conversation/InputRow.svelte',
  'src/sidepanel/conversation/ReplyMenus.svelte',
  'src/sidepanel/conversation/UserTurn.svelte',
  'src/sidepanel/HeaderMoreMenu.svelte',
];

describe('side panel menus do not lock the page', () => {
  for (const file of FILES) {
    it(file.split('/').pop() ?? file, () => {
      const src = readFileSync(file, 'utf8');
      const contents = src.match(/<DropdownMenu\.Content\b[^>]*>/g) ?? [];
      expect(contents.length).toBeGreaterThan(0);
      for (const tag of contents) expect(tag).toContain('preventScroll={false}');
    });
  }
});
