#!/usr/bin/env node
// npx create-posthuman [folder] [--name "Brand name"] [--url https://justposthuman.com]
// Copies the starter folder, fills in the brand name and the Posthuman address, and says what to do next.
// No dependencies, nothing sent anywhere.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(here, "..", "template");
// npm drops dotfiles like .gitignore from packages, so they travel under these names.
const RENAME = { _gitignore: ".gitignore", "_env.example": ".env.example", "_mcp.json": ".mcp.json" };

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
if (args.includes("-h") || args.includes("--help")) {
  console.log('Usage: npx create-posthuman [folder] [--name "Brand name"] [--url https://justposthuman.com]');
  process.exit(0);
}
const url = (flag("url") || "https://justposthuman.com").replace(/\/+$/, "");
let name = flag("name");
const dir = path.resolve(args[0] || "my-brand");
if (!name) name = path.basename(dir).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

if (!/^https?:\/\/[^\s]+$/.test(url)) {
  console.error(`That doesn't look like a web address: ${url}`);
  process.exit(1);
}
if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
  console.error(`${dir} already has files in it. Pick a new folder name, e.g. npx create-posthuman my-brand`);
  process.exit(1);
}

const fill = (s) =>
  s
    .replaceAll("{{BRAND}}", name)
    .replaceAll("{{POSTHUMAN_URL}}", url)
    .replaceAll("{{CREATED}}", new Date().toISOString().slice(0, 10));

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, RENAME[e.name] ?? e.name);
    if (e.isDirectory()) copy(src, dst);
    else if (/\.(md|mjs|json|txt|example)$|^_/.test(e.name)) fs.writeFileSync(dst, fill(fs.readFileSync(src, "utf8")));
    else fs.copyFileSync(src, dst);
  }
}
copy(TEMPLATE, dir);

const rel = path.relative(process.cwd(), dir) || ".";
console.log(`
Made ${rel}/ for ${name}.

Next:
  1. cd ${rel}
  2. Open your agent here:
       Claude Code:  claude          (then /mcp and sign in to Posthuman)
       Codex:        codex mcp add posthuman --url ${url}/api/mcp   then: codex
  3. Say: "set up my brand". It asks you a few questions and fills in brand/.

Optional: copy .env.example to .env and add your fal / ElevenLabs keys for making media.
Your keys stay in this folder; Posthuman never sees them.
`);
