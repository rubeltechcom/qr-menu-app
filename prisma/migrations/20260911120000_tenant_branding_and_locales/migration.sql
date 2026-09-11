-- A restaurant's own logo, and the languages it offers its guests.
--
-- Both are nullable or defaulted, so every existing tenant is
-- unaffected: no logo means the storefront falls back to showing the
-- name alone, and a tenant with no locales set behaves exactly as
-- before — English only.
--
-- `locales` is an array rather than a single column because a
-- restaurant may offer several, ordered, with the first as its default.
-- `defaultLocale` stays as the fallback for a guest whose chosen
-- language is not on the list.
ALTER TABLE "tenants" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "tenants" ADD COLUMN "locales" TEXT[] NOT NULL DEFAULT ARRAY['en'];

-- Existing restaurants keep whatever single language they were created
-- with, rather than being silently switched to English.
UPDATE "tenants" SET "locales" = ARRAY["defaultLocale"] WHERE "defaultLocale" <> 'en';
