# Ega threat model

**Last reviewed:** 2026-10-02, against Ega 0.0.1.
**Status:** Living document. Update it when the attack surface changes.

This document says what Ega defends against, and what it does not. Every
defense below points at the code that implements it. Where a defense is
missing, section 4 says so plainly instead of hiding it.

Citations name a file and a symbol (`` `src/shared/prompts.ts#escapeFence` ``), never a
line number. `pnpm lint:docs` fails when a cited file or symbol is gone.

---

## 1. Trust boundaries

| Boundary                                  | Trust direction         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page DOM → content script                 | **Untrusted → trusted** | Every page is hostile until proven otherwise. The content script runs in an isolated world; page text is data, never code.                                                                                                                                                                                                                                                                                                                                                                                  |
| Content script → service worker           | Trusted → trusted       | Same-extension messages, checked with `src/shared/messages.ts#isFromOwnBackground`.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Service worker → LLM backend              | Trusted → semi-trusted  | Hosted (Anthropic, Gemini, and the 8 OpenAI-compatible providers) or local (Ollama, a local OpenAI-compatible server, native CLI). The provider sees the prompt. You chose it.                                                                                                                                                                                                                                                                                                                              |
| Native host → local CLI child             | Trusted → semi-trusted  | The host spawns `claude` or `codex` with your own login and your own file system rights.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Imported tasks file or backup → settings  | **Untrusted**           | A tasks file or a full backup is JSON a stranger can hand you. A tasks file can carry task prompts, task edits and the Translate prompt that Explain and every language without its own prompt share; a full backup can also carry rules and per-language prompts. Either can carry snippets those prompts use.                                                                                                                                                                                             |
| Imported languages file → settings        | **Untrusted**           | The Languages tab imports a languages file (`src/options/tabs/Languages.svelte#importBundleFile`). It replaces your custom languages, your edits to built-in languages and, from a version 2 file, each language's own prompt (the whole system and user template for Translate and Explain in that language). A custom language's hint and examples go into the prompt when that language is used, and its hint can reach an auto-detect prompt as a candidate (`src/shared/prompts.ts#renderCandidates`). |
| Imported one-language file → settings     | **Untrusted**           | The same Languages tab Import also takes a file with one custom language (`src/shared/storage/backup.ts#exportLanguage` writes it). It adds that language, or replaces only the custom language with the same id, and can carry that language's own prompt for Translate and Explain. It cannot take a built-in id, or an id that reads as a language code or as Auto-detect (`src/options/import-bundle.ts#isLanguageCodeLike`), so it cannot speak for a language you did not import.                     |
| Imported glossary file → settings         | **Untrusted**           | The Glossary tab imports a glossary file (`src/options/tabs/Glossary.svelte#importBundleFile`). It skips an entry when you already have its term for a language it could apply to, so it cannot change or remove yours, or join one of yours in a request. An added entry's term and translation go into the system prompt whenever the term appears in the text, escaped like your own entries (`src/shared/glossary.ts#renderGlossaryBlock`).                                                             |
| `chrome.storage.local` → any surface      | Trusted                 | Local to this browser profile, never synced. Another extension with `storage` permission is Chrome's boundary, not ours.                                                                                                                                                                                                                                                                                                                                                                                    |
| `chrome.storage.session` → content script | **None**                | The worker keeps session storage to `TRUSTED_CONTEXTS` (`src/background/index.ts`), so no content script can read the handoff slot's page text, answer and image from another site. A page's own scripts cannot either — `chrome.storage` is unreachable from page JavaScript. See `docs/PERMISSIONS.md`.                                                                                                                                                                                                   |

The shadow root Ega mounts on the page is **open** —
`attachShadow({ mode: 'open' })` in `src/content/shadowHost.ts#mountShadowHost`. It is a
style and layout boundary, not a security boundary. Page script can reach
`host.shadowRoot`. No API key or stored conversation goes inside it; the one piece of your
setup that can is the system prompt, when you expand **Instructions sent** in the tooltip
(see "The page can read the tooltip" below). The host is built the first time
Ega draws on the page, so a page where you never use Ega never gets one.

---

## 2. Assets

In priority order:

1. **Your API keys** — 10 providers. Most valuable: remote-abusable and
   billable.
