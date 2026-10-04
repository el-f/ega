#!/usr/bin/env node
// Chrome Native Messaging Host for Ega.
// Protocol: 4-byte little-endian length prefix + UTF-8 JSON body.

import { spawn } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import {
  readFile,
  writeFile,
  stat,
  access,
  mkdtemp,
  rm,
  constants as fsConstants,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import {
  CliSessionManager,
  killTree,
  sanitiseModel,
  windowsSafeSpawn,
} from './lib/cli-session.mjs';
import {
  CLAUDE_PROMPT_ARGS,
  CLAUDE_SAFETY_ARGS,
  claudeFrameHasToolUse,
  makeClaudeStreamParser,
} from './lib/protocol-claude.mjs';
import {
  CODEX_INSTRUCTIONS,
  CODEX_SAFETY_ARGS,
  codexAuthStoreArgs,
  codexMcpOverrides,
  codexErrorFromFrame,
  codexInstructionsArgs,
  codexTextFromFrame,
  codexUsageFromFrame,
} from './lib/protocol-codex.mjs';

// Bumped on any protocol or behavior change; the options page compares it against
// EXPECTED_HOST_VERSION and prompts a re-install.
const HOST_VERSION = 4;

// Chrome never passes this flag, so the hooks below cannot be turned on in an
// installed host — an environment variable alone is not enough.
const TEST_MODE = process.argv.includes('--ega-test');

// Max wait for a CLI child's terminal frame, per one-shot child and per session request once it reaches the head of the queue.
const CHILD_TIMEOUT_MS = Number(process.env.EGA_HOST_TIMEOUT_MS) || 90_000;
// Under the extension's 30 s first-frame and idle limits, which a reasoning model can outthink.
const KEEPALIVE_MS = Number(process.env.EGA_HOST_KEEPALIVE_MS) || 10_000;

// Routes a resolved .cmd/.bat shim through cmd.exe — Node >= 20.12.2 refuses them raw.
const safeSpawn = windowsSafeSpawn(spawn);
// Lets the host suite swap the CLIs for a node fixture.
const fakeSpawn =
  TEST_MODE && (process.env.EGA_FAKE_CLI_BIN_CLAUDE || process.env.EGA_FAKE_CLI_BIN_CODEX)
    ? makeFakeSpawn()
    : undefined;
const spawnCli = fakeSpawn ?? safeSpawn;
// port-manager only sees "port open", which stays true after the child is reaped.
const onSessionLifecycle = (provider, state) =>
  sendFrame({ v: 1, kind: 'session', provider, state });
// Null on a cold cache or a missed PATH walk; cli-session then spawns the bare name (via cmd.exe on Windows).
// Saves the 50-200ms Windows PATH search whenever it hits.
const syncResolveBin = (bin) => {
  const cached = cliPathCache.get(bin);
  return typeof cached === 'string' ? cached : null;
};
const sessions = new CliSessionManager({
  ...(fakeSpawn ? { spawn: fakeSpawn } : {}),
  // Chrome's launcher picks an arbitrary CWD: not in codex's trusted-dir list, and it
  // makes claude hunt for a git root on every call. Home is neither.
  cwd: homedir(),
  onLifecycle: onSessionLifecycle,
  resolveBin: syncResolveBin,
  requestTimeoutMs: CHILD_TIMEOUT_MS,
});

function makeFakeSpawn() {
  const map = {
    claude: process.env.EGA_FAKE_CLI_BIN_CLAUDE,
    codex: process.env.EGA_FAKE_CLI_BIN_CODEX,
  };
  return (bin, args, opts) => {
    // The bin may already be an absolute path from the PATH cache, so match on the name.
    const name = path
      .basename(String(bin))
      .replace(/\.[^.]*$/, '')
      .toLowerCase();
    const override = map[name];
    if (!override) return safeSpawn(bin, args, opts);
    return spawn(process.execPath, [override, ...args], opts);
  };
}

// The CLIs this host can drive, keyed by the id the extension sends.
const CLI_BINS = { claude: 'claude', codex: 'codex' };

// `--model` is a global flag for both CLIs, but it must land before codex's trailing
// stdin sentinel.
function argsWithModel(backend, baseArgs, model) {
  const m = sanitiseModel(model);
  if (!m) return baseArgs;
  if (backend === 'codex') {
    const tailIdx = baseArgs.lastIndexOf('-');
    if (tailIdx >= 0) {
      return [...baseArgs.slice(0, tailIdx), '--model', m, ...baseArgs.slice(tailIdx)];
    }
  }
  return [...baseArgs, '--model', m];
}

/** PATH (+PATHEXT) walk so Windows spawns a .cmd without shell:true (saves 100-300ms); cached; null = not on PATH. */
const cliPathCache = new Map();
const IS_WIN = process.platform === 'win32';
async function resolveCliPath(name) {
  if (cliPathCache.has(name)) return cliPathCache.get(name);
  const exts = IS_WIN
    ? (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .map((e) => e.toLowerCase())
        .filter(Boolean)
    : [''];
  const dirs = (process.env.PATH ?? '').split(IS_WIN ? ';' : ':').filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        const st = await stat(candidate);
        if (!st.isFile()) continue;
        // A POSIX directory is readable-but-not-a-file; a non-executable file is not a CLI.
        if (!IS_WIN) await access(candidate, fsConstants.X_OK);
        cliPathCache.set(name, candidate);
        return candidate;
      } catch {
        /* not in this dir */
      }
    }
  }
  // Not cached: a CLI installed after boot must be found by the next call.
  return null;
}

