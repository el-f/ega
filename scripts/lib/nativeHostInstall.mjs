// The PowerShell / bash install snippets the Backends tab emits. A .mjs so the browser
// generator and the Node live-test harness can both import it without Vite's `?raw`.

// Vite does not polyfill Buffer, so the browser caller needs the TextEncoder path.
function toBase64(s) {
  if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function chunkString(s, size) {
  const chunks = [];
  for (let i = 0; i < s.length; i += size) chunks.push(s.slice(i, i + size));
  return chunks;
}

function stripExports(src) {
  return src.replace(/^export\s+/gm, '');
}

function stripRelativeImports(src) {
  return src.replace(/^import\s[^'"]+['"]\.[^'"]+['"];?\s*$/gm, '');
}

function stripAllImports(src) {
  return src.replace(/^import\s[^'"]+['"][^'"]+['"];?\s*$/gm, '');
}

/** Inlines sibling modules so the installed ega-host.mjs runs alone; a leftover relative import crashes the host on its first ping. */
export function bundleHostSource(
  hostSource,
  { protocolClaude, protocolCodex, cliSession, classifyCliError },
) {
  const inlineBlocks = [];
  if (classifyCliError) inlineBlocks.push(stripExports(classifyCliError));
  if (protocolClaude) inlineBlocks.push(stripExports(protocolClaude));
  if (protocolCodex) inlineBlocks.push(stripExports(protocolCodex));
  if (cliSession) {
    inlineBlocks.push(
      '// cli-session.mjs inlined; aliases the host-scope `spawn` so adapter wiring resolves.\nconst nodeSpawn = spawn;\n' +
        stripExports(stripAllImports(cliSession)),
    );
  }

  if (inlineBlocks.length === 0) return hostSource;

  let out = hostSource;
  // Drop every relative-import line in ega-host (the lib/ modules inlined above).
  out = stripRelativeImports(out);
  // Splice all inlined modules in once at the top, after the final `import ... from 'node:...'`.
  const nodeImportRe = /(^import\s[^'"]+['"]node:[^'"]+['"];?\s*$\n?)/gm;
  const matches = [...out.matchAll(nodeImportRe)];
  const last = matches[matches.length - 1];
  if (last) {
    const insertAt = (last.index ?? 0) + last[0].length;
    out = out.slice(0, insertAt) + '\n' + inlineBlocks.join('\n\n') + '\n' + out.slice(insertAt);
  } else {
    out = inlineBlocks.join('\n\n') + '\n' + out;
  }
  return out;
}

export function windowsInstallCommand(extId, hostSource) {
  return windowsInstallPowerShellLines(extId, hostSource, { chunkHost: false }).join('\n');
}

// Step labels are byte-identical with the Unix script so the user sees the
// same six-step sequence regardless of OS. Numbering reflects real actions.
const INSTALL_STEPS = [
  { n: 1, label: 'checking Node.js >= 20 on PATH' },
  { n: 2, label: 'creating runtime directory' },
  { n: 3, label: 'writing ega-host.mjs' },
  { n: 4, label: 'writing launcher script' },
  { n: 5, label: 'writing native messaging manifest' },
  { n: 6, label: 'registering manifest with browsers' },
];
const INSTALL_TOTAL = INSTALL_STEPS.length;

function windowsInstallPowerShellLines(extId, hostSource, { chunkHost }) {
  const b64 = toBase64(hostSource);
  const hostWriteLines = chunkHost
    ? [
        '$hostB64 = @(',
        ...chunkString(b64, 3500).map((chunk) => `  '${chunk}'`),
        ") -join ''",
        "[IO.File]::WriteAllBytes((Join-Path $dir 'ega-host.mjs'), [Convert]::FromBase64String($hostB64))",
      ]
    : [
        "[IO.File]::WriteAllBytes((Join-Path $dir 'ega-host.mjs'), [Convert]::FromBase64String('" +
          b64 +
          "'))",
      ];
  // `Write-Host` survives `| Out-Null`; `ok` takes a PowerShell expression so `$` names expand.
  const banner = (n, label) => `Write-Host '[${n}/${INSTALL_TOTAL}] ${label} ...'`;
  const ok = (expr) => (expr ? `Write-Host ('  ok - ' + ${expr})` : `Write-Host '  ok'`);
  return [
    '# Run in PowerShell. Requires Node.js >= 20 on PATH.',
    // Script block: $ErrorActionPreference and the $names stay out of the user's own session.
    '& {',
    '$ErrorActionPreference = "Stop"',
    "$EGA_EXT_ID = '" + extId + "'",
    '$step = 0',
    'try {',
    `  $step = 1; ${banner(1, INSTALL_STEPS[0].label)}`,
    "  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is not on PATH. Install Node.js >= 20, then re-run.' }",
    '  $nodeVersion = (& node --version) 2>&1',
    '  $nodeMajor = 0',
    "  if ($nodeVersion -match 'v(\\d+)\\.') { $nodeMajor = [int]$Matches[1] }",
    "  if ($nodeMajor -lt 20) { throw ('Node.js >= 20 required (found ' + $nodeVersion + ').') }",
    // The browser's PATH need not carry a per-shell node (nvm-windows, fnm, volta).
    '  $nodePath = (Get-Command node | Select-Object -First 1).Source',
    // The launcher is written as ASCII, so a path under a non-ASCII profile name cannot go in it.
    "  if ($nodePath -notmatch '^[\\x20-\\x7E]+$') { $nodePath = 'node' }",
    `  ${ok('$nodeVersion')}`,
    `  $step = 2; ${banner(2, INSTALL_STEPS[1].label)}`,
    "  $dir = Join-Path $env:LOCALAPPDATA 'Ega\\native-host'",
    '  New-Item -ItemType Directory -Force -Path $dir | Out-Null',
    `  ${ok('$dir')}`,
    `  $step = 3; ${banner(3, INSTALL_STEPS[2].label)}`,
    ...hostWriteLines.map((l) => '  ' + l),
    `  ${ok("(Join-Path $dir 'ega-host.mjs')")}`,
    `  $step = 4; ${banner(4, INSTALL_STEPS[3].label)}`,
    "  $launcher = Join-Path $dir 'ega-host.cmd'",
    // %~dp0 keeps the launcher pure ASCII: an embedded profile path with a non-ASCII
    // username would be mangled to '?' by -Encoding ASCII and the host would never start.
    "  Set-Content -Encoding ASCII -Path $launcher -Value '@echo off'",
    "  Add-Content -Encoding ASCII -Path $launcher -Value ('set \"EGA_NODE=' + $nodePath + '\"')",
    '  Add-Content -Encoding ASCII -Path $launcher -Value \'if not exist "%EGA_NODE%" set "EGA_NODE=node"\'',
    '  Add-Content -Encoding ASCII -Path $launcher -Value \'"%EGA_NODE%" "%~dp0ega-host.mjs" %*\'',
    `  ${ok('$launcher')}`,
    `  $step = 5; ${banner(5, INSTALL_STEPS[4].label)}`,
    "  $manifestPath = Join-Path $dir 'com.ega.host.json'",
    "  $origin = 'chrome-extension://' + $EGA_EXT_ID + '/'",
    '  $origins = @($origin)',
    '  if (Test-Path $manifestPath) {',
    '    try {',
    '      $prev = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json',
    '      if ($prev.allowed_origins) {',
    '        $origins = @($prev.allowed_origins) + $origin | Select-Object -Unique',
    '      }',
    '    } catch {}',
    '  }',
    '  $manifest = [ordered]@{',
    "    name = 'com.ega.host'",
    "    description = 'Ega native host'",
    '    path = $launcher',
    "    type = 'stdio'",
    '    allowed_origins = @($origins)',
    '  }',
    '  $json = $manifest | ConvertTo-Json -Depth 4',
    '  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)',
    '  [System.IO.File]::WriteAllText($manifestPath, $json, $utf8NoBom)',
    `  ${ok("$manifestPath + ' (' + $origins.Count + ' origin(s))'")}`,
    `  $step = 6; ${banner(6, INSTALL_STEPS[5].label)}`,
    "  foreach ($base in 'HKCU:\\Software\\Google\\Chrome','HKCU:\\Software\\Microsoft\\Edge','HKCU:\\Software\\BraveSoftware\\Brave-Browser','HKCU:\\Software\\Chromium') {",
    "    $key = Join-Path $base 'NativeMessagingHosts\\com.ega.host'",
    '    New-Item -Force -Path $key | Out-Null',
    "    Set-ItemProperty -Path $key -Name '(default)' -Value $manifestPath",
    "    Write-Host ('  registered ' + $base)",
    '  }',
    `  ${ok()}`,
    "  Write-Host ''",
    "  Write-Host 'install complete. Click Recheck in the Backends tab (restart your browser if it does not appear).'",
    '} catch {',
    "  Write-Host ('[FAIL] step ' + $step + ' failed: ' + $_.Exception.Message) -ForegroundColor Red",
    // `exit` here would close the user's console host; a throw still exits 1 under `powershell -File`.
    "  throw ('Ega native-host install failed at step ' + $step + '.')",
    '}',
    '}',
    // Blank last line — PowerShell holds a pasted multi-line block at the prompt until an empty line submits it.
    '',
    '',
  ];
}

export function windowsInstallerFile(extId, hostSource) {
  const psScript = windowsInstallPowerShellLines(extId, hostSource, { chunkHost: true }).join(
    '\r\n',
  );
  const psB64Chunks = chunkString(toBase64(psScript), 3500);
  // The b64 assembly and certutil decode go to >nul, so the user sees only the numbered steps.
  return [
    '@echo off',
    'setlocal',
    'echo Ega native-host installer',
    'set "ps1=%TEMP%\\ega-native-host-install-%RANDOM%-%RANDOM%.ps1"',
    'set "b64=%TEMP%\\ega-native-host-install-%RANDOM%-%RANDOM%.b64"',
    'type nul > "%b64%" 2>nul',
    ...psB64Chunks.map((chunk) => `>>"%b64%" echo ${chunk}`),
    'certutil -f -decode "%b64%" "%ps1%" >nul 2>&1',
    'if errorlevel 1 (',
    '  echo.',
    '  echo [FAIL] could not decode embedded PowerShell payload.',
    '  del "%b64%" >nul 2>&1',
    '  pause',
    '  exit /b 1',
    ')',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ps1%"',
    'set "ec=%ERRORLEVEL%"',
    'del "%ps1%" >nul 2>&1',
    'del "%b64%" >nul 2>&1',
    'if not "%ec%"=="0" (',
    '  echo.',
    '  echo [FAIL] install exited with code %ec%.',
    '  pause',
    '  exit /b %ec%',
    ')',
    'pause',
    'exit /b 0',
    '',
  ].join('\r\n');
}

export function unixInstallCommand(os, extId, hostSource) {
  const b64 = toBase64(hostSource);
  const destList =
    os === 'macos'
      ? [
          '"$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"',
          '"$HOME/Library/Application Support/Chromium/NativeMessagingHosts"',
          '"$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"',
          '"$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"',
        ]
      : [
          '"$HOME/.config/google-chrome/NativeMessagingHosts"',
          '"$HOME/.config/chromium/NativeMessagingHosts"',
          '"$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"',
          '"$HOME/.config/microsoft-edge/NativeMessagingHosts"',
        ];
  // EGA_STEP is set at the head of every block so the `trap ERR` line names the step that failed.
  return [
    '# Run in bash/zsh. Requires Node.js >= 20 on PATH.',
    // Subshell: `set -e` and the exiting ERR trap die with it, not with the user's shell.
    '(',
    'set -e',
    'EGA_STEP=0',
    `trap 'ec=$?; echo "[FAIL] step $EGA_STEP failed (exit $ec)" >&2; exit $ec' ERR`,
    `EGA_EXT_ID='${extId}'`,
    `EGA_STEP=1; echo "[1/${INSTALL_TOTAL}] ${INSTALL_STEPS[0].label} ..."`,
    `command -v node >/dev/null 2>&1 || { echo "[FAIL] step 1: node not on PATH. Install Node.js >= 20." >&2; exit 1; }`,
    `NODE_BIN="$(command -v node)"`,
    `NODE_VERSION="$(node --version)"`,
    `NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -E 's/^v([0-9]+)\\..*/\\1/')"`,
    `if [ "${'$'}{NODE_MAJOR:-0}" -lt 20 ]; then echo "[FAIL] step 1: Node.js >= 20 required (found $NODE_VERSION)." >&2; exit 1; fi`,
    `echo "  ok — $NODE_VERSION"`,
    `EGA_STEP=2; echo "[2/${INSTALL_TOTAL}] ${INSTALL_STEPS[1].label} ..."`,
    `DIR="$HOME/.ega/native-host"`,
    `mkdir -p "$DIR"`,
    `echo "  ok — $DIR"`,
    `EGA_STEP=3; echo "[3/${INSTALL_TOTAL}] ${INSTALL_STEPS[2].label} ..."`,
    `echo '${b64}' | base64 -d > "$DIR/ega-host.mjs"`,
    `echo "  ok — $DIR/ega-host.mjs"`,
    `EGA_STEP=4; echo "[4/${INSTALL_TOTAL}] ${INSTALL_STEPS[3].label} ..."`,
    // Unquoted heredoc bakes $NODE_BIN + $PATH: Chrome started from the macOS Dock passes launchd's PATH, which has no node.
    `cat > "$DIR/ega-host.sh" <<LS`,
    `#!/usr/bin/env bash`,
    `export PATH="$PATH:\\$PATH"`,
    `NODE_BIN="$NODE_BIN"`,
    `[ -x "\\$NODE_BIN" ] || NODE_BIN=node`,
    `exec "\\$NODE_BIN" "\\$(dirname "\\$0")/ega-host.mjs" "\\$@"`,
    `LS`,
    `chmod +x "$DIR/ega-host.sh"`,
    `echo "  ok — $DIR/ega-host.sh"`,
    `EGA_STEP=5; echo "[5/${INSTALL_TOTAL}] ${INSTALL_STEPS[4].label} ..."`,
    `MANIFEST="$DIR/com.ega.host.json"`,
    `ORIGIN="chrome-extension://$EGA_EXT_ID/"`,
    `HOST_PATH="$DIR/ega-host.sh"`,
    `EGA_MANIFEST="$MANIFEST" EGA_ORIGIN="$ORIGIN" EGA_HOST_PATH="$HOST_PATH" node -e '`,
    `const fs = require("fs");`,
    `const file = process.env.EGA_MANIFEST;`,
    `const origin = process.env.EGA_ORIGIN;`,
    `const hostPath = process.env.EGA_HOST_PATH;`,
    `let m = { name:"com.ega.host", description:"Ega native host", path:hostPath, type:"stdio", allowed_origins: [] };`,
    `try { const prev = JSON.parse(fs.readFileSync(file, "utf8"));`,
    `  if (Array.isArray(prev.allowed_origins)) m.allowed_origins = prev.allowed_origins; } catch {}`,
    `if (!m.allowed_origins.includes(origin)) m.allowed_origins.push(origin);`,
    `m.path = hostPath;`,
    `fs.writeFileSync(file, JSON.stringify(m, null, 2));`,
    `console.log("  ok — " + file + " (" + m.allowed_origins.length + " origin(s))");`,
    `'`,
    `EGA_STEP=6; echo "[6/${INSTALL_TOTAL}] ${INSTALL_STEPS[5].label} ..."`,
    `for DEST in ${destList.join(' ')}; do`,
    `  mkdir -p "$DEST"`,
    `  cp "$MANIFEST" "$DEST/com.ega.host.json"`,
    `  echo "  registered $DEST"`,
    `done`,
    `echo "  ok"`,
    `echo ""`,
    `echo "install complete. Click Recheck in the Backends tab (restart your browser if it does not appear)."`,
    ')',
    '',
  ].join('\n');
}

export function unixInstallerFile(os, extId, hostSource) {
  return ['#!/usr/bin/env bash', unixInstallCommand(os, extId, hostSource)].join('\n');
}

export function windowsUninstallCommand() {
  return [
    `foreach ($base in 'HKCU:\\Software\\Google\\Chrome','HKCU:\\Software\\Microsoft\\Edge','HKCU:\\Software\\BraveSoftware\\Brave-Browser','HKCU:\\Software\\Chromium') {`,
    `  $key = Join-Path $base 'NativeMessagingHosts\\com.ega.host'`,
    `  if (Test-Path $key) { Remove-Item -Recurse -Force $key }`,
    `}`,
    `Remove-Item -Recurse -Force (Join-Path $env:LOCALAPPDATA 'Ega') -ErrorAction SilentlyContinue`,
    `Write-Host "Ega native host uninstalled."`,
    '',
  ].join('\n');
}

export function unixUninstallCommand(os) {
  const base = os === 'macos' ? '"$HOME/Library/Application Support"' : '"$HOME/.config"';
  return [
    `for P in ${base}/Google/Chrome ${base}/Chromium ${base}/BraveSoftware/Brave-Browser ${base}/Microsoft\\ Edge ${base}/google-chrome ${base}/chromium ${base}/microsoft-edge; do`,
    `  rm -f "$P/NativeMessagingHosts/com.ega.host.json" 2>/dev/null`,
    `done`,
    `rm -rf "$HOME/.ega"`,
    `echo "Ega native host uninstalled."`,
    '',
  ].join('\n');
}
