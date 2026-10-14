// Reads the `reg export` snapshots scripts/live-test-install.mjs takes before it runs the installer.

/**
 * The manifest path a host key points at when that path is inside a live-test temp dir. A killed
 * earlier run leaves the key like that, and restoring the snapshot would keep the host broken.
 * @param {Buffer} regFile a `reg export` file (UTF-16LE) @returns {string | null}
 */
export function livetestManifestPath(regFile) {
  const m = /^@="([^"\r\n]*ega-livetest-[^"\r\n]*)"/im.exec(regFile.toString('utf16le'));
  return m ? m[1].replaceAll('\\\\', '\\') : null;
}