// Warm the cache at boot so the first translate doesn't pay the PATH walk.
// Best-effort — failures here just mean the first call repeats the scan.
void Promise.allSettled(Object.values(CLI_BINS).map((bin) => resolveCliPath(bin)));

const BACKEND_DEFAULT = 'claude';

// claude has no model-list command and `codex debug models` is experimental, so ship a fixed menu; a typed id also works.
// claude's aliases resolve to the newest model of each line, so they never go stale like a pinned id.
const STATIC_MODELS = {
  claude: [
    'opus',
    'sonnet',
    'haiku',
    'fable',
    // claude-opus-5-5 needs CLI 2.1.280+, claude-sonnet-5-5 needs 2.1.284+.
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-4-5',
    'claude-fable-5-1',
    'claude-opus-5',
    'claude-sonnet-5',
  ],
  // gpt-6.1-sol first ships in the codex-cli 0.159.1 catalog.
  codex: ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol'],
};

// Never throws: callers are error paths that must keep running when the pipe is gone.
function sendFrame(obj) {
  try {
    const body = Buffer.from(JSON.stringify(obj), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(body.length, 0);
    process.stdout.write(Buffer.concat([len, body]));
  } catch {
    /* the port is gone; there is nowhere left to report it */
  }
}

// process.exit drops whatever is still queued on a macOS pipe, so the terminal frame
// has to flush first. Chrome closing the port must also take the CLI children with it.
function shutdown(code) {
  sessions.closeAll();
  const leave = () => process.exit(code);
  if (process.stdout.writableLength === 0) leave();
  else {
    process.stdout.write('', leave);
    setTimeout(leave, 2000).unref();
  }
}

// Tracks how many requests still owe a reply so we don't exit on stdin-end while a
// probe or a terminal frame is mid-flight; when stdin has ended and it hits 0, exit.
let inFlight = 0;
let stdinEnded = false;
function bumpInFlight() {
  inFlight++;
}
function decInFlight() {
  inFlight = Math.max(0, inFlight - 1);
  if (stdinEnded && inFlight === 0) shutdown(0);
}

// Chrome caps extension messages at 4 MB; 8 MB leaves headroom and stops a bogus 0xFFFFFFFF prefix allocating 4 GiB.
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

function readStdinFrames(onFrame) {
  // A buffer list, as in CliSessionManager#onStdout: concat only once a 4-byte length prefix is readable.
  const bufs = [];
  let totalLen = 0;
  process.stdin.on('data', (chunk) => {
    bufs.push(chunk);
    totalLen += chunk.length;
    if (totalLen < 4) return;
    let buf = bufs.length === 1 ? bufs[0] : Buffer.concat(bufs, totalLen);
    bufs.length = 0;
    totalLen = 0;
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (len > MAX_FRAME_BYTES) {
        // A length-prefixed stream cannot resync, so exit and let the port disconnect fail every caller fast.
        sendFrame({
          v: 1,
          id: 'unknown',
          type: 'error',
          code: 'PROTOCOL',
          message: `frame length ${len} exceeds ${MAX_FRAME_BYTES} byte cap`,
        });
        shutdown(1);
        return;
      }
      if (buf.length < 4 + len) {
        bufs.push(buf);
        totalLen = buf.length;
        return;
      }
      const body = buf.slice(4, 4 + len).toString('utf8');
      buf = buf.slice(4 + len);
      let frame;
      try {
        frame = JSON.parse(body);
      } catch (e) {
        // Only the parse is guarded: a throw from a handler is a host fault, and the
        // top-level handler has to see it to fail the request that is waiting.
        sendFrame({ v: 1, id: 'unknown', type: 'error', code: 'PARSE', message: e.message });
        continue;
      }
      onFrame(frame);
    }
    // Keep a partial next header (1-3 bytes) for the next chunk.
    if (buf.length > 0) {
      bufs.push(buf);
      totalLen = buf.length;
    }
  });
  process.stdin.on('end', () => {
    stdinEnded = true;
    // With the port gone no reply can land anywhere, so end every request and release its CLI.
    sessions.failAll('ABORTED', 'port closed');
    if (inFlight === 0) shutdown(0);
  });
}

