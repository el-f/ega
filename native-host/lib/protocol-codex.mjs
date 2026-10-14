// The flags and the output reader for `codex exec --json`, one process per request.

// Page text can carry injected instructions: read-only alone still auto-approves a shell `cat`, so the shell, exec, browser, computer-use, web-search, image-reading, apps and plugin tools are off. Keys from `codex features list`, codex-cli 0.155.1.
// Both web-search keys: codex-cli 0.155 reads the top-level mode, older codex read the tools flag.
export const CODEX_SAFETY_ARGS = [
  '-c',
  'sandbox_mode="read-only"',
  '-c',
  'approval_policy="never"',
  '-c',
  'tools.web_search=false',
  '-c',
  'web_search="disabled"',
  '-c',
  'features.shell_tool=false',
  '-c',
  'features.unified_exec=false',
  '-c',
  'features.browser_use=false',
  '-c',
  'features.computer_use=false',
  '-c',
  'features.view_image=false',
  '-c',
  'features.apps=false',
  '-c',
  'features.plugins=false',
  // Keeps an AGENTS.md in the home folder (the child's cwd) out of the prompt; ~/.codex/AGENTS.md still loads.
  '-c',
  'project_doc_max_bytes=0',
];

// Replaces codex's coding-agent instructions, written to the file model_instructions_file names. ega's task prompt rides in the user turn.
export const CODEX_INSTRUCTIONS =
  'You process text for a browser extension. Follow the instructions in each message exactly. Reply with the requested output only.';

/**
 * The `-c` pair that points codex at an instructions file. The value is TOML, and a JSON string is a valid TOML basic string.
 * @param {string} filePath @returns {string[]}
 */
export function codexInstructionsArgs(filePath) {
  return ['-c', `model_instructions_file=${JSON.stringify(filePath)}`];
}

// The key may be quoted, as TOML allows.
const AUTH_STORE_RE =
  /^[ \t]*(["']?)cli_auth_credentials_store\1[ \t]*=[ \t]*["'](file|keyring|auto)["'][ \t]*(?:#.*)?$/m;

/**
 * --ignore-user-config also drops where the login is kept (default "file"), so a keyring login would
 * read as logged out. Passes the user's own top-level setting through; nothing else from the file.
 * @param {string} configToml @returns {string[]}
 */
export function codexAuthStoreArgs(configToml) {
  // A Windows editor's BOM would hide a key on the first line; codex itself reads such a file.
  const topLevel = String(configToml)
    .replace(/^\uFEFF/, '')
    .split(/^[ \t]*\[/m)[0];
  const m = AUTH_STORE_RE.exec(topLevel);
  return m ? ['-c', `cli_auth_credentials_store="${m[2]}"`] : [];
}

// A `-c` path cannot hold a dotted name, and a name codex has not loaded fails its config load, so only listed, addressable names are turned off.
const MCP_NAME_OK = /^[\w:@/-]+$/;

/**
 * `-c` overrides that turn off every enabled server in `codex mcp list --json` output.
 * @param {string} listJson @returns {{ args: string[], stillLoaded: string[] }} `stillLoaded` names the servers no override can address
 */
export function codexMcpOverrides(listJson) {
  let list;
  try {
    list = JSON.parse(listJson);
  } catch {
    return { args: [], stillLoaded: [] };
  }
  const args = [];
  const stillLoaded = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry || typeof entry !== 'object' || entry.enabled !== true) continue;
    if (typeof entry.name !== 'string') continue;
    if (MCP_NAME_OK.test(entry.name)) args.push('-c', `mcp_servers.${entry.name}.enabled=false`);
    else stillLoaded.push(entry.name);
  }
  return { args, stillLoaded };
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}

/**
 * Pull the assistant text out of one `codex exec --json` line.
 * @param {any} frame @returns {string}
 */
export function codexTextFromFrame(frame) {
  if (!frame || typeof frame !== 'object') return '';
  if (typeof frame.text === 'string') return frame.text;

  // Codex CLI 0.125+ emits the assistant response as:
  // {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
  // exec --json has no partial-text event (0.155.1), so a codex answer arrives in one piece.
  const item = frame.item;
  if (item && typeof item === 'object') {
    if (item.type === 'agent_message' && typeof item.text === 'string') return item.text;
    const itemContent = textFromContent(item.content);
    if (itemContent) return itemContent;
  }

  const message = frame.message;
  if (message && typeof message === 'object') return textFromContent(message.content);
  return '';
}

/**
 * Token usage from a `turn.completed` line, as the OpenAI-compatible backends report it: input and output only.
 * @param {any} frame @returns {{inputTokens?: number, outputTokens?: number} | null}
 */
export function codexUsageFromFrame(frame) {
  const u = frame?.type === 'turn.completed' ? frame.usage : null;
  if (!u || typeof u !== 'object') return null;
  const out = {};
  if (typeof u.input_tokens === 'number') out.inputTokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') out.outputTokens = u.output_tokens;
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * The failure text of one `codex exec --json` line: `error` (also each retry) or `turn.failed`.
 * @param {any} frame @returns {string}
 */
export function codexErrorFromFrame(frame) {
  if (frame?.type === 'error' && typeof frame.message === 'string') return frame.message;
  if (frame?.type === 'turn.failed' && typeof frame.error?.message === 'string') {
    return frame.error.message;
  }
  return '';
}
