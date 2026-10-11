import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const [label, outputPath, comparePath] = process.argv.slice(2);
if (!label || !outputPath) {
  throw new Error("usage: node phase9-auth-rendering-check.mjs LABEL OUTPUT [COMPARE]");
}

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else files.push(path);
  }
  return files;
}

const serverRoot = ".next/server/app";
const files = await filesUnder(serverRoot);
const targets = new Set([
  "login.html",
  "recuperar-senha.html",
  "redefinir-senha.html",
]);
const staticAuthArtifacts = files
  .filter((file) => targets.has(basename(file)))
  .map((file) => relative(serverRoot, file).replaceAll("\\", "/"));
const result = {
  label,
  buildId: (await readFile(".next/BUILD_ID", "utf8")).trim(),
  authRoutesDynamic: staticAuthArtifacts.length === 0,
  staticAuthArtifacts,
};
if (!result.authRoutesDynamic) {
  throw new Error(`auth routes unexpectedly prerendered: ${staticAuthArtifacts.join(", ")}`);
}
await writeFile(outputPath, JSON.stringify(result));

let comparison = null;
if (comparePath) {
  const first = JSON.parse(await readFile(comparePath, "utf8"));
  comparison = {
    bothBuildsDynamic: first.authRoutesDynamic && result.authRoutesDynamic,
    buildIdsEqual: first.buildId === result.buildId,
  };
  if (!comparison.bothBuildsDynamic) {
    throw new Error("auth rendering mode changed between builds");
  }
}
const evidence = { ...result, comparison };
process.stdout.write(`PHASE9_AUTH_RENDERING=${JSON.stringify(evidence)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Phase 9 auth rendering — ${label}\n\n\`${JSON.stringify(evidence)}\`\n`
  );
}