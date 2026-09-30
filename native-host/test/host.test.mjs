import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, rmSync, readFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { CODEX_SAFETY_ARGS } from '../lib/protocol-codex.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = path.join(__dirname, '..', 'ega-host.mjs');
// Outside test/, so node --test never collects a leftover fixture.
const FIXTURES = mkdtempSync(path.join(tmpdir(), 'ega-host-fixtures-'));
after(() => rmSync(FIXTURES, { recursive: true, force: true }));

function encode(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length, 0);
  return Buffer.concat([len, body]);
}

function decodeFrames(buf) {
  const out = [];
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) break;
    out.push(JSON.parse(buf.slice(4, 4 + len).toString('utf8')));
    buf = buf.slice(4 + len);
  }
  return out;
}

// A fixture must read stdin and stay alive until the host sends SIGTERM.
function writeFixture(name, body) {
  const p = path.join(FIXTURES, name);
  writeFileSync(p, body);
  return p;
}

function countMatches(s, re) {
  return (s.match(re) ?? []).length;
}

// Poll instead of sleeping: a fixed wait is a coin toss once the box is busy.
async function waitForFrame(chunks, match, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = decodeFrames(Buffer.concat(chunks)).find(match);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 25));
  }
  return undefined;
}

const isTerminal = (id) => (f) => f.id === id && (f.type === 'done' || f.type === 'error');

// The host runs `codex mcp list --json` before each exec; the fake answers it with `out` and exits `code`.
// A top-level await holds the rest of the module until the write lands, so nothing below runs in list mode.
function mcpListGuard({ out = '[]', code = 0 } = {}) {
  return [
    `if (process.argv[2] === 'mcp') {`,
    `  await new Promise((r) => process.stdout.write(${JSON.stringify(out)}, r));`,
    `  process.exit(${code});`,
    `}`,
  ];
}

// Fake `codex exec --json`: reads the prompt to EOF, prints `answer(prompt)` inside real event noise; null hangs.
function codexExecFixture(name, answer, extra = [], mcp = {}) {
  return writeFixture(
    name,
    [
      ...mcpListGuard(mcp),
      ...extra,
      `const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');`,
      `let prompt = '';`,
      `process.stdin.on('data', (c) => { prompt += c.toString('utf8'); });`,
      `process.stdin.on('end', () => {`,
      `  const text = (${answer})(prompt);`,
      `  if (text === null) return setInterval(() => {}, 10000);`,
      `  line({type:'thread.started',thread_id:'t1'});`,
      `  line({type:'turn.started'});`,
      `  line({type:'item.completed',item:{id:'item_0',type:'reasoning',text:'thinking out loud'}});`,
      `  line({type:'item.completed',item:{id:'item_1',type:'agent_message',text}});`,
      `  line({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}});`,
      `});`,
      '',
    ].join('\n'),
  );
}

function spawnHostWithFakes({ claude, codex, env: extraEnv = {} } = {}) {
  const env = { ...process.env, ...extraEnv };
  if (claude) env.EGA_FAKE_CLI_BIN_CLAUDE = claude;
  if (codex) env.EGA_FAKE_CLI_BIN_CODEX = codex;
  return spawn(process.execPath, [HOST, '--ega-test'], { env });
}

async function imageErrorCode(fixture, id) {
  return (await imageError(fixture, id)).code;
}

// Drives one image translate against a fake CLI and returns the terminal error frame.
async function imageError(fixture, id) {
  const p = spawnHostWithFakes({ claude: fixture });
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(
    encode({
      v: 1,
      id,
      kind: 'translateImage',
      backend: 'claude',
      mediaType: 'image/png',
      imageBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      prompt: { user: 'go' },
    }),
  );
  const deadline = Date.now() + 8000;
  let err;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    err = decodeFrames(Buffer.concat(chunks)).find((f) => f.id === id && f.type === 'error');
    if (err) break;
  }
  p.stdin.end();
  try {
    p.kill();
  } catch {}
  assert.ok(
    err,
    `expected an error frame for ${id}; got ${JSON.stringify(decodeFrames(Buffer.concat(chunks)))}`,
  );
  return err;
}

test('ping frame returns done + hostVersion', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'p1', kind: 'ping' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const pong = frames.find((f) => f.type === 'done' && f.id === 'p1');
  assert.ok(pong, 'expected a done frame for p1');
  assert.equal(typeof pong.hostVersion, 'number', 'ping response must include hostVersion');
  assert.ok(pong.hostVersion >= 1, `expected hostVersion >= 1; got ${pong.hostVersion}`);
});

test('oversize frame emits PROTOCOL error then exits (no silent stdin desync)', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  let exitCode = null;
  const closed = new Promise((r) =>
    p.on('close', (code) => {
      exitCode = code;
      r();
    }),
  );
  const badHeader = Buffer.alloc(4);
  badHeader.writeUInt32LE(32 * 1024 * 1024, 0);
  // The body follows, as it would from a real misbehaving sender.
  p.stdin.write(Buffer.concat([badHeader, Buffer.alloc(64, 0x41)]));
  await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
  try {
    p.kill();
  } catch {}
  const frames = decodeFrames(Buffer.concat(chunks));
  const protocolErr = frames.find((f) => f.type === 'error' && f.code === 'PROTOCOL');
  assert.ok(protocolErr, `expected a PROTOCOL error frame; got ${JSON.stringify(frames)}`);
  assert.equal(exitCode, 1, 'the host must exit instead of parsing desynced bytes');
});

test('translateImage without imageBase64 returns PARSE error', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(
    encode({
      v: 1,
      id: 'img-empty',
      kind: 'translateImage',
      backend: 'claude',
      prompt: { system: '', user: 'translate' },
    }),
  );
  await new Promise((r) => setTimeout(r, 150));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const err = frames.find((f) => f.id === 'img-empty' && f.type === 'error');
  assert.ok(err, 'expected error frame for empty image payload');
  assert.equal(err.code, 'PARSE');
});

test('translateImage with the codex backend is routed to the codex CLI, not refused as UNSUPPORTED', async () => {
  const p = spawn('node', [HOST], {
    env: { ...process.env, EGA_HOST_TIMEOUT_MS: '500' },
  });
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(
    encode({
      v: 1,
      id: 'img-codex',
      kind: 'translateImage',
      backend: 'codex',
      imageBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      mediaType: 'image/png',
      prompt: { system: '', user: 'translate' },
    }),
  );
  const deadline = Date.now() + 8000;
  let terminal;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    terminal = decodeFrames(Buffer.concat(chunks)).find(
      (f) => f.id === 'img-codex' && (f.type === 'done' || f.type === 'error'),
    );
    if (terminal) break;
  }
  p.stdin.end();
  try {
    p.kill();
  } catch {}
  assert.ok(terminal, 'expected terminal frame for codex image path');
  if (terminal.type === 'error') {
    assert.notStrictEqual(
      terminal.code,
      'UNSUPPORTED',
      'codex image translate must not return UNSUPPORTED',
    );
  }
});

test('translateImage writes the temp image readable only by its owner', async () => {
  // The fixture reads the real temp file the host wrote, so the mode is measured, not seeded.
  const fixture = writeFixture(
    'ega-host.fake-codex-imgmode.mjs',
    [
      ...mcpListGuard(),
      `import { statSync } from 'node:fs';`,
      `const i = process.argv.indexOf('--image');`,
      `const st = statSync(process.argv[i + 1]);`,
      `const text = 'mode=' + (st.mode & 0o777).toString(8) + ' size=' + st.size;`,
      `process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}) + '\\n');`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'img-mode',
        kind: 'translateImage',
        backend: 'codex',
        mediaType: 'image/png',
        imageBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        prompt: { user: 'go' },
      }),
    );
    const deadline = Date.now() + 8000;
    let delta;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      delta = decodeFrames(Buffer.concat(chunks)).find(
        (f) => f.id === 'img-mode' && f.type === 'delta',
      );
      if (delta) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(delta, `expected the fixture to stat the temp image; got ${chunks.length} chunks`);
    assert.match(delta.text, /size=(?!0\b)\d+/, 'the image bytes must reach the CLI');
    // Windows has no POSIX mode bits — node reports 0o666 there whatever mode was asked for.
    if (process.platform !== 'win32') {
      assert.match(delta.text, /mode=600\b/, 'a shared /tmp must not expose the user image');
    }
  } finally {
    rmSync(fixture, { force: true });
  }
});

