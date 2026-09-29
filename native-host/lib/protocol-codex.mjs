// The flags and the output reader for `codex exec --json`, one process per request.

// Page text can carry injected instructions: read-only alone still auto-approves a shell `cat`, so the shell, exec, browser, computer-use, web-search, image-reading and apps tools are off; the user's MCP servers are turned off per request by name (codexMcpOverrides). Keys from `codex features list`, codex-cli 0.155.1.
// No `mcp_servers={}`: codex deep-merges table overrides, so an empty table is a silent no-op and the user's servers still load.
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
];

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
