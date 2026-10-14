import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pins src/ to the destination table in docs/PRIVACY.md — a new network call must update the policy first.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = path.join(ROOT, 'src');

const files = readdirSync(SRC, { recursive: true, withFileTypes: true })
  .filter((e) => e.isFile() && /\.(?:ts|svelte)$/.test(e.name))
  .map((e) => path.join(e.parentPath, e.name));

const rel = (abs: string): string => path.relative(ROOT, abs).replace(/\\/g, '/');
const filesMatching = (re: RegExp): string[] =>
  files
    .filter((f) => re.test(readFileSync(f, 'utf8')))
    .map(rel)
    .sort();

// Every entry is a row in the policy's destination table.
const FETCH_ALLOWLIST = [
  'src/shared/backends/', // the registered providers, plus their /models discovery
  'src/background/router-image.ts', // the image download for OCR
  'src/options/components/OllamaBackendRow.svelte', // the loopback status probe
];

describe('privacy: every network path is a documented destination', () => {
  it('nothing touches chrome.storage.sync', () => {
    expect(filesMatching(/storage\.sync\b/)).toEqual([]);
  });

  it('every fetch( in src/ is in the allowlist', () => {
    const outside = filesMatching(/\bfetch\(/).filter(
      (f) => !FETCH_ALLOWLIST.some((prefix) => f.startsWith(prefix)),
    );
    expect(outside).toEqual([]);
  });

  it('the speech recognizer is the only non-fetch network path, and it lives in the composer', () => {
    expect(filesMatching(/SpeechRecognition/)).toEqual([
      'src/sidepanel/conversation/InputRow.svelte',
    ]);
  });

  it('no WebSocket, EventSource, XMLHttpRequest, sendBeacon or navigator.sendBeacon', () => {
    expect(
      filesMatching(/\b(?:new WebSocket|new EventSource|XMLHttpRequest|sendBeacon)\b/),
    ).toEqual([]);
  });
});
