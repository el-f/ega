import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// jsdom lays nothing out, so the rule text is the gate for a 24px target.
const read = (p: string): string => readFileSync(p, 'utf8');
const rule = (src: string, selector: string): string => {
  const body = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(src)?.[1];
  if (body === undefined) throw new Error(`rule not found: ${selector}`);
  return body;
};

const TARGETS: [string, string][] = [
  ['src/sidepanel/conversation/AssistantTurn.svelte', '\\.ega-variant-btn'],
  ['src/sidepanel/conversation/AssistantTurn.svelte', '\\.ega-variant-action-btn'],
  ['src/sidepanel/SidePanel.svelte', '\\.sp-search-clear'],
  ['src/sidepanel/SidePanel.svelte', '\\.sp-editing-cancel'],
];

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
    expect(body).toMatch(/min-height:\s*24px/);
  });

  it('and the context preview drops its 9-10px type', () => {
    const src = read('src/shared/components/ContextPreview.svelte');
    expect(src).not.toMatch(/font-size:\s*(?:9|10)px/);
  });
});

// The shadow root reads content/shadow.css; a component <style> never crosses that boundary.
describe('the content-script tooltip gets the same sizes', () => {
  it('has no 9-10px type left in the shared context preview', () => {
    const content = read('src/content/shadow.css');
    const ctx = content.slice(content.indexOf('.ega-ctx-preview.ega-ctx-tooltip'));
    const block = ctx.slice(0, ctx.indexOf('.ega-select-wrap'));
    expect(block).not.toMatch(/font-size:\s*(?:9|10)px/);
    expect(block).toMatch(/min-height:\s*24px/);
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
