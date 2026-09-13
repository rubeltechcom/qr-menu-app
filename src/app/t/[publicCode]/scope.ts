/**
 * Which storefront a guest is looking at.
 *
 * Two ways in, and the difference runs through the whole surface:
 *
 *   * A table QR (/t/<publicCode>) identifies one table in one
 *     restaurant. The table is known before the menu renders, and an
 *     order is filed against it.
 *
 *   * A shop link (/<slug>) identifies the shop and nothing more. A
 *     grocer, a furniture showroom, a tea stall with one counter has no
 *     tables at all; there is nobody to seat and nothing to scan.
 *
 * Modelling that as a discriminated union rather than `publicCode?: string`
 * is what stops the two blurring together (PROMPT.md §12.3). A shop
 * cannot accidentally be asked which table to deliver to, and a table
 * cannot lose the code that identifies it.
 */
export type StorefrontScope =
  | { kind: "table"; publicCode: string }
  | { kind: "shop"; slug: string };

/**
 * The localStorage namespace for one storefront.
 *
 * Everything the guest accumulates — cart, language, favourites, the
 * order they are waiting on — hangs off this, and a phone that visits
 * two shops must keep two of each.
 *
 * The `table:` / `shop:` prefix is load-bearing. Keying on the bare
 * identifier would have worked for as long as tables were the only way
 * in: a publicCode is unique across the platform. A slug is unique too,
 * but the two namespaces are not unique *against each other*, and a
 * shop whose slug happened to match some table's code would silently
 * share that table's cart. The prefix costs nothing and makes the
 * collision impossible rather than unlikely.
 */
export function scopeKey(scope: StorefrontScope): string {
  return scope.kind === "table" ? `table:${scope.publicCode}` : `shop:${scope.slug}`;
}
