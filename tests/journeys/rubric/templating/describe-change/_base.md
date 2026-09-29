# Describe-change surface rubric

## Mount + flow

- Surface presents a freeform textarea + Apply action.
- Submitting fires the configured backend with the meta-prompt directive; on success, the structured rule lands in `rules` with no further user step.

## Meta-prompt shape

- The outbound prompt carries the meta-prompt envelope so the backend returns JSON-shaped rule output.
- Non-JSON / malformed backend output falls back to a heuristic rule constructed from the user description.

## Failure handling

- Backend failure surfaces a "Used local fallback" notice — never a silent success.
- Fallback rule body is trimmed user input; category defaults to a sensible bucket.
