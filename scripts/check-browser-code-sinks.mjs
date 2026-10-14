import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src");
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const patterns = [
  ["dangerouslySetInnerHTML", /\bdangerouslySetInnerHTML\b/g],
  ["atribuicao direta de innerHTML/outerHTML", /\b(?:innerHTML|outerHTML)\s*=/g],
  ["document.write", /\bdocument\.write\s*\(/g],
  ["eval", /\beval\s*\(/g],
  ["new Function", /\bnew\s+Function\s*\(/g],
];
let scanned = 0;
const findings = [];

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(filename);
      continue;
    }
    if (!entry.isFile() || !extensions.has(path.extname(entry.name))) continue;
    scanned++;
    const source = await readFile(filename, "utf8");
    for (const [label, pattern] of patterns) {
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        findings.push({ file: path.relative(process.cwd(), filename), line, label });
      }
    }
  }
}

await scan(root);

if (findings.length) {
  for (const finding of findings) {
    console.error(
      "::error file=" + finding.file + ",line=" + finding.line +
      "::Uso proibido na superficie renderizada: " + finding.label
    );
  }
  process.exitCode = 1;
} else {
  console.log("Browser sink guard: " + scanned + " arquivos avaliados; zero sinks proibidos.");
}
