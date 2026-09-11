import type { TenantPrismaClient } from "@/server/db/tenant-client";

/**
 * Translations of a restaurant's own content — dish names, descriptions
 * and category names.
 *
 * Separate from dictionary.ts, which holds the app's own interface
 * strings. Those we can ship; these we cannot, because we do not know in
 * advance what a restaurant will sell.
 *
 * Stored one row per (entity, field, locale) rather than as columns on
 * the menu tables. Adding a language then costs nothing structurally,
 * and a restaurant that offers one language carries no empty columns.
 */

/** What can be translated. Kept narrow so a typo cannot invent a type. */
export const TRANSLATABLE_TYPES = ["menuItem", "category"] as const;
export type TranslatableType = (typeof TRANSLATABLE_TYPES)[number];

export const TRANSLATABLE_FIELDS = ["name", "description"] as const;
export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

export interface TranslationRow {
  entityType: string;
  entityId: string;
  field: string;
  locale: string;
  value: string;
}

/**
 * Every translation a menu needs, in one query.
 *
 * One query for the whole menu rather than one per dish: a menu with
 * sixty items would otherwise cost sixty round trips on a page that has
 * a 1.5s budget on 4G.
 */
export async function listTranslationsForEntities(
  db: TenantPrismaClient,
  entityIds: string[],
  locale: string,
): Promise<TranslationRow[]> {
  if (entityIds.length === 0) return [];

  return db.translation.findMany({
    where: { entityId: { in: entityIds }, locale },
    select: {
      entityType: true,
      entityId: true,
      field: true,
      locale: true,
      value: true,
    },
  });
}

/**
 * Every locale's translations for a set of entities, for the owner's
 * editor — which shows all languages at once rather than one at a time.
 */
export async function listAllTranslationsForEntities(
  db: TenantPrismaClient,
  entityIds: string[],
): Promise<TranslationRow[]> {
  if (entityIds.length === 0) return [];

  return db.translation.findMany({
    where: { entityId: { in: entityIds } },
    select: {
      entityType: true,
      entityId: true,
      field: true,
      locale: true,
      value: true,
    },
  });
}

/** Every locale's translations for one entity, for the owner's editor. */
export async function listTranslationsForEntity(
  db: TenantPrismaClient,
  entityType: TranslatableType,
  entityId: string,
): Promise<TranslationRow[]> {
  return db.translation.findMany({
    where: { entityType, entityId },
    select: {
      entityType: true,
      entityId: true,
      field: true,
      locale: true,
      value: true,
    },
  });
}

/**
 * Saves one field's translation.
 *
 * A blank value deletes the row rather than storing an empty string, so
 * clearing a translation falls back to the original language instead of
 * blanking the dish on the menu.
 */
export async function saveTranslation(
  db: TenantPrismaClient,
  tenantId: string,
  input: {
    entityType: TranslatableType;
    entityId: string;
    field: TranslatableField;
    locale: string;
    value: string;
  },
): Promise<void> {
  const value = input.value.trim();

  const where = {
    tenantId_entityType_entityId_field_locale: {
      tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      locale: input.locale,
    },
  };

  if (value === "") {
    // deleteMany, not delete: a row that was never there is not an
    // error, and the owner clearing an empty box should be a no-op.
    await db.translation.deleteMany({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        field: input.field,
        locale: input.locale,
      },
    });
    return;
  }

  await db.translation.upsert({
    where,
    create: {
      tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      field: input.field,
      locale: input.locale,
      value,
      // Typed by the owner, so not machine output — this is what stops
      // a future auto-translation pass overwriting their wording.
      isMachineTranslated: false,
    },
    update: { value, isMachineTranslated: false },
  });
}
