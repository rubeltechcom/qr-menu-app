import { describe, expect, it } from "vitest";

/**
 * What a stored favourites list is allowed to be.
 *
 * The value comes from localStorage, which a diner can edit, another
 * script on the page could corrupt, and an old version of the app may
 * have written in a different shape. None of that may break the menu
 * someone is standing in a restaurant trying to order from — a bad
 * value has to degrade to "no favourites", never to a crash.
 *
 * Mirrors parseFavourites in use-favourites.ts. Kept here rather than
 * imported because the hook is a client module that pulls in React.
 */
function parseFavourites(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

describe("stored favourites", () => {
  it("reads back a list it wrote", () => {
    expect(parseFavourites(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("reads an empty list", () => {
    expect(parseFavourites("[]")).toEqual([]);
  });

  it("returns null for anything that is not JSON", () => {
    expect(parseFavourites("not json")).toBeNull();
    expect(parseFavourites("")).toBeNull();
  });

  it("returns null for JSON that is not a list", () => {
    // An older version storing an object, or a hand-edited value.
    expect(parseFavourites('{"a":1}')).toBeNull();
    expect(parseFavourites('"a string"')).toBeNull();
    expect(parseFavourites("42")).toBeNull();
  });

  it("drops entries that are not ids rather than rejecting the whole list", () => {
    // One bad entry should cost that entry, not every favourite the
    // diner has.
    expect(
      parseFavourites(JSON.stringify(["good", 42, null, { a: 1 }, "also-good"])),
    ).toEqual(["good", "also-good"]);
  });
});
