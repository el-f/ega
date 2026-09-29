// Runs the real install command from the Options page against a temp LOCALAPPDATA (Windows)
// and a temp HOME (macOS and Linux). Started as `node scripts/live-test-install.mjs`.

import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  windowsInstallCommand,
  unixInstallCommand,
  unixUninstallCommand,
  bundleHostSource,
} from './lib/nativeHostInstall.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The install command writes one file, so sibling modules must be inlined first.
const HOST_SRC = bundleHostSource(
  readFileSync(path.join(REPO, 'native-host', 'ega-host.mjs'), 'utf8'),
  {
    protocolClaude: readFileSync(
      path.join(REPO, 'native-host', 'lib', 'protocol-claude.mjs'),
      'utf8',
    ),
    protocolCodex: readFileSync(
      path.join(REPO, 'native-host', 'lib', 'protocol-codex.mjs'),
      'utf8',
    ),
    cliSession: readFileSync(path.join(REPO, 'native-host', 'lib', 'cli-session.mjs'), 'utf8'),
    classifyCliError: readFileSync(
      path.join(REPO, 'native-host', 'lib', 'classify-cli-error.mjs'),
      'utf8',
    ),
  },
);

const FAKE_EXT_ID = 'livetestaaaaaaaaaaaaaaaaaaaaaaaa';
const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'ega-livetest-'));
const tmpLocalAppData = path.join(tmpRoot, 'LocalAppData');

// The installer writes the real HKCU host keys; put them back so a test run cannot break a real install.
const REG_KEYS = [
  'Google\\Chrome',
  'Microsoft\\Edge',
  'BraveSoftware\\Brave-Browser',
  'Chromium',
].map((b) => `HKCU\\Software\\${b}\\NativeMessagingHosts\\com.ega.host`);

// A .reg file is UTF-16LE, so a non-ASCII path survives; `reg query` output is in the console code page and does not.
function exportReg(key, file) {
  const r = spawnSync('reg', ['export', key, file, '/y'], { encoding: 'utf8' });
  return r.status === 0 ? file : null;
}

// `reg import` merges, so delete first: nothing the installer added survives.
function restoreReg(key, file) {
  spawnSync('reg', ['delete', key, '/f'], { encoding: 'utf8' });
  if (file === null) return spawnSync('reg', ['query', key], { encoding: 'utf8' }).status !== 0;
  return spawnSync('reg', ['import', file], { encoding: 'utf8' }).status === 0;
}

const savedReg =
  process.platform === 'win32'
    ? REG_KEYS.map((k, i) => [k, exportReg(k, path.join(tmpRoot, `reg-${i}.reg`))])
    : [];

let failures = 0;
function check(label, cond, extra = '') {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    console.log(`  ✗ ${label}${extra ? ' — ' + extra : ''}`);
    failures++;
  }
}

function frame(obj) {
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
    try {
      out.push(JSON.parse(buf.slice(4, 4 + len).toString('utf8')));
    } catch {
      /* skip */
    }
    buf = buf.slice(4 + len);
  }
  return out;
}

// Speaks the native-messaging framing at whatever command Chrome would start.
async function pingHost(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  const chunks = [];
  const errs = [];
  child.stdout.on('data', (c) => chunks.push(c));
  child.stderr.on('data', (c) => errs.push(c));
  child.stdin.write(frame({ v: 1, id: 'live-ping', kind: 'ping' }));
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  return { frames: decodeFrames(Buffer.concat(chunks)), stderr: Buffer.concat(errs).toString() };
}

// Answers claude's stream-json protocol with one assistant turn, then a success result.
const FAKE_CLAUDE_SRC = [
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
].join('\n');

