// Checks that every `uses: owner/repo@<sha> # <tag>` pin is the sha <tag> points at today.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const WORKFLOWS = path.resolve('.github/workflows');
const API = 'https://api.github.com';
const TIMEOUT_MS = 10_000;

const PINNED = /^\s*(?:-\s*)?uses:\s*([\w.-]+\/[\w.-]+)@([0-9a-f]{40})\s*(?:#\s*(\S+))?/;
const UNPINNED = /^\s*(?:-\s*)?uses:\s*([\w.-]+\/[\w.-]+)@(?![0-9a-f]{40}\b)(\S+)/;

function collectPins() {
  const pins = [];
  const errors = [];
  for (const file of readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f))) {
    const lines = readFileSync(path.join(WORKFLOWS, file), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const where = `${path.posix.join('.github/workflows', file)}:${i + 1}`;
      const pinned = PINNED.exec(line);
      if (pinned) {
        const [, repo, sha, tag] = pinned;
        if (tag) pins.push({ repo, sha, tag, where });
        else
          errors.push(
            `${where}  ${repo}@${sha} has no \`# <tag>\` comment — nothing to check it against`,
          );
        return;
      }
      const loose = UNPINNED.exec(line);
      if (loose && !loose[2].startsWith('./')) {
        errors.push(`${where}  ${loose[1]}@${loose[2]} is not pinned to a 40-char sha`);
      }
    });
  }
  return { pins, errors };
}

async function api(url) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'ega-lint-actions' };
  const token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** @returns {Promise<{ sha: string } | { skip: string } | { missing: true }>} */
async function resolveTag(repo, tag) {
  let res;
  try {
    res = await api(`${API}/repos/${repo}/git/ref/tags/${tag}`);
  } catch (e) {
    return { skip: `${repo}@${tag}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.status === 404) return { missing: true };
  if (res.status !== 200) return { skip: `${repo}@${tag}: HTTP ${res.status}` };
  const ref = await res.json();
  if (ref.object?.type !== 'tag') return { sha: ref.object?.sha };
  const deref = await api(ref.object.url);
  if (deref.status !== 200)
    return { skip: `${repo}@${tag}: HTTP ${deref.status} on the tag object` };
  return { sha: (await deref.json()).object?.sha };
}

const { pins, errors } = collectPins();
const skipped = [];
const seen = new Map();

for (const pin of pins) {
  const key = `${pin.repo}@${pin.tag}`;
  if (!seen.has(key)) seen.set(key, await resolveTag(pin.repo, pin.tag));
  const got = seen.get(key);
  if (got.skip) {
    skipped.push(got.skip);
  } else if (got.missing) {
    errors.push(`${pin.where}  ${pin.repo}: tag ${pin.tag} does not exist upstream`);
  } else if (got.sha !== pin.sha) {
    errors.push(`${pin.where}  ${pin.repo} ${pin.tag} is ${got.sha}, pinned ${pin.sha}`);
  }
}

for (const e of errors) console.error(`✗ ${e}`);
if (skipped.length) {
  console.warn(`⚠ ${skipped.length} pin(s) unverified — the GitHub API did not answer:`);
  for (const s of new Set(skipped)) console.warn(`  ${s}`);
}
if (errors.length) {
  console.error(`\n${errors.length} bad action pin(s).`);
  process.exit(1);
}
console.log(`✓ ${pins.length - skipped.length}/${pins.length} action pins match their tag.`);