// The claude CLI reads `@path` and `@"any path"` as file attachments even with --tools ''; a word joiner after the `@` keeps the text and names no real file.
function neutralizeFileRefs(s) {
  if (typeof s !== 'string') return '';
  return s.replaceAll(/\B@/g, '@\u2060');
}

// claude emits 20-50 frames per tick; batch them. The first chunk still leaves on the next microtask.
function makeDeltaBatcher(id) {
  let pending = '';
  let scheduled = false;
  let closed = false;
  const flush = () => {
    scheduled = false;
    if (closed || !pending) return;
    const text = pending;
    pending = '';
    sendFrame({ v: 1, id, type: 'delta', text });
  };
  return {
    push(text) {
      pending += text;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    },
    // Buffered text goes out before the terminal frame, never after it.
    drain() {
      if (!closed && pending) sendFrame({ v: 1, id, type: 'delta', text: pending });
      pending = '';
      closed = true;
    },
  };
}

// The frame sink for one request: batched deltas, one terminal frame, one decInFlight.
// The session manager guarantees one terminal per slot; `done` only guards this closure.
function makeSink(id) {
  bumpInFlight();
  const deltas = makeDeltaBatcher(id);
  // Host-side time-to-first-token, reported on the done frame; a cold spawn folds into
  // the first translate of a session.
  const startedAt = Date.now();
  let firstDeltaAt = null;
  let usage = null;
  let done = false;
  // Only while no text flows: before the first delta and during a CLI retry. A stalled answer must reach the extension's idle guard.
  const ping = () => sendFrame({ v: 1, id, type: 'alive' });
  let keepAlive = setInterval(ping, KEEPALIVE_MS);
  keepAlive.unref();
  return (f) => {
    if (done) return;
    if (f.kind === 'alive') {
      ping();
      clearInterval(keepAlive);
      keepAlive = setInterval(ping, KEEPALIVE_MS);
      keepAlive.unref();
      return;
    }
    if (f.kind === 'delta') {
      clearInterval(keepAlive);
      if (firstDeltaAt === null) firstDeltaAt = Date.now();
      deltas.push(f.text);
      return;
    }
    if (f.kind === 'warn') {
      sendFrame({ v: 1, id, type: 'warn', code: f.code, message: f.message });
      return;
    }
    if (f.kind === 'usage') {
      usage = f.usage;
      return;
    }
    if (f.kind !== 'done' && f.kind !== 'error') return;
    done = true;
    clearInterval(keepAlive);
    deltas.drain();
    if (f.kind === 'done') {
      const ttftMs = firstDeltaAt !== null ? firstDeltaAt - startedAt : null;
      const finalUsage = f.usage ?? usage;
      sendFrame({
        v: 1,
        id,
        type: 'done',
        ...(ttftMs !== null ? { ttftMs } : {}),
        ...(finalUsage ? { usage: finalUsage } : {}),
      });
    } else {
      sendFrame({ v: 1, id, type: 'error', code: f.code, message: f.message });
    }
    decInFlight();
  };
}

