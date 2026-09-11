"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardTenant } from "@/lib/require-dashboard-tenant";
import { isOwnedImageUrl } from "@/modules/storage/upload.service";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/modules/i18n/locales";

export interface BrandingFormState {
  ok?: boolean;
  error?: string;
}

/**
 * A restaurant's own branding and languages.
 *
 * Written with the raw client because `tenants` is the row being
 * updated and the tenant-scoped extension filters by it — the id comes
 * from the caller's verified membership, never from the form.
 */
export async function saveBrandingAction(
  tenantSlug: string,
  _prevState: BrandingFormState,
  formData: FormData,
): Promise<BrandingFormState> {
  const { db, tenant } = await requireDashboardTenant(tenantSlug);

  const rawLogo = formData.get("logoUrl");
  const logoUrl = typeof rawLogo === "string" && rawLogo ? rawLogo : null;

  // The logo goes through the same ownership check as every other
  // uploaded image: a URL pointing anywhere else must not be stored.
  if (logoUrl && !isOwnedImageUrl(logoUrl, tenant.id)) {
    return { error: "That logo isn't one of your uploads." };
  }

  // Only languages the app actually has strings for. An unknown code
  // would render a menu of empty buttons.
  const locales = formData
    .getAll("locales")
    .filter((value): value is string => typeof value === "string")
    .filter(isSupportedLocale);

  if (locales.length === 0) {
    return { error: "Choose at least one language." };
  }

  const rawDefault = formData.get("defaultLocale");
  const requestedDefault =
    typeof rawDefault === "string" && isSupportedLocale(rawDefault)
      ? rawDefault
      : DEFAULT_LOCALE;

  // The default has to be one of the offered languages, or a guest
  // would fall back to a language the restaurant does not serve.
  const defaultLocale = locales.includes(requestedDefault)
    ? requestedDefault
    : locales[0]!;

  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";

  try {
    // The tenant-scoped client: it can only ever reach the caller's own
    // restaurant, so the id below cannot be pointed at anyone else's.
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        logoUrl,
        // Stored in the order chosen, so the storefront's language
        // picker opens on the restaurant's own language.
        locales,
        defaultLocale,
        ...(name ? { name } : {}),
      },
    });
  } catch (error) {
    console.error("[settings] failed to save branding", error);
    return { error: "Could not save those settings. Please try again." };
  }

  revalidatePath(`/dashboard/${tenantSlug}/settings`);
  return { ok: true };
}