// The warn is an event now, so it has to survive the queue router and the frame sink before
// the user learns why an image answer came back thin.
test('an image translate that trips claude tool use warns before its terminal', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-tooluse.mjs',
    [
      `const block = (c) => JSON.stringify({type:'assistant',message:{content:[c]}}) + '\\n';`,
      `process.stdout.write(block({type:'tool_use',id:'t1',name:'Read',input:{}}));`,
      `process.stdout.write(block({type:'text',text:'ciao'}));`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'img-tool',
        kind: 'translateImage',
        backend: 'claude',
        mediaType: 'image/png',
        imageBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        prompt: { user: 'go' },
      }),
    );
    const deadline = Date.now() + 8000;
    let mine = [];
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
      mine = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'img-tool');
      if (mine.some((f) => f.type === 'done' || f.type === 'error')) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const warnAt = mine.findIndex((f) => f.type === 'warn');
    assert.ok(warnAt >= 0, `expected a TOOL_USE warn; got ${JSON.stringify(mine)}`);
    assert.equal(mine[warnAt].code, 'TOOL_USE');
    assert.ok(
      mine.slice(warnAt).some((f) => f.type === 'done'),
      'the warn must reach the panel before the request ends',
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('unknown backend on translate emits UNSUPPORTED', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(
    encode({
      v: 1,
      id: 'x1',
      kind: 'translate',
      backend: 'notacli',
      prompt: { system: '', user: '' },
    }),
  );
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  assert.ok(frames.some((f) => f.type === 'error' && f.code === 'UNSUPPORTED'));
});

test('persistent claude translate streams delta + done via CliSessionManager', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'hola'}]}}) + '\\n');`,
      `      process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n');`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 't1',
        kind: 'translate',
        backend: 'claude',
        prompt: { system: 'sys', user: 'hello' },
      }),
    );
    const deadline = Date.now() + 5000;
    let done;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      done = frames.find((f) => f.id === 't1' && f.type === 'done');
      if (done) break;
    }
    const frames = decodeFrames(Buffer.concat(chunks));
    const deltas = frames.filter((f) => f.id === 't1' && f.type === 'delta').map((f) => f.text);
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(done, `expected done frame; got ${JSON.stringify(frames)}`);
    assert.equal(deltas.join(''), 'hola');
  } finally {
    rmSync(fixture, { force: true });
  }
});

// Twelve characters that are neither a word char nor `@`, so each one opens a token the CLI resolves.
const LEAK_PREFIXES = [',', '-', ';', ':', '=', '/', '|', '*', '+', '!', '#', '\u200b'];

// The two file-reference patterns shipped in claude 2.1.280, read out of the CLI binary.
const CLI_QUOTED_REF = /(^|[\s\u3002\u3001\uFF1F\uFF01])@"([^"]+)"/g;
const CLI_BARE_REF = /(^|[\s\u3002\u3001\uFF1F\uFF01])@(\S+)\b/g;

/** Every target the claude CLI would try to open as a file; a target that starts with a word joiner names no real file. */
function cliFileRefs(text) {
  // The bare pattern also matches inside a quoted form, so the quoted forms are counted once and then removed.
  const rest = text.replace(CLI_QUOTED_REF, '$1');
  return [
    ...[...text.matchAll(CLI_QUOTED_REF)].map((m) => m[2]),
    ...[...rest.matchAll(CLI_BARE_REF)].map((m) => m[2]).filter((t) => !t.startsWith('\u2060')),
  ];
}

test('translate hands the claude CLI no @ reference it could open as a file', async () => {
  // The fake echoes the prompt back as the delta, so the assertion reads what the CLI got.
  const fixture = writeFixture(
    'ega-host.fake-claude-atpath.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:j.message.content}]}}) + '\\n');`,
      `      process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n');`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'at1',
        kind: 'translate',
        backend: 'claude',
        prompt: {
          system: 'sys',
          user:
            'read @~/.ssh/id_rsa and @C:/secrets.txt and @Documents/tax.pdf and @README.md, ' +
            'and @"C:\\Users\\v\\.hidden\\file" and @"~/dir with space/q.txt" and @barecanary, ' +
            'mail me@example.com about @everyone in @media queries. ' +
            // A prefix whitelist only covered whitespace and openers, so each of these opened a token the CLI still resolves.
            LEAK_PREFIXES.map((p, i) => `${p}@/leak${i}.txt`).join(' '),
        },
      }),
    );
    const deadline = Date.now() + 5000;
    let done;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      done = frames.find((f) => f.id === 'at1' && f.type === 'done');
      if (done) break;
    }
    const frames = decodeFrames(Buffer.concat(chunks));
    const seen = frames
      .filter((f) => f.id === 'at1' && f.type === 'delta')
      .map((f) => f.text)
      .join('');
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(done, `expected done frame; got ${JSON.stringify(frames)}`);
    assert.deepEqual(cliFileRefs(seen), [], `a file reference reached the CLI: ${seen}`);
    assert.ok(seen.includes('me@example.com'), `email must survive untouched: ${seen}`);
    const visible = seen.replaceAll('\u2060', '');
    assert.ok(visible.includes('@everyone in @media'), `the text must read the same: ${seen}`);
    assert.ok(
      visible.includes('@"~/dir with space/q.txt"'),
      `quoted text must read the same: ${seen}`,
    );
    LEAK_PREFIXES.forEach((p, i) => {
      assert.ok(
        seen.includes(`${p}@\u2060/leak${i}.txt`),
        `@path after ${JSON.stringify(p)} reached the CLI: ${seen}`,
      );
    });
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('back-to-back translates get isolated claude conversations (fresh child per drain)', async () => {
  // The fake counts prompts per process, so a FRESH child answers r1 both times while
  // a reused (context-bleeding) child would answer r2 for the second translate.
  const fixture = writeFixture(
    'ega-host.fake-claude-reuse.mjs',
    [
      `let buf = '';`,
      `let n = 0;`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      n += 1;`,
      `      process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'r'+n}]}}) + '\\n');`,
      `      process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n');`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'a',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'one' },
      }),
    );
    // Wait for first done, then send second.
    let firstDone;
    const deadlineA = Date.now() + 5000;
    while (Date.now() < deadlineA) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      firstDone = frames.find((f) => f.id === 'a' && f.type === 'done');
      if (firstDone) break;
    }
    assert.ok(firstDone, 'first translate must complete');
    p.stdin.write(
      encode({
        v: 1,
        id: 'b',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'two' },
      }),
    );
    const deadlineB = Date.now() + 5000;
    let secondDone;
    while (Date.now() < deadlineB) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      secondDone = frames.find((f) => f.id === 'b' && f.type === 'done');
      if (secondDone) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    const deltasA = frames.filter((f) => f.id === 'a' && f.type === 'delta').map((f) => f.text);
    const deltasB = frames.filter((f) => f.id === 'b' && f.type === 'delta').map((f) => f.text);
    assert.equal(deltasA.join(''), 'r1');
    assert.equal(
      deltasB.join(''),
      'r1',
      'second translate must land on a FRESH child (no conversation bleed)',
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('cancel emits ABORTED for an in-flight session translate', async () => {
  // The fake never answers, so only the host side can end the request.
  const fixture = writeFixture(
    'ega-host.fake-claude-hang.mjs',
    [`process.stdin.on('data', () => {});`, `setInterval(() => {}, 10000);`, ''].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'cx1',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'hang' },
      }),
    );
    // Give the host a moment to wire up the session, then cancel.
    await new Promise((r) => setTimeout(r, 200));
    p.stdin.write(encode({ v: 1, id: 'cx1', kind: 'cancel' }));
    const deadline = Date.now() + 2000;
    let aborted;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      aborted = frames.find((f) => f.id === 'cx1' && f.type === 'error' && f.code === 'ABORTED');
      if (aborted) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    if (!aborted) {
      const all = decodeFrames(Buffer.concat(chunks));
      throw new Error(`no ABORTED frame. Got: ${JSON.stringify(all)}`);
    }
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('cancel for unknown id is a silent no-op (no error frame)', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'never-spawned', kind: 'cancel' }));
  p.stdin.write(encode({ v: 1, id: 'after-cancel', kind: 'ping' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const pong = frames.find((f) => f.id === 'after-cancel' && f.type === 'done');
  assert.ok(pong, 'host stays responsive after cancel-for-unknown-id');
  const stray = frames.find((f) => f.id === 'never-spawned');
  assert.equal(stray, undefined, 'no frame for unknown id (silent no-op)');
});

test('a slow codex answer is kept alive until its first text, then the alive frames stop', async () => {
  // codex prints nothing until it has the whole answer; the extension drops a request after 30s of silence.
  const fixture = codexExecFixture('ega-host.fake-codex-slow.mjs', `(p) => 'slow:' + p`, [
    'await new Promise((r) => setTimeout(r, 700));',
  ]);
  try {
    const p = spawnHostWithFakes({ codex: fixture, env: { EGA_HOST_KEEPALIVE_MS: '150' } });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'cx-slow', kind: 'translate', backend: 'codex', prompt: { user: 'hi' } }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('cx-slow'));
    await new Promise((r) => setTimeout(r, 400));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'cx-slow');
    const firstDelta = frames.findIndex((f) => f.type === 'delta');
    const alive = frames.map((f, i) => (f.type === 'alive' ? i : -1)).filter((i) => i >= 0);
    assert.equal(terminal?.type, 'done', `expected done; got ${JSON.stringify(frames)}`);
    assert.ok(alive.length >= 2, `expected alive frames during the wait; got ${alive.length}`);
    assert.ok(
      alive.every((i) => i < firstDelta),
      'no alive frame after the answer starts',
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a codex translate runs one codex exec and turns only its agent message into text', async () => {
  const fixture = codexExecFixture('ega-host.fake-codex.mjs', `(p) => 'echo:' + p`);
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'cx', kind: 'translate', backend: 'codex', prompt: { user: 'hello' } }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('cx'));
    // A stray second terminal would land right after the first.
    await new Promise((r) => setTimeout(r, 200));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'cx');
    const deltas = frames.filter((f) => f.type === 'delta').map((f) => f.text);
    assert.equal(terminal?.type, 'done', `expected done; got ${JSON.stringify(frames)}`);
    assert.equal(frames.filter(isTerminal('cx')).length, 1, 'exactly one terminal frame');
    assert.equal(deltas.join(''), 'echo:hello', 'no system prompt means no blank-line prefix');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a codex text translate spawns exec with the safety args and --json -, never mcp-server', async () => {
  // The fake answers with its own argv and stdin, so the assertion reads what the CLI got.
  const fixture = codexExecFixture(
    'ega-host.fake-codex-argv.mjs',
    `(p) => JSON.stringify({ argv: process.argv.slice(2), prompt: p })`,
  );
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'cx-argv',
        kind: 'translate',
        backend: 'codex',
        model: 'gpt-5-codex',
        prompt: { system: 'sys', user: 'read @~/.ssh/id_rsa' },
      }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('cx-argv'));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'cx-argv');
    assert.equal(terminal?.type, 'done', `expected done; got ${JSON.stringify(frames)}`);
    const seen = JSON.parse(
      frames
        .filter((f) => f.type === 'delta')
        .map((f) => f.text)
        .join(''),
    );
    assert.deepEqual(
      seen.argv,
      [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        ...CODEX_SAFETY_ARGS,
        '--json',
        '--model',
        'gpt-5-codex',
        '-',
      ],
      'one `codex exec` that saves nothing and reads the prompt from stdin, never `mcp-server`',
    );
    assert.equal(seen.prompt, 'sys\n\nread @\u2060~/.ssh/id_rsa');
  } finally {
    rmSync(fixture, { force: true });
  }
});

