import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import hostSource from '../../../native-host/ega-host.mjs?raw';
import protocolClaude from '../../../native-host/lib/protocol-claude.mjs?raw';
import protocolCodex from '../../../native-host/lib/protocol-codex.mjs?raw';
import cliSession from '../../../native-host/lib/cli-session.mjs?raw';
import classifyCliError from '../../../native-host/lib/classify-cli-error.mjs?raw';
import { bundledHostSource } from '@/options/nativeHostInstall';

// Nothing else in the gate parses the spliced bundle, so a broken splice ships straight to the user.

const sources = [hostSource, protocolClaude, protocolCodex, cliSession, classifyCliError];

describe('bundleHostSource — the host source users actually install', () => {
  it('parses as an ES module', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'ega-host-bundle-')), 'ega-host.mjs');
    writeFileSync(file, bundledHostSource);
    expect(() => execFileSync(process.execPath, ['--check', file])).not.toThrow();
  });

  it('keeps no relative import, which would crash the installed host on its first ping', () => {
    expect(bundledHostSource).not.toMatch(/^import\s[^'"]*['"]\.\.?\//m);
  });

  it('declares every binding whose relative import it stripped', () => {
    const imported = sources
      .flatMap((src) => [...src.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]\.[^'"]+['"]/gm)])
      .flatMap((m) =>
        (m[1] ?? '').split(',').map(
          (n) =>
            n
              .trim()
              .split(/\s+as\s+/)
              .pop() ?? '',
        ),
      );
    const undeclared = [...new Set(imported)].filter(
      (name) => !new RegExp(`(?:function|const|let|class)\\s+${name}\\b`).test(bundledHostSource),
    );
    expect(
      undeclared,
      'each sibling module ega-host.mjs imports must be passed to bundleHostSource and inlined, or the installed host throws ReferenceError at runtime',
    ).toEqual([]);
  });
});
