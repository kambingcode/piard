import { writeFileSync } from "node:fs";
import { collectRoutes, renderApiDocs } from "./api-docs";

async function main() {
  const routes = await collectRoutes();
  writeFileSync("docs/api.md", renderApiDocs(routes));
  console.log(`docs/api.md: ${routes.length} endpoint`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
