/**
 * The product's name, in one place.
 *
 * These are the built-in defaults. An operator running their own
 * install can override the name from /admin — `platform.name` — and
 * anything rendered on the server should prefer that (see
 * `getSetting("platform.name")`). These constants are the fallback, and
 * what client components use, since they cannot read settings.
 *
 * Keeping them here rather than typed into a dozen files is what makes
 * a rename one edit instead of a search-and-replace that misses the
 * manifest, the email sender and the page titles.
 */

/** The name on its own: headers, logos, the app switcher. */
export const BRAND_NAME = "Scanly";

/**
 * The name with what it does, for a first impression — a browser tab on
 * a cold visit, or an install prompt where the icon alone is not enough
 * to say what this is.
 */
export const BRAND_FULL_NAME = "Scanly — QR menus & ordering";

/** One line for a meta description or an app-store listing. */
export const BRAND_TAGLINE = "Let customers scan, browse and order from their own phone.";
