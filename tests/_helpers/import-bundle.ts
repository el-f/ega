import { importBundle, type ImportBundle, type ImportOptions } from '@/shared/storage/backup';
import { parseImportBundle } from '@/options/import-bundle';

/** The path the app takes: the options parser sniffs the root key, then storage writes the plan.
 *  `kind` is the dispatch the caller expects, so a wrong sniff fails the test instead of writing. */
export async function importAs<K extends ImportBundle['kind']>(
  raw: unknown,
  kind: K,
  opts?: ImportOptions,
): Promise<Extract<ImportBundle, { kind: K }>> {
  const plan = await parseImportBundle(raw);
  if (plan.kind !== kind) throw new Error(`expected a ${kind} bundle, got ${plan.kind}`);
  await importBundle(plan, opts);
  return plan as Extract<ImportBundle, { kind: K }>;
}
