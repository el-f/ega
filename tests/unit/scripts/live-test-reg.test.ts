import { describe, it, expect } from 'vitest';
import { livetestManifestPath } from '../../../scripts/lib/live-test-reg.mjs';

// The layout `reg export` writes: UTF-16LE with a BOM, CRLF lines, backslashes doubled in values.
const regExport = (manifest: string): Buffer =>
  Buffer.from(
    '\ufeffWindows Registry Editor Version 5.00\r\n\r\n' +
      '[HKEY_CURRENT_USER\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.ega.host]\r\n' +
      `@="${manifest.replaceAll('\\', '\\\\')}"\r\n\r\n`,
    'utf16le',
  );

describe('livetestManifestPath', () => {
  it('names the manifest a killed live-test run left the key pointing at', () => {
    const dead =
      'C:\\Users\\me\\AppData\\Local\\Temp\\ega-livetest-Ab12\\LocalAppData\\Ega\\com.ega.host.json';
    expect(livetestManifestPath(regExport(dead))).toBe(dead);
  });

  it('passes a real install', () => {
    const real = 'C:\\Users\\me\\AppData\\Local\\Ega\\com.ega.host.json';
    expect(livetestManifestPath(regExport(real))).toBeNull();
  });

  it('passes an empty snapshot', () => {
    expect(livetestManifestPath(Buffer.alloc(0))).toBeNull();
  });
});
