import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Which version of the app is running.
 *
 * The quickest way to answer "did my deploy actually go out?" without
 * opening a terminal, so it is worth being reliable.
 *
 * Read from a file the Docker build writes, rather than a build arg:
 * Coolify does not pass --build-arg, so an ARG-based version always fell
 * back to its default and every container reported "unknown". The
 * environment variable is still honoured first, for a deployment that
 * sets one deliberately.
 *
 * Cached, because this is read on a health check that may run every few
 * seconds and the answer cannot change without a restart.
 */

let cached: string | null = null;

export function appVersion(): string {
  if (cached) return cached;

  if (process.env.APP_VERSION) {
    cached = process.env.APP_VERSION;
    return cached;
  }

  try {
    cached = readFileSync(path.join(process.cwd(), ".version"), "utf8").trim();
    if (cached) return cached;
  } catch {
    // Not a container build — fall through to package.json below.
  }

  try {
    const pkg = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    cached = (JSON.parse(pkg) as { version?: string }).version ?? "unknown";
  } catch {
    cached = "unknown";
  }

  return cached;
}
