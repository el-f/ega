import type { AnswerField, AnswerSpec } from './spec';

export type SchemaDialect =
  'json-schema' | 'openai-strict' | 'anthropic' | 'gemini' | 'gemini-legacy' | 'ollama';
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: readonly string[];
  anyOf?: JsonSchema[];
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  description?: string;
}
export interface AnswerJsonSchema extends JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchema>;
  required: string[];
}

function fieldSchema(field: AnswerField, dialect: SchemaDialect): JsonSchema {
  const strict = dialect === 'openai-strict';
  let schema: JsonSchema;
  switch (field.kind) {
    case 'list':
      schema = { type: 'array', items: { type: 'string' } };
      break;
    case 'score':
      schema =
        dialect === 'anthropic' ? { type: 'number' } : { type: 'number', minimum: 0, maximum: 1 };
      break;
    case 'yesno':
      schema = { type: 'boolean' };
      break;
    case 'choice':
      schema = { type: 'string', enum: field.choices ?? [] };
      break;
    case 'languages':
      schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            detail: strict ? { anyOf: [{ type: 'string' }, { type: 'null' }] } : { type: 'string' },
          },
          required: strict ? ['id', 'detail'] : ['id'],
          ...(dialect === 'gemini-legacy' ? {} : { additionalProperties: false }),
        },
      };
      break;
    case 'text':
    case 'language':
      schema = {
        type: 'string',
        ...(field.maxChars !== undefined &&
        !['anthropic', 'gemini', 'gemini-legacy'].includes(dialect)
          ? { maxLength: field.maxChars }
          : {}),
      };
  }
  if (field.guide) schema.description = field.guide;
  return strict && !field.required ? { anyOf: [schema, { type: 'null' }] } : schema;
}

/** Deterministic, per-spec schema: no request language or candidate list changes its bytes. */
export function toJsonSchema(
  spec: AnswerSpec,
  options: { explain?: boolean; dialect?: SchemaDialect } = {},
): AnswerJsonSchema {
  const dialect = options.dialect ?? 'json-schema';
  const fields = spec.fields.filter((f) => f.when !== 'explain' || options.explain);
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f, dialect)])),
    required: fields.filter((f) => f.required || dialect === 'openai-strict').map((f) => f.key),
    ...(dialect === 'gemini-legacy' ? {} : { additionalProperties: false }),
  };
}