2. **Your browsing content** — much more than the selection. Four outbound
   flows, widest first:
   - **"Translate page" sends the page's text, one screen at a time.** It starts only
     when you press **Translate page** in the popup or pick "Ega ▸ Translate this page"
     (`src/content/page-translate-v2/index.ts#runWholePageTranslate`). Ega lists the
     page's text blocks (paragraphs, list items, headings, table cells), up to
     `src/content/page-translate-v2/collect.ts#MAX_PAGE_BLOCKS` of them. A block goes out
     only when it is on screen or within one screen height of it, so text further down
     is sent only if you scroll to it. Ega does not send a block over
     `src/shared/constants.ts#MAX_SELECTION_CHARS` characters, a block already in the
     target language, code, form fields, hidden text, text marked `translate="no"`, or
     anything inside a field that `src/content/safety.ts#isSensitiveTarget` matches
     (`src/content/page-translate-v2/collect.ts#collectBlocks`). Each block goes out as
     its **own** request, `Settings.batchConcurrency` of them at a time
     (`src/content/page-translate-v2/index.ts#createSession`). **Stop** sends nothing
     more; the blocks already sent still finish. Scroll to the end of a long page and
     the provider gets every block you scrolled past.
   - **"Choose areas" sends only the blocks you click.** It opens translate-areas mode:
     you hover, click each block you want, and press Enter or **Translate**
     (`src/content/page-translate-v2/multi-select.ts#enterMultiSelect`). A block is
     refused at pick time when it is over `src/shared/constants.ts#MAX_SELECTION_CHARS`
     characters, when it is empty, when it is already translated, or when it is
     `<html>` / `<body>` / `<head>` or a structural tag
     (`src/content/page-translate-v2/multi-select.ts#selectReject`). Each selected block
     goes out as its own request (`src/content/page-translate-v2/index.ts#startSession`).
     Pick twenty paragraphs and the provider gets twenty paragraphs.
   - **The image path** sends the image itself, base64-encoded and up to 4 MB —
     the largest single request Ega makes — plus the text read out of it. On the
     native CLI backend the picture is also written to the OS temp folder as
     `ega-img-<uuid>` before the CLI starts
     (`native-host/ega-host.mjs#handleTranslateImage`); deletion is best-effort, so a
     killed host leaves it on disk.
   - **The selection plus its context halo.** At the `rich` context level Ega
     sends the page title, the URL origin and path, `<html lang>`, the meta
     description, `og:site_name`, the heading trail, the text before and after
     the selection, and the surrounding post block
     (`src/content/page-context-collector.ts#collectPageContext`).

   Sensitive on a medical, legal or work page.

3. **Side-panel conversation history** — the largest store of page content at
   rest. `saveThread` writes one key per conversation, `ega:conv:t:<id>`, and a site can
   have several; the id is the site's origin, or the origin with `#` and a suffix. An
   `ega:conv:index` row per conversation names its site and keeps its times, message count
   and title: the first line of its first message, up to 80 characters
   (`src/sidepanel/state/conversation-store.ts#saveThread`). The origin starts every key,
   in clear: `chrome.storage.local.get(null)` reads back the sites of up to 50
   conversations. Nothing is hashed, and nothing is synced. Limits are 50 conversations and
   300 turns per conversation, plus byte ceilings — 300 KB per turn, 512 KB per
   conversation, 4 MB across all of them
   (`src/sidepanel/state/conversation-store.ts#MAX_TURN_BYTES`). Each turn keeps the full
   sent text, the full reply, the explain note, every earlier variant from a refine, the
   `contextSent` page-context snapshot, and an image up to 256 KB. With **Record request
   details** on, each of the 20 newest replies also keeps the system prompt it was sent
   with, up to 6,000 characters, which holds the rules and the glossary entries that
   matched. Past a ceiling the oldest turns drop, and a turn over 300 KB is cut back to its
   visible text, capped at 20,000 characters, losing its refine variants
   (`src/sidepanel/state/conversation-store.ts#shrinkTurn`).
   Saving is automatic on every change and no setting turns it off.
   **New conversation** deletes nothing: the old conversation stays in the list.
   **Delete** on a conversation's row in the side panel's list (the site title) removes
   it after an 8-second Undo, and keeps the ids of the removed turns so a second window
   cannot write them back. **Settings → Advanced → Data → Saved conversations** deletes
   one or all of them; **Settings → Advanced → Data → Delete all data** clears everything.
4. **The request audit log** — the last 50 backend requests, text and image
   alike, kept in `chrome.storage.local`. Prompts and responses are clamped to
   200 characters, 1000 when the request failed, and an error message to 500
   (`src/shared/audit-log.ts#AUDIT_MAX_PROMPT_CHARS`). At most 10 of the 50 rows
   are page-translate blocks (`src/shared/audit-log.ts#AUDIT_BATCH_CAP`), so one
   page translate cannot evict the rest.
   That clamp bounds **this log only**. It says nothing about asset 3, which
   stores the same text under a much larger ceiling. The image bytes are never copied
   into the log — only the prompt and the answer. See section 4.
