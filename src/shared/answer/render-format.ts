import type { AnswerField, AnswerSpec } from './spec';

function shape(field: AnswerField): string {
  if (field.kind === 'list') return 'array of strings';
  if (field.kind === 'score') return 'number from 0 to 1';
  if (field.kind === 'yesno') return 'boolean';
  if (field.kind === 'choice')
    return (field.choices ?? []).map((c) => JSON.stringify(c)).join(' or ');
  if (field.kind === 'languages') return 'array of {id: string, detail?: string}';
  return field.kind === 'language' ? 'language code or label' : 'string';
}

/** Pinned formats keep the pre-slot bytes and their original join, including Explain's slot. */
export function renderFormat(
  spec: AnswerSpec,
  options: { explain?: boolean } = {},
): {
  text: string;
  sep: ' ' | '\n' | '\n\n';
  join: AnswerSpec['join'];
} {
  if (spec.pinned) return { ...spec.pinned, join: spec.join };
  const fields = spec.fields.filter((f) => f.when !== 'explain' || options.explain);
  const ordered = [
    ...fields.filter((f) => f.role === 'main'),
    ...fields.filter((f) => f.role !== 'main'),
  ];
  const text = [
    `Return JSON ONLY: {${ordered.map((f) => `${JSON.stringify(f.key)}${f.required ? '' : '?'}: <${shape(f)}>`).join(', ')}}.`,
    ...ordered.map((f) => `${JSON.stringify(f.key)} (${f.label}): ${f.guide ?? shape(f)}.`),
    ...(spec.rules ?? []),
  ].join('\n');
  return { text, sep: spec.join === 'after-build' ? '\n\n' : '\n', join: spec.join };
}