/** Runs a real translate: a ping never gets past the host's top block, so a TDZ bug from the splice order would pass. */
async function translateThroughInstalledHost(cmd, args, opts = {}) {
  const fakeCli = path.join(tmpRoot, 'fake-claude.mjs');
  writeFileSync(fakeCli, FAKE_CLAUDE_SRC, 'utf8');
  const child = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
    env: { ...process.env, ...opts.env, EGA_FAKE_CLI_BIN_CLAUDE: fakeCli },
  });
  const chunks = [];
  const errs = [];
  child.stdout.on('data', (c) => chunks.push(c));
  child.stderr.on('data', (c) => errs.push(c));
  child.stdin.write(
    frame({
      v: 1,
      id: 'live-tx',
      kind: 'translate',
      backend: 'claude',
      prompt: { system: 'sys', user: 'hello' },
    }),
  );
  const deadline = Date.now() + 20_000;
  let done;
  let frames = [];
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    frames = decodeFrames(Buffer.concat(chunks));
    done = frames.find((f) => f.id === 'live-tx' && (f.type === 'done' || f.type === 'error'));
    if (done) break;
  }
  child.stdin.end();
  try {
    child.kill();
  } catch {
    /* already gone */
  }
  const text = frames
    .filter((f) => f.id === 'live-tx' && f.type === 'delta')
    .map((f) => f.text)
    .join('');
  return { done, text, stderr: Buffer.concat(errs).toString() };
}

console.log('Live-testing native-host install flow');
console.log('Platform:', process.platform);
console.log('Temp root:', tmpRoot);

