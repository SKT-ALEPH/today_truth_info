import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "public", "vendor", "t04-real-information-board-public-v1");

describe("public T04 contract", () => {
  it("contains the complete canonical C01-C35 registry", async () => {
    const registry = JSON.parse(await readFile(join(root, "criterion-registry.json"), "utf8"));
    const expected = Array.from({ length: 35 }, (_, index) => `T04-C${String(index + 1).padStart(2, "0")}`);
    expect(registry.required_count).toBe(35);
    expect(registry.criteria.map((item: { id: string }) => item.id)).toEqual(expected);
    expect(registry.criteria.every((item: { required: boolean }) => item.required)).toBe(true);
  });

  it("matches every file size and SHA-256 in asset-manifest.json", async () => {
    const manifest = JSON.parse(await readFile(join(root, "asset-manifest.json"), "utf8"));
    expect(manifest.package_id).toBe("aleph-t04-real-information-board-public-contract-v2");
    expect(manifest.files).toHaveLength(17);
    for (const entry of manifest.files as Array<{ path: string; bytes: number; sha256: string }>) {
      const bytes = await readFile(join(root, entry.path));
      expect(bytes.byteLength, entry.path).toBe(entry.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), entry.path).toBe(entry.sha256);
    }
  });
});
