import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const deprecatedPages = [
  "src/app/(sistema)/dashboard/mapa/page.tsx",
  "src/app/(sistema)/dashboard/indicadores/page.tsx",
  "src/app/(sistema)/dashboard/territorio/page.tsx",
  "src/app/(sistema)/dashboard/visitas/page.tsx",
  "src/app/(sistema)/dashboard/configuracoes/page.tsx",
];

for (const relativePath of deprecatedPages) {
  const content = await readFile(
    path.join(root, relativePath),
    "utf8"
  );

  if (!content.includes('redirect("/dashboard")')) {
    throw new Error(
      `Módulo legado reativado sem revisão de segurança: ${relativePath}`
    );
  }

  if (
    /createClient|getPostgresClient|fetch\(|\.from\(|\.rpc\(/.test(
      content
    )
  ) {
    throw new Error(
      `Módulo legado contém acesso a dados: ${relativePath}`
    );
  }
}

const acsRoute = await readFile(
  path.join(root, "src/app/api/acs/visitas/route.ts"),
  "utf8"
);

if (
  !acsRoute.includes("status: 404") ||
  /createClient|getPostgresClient|\.from\(|\.rpc\(/.test(acsRoute)
) {
  throw new Error(
    "Endpoint ACS legado deixou de ser um stub 404 seguro."
  );
}

const forbiddenRuntimeReferences = [
  "visitas_acs_v21",
  "acompanhamentos_visitas_equipe_v29_1",
];

async function walk(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)));
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const sourceFiles = await walk(path.join(root, "src"));

for (const filePath of sourceFiles) {
  const content = await readFile(filePath, "utf8");
  for (const forbidden of forbiddenRuntimeReferences) {
    if (content.includes(forbidden)) {
      throw new Error(
        `Referência legada ${forbidden} reapareceu no runtime: ${path.relative(root, filePath)}`
      );
    }
  }
}

console.log("Legacy V2 surface guard: OK");
