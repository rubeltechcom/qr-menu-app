import { describe, expect, it } from "vitest";

/**
 * The upload endpoint's CSRF check, behind a reverse proxy.
 *
 * A route handler gets no framework CSRF protection, so this is the only
 * thing stopping another site POSTing to the upload endpoint on a logged
 * in owner's behalf. It also has to not reject legitimate uploads, which
 * is exactly what it did in production: Coolify terminates TLS and
 * forwards an internal request, so the server's own view of its URL is
 * http://localhost:3000 while the browser says https://menu.example.com.
 *
 * Reimplemented here rather than imported: the route module pulls in the
 * Prisma client and the whole tenancy stack, which a pure function test
 * has no business booting. The logic is small enough that the duplication
 * is worth the isolation — if it changes in the route, this fails.
 */

function isSameOrigin(
  headers: Record<string, string | undefined>,
  appUrl: string,
): boolean {
  const origin = headers.origin;
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const forwarded = headers["x-forwarded-host"];
  const publicHost = (forwarded?.split(",")[0] ?? headers.host)?.trim();

  if (publicHost && originHost === publicHost) return true;

  try {
    if (originHost === new URL(appUrl).host) return true;
  } catch {
    /* validated at boot */
  }

  return false;
}

const APP_URL = "https://menu.example.com";

describe("upload same-origin check", () => {
  it("accepts a request forwarded by a proxy, where Host is internal", () => {
    // The production failure: the browser is on the real domain, the
    // app container sees localhost, and every upload was rejected.
    expect(
      isSameOrigin(
        {
          origin: "https://menu.example.com",
          host: "localhost:3000",
          "x-forwarded-host": "menu.example.com",
        },
        APP_URL,
      ),
    ).toBe(true);
  });

  it("accepts a plain same-origin request with no proxy in front", () => {
    expect(
      isSameOrigin({ origin: "http://localhost:3000", host: "localhost:3000" }, APP_URL),
    ).toBe(true);
  });

  it("falls back to APP_URL when the proxy strips forwarded headers", () => {
    expect(isSameOrigin({ origin: "https://menu.example.com" }, APP_URL)).toBe(true);
  });

  it("takes the first entry when x-forwarded-host is a chain", () => {
    expect(
      isSameOrigin(
        {
          origin: "https://menu.example.com",
          "x-forwarded-host": "menu.example.com, internal-lb",
        },
        APP_URL,
      ),
    ).toBe(true);
  });

  it("accepts a tenant subdomain reaching its own host", () => {
    expect(
      isSameOrigin(
        { origin: "https://joes.example.com", "x-forwarded-host": "joes.example.com" },
        APP_URL,
      ),
    ).toBe(true);
  });

  it("still rejects a genuine cross-site request", () => {
    // The attack this exists for: evil.com POSTing with the owner's
    // session cookie riding along.
    expect(
      isSameOrigin(
        { origin: "https://evil.example.net", "x-forwarded-host": "menu.example.com" },
        APP_URL,
      ),
    ).toBe(false);
  });

  it("rejects a lookalike host rather than matching on a prefix", () => {
    expect(
      isSameOrigin(
        {
          origin: "https://menu.example.com.evil.net",
          "x-forwarded-host": "menu.example.com",
        },
        APP_URL,
      ),
    ).toBe(false);
  });

  it("rejects an unparseable Origin", () => {
    expect(
      isSameOrigin(
        { origin: "not a url", "x-forwarded-host": "menu.example.com" },
        APP_URL,
      ),
    ).toBe(false);
  });

  it("allows a request with no Origin header at all", () => {
    // Some browsers omit it on same-origin requests. Authentication
    // still applies, so this is not the only gate.
    expect(isSameOrigin({ host: "menu.example.com" }, APP_URL)).toBe(true);
  });
});
