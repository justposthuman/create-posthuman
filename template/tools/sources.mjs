#!/usr/bin/env node
// Your stuff: the things you already have, where they already are. brand/sources.md lists the folders (screenshots,
// clips, the folder your phone's photos sync to) and the projects (their git history = what you shipped). Nothing
// is copied or sent anywhere until you pick something: then it's copied into library/ like anything else.
//
//   node tools/sources.mjs            what's new: pictures and clips from the last 7 days, and each project's week
//   node tools/sources.mjs --days 30
//
// Studio's "Your stuff" place uses the same functions. Descriptions your agent writes go in library/found.md.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addToLibrary, parseArgs, ROOT } from "./lib.mjs";

export const SOURCES = path.join(ROOT, "brand", "sources.md");
export const FOUND = path.join(ROOT, "library", "found.md");
const LIB = path.join(ROOT, "library");
const MEDIA = /\.(jpe?g|png|webp|gif|heic|mp4|mov|m4v|webm)$/i;
const SKIP = new Set(["node_modules", ".git", ".cache", ".next", "dist", "build", "Library", "AppData"]);
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").replace(/\r/g, "") : "");
const home = os.homedir();
export const expand = (p) => path.resolve(String(p).trim().replace(/^~(?=$|[\\/])/, home));
export const shown = (p) => (p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------- brand/sources.md ----------

/** { media: [abs dirs], projects: [abs dirs] } from the file's two lists. */
export function readSources() {
  const out = { media: [], projects: [] };
  let into = null;
  for (const line of read(SOURCES).split("\n")) {
    if (/^##\s+pictures/i.test(line)) into = "media";
    else if (/^##\s+projects/i.test(line)) into = "projects";
    else if (/^##\s/.test(line)) into = null;
    const m = into && line.match(/^\s*-\s+(.+?)\s*$/);
    if (m && !m[1].startsWith("<!--")) out[into].push(expand(m[1]));
  }
  return out;
}

export function writeSources({ media = [], projects = [] }) {
  const list = (xs) => [...new Set(xs.map(expand))].map((p) => `- ${shown(p)}`).join("\n");
  fs.mkdirSync(path.dirname(SOURCES), { recursive: true });
  fs.writeFileSync(
    SOURCES,
    `# Where your stuff is

The folders your agent and Studio look in for things to post. Nothing is copied or sent anywhere until you pick
something; then it's copied into library/.

## Pictures and clips
<!-- screenshots, screen recordings, the folder your phone's photos sync to -->
${list(media)}

## Projects
<!-- folders with git: what you committed this week becomes raw material ("23 commits on the app this week") -->
${list(projects)}
`,
  );
  return readSources();
}

/** A path the user may add: an existing folder that isn't the whole home folder or the system. */
export function checkFolder(p) {
  const abs = expand(p);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`There's no folder at ${shown(abs)}.`);
  if (abs === home || abs === path.parse(abs).root) throw new Error("Pick a smaller folder than that (your Screenshots folder, say).");
  return abs;
}

/** Is this file inside one of the listed media folders? (Studio serves only those.) */
export function inSources(file, s = readSources()) {
  let real;
  try {
    real = fs.realpathSync(file);
  } catch {
    return null;
  }
  return MEDIA.test(real) && s.media.some((d) => {
    try {
      const rd = fs.realpathSync(d);
      return real.startsWith(rd + path.sep);
    } catch {
      return false;
    }
  }) ? real : null;
}

// ---------- pictures and clips ----------

/** Newest first: { path, shown, folder, kind, mtime, size }. Only the last `days`, at most `limit`. */
export function scanMedia({ days = 60, limit = 400, s = readSources() } = {}) {
  const since = Date.now() - days * 864e5;
  const out = [];
  const walk = (d, depth, folder) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || SKIP.has(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) depth < 3 && walk(f, depth + 1, folder);
      else if (MEDIA.test(e.name)) {
        let st;
        try {
          st = fs.statSync(f);
        } catch {
          continue;
        }
        if (st.mtimeMs >= since && st.size > 0) out.push({ path: f, shown: shown(f), folder: shown(folder), kind: /\.(mp4|mov|m4v|webm)$/i.test(f) ? "video" : "image", mtime: st.mtimeMs, size: st.size });
      }
    }
  };
  for (const d of s.media) walk(d, 0, d);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

// ---------- projects: the week in commits ----------

/** { folder, name, commits, subjects[] } since a day (YYYY-MM-DD), or null if it isn't a git folder. Only your
 *  own commits when git knows who you are. */
export function projectWeek(dir, since) {
  const g = (args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (g(["rev-parse", "--is-inside-work-tree"]).stdout.trim() !== "true") return null;
  const me = g(["config", "user.name"]).stdout.trim();
  const log = g(["log", `--since=${since} 00:00`, "--no-merges", "--format=%s", ...(me ? [`--author=${me}`] : [])]).stdout.split("\n").filter(Boolean);
  return { folder: shown(dir), name: path.basename(dir), commits: log.length, subjects: log.slice(0, 12).map((x) => x.replace(/\s+/g, " ").slice(0, 160)) };
}
export const projectsWeek = (since, s = readSources()) => s.projects.map((d) => projectWeek(d, since)).filter(Boolean);

// ---------- library/found.md: what the agent saw in them ----------

/** Map of path → { says, angle, at } (written by the agent's "Describe" pass). */
export function readFound() {
  const m = new Map();
  for (const l of read(FOUND).split("\n")) {
    const c = l.split("|").map((x) => x.trim());
    if (c.length >= 5 && c[1] && c[1] !== "File" && !/^-+$/.test(c[1])) m.set(expand(c[1]), { says: c[2], angle: c[3], at: c[4] });
  }
  return m;
}
export function addFound(rows) {
  const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const cur = readFound();
  for (const r of rows) if (r?.path) cur.set(expand(r.path), { says: cell(r.says), angle: cell(r.angle), at: day() });
  fs.mkdirSync(LIB, { recursive: true });
  fs.writeFileSync(
    FOUND,
    `# Found in your folders\n\nWhat your agent saw in your own pictures and clips (brand/sources.md), so they can be searched and pitched. The files stay where they are.\n\n| File | What it shows | Could be a post about | Looked |\n|---|---|---|---|\n${[...cur].map(([p, v]) => `| ${cell(shown(p))} | ${v.says} | ${v.angle} | ${v.at} |`).join("\n")}\n`,
  );
  return readFound();
}

/** Copy one found file into library/ (dated name, listed in INDEX.md). Returns the library name. */
export function useFound(file, what = "") {
  const real = inSources(file);
  if (!real) throw new Error("That file isn't in one of your folders.");
  const base = path.basename(real).replace(/[^\w.-]+/g, "-").replace(/^-+/, "").slice(-80);
  let name = /^\d{4}-\d{2}-\d{2}/.test(base) ? base : `${day()}-${base}`;
  const already = fs.existsSync(LIB) && fs.readdirSync(LIB).find((f) => f.endsWith(base) && fs.statSync(path.join(LIB, f)).size === fs.statSync(real).size);
  if (already) return already;
  while (fs.existsSync(path.join(LIB, name))) name = name.replace(/(\.\w+)$/, `-${crypto.randomBytes(2).toString("hex")}$1`);
  fs.mkdirSync(LIB, { recursive: true });
  fs.copyFileSync(real, path.join(LIB, name));
  addToLibrary(path.join(LIB, name), what || readFound().get(real)?.says || "", `from ${shown(path.dirname(real))}`);
  return name;
}

// ---------- the CLI ----------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  const days = Number(a.days) || 7;
  const s = readSources();
  if (!s.media.length && !s.projects.length) {
    console.log("No folders yet. Add them to brand/sources.md (or Studio → Your stuff): your Screenshots folder, clips, project folders.");
    process.exit(0);
  }
  const since = day(new Date(Date.now() - days * 864e5));
  const found = readFound();
  const media = scanMedia({ days, s });
  console.log(`Pictures and clips from the last ${days} days: ${media.length}`);
  for (const m of media.slice(0, 30)) console.log(`  ${new Date(m.mtime).toISOString().slice(0, 10)}  ${m.kind === "video" ? "clip   " : "picture"}  ${m.shown}${found.get(m.path)?.says ? `  (${found.get(m.path).says})` : ""}`);
  for (const p of projectsWeek(since, s)) {
    console.log(`\n${p.name}: ${p.commits} commit${p.commits === 1 ? "" : "s"} since ${since}`);
    for (const x of p.subjects) console.log(`  - ${x}`);
  }
}
