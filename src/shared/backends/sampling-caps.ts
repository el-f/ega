// The start anchor is what rejects `gpt-4o`: its `o` sits after `gpt-4`, not at the start.
// `gpt-5-chat*` is the chat-tuned sibling — it takes temperature and rejects reasoning_effort.
const OPENAI_REASONING_RE = /^(?:o[1-9]\d*|gpt-5(?!-chat))(?:[^a-z0-9]|$)/;

/** True for OpenAI reasoning models (o1 / o3 / o4 / gpt-5); tolerates a `vendor/` prefix. */
export function isOpenAIReasoningModel(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  const bare = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  return OPENAI_REASONING_RE.test(bare);
}

// Claude 3 and 4.x through 4.6 take temperature; Opus 4.7 and every later model return 400 on it.
const ANTHROPIC_SAMPLING_RE = /^claude-(?:3[-.]|(?:opus|sonnet|haiku)-4(?:-[0-6])?(?:-\d{8})?$)/;

export interface SamplingSupport {
  temperature: boolean;
  maxTokens: boolean;
  reasoningEffort: boolean;
}

/** Which sampling knobs the active `(backend, model)` accepts; unknown ids get the base set. */
export function resolveSamplingSupport(backendId: string, modelId: string): SamplingSupport {
  if (backendId === 'native') {
    return { temperature: false, maxTokens: false, reasoningEffort: false };
  }
  if (backendId === 'anthropic') {
    const temperature = ANTHROPIC_SAMPLING_RE.test(modelId.trim().toLowerCase());
    return { temperature, maxTokens: true, reasoningEffort: false };
  }
  if (backendId === 'openai' && isOpenAIReasoningModel(modelId)) {
    return { temperature: false, maxTokens: true, reasoningEffort: true };
  }
  return { temperature: true, maxTokens: true, reasoningEffort: false };
}
