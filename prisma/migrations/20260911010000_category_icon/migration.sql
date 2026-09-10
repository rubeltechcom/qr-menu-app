-- An emoji the owner chooses for a category, shown in the storefront's
-- category strip.
--
-- Nullable with no default on purpose: null means "not chosen", and the
-- storefront falls back to guessing an icon from the category name, so
-- every menu created before this column existed keeps rendering exactly
-- as it did.
ALTER TABLE "categories" ADD COLUMN "icon" TEXT;