// Read off `codex mcp list --json` on codex-cli 0.155.1: a plain name, a dotted name codex's `-c`
// path cannot address, a disabled entry, and a name with every other character codex accepts.
const MCP_LIST_OUT = JSON.stringify([
  { name: 'probe', enabled: true, disabled_reason: null, transport: { type: 'stdio' } },
  { name: 'a.b', enabled: true, disabled_reason: null, transport: { type: 'stdio' } },
  { name: 'off', enabled: false, disabled_reason: null, transport: { type: 'stdio' } },
  { name: 'team:fs@v1/x', enabled: true, disabled_reason: null, transport: { type: 'stdio' } },
]);

test('a codex translate turns off every MCP server the CLI lists and reports the ones it cannot', async () => {
  const fixture = codexExecFixture(
    'ega-host.fake-codex-mcp.mjs',
    `(p) => JSON.stringify({ argv: process.argv.slice(2) })`,
    [],
    { out: MCP_LIST_OUT },
  );
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'cx-mcp', kind: 'translate', backend: 'codex', prompt: { user: 'hi' } }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('cx-mcp'));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'cx-mcp');
    assert.equal(terminal?.type, 'done', `expected done; got ${JSON.stringify(frames)}`);
    const { argv } = JSON.parse(
      frames
        .filter((f) => f.type === 'delta')
        .map((f) => f.text)
        .join(''),
    );
    const overrides = argv.filter((a) => a.startsWith('mcp_servers.'));
    assert.deepEqual(
      overrides,
      ['mcp_servers.probe.enabled=false', 'mcp_servers.team:fs@v1/x.enabled=false'],
      `every enabled server the CLI can address is off: ${JSON.stringify(argv)}`,
    );
    assert.equal(argv[argv.indexOf(overrides[0]) - 1], '-c');
    assert.deepEqual(terminal.mcpStillLoaded, ['a.b'], 'the dotted name is reported, not passed');
  } finally {
    rmSync(fixture, { force: true });
  }
});