try {
  if (process.platform === 'win32') {
    // -File, not -Command: the snippet is ~70KB and a Windows command line stops at 32767 (ENAMETOOLONG).
    const runPowerShell = (extId, file) => {
      const script = path.join(tmpRoot, file);
      writeFileSync(script, windowsInstallCommand(extId, HOST_SRC), 'utf8');
      return spawnSync(
        'powershell',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script],
        {
          env: { ...process.env, LOCALAPPDATA: tmpLocalAppData },
          encoding: 'utf8',
        },
      );
    };

    console.log('\n[1/6] First install run (Windows)');
    let r = runPowerShell(FAKE_EXT_ID, 'install-1.ps1');
    if (r.stdout && r.stdout.trim()) console.log('  stdout:', r.stdout.trim());
    if (r.stderr && r.stderr.trim()) console.log('  stderr:', r.stderr.trim());
    check('PowerShell install exited 0', r.status === 0);
    check('stdout reports install success', /install complete/i.test(String(r.stdout)));

    const hostDir = path.join(tmpLocalAppData, 'Ega', 'native-host');
    const manifestPath = path.join(hostDir, 'com.ega.host.json');
    const hostScriptPath = path.join(hostDir, 'ega-host.mjs');
    const launcherPath = path.join(hostDir, 'ega-host.cmd');

    check('host script written', existsSync(hostScriptPath));
    check('launcher .cmd written', existsSync(launcherPath));
    check('manifest written', existsSync(manifestPath));

    let manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    check('manifest name', manifest.name === 'com.ega.host');
    check('manifest type', manifest.type === 'stdio');
    check('manifest path points at launcher', manifest.path === launcherPath);
    check(
      'manifest allowed_origins has first ID',
      Array.isArray(manifest.allowed_origins) &&
        manifest.allowed_origins.includes('chrome-extension://' + FAKE_EXT_ID + '/'),
    );
    check(
      'manifest file has no UTF-8 BOM (Chrome rejects BOM-prefixed manifests)',
      readFileSync(manifestPath)[0] !== 0xef,
    );

    console.log('\n[2/6] Second install run (Brave-after-Chrome → ID merge)');
    r = runPowerShell('secondidbbbbbbbbbbbbbbbbbbbbbbbb', 'install-2.ps1');
    check('second install exits 0', r.status === 0, String(r.stderr).slice(0, 300));
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    check(
      'manifest keeps first ID after second install (merge)',
      manifest.allowed_origins.includes('chrome-extension://' + FAKE_EXT_ID + '/'),
    );
    check(
      'manifest adds second ID',
      manifest.allowed_origins.includes('chrome-extension://secondidbbbbbbbbbbbbbbbbbbbbbbbb/'),
    );
    check(
      'no duplicate origins',
      new Set(manifest.allowed_origins).size === manifest.allowed_origins.length,
    );

    console.log('\n[3/6] Spawn installed host and send a ping frame');
    const { frames } = await pingHost(process.execPath, [hostScriptPath]);
    const pong = frames.find((f) => f.type === 'done' && f.id === 'live-ping');
    check('host responds to ping with done', !!pong, 'frames=' + JSON.stringify(frames));
    check(
      'ping reply includes hostVersion',
      typeof pong?.hostVersion === 'number' && pong.hostVersion >= 1,
    );

    console.log('\n[4/6] Drive one translate through the installed bundle');
    const tx = await translateThroughInstalledHost(process.execPath, [
      hostScriptPath,
      '--ega-test',
    ]);
    check(
      'installed bundle answers a translate with a terminal frame',
      !!tx.done,
      tx.stderr.slice(0, 400),
    );
    check(
      'translate succeeds through the spliced bundle',
      tx.done?.type === 'done',
      JSON.stringify(tx.done),
    );
    check('translate streams the CLI text back', tx.text === 'hola', JSON.stringify(tx.text));

    console.log('\n[5/6] Start the .cmd launcher the way Chrome does, with node off PATH');
    const launcherText = readFileSync(launcherPath, 'utf8');
    check(
      'launcher does not fall back to a bare node lookup as its only path',
      !/^\s*node\s+"%~dp0/m.test(launcherText),
      launcherText,
    );
    check(
      'launcher bakes an absolute node path',
      /^set "EGA_NODE=[A-Za-z]:\\[^"]+"$/m.test(launcherText),
      launcherText.split(/\r?\n/).find((l) => l.startsWith('set "EGA_NODE=')),
    );
    // Chrome starts the launcher from its own environment, which need not carry a per-shell node.
    const noNodePath = String(process.env['PATH'] ?? '')
      .split(path.delimiter)
      .filter((p) => !/nodejs|nvm|fnm|volta|node_modules/i.test(p))
      .join(path.delimiter);
    const winPing = await pingHost('cmd', ['/c', launcherPath], {
      env: { ...process.env, PATH: noNodePath, Path: noNodePath },
    });
    const winPong = winPing.frames.find((f) => f.type === 'done' && f.id === 'live-ping');
    check(
      'launcher answers a ping frame with node off PATH',
      !!winPong,
      winPing.stderr.slice(0, 200) || 'frames=' + JSON.stringify(winPing.frames),
    );
    const winTx = await translateThroughInstalledHost('cmd', ['/c', launcherPath, '--ega-test'], {
      env: { PATH: noNodePath, Path: noNodePath },
    });
    check(
      'launcher answers a translate with a terminal frame',
      winTx.done?.type === 'done',
      winTx.stderr.slice(0, 400),
    );
    check('translate streams the CLI text back', winTx.text === 'hola', JSON.stringify(winTx.text));

    console.log('\n[6/6] Sanity-check claude CLI flags (if installed)');
    // shell:true is needed to resolve the .cmd on Windows; every argv entry is a static literal.
    const claude = spawnSync(
      'claude',
      ['--print', '--verbose', '--output-format', 'stream-json', '--help'],
      { encoding: 'utf8', shell: true, timeout: 10_000 },
    );
    const combined = (claude.stdout ?? '') + (claude.stderr ?? '');
    if (claude.status === null && /ENOENT/i.test(String(claude.error))) {
      console.log('  (skipped — claude CLI not installed)');
    } else {
      check(
        'claude CLI accepts --verbose + --output-format stream-json',
        !/requires --verbose/.test(combined),
        combined.slice(0, 200),
      );
    }
  } else {
    console.log('\nSkipping Windows PowerShell install phase (platform=' + process.platform + ')');
  }

  console.log('\n[bash] Syntax-check the Unix install command');
  for (const osName of ['linux', 'macos']) {
    const bashCmd = unixInstallCommand(osName, FAKE_EXT_ID, HOST_SRC);
    const script = path.join(tmpRoot, `install-${osName}.sh`);
    writeFileSync(script, bashCmd.replace(/\r\n/g, '\n'), 'utf8');
    const bash = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
    if (bash.stderr && bash.stderr.trim()) console.log(`  (${osName}) stderr:`, bash.stderr.trim());
    check(`bash -n accepts ${osName} install command`, bash.status === 0);
  }

  console.log('\n[bash] Verify install fails fast when node is missing');
  const bashCmd = unixInstallCommand('linux', FAKE_EXT_ID, HOST_SRC);
  const script = path.join(tmpRoot, 'no-node-install.sh');
  writeFileSync(script, bashCmd.replace(/\r\n/g, '\n'), 'utf8');
  // Scrub PATH inside the shell, not through `env`: node resolves the child with the child's PATH, so bash itself would not start.
  const failRun = spawnSync('bash', ['-c', 'export PATH=/nonexistent; exec "$BASH" "$0"', script], {
    encoding: 'utf8',
  });
  const failOut = String(failRun.stdout ?? '') + String(failRun.stderr ?? '');
  check('install exits non-zero when node missing', failRun.status !== 0);
  check(
    'install names the missing dependency',
    /node not on PATH|node: command not found/.test(failOut),
    failOut.slice(0, 200),
  );

  console.log('\n[bash] Run the generated Linux installer for real');
  if (spawnSync('bash', ['-c', 'exit 0']).status !== 0) {
    console.log('  (skipped — no bash on PATH)');
  } else {
    const unixHome = path.join(tmpRoot, 'unix-home');
    const runInstall = (extId, file) => {
      const s = path.join(tmpRoot, file);
      writeFileSync(s, unixInstallCommand('linux', extId, HOST_SRC).replace(/\r\n/g, '\n'), 'utf8');
      return spawnSync('bash', [s], { env: { ...process.env, HOME: unixHome }, encoding: 'utf8' });
    };
    const first = runInstall(FAKE_EXT_ID, 'unix-install-1.sh');
    if (first.stderr && first.stderr.trim()) console.log('  stderr:', first.stderr.trim());
    check('linux install exits 0', first.status === 0, String(first.stderr).slice(0, 300));
    check('stdout reports install success', /install complete/i.test(String(first.stdout)));

    const unixDir = path.join(unixHome, '.ega', 'native-host');
    const launcher = path.join(unixDir, 'ega-host.sh');
    const unixManifestPath = path.join(unixDir, 'com.ega.host.json');
    check('host script written', existsSync(path.join(unixDir, 'ega-host.mjs')));
    check('launcher written', existsSync(launcher));
    check(
      'launcher is executable',
      spawnSync('bash', ['-c', 'test -x "$0"', launcher]).status === 0,
    );

    const launcherText = existsSync(launcher) ? readFileSync(launcher, 'utf8') : '';
    // A GUI-launched Chrome hands the host launchd's PATH, which has no node.
    check('launcher does not exec a bare node', !/^\s*exec\s+node\b/m.test(launcherText));
    check(
      'launcher bakes an absolute node path',
      /^NODE_BIN="\/[^"]+"$/m.test(launcherText),
      launcherText.split('\n').find((l) => l.startsWith('NODE_BIN=')),
    );

    let unixManifest = existsSync(unixManifestPath)
      ? JSON.parse(readFileSync(unixManifestPath, 'utf8'))
      : {};
    check('manifest path is absolute', path.isAbsolute(String(unixManifest.path)));
    check(
      'manifest path points at the launcher on disk',
      /ega-host\.sh$/.test(String(unixManifest.path)) && existsSync(String(unixManifest.path)),
      String(unixManifest.path),
    );
    check(
      'manifest allowed_origins has first ID',
      Array.isArray(unixManifest.allowed_origins) &&
        unixManifest.allowed_origins.includes('chrome-extension://' + FAKE_EXT_ID + '/'),
    );
    for (const browser of [
      'google-chrome',
      'chromium',
      'BraveSoftware/Brave-Browser',
      'microsoft-edge',
    ]) {
      check(
        `registered with ${browser}`,
        existsSync(
          path.join(
            unixHome,
            '.config',
            ...browser.split('/'),
            'NativeMessagingHosts',
            'com.ega.host.json',
          ),
        ),
      );
    }

    const second = runInstall('secondidbbbbbbbbbbbbbbbbbbbbbbbb', 'unix-install-2.sh');
    check('second linux install exits 0', second.status === 0, String(second.stderr).slice(0, 300));
    unixManifest = JSON.parse(readFileSync(unixManifestPath, 'utf8'));
    check(
      'manifest keeps first ID after second install (merge)',
      unixManifest.allowed_origins.includes('chrome-extension://' + FAKE_EXT_ID + '/'),
    );
    check(
      'manifest adds second ID',
      unixManifest.allowed_origins.includes('chrome-extension://secondidbbbbbbbbbbbbbbbbbbbbbbbb/'),
    );
    check(
      'no duplicate origins',
      new Set(unixManifest.allowed_origins).size === unixManifest.allowed_origins.length,
    );

    console.log('  starting the launcher the way Chrome does, with node off PATH');
    const scrub = 'export PATH=/usr/bin:/bin; ';
    if (spawnSync('bash', ['-c', scrub + 'command -v node >/dev/null']).status === 0) {
      console.log(
        '  (note: node is in /usr/bin here, so this PATH is less bare than a GUI Chrome)',
      );
    }
    const unixPing = await pingHost('bash', ['-c', scrub + 'exec "$0"', launcher]);
    const unixPong = unixPing.frames.find((f) => f.type === 'done' && f.id === 'live-ping');
    check(
      'launcher answers a ping frame',
      !!unixPong,
      unixPing.stderr.slice(0, 200) || 'frames=' + JSON.stringify(unixPing.frames),
    );
    check(
      'ping reply includes hostVersion',
      typeof unixPong?.hostVersion === 'number' && unixPong.hostVersion >= 1,
    );

    console.log('  driving one translate through the installed launcher');
    const unixTx = await translateThroughInstalledHost('bash', [
      '-c',
      scrub + 'exec "$0" --ega-test',
      launcher,
    ]);
    check(
      'launcher answers a translate with a terminal frame',
      !!unixTx.done,
      unixTx.stderr.slice(0, 400),
    );
    check(
      'translate succeeds through the spliced bundle',
      unixTx.done?.type === 'done',
      JSON.stringify(unixTx.done),
    );
    check(
      'translate streams the CLI text back',
      unixTx.text === 'hola',
      JSON.stringify(unixTx.text),
    );

    const uninstall = path.join(tmpRoot, 'unix-uninstall.sh');
    writeFileSync(uninstall, unixUninstallCommand('linux').replace(/\r\n/g, '\n'), 'utf8');
    const removed = spawnSync('bash', [uninstall], {
      env: { ...process.env, HOME: unixHome },
      encoding: 'utf8',
    });
    check('uninstall exits 0', removed.status === 0, String(removed.stderr).slice(0, 300));
    check('uninstall removes the runtime directory', !existsSync(unixDir));
    check(
      'uninstall removes the Chrome registration',
      !existsSync(
        path.join(
          unixHome,
          '.config',
          'google-chrome',
          'NativeMessagingHosts',
          'com.ega.host.json',
        ),
      ),
    );
  }
} finally {
  for (const [key, file] of savedReg) check(`registry restored: ${key}`, restoreReg(key, file));
  console.log('\nCleanup:', tmpRoot);
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch (e) {
    console.warn('cleanup failed:', e.message);
  }
}

console.log(`\n${failures === 0 ? '✓ all checks passed' : '✗ ' + failures + ' check(s) failed'}`);
process.exit(failures === 0 ? 0 : 1);
