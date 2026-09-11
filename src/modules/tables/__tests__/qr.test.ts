import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The URL a table's QR code encodes.
 *
 * Worth testing carefully because it is the one output that gets
 * printed onto physical stickers and stuck to tables. A wrong URL here
 * is not a bug someone can refresh past — it is a reprint, for every
 * table in every restaurant.
 *
 * env is read at module load, so each case re-imports with its own
 * environment rather than trying to mutate a frozen object.
 */

async function urlWith(
  environment: { APP_URL: string; APP_DOMAIN?: string },
  publicCode: string,
  options?: { tenantSlug?: string; customDomain?: string | null },
) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ env: environment }));
  const { tableStorefrontUrl } = await import("../qr");
  return tableStorefrontUrl(publicCode, options);
}

afterEach(() => {
  vi.doUnmock("@/lib/env");
  vi.resetModules();
});

describe("tableStorefrontUrl", () => {
  it("uses a branded path when no subdomain is configured", async () => {
    // The default deployment: one hostname, the restaurant's name still
    // visible in the URL under the printed code.
    const url = await urlWith({ APP_URL: "https://menu.example.com" }, "AB12CD34", {
      tenantSlug: "joes-pizza",
    });
    expect(url).toBe("https://menu.example.com/m/joes-pizza/t/AB12CD34");
  });

  it("uses a subdomain only when APP_DOMAIN is set", async () => {
    const url = await urlWith(
      { APP_URL: "https://menu.example.com", APP_DOMAIN: "menu.example.com" },
      "AB12CD34",
      { tenantSlug: "joes-pizza" },
    );
    expect(url).toBe("https://joes-pizza.menu.example.com/t/AB12CD34");
  });

  it("prefers a restaurant's own domain over everything else", async () => {
    const url = await urlWith(
      { APP_URL: "https://menu.example.com", APP_DOMAIN: "menu.example.com" },
      "AB12CD34",
      { tenantSlug: "joes-pizza", customDomain: "menu.joespizza.com" },
    );
    expect(url).toBe("https://menu.joespizza.com/t/AB12CD34");
  });

  it("falls back to the bare path when there is no slug", async () => {
    const url = await urlWith({ APP_URL: "https://menu.example.com" }, "AB12CD34");
    expect(url).toBe("https://menu.example.com/t/AB12CD34");
  });

  it("does not build a subdomain the app is not served from", async () => {
    // APP_DOMAIN set but the app runs on localhost: <slug>.localhost
    // would not resolve, so the branded path is the honest answer.
    const url = await urlWith(
      { APP_URL: "http://localhost:3000", APP_DOMAIN: "example.com" },
      "AB12CD34",
      { tenantSlug: "joes-pizza" },
    );
    expect(url).toBe("http://localhost:3000/m/joes-pizza/t/AB12CD34");
  });

  it("keeps the port when one is in use", async () => {
    const url = await urlWith({ APP_URL: "http://localhost:3000" }, "AB12CD34", {
      tenantSlug: "joes-pizza",
    });
    expect(url).toContain(":3000");
  });

  it("does not double up a trailing slash on APP_URL", async () => {
    const url = await urlWith({ APP_URL: "https://menu.example.com/" }, "AB12CD34", {
      tenantSlug: "joes-pizza",
    });
    expect(url).toBe("https://menu.example.com/m/joes-pizza/t/AB12CD34");
  });
});
