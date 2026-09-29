import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// SectionCard descriptions stay at or under 90 chars.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..', '..');

const FILES: readonly string[] = [
  'src/options/components/AdvancedTemplatesPane.svelte',
  'src/options/components/AdvancedDiagnosticsPane.svelte',
  'src/options/components/AdvancedDataPane.svelte',
  'src/options/components/SectionReset.svelte',
  'src/options/components/templates-pane/WorkbenchTaskPanel.svelte',
  'src/options/tabs/Languages.svelte',
  'src/options/tabs/About.svelte',
  'src/options/tabs/Advanced.svelte',
  'src/options/OptionsTabContent.svelte',
];

const MAX_LEN = 90;
const SC_BLOCK = /<SectionCard\b([\s\S]*?)>/g;
const DESC_PROP = /description="([^"]*)"/;

interface Violation {
  file: string;
  length: number;
  description: string;
}

function scan(): readonly Violation[] {
  const out: Violation[] = [];
  for (const f of FILES) {
    const txt = readFileSync(join(REPO_ROOT, f), 'utf8');
    let m: RegExpExecArray | null;
    SC_BLOCK.lastIndex = 0;
    while ((m = SC_BLOCK.exec(txt)) !== null) {
      const attrs = m[1] ?? '';
      const d = attrs.match(DESC_PROP);
      if (!d) continue;
      const desc = d[1] ?? '';
      if (desc.length > MAX_LEN) {
        out.push({ file: f, length: desc.length, description: desc });
      }
    }
  }
  return out;
}

describe('SectionCard description copy lint', () => {
  it(`every description is ≤${MAX_LEN} chars`, () => {
    const violations = scan();
    if (violations.length > 0) {
      const detail = violations
        .map((v) => `  - ${v.file} (${v.length} chars): ${v.description}`)
        .join('\n');
      throw new Error(
        `SectionCard description copy exceeded ${MAX_LEN}-char limit:\n${detail}\n` +
          `Style guide: single sentence, declarative tone, ≤${MAX_LEN} chars.`,
      );
    }
    expect(violations).toHaveLength(0);
  });
});
