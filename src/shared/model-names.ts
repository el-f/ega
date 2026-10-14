/** A raw model id as people say it: "claude-haiku-4-5-20251001" reads "Claude Haiku 4.5". An id no rule knows comes back as is, minus a vendor prefix and a date tail. */
export function modelDisplayName(id: string): string {
  const bare = (id.split('/').pop() ?? id)
    .replace(/-latest$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{8}$/, '');
  const claude = /^claude-(?:(\d+(?:-\d+)?)-)?(haiku|sonnet|opus)(?:-(\d+(?:-\d+)?))?$/.exec(bare);
  if (claude) {
    const [, before, family = '', after] = claude;
    const name = family.charAt(0).toUpperCase() + family.slice(1);
    if (before !== undefined) return `Claude ${before.replace('-', '.')} ${name}`;
    return after !== undefined ? `Claude ${name} ${after.replace('-', '.')}` : `Claude ${name}`;
  }
  const gpt = /^gpt-([\w.]+)(?:-(mini|nano|turbo))?$/.exec(bare);
  if (gpt) return `GPT-${gpt[1] ?? ''}${gpt[2] !== undefined ? ` ${gpt[2]}` : ''}`;
  if (bare.startsWith('gemini-')) {
    return bare
      .split('-')
      .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ');
  }
  return bare;
}