5. **Glossary, custom languages and your own tasks** — your own work. Low
   sensitivity, but yours.
6. **Settings** — backend choice, per-site overrides, theme. Low sensitivity.

The popup pre-fills a selection that opening it dropped. The page keeps that
selection in its own memory, never in storage, and gives it to the popup for one
minute (`src/content/index.ts#selectionForPopup`). Two gates run before the page
keeps it: the sensitive-field check (the full list under "Password and payment
fields" in section 3), then the per-site "Disable Ega on this site" check
(`src/content/index.ts#handleSelectionChange`). A site you turned Ega off on keeps
nothing.
One more store lives only until you close the browser: `chrome.storage.session`.
Its slot `ega.pendingPopupHandoff` carries the most: the text you sent, the
model's answer, the explain brief, text read out of an image, and the image
itself as a data URL (`src/shared/pending-popup-handoff.ts`).
The Storage shape table in `docs/ARCHITECTURE.md` lists the full session storage set.

---

## 3. Threats defended

### Prompt injection from page content

A hostile page puts `"""` plus new instructions inside text you select.

**Defense:** `src/shared/prompts.ts#escapeFence` puts a backslash before every quote in
a run of three or more, so `"""` becomes `\"\"\"` and the run cannot close the block. It
escapes every quote in the run, not only the first three, so a five-quote run cannot
re-form a fence. The run counter also bridges invisible format characters **and**
combining marks (`[\p{Cf}\p{M}]`), so `"<zero-width space>""` and `"<combining
acute>""` are caught as three-quote runs too. Context fields get their newlines
flattened on top of that, so a value cannot start a new instruction line
(`src/shared/prompts.ts#escapeInline`). Applied to the selection, page title, URL, page
language, site name, description, heading trail, the text before and after the
selection, and the post body — with no trust branch
(`src/shared/prompts.ts#renderContext`). Every system prompt also carries a fixed
instruction that names the block as untrusted data
(`src/shared/prompts.ts#UNTRUSTED_DATA_INSTRUCTION`). Your own glossary and rules
render above it (`src/shared/prompts.ts#composeSystemPrefix`); both are escaped
first, so the property holds.

### Prompt injection from an earlier turn in the conversation

A side-panel thread replays earlier turns. Those turns are page text you once
selected, so a hostile page can plant instructions and wait for your follow-up
question to carry them back in.

**Defense:** the service worker rebuilds the history on every request and fences each
turn — untrusted label, `"""` block, `escapeFence` on the body — before it reaches the
wire (`src/shared/prompts.ts#fenceHistoryTurn`, applied at
`src/background/index.ts#boundedOptions`). `boundedOptions` also cuts each turn to 2000
characters and keeps only the last `MAX_HISTORY_TURNS` (40).

### Prompt injection from your own presets and glossary

**Defense:** the same escaping runs on glossary term and translation
(`src/shared/glossary.ts#renderGlossaryBlock`), on rule bodies
(`src/shared/rules.ts#renderRulesBlock`), and on candidate preset id, label and hint
(`src/shared/prompts.ts#renderCandidates`). A rule body, a glossary term and a glossary
translation also pass `src/shared/utils/single-line.ts#toSingleLine` in the schema itself,
so a multi-line value cannot even reach storage. A custom-language hint is not flattened;
it is fence-escaped only.

### Secrets in the page context

Page metadata routinely carries keys: a title on a paste site, a URL with a token in
it, a code block in the surrounding post.

**Defense:** `src/shared/redact.ts#redactContext` masks the outbound page context on
every request that carries one. No setting turns it off. The pattern table covers
Anthropic / OpenAI / Google / GitHub / AWS / Slack / Stripe / npm keys, JWTs, PEM
private-key blocks (including one truncated by the context cap), `Bearer` tokens,
e-mail addresses and Luhn-valid card numbers. `docs/PRIVACY.md` lists the same labels,
and a test fails if the two drift. The text you asked to translate is never masked —
that would corrupt the answer.

### A hostile tasks file from a stranger

**Defense:** every task row, task edit and task id in the file is checked on its own against
a schema with hard length caps, and a bad one is skipped and counted
(`src/options/import-bundle.ts#parseImportBundle`). Nothing is stored before a confirm
step that names how many tasks and edits the file holds. See section 4 for what the
confirm does **not** show.

### Cross-tab streaming-chunk spoofing

Another tab, or a page guessing the extension id, tries to inject fake
`translate:chunk` messages into your tooltip.

**Defense:** `src/shared/messages.ts#isFromOwnBackground` requires
`sender.id === chrome.runtime.id` **and** `sender.tab === undefined`, so only Ega's own
service worker passes. One copy, shared by the content script and the side panel.

### SSRF through the image path

You right-click an image whose `src` points at a cloud metadata endpoint, and
the service worker fetches it for you.

**Defense:** `src/shared/image-url-guard.ts#validateImageSrc` runs before the fetch. It
allows only `http`/`https` and raster data URLs; SVG is rejected. It blocks
`0.0.0.0/8`, link-local and cloud metadata (`169.254.0.0/16`), carrier-grade NAT
(`100.64.0.0/10`), multicast and reserved space, the whole IPv6 `fe80::/10` block as a
numeric range test (`fe81::1` and `febf::1` fail too, not just the `fe80:` spelling),
`fd00:ec2:`, `.local` and `.internal` hostnames, and IPv4-mapped IPv6 forms of all of
these. The fetch itself uses `redirect: 'manual'` and refuses any redirect, so a 302 cannot
walk to a target the guard never saw; the response must be PNG / JPEG / WebP / GIF, it is
read with a running byte count so an unbounded body aborts at 4 MB instead of buffering
whole, and the fetch carries its own 20-second budget
(`src/background/router-image.ts#fetchImageForVision`).

**Left open on purpose:** loopback (`127.0.0.0/8`) and private ranges
(`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) pass the guard
(`src/shared/image-url-guard.ts#validateImageUrl`). The page already rendered the image, so
the browser could already reach that host. A page can therefore get an image
from your own LAN sent to your provider — but only from a URL it could load
itself, and only after you pick an image right-click item.

The guard reads the URL, not the DNS answer. A hostname that resolves to a blocked
address, such as a name pointing at `169.254.169.254`, passes it. The response must still
be a raster image, so a metadata endpoint's JSON is refused before anything reaches the
provider.

### Query strings and fragments leaking to the provider

Page URLs routinely carry session tokens, password-reset codes and search
terms.

**Defense:** the collector sends origin and path only. Query string and
fragment are dropped before the URL enters a prompt
(`src/content/page-context-collector.ts#safePageUrl`).

### Password and payment fields

**Defense:** three things, together.

- The selection bubble is suppressed, the element picker refuses to pick, and
  translate-areas mode refuses to select, when the focused or hovered element is a
  password input, has an `autocomplete` of `cc-*` / `current-password` /
  `new-password` / `one-time-code`, is `contenteditable`, has `role="textbox"`, or
  sits under `data-ega-skip` (`src/content/safety.ts#isSensitiveTarget`, used from
  `src/content/index.ts#handleSelectionChange`, `src/content/picker.ts#isPickable`
  and the click handler in `src/content/page-translate-v2/multi-select.ts`).
  Whole-page translate leaves such a field, and everything inside it, out of the
  blocks it collects (`src/content/page-translate-v2/collect.ts#collectBlocks`).
- The name check covers `<textarea>` as well as `<input>`, and reads every string a
  page can label a field with: `name`, `id`, `aria-label`, `placeholder`, `title`,
  every `<label for>` and every `aria-labelledby` target. The pattern matches
  password / cvv / cvc / security-code / card-number / ssn / pin / otp / totp / 2fa /
  mfa / verification-code / secret / token / api-key / private-key / seed-phrase /
  mnemonic / recovery / iban / routing / tax-id
  (`src/content/safety.ts#SENSITIVE_NAME_RE`).
- Page context never reads form values at all. It reads the title, the URL
  origin and path, `<html lang>`, the meta description, `og:site_name`,
  the heading trail, and the `textContent` of the surrounding block
  (`src/content/page-context-collector.ts#collectPageContext`, `src/content/post-block.ts`).
  `textContent` does not include what is typed into an `<input>`.

### API keys syncing to your Google account

**Defense:** Ega reads and writes `chrome.storage.local` only
(`src/shared/storage.ts#getSettings`). It never touches `chrome.storage.sync`,
so keys stay on this machine. Neither does any other store Ega owns: the
conversation threads, the audit log and every `chrome.storage.session` key are
device-local.

### A page driving Ega's own controls

A page shares the content script's DOM and its event dispatch. A page script can
select its own text and dispatch the shortcut keydown, click the selection bubble, or,
once a tooltip is open, click Retry, Swap or Explain and fire `change` on the task and
tone selects inside the open shadow root. Each of those would start a request on your
key or CLI quota with page-chosen text, in a loop if the page wants.

**Defense:** each handler that starts a request from the page checks
`src/content/user-gesture.ts#isUserGesture`, which passes only an event the browser
marks `isTrusted`: the shortcut, the bubble click, the element picker, translate-areas
selection and its toolbar, the tooltip's Retry / Swap / Explain buttons and task / tone
selects, the **Try again** / **Open settings** buttons on the error chip that page
translate and inline replace place in the page's own DOM, the page-translate pill's
buttons and More menu, every in-page toast action (Turn on, Undo, Open settings,
Reload page) and the bubble menu's items (Turn off on this site, Bubble settings). A
synthetic event reaches the listener and is dropped. Proof:
`tests/e2e/synthetic-events.spec.ts` dispatches each of the shortcut, the bubble click,
a Retry click and a task change from the page and asserts that nothing is sent, then
sends the real one; `synthetic-events-pill.spec.ts` does the same for the pill's Try
again, and `synthetic-events-notices.spec.ts` for a toast's Turn on and a bubble menu
item. Residual: the page can still read the answer out of the open shadow root
(section 1).

### A page driving your local Ollama

**Defense:** the page cannot reach Ega's message channel; only the content
script can call `chrome.runtime.sendMessage`. A direct
`fetch('http://localhost:11434/api/chat')` from page script is refused by Ollama's own
origin check. `/api/tags` still answers, which shows the page your model list, not your
text. Ega's Ollama calls run from the service worker.

### A hostile page exfiltrating a local file through the native host

The `claude` CLI reads `@<path>` and `@"<any path>"` in a prompt as file attachments
and puts the file's contents into the prompt, even with every tool turned off. Page
text can carry either form.

**Defense:** the host puts an invisible word joiner (U+2060) right after every `@`
that opens a token, in both the system and user prompt, before they reach the CLI
(`native-host/ega-host.mjs#neutralizeFileRefs`, applied in
`native-host/ega-host.mjs#handleTranslate` and, for the image path, in
`native-host/ega-host.mjs#imageInvocation`). The text reads the same to the model,
but the CLI's quoted form no longer matches and its bare form names a file whose name
starts with U+2060, which does not exist. An `@` with a word character in front of it,
as in `me@example.com`, is left alone. The image path adds its own quoted
`@"<temp file>"` after this step. `native-host/test/host.test.mjs#cliFileRefs` runs the CLI's own two
patterns over what the CLI receives.

### A hostile prompt making the `claude` child use tools

**Defense:** the child is spawned with `--tools ""`, `--strict-mcp-config` and
`--setting-sources ""`, which removes both normal tools and any MCP tools the
user's config would add (`native-host/lib/protocol-claude.mjs#CLAUDE_SAFETY_ARGS`,
used by both the warm session and the one-shot image path). It runs with its working
directory set to the home directory, not whatever directory Chrome happened to launch
from (the `cwd` the host hands `native-host/lib/cli-session.mjs#CliSessionManager`,
`native-host/ega-host.mjs#homedir`).
It also runs with `--no-session-persistence` and with `CLAUDE_CHILD_ENV` set
(`native-host/lib/protocol-claude.mjs#CLAUDE_CHILD_ENV`). The CLI then does not save the page
text in its transcript files, and does not add your own memory or `CLAUDE.md` files to the
prompt.

### A hostile prompt making the `codex` child touch your machine

**Defense:** the `codex` child is spawned with `sandbox_mode="read-only"`,
`approval_policy="never"`, web search off (`web_search="disabled"`, the key codex-cli
0.155 reads; the older `tools.web_search=false` is passed too), the built-in image reader
off (`features.view_image=false`), the built-in apps tools off (`features.apps=false`),
plugins off (`features.plugins=false`), and the shell, exec, browser and computer-use tools
turned off
(`native-host/lib/protocol-codex.mjs#CODEX_SAFETY_ARGS`). Read-only alone is not enough:
with approval set to never, codex runs a read-only shell command such as `cat` without
asking. Every codex request, text or image, is its own `codex exec --ephemeral` process
(`native-host/ega-host.mjs#codexExecArgs`), so page text from one request cannot steer the
next, and codex saves no session file with the text in it.

The child also runs with `--ignore-user-config` and `--ignore-rules`, so it does not read
the user's `config.toml` or exec policy rules, and the MCP servers and hooks defined there do
not load. That flag skips only the user layer: a system or managed config
(`%ProgramData%\OpenAI\Codex\config.toml`, `/etc/codex/config.toml`) can still define MCP
servers. So the host lists them with `codex mcp list --json` under an empty `CODEX_HOME`,
once per 10 minutes, and turns each one off by name
(`native-host/lib/protocol-codex.mjs#codexMcpOverrides`). A server whose name a `-c` path
cannot hold (a dotted name) stops the request with a message instead. Plugin content still reaches the prompt without a config,
which is why `features.plugins=false` is passed too: on codex-cli 0.155.1 it took a one-line
request from 5328 back to 4934 input tokens. The one setting the host reads back out of
`config.toml` is where the login is kept (`cli_auth_credentials_store`), so a login in the
OS keyring still works (`native-host/lib/protocol-codex.mjs#codexAuthStoreArgs`). The cost:
a model, provider or profile set in `config.toml` does not apply to ega's requests. The flags
need codex-cli 0.122.0 or later; an older codex fails with a message that says to update it.

`project_doc_max_bytes=0` keeps an `AGENTS.md` in the home folder, which is the child's
working directory, out of the prompt. The global `~/.codex/AGENTS.md` still reaches it
(checked with `codex debug prompt-input` on 0.155.1); no setting that turns it off was found.

Residual risks:

- **Hooks from a system or managed codex config.** `hooks` is on by default, and the host
  does not list or turn off hooks a system layer defines. Not checked on a machine that has one.

- **The page can read the tooltip.** The tooltip renders in an open shadow root, so
  script on the page can read the answer it shows. Whatever a model puts in an answer
  to a page selection, that page can see. When you expand **Instructions sent** in the
  tooltip's About, the system prompt is in that root too, so the page can read your
  rules, snippets and the glossary entries that matched.

### Argument injection into the CLI child

**Defense:** the model id is the only caller-supplied value that reaches
`argv`, and it must match `/^[\w./-]{1,80}$/` or it is dropped
(`native-host/lib/cli-session.mjs#sanitiseModel`). Everything else in `argv` is a
literal the host owns or a temp-file path it made itself, and the host never spawns through a shell — a Windows `.cmd`
shim goes through `native-host/lib/cli-session.mjs#windowsSafeSpawn`, which quotes
every argument itself.

### A bad frame that hangs or overloads the native host

**Defense:** an inbound frame longer than 8 MB is refused instead of
allocated (`native-host/ega-host.mjs#MAX_FRAME_BYTES`). A 4 MB image encodes to about
5.3 MB of base64, so 8 MB leaves room for the largest normal frame. On a longer frame
the host sends a `PROTOCOL` error and exits, because the stream cannot resync. A CLI child that never finishes
is killed after 90 seconds, or after `EGA_HOST_TIMEOUT_MS` when that is set in
the host's own environment (`native-host/ega-host.mjs#CHILD_TIMEOUT_MS`) — the
host runs under your own account, so that override is a local setting, not an
attacker-reachable input. An uncaught error fails every in-flight request rather
than hanging the extension (`native-host/lib/cli-session.mjs#failAll`).

---

## 4. Threats not defended

### The model is talked out of its system prompt

Fence escaping stops the obvious escape. A clever prompt still steers the
model. This is a limit of LLMs, not of the escaping. Use a provider you
trust.

### The content script can read your API keys

The keys no longer pass through the content script. It asks the service worker for the
settings, and the worker deletes every `*ApiKey` field before it answers
(`src/background/content-reads.ts#readForContent`). Custom languages and tasks come the same
way, so a page never loads the storage reader. A settings write reaches the content script only
as the name of the key that changed, with no old or new value
(`src/shared/stored-changes.ts#onStoredChange`). The per-site direction memo sends a patch to
the service worker (`src/content/memo-direction.ts#maybeMemoDirection`), and
`eslint.config.js` blocks the mutating exports of `shared/storage.ts` in `content`, `popup`
and `sidepanel`.

What remains: Chrome lets any content script read `chrome.storage.local` directly. Ega's does
not, but that is a choice, not an access boundary. A content script is not a key boundary in
Chrome's model. Page script cannot reach it, because it runs in a different world.

### An imported tasks file can replace your task prompts

The import confirm shows only counts. It does **not** show the prompts
(`src/options/import-bundle.ts`). A tasks file from a stranger can therefore
rewrite the instructions Ega sends for every task, and you would not see it before
you confirm. Only import files from people you trust.

### Old builds do not refuse newer settings

There is no schema version and no migration chain. Stored settings are parsed against
the current schema and repaired field by field: a value past a declared cap is clamped,
a list entry or record value that cannot be clamped is dropped, an unknown key is
stripped (`src/shared/settings-clamp.ts#clampToSchema`). A field an older build does not
know is therefore removed on the first read, silently. Downgrading Ega can lose settings.
This costs data, not security.

A fourth case is wider than the other three. Clamping cannot invent a value, so a
**required** key missing from a nested object is unrepairable. The repair then replaces
the whole top-level section that key sits under with its shipped default
(`src/shared/settings-schema.ts#parseStoredSettings`), and if even that still fails to
parse, every setting falls back to the shipped defaults.

There is no live example today, and a test is the reason.
`tests/unit/shared/settings-schema-nested-defaults.test.ts` walks the schema and
fails when any key below the top level lacks a default, so the unrepairable case
cannot be introduced. Give a new nested key a default, or make it optional — the
test will tell you.

A second pass runs after the clamp.
`src/shared/storage/sanitise.ts#sanitiseStoredSettings` drops any stored
reference to a backend or variety the running build does not register: a disabled
backend, a per-site language. It warns to the console and repairs silently for the
user. This is the path that loses such a reference when the build reading it no
longer registers the backend or the language.

### API keys are plaintext at rest

`chrome.storage.local` is an unencrypted LevelDB store in your browser
profile. A disk image, or malware running as you, reads it. Accepted: this
matches every comparable bring-your-own-key extension, and the only real fix
is a master-password unlock flow, which is out of scope. Three known limits
go with that: the keys sit as plain fields on the settings record, so every
**extension page** that calls `getSettings()` — Settings, popup, side panel — holds
them in memory even though only the service worker sends them as request headers; they
have no expiry and no rotate prompt, so they stay until you delete them or use About →
**Delete all data**; and Chrome DevTools shows them in cleartext. The
audit-log entry never carries key material, and the settings export strips
keys unless you tick the box.

### Your visited sites are readable as storage key names

The side panel writes each conversation under `ega:conv:t:<id>`, and the id starts with
the site's origin in clear. Anything that can call
`chrome.storage.local.get(null)` in this profile reads back the sites of up to 50
conversations without touching the conversation bodies. This is a deliberate call, not an oversight: hashing
the key while the conversation text sits in plaintext underneath it hides nothing from
the same reader. The store is device-local and never synced, and **Settings → Advanced → Data →
Delete all data** removes it.

### Any page can detect that Ega is installed

The build declares its content-script JS chunks as `web_accessible_resources` for
`<all_urls>` with `use_dynamic_url: false` — the shape CRXJS emits. `vite.config.ts`
removes any stylesheet from that list on purpose, and `scripts/bundle-budget.ts` fails
the build if one comes back. The resource URLs are therefore stable, and the
extension id is stable too, because the manifest ships a fixed public key
(`manifest.config.ts`). Any page can `fetch` one of those URLs and learn from the
result whether you run Ega. `use_dynamic_url: true` would close it by rotating the
origin per session.

Accepted. The id is committed in this repo's own source, so the fingerprint gives away
nothing that is not already public, while flipping the flag changes how the
content-script chunks load. Nothing secret sits behind those URLs — they are the same
JavaScript that ships in the package.

### A compromised machine

Malware reading `chrome.storage.local`, or another extension with `storage`
permission. That is Chrome's security model, and a user in that state has
larger problems.

### A page calling your LM Studio or llama-server directly

The local server backend talks to LM Studio or llama.cpp's `llama-server` on loopback. Unlike
Ollama, `llama-server` does not check who calls it: by default it reflects any `Origin` header
back with credentials allowed. So any page you open can call `/v1/chat/completions` on it and
read the answer, using your model and your GPU. Ega cannot close this; the server can.

- Start `llama-server` with `--cors-origins localhost`, so only pages served from
  `localhost` get CORS headers. Ega does not rely on CORS headers: the extension has host
  permission for every site, so Chrome does not apply CORS to its own requests.
- `--api-key` also keeps pages out, but Ega sends no API key, so it keeps Ega out too.
- `llama-server` listens on `127.0.0.1` by default, which keeps other machines out. Do not
  pass `--host 0.0.0.0`.
- LM Studio sends no CORS headers until you turn on its CORS setting. Leave it off; Ega does
  not need it.

### Another extension posing as Ega to the native host

The native host answers the extension ids listed in its manifest's `allowed_origins`. The
key that fixes Ega's unpacked id is committed (`manifest.config.ts`), so anyone can build
an unpacked extension with the same id and talk to an installed host. Doing that needs
the user to load that extension in developer mode on their own machine, which is the
compromised-machine case above. A Web Store build has its own id and is not affected.

### A malicious npm dependency

Pinned versions and dependency review reduce this; they do not remove it.
The release workflow attaches a signed build-provenance attestation to the zip
(`gh attestation verify <zip> -R el-f/ega`), and `pnpm zip` is deterministic: the same `dist/`
gives the same bytes. That ties a zip to the commit and run that built it. It does not prove
the dependencies are clean, and there is no SBOM.

### Timing side channels on streaming responses

HTTPS hides the content. Inferring text from chunk size and timing is far
below what a normal network observer would attempt.

### The provider logging your prompts

Anthropic, Google, OpenAI and the rest see everything you send them. You
agreed to that when you picked the provider. Ega's job is to show you what
leaves your device, not to prevent the send.

Each reply's details panel ("About this reply", `src/shared/components/ReplyDetails.svelte`, in the
tooltip and the side panel) shows what was sent: the text, how many earlier messages, and the page
info. When **Record request details** is on, it also shows the system prompt as the request carried
it ("Instructions sent", cut at 6,000 characters), so the glossary and rules blocks are in view too.
The page info shows in its own row: the shipped prompts put the PAGE CONTEXT block in the user
message, and only a custom prompt with `{{context}}` in its system half puts it in the system
prompt. It does not show an attached image.

