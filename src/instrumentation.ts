/**
 * Runs once when the server starts, before it accepts a request.
 *
 * Used for the storage preflight. An upload directory that is missing,
 * unwritable, or — the classic Docker mistake — not actually a mounted
 * volume is a deployment error, and the only useful moment to discover
 * it is at startup. The alternative is a 500 the first time a restaurant
 * tries to add a photo, or worse: uploads that work perfectly until the
 * next redeploy silently erases every one of them.
 */
export async function register() {
  // Only the Node.js server runtime has a filesystem; the edge runtime
  // loads this file too and must skip it.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Platform settings first: the payment providers read them
  // synchronously, so the snapshot has to be warm before any request
  // is served. A failure here is logged and falls back to environment
  // variables rather than stopping the server.
  const { loadSettings } = await import("@/modules/platform/settings.service");
  await loadSettings();

  const { assertStorageWritable, describeStorage } = await import("@/modules/storage/registry");

  try {
    await assertStorageWritable();
    const storage = describeStorage();
    console.log(`[storage] ${storage.displayName} ready (${storage.detail})`);
  } catch (error) {
    // Loud, and fatal in production: a server that cannot store uploads
    // should not quietly accept traffic and fail later.
    console.error(`[storage] ${(error as Error).message}`);
    if (process.env.NODE_ENV === "production") throw error;
  }
}
