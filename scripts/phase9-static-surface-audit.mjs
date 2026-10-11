import { appendFile, readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = new URL("../src/", import.meta.url);
const extensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const forbidden = [
  ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/g],
  ["innerHTML assignment", /\.innerHTML\s*=/g],
  ["document.write", /\bdocument\.write\s*\(/g],
  ["eval", /\beval\s*\(/g],
  ["Function constructor", /\bnew\s+Function\s*\(/g],
  ["literal script element", /<script(?:\s|>)/gi],
];
const inventory = [
  ["React style prop", /\bstyle\s*=\s*\{\{/g],
  ["style element", /<style(?:\s|>)/gi],
  ["iframe element", /<iframe(?:\s|>)/gi],
  ["next Script import", /(?:from|require\()\s*["']next\/script["']/g],
  ["SVG element", /<svg(?:\s|>)/gi],
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

const files = await filesUnder(root);
const findings = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const [kind, pattern] of [...forbidden, ...inventory]) {
    const count = countMatches(source, pattern);
    if (count > 0) {
      findings.push({
        kind,
        path: relative(root.pathname, file).replaceAll("\\", "/"),
        count,
        forbidden: forbidden.some(([name]) => name === kind),
      });
    }
  }
}

const totals = Object.fromEntries(
  [...forbidden, ...inventory].map(([kind]) => [
    kind,
    findings
      .filter((finding) => finding.kind === kind)
      .reduce((sum, finding) => sum + finding.count, 0),
  ])
);
const result = { scannedFiles: files.length, totals, findings };
process.stdout.write(`PHASE9_STATIC_SURFACE=${JSON.stringify(result)}\n`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(totals)
    .map(([kind, count]) => `| ${kind} | ${count} |`)
    .join("\n");
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Phase 9 static CSP surface\n\nScanned files: ${files.length}\n\n| Pattern | Count |\n|---|---:|\n${rows}\n`
  );
}

const blockers = findings.filter((finding) => finding.forbidden);
if (blockers.length > 0) {
  process.stderr.write(
    `Forbidden dynamic HTML/script sinks found: ${JSON.stringify(blockers)}\n`
  );
  process.exitCode = 1;
}