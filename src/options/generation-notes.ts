import { clampEffort, type SamplingSupport } from '@/shared/backends/sampling-caps';
import { backendLabel } from '@/shared/backends/provider-profiles';
import type { TaskEffort } from '@/shared/settings-schema';
import { EFFORT_LABEL } from '@/options/effort-labels';

/** A backend's name as the subject of a sentence: "The native host", "Ollama". */
function backendSubject(id: string): string {
  if (id === 'native') return 'The native host';
  if (id === 'localserver') return 'The local server';
  return backendLabel(id);
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

function ignoreLine(ids: readonly string[], what: string): string[] {
  if (ids.length === 0) return [];
  const names = ids.map(backendSubject);
  return [`${joinNames(names)} ${ids.length === 1 ? 'ignores' : 'ignore'} ${what}`];
}

export interface GenerationNotes {
  effort: readonly string[];
  maxTokens: readonly string[];
  temperature: readonly string[];
}

/**
 * The note lines under the Generation controls: only for backends Ega will actually try, and only when one
 * of them ignores or changes the value. The controls themselves are never disabled for one backend.
 */
export function generationNotes(
  effort: TaskEffort,
  tried: readonly string[],
  capsOf: (id: string) => SamplingSupport,
): GenerationNotes {
  const effortLines: string[] = [];
  const noEffort: string[] = [];
  const noLength: string[] = [];
  const noTemperature: string[] = [];
  for (const id of tried) {
    const caps = capsOf(id);
    if (id === 'native') {
      if (effort !== 'low') effortLines.push('The native host always runs at Low');
    } else if (caps.efforts.length === 0) {
      if (effort !== 'off') noEffort.push(id);
    } else {
      const runs = clampEffort(effort, caps.efforts);
      if (runs !== null && runs !== effort) {
        effortLines.push(
          `${backendSubject(id)} has no ${EFFORT_LABEL[effort]}, so it runs at ${EFFORT_LABEL[runs]}`,
        );
      }
    }
    if (!caps.maxTokens) noLength.push(id);
    if (!caps.temperature) noTemperature.push(id);
  }
  return {
    effort: [...effortLines, ...ignoreLine(noEffort, 'Effort')],
    maxTokens: ignoreLine(noLength, 'this'),
    temperature: ignoreLine(noTemperature, 'this'),
  };
}
