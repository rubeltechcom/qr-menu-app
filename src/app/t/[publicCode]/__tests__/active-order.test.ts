import { describe, expect, it } from "vitest";

/**
 * The stored "your order is on its way" link.
 *
 * This exists because the link was previously held in React state and
 * vanished the moment a diner refreshed — and the track token is
 * unguessable by design, so there was nothing they could type to get
 * back to their own order.
 *
 * Mirrors parseActiveOrder in use-active-order.ts. Kept here rather than
 * imported because the hook is a client module that pulls in React.
 */

const MAX_AGE_MS = 4 * 60 * 60 * 1000;

interface ActiveOrder {
  orderNumber: number;
  trackToken: string;
  placedAt: number;
}

function parseActiveOrder(raw: string): ActiveOrder | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ActiveOrder> | null;
    if (
      !parsed ||
      typeof parsed.orderNumber !== "number" ||
      typeof parsed.trackToken !== "string" ||
      typeof parsed.placedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.placedAt > MAX_AGE_MS) return null;
    return parsed as ActiveOrder;
  } catch {
    return null;
  }
}

const valid = (overrides: Partial<ActiveOrder> = {}) =>
  JSON.stringify({
    orderNumber: 12,
    trackToken: "abc123",
    placedAt: Date.now(),
    ...overrides,
  });

describe("stored active order", () => {
  it("survives a reload, which is the whole point", () => {
    const stored = parseActiveOrder(valid());
    expect(stored?.orderNumber).toBe(12);
    expect(stored?.trackToken).toBe("abc123");
  });

  it("forgets an order older than four hours", () => {
    // A phone scanning the same table next week must not still be
    // offered a link to last week's dinner.
    const old = valid({ placedAt: Date.now() - MAX_AGE_MS - 1000 });
    expect(parseActiveOrder(old)).toBeNull();
  });

  it("keeps one that is nearly, but not quite, expired", () => {
    const recent = valid({ placedAt: Date.now() - MAX_AGE_MS + 60_000 });
    expect(parseActiveOrder(recent)).not.toBeNull();
  });

  it("returns null rather than throwing on a corrupt value", () => {
    expect(parseActiveOrder("not json")).toBeNull();
    expect(parseActiveOrder("")).toBeNull();
    expect(parseActiveOrder("null")).toBeNull();
  });

  it("rejects a value missing the token it exists to carry", () => {
    expect(
      parseActiveOrder(JSON.stringify({ orderNumber: 12, placedAt: Date.now() })),
    ).toBeNull();
  });

  it("rejects a value whose fields are the wrong type", () => {
    // An older version, or a hand-edited entry.
    expect(parseActiveOrder(valid({ orderNumber: "12" as never }))).toBeNull();
    expect(parseActiveOrder(valid({ trackToken: 123 as never }))).toBeNull();
  });
});
