import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectRoutes, renderApiDocs } from "../../scripts/api-docs";

/** docs/api.md dibuat dari route handler dan skema Zod; tes ini gagal bila berkasnya tertinggal. */
describe("docs/api.md", () => {
  it("sama dengan hasil `pnpm docs:api`", async () => {
    const routes = await collectRoutes();
    expect(routes.length).toBeGreaterThan(40);
    const expected = renderApiDocs(routes);
    const actual = readFileSync("docs/api.md", "utf8");
    expect(actual, "docs/api.md usang: jalankan `pnpm docs:api`").toBe(expected);
  }, 30_000);

  it("setiap endpoint punya deskripsi dari TSDoc route", async () => {
    const missing = (await collectRoutes())
      .filter((route) => route.description === "")
      .map((route) => `${route.method} ${route.path}`);
    expect(missing).toEqual([]);
  }, 30_000);
});
