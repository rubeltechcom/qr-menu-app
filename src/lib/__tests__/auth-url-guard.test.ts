import { describe, expect, it } from "vitest";
import { stripLoopbackAuthUrl } from "../auth-url";

/**
 * Ignoring a loopback AUTH_URL on a deployed server.
 *
 * Auth.js overrides the request's URL whenever AUTH_URL is set, and
 * builds every OAuth redirect_uri from it. A production deployment that
 * inherited `http://localhost:3000` therefore completes a Google
 * sign-in and then sends the user to their own machine — which is
 * exactly what happened live, and is invisible until the last hop.
 */

const LIVE = "https://menu.example.com";

function run(
  environment: Record<string, string | undefined>,
  appUrl = LIVE,
): Record<string, string | undefined> {
  const copy = { ...environment };
  stripLoopbackAuthUrl(copy, appUrl, () => {});
  return copy;
}

describe("stripLoopbackAuthUrl", () => {
  it("drops a localhost AUTH_URL on a deployed server", () => {
    expect(run({ AUTH_URL: "https://localhost:3000" }).AUTH_URL).toBeUndefined();
  });

  it("drops NEXTAUTH_URL too, which Auth.js also honours", () => {
    expect(run({ NEXTAUTH_URL: "http://localhost:3000" }).NEXTAUTH_URL).toBeUndefined();
  });

  it("drops 127.0.0.1 as well as the name localhost", () => {
    expect(run({ AUTH_URL: "http://127.0.0.1:3000" }).AUTH_URL).toBeUndefined();
  });

  it("keeps a real AUTH_URL, which an operator may set deliberately", () => {
    expect(run({ AUTH_URL: "https://auth.example.com" }).AUTH_URL).toBe(
      "https://auth.example.com",
    );
  });

  it("leaves a developer's machine alone", () => {
    // Running locally, a loopback AUTH_URL is correct.
    const result = run({ AUTH_URL: "http://localhost:3000" }, "http://localhost:3000");
    expect(result.AUTH_URL).toBe("http://localhost:3000");
  });

  it("drops an unparseable value rather than leaving it to fail obscurely", () => {
    expect(run({ AUTH_URL: "not a url" }).AUTH_URL).toBeUndefined();
  });

  it("does nothing when neither variable is set", () => {
    expect(run({})).toEqual({});
  });

  it("warns, so the mistake is visible in the deploy logs", () => {
    const messages: string[] = [];
    const environment = { AUTH_URL: "https://localhost:3000" };
    stripLoopbackAuthUrl(environment, LIVE, (m) => messages.push(m));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("AUTH_URL");
    expect(messages[0]).toContain(LIVE);
  });
});