function handleTranslate(msg) {
  const id = msg.id;
  const provider = msg.backend ?? BACKEND_DEFAULT;
  if (provider !== 'claude' && provider !== 'codex') {
    sendFrame({
      v: 1,
      id,
      type: 'error',
      code: 'UNSUPPORTED',
      message: `Unknown backend: ${provider}`,
    });
    return;
  }
  const system = neutralizeFileRefs(msg.prompt?.system);
  const user = neutralizeFileRefs(msg.prompt?.user);
  // codex removed `mcp-server` and its `app-server` is experimental, so each request is one `codex exec`.
  if (provider === 'codex') {
    const prompt = system ? system + '\n\n' + user : user;
    const files = [];
    void sessions.runOnce({
      provider,
      extId: id,
      onFrame: makeSink(id),
      parseLine: oneShotLineParser(provider),
      cleanup: () => removeFiles(files),
      prepare: async () => {
        const bin = (await resolveCliPath(CLI_BINS[provider])) ?? CLI_BINS[provider];
        const args = codexExecArgs(await codexRequestArgs(bin, files));
        return { bin, args: argsWithModel(provider, args, msg.model), prompt };
      },
    });
    return;
  }
  const onFrame = makeSink(id);
  try {
    sessions.send(provider, { system, user }, onFrame, id, msg.model);
  } catch (e) {
    // A synchronous spawn failure never made a slot, so nothing else will end this request.
    onFrame({ kind: 'error', code: 'NATIVE_SPAWN_FAIL', message: e.message });
  }
}

function extensionFromMediaType(mt) {
  const clean = (mt || 'image/png').toLowerCase();
  if (clean.includes('jpeg') || clean.includes('jpg')) return '.jpg';
  if (clean.includes('webp')) return '.webp';
  if (clean.includes('gif')) return '.gif';
  return '.png';
}

const IMAGE_INSTRUCTION =
  'Read the text in the attached image and translate it into English. Reply with plain text only.';

// The launcher's CWD can never be in codex's trusted-dir list, and its check guards
// against shell-supplied prompts — ours arrive on stdin.
function codexExecArgs(extra = []) {
  return [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    // Skips config.toml (the user's MCP servers and hooks) and exec policy rules; codexRequestArgs passes back where the login is kept.
    '--ignore-user-config',
    '--ignore-rules',
    ...CODEX_SAFETY_ARGS,
    // ega needs no codex usage analytics, and the user's opt-out lived in the config.toml skipped above.
    '-c',
    'analytics.enabled=false',
    // Every model in codex's catalog takes low; the CLI default spends thinking on one-line work.
    '-c',
    'model_reasoning_effort="low"',
    ...extra,
    '--json',
    '-',
  ];
}

/**
 * Runs a short CLI command to its exit code. Null when it cannot start, errors or outlives the timeout.
 * @returns {Promise<number | null>}
 */
function runBriefCli(bin, args, timeoutMs) {
  return runBriefCliOutput(bin, args, timeoutMs).then((r) => r?.code ?? null);
}

/**
 * Like runBriefCli, and also keeps stdout.
 * @returns {Promise<{ code: number | null, stdout: string } | null>}
 */
function runBriefCliOutput(bin, args, timeoutMs, env = undefined) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnCli(bin, args, {
        cwd: homedir(),
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
        ...(env ? { env } : {}),
      });
    } catch {
      resolve(null);
      return;
    }
    const out = [];
    child.stdout?.on('data', (c) => out.push(c));
    const timer = setTimeout(() => {
      try {
        if (!killTree(child)) child.kill('SIGKILL');
      } catch {}
      resolve(null);
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out).toString('utf8') });
    });
  });
}

// --ignore-user-config skips only the user layer; a system or managed config can still define MCP servers.
// Listed with CODEX_HOME at an empty folder, so only those layers show; kept 10 minutes, since they change rarely.
const SYSTEM_MCP_TTL_MS = 10 * 60_000;
const MCP_LIST_TIMEOUT_MS = 10_000;
let systemMcp = null;

async function codexSystemMcpArgs(bin) {
  if (systemMcp && Date.now() - systemMcp.at < SYSTEM_MCP_TTL_MS) return systemMcp.overrides;
  const emptyHome = await mkdtemp(path.join(tmpdir(), 'ega-codex-home-'));
  let r;
  try {
    r = await runBriefCliOutput(bin, ['mcp', 'list', '--json'], MCP_LIST_TIMEOUT_MS, {
      ...process.env,
      CODEX_HOME: emptyHome,
    });
  } finally {
    await rm(emptyHome, { recursive: true, force: true }).catch(() => {});
  }
  if (r?.code !== 0) {
    // Not cached: the next request lists again.
    process.stderr.write(
      `[ega-host] codex mcp list failed (${r ? `exit ${r.code}` : 'no answer'})\n`,
    );
    if (await anyExists(codexSystemConfigs())) {
      throw new Error(
        'Ega could not list the MCP servers your system Codex config loads, so it does not send page text to Codex this time. Try again.',
      );
    }
    return { args: [], stillLoaded: [] };
  }
  const overrides = codexMcpOverrides(r.stdout);
  systemMcp = { at: Date.now(), overrides };
  return overrides;
}

