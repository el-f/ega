// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import Input from '@/shared/ui/Input.svelte';
import Textarea from '@/shared/ui/Textarea.svelte';

// A text field without `dir="auto"` renders the user's own RTL input in the wrong order.

describe('shared text-entry primitives carry dir', () => {
  it('Input defaults to dir="auto"', () => {
    const { container } = render(Input, { props: { value: '' } });
    expect(container.querySelector('input')?.getAttribute('dir')).toBe('auto');
  });

  it('Textarea defaults to dir="auto"', () => {
    const { container } = render(Textarea, { props: { value: '' } });
    expect(container.querySelector('textarea')?.getAttribute('dir')).toBe('auto');
  });
});

const ROOTS = ['src/options', 'src/popup', 'src/shared/ui', 'src/shared/components'];

/** Types that hold no text the user reads back, so bidi cannot apply. */
const NON_TEXT_TYPES: ReadonlySet<string> = new Set([
  'checkbox',
  'radio',
  'file',
  'range',
  'number',
  'color',
]);

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...svelteFiles(p));
    else if (e.name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

interface Tag {
  readonly attrs: string;
  readonly line: number;
}

/** Walks to the tag's own `>`; a naive scan stops inside `oninput={(e) => …}`. */
function textEntryTags(src: string): Tag[] {
  const out: Tag[] = [];
  const open = /<(?:input|textarea)\b/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(src)) !== null) {
    let depth = 0;
    let quote: string | null = null;
    let i = open.lastIndex;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote !== null) {
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth -= 1;
      else if (c === '>' && depth === 0) break;
    }
    out.push({
      attrs: src.slice(open.lastIndex, i),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

describe('every text-entry field declares dir', () => {
  it('no options / popup / shared control renders user text without one', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of svelteFiles(resolve(root))) {
        const src = stripComments(readFileSync(file, 'utf8'));
        for (const tag of textEntryTags(src)) {
          const type = /(?:^|\s)type=["']?([a-z]+)/.exec(tag.attrs)?.[1];
          if (type !== undefined && NON_TEXT_TYPES.has(type)) continue;
          if (/(?:^|\s)dir[=\s]/.test(tag.attrs) || tag.attrs.includes('{dir}')) continue;
          offenders.push(`${relative(resolve('.'), file)}:${tag.line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scanner sees a tag whose handler contains a fat arrow', () => {
    const tags = textEntryTags('<input type="text" oninput={(e) => go(e)} dir="auto" />');
    expect(tags).toHaveLength(1);
    expect(tags[0]?.attrs).toContain('dir="auto"');
  });
});
