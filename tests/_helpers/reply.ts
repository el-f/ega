/** A fake model's JSON reply under the main key the prompt's format asks for, as a real model answers. */
export function fakeReply(
  system: string,
  main: string,
  rest: Record<string, unknown> = {},
): string {
  const key = /return json only: \{"(\w+)"/i.exec(system)?.[1] ?? 'translation';
  return JSON.stringify({ [key]: main, ...rest });
}
