import { describe, expect, it } from "vitest";
import { appVersion } from "../app-version";

/**
 * Reporting which version is running.
 *
 * It reported "unknown" on every deployed container, because it relied
 * on a Docker build arg and Coolify does not pass one — so the one
 * question it exists to answer ("did my deploy go out?") could not be
 * answered from the running app.
 */

describe("appVersion", () => {
  it("reports a real version rather than 'unknown'", () => {
    // In this repo it falls through to package.json, which is the same
    // path a developer running `next dev` takes.
    const version = appVersion();
    expect(version).not.toBe("unknown");
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is stable across calls", () => {
    // Cached: the health check may run every few seconds, and the answer
    // cannot change without a restart.
    expect(appVersion()).toBe(appVersion());
  });
});