// Where codex reads a system-wide config; a failed list matters only when one exists.
function codexSystemConfigs() {
  const dir =
    process.platform === 'win32'
      ? path.join(process.env.ProgramData || 'C:\\ProgramData', 'OpenAI', 'Codex')
      : '/etc/codex';
  return ['config.toml', 'managed_config.toml'].map((f) => path.join(dir, f));
}

async function anyExists(paths) {
  for (const f of paths) {
    try {
      await access(f);
      return true;
    } catch {}
  }
  return false;
}

// codex reads instructions only from a file; one per request, since a temp cleaner can delete a long-lived one under a running host.
// config.toml is read fresh too: the user can move the login between requests.
async function codexRequestArgs(bin, files) {
  const { args: mcpOff, stillLoaded } = await codexSystemMcpArgs(bin);
  // Page text must not reach a tool ega cannot turn off.
  if (stillLoaded.length > 0) {
    throw new Error(
      `Codex loads the MCP server ${stillLoaded.map((n) => `"${n}"`).join(', ')} from a system or managed config, and Ega cannot turn it off, so it does not send page text to Codex. Ask your admin to rename it, or use the claude CLI.`,
    );
  }
  const instructions = path.join(tmpdir(), `ega-codex-${randomUUID()}.md`);
  files.push(instructions);
  await writeFile(instructions, CODEX_INSTRUCTIONS, { mode: 0o600, flag: 'wx' });
  // Resolved the way the child resolves it: its cwd is the home folder.
  const codexHome = path.resolve(homedir(), process.env.CODEX_HOME || '.codex');
  const config = await readFile(path.join(codexHome, 'config.toml'), 'utf8').catch(() => '');
  return [...codexInstructionsArgs(instructions), ...codexAuthStoreArgs(config), ...mcpOff];
}

// Sync: shutdown calls cleanup and then process.exit, which drops a pending async unlink.
function removeFiles(files) {
  for (const f of files) {
    try {
      unlinkSync(f);
    } catch {}
  }
}

// claude takes the image as an `@path` inside the prompt; codex takes a flag.
function imageInvocation(backend, msg, tmpPath, codexArgs = []) {
  // Same threat as the text path: page text can carry an `@<path>` the CLI would read.
  const system = neutralizeFileRefs(msg.prompt?.system);
  const user = neutralizeFileRefs(msg.prompt?.user ?? IMAGE_INSTRUCTION);
  const head = system ? system + '\n\n' : '';
  const baseArgs =
    backend === 'codex'
      ? codexExecArgs([...codexArgs, '--image', tmpPath])
      : // `--print` with stream-json is rejected without `--verbose`.
        [
          '--print',
          '--verbose',
          '--output-format',
          'stream-json',
          ...CLAUDE_SAFETY_ARGS,
          ...CLAUDE_PROMPT_ARGS,
        ];
  return {
    args: argsWithModel(backend, baseArgs, msg.model),
    // Quoted: the CLI's bare `@path` form stops at the first space, and a temp dir can hold one.
    prompt: backend === 'claude' ? head + user + `\n\n@"${tmpPath}"` : head + user,
  };
}

// One JSONL line from the one-shot CLI becomes the events it deserves; the exit code is the terminal.
function oneShotLineParser(backend) {
  let toolUseWarned = false;
  const parseClaude = makeClaudeStreamParser();
  return (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      // The CLI was asked for JSON, so a plain line is its own output — pass it through.
      return [{ kind: 'delta', text: line }];
    }
    if (backend !== 'claude') {
      const failure = codexErrorFromFrame(parsed);
      if (failure) return [{ kind: 'cli-error', message: failure }];
      const usage = codexUsageFromFrame(parsed);
      if (usage) return [{ kind: 'usage', usage }];
      const text = codexTextFromFrame(parsed);
      return text ? [{ kind: 'delta', text }] : [];
    }
    const event = parseClaude(parsed);
    const events = [];
    if (!toolUseWarned && claudeFrameHasToolUse(parsed)) {
      toolUseWarned = true;
      events.push({
        kind: 'warn',
        code: 'TOOL_USE',
        message: 'Claude CLI invoked tool use during image translate — output may be empty.',
      });
    }
    if (
      event?.kind === 'delta' ||
      event?.kind === 'auth-retry' ||
      event?.kind === 'restart' ||
      event?.kind === 'alive'
    )
      events.push(event);
    else if (event?.kind === 'error')
      events.push({
        kind: 'cli-error',
        message: event.message,
        ...(event.code ? { code: event.code } : {}),
      });
    // The exit code is the terminal here, so the result frame's usage travels on its own.
    else if (event?.kind === 'done' && event.usage)
      events.push({ kind: 'usage', usage: event.usage });
    return events;
  };
}

