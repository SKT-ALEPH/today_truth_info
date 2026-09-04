import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", ".next", "node_modules", ".vercel"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".css", ".sql", ".yml", ".yaml"]);
const patterns = [
  { name: "Postgres URL with credentials", regex: /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/gi },
  { name: "private key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "GitHub token", regex: /gh[opurs]_[A-Za-z0-9_]{30,}/g },
  { name: "generic assigned secret", regex: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi },
];

async function filesIn(directory, ignoredDirectories = ignored) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(path, ignoredDirectories));
    else if (textExtensions.has(extname(entry.name)) || entry.name === ".env.example") files.push(path);
  }
  return files;
}

const staticBuild = join(root, ".next", "static");
const buildFiles = await stat(staticBuild).then(() => filesIn(staticBuild, new Set())).catch(() => []);
const files = [...await filesIn(root), ...buildFiles];
const findings = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) findings.push(`${relative(root, file)}: ${pattern.name}`);
  }
}

if (findings.length) {
  console.error(`Secret-like plaintext found:\n${findings.join("\n")}`);
  process.exit(1);
}

console.log("Secret scan passed: no secret-like plaintext found in source or client build files.");
