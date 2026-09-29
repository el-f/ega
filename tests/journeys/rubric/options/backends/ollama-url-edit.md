# Options-backends ollama-url-edit rubric

## Latency budgets

- URL field blur -> storage write: <= 200ms.
- Discover models after URL change -> response visible: <= 8s.

## State expectations

- Step 1: user expands the Ollama card; the URL field shows the current `ollamaUrl` value.
- Step 2: user edits the URL and blurs the field; `ollamaUrl` writes to storage.
- Step 3 (click Discover models): a probe fires to the new URL; either a model list or an error renders inline.

## Visible affordances

- URL field uses a text input with a label; accepts `http://` or `https://` prefixes.
- Discover button uses a sync icon next to the URL field.
- Inline error shows a user-readable message (e.g. "Could not reach Ollama at that URL").

## Failure-mode expectations

- URL that fails the loopback-only security check (non-localhost/127.0.0.1/::1 address): inline warning before write or blocked write (SSRF protection).
- Discovery failure: error label appears inline; the model select retains its prior list (or shows empty).

## Cautions

- Ollama is only allowed on loopback addresses (localhost, 127.0.0.1, ::1) for SSRF protection — non-loopback URLs must be rejected or warned.
- URL change alone does NOT trigger discovery; the user must explicitly click Discover.
