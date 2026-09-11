-- Two unrelated additions, applied together because both land with the
-- same release.

-- 1. Platform settings the operator edits from /admin instead of by
--    changing environment variables and redeploying.
--
--    Values are stored as strings, exactly like the environment
--    variables they replace, and parsed by the settings module. Secret
--    values are encrypted before they reach this table, so a database
--    dump does not hand over live payment credentials.
--
--    Deliberately NOT row-level-secured: this is platform-wide
--    configuration with no tenantId, read by the server at boot before
--    any tenant context exists. Access is controlled by the /admin
--    superadmin guard instead.
CREATE TABLE "platform_settings" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "isSecret"  BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,

  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- 2. One short video per dish, shown ahead of its photos.
--
--    Nullable, so every existing menu item is unaffected. Kept separate
--    from the `images` array rather than mixed into it, so a consumer
--    never has to guess from a file extension whether a URL needs a
--    <video> element.
ALTER TABLE "menu_items" ADD COLUMN "videoUrl" TEXT;
