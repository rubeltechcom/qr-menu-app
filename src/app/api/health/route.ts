import { rawPrisma } from "@/server/db/client";
import { appVersion } from "@/lib/app-version";

/**
 * Liveness and readiness for the deployment platform.
 *
 * Coolify keeps the previous container serving until the new one reports
 * healthy, so this is what makes a bad deploy roll back instead of
 * taking the site down. It checks the database because an app that
 * cannot reach Postgres is not ready to take orders, however well it
 * answers HTTP.
 *
 * Also reports the running version, which is the quickest way to answer
 * "did my deploy actually go out?" without opening a terminal.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const version = appVersion();

  try {
    // Cheapest possible round trip: proves the connection works without
    // reading a row or depending on any particular table existing.
    await rawPrisma.$queryRaw`SELECT 1`;
  } catch {
    // Deliberately vague to the caller — a health endpoint is public,
    // and a connection string in the response would be a gift.
    return Response.json(
      { status: "unhealthy", version, database: "unreachable" },
      { status: 503 },
    );
  }

  return Response.json({ status: "ok", version, database: "ok" });
}
