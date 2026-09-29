/** Flags three Svelte 5 reactivity traps in .svelte files. */

import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

interface Finding {
  file: string;
  line: number;
  rule: string;
  message: string;
}

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = path.join(ROOT, 'src');

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(abs);
    else if (entry.isFile() && entry.name.endsWith('.svelte')) yield abs;
  }
}

function lineOf(source: string, idx: number): number {
  return source.slice(0, idx).split('\n').length;
}

/** Index just past the opening tag's `>`. An inline arrow handler puts a `>` inside `{…}`, so brace and quote depth decide the end, not the first `>`. */
function openingTagEnd(source: string, start: number): number {
  let depth = 0;
  let quote = '';
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote !== '') {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return i + 1;
  }
  return source.length;
}

const findings: Finding[] = [];

/** Rule 1: a `use:` directive fed `items:` from a `$derived` name. */
function checkRule1(file: string, source: string): void {
  const useDirectivePattern = /use:[\w$]+=\{\{[^}]*?\bitems:\s*([\w$]+)/g;
  let m: RegExpExecArray | null;
  while ((m = useDirectivePattern.exec(source))) {
    const name = m[1];
    if (!name) continue;
    const derivedDeclPattern = new RegExp(
      `(?:const|let)\\s+${name}\\s*=\\s*\\$derived(?:\\.by)?\\b`,
    );
    if (derivedDeclPattern.test(source)) {
      findings.push({
        file,
        line: lineOf(source, m.index),
        rule: 'use-on-derived',
        message: `\`use:\` directive items=${name} is declared as \`$derived(...)\` — library can't write back; switch to \`$state\` + \`useShadowSync\` helper.`,
      });
    }
  }
}

/** Rule 2: an `$effect` that reads and writes the same top-level `$state`. Body locals are fine — only tracked reads re-run the effect. */
function checkRule2(file: string, source: string): void {
  const stateNames = new Set<string>();
  const stateDeclPattern = /(?:let|const)\s+([\w$]+)\s*[:=][^;\n]*\$(?:state|bindable|derived)\b/g;
  let s: RegExpExecArray | null;
  while ((s = stateDeclPattern.exec(source))) {
    const name = s[1];
    if (name) stateNames.add(name);
  }
  if (stateNames.size === 0) return;

  // Carve out $effect body via brace matching.
  const effectStart = /\$effect(?:\.pre)?\s*\(\s*\(\s*\)\s*=>\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = effectStart.exec(source))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    const body = source.slice(bodyStart, i - 1);
    // Suppression: untrack(), or a memo-key guard written `key === lastSomethingKey`.
    if (/\buntrack\s*\(/.test(body)) continue;
    if (/===\s*last\w*Key\b/.test(body)) continue;

    for (const name of stateNames) {
      const writePattern = new RegExp(`(?<![.\\w$])${name}\\s*=(?!=)`);
      const readPattern = new RegExp(`(?<![.\\w$])${name}(?:\\.[\\w$]|\\[|\\s*[!<>+\\-*/?,)])`);
      if (!writePattern.test(body)) continue;
      // Strip the write site itself before testing for reads.
      const stripped = body.replace(new RegExp(`(?<![.\\w$])${name}\\s*=(?!=)[^;\\n]*`, 'g'), '');
      if (readPattern.test(stripped)) {
        findings.push({
          file,
          line: lineOf(source, bodyStart),
          rule: 'effect-reads-and-writes',
          message: `\`$effect\` reads and writes top-level reactive \`${name}\` — feedback-loop trap. Gate with a memo-key over the canonical source, or wrap reads in \`untrack(...)\`.`,
        });
        break;
      }
    }
  }
}

/** Rule 3: a drag zone without both handlers in the same opening tag. Without `onconsider` the host never mirrors in-flight items and rows vanish on drop. */
function checkRule3(file: string, source: string): void {
  const zonePattern = /<\w+\s[^<]*?use:(dndzone|dragHandleZone)\b/g;
  let m: RegExpExecArray | null;
  while ((m = zonePattern.exec(source))) {
    const directive = m[1];
    const tag = source.slice(m.index, openingTagEnd(source, m.index));
    if (!/onconsider/.test(tag) && !/on:consider/.test(tag)) {
      findings.push({
        file,
        line: lineOf(source, m.index),
        rule: 'dndzone-missing-consider',
        message: `\`use:${directive}\` without an \`onconsider\` handler — items will visually disappear mid-drag.`,
      });
    }
    if (!/onfinalize/.test(tag) && !/on:finalize/.test(tag)) {
      findings.push({
        file,
        line: lineOf(source, m.index),
        rule: 'dndzone-missing-finalize',
        message: `\`use:${directive}\` without an \`onfinalize\` handler — drop never commits.`,
      });
    }
  }
}

async function main(): Promise<void> {
  for await (const file of walk(SRC)) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = await readFile(file, 'utf-8');
    checkRule1(rel, source);
    checkRule2(rel, source);
    checkRule3(rel, source);
  }

  if (findings.length === 0) {
    const count = await (async (): Promise<number> => {
      let n = 0;
      for await (const _f of walk(SRC)) n += 1;
      return n;
    })();
    console.log(`✓ Reactivity-lint OK (${count} svelte files scanned)`);
    return;
  }
  for (const f of findings) {
    console.error(`${f.file}:${f.line}  [${f.rule}]  ${f.message}`);
  }
  console.error(`\n${findings.length} reactivity issue(s).`);
  console.error(`\nDocs: docs/conventions/svelte-reactivity.md`);
  process.exit(1);
}

void main();
