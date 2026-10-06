import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// jsdom lays nothing out, so the rule text is the gate for a 24px target.
const read = (p: string): string => readFileSync(p, 'utf8');
const rule = (src: string, selector: string): string => {
  const body = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(src)?.[1];
  if (body === undefined) throw new Error(`rule not found: ${selector}`);
  return body;
};

const TARGETS: [string, string][] = [['src/sidepanel/SidePanel.svelte', '\\.sp-search-clear']];

describe('small glyph buttons are at least 24px', () => {
  for (const [file, selector] of TARGETS) {
    it(`${selector.replace(/\\\\/g, '')} in ${file.split('/').pop()}`, () => {
      const body = rule(read(file), selector);
      expect(body).toMatch(/min-width:\s*24px|min-height:\s*24px/);
      expect(body).toMatch(/box-sizing:\s*border-box/);
    });
  }

  it('the context level segments too', () => {
    const body = rule(
      read('src/shared/components/ContextLevelPicker.svelte'),
      '\\.ctx-level-toggle button',
    );
    expect(body).toMatch(/min-block-size:\s*28px/);
  });

  it('and the reply details panel has no 9-10px type and 24px controls', () => {
    const src = read('src/shared/components/ReplyDetails.svelte');
    expect(src).not.toMatch(/font-size:\s*(?:9|10)px/);
    expect(rule(src, '\\.rd-copy')).toMatch(/min-height:\s*24px/);
    expect(rule(src, '\\.rd-link')).toMatch(/min-height:\s*24px/);
  });
});

// The user bubble's actions and the composer swap are 32px; a reply's dense rows match them.
// D-e: one row of 28px icon buttons with 16px glyphs fits the 222px reply at 320px with 125% zoom.
describe('a reply row is one row of 28px buttons', () => {
  const src = read('src/sidepanel/conversation/AssistantTurn.svelte');
  const menus = read('src/sidepanel/conversation/ReplyMenus.svelte');

  it('sizes every reply icon button sm (28px), and never wraps the row', () => {
    expect(src).not.toMatch(/size="md"/);
    const row = rule(src, '\\.ega-reply-actions,\\s*\\.ega-reply-actions-slot');
    expect(row).toMatch(/flex-wrap:\s*nowrap/);
    expect(row).toMatch(/min-block-size:\s*28px/);
  });

  it('draws the Refine and More menu buttons as sm icon buttons, like the IconButtons beside them', () => {
    expect(menus.match(/class="ega-icon-btn variant-default size-sm"/g)).toHaveLength(2);
  });
});

// The shadow root reads content/shadow.css; a component <style> never crosses that boundary.
describe('the content-script tooltip gets the same sizes', () => {
  it('has no 9-10px type and 24px controls in the reply details copy', () => {
    const content = read('src/content/shadow.css');
    const block = content.slice(content.indexOf('.reply-details {'));
    expect(block).not.toMatch(/font-size:\s*(?:9|10)px/);
    expect(rule(block, '\\.rd-copy')).toMatch(/min-height:\s*24px/);
  });
});

describe('a keyboard focus lands somewhere visible', () => {
  it('gives the shared input a 2px ring, not a 1px border tint', () => {
    const body = rule(read('src/shared/ui/Input.svelte'), '\\.ega-input-row:focus-within');
    expect(body).toMatch(/outline:\s*2px solid var\(--color-accent\)/);
  });

  it('stops the panel search box from suppressing the global ring', () => {
    const body = rule(
      read('src/sidepanel/SidePanel.svelte'),
      "\\.sp-search-bar input\\[type='search'\\]",
    );
    expect(body).not.toMatch(/outline:\s*none/);
  });
});
