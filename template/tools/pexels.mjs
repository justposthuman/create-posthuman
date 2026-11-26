#!/usr/bin/env node
// Real stock photos and clips from Pexels, free with your own key (PEXELS_API_KEY in .env, from pexels.com/api).
//
//   node tools/pexels.mjs search "coffee on a desk at night" [--videos] [--shape portrait|landscape|square] [--json]
//   node tools/pexels.mjs get 1234567 [--video] [--out library/name.jpg]
//
// Free to use, no attribution required, but credit is kind: the photographer and the link go in library/INDEX.md.
// Your own photos still beat stock: use these for a background or a mood, not to pretend something happened.

import path from "node:path";
import { addToLibrary, download, fail, need, parseArgs } from "./lib.mjs";

const API = (process.env.PEXELS_API_BASE || "https://api.pexels.com").replace(/\/+$/, "");
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pexels";
const day = () => new Date().toISOString().slice(0, 10);
const get = async (p) => {
  const r = await fetch(`${API}${p}`, { headers: { Authorization: need("PEXELS_API_KEY", "pexels.com/api") } });
  if (!r.ok) fail(`Pexels failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

/** One result, the same shape for photos and clips: what the page and the agent need to pick one. */
export const asItem = (x, video) =>
  video
    ? { id: x.id, kind: "video", by: x.user?.name ?? "", page: x.url, seconds: x.duration, width: x.width, height: x.height, preview: x.image, alt: "" }
    : { id: x.id, kind: "photo", by: x.photographer ?? "", page: x.url, width: x.width, height: x.height, preview: x.src?.medium ?? x.src?.small, alt: x.alt ?? "" };

/** The best file of a clip for a phone: an mp4 about 1080 on its short side, not 4K. */
export const pickFile = (files = []) => {
  const mp4 = files.filter((f) => f.file_type === "video/mp4" && f.link);
  const short = (f) => Math.min(f.width || 0, f.height || 0);
  return mp4.filter((f) => short(f) <= 1080).sort((x, y) => short(y) - short(x))[0] ?? mp4.sort((x, y) => short(x) - short(y))[0];
};

const main = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
const a = main ? parseArgs(process.argv.slice(2)) : { _: [] };
const [cmd, arg] = a._;
if (!main) {
  // imported (Studio, the test): nothing to run
} else if (cmd === "search") {
  if (!arg) fail('Usage: node tools/pexels.mjs search "what you want" [--videos] [--shape portrait]');
  const q = new URLSearchParams({ query: String(arg), per_page: "12", ...(typeof a.shape === "string" ? { orientation: a.shape } : {}) });
  if (a.dry) {
    console.log(JSON.stringify({ get: `${API}${a.videos ? "/videos/search" : "/v1/search"}?${q}` }, null, 2));
    process.exit(0);
  }
  const j = await get(`${a.videos ? "/videos/search" : "/v1/search"}?${q}`);
  const items = (a.videos ? j.videos : j.photos)?.map((x) => asItem(x, !!a.videos)) ?? [];
  if (a.json) console.log(JSON.stringify(items));
  else for (const x of items) console.log(`${x.id}  ${x.kind}${x.seconds ? ` ${x.seconds}s` : ""}  ${x.width}x${x.height}  by ${x.by}  ${x.alt || x.page}`);
} else if (cmd === "get") {
  if (!/^\d+$/.test(String(arg ?? ""))) fail("Usage: node tools/pexels.mjs get <id> [--video] [--out library/name.jpg]");
  if (a.dry) {
    console.log(JSON.stringify({ get: `${API}${a.video ? `/videos/videos/${arg}` : `/v1/photos/${arg}`}` }, null, 2));
    process.exit(0);
  }
  const x = await get(a.video ? `/videos/videos/${arg}` : `/v1/photos/${arg}`);
  const link = a.video ? pickFile(x.video_files)?.link : x.src?.large2x ?? x.src?.original;
  if (!link) fail("Pexels didn't give a file for that one.");
  const item = asItem(x, !!a.video);
  const out = typeof a.out === "string" ? a.out : `library/${day()}-pexels-${slug(item.alt || `${item.kind}-${item.id}`)}.${a.video ? "mp4" : "jpg"}`;
  const saved = await download(link, out);
  addToLibrary(saved, item.alt || `Pexels ${item.kind} ${item.id}`, `Pexels, by ${item.by} (${item.page})`);
  console.log(JSON.stringify({ saved, by: item.by, page: item.page, file: path.relative(path.resolve("library"), saved) }, null, 2));
} else fail('Usage: node tools/pexels.mjs search "what you want"   or   get <id> [--video]');
