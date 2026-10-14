# Options-backends ollama-url-edit rubric

## Latency budgets

- URL field blur -> storage write: <= 200ms.
- Discover models after URL change -> response visible: <= 8s.

## State expectations

- Step 1: user expands the Ollama row; step "1 Address" shows the "Ollama URL" field with the current `ollamaUrl` value and one hint line: "Only this computer's addresses work: localhost, 127.0.0.1 or [::1]".
- Step 2: user edits the URL and blurs the field; `ollamaUrl` writes to storage.
- Step 3 (click Discover models): a probe fires to the new URL; either "Found N local models." or an error renders inline. No answer at the address marks the URL field (red border, aria-invalid) with "Ollama did not answer at this address. Check that it is running." and the browser's words under "Details". A 403 on /api/chat says "Ollama blocked the request from Ega" with "Show steps".

## Visible affordances

- Steps are separated by space, not boxes: "1 Address" and "2 Model" in 13px/600.
- URL field uses a text input with a label; accepts `http://` or `https://` prefixes.
- Discover is a secondary button ("Discover models", "Discovering…" with a spinner while running) next to the model field.
- The error is a short title in the error colour; the raw message sits under "Details".

## Failure-mode expectations

- URL that fails the loopback-only check: no inline warning; the schema drops it on read and requests fall back to the default URL.
- Discovery failure: error label appears inline; the model select retains its prior list (or shows empty).

## Cautions

- Ollama is only allowed on loopback addresses (localhost, 127.0.0.1, ::1) for SSRF protection — non-loopback URLs must be rejected or warned.
- URL change alone does NOT trigger discovery; the user must explicitly click Discover.
