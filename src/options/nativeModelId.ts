/** A copy of the host's `MODEL_ID_OK` (native-host/lib/cli-session.mjs); a parity test keeps them equal. */
export const NATIVE_MODEL_ID_RE = /^\w[\w.:@/-]{0,199}(?:\[\w{1,16}\])?$/;

/** Why the host refuses this Model id, or null when it passes it on ('' means the CLI default). */
export function nativeModelIdError(id: string): string | null {
  if (id === '' || NATIVE_MODEL_ID_RE.test(id)) return null;
  return 'Ega cannot pass this model id to the CLI. Start with a letter or digit, then use letters, digits and . _ - / : @, with an optional suffix such as [1m].';
}
