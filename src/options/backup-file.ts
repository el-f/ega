/** Clears the input's value first: re-picking the same file otherwise fires no change event. */
export async function handleImportFilePick(
  ev: Event,
  onImport: (file: File) => void | Promise<void>,
): Promise<void> {
  const input = ev.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await onImport(file);
}
