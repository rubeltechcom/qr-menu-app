import type { TranslationRow } from "./translation.repository";

/**
 * Applying a menu's translations, as pure data.
 *
 * Kept free of Prisma so the rule that actually matters — what happens
 * when a translation is missing — can be tested directly rather than
 * through a database.
 */

export interface TranslationMap {
  /** The translated value, or the original when there is none. */
  get(entityId: string, field: string, original: string): string;
  /** Whether anything at all was translated, for the owner's editor. */
  readonly size: number;
}

function keyFor(entityId: string, field: string): string {
  return `${entityId}:${field}`;
}

export function buildTranslationMap(rows: TranslationRow[]): TranslationMap {
  const values = new Map<string, string>();

  for (const row of rows) {
    // A blank value must never win: an empty dish name is worse than an
    // untranslated one, and rows are only supposed to be deleted rather
    // than blanked, so this guards against bad data either way.
    const value = row.value.trim();
    if (value) values.set(keyFor(row.entityId, row.field), value);
  }

  return {
    get(entityId, field, original) {
      return values.get(keyFor(entityId, field)) ?? original;
    },
    get size() {
      return values.size;
    },
  };
}
