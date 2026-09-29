// Errors propagate: a 401 must reach the user, not collapse into an empty list.

const DISCOVER_TIMEOUT_MS = 8_000;

interface OpenAIModelsBody {
  data?: Array<{ id?: unknown }>;
}

export async function fetchOpenAICompatibleModels(
  url: string,
  apiKey: string,
  filter?: (id: string) => boolean,
): Promise<string[]> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(DISCOVER_TIMEOUT_MS),
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
