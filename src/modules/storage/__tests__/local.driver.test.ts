import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The local driver against a real filesystem.
 *
 * Everything here runs inside a throwaway directory under the system
 * temp dir — never the repository's own var/uploads — so a failing test
 * can never delete a photo someone uploaded while developing.
 *
 * UPLOAD_DIR has to be set before the module graph loads, because
 * src/lib/env.ts validates and freezes the environment at import time.
 */

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "qrmenu-storage-"));
  process.env.UPLOAD_DIR = root;
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function subject() {
  const [{ localDriver }, { buildKey }] = await Promise.all([
    import("../local.driver"),
    import("../key"),
  ]);
  return { localDriver, buildKey };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("localDriver", () => {
  it("stores a file and reports where it can be fetched from", async () => {
    const { localDriver, buildKey } = await subject();
    const key = buildKey({ tenantId: "clxtenant1", kind: "menuItem", type: "png" });

    const stored = await localDriver.put({ key, body: PNG, contentType: "image/png" });

    expect(stored.bytes).toBe(PNG.byteLength);
    expect(stored.url).toBe(`/api/uploads/${key}`);
    await expect(localDriver.exists(key)).resolves.toBe(true);
  });

  it("writes the exact bytes it was given, under the key's own path", async () => {
    const { localDriver, buildKey } = await subject();
    const key = buildKey({ tenantId: "clxtenant1", kind: "menuItem", type: "png" });
    await localDriver.put({ key, body: PNG, contentType: "image/png" });

    // Keys are POSIX; on Windows they must still land on a real path.
    const onDisk = path.join(root, ...key.split("/"));
    await expect(readFile(onDisk)).resolves.toEqual(PNG);
  });

  it("survives being read back through the streaming path", async () => {
    const { localDriver, buildKey } = await subject();
    const key = buildKey({ tenantId: "clxtenant1", kind: "category", type: "png" });
    await localDriver.put({ key, body: PNG, contentType: "image/png" });

    const result = await localDriver.read(key);
    expect(result.contentType).toBe("image/png");
    expect(result.bytes).toBe(PNG.byteLength);
    expect(result.etag).toMatch(/^".+"$/);

    const chunks: Uint8Array[] = [];
    for await (const chunk of result.stream as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks)).toEqual(PNG);
  });

  it("treats deleting a file twice as success", async () => {
    const { localDriver, buildKey } = await subject();
    const key = buildKey({ tenantId: "clxtenant1", kind: "menuItem", type: "png" });
    await localDriver.put({ key, body: PNG, contentType: "image/png" });

    await localDriver.delete(key);
    await expect(localDriver.exists(key)).resolves.toBe(false);
    // The sweeper retries deletions, so a second one must not throw.
    await expect(localDriver.delete(key)).resolves.toBeUndefined();
  });

  it("refuses to touch a path outside the upload root", async () => {
    const { localDriver } = await subject();
    const escape = "t/clx1/menuItem/2026/09/../../../../../../etc/passwd";

    await expect(
      localDriver.put({
        key: escape as never,
        body: PNG,
        contentType: "image/png",
      }),
    ).rejects.toThrow(/unsafe storage key/i);

    await expect(localDriver.delete(escape as never)).rejects.toThrow(/unsafe storage key/i);
  });

  it("lists only well-formed keys, ignoring the temp directory", async () => {
    const { localDriver, buildKey } = await subject();
    const key = buildKey({ tenantId: "clxlisting", kind: "menuItem", type: "png" });
    await localDriver.put({ key, body: PNG, contentType: "image/png" });

    const found: string[] = [];
    for await (const object of localDriver.list("t/clxlisting")) {
      found.push(object.key);
    }

    expect(found).toContain(key);
    expect(found.every((candidate) => !candidate.includes(".tmp"))).toBe(true);
  });

  it("passes its own writability preflight", async () => {
    const { localDriver } = await subject();
    await expect(localDriver.assertWritable()).resolves.toBeUndefined();
  });
});