The side panel keeps that prompt with the conversation in `chrome.storage.local`, on the 20 newest
replies only. It goes when the conversation is deleted and with "Delete all data", it is part of
"Copy as JSON" and "Download as JSON", and Ega never sends it anywhere.

Open **Settings → Advanced → Diagnostics → Recent requests**: it keeps the last 50 system
and user prompts, each clamped to 200 characters (1000 when the request
failed).

### What the audit log does and does not show

Every backend call writes an entry, including the image paths and the
per-backend "Test now". The image paths write from
the same `emitAudit` in `src/background/router.ts` as every text request: an image request
runs the text path, so the right-click image item is covered as well.

Two limits remain, and both matter when auditing an image request:

- **The image bytes are not in the log.** The entry records the prompt and the
  answer. To see what picture was sent you have to look at the page, not the
  log.
- **The 50-entry cap makes the log short-lived.** At most 10 of those 50 rows
  can be page-translate blocks (`src/shared/audit-log.ts#AUDIT_BATCH_CAP`), so
  one page translate no longer evicts your interactive history — but a busy hour
  still does.

A backend that reports itself unreachable while another one in the chain answers
writes nothing, because no request was built for it. Two cases write a row with
no backend call at all: a cache hit, and a translate with no reachable backend.
`docs/PERMISSIONS.md` lists every path that writes a row and every one that does
not.

