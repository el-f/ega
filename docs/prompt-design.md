# Explain prompt design

Why the Explain prompt in `src/shared/prompts.ts` is shaped the way it is. Read this before
editing `explainInstr` — most of the structure is load-bearing under weaker models, not style.

## What Explain is for

The translation already made the text literal. Explain surfaces what does NOT survive that:
cultural, political and social subtext, register and tone shifts, dialectal signals,
rhetorical strategy — what an insider infers beyond the surface. Vocabulary explanation is a
last resort, for when one term carries the whole meaning and cannot be translated without
losing force.

## How the block reaches the model

Explain is not its own pipeline. `src/background/explain-routing.ts#normaliseExplainRouting`
rewrites the task to `translate` and sets `options.explain`, so Explain and Translate share one
prompt build, one cache and one parser. `src/shared/prompts.ts#buildPrompt` then puts the whole
block into the `{{explainInstr}}` slot of whatever template the user has, and adds
`{{explainField}}` to the JSON line.

That slot is optional. `src/shared/slot-registry.ts` marks `explainInstr` and `explainField` as
not required, and template validation only reports a missing slot that is required. So a custom
template without `{{explainInstr}}` validates, translates, and loses every rule on this page —
no error, no warning, just a thinner answer. Keep both tokens in any custom template.

An image attached to an Explain request rides this same template. The vision-only prompt in
`src/shared/ocr-prompt.ts#buildOcrPrompt` runs only when explain is off, which is why several
blocks below talk about an attached image.

## Why XML-tagged blocks

`<role>`, `<task>`, `<forcing_functions>` and the rest are the part of the prompt that matters
most. Block structure survives degradation better than long flat prose: under a small model the
middle of a flat instruction list is what gets ignored first. Ega's shipped defaults are small
models — `claude-haiku-4-5` for Anthropic, `gpt-4o-mini` for OpenAI, `gemini-2.5-flash` for
Gemini — and the chain can land on whatever else the user configured, so this matters in
production, not just in theory. There is no model-size fallback: the chain is a list of
backends, not a ladder of model sizes.

## Two modes, not one

`explainInstr` splits before it explains. `<classify>` decides between SUBTEXT and PLAIN
MEANING, and `<plain_meaning>` turns most of the rest off for the plain case: no forcing
functions, no depth test, no preferred verbs, no restatement ban. Without that split the
model invented faction signals for an ordinary English word, because every tool in the
block pushes it to find one. Keep the two modes separate when you edit either.

## The sixteen blocks

In source order. "Mode" is which case the block applies to; `<plain_meaning>` names the four
SUBTEXT-only tools itself.

| Block                      | Mode                                     | What it forces                                                                                                | Failure it names                                                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `<role>`                   | Both                                     | Analyst for a loaded phrase, plain-language explainer for a plain one. Decide before writing.                 | —                                                                    |
| `<output_language>`        | Both                                     | The whole brief in the target language, whatever the source is. One source quote allowed.                     | The brief switches language partway.                                 |
| `<task>`                   | Both                                     | The shape: 2-4 short sentences of subtext, or a plain meaning.                                                | —                                                                    |
| `<classify>`               | Both                                     | Pick SUBTEXT or PLAIN MEANING first. Length does not decide it — one word can be pure subtext.                | A slang word read as ordinary vocabulary.                            |
| `<plain_meaning>`          | PLAIN                                    | Define the word, name the sense it carries in this sentence, stop. The SUBTEXT tools are off.                 | Invented faction signals for ordinary vocabulary.                    |
| `<selection_is_page_text>` | Both                                     | Text taken from the page's own title or body IS that content.                                                 | A selected headline explained as a comment replying to the headline. |
| `<context_priority>`       | Both                                     | Split a self-contained colloquialism (page topic irrelevant) from a cryptic reference (page or image needed). | A curse welded to whatever the page happens to be about.             |
| `<insufficient_context>`   | Both                                     | When the referent cannot be identified, write one honest sentence naming what is missing and stop.            | An invented referent — the block calls this the worst failure mode.  |
| `<provenance>`             | Both                                     | Mark any register or geography claim that rests on the page rather than the text.                             | A claim neither the source nor the page supports.                    |
| `<forcing_functions>`      | SUBTEXT                                  | At least two of four: named referent, rejected alternative, faction, cultural anchor.                         | Generic commentary instead of specifics from this text.              |
| `<depth_test>`             | SUBTEXT                                  | Self-audit each sentence: could it be written about any curse or greeting unchanged?                          | The could-apply-to-anything sentence.                                |
| `<preferred_verbs>`        | SUBTEXT                                  | A positive verb menu — names, anchors to, rejects, invokes, codes for.                                        | —                                                                    |
| `<forbidden>`              | Both; the restatement bans lift in PLAIN | Bans restatement verbs, opening on a quote, word-by-word breakdown, dodge-hedging, audience commentary.       | A sentence the translation already said.                             |
| `<tone>`                   | Both                                     | Keep vulgar, hateful, violent or sexual source text at full force.                                            | Harsh source text smoothed over.                                     |
| `<wording_budget>`         | Both                                     | One source quote max; wording, dialect and transliteration notes get one sentence max.                        | A brief that is mostly transliteration analysis.                     |
| `<contract>`               | Both                                     | Repeats the output rule last: which mode, how many sentences, stop rather than pad.                           | Padding to fill the slot.                                            |

