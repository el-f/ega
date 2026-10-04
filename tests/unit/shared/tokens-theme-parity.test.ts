import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(__dirname, '..', '..', '..', 'src/shared/tokens.css');
const css = readFileSync(TOKENS, 'utf8');

/** Body of the first rule whose selector list contains `selector`. */
function ruleBody(selector: string): string {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`selector not found in tokens.css: ${selector}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('\n}', open);
  if (open === -1 || close === -1) throw new Error(`unterminated rule for ${selector}`);
  return css.slice(open, close);
}

function declaredVars(body: string): Set<string> {
  return new Set(Array.from(body.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1] as string));
}

// On a light-OS machine, any token the dark block omits keeps its LIGHT value on a dark surface.
describe('tokens.css light/dark parity', () => {
  const light = declaredVars(ruleBody('@media (prefers-color-scheme: light)'));
  const dark = declaredVars(ruleBody("[data-theme='dark']"));

  const explicitLight = declaredVars(ruleBody("[data-theme='light']"));

  it('the dark block overrides every token the light media block sets', () => {
    const missing = [...light].filter((v) => !dark.has(v)).sort();
    expect(missing).toEqual([]);
  });

  it('the explicit light block overrides every token the light media block sets', () => {
    const missing = [...light].filter((v) => !explicitLight.has(v)).sort();
    expect(missing).toEqual([]);
  });

  it('covers the status family, which is what a contrast regression hits first', () => {
    for (const token of [
      '--color-success-fg',
      '--color-success-bg-soft',
      '--color-warning-fg',
      '--color-warning-bg-soft',
      '--color-warning-bg-deep',
      '--color-danger-fg',
      '--color-danger',
      '--color-danger-bg-soft',
      '--color-dot-neutral',
    ]) {
      expect(dark.has(token), `${token} missing from [data-theme='dark']`).toBe(true);
    }
  });
});

// A native <select> popup, scrollbar and checkbox glyph follow color-scheme, not our tokens.
describe('tokens.css color-scheme', () => {
  it('declares one in every theme block', () => {
    expect(ruleBody(':root,')).toMatch(/color-scheme:\s*dark/);
    expect(ruleBody('@media (prefers-color-scheme: light)')).toMatch(/color-scheme:\s*light/);
    expect(ruleBody("[data-theme='light']")).toMatch(/color-scheme:\s*light/);
    expect(ruleBody("[data-theme='dark']")).toMatch(/color-scheme:\s*dark/);
  });
});
