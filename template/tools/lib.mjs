// Shared bits for the tools: read .env, write a downloaded file, add a line to library/INDEX.md.
// Node 18+, nothing to install.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A key from the environment, or from this folder's .env. Never printed. */
export function key(name) {
  if (process.env[name]) return process.env[name];
  const f = path.join(ROOT, ".env");
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name && m[2]) return m[2].replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

export function need(name, where) {
  const v = key(name);
  if (!v) fail(`${name} isn't set. Add it to .env (copy .env.example) — get one at ${where}.`);
  return v;
}

export function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** --name value pairs and bare flags; the rest are positional. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) out._.push(a);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) out[a.slice(2)] = true;
    else {
      const k = a.slice(2);
      const v = argv[++i];
      out[k] = out[k] === undefined ? v : [].concat(out[k], v);
    }
  }
  return out;
}

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4" };
export const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/** A local file as a data: address (fal takes these wherever it takes a link). */
export function dataUri(file) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) fail(`No such file: ${file}`);
  const size = fs.statSync(p).size;
  if (size > 20 * 1024 * 1024) fail(`${file} is ${(size / 1048576).toFixed(0)} MB; send a link to it instead (most services take up to about 20 MB inline).`);
  return `data:${typeOf(p)};base64,${fs.readFileSync(p).toString("base64")}`;
}

/** Save bytes, through a .part file so a broken download never looks finished. */
export function save(out, bytes) {
  const p = path.resolve(out);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.part`, bytes);
  fs.renameSync(`${p}.part`, p);
  return p;
}

/** One row in library/INDEX.md, for files saved inside library/. */
export function addToLibrary(file, what, madeWith) {
  const index = path.join(ROOT, "library", "INDEX.md");
  const rel = path.relative(path.join(ROOT, "library"), path.resolve(file));
  if (rel.startsWith("..") || !fs.existsSync(index)) return;
  const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  fs.appendFileSync(index, `| ${cell(rel)} | ${cell(what)} | ${cell(madeWith)} |  | ${new Date().toISOString().slice(0, 10)} |\n`);
}

export async function download(url, out) {
  const r = await fetch(url);
  if (!r.ok) fail(`Couldn't download the result (${r.status}): ${url}`);
  return save(out, Buffer.from(await r.arrayBuffer()));
}