// Single-attempt by design: the host runs one CLI per `translateImage` frame. Multi-backend
// retry belongs to the router, which re-enters with a different `backend`.
function handleTranslateImage(msg) {
  const id = msg.id;
  const backend = msg.backend ?? BACKEND_DEFAULT;
  if (backend !== 'claude' && backend !== 'codex') {
    sendFrame({
      v: 1,
      id,
      type: 'error',
      code: 'UNSUPPORTED',
      message: `Native image translate is only wired for the claude / codex CLIs (backend="${backend}").`,
    });
    return;
  }
  if (typeof msg.imageBase64 !== 'string' || msg.imageBase64.length === 0) {
    sendFrame({
      v: 1,
      id,
      type: 'error',
      code: 'PARSE',
      message: 'translateImage requires non-empty imageBase64',
    });
    return;
  }
  const tmpPath = path.join(
    tmpdir(),
    `ega-img-${randomUUID()}${extensionFromMediaType(msg.mediaType)}`,
  );
  const bytes = Buffer.from(msg.imageBase64, 'base64');
  const bin = CLI_BINS[backend];
  const files = [tmpPath];
  // The slot exists from here, so a port that closes or a cancel that lands during the
  // file write still ends this request with a terminal frame.
  void sessions.runOnce({
    provider: backend,
    extId: id,
    onFrame: makeSink(id),
    parseLine: oneShotLineParser(backend),
    cleanup: () => removeFiles(files),
    prepare: async () => {
      try {
        await writeFile(tmpPath, bytes, { mode: 0o600 });
      } catch (e) {
        throw new Error(`failed to write image temp file: ${e.message}`, { cause: e });
      }
      // The PATH scan was warmed at module load, so this is a Map hit on the common path.
      const resolved = (await resolveCliPath(bin)) ?? bin;
      const codexArgs = backend === 'codex' ? await codexRequestArgs(resolved, files) : [];
      const { args, prompt } = imageInvocation(backend, msg, tmpPath, codexArgs);
      return { bin: resolved, args, prompt };
    },
  });
}

// The session manager ends the slot it owns with ABORTED itself. An unknown id is a
// deliberate no-op: the cancel raced the natural terminal frame.
function handleCancel(msg) {
  sessions.cancel(msg.id);
}

// Exit code only: `claude auth status` prints the account's email and org, which never leave this process.
const LOGIN_STATUS_ARGS = { claude: ['auth', 'status'], codex: ['login', 'status'] };
// Each CLI also runs on an env key its status command does not report; unknown is better than a false warning.
const LOGIN_ENV_KEYS = { claude: 'ANTHROPIC_API_KEY', codex: 'CODEX_API_KEY' };
// Well inside the options page's 5 s probe budget, which a cold host boot also spends.
const LOGIN_STATUS_TIMEOUT_MS = 3_000;
async function cliLoggedIn(name, bin) {
  if (process.env[LOGIN_ENV_KEYS[name]]) return null;
  const code = await runBriefCli(bin, LOGIN_STATUS_ARGS[name], LOGIN_STATUS_TIMEOUT_MS);
  return code === null ? null : code === 0;
}

// PATH presence goes out first, so a slow login check cannot hold it past the page's timeout. inFlight is
// bumped around the whole reply or a port closed right after the request exits the host mid-reply.
async function handleProbeCli(msg) {
  const id = msg.id ?? 'probe-cli';
  bumpInFlight();
  try {
    const found = await Promise.all(
      Object.entries(CLI_BINS).map(async ([name, bin]) => [name, await resolveCliPath(bin)]),
    );
    sendFrame({ v: 1, id, type: 'cli-presence', cli: Object.fromEntries(found) });
    const loggedIn = await Promise.all(
      found.map(async ([name, bin]) => [name, bin === null ? null : await cliLoggedIn(name, bin)]),
    );
    sendFrame({ v: 1, id, type: 'cli-login', loggedIn: Object.fromEntries(loggedIn) });
    sendFrame({ v: 1, id, type: 'done' });
  } finally {
    decInFlight();
  }
}

