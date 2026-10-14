import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadRubric(rubricDir: string, surface: string): Promise<string> {
  const base = await readFile(path.join(rubricDir, '_base.md'), 'utf8');
  const surfacePath = path.join(rubricDir, `${surface}.md`);
  const surfaceText = existsSync(surfacePath)
    ? await readFile(surfacePath, 'utf8')
    : await readFile(path.join(rubricDir, 'unknown.md'), 'utf8');
  return `${base}\n\n---\n\n${surfaceText}`;
}

/** Compose a rubric covering MULTIPLE surfaces (feature audits span surfaces). */
export async function loadFeatureRubric(rubricDir: string, surfaces: string[]): Promise<string> {
  const base = await readFile(path.join(rubricDir, '_base.md'), 'utf8');
  const sections: string[] = [base];
  const seen = new Set<string>();
  for (const s of surfaces) {
    if (seen.has(s)) continue;
    seen.add(s);
    const surfacePath = path.join(rubricDir, `${s}.md`);
    if (existsSync(surfacePath)) {
      sections.push(await readFile(surfacePath, 'utf8'));
    }
  }
  return sections.join('\n\n---\n\n');
}