// An override naming a server codex does not know fails the child's config load, so a list the host
// cannot read must add nothing rather than guess.
test('a codex translate passes no MCP override when the list fails', async () => {
  const fixture = codexExecFixture(
    'ega-host.fake-codex-mcp-fail.mjs',
    `(p) => JSON.stringify({ argv: process.argv.slice(2) })`,
    [],
    { out: '[', code: 1 },
  );
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'cx-nomcp', kind: 'translate', backend: 'codex', prompt: { user: 'hi' } }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('cx-nomcp'));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'cx-nomcp');
    assert.equal(terminal?.type, 'done', `expected done; got ${JSON.stringify(frames)}`);
    const { argv } = JSON.parse(
      frames
        .filter((f) => f.type === 'delta')
        .map((f) => f.text)
        .join(''),
    );
    assert.ok(
      !argv.some((a) => a.startsWith('mcp_servers.')),
      `no override may be guessed: ${JSON.stringify(argv)}`,
    );
    assert.equal(terminal.mcpStillLoaded, undefined);
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('canceling one codex translate ends only that request while another one answers', async () => {
  // Each translate is its own process, so the one told to hang must not hold up the other.
  const fixture = codexExecFixture(
    'ega-host.fake-codex-cancel.mjs',
    `(p) => (p.includes('hang') ? null : 'ok')`,
  );
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'tx-A', kind: 'translate', backend: 'codex', prompt: { user: 'hang' } }),
    );
    p.stdin.write(
      encode({ v: 1, id: 'tx-B', kind: 'translate', backend: 'codex', prompt: { user: 'fine' } }),
    );
    const doneB = await waitForFrame(chunks, isTerminal('tx-B'));
    p.stdin.write(encode({ v: 1, id: 'tx-A', kind: 'cancel' }));
    const endA = await waitForFrame(chunks, isTerminal('tx-A'));
    await new Promise((r) => setTimeout(r, 200));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    const framesA = frames.filter((f) => f.id === 'tx-A');
    const framesB = frames.filter((f) => f.id === 'tx-B');
    assert.equal(doneB?.type, 'done', `B must answer while A hangs; got ${JSON.stringify(frames)}`);
    assert.equal(endA?.code, 'ABORTED', `expected ABORTED for A; got ${JSON.stringify(framesA)}`);
    assert.deepEqual(
      framesA.map((f) => f.type),
      ['error'],
      'A ends once and says nothing else',
    );
    assert.deepEqual(
      framesB.map((f) => [f.type, f.text]),
      [
        ['delta', 'ok'],
        ['done', undefined],
      ],
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('warm-session for codex answers done and starts no codex process', async () => {
  const log = path.join(FIXTURES, 'ega-host.codex-warm.log');
  rmSync(log, { force: true });
  // The fake logs every start, so a warm spawn would show up beside the translate's own.
  const fixture = codexExecFixture('ega-host.fake-codex-warm.mjs', `() => 'ok'`, [
    `import { appendFileSync } from 'node:fs';`,
    `appendFileSync(${JSON.stringify(log)}, 'start\\n');`,
  ]);
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(encode({ v: 1, id: 'wc', kind: 'warm-session', backend: 'codex' }));
    const warmed = await waitForFrame(chunks, isTerminal('wc'));
    // The control: a real codex request does start the fake, so the log can see a spawn.
    p.stdin.write(
      encode({ v: 1, id: 'wc-t', kind: 'translate', backend: 'codex', prompt: { user: 'hi' } }),
    );
    const translated = await waitForFrame(chunks, isTerminal('wc-t'));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    assert.equal(
      warmed?.type,
      'done',
      `expected done for warm-session; got ${JSON.stringify(frames)}`,
    );
    assert.equal(
      translated?.type,
      'done',
      `expected done for the translate; got ${JSON.stringify(frames)}`,
    );
    const starts = countMatches(existsSync(log) ? readFileSync(log, 'utf8') : '', /start/g);
    assert.equal(starts, 1, 'only the translate started a codex process');
    assert.ok(
      !frames.some((f) => f.kind === 'session' && f.provider === 'codex'),
      'no warm codex session is announced',
    );
  } finally {
    rmSync(fixture, { force: true });
    rmSync(log, { force: true });
  }
});

test('list-models returns claude menu', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'lm-c', kind: 'list-models', backend: 'claude' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const reply = frames.find((f) => f.id === 'lm-c' && f.type === 'models');
  assert.ok(reply, `expected models frame; got ${JSON.stringify(frames)}`);
  assert.ok(Array.isArray(reply.models) && reply.models.length > 0, 'non-empty model list');
  const aliases = new Set(['opus', 'sonnet', 'haiku', 'fable']);
  assert.ok(
    reply.models.every((m) => typeof m === 'string' && (aliases.has(m) || m.startsWith('claude-'))),
    `expected claude aliases or claude-* ids; got ${JSON.stringify(reply.models)}`,
  );
  assert.ok(
    frames.some((f) => f.id === 'lm-c' && f.type === 'done'),
    'done frame follows',
  );
});

test('list-models returns codex menu', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'lm-x', kind: 'list-models', backend: 'codex' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const reply = frames.find((f) => f.id === 'lm-x' && f.type === 'models');
  assert.ok(reply, `expected models frame; got ${JSON.stringify(frames)}`);
  assert.ok(Array.isArray(reply.models) && reply.models.length > 0, 'non-empty model list');
});

test('list-models for unknown backend emits UNSUPPORTED', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'lm-bad', kind: 'list-models', backend: 'notacli' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const err = frames.find((f) => f.id === 'lm-bad' && f.type === 'error');
  assert.ok(err);
  assert.equal(err.code, 'UNSUPPORTED');
});

test('probe-cli returns a cli-presence map then done', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'pc1', kind: 'probe-cli' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const presence = frames.find((f) => f.id === 'pc1' && f.type === 'cli-presence');
  assert.ok(presence, `expected cli-presence frame; got ${JSON.stringify(frames)}`);
  assert.ok(presence.cli && typeof presence.cli === 'object', 'cli payload object');
  for (const id of ['claude', 'codex']) {
    assert.ok(id in presence.cli, `${id} present in cli map`);
    const v = presence.cli[id];
    assert.ok(v === null || typeof v === 'string', `${id} value is string|null`);
  }
  const done = frames.find((f) => f.id === 'pc1' && f.type === 'done');
  assert.ok(done, 'done frame follows cli-presence');
});

test('probe-cli reports null for a CLI that is not on PATH', async () => {
  // PATH holds one directory that does not exist, so every candidate misses on every OS.
  const env = { ...process.env, PATH: path.join(__dirname, 'no-such-dir-for-probe') };
  const p = spawn(process.execPath, [HOST], { env });
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'pc2', kind: 'probe-cli' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const presence = frames.find((f) => f.id === 'pc2' && f.type === 'cli-presence');
  assert.ok(presence, `expected cli-presence frame; got ${JSON.stringify(frames)}`);
  assert.equal(presence.cli.claude, null, 'claude is null when PATH cannot reach it');
  assert.equal(presence.cli.codex, null, 'codex is null when PATH cannot reach it');
});