### A tracker on the page reading your selection

Any script on the page can call `window.getSelection()`. Not specific to Ega.

### The hotkey and the right-click item run a narrower field check

Section 3 lists what blocks the selection bubble, the element picker and
translate-areas mode. `Ctrl+Shift+L` and "Ega ▸ Translate" do not
run that check. They call `src/content/safety.ts#selectionIsSensitive`, which
refuses password, card and one-time-code fields and anything under
`data-ega-skip`, but not a `contenteditable` element and not `role="textbox"`.

Accepted, and deliberate: translating what you are typing is a feature. The cost
is that a selection inside a Slack, Discord or Gmail composer is translated on
the hotkey path even though the bubble refuses it there, so the field-name
pattern (`src/content/safety.ts#SENSITIVE_NAME_RE`) is the only thing between a
secret pasted into a chat box and your provider.

### Dictation sends your voice to Google

The side-panel mic button uses the browser's Web Speech API
(`src/sidepanel/conversation/InputRow.svelte#SpeechRecognitionCtor`). Chrome's
engine is server-based and Ega does not set the on-device flag, so the audio
goes to Google — not to the backend you picked. This is the only flow that
reaches a party you did not choose.

Nothing is sent until you press the mic button, and Ega stores no audio.
Accepted: the alternative is shipping a speech model. `docs/PRIVACY.md` covers
it for the user.

### You paste a secret into the translate box

User error. Covered in `docs/PRIVACY.md`.

### Bugs in Chromium itself

Upstream's responsibility.

---

## 5. Revision policy

Update this document when:

- a new attack surface appears (new integration, new data sink),
- a new defense ships (add it to section 3, with the file that implements it),
- a report or CVE changes what is realistic,
- a gap in section 4 is closed, or a new one opens.

Move the **Last reviewed** date on every edit. A date behind the last edit means
the newest text was never reviewed, and a reader cannot tell which part that is.

Do not record threats that are not real yet. This document must match what
the code does, not list everything that could go wrong.
