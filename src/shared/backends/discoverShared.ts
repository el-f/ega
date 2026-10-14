// Errors propagate: a 401 must reach the user, not collapse into an empty list.

const DISCOVER_TIMEOUT_MS = 8_000;

interface OpenAIModelsBody {
  data?: Array<{ id?: unknown }>;
}

export async function fetchOpenAICompatibleModels(
  url: string,
  apiKey: string,
  filter?: (id: string) => boolean,
  timeoutMs = DISCOVER_TIMEOUT_MS,
): Promise<string[]> {
  const res = await fetch(url, {
    method: 'GET',
    // A keyless local server gets no Authorization header at all.
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
  }
  const body = (await res.json()) as OpenAIModelsBody;
  const ids = Array.isArray(body.data)
    ? body.data
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return filter ? ids.filter(filter) : ids;
}