test('warm-session spawns the CLI child and emits done + session/spawned lifecycle frame', async () => {
  // warm-session must only spawn — it must not send a prompt line.
  const fixture = writeFixture(
    'ega-host.fake-claude-warm.mjs',
    [
      `let buf = '';`,
      `let promptSeen = false;`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') { promptSeen = true; }`,
      `  }`,
      `});`,
      `setInterval(() => { if (promptSeen) {} }, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(encode({ v: 1, id: 'w1', kind: 'warm-session', backend: 'claude' }));
    const deadline = Date.now() + 5000;
    let done;
    let spawned;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      done = frames.find((f) => f.id === 'w1' && f.type === 'done');
      spawned = frames.find(
        (f) => f.kind === 'session' && f.provider === 'claude' && f.state === 'spawned',
      );
      if (done && spawned) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(done, 'expected done frame on warm-session');
    assert.ok(spawned, 'expected session/spawned lifecycle frame');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('warm-session is idempotent at the spawn level but re-announces spawned per call', async () => {
  // Re-announcing spawned on every call lets an extension that reconnected its port catch up.
  const fixture = writeFixture(
    'ega-host.fake-claude-warm-idemp.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => { buf += c.toString('utf8'); });`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(encode({ v: 1, id: 'w1', kind: 'warm-session', backend: 'claude' }));
    p.stdin.write(encode({ v: 1, id: 'w2', kind: 'warm-session', backend: 'claude' }));
    const deadline = Date.now() + 5000;
    let bothDone = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      const d1 = frames.find((f) => f.id === 'w1' && f.type === 'done');
      const d2 = frames.find((f) => f.id === 'w2' && f.type === 'done');
      if (d1 && d2) {
        bothDone = true;
        break;
      }
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    const spawnedCount = frames.filter(
      (f) => f.kind === 'session' && f.provider === 'claude' && f.state === 'spawned',
    ).length;
    const reapedCount = frames.filter(
      (f) => f.kind === 'session' && f.provider === 'claude' && f.state === 'reaped',
    ).length;
    assert.ok(bothDone, 'expected done frame for both warm-session calls');
    assert.equal(spawnedCount, 2, 'spawned lifecycle re-emits per warm-session call');
    assert.equal(reapedCount, 0, 'no reap — single CLI child reused');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('mid-translate CLI crash synthesizes NATIVE_SPAWN_FAIL for the in-flight id', async () => {
  // The fake dies mid-prompt with no terminal frame, so the host must synthesize one on reap.
  const fixture = writeFixture(
    'ega-host.fake-claude-crash.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      process.exit(1);`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'crash-t1',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'will crash the cli' },
      }),
    );
    const deadline = Date.now() + 5000;
    let err;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      err = frames.find((f) => f.id === 'crash-t1' && f.type === 'error');
      if (err) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(err, 'expected a synthesized error frame for the in-flight id after CLI exit');
    assert.equal(err.code, 'NATIVE_SPAWN_FAIL');
    assert.match(err.message, /unexpectedly|exited/i);
    const terminals = decodeFrames(Buffer.concat(chunks)).filter(
      (f) => f.id === 'crash-t1' && (f.type === 'error' || f.type === 'done'),
    );
    assert.equal(terminals.length, 1, 'expected exactly one terminal frame for the crashed id');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a silent-but-alive claude child times out and the next translate recovers', async () => {
  // The first child hangs (and drops a marker); the respawn sees the marker and answers.
  // Cancel cannot clear a claude head, so only the per-request deadline can recover this.
  const marker = path.join(FIXTURES, 'ega-host.deadline-marker');
  rmSync(marker, { force: true });
  const fixture = writeFixture(
    'ega-host.fake-claude-deadline.mjs',
    [
      `import { existsSync, writeFileSync } from 'node:fs';`,
      `const marker = ${JSON.stringify(marker)};`,
      `const answer = existsSync(marker);`,
      `writeFileSync(marker, 'x');`,
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user' && answer) {`,
      `      process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'recovered'}]}}) + '\\n');`,
      `      process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n');`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawn(process.execPath, [HOST, '--ega-test'], {
      // The head deadline is armed at send(), so it covers the child's cold spawn (~0.5-0.8s
      // on Windows). Under that, the recovery request times out before its own child boots.
      env: { ...process.env, EGA_FAKE_CLI_BIN_CLAUDE: fixture, EGA_HOST_TIMEOUT_MS: '2500' },
    });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'dl-1', kind: 'translate', backend: 'claude', prompt: { user: 'hang' } }),
    );
    const errDeadline = Date.now() + 8000;
    let err;
    while (Date.now() < errDeadline) {
      await new Promise((r) => setTimeout(r, 50));
      err = decodeFrames(Buffer.concat(chunks)).find((f) => f.id === 'dl-1' && f.type === 'error');
      if (err) break;
    }
    assert.ok(err, 'the wedged head must get a terminal error frame');
    assert.equal(err.code, 'TIMEOUT', `expected TIMEOUT; got ${JSON.stringify(err)}`);
    // The wedged child was dropped, so a follow-up translate must succeed on a fresh one.
    p.stdin.write(
      encode({ v: 1, id: 'dl-2', kind: 'translate', backend: 'claude', prompt: { user: 'go' } }),
    );
    const doneDeadline = Date.now() + 8000;
    let done;
    while (Date.now() < doneDeadline) {
      await new Promise((r) => setTimeout(r, 50));
      done = decodeFrames(Buffer.concat(chunks)).find((f) => f.id === 'dl-2' && f.type === 'done');
      if (done) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    assert.ok(done, `the follow-up translate must recover; got ${JSON.stringify(frames)}`);
    const deltas = frames.filter((f) => f.id === 'dl-2' && f.type === 'delta').map((f) => f.text);
    assert.equal(deltas.join(''), 'recovered');
  } finally {
    rmSync(fixture, { force: true });
    rmSync(marker, { force: true });
  }
});

test('warm-session with unknown backend returns UNSUPPORTED', async () => {
  const p = spawn('node', [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'wbad', kind: 'warm-session', backend: 'notacli' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const err = frames.find((f) => f.id === 'wbad' && f.type === 'error');
  assert.ok(err, 'expected error frame for unknown backend on warm-session');
  assert.equal(err.code, 'UNSUPPORTED');
});

test('cancel + late terminal frame emits EXACTLY ONE error for the canceled id', async () => {
  // The fake answers only after a delay, so the cancel lands first and the result arrives late.
  const fixture = writeFixture(
    'ega-host.fake-claude-late-result.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      // Late terminal frame — arrives AFTER the extension cancel.`,
      `      setTimeout(() => {`,
      `        process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'late'}]}}) + '\\n');`,
      `        process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n');`,
      `      }, 400);`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'gh1',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'hello' },
      }),
    );
    // Cancel before the fake's 400ms setTimeout fires.
    await new Promise((r) => setTimeout(r, 100));
    p.stdin.write(encode({ v: 1, id: 'gh1', kind: 'cancel' }));
    // Wait long enough for late terminal to arrive (400ms) + handler.
    await new Promise((r) => setTimeout(r, 900));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    const terminals = frames.filter(
      (f) => f.id === 'gh1' && (f.type === 'done' || f.type === 'error'),
    );
    assert.equal(
      terminals.length,
      1,
      `expected exactly one terminal frame for gh1, got: ${JSON.stringify(terminals)}`,
    );
    assert.equal(terminals[0].type, 'error');
    assert.equal(terminals[0].code, 'ABORTED');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a cancel that lands while the image is still being written ends the request and never runs the CLI', async () => {
  // The fixture drops a marker when it starts, so "never spawned" is measured, not assumed.
  const marker = path.join(FIXTURES, 'ega-host.img-cancel-early.marker');
  rmSync(marker, { force: true });
  const fixture = writeFixture(
    'ega-host.fake-claude-img-early.mjs',
    [
      `import { writeFileSync } from 'node:fs';`,
      `writeFileSync(${JSON.stringify(marker)}, 'ran');`,
      `process.stdin.on('data', () => {});`,
      `process.stdin.on('end', () => process.exit(0));`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    // Both frames in one write: the cancel is dispatched while the temp-file write is pending.
    p.stdin.write(
      Buffer.concat([
        encode({
          v: 1,
          id: 'img-early',
          kind: 'translateImage',
          backend: 'claude',
          mediaType: 'image/png',
          imageBase64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
          prompt: { user: 'go' },
        }),
        encode({ v: 1, id: 'img-early', kind: 'cancel' }),
        encode({ v: 1, id: 'img-early-ping', kind: 'ping' }),
      ]),
    );
    const deadline = Date.now() + 5000;
    let aborted;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
      aborted = decodeFrames(Buffer.concat(chunks)).find(
        (f) => f.id === 'img-early' && f.type === 'error' && f.code === 'ABORTED',
      );
      if (aborted) break;
    }
    // Long enough for a wrongly-spawned fixture to start and drop its marker.
    await new Promise((r) => setTimeout(r, 1500));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    assert.ok(aborted, `expected ABORTED; got ${JSON.stringify(frames)}`);
    const terminals = frames.filter(
      (f) => f.id === 'img-early' && (f.type === 'done' || f.type === 'error'),
    );
    assert.equal(terminals.length, 1, `one terminal only; got ${JSON.stringify(terminals)}`);
    assert.equal(existsSync(marker), false, 'the CLI must not run for a request canceled early');
  } finally {
    rmSync(fixture, { force: true });
    rmSync(marker, { force: true });
  }
});

