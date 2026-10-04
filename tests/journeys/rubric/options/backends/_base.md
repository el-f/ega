# Options-backends surface rubric

## Mount + render

- Surface lists configured providers (Anthropic / OpenAI / Gemini / Ollama / native CLI / etc) as cards.
- Each row has a Disable/Enable button beside the card and a Test now button; cloud cards add an API-key field and a model combobox.

## Persistence

- API-key edits commit on blur or Enter to the provider's key field (e.g. `anthropicApiKey`), never per keystroke; a "Key saved." line confirms. Without a key, the Model section says to add a key first.
- The Disable/Enable button (or a drag across the divider) updates `disabledBackends` immediately.
- The model combobox writes `settings.model[provider]` on each keystroke or list pick.

## Test-now

- Test now re-probes, then translates a short test phrase; success turns the button green ("Tested ✓") with result text and latency; failure shows the error text in the card's test row.

## Safety

- API keys are masked by default; reveal toggle is per-card and does not log the value.
