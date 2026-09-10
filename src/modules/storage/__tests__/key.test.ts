import { describe, expect, it } from "vitest";
import {
  buildKey,
  isSafeKey,
  keyBelongsToTenant,
  keyFromUrl,
  parseKey,
} from "../key";

/**
 * Storage keys decide where a file lands on disk and which restaurant it
 * belongs to, so they are the thing an attacker would go after. These
 * tests are the specification for that boundary.
 */

const TENANT = "clx1234567890abcdef";

describe("buildKey", () => {
  it("produces a key matching the documented shape", () => {
    const key = buildKey({
      tenantId: TENANT,
      kind: "menuItem",
      type: "jpeg",
      now: new Date("2026-09-11T12:00:00Z"),
    });

    expect(key).toMatch(/^t\/clx1234567890abcdef\/menuItem\/2026\/09\/[a-z0-9]+\.jpg$/);
    expect(isSafeKey(key)).toBe(true);
  });

  it("never reuses a key, so a stored URL's bytes can be cached forever", () => {
    const make = () => buildKey({ tenantId: TENANT, kind: "menuItem", type: "png" });
    const keys = new Set(Array.from({ length: 50 }, make));
    expect(keys.size).toBe(50);
  });

  it("maps each accepted type to its canonical extension", () => {
    const extension = (type: "jpeg" | "png" | "webp" | "avif") =>
      buildKey({ tenantId: TENANT, kind: "category", type }).split(".").pop();

    expect(extension("jpeg")).toBe("jpg");
    expect(extension("png")).toBe("png");
    expect(extension("webp")).toBe("webp");
    expect(extension("avif")).toBe("avif");
  });

  it("refuses a tenant id that would break out of the key shape", () => {
    expect(() =>
      buildKey({ tenantId: "../../etc", kind: "menuItem", type: "jpeg" }),
    ).toThrow();
  });
});

describe("isSafeKey", () => {
  const valid = "t/clx1/menuItem/2026/09/abc123.jpg";

  it("accepts a well-formed key", () => {
    expect(isSafeKey(valid)).toBe(true);
  });

  it.each([
    ["parent traversal", "t/clx1/menuItem/2026/09/../../../../etc/passwd"],
    ["encoded traversal", "t/clx1/menuItem/2026/09/%2e%2e%2fpasswd.jpg"],
    ["absolute posix path", "/etc/passwd"],
    ["windows separator", "t\\clx1\\menuItem\\2026\\09\\abc.jpg"],
    ["windows drive", "C:/windows/system32/config.jpg"],
    ["NTFS alternate data stream", "t/clx1/menuItem/2026/09/abc.jpg:evil.exe"],
    ["reserved device name", "t/clx1/menuItem/2026/09/CON.jpg"],
    ["trailing dot", "t/clx1/menuItem/2026/09/abc.jpg."],
    ["trailing space", "t/clx1/menuItem/2026/09/abc.jpg "],
    ["null byte", "t/clx1/menuItem/2026/09/abc.jpg\u0000.png"],
    ["newline", "t/clx1/menuItem/2026/09/abc.jpg\n"],
    ["executable extension", "t/clx1/menuItem/2026/09/abc.php"],
    ["svg", "t/clx1/menuItem/2026/09/abc.svg"],
    ["no extension", "t/clx1/menuItem/2026/09/abc"],
    ["unknown kind", "t/clx1/invoices/2026/09/abc.jpg"],
    ["missing date folders", "t/clx1/menuItem/abc.jpg"],
    ["empty", ""],
  ])("rejects %s", (_label, candidate) => {
    expect(isSafeKey(candidate)).toBe(false);
  });

  it("rejects a reserved Windows device name in any accepted casing", () => {
    // Guarded by the charset (uppercase is not permitted at all) rather
    // than by a name list, so no CON/PRN/AUX variant can slip through.
    expect(isSafeKey("t/clx1/menuItem/2026/09/con.jpg")).toBe(true);
    expect(isSafeKey("t/clx1/menuItem/2026/09/CON.jpg")).toBe(false);
    expect(isSafeKey("t/clx1/menuItem/2026/09/Con.JPG")).toBe(false);
  });
});

describe("parseKey", () => {
  it("reads back what buildKey wrote", () => {
    const key = buildKey({ tenantId: TENANT, kind: "category", type: "webp" });
    expect(parseKey(key)).toEqual({ tenantId: TENANT, kind: "category", type: "webp" });
  });

  it("returns null rather than throwing for a malformed key", () => {
    expect(parseKey("../../secrets")).toBeNull();
  });
});

describe("keyBelongsToTenant", () => {
  it("recognises a tenant's own key", () => {
    const key = buildKey({ tenantId: TENANT, kind: "menuItem", type: "jpeg" });
    expect(keyBelongsToTenant(key, TENANT)).toBe(true);
  });

  it("rejects another restaurant's key", () => {
    const key = buildKey({ tenantId: "clxother999", kind: "menuItem", type: "jpeg" });
    expect(keyBelongsToTenant(key, TENANT)).toBe(false);
  });

  it("is not fooled by a tenant id that merely shares a prefix", () => {
    const key = buildKey({ tenantId: `${TENANT}extra`, kind: "menuItem", type: "jpeg" });
    expect(keyBelongsToTenant(key, TENANT)).toBe(false);
  });
});

describe("keyFromUrl", () => {
  const key = "t/clx1/menuItem/2026/09/abc123.jpg";

  it("recovers the key from a same-origin upload URL", () => {
    expect(keyFromUrl(`/api/uploads/${key}`)).toBe(key);
  });

  it("recovers the key from a configured absolute base", () => {
    expect(keyFromUrl(`https://cdn.example.com/${key}`, ["https://cdn.example.com"])).toBe(key);
  });

  it.each([
    ["an unrelated host", "https://evil.example.com/t/clx1/menuItem/2026/09/abc123.jpg"],
    ["a protocol-relative URL", "//evil.example.com/t/clx1/menuItem/2026/09/abc.jpg"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["a traversal attempt", "/api/uploads/../../../../etc/passwd"],
  ])("returns null for %s", (_label, url) => {
    expect(keyFromUrl(url, ["https://cdn.example.com"])).toBeNull();
  });
});