Two things the table cannot show:

- `<selection_is_page_text>` ships every time but acts on nothing by itself. It needs the
  "Selection-source" line, which `src/shared/prompts.ts#selectionIsPageOwnText` adds to PAGE
  CONTEXT only when the selection appears in the page title or heading trail.
- Four blocks are template literals that interpolate the target language label:
  `<output_language>`, `<insufficient_context>`, `<provenance>` and `<contract>`. With the target
  set to auto, that label renders as "the same language/variety the source text is written in".

Order is part of the design. The role line comes first because it primes register before any rule
fires. `<preferred_verbs>` exists because a negative-only list collapses fastest under
degradation, and a positive verb menu is a generation cue rather than a refusal cue. `<contract>`
repeats the output rule last: middle bullets go first under degradation, so the core contract is
anchored at the end.

## Why there is no worked example

Even a well-tuned single example reads as mid-tier AI analysis and caps the model at that
example's depth. Three examples from different varieties would fix the over-fit, but good cross-variety examples
need real domain expertise; until that work is done, no example beats a mediocre one.

## Editing it

`prompts.ts` owns the fence contract, so an edit here is more than wording.

- Untrusted text reaches the model inside a `"""` fence.
  `src/shared/prompts.ts#escapeFence` escapes any run of three or more quotes in that text, so a
  crafted selection cannot close the fence and smuggle in instructions.
  `src/shared/prompts.ts#escapeInline` adds single-lining for the bare `Label: value` lines that
  carry page context, glossary entries and rule bodies.
  `src/shared/prompts.ts#fenceHistoryTurn` wraps a replayed side-panel turn the same way.
  `src/shared/prompts.ts#UNTRUSTED_DATA_INSTRUCTION` is the sentence that tells the model the
  fence exists; it holds no per-request data, so the Anthropic cache prefix stays byte-stable.
- Every value the slot pass substitutes is escaped first. The explain block interpolates the
  target language label directly instead, so anything else you interpolate into it has to be
  escaped by hand.
- Editing `explainInstr` reaches every user on the next build, including users on a customized
  template, as long as the slot is still there. Editing
  `src/shared/settings-schema.ts#DEFAULT_PROMPT_TEMPLATE` does not, because a stored template is
  per user: bump `src/shared/settings-schema.ts#CURRENT_TEMPLATE_VERSION`, copy the old text into
  `src/shared/settings-schema.ts#PREVIOUS_PROMPT_TEMPLATE`, and the template-version banner offers
  each user the diff.

## The other prompts

Explain and Translate share the pipeline above. The other five tasks do not — each hands a
fixed system and user pair to the backend, built by
`src/shared/task-prompts.ts#buildTaskTemplate`. Most carry a source comment naming why they are
worded the way they are.

| Task        | Why it reads that way                                                                                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summarize   | Without a named ban, models return meta-commentary — "the text discusses X" — instead of a summary.                                                                                                                  |
| Reword      | Tone resolves through the `{{tone}}` slot, so each tone's wording lives once, in `src/shared/task-prompts.ts#TONE_PHRASE`.                                                                                           |
| Grammar     | "Preserve the author's voice" alone is ambiguous for slang, so the prompt names which informalities to keep.                                                                                                         |
| Reply ideas | With "the target language" some backends answered in the source, so the prompt names the language outright. It also repeats the reply-not-commentary rule, because models describe the text instead of answering it. |
| Ask         | The only task that reads prior turns.                                                                                                                                                                                |

Every task returns JSON only, with `translation` and `confidence`. The Translate and Explain
template (`src/shared/settings-schema.ts#DEFAULT_PROMPT_TEMPLATE`) also asks for `detectedLang`,
`detectedDetail` and `detectedLangs`, and Explain adds `explain`. Of the five other tasks, reword
and grammar add `explain`; the rest return `translation` and `confidence` only. That one shape is
what lets a single parser serve all seven, because every extra field is optional. The image path
has its own prompt in `src/shared/ocr-prompt.ts#buildOcrPrompt`, which adds `detectedLang`.