test('host uncaughtException: survives, logs, fails in-flight fast, exits on second throw', async () => {
  // `debug-throw-uncaught` throws inside the host itself, so the real top-level handler runs.
  const fixture = writeFixture(
    'ega-host.fake-claude-hang-uce.mjs',
    [`process.stdin.on('data', () => {});`, `setInterval(() => {}, 10000);`, ''].join('\n'),
  );
  try {
    const p = spawn(process.execPath, [HOST, '--ega-test'], {
      env: { ...process.env, EGA_FAKE_CLI_BIN_CLAUDE: fixture },
    });
    const stderrChunks = [];
    p.stderr.on('data', (c) => stderrChunks.push(c));
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    let closed = false;
    p.on('close', () => {
      closed = true;
    });

    // Park an in-flight translate against the hanging fake.
    p.stdin.write(
      encode({
        v: 1,
        id: 'uce-inflight',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'hang forever' },
      }),
    );
    // Let the session wire up before the throw.
    await new Promise((r) => setTimeout(r, 250));

    // First throw: the host stays alive, logs, and fails the in-flight request fast.
    p.stdin.write(encode({ v: 1, id: 'unused', kind: 'debug-throw-uncaught', message: 'boom-1' }));
    const failDeadline = Date.now() + 3000;
    let inflightErr;
    while (Date.now() < failDeadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      inflightErr = frames.find((f) => f.id === 'uce-inflight' && f.type === 'error');
      if (inflightErr) break;
    }
    assert.ok(
      inflightErr,
      'in-flight request must get a fast error frame after host uncaught throw',
    );
    assert.equal(
      inflightErr.code,
      'NATIVE_SPAWN_FAIL',
      'orphaned request fails as NATIVE_SPAWN_FAIL',
    );
    assert.ok(!closed, 'host must NOT tear down after a single uncaughtException');
    const stderrText = Buffer.concat(stderrChunks).toString('utf8');
    assert.match(stderrText, /uncaughtException/, 'host must log the uncaught error to stderr');

    // Host still answers a ping — proves the bridge is alive.
    p.stdin.write(encode({ v: 1, id: 'uce-ping', kind: 'ping' }));
    const pingDeadline = Date.now() + 3000;
    let pong;
    while (Date.now() < pingDeadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      pong = frames.find((f) => f.id === 'uce-ping' && f.type === 'done');
      if (pong) break;
    }
    assert.ok(pong, 'host must respond to ping after surviving one uncaughtException');

    // (b) Second throw within 1 s — the tight-loop guard must exit the host.
    p.stdin.write(encode({ v: 1, id: 'unused', kind: 'debug-throw-uncaught', message: 'boom-2' }));
    const exitDeadline = Date.now() + 3000;
    while (!closed && Date.now() < exitDeadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(closed, 'a second uncaughtException within 1 s must exit the host');
    const stderrText2 = Buffer.concat(stderrChunks).toString('utf8');
    assert.match(stderrText2, /second uncaughtException within 1 s/, 'exit path logs the reason');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('reap error frame carries the CLI stderr tail for an in-flight translate', async () => {
  // The fake writes a reason to stderr then dies, so the reap error must carry that tail.
  const fixture = writeFixture(
    'ega-host.fake-claude-stderr-die.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      process.stderr.write('claude: auth token expired\\n');`,
      `      setTimeout(() => process.exit(1), 30);`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'sec1-t1',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'will die with a stderr reason' },
      }),
    );
    const deadline = Date.now() + 5000;
    let err;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      const frames = decodeFrames(Buffer.concat(chunks));
      err = frames.find((f) => f.id === 'sec1-t1' && f.type === 'error');
      if (err) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(err, 'expected a synthesized error frame for the in-flight id after CLI exit');
    assert.equal(err.code, 'NATIVE_SPAWN_FAIL');
    assert.match(
      err.message,
      /auth token expired/,
      `reap error must include the CLI stderr tail; got: ${err.message}`,
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a CLI that is not installed fails the translate without crashing the host', async () => {
  // PATH holds one directory that does not exist, so the spawn fails with ENOENT.
  const env = { ...process.env, PATH: path.join(__dirname, 'no-such-dir-for-spawn') };
  delete env.EGA_FAKE_CLI_BIN_CLAUDE;
  const p = spawn(process.execPath, [HOST], { env });
  const chunks = [];
  const errChunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stderr.on('data', (c) => errChunks.push(c));
  p.stdin.write(
    encode({ v: 1, id: 'enoent-1', kind: 'translate', backend: 'claude', prompt: { user: 'hi' } }),
  );
  const deadline = Date.now() + 5000;
  let err;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    err = decodeFrames(Buffer.concat(chunks)).find(
      (f) => f.id === 'enoent-1' && f.type === 'error',
    );
    if (err) break;
  }
  assert.ok(
    err,
    `expected an error frame; got ${JSON.stringify(decodeFrames(Buffer.concat(chunks)))}`,
  );
  assert.equal(err.code, 'NATIVE_SPAWN_FAIL');
  const stderrText = Buffer.concat(errChunks).toString('utf8');
  assert.doesNotMatch(
    stderrText,
    /uncaughtException/,
    `a missing CLI must not take the crash path; stderr: ${stderrText.slice(0, 300)}`,
  );
  assert.match(
    err.message,
    /not found|ENOENT/i,
    `message should name the cause; got ${err.message}`,
  );
  // A second attempt must not trip the two-throws-in-a-second shutdown.
  p.stdin.write(
    encode({ v: 1, id: 'enoent-2', kind: 'translate', backend: 'claude', prompt: { user: 'hi' } }),
  );
  p.stdin.write(encode({ v: 1, id: 'still-alive', kind: 'ping' }));
  const pingDeadline = Date.now() + 5000;
  let pong;
  while (Date.now() < pingDeadline) {
    await new Promise((r) => setTimeout(r, 50));
    pong = decodeFrames(Buffer.concat(chunks)).find(
      (f) => f.id === 'still-alive' && f.type === 'done',
    );
    if (pong) break;
  }
  p.stdin.end();
  try {
    p.kill();
  } catch {}
  assert.ok(pong, 'the host must survive repeated spawn failures');
});

