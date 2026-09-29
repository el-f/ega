# Detailed description — Chrome Web Store

Paste the text below into the store form's **Detailed description** field. Every
other field of the form is covered in [`store/listing.md`](./listing.md).

---

Ega translates the informal, niche and invented language varieties that
general-purpose translators get wrong: Arabizi ("mar7aba, kifak?"), Leetspeak, Gen-Z
slang, Elvish (Quenya and Sindarin), gaming jargon, fandom shorthand,
crypto-Twitter, medical shorthand and legal jargon. You can add your own language
from a short description and a few example pairs.

Ega runs no server. You pick the model, and your text goes from your browser
straight to it.

**What you can do**

- **Selection bubble and tooltip.** Select text on any page and click the Ega
  bubble. The tooltip shows the result, the language Ega detected and a
  confidence pill. From there you can copy it, ask for an explanation, pin it to
  the side panel, retry, or swap the direction.
- **Seven tasks on the same selection.** Translate, Explain, Summarize, Reword
  (formal, casual, neutral, polite or blunt), Grammar, Reply ideas, and Ask.
- **Side panel.** One chat thread per site. Ask follow-up questions, attach an
  image, search the thread, bookmark turns, copy the thread as Markdown, and
  download it as JSON.
- **Right-click menu.** Seven items by default: translate the selection, send
  the selection to the side panel, translate the page, pick an element,
  translate an image, explain an image, and turn Ega off on this site. You can
  rename, reorder, hide or nest them in Settings.
- **Element picker.** Press Ctrl+Shift+E, or use the Pick element tile in the
  popup, then click any block on the page.
- **Images.** Right-click a picture to translate or explain the text inside it.
  The answer opens in the side panel, or in the tooltip if you prefer.
- **Keyboard.** Ctrl+Shift+L translates the current selection. Ctrl+Shift+E opens
  the element picker. Ega watches for both keys in the page itself, and you set
  both in Settings → Selection & picker. Ctrl+Shift+L is also a Chrome command, so
  it shows up at chrome://extensions/shortcuts. Remapping or clearing it there
  covers only the Chrome half — change the Settings field as well to move the key
  for good.
- **Popup.** Four tiles: translate this page, pick an element, translate the
  clipboard, open the side panel. Under them, a box where you type or paste
  your own text and send it to the side panel.

**Bring your own model**

Ega has no API key of its own. Pick one of these in Settings → Backends:

- **Cloud, with your key:** Anthropic, Google Gemini, OpenAI, Groq, DeepSeek,
  Together, Mistral, xAI, Fireworks, OpenRouter.
- **Fully local:** point Ega at an Ollama server running on your machine.
- **Your CLI:** install the native-messaging host and Ega talks to the `claude`
  or `codex` CLI you already have. If that CLI uses a subscription, there is no
  extra API cost.

A new install turns on three of these, in this order: Anthropic, Google Gemini,
then your CLI. A cloud backend with no saved key is skipped, so if you set no key,
Ega goes to the CLI on its own. Nothing reaches the CLI until you install the
host, and you can turn that backend off in Settings → Backends. The other
backends start off, and you switch on the ones you want.

**Built-in languages**

Arabizi (Levantine, Egyptian, Gulf), Leetspeak, Gen-Z slang, Gaming jargon,
Fandom jargon, Crypto-Twitter, Elvish (Quenya), Elvish (Sindarin), Medical
jargon, Legal jargon. English is the default target language, and you can pick
another one.

**Settings worth knowing**

- **Smart bubble.** The bubble stays hidden when the selection already looks
  like English, so plain pages stay quiet. You can also set it to always or
  never.
- **Page context.** Ega can send some of the page around your selection, so the
  model knows what you are reading. Off sends nothing. Minimal, the default, sends the page title,
  the page URL, and the text before and after your selection. Rich adds the page
  language, the page description, the site name, up to three headings above your
  selection, and up to 800 characters of the post or article block your
  selection sits in. The before and after text is 200 characters each way by
  default, but on nine chat and social hosts it is at least 1000 each way, even
  when you set a smaller number: web.whatsapp.com, discord.com, web.telegram.org,
  app.slack.com, www.instagram.com, www.messenger.com, twitter.com, x.com and
  www.reddit.com. The URL is cut down to the site and path first, so the query
  string and the `#` fragment never leave the browser. "Show what was sent"
  in the tooltip lists the context. Its plain list leaves out the post or article
  block; press "Show raw JSON" in that same panel to see every field, that one
  included.
- **Glossary.** Term-to-translation pairs. A pair is added to the prompt only
  when its term appears in the text you selected.
- **Custom languages.** Write a description and add example pairs. Export and import
  them as JSON; an imported file can also carry a detection regex.
- **Prompts.** Settings → Templates holds the global prompt template, per-task
  and per-language overrides, reusable snippets, rules and recipes. Settings →
  Translate holds temperature and max tokens, with per-task overrides.
- **Per site.** Turn Ega off on one site, and let it remember that site's
  default language and last translation direction.

**Privacy**

- No account, no telemetry, no analytics. Ega sends nothing to its developer.
- Settings, API keys, glossary, custom languages and side-panel threads are
  stored in `chrome.storage.local` on your machine. Ega never uses
  `chrome.storage.sync`, so nothing is copied to your Google account.
- Ega also keeps a request log on your machine, and it is always on. It holds
  your last 50 requests: the time, the task, the languages, the backend, the
  model, the speed, and the first 200 characters each of the system prompt, the
  user prompt and the answer (1000 each when the request failed). The user prompt
  is the one that carries your picked text and the page context. Settings →
  Advanced → Diagnostics shows this log and clears it. Ega never sends it
  anywhere.
- While you read a page, Ega caches the text you picked last in browser session
  storage, so the popup can prefill its box for you. It holds the text, the site
  origin and the time. It is written on every selection change — but not on a site
  where you turned Ega off, and not from a password, payment-card or one-time-code
  field. It stays until your next selection replaces it or you close the browser,
  and it never leaves your machine.
- Your text goes straight to the backend you configured. Ega owns none of the
  infrastructure in between. Ega makes three other kinds of call, and each one
  follows something you did: it downloads an image you right-click, from that
  image's own address; it asks a provider for its model names when you press
  Refresh in Settings; and it checks whether your local Ollama server answers,
  when it routes a request or when you open the Backends page.
- One thing runs with no click from you. When your CLI is first in the backend
  order, Ega starts the `claude` CLI in the background each time the browser wakes
  the extension, so your first translate is not slow. With `codex` there is
  nothing to start. The pre-warm talks to the local host
  program only, sends no text, and uses no network. Turn it off with "Start the
  native CLI with the browser" in Settings → Backends.
- Ega stays out of password fields, payment-card fields and one-time-code fields:
  the bubble and the element picker skip them, and a selection inside one is
  never cached.
- Before page context goes out, Ega masks API-key shapes, JWTs, private-key
  blocks, `Bearer` tokens, email addresses and valid card numbers in it. This
  masking covers the context only. The text you picked is sent as you picked it,
  because masking it would corrupt the answer.
- The side panel's mic button uses Chrome's own speech recognition. While it is
  on, Chrome streams the audio to Google's speech service and returns the text.
  Ega stores no audio. Do not press the button if you do not want that.
- The settings export leaves your API keys out unless you tick "Include API
  keys in the export".

Permission-by-permission detail:
https://github.com/el-f/ega/blob/master/docs/PERMISSIONS.md

Privacy posture in full: https://github.com/el-f/ega/blob/master/docs/PRIVACY.md

Source and documentation, MIT licensed: https://github.com/el-f/ega. This is a
personal project with no support channel.