// Sends a 'models' frame, then 'done', so the extension reuses the translate wait-for-done path.
function handleListModels(msg) {
  const id = msg.id ?? 'list-models';
  const backend = msg.backend ?? BACKEND_DEFAULT;
  const list = STATIC_MODELS[backend];
  if (!list) {
    sendFrame({
      v: 1,
      id,
      type: 'error',
      code: 'UNSUPPORTED',
      message: `Unknown backend: ${backend}`,
    });
    return;
  }
  sendFrame({ v: 1, id, type: 'models', models: list });
  sendFrame({ v: 1, id, type: 'done' });
}

// Boot-time pre-warm so the first translate skips the 7-12s cold start. No prompt is
// sent; the child idles until a translate arrives or the 5-minute reap takes it.
function handleWarmSession(msg) {
  const id = msg.id ?? 'warm-session';
  const provider = msg.backend ?? BACKEND_DEFAULT;
  if (provider !== 'claude' && provider !== 'codex') {
    sendFrame({
      v: 1,
      id,
      type: 'error',
      code: 'UNSUPPORTED',
      message: `Unknown backend: ${provider}`,
    });
    return;
  }
  // `codex exec` answers one prompt and exits, so there is no codex child to keep warm.
  if (provider === 'codex') {
    sendFrame({ v: 1, id, type: 'done' });
    return;
  }
  try {
    sessions.getOrSpawn(provider, msg.model);
    sendFrame({ v: 1, id, type: 'done' });
  } catch (e) {
    sendFrame({
      v: 1,
      id,
      type: 'error',
      code: 'NATIVE_SPAWN_FAIL',
      message: e.message,
    });
  }
}

readStdinFrames((msg) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.kind === 'ping') {
    sendFrame({ v: 1, id: msg.id ?? 'ping', type: 'done', hostVersion: HOST_VERSION });
    return;
  }
  if (msg.kind === 'list-models') {
    handleListModels(msg);
    return;
  }
  if (msg.kind === 'probe-cli') {
    void handleProbeCli(msg);
    return;
  }
  if (msg.kind === 'cancel') {
    handleCancel(msg);
    return;
  }
  if (msg.kind === 'warm-session') {
    handleWarmSession(msg);
    return;
  }
  if (TEST_MODE && msg.kind === 'debug-throw-uncaught') {
    const boom = () => {
      throw new Error(typeof msg.message === 'string' ? msg.message : 'debug-throw');
    };
    // `inline` throws from inside the dispatch, the next tick throws from outside it.
    if (msg.inline) boom();
    setImmediate(boom);
    return;
  }
  if (msg.kind === 'translate') {
    void handleTranslate(msg);
    return;
  }
  if (msg.kind === 'translateImage') {
    handleTranslateImage(msg);
    return;
  }
  sendFrame({
    v: 1,
    id: msg.id ?? 'unknown',
    type: 'error',
    code: 'UNSUPPORTED',
    message: `Unknown kind: ${msg.kind}`,
  });
});

// A frame written after Chrome closed the pipe raises an ASYNC EPIPE that the sendFrame
// try/catch cannot see; it must not take the uncaughtException path.
process.stdout.on('error', () => {});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// Fail the in-flight requests and stay up (a dead bridge hangs the extension 60s); two throws in 1s exit.
let _lastUncaught = 0;
process.on('uncaughtException', (err) => {
  const now = Date.now();
  process.stderr.write(`[ega-host] uncaughtException: ${err?.stack ?? err}\n`);
  // The mid-flight requests are orphaned — no CLI frame is coming — so fail them fast
  // rather than let the extension sit out its 60s timeout.
  sessions.failAll('NATIVE_SPAWN_FAIL', `host uncaughtException: ${err?.message ?? String(err)}`);
  if (now - _lastUncaught < 1000) {
    process.stderr.write('[ega-host] second uncaughtException within 1 s — exiting\n');
    shutdown(1);
  }
  _lastUncaught = now;
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `[ega-host] unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}\n`,
  );
});
