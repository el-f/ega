import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// jsdom has no CSS engine, so the source text is the gate for a forced-colors cue.
const read = (p: string): string => readFileSync(p, 'utf8');
const rule = (src: string, selector: string): string => {
  const re = new RegExp(`${selector}\\s*\\{([^}]*)\\}`);
  const body = re.exec(src)?.[1];
  if (body === undefined) throw new Error(`rule not found: ${selector}`);
  return body;
};

describe('side-panel cues survive forced colors', () => {
  it('keeps the user bubble in a box when the tint goes', () => {
    const body = rule(read('src/sidepanel/conversation/UserTurn.svelte'), '\\.ega-user-turn');
    expect(body).toMatch(/border:\s*1px solid transparent/);
  });

  it('keeps every reply in the same box, not only the newest one', () => {
    const src = read('src/sidepanel/conversation/AssistantTurn.svelte');
    expect(rule(src, '\\.ega-assistant-turn')).toMatch(
      /border:\s*1px solid var\(--color-border-subtle\)/,
    );
    expect(src).not.toMatch(/is-latest/);
  });

  it('leaves every panel button with a border to repaint', () => {
    const sidePanel = read('src/sidepanel/SidePanel.svelte');
    for (const sel of ['\\.sp-editing-cancel', '\\.sp-search-clear']) {
      expect(rule(sidePanel, sel)).toMatch(/border:\s*1px solid transparent/);
    }
    expect(
      rule(read('src/shared/components/CommandPalette.svelte'), ':global\\(\\.ega-palette-item\\)'),
    ).toMatch(/border:\s*1px solid transparent/);
    const ctx = rule(
      read('src/shared/components/ContextLevelPicker.svelte'),
      '\\.ctx-level-toggle button',
    );
    expect(ctx).toMatch(/border:\s*1px solid transparent/);
    expect(ctx).not.toMatch(/border:\s*0/);
  });

  it('greys an aria-disabled control, which the mode does not do for it', () => {
    const tokens = read('src/shared/tokens.css');
    const block = tokens.slice(tokens.indexOf('@media (forced-colors: active)'));
    expect(block).toMatch(
      /\[aria-disabled='true'\]\s*\{\s*color:\s*GrayText !important;\s*border-color:\s*GrayText !important;/,
    );
  });

  it('draws the loading bar when the gradient goes, on both surfaces', () => {
    const src = read('src/sidepanel/conversation/AssistantTurn.svelte');
    expect(src).toMatch(
      /@media \(forced-colors: active\)\s*\{\s*\.ega-stream-skeleton-bar\s*\{[^}]*border:\s*1px solid CanvasText/,
    );
    expect(read('src/content/shadow.css')).toMatch(
      /@media \(forced-colors: active\)\s*\{\s*\.shimmer\s*\{[^}]*border:\s*1px solid CanvasText/,
    );
  });

  it('separates added from removed words by shape, on both surfaces', () => {
    const turn = read('src/sidepanel/conversation/AssistantTurn.svelte');
    expect(rule(turn, '\\.ega-assistant-body :global\\(\\.body-diff \\.diff-add\\)')).toMatch(
      /text-decoration:\s*underline/,
    );
    // The underline must not outlive the fade, or the clean sentence reads as a link.
    expect(rule(turn, '\\.ega-assistant-body :global\\(\\.body-diff-faded \\.diff-add\\)')).toMatch(
      /text-decoration-line:\s*none/,
    );
    const content = read('src/content/shadow.css');
    expect(rule(content, '\\.tooltip \\.body-diff \\.diff-add')).toMatch(
      /text-decoration:\s*underline/,
    );
    expect(rule(content, '\\.tooltip \\.body-diff-faded \\.diff-add')).toMatch(
      /text-decoration-line:\s*none/,
    );
  });
});

describe('side-panel text clears 4.5:1', () => {
  it('uses the foreground danger token for error text, not the fill', () => {
    const body = rule(
      read('src/sidepanel/conversation/AssistantTurn.svelte'),
      '\\.ega-assistant-error',
    );
    expect(body).toMatch(/color:\s*var\(--color-danger-fg/);
    expect(body).not.toMatch(/color:\s*var\(--color-danger,/);
  });

  it('uses accent-hover on the soft accent tint', () => {
    const chip = rule(
      read('src/sidepanel/conversation/AssistantTurn.svelte'),
      '\\.ega-refinement-chip',
    );
    expect(chip).toMatch(/background:\s*var\(--color-accent-bg-soft\)/);
    expect(chip).toMatch(/color:\s*var\(--color-accent-hover\)/);
    const badge = rule(read('src/shared/components/BackendPopover.svelte'), '\\.badge-active');
    expect(badge).toMatch(/color:\s*var\(--color-accent-hover\)/);
  });
});

describe('delete is not the loudest thing at rest', () => {
  it('paints the danger icon button red only on hover and focus', () => {
    const src = read('src/shared/ui/IconButton.svelte');
    expect(src).not.toMatch(/\.ega-icon-btn\.variant-danger\)\s*\{[^}]*color:/);
    expect(src).toMatch(
      /variant-danger:not\(:disabled\):focus-visible\)[\s\S]{0,80}color:\s*var\(--color-danger-fg\)/,
    );
  });
});
