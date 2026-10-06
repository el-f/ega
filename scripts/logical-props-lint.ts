// Contract: Ega's in-page sheets use logical properties, so its UI and page marks follow an RTL page. A physical
// side property fails the lint unless a `logical-props-allow` comment sits on its line or the line above, or it is
// a `left: 50%` that centers an element together with a -50% translate in the same rule.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SHEETS = [
  'src/content/shadow.css',
  'src/content/tooltip/tooltip.css',
  'src/content/batch-progress.css',
  'src/content/picker-bar/picker-bar.css',
  'src/content/picker-overlay.css',
  'src/content/page-styles.css',
  'src/content/bubble-menu/bubble-menu.css',
];

const MARKER = 'logical-props-allow';
const PHYSICAL =
  /(?:^|[\s;{])(?:(?:margin|padding|border)-(?:left|right)(?:-[a-z]+)?|left|right|border-(?:top|bottom)-(?:left|right)-radius)\s*:|text-align:\s*(?:left|right)\b/;

export interface Finding {
  line: number;
  text: string;
}

/** Physical side properties in one sheet, with the deliberate cases left out. */
export function physicalProps(css: string): Finding[] {
  const lines = css.split('\n');
  const out: Finding[] = [];
  let blockStart = 0;
  lines.forEach((text, i) => {
    if (text.includes('{')) blockStart = i;
    // A comment that names a property is not one.
    if (!PHYSICAL.test(text.replace(/\/\*.*?\*\//g, ''))) return;
    if (text.includes(MARKER) || (lines[i - 1] ?? '').includes(MARKER)) return;
    if (/^\s*left:\s*50%/.test(text)) {
      const end = lines.findIndex((l, j) => j > i && l.includes('}'));
      const block = lines.slice(blockStart, end === -1 ? undefined : end + 1).join('\n');
      if (/translateX\(-50%\)|translate:\s*-50%/.test(block)) return;
    }
    out.push({ line: i + 1, text: text.trim() });
  });
  return out;
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let failed = 0;
  for (const rel of SHEETS) {
    const found = physicalProps(await readFile(path.join(root, rel), 'utf8'));
    for (const f of found) console.error(`  ${rel}:${f.line}  ${f.text}`);
    failed += found.length;
  }
  if (failed > 0) {
    console.error(
      `✗ Logical-props lint: ${failed} physical side properties. Use inline-start/end, or mark a deliberate one with a ${MARKER} comment.`,
    );
    process.exit(1);
  }
  console.log(`✓ Logical-props lint OK (${SHEETS.length} in-page sheets)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void main();
}
