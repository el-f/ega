/** "1 entry", "2 entries": the number with the word in the right form. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
