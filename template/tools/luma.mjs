#!/usr/bin/env node
// Luma (Ray video) with your own key (LUMA_API_KEY in .env, from platform.lumalabs.ai; LUMA_AGENTS_API_KEY works too).
//
//   node tools/luma.mjs video library/photo.jpg "slow push-in, steam rising" --out library/clip.mp4 [--aspect 9:16] [--resolution 720p]
//   node tools/luma.mjs text-video "a desk at night, a laptop glowing" --out library/desk.mp4 [--seconds 10]
//   node tools/luma.mjs image "a cozy desk at night" --out library/desk.png [--aspect 4:5]
//   ... [--model ray-3.2] [--what "alt text"] [--dry]
//
// Luma's current API (docs.agents.lumalabs.ai). Video: 5 or 10 seconds (a photo to start from only works with 5),
// 360p to 1080p, aspect 9:16, 3:4, 1:1, 4:3, 16:9 or 21:9. Roughly 4-9¢ a second (2026-11; check your platform
// page). A local photo goes in inline, so keep it under a few MB. Luma's links expire in an hour: saved here at once.

import fs from "node:fs";
import { addToLibrary, download, fail, key, parseArgs, typeOf } from "./lib.mjs";

const API = (process.env.LUMA_API_BASE || "https://agents.lumalabs.ai/v1").replace(/\/+$/, "");
const ASPECTS = ["9:16", "3:4", "1:1", "4:3", "16:9", "21:9"];

/** The request for one job. Pure: the test reads it. frame = { url } or { data, media_type }. */
export function lumaRequest(cmd, { prompt = "", frame = null, model = "ray-3.2", aspect = "9:16", seconds = 5, resolution = "720p" } = {}) {
  if (!ASPECTS.includes(aspect)) throw new Error(`--aspect is one of ${ASPECTS.join(", ")}.`);
  if (cmd === "image") return { prompt, aspect_ratio: aspect };
  const duration = `${Number(seconds) === 10 && !frame ? 10 : 5}s`;
  return { model, type: "video", prompt, aspect_ratio: aspect, video: { resolution, duration, ...(frame ? { start_frame: frame } : {}) } };
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = a._;
  const out = typeof a.out === "string" ? a.out : "";
  if (!["video", "text-video", "image"].includes(cmd) || !out) fail('Usage: node tools/luma.mjs video library/photo.jpg "the motion" --out library/clip.mp4   (or text-video / image: see the top of this file)');
  const src = cmd === "video" ? rest[0] : "";
  const prompt = String(cmd === "video" ? rest[1] ?? "" : rest[0] ?? "").trim();
  if (!prompt) fail("Say what happens (or what it shows).");
  if (src && !/^https?:\/\//.test(src) && !fs.existsSync(src)) fail(`No such file: ${src}`);
  const frame = !src ? null : /^https?:\/\//.test(src) ? { url: src } : { data: fs.readFileSync(src).toString("base64"), media_type: typeOf(src) };
  let body;
  try {
    body = lumaRequest(cmd, { prompt, frame, model: typeof a.model === "string" ? a.model : "ray-3.2", aspect: typeof a.aspect === "string" ? a.aspect : cmd === "image" ? "3:4" : "9:16", seconds: a.seconds, resolution: typeof a.resolution === "string" ? a.resolution : "720p" });
  } catch (e) {
    fail(e.message);
  }
  if (a.dry) {
    const shown = JSON.parse(JSON.stringify(body, (k, v) => (k === "data" ? `(${Math.round(String(v).length / 1024)} KB of picture)` : v)));
    console.log(JSON.stringify({ post: `${API}/generations`, body: shown, out }, null, 2));
    process.exit(0);
  }
  const k = key("LUMA_API_KEY") || key("LUMA_AGENTS_API_KEY");
  if (!k) fail("LUMA_API_KEY isn't set. Add it to .env (copy .env.example): make one at platform.lumalabs.ai.");
  const head = { Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
  const r = await fetch(`${API}/generations`, { method: "POST", headers: head, body: JSON.stringify(body) });
  if (!r.ok) fail(`Luma refused it (${r.status}): ${(await r.text()).slice(0, 400)}`);
  const { id } = await r.json();
  if (!id) fail("Luma's answer had no generation in it.");
  const started = Date.now();
  let g = { state: "queued" };
  await new Promise((ok) => setTimeout(ok, cmd === "image" ? 5000 : 20000));
  while (!["completed", "failed"].includes(g.state)) {
    if (Date.now() - started > 15 * 60e3) fail(`Still running after 15 minutes: generation ${id}`);
    const s = await fetch(`${API}/generations/${id}`, { headers: head });
    g = s.ok ? await s.json() : { state: "queued" };
    if (!["completed", "failed"].includes(g.state)) {
      process.stdout.write(".");
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
  if (g.state !== "completed") fail(`\nLuma stopped: ${g.state}${g.failure_reason ? `: ${String(g.failure_reason).slice(0, 300)}` : ""}`);
  const link = g.output?.[0]?.url;
  if (!link) fail("\nLuma finished but there's no file in the answer.");
  const saved = await download(link, out);
  addToLibrary(saved, a.what || prompt, `Luma ${body.model || "image"}${src ? ` (from ${src.split("/").pop()})` : ""}`);
  console.log(JSON.stringify({ saved }, null, 2));
}
