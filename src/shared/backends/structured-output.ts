import type { AnswerSpec } from '../answer/spec';
import { toJsonSchema, type SchemaDialect } from '../answer/json-schema';
import { LIVE_SCHEMA_BACKENDS } from './schema-gates';

export interface AnswerFormatRequest {
  spec: AnswerSpec;
  explain: boolean;
  /** The native schema was accepted, rather than falling back to prompt-only. */
  onAccepted?: () => void;
}

/** An edited prompt's own format wins over native schema enforcement. */
export function hasConflictingFormat(
  template: { system: string; user: string },
  spec: AnswerSpec,
): boolean {
  const text = `${template.system}\n${template.user}`;
  const rest = spec.pinned ? text.replace(spec.pinned.text, '') : text;
  return /\b(?:return|respond|output|reply|produce)\b[^.\n]{1,80}\b(?:json|plain text|markdown|xml)\b|\bjson\s+(?:only|schema)|\{\s*"[\w-]+"\s*:/i.test(
    rest,
  );
}

const rejected = new Set<string>();
const keyOf = (backend: string, model: string): string =>
  `${backend}:${model.trim().toLowerCase()}`;

/** Enable each provider family only after its request-shape and live gate. */
export function structuredOutput(
  backend: string,
  model: string,
  listedSchema = false,
): SchemaDialect | null {
  if (!LIVE_SCHEMA_BACKENDS.has(backend)) return null;
  if (rejected.has(keyOf(backend, model))) return null;
  if (
    backend === 'anthropic' &&
    /^claude-(?:(?:haiku|sonnet|opus)-4-[5-9]|(?:haiku|sonnet|opus|fable|mythos)-[5-9](?:-\d)?|mythos-preview)(?:-\d{8})?$/.test(
      model,
    )
  )
    return 'anthropic';
  if (
    backend === 'openai' &&
    /^(?:gpt-(?:4o(?:-mini)?|4\.[1-9]|[5-9])|o[3-9])(?:-|$)/.test(model) &&
    model !== 'gpt-4o-2024-05-13'
  )
    return 'openai-strict';
  if (backend === 'mistral' || backend === 'xai') return 'openai-strict';
  if (backend === 'localserver') return 'openai-strict';
  if (backend === 'ollama') return 'ollama';
  if (backend === 'openrouter' && listedSchema) return 'openai-strict';
  if (
    backend === 'gemini' &&
    /^gemini-(?:2\.5|[3-9](?:\.|-)|(?:flash|pro)(?:-lite)?-latest)/.test(model)
  )
    return 'gemini';
  if (backend === 'gemini' && /^gemini-(?:1\.5|2\.0)-/.test(model)) return 'gemini-legacy';
  // Local schemas stay off until the saved-sample A/B gate; native CLIs are prompt-only.
  return null;
}

export interface SchemaFallback {
  backend: string;
  model: string;
  payload: Record<string, unknown>;
  onAccepted?: () => void;
}

/** Adds a native schema without changing any prompt text or sampling fields. */
export function structuredChatPayload(
  backend: string,
  model: string,
  format: AnswerFormatRequest | undefined,
  payload: Record<string, unknown>,
  listedSchema = false,
): { payload: Record<string, unknown>; schemaFallback?: SchemaFallback } {
  if (!format) return { payload };
  const dialect = structuredOutput(backend, model, listedSchema);
  if (!dialect) return { payload };
  const schema = toJsonSchema(format.spec, { dialect, explain: format.explain });
  const outputConfig = payload['output_config'] as Record<string, unknown> | undefined;
  return {
    payload:
      backend === 'anthropic'
        ? {
            ...payload,
            output_config: {
              ...outputConfig,
              format: { type: 'json_schema', schema },
            },
          }
        : backend === 'gemini'
          ? {
              ...payload,
              generationConfig: {
                ...(payload['generationConfig'] as Record<string, unknown> | undefined),
                responseMimeType: 'application/json',
                [dialect === 'gemini-legacy' ? 'responseSchema' : 'responseJsonSchema']: schema,
              },
            }
          : backend === 'ollama'
            ? { ...payload, format: schema }
            : {
                ...payload,
                response_format: {
                  type: 'json_schema',
                  json_schema: { name: 'ega_answer', strict: true, schema },
                },
                ...(backend === 'openrouter'
                  ? {
                      provider: {
                        ...(payload['provider'] as Record<string, unknown> | undefined),
                        require_parameters: true,
                      },
                    }
                  : {}),
              },
    schemaFallback: {
      backend,
      model,
      payload,
      ...(format.onAccepted ? { onAccepted: format.onAccepted } : {}),
    },
  };
}

/** A schema rejection is remembered only for this worker's lifetime. */
export function rejectSchema(backend: string, model: string): void {
  rejected.add(keyOf(backend, model));
}

/** Tests start with a fresh worker. */
export function clearRejectedSchemas(): void {
  rejected.clear();
}

export function schemaRejection(status: number, body: string): boolean {
  return (
    status === 400 &&
    /\bschema\b|json_schema|output_config|response_format|responseJsonSchema|responseSchema|additionalProperties/i.test(
      body,
    )
  );
}