// The port is gone, so no reply can land anywhere: the CLI must be released instead of
// running to its 90s deadline, streaming into a pipe nobody reads.
test('stdin closing mid-stream aborts the live translate and the host exits', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-hang.mjs',
    [
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      const f = {type:'assistant',message:{content:[{type:'text',text:'half an ans'}]}};`,
      `      process.stdout.write(JSON.stringify(f) + '\\n');`,
      `    }`,
      `  }`,
      `});`,
      // Never a result frame: the request can only end because the host ended it.
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'eof-live',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'hi' },
      }),
    );
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
      if (
        decodeFrames(Buffer.concat(chunks)).some((f) => f.id === 'eof-live' && f.type === 'delta')
      )
        break;
    }
    const frames = decodeFrames(Buffer.concat(chunks));
    assert.ok(
      frames.some((f) => f.id === 'eof-live' && f.type === 'delta'),
      `the CLI must be mid-answer before the port closes; got ${JSON.stringify(frames)}`,
    );
    p.stdin.end();
    const closed = await Promise.race([
      new Promise((r) => p.on('close', () => r(true))),
      new Promise((r) => setTimeout(() => r(false), 8000)),
    ]);
    try {
      p.kill();
    } catch {}
    assert.ok(closed, 'the host must exit once the port is gone, not wait out the CLI deadline');
    const terminal = decodeFrames(Buffer.concat(chunks)).find(
      (f) => f.id === 'eof-live' && (f.type === 'done' || f.type === 'error'),
    );
    assert.ok(terminal, 'the in-flight translate must get a terminal frame');
    assert.equal(terminal.code, 'ABORTED');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('translateImage still answers when stdin ends in the same tick', async () => {
  // Chrome closing the port right after the frame must not strand the request.
  const env = { ...process.env, PATH: path.join(__dirname, 'no-such-dir-for-spawn') };
  delete env.EGA_FAKE_CLI_BIN_CLAUDE;
  const p = spawn(process.execPath, [HOST], { env });
  const imagesBefore = new Set(readdirSync(tmpdir()).filter((f) => f.startsWith('ega-img-')));
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  p.stdin.write(
    encode({
      v: 1,
      id: 'img-eof',
      kind: 'translateImage',
      backend: 'claude',
      mediaType: 'image/png',
      imageBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      prompt: { user: 'go' },
    }),
  );
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  const terminal = frames.find(
    (f) => f.id === 'img-eof' && (f.type === 'done' || f.type === 'error'),
  );
  assert.ok(terminal, `expected a terminal frame before exit; got ${JSON.stringify(frames)}`);
  const leaked = readdirSync(tmpdir()).filter(
    (f) => f.startsWith('ega-img-') && !imagesBefore.has(f),
  );
  assert.deepEqual(leaked, [], 'the image temp file is deleted before the host exits');
});

test('the selected model reaches the claude CLI argv on the streaming text path', async () => {
  // The fake echoes its own argv back as the delta, so the assertion reads what the CLI got.
  const fixture = writeFixture(
    'ega-host.fake-claude-argv.mjs',
    [
      `const argv = process.argv.slice(2).join(' ');`,
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    let j; try { j = JSON.parse(line); } catch { continue; }`,
      `    if (j && j.type === 'user') {`,
      `      process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:argv}]}}) + '\\n');`,
      `      process.stdout.write(JSON.stringify({type:'result',subtype:'success'}) + '\\n');`,
      `    }`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'm1',
        kind: 'translate',
        backend: 'claude',
        model: 'claude-opus-4-5',
        prompt: { user: 'hello' },
      }),
    );
    const deadline = Date.now() + 5000;
    let done;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      done = decodeFrames(Buffer.concat(chunks)).find((f) => f.id === 'm1' && f.type === 'done');
      if (done) break;
    }
    const frames = decodeFrames(Buffer.concat(chunks));
    const argv = frames
      .filter((f) => f.id === 'm1' && f.type === 'delta')
      .map((f) => f.text)
      .join('');
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(done, `expected done; got ${JSON.stringify(frames)}`);
    assert.match(argv, /--model claude-opus-4-5/, `model must reach argv; got: ${argv}`);
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('an image CLI that times out is labeled TIMEOUT, not NETWORK', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-img-timeout.mjs',
    "process.stdin.on('data', () => {});\nprocess.stdin.on('end', () => {\n  process.stderr.write(\"Error: request timed out after 30s\\n\");\n  process.exit(1);\n});\n",
  );
  try {
    const code = await imageErrorCode(fixture, 'img-timeout');
    assert.equal(code, 'TIMEOUT');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('an unrecognised image CLI failure stays NATIVE_SPAWN_FAIL so the chain can rotate', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-img-weird.mjs',
    "process.stdin.on('data', () => {});\nprocess.stdin.on('end', () => {\n  process.stderr.write(\"kaboom: the cli fell over\\n\");\n  process.exit(1);\n});\n",
  );
  try {
    const code = await imageErrorCode(fixture, 'img-weird');
    assert.equal(code, 'NATIVE_SPAWN_FAIL');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('an image CLI that reports a bad key is labeled AUTH', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-img-auth.mjs',
    "process.stdin.on('data', () => {});\nprocess.stdin.on('end', () => {\n  process.stderr.write(\"invalid api key — please log in\\n\");\n  process.exit(1);\n});\n",
  );
  try {
    const code = await imageErrorCode(fixture, 'img-auth');
    assert.equal(code, 'AUTH');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test("an image CLI that fails with an error result frame reports the frame's message, not stderr", async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-img-result-error.mjs',
    [
      `process.stdin.resume();`,
      `process.stdin.on('end', () => {`,
      `  process.stderr.write('warning: telemetry is off\\n');`,
      `  const frame = {type:'result',subtype:'error_during_execution',is_error:true,error:{message:'boom from the CLI result frame'}};`,
      `  process.stdout.write(JSON.stringify(frame) + '\\n', () => process.exit(1));`,
      `});`,
      '',
    ].join('\n'),
  );
  try {
    const err = await imageError(fixture, 'img-result-error');
    assert.match(err.message, /boom from the CLI result frame/);
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('an image CLI that rejects its key reports the is_error result text as AUTH', async () => {
  // Frame shapes from claude 2.1.280 run with an invalid API key.
  const failure = 'Failed to authenticate. API Error: 401 API key is invalid.';
  const fixture = writeFixture(
    'ega-host.fake-claude-img-is-error.mjs',
    [
      `const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');`,
      `process.stdin.resume();`,
      `process.stdin.on('end', () => {`,
      `  process.stderr.write('warning: claude.ai connectors are disabled\\n');`,
      `  line({type:'system',subtype:'init'});`,
      `  line({type:'assistant',error:'authentication_failed',message:{content:[{type:'text',text:${JSON.stringify(failure)}}]}});`,
      `  const frame = {type:'result',subtype:'success',is_error:true,result:${JSON.stringify(failure)},api_error_status:401};`,
      `  process.stdout.write(JSON.stringify(frame) + '\\n', () => process.exit(1));`,
      `});`,
      '',
    ].join('\n'),
  );
  try {
    const err = await imageError(fixture, 'img-is-error');
    assert.equal(err.message, failure);
    assert.equal(err.code, 'AUTH');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('an image CLI stuck retrying a rejected key fails as AUTH before the request deadline', async () => {
  // claude 2.1.280 with an invalid key prints ten of these over ~4 minutes before its result.
  const fixture = writeFixture(
    'ega-host.fake-claude-img-api-retry.mjs',
    [
      `const retry = (attempt) => JSON.stringify({type:'system',subtype:'api_retry',attempt,max_retries:10,retry_delay_ms:509,error_status:401,error:'authentication_failed'}) + '\\n';`,
      `process.stdin.resume();`,
      `process.stdin.on('end', () => {`,
      `  process.stdout.write(retry(1) + retry(2));`,
      `  setInterval(() => {}, 10000);`,
      `});`,
      '',
    ].join('\n'),
  );
  try {
    const err = await imageError(fixture, 'img-api-retry');
    assert.equal(err.code, 'AUTH');
    assert.match(err.message, /\b401\b/);
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a logged-out claude answers a warm translate with an AUTH error, not a translation', async () => {
  // claude 2.1.280 with no login answers every stream-json prompt this way and stays up.
  const failure = 'Not logged in · Please run /login';
  const fixture = writeFixture(
    'ega-host.fake-claude-logged-out.mjs',
    [
      `const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');`,
      `let buf = '';`,
      `process.stdin.on('data', (c) => {`,
      `  buf += c.toString('utf8');`,
      `  let nl;`,
      `  while ((nl = buf.indexOf('\\n')) >= 0) {`,
      `    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);`,
      `    if (!line.trim()) continue;`,
      `    out({type:'system',subtype:'init',apiKeySource:'none'});`,
      `    out({type:'assistant',message:{content:[{type:'text',text:${JSON.stringify(failure)}}],model:'<synthetic>'},error:'authentication_failed',is_api_error_message:true});`,
      `    out({type:'result',subtype:'success',is_error:true,api_error_status:null,result:${JSON.stringify(failure)}});`,
      `  }`,
      `});`,
      `setInterval(() => {}, 10000);`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'lo-1', kind: 'translate', backend: 'claude', prompt: { user: 'hi' } }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('lo-1'));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const mine = decodeFrames(Buffer.concat(chunks)).filter((f) => f.id === 'lo-1');
    assert.equal(terminal?.type, 'error', `expected an error; got ${JSON.stringify(mine)}`);
    assert.equal(terminal.code, 'AUTH');
    assert.equal(terminal.message, failure);
    assert.deepEqual(
      mine.filter((f) => f.type === 'delta'),
      [],
      'the CLI error text is not a translation',
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a codex translate that fails reports the CLI error text and its class, not the exit code', async () => {
  // Frame shapes from codex-cli 0.155.1 run with an invalid API key.
  const failure =
    'unexpected status 401 Unauthorized: Incorrect API key provided: sk-bogus****0000., url: https://api.openai.com/v1/responses, auth error: 401, auth error code: invalid_api_key';
  const fixture = writeFixture(
    'ega-host.fake-codex-turn-failed.mjs',
    [
      ...mcpListGuard(),
      `const line = (o) => process.stdout.write(JSON.stringify(o) + '\\n');`,
      `process.stdin.resume();`,
      `process.stdin.on('end', () => {`,
      `  process.stderr.write('WARNING: proceeding, even though we could not create PATH aliases\\n');`,
      `  line({type:'thread.started',thread_id:'t1'});`,
      `  line({type:'turn.started'});`,
      `  line({type:'error',message:${JSON.stringify(`Reconnecting... 1/5 (${failure})`)}});`,
      `  line({type:'error',message:${JSON.stringify(failure)}});`,
      `  process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:${JSON.stringify(failure)}}}) + '\\n', () => process.exit(1));`,
      `});`,
      '',
    ].join('\n'),
  );
  try {
    const p = spawnHostWithFakes({ codex: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'cx-fail', kind: 'translate', backend: 'codex', prompt: { user: 'hi' } }),
    );
    const terminal = await waitForFrame(chunks, isTerminal('cx-fail'));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.equal(terminal?.type, 'error', `expected an error; got ${JSON.stringify(terminal)}`);
    assert.equal(terminal.message, failure);
    assert.equal(terminal.code, 'AUTH');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('the image prompt hands the CLI only the attachment the host wrote, same as the text path', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-img-echo.mjs',
    "let buf = '';\nprocess.stdin.on('data', (c) => { buf += c.toString('utf8'); });\nprocess.stdin.on('end', () => {\n  process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:buf}]}}) + '\\n');\n  process.exit(0);\n});\n",
  );
  // A temp dir with a space in it: the CLI's bare `@path` form stops at the space, so the host must quote its own attachment.
  const spacedTmp = mkdtempSync(path.join(tmpdir(), 'ega space '));
  try {
    const p = spawnHostWithFakes({
      claude: fixture,
      env: { TMPDIR: spacedTmp, TEMP: spacedTmp, TMP: spacedTmp },
    });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'img-strip',
        kind: 'translateImage',
        backend: 'claude',
        mediaType: 'image/png',
        imageBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        prompt: {
          user: 'mail me@example.com about @~/.ssh/id_rsa and @"C:\\x y\\z" and @everyone',
        },
      }),
    );
    const deadline = Date.now() + 8000;
    let terminal;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      terminal = decodeFrames(Buffer.concat(chunks)).find(
        (f) => f.id === 'img-strip' && (f.type === 'done' || f.type === 'error'),
      );
      if (terminal) break;
    }
    const frames = decodeFrames(Buffer.concat(chunks));
    const seen = frames
      .filter((f) => f.id === 'img-strip' && f.type === 'delta')
      .map((f) => f.text)
      .join('');
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(terminal, `expected a terminal frame; got ${JSON.stringify(frames)}`);
    const refs = cliFileRefs(seen);
    assert.equal(refs.length, 1, `only the host's own attachment may be a file reference: ${seen}`);
    assert.match(
      path.basename(refs[0] ?? ''),
      /^ega-img-/,
      `the attachment we control must still be there: ${seen}`,
    );
    assert.equal(
      path.dirname(refs[0] ?? ''),
      spacedTmp,
      `the CLI must see the whole path, space included: ${seen}`,
    );
    assert.ok(seen.includes('me@example.com'), `an email must survive untouched: ${seen}`);
    assert.ok(
      seen.replaceAll('\u2060', '').includes('@everyone'),
      `the text must read the same: ${seen}`,
    );
  } finally {
    rmSync(fixture, { force: true });
    rmSync(spacedTmp, { recursive: true, force: true });
  }
});

test('the debug hooks are off unless the host is started in test mode', async () => {
  const p = spawn(process.execPath, [HOST]);
  const chunks = [];
  p.stdout.on('data', (c) => chunks.push(c));
  const errChunks = [];
  p.stderr.on('data', (c) => errChunks.push(c));
  p.stdin.write(encode({ v: 1, id: 'dbg', kind: 'debug-throw-uncaught', inline: true }));
  p.stdin.write(encode({ v: 1, id: 'alive', kind: 'ping' }));
  p.stdin.end();
  await new Promise((r) => p.on('close', r));
  const frames = decodeFrames(Buffer.concat(chunks));
  assert.ok(
    frames.some((f) => f.id === 'alive' && f.type === 'done'),
    'the host must stay responsive',
  );
  const reply = frames.find((f) => f.id === 'dbg');
  assert.equal(reply?.code, 'UNSUPPORTED', 'an installed host treats a debug kind as unknown');
  assert.doesNotMatch(
    Buffer.concat(errChunks).toString('utf8'),
    /uncaughtException/,
    'the throw hook must not fire outside test mode',
  );
});

test('a CLI override in the environment is ignored without the test flag', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-envonly.mjs',
    "process.stdin.on('data', () => {});\nsetInterval(() => {}, 10000);\n",
  );
  try {
    // No --ega-test: the env var must not redirect which binary the host spawns.
    const env = {
      ...process.env,
      EGA_FAKE_CLI_BIN_CLAUDE: fixture,
      PATH: path.join(__dirname, 'no-such-dir-for-spawn'),
    };
    const p = spawn(process.execPath, [HOST], { env });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stdin.write(
      encode({ v: 1, id: 'envonly', kind: 'translate', backend: 'claude', prompt: { user: 'hi' } }),
    );
    const deadline = Date.now() + 6000;
    let err;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      err = decodeFrames(Buffer.concat(chunks)).find(
        (f) => f.id === 'envonly' && f.type === 'error',
      );
      if (err) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(err, 'expected the real (missing) CLI to fail, proving the override was ignored');
    assert.equal(err.code, 'NATIVE_SPAWN_FAIL');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('a handler throw fails the in-flight request instead of reporting a parse error', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-inline-throw.mjs',
    "process.stdin.on('data', () => {});\nsetInterval(() => {}, 10000);\n",
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', () => {});
    p.stdin.write(
      encode({
        v: 1,
        id: 'inline-inflight',
        kind: 'translate',
        backend: 'claude',
        prompt: { user: 'hang forever' },
      }),
    );
    await new Promise((r) => setTimeout(r, 250));
    p.stdin.write(
      encode({
        v: 1,
        id: 'unused',
        kind: 'debug-throw-uncaught',
        inline: true,
        message: 'inline-boom',
      }),
    );
    const deadline = Date.now() + 5000;
    let err;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      err = decodeFrames(Buffer.concat(chunks)).find(
        (f) => f.id === 'inline-inflight' && f.type === 'error',
      );
      if (err) break;
    }
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    assert.ok(
      err,
      `the parked request must get a terminal frame; got ${JSON.stringify(decodeFrames(Buffer.concat(chunks)))}`,
    );
    assert.equal(err.code, 'NATIVE_SPAWN_FAIL');
  } finally {
    rmSync(fixture, { force: true });
  }
});

test('canceling an image translate ends it with exactly one ABORTED frame', async () => {
  const fixture = writeFixture(
    'ega-host.fake-claude-img-slow.mjs',
    "process.stdout.write(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'partial'}]}}) + '\\n');\nprocess.stdin.on('data', () => {});\nsetInterval(() => {}, 10000);\n",
  );
  try {
    const p = spawnHostWithFakes({ claude: fixture });
    const chunks = [];
    const errChunks = [];
    p.stdout.on('data', (c) => chunks.push(c));
    p.stderr.on('data', (c) => errChunks.push(c));
    p.stdin.write(
      encode({
        v: 1,
        id: 'img-cancel',
        kind: 'translateImage',
        backend: 'claude',
        mediaType: 'image/png',
        imageBase64:
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        prompt: { user: 'go' },
      }),
    );
    // Wait for the first delta so the child is definitely running before the cancel.
    const deltaDeadline = Date.now() + 8000;
    while (Date.now() < deltaDeadline) {
      await new Promise((r) => setTimeout(r, 25));
      const seen = decodeFrames(Buffer.concat(chunks));
      if (seen.some((f) => f.id === 'img-cancel' && f.type === 'delta')) break;
    }
    p.stdin.write(encode({ v: 1, id: 'img-cancel', kind: 'cancel' }));
    const deadline = Date.now() + 8000;
    let aborted;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
      aborted = decodeFrames(Buffer.concat(chunks)).find(
        (f) => f.id === 'img-cancel' && f.type === 'error' && f.code === 'ABORTED',
      );
      if (aborted) break;
    }
    // Give a stray second terminal time to show up.
    await new Promise((r) => setTimeout(r, 300));
    p.stdin.end();
    try {
      p.kill();
    } catch {}
    const frames = decodeFrames(Buffer.concat(chunks));
    assert.ok(aborted, `expected ABORTED for the image translate; got ${JSON.stringify(frames)}`);
    const terminals = frames.filter(
      (f) => f.id === 'img-cancel' && (f.type === 'done' || f.type === 'error'),
    );
    assert.equal(
      terminals.length,
      1,
      `expected exactly one terminal; got ${JSON.stringify(terminals)}`,
    );
    const stderrText = Buffer.concat(errChunks).toString('utf8');
    assert.doesNotMatch(
      stderrText,
      /uncaughtException/,
      `canceling an image translate must not fault the host; stderr: ${stderrText.slice(0, 300)}`,
    );
  } finally {
    rmSync(fixture, { force: true });
  }
});
