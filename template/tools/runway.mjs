#!/usr/bin/env node
// Runway with your own key (RUNWAYML_API_SECRET in .env, from dev.runway.com → your project → API Keys).
// The API has its own credits (about 1¢ each), apart from a runwayml.com plan.
//
//   node tools/runway.mjs video library/photo.jpg "slow push-in, steam rising" --out library/clip.mp4 [--model gen4_turbo] [--ratio 720:1280] [--seconds 5]
//   node tools/runway.mjs text-video "a desk at night, a laptop glowing" --out library/desk.mp4 [--model seedance2_5]
//   node tools/runway.mjs image "a sign that says OPEN" --out library/sign.png [--ratio 1080:1920]
//   ... [--what "alt text"] [--dry]
//
// Models and their ratios and lengths: docs.dev.runwayml.com (API reference). gen4_turbo takes 720:1280 (vertical),
// 1280:720, 960:960 and 2 to 10 seconds; gen4.5 and the veo models too, with their own lists. Prices per model are
// in the developer portal. Runway's links expire in a day or two: the file is saved here at once.

import { addToLibrary, dataUri, download, fail, need, parseArgs } from "./lib.mjs";

const API = (process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com").replace(/\/+$/, "");
const VERSION = "2024-11-06";

/** The request for one job. Pure: the test reads it. */
export function runwayRequest(cmd, { image = "", prompt = "", model, ratio, seconds = 5 } = {}) {
  if (cmd === "image") return { path: "/v1/text_to_image", body: { model: model || "gen4_image", promptText: prompt, ratio: ratio || "1080:1920" } };
  const m = model || (cmd === "video" ? "gen4_turbo" : "seedance2_5");
  const body = { model: m, promptText: prompt, ratio: ratio || "720:1280", duration: Number(seconds) || 5 };
  if (cmd === "text-video") return { path: "/v1/text_to_video", body };
  // gen4.5 and the veo models take the image as a list with its place; the others as a plain string
  body.promptImage = /^(gen4\.5|veo)/.test(m) ? [{ uri: image, position: "first" }] : image;
  return { path: "/v1/image_to_video", body };
}

if (process.argv[1] && new URL(import.meta.url).pathname.endsWith(process.argv[1].split("/").pop())) {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = a._;
  const out = typeof a.out === "string" ? a.out : "";
  if (!["video", "text-video", "image"].includes(cmd) || !out) fail('Usage: node tools/runway.mjs video library/photo.jpg "the motion" --out library/clip.mp4   (or text-video / image: see the top of this file)');
  const src = cmd === "video" ? rest[0] : "";
  const prompt = String(cmd === "video" ? rest[1] ?? "" : rest[0] ?? "").trim();
  if (!prompt) fail("Say what happens (or what it shows).");
  const image = src ? (/^https?:\/\//.test(src) ? src : dataUri(src)) : "";
  const req = runwayRequest(cmd, { image, prompt, model: typeof a.model === "string" ? a.model : "", ratio: typeof a.ratio === "string" ? a.ratio : "", seconds: a.seconds });
  if (a.dry) {
    const shown = JSON.parse(JSON.stringify(req.body, (k, v) => (typeof v === "string" && v.startsWith("data:") ? `${v.slice(0, 30)}… (${Math.round(v.length / 1024)} KB)` : v)));
    console.log(JSON.stringify({ post: `${API}${req.path}`, version: VERSION, body: shown, out }, null, 2));
    process.exit(0);
  }
  const head = { Authorization: `Bearer ${need("RUNWAYML_API_SECRET", "dev.runway.com (your project → API Keys)")}`, "X-Runway-Version": VERSION, "Content-Type": "application/json" };
  const r = await fetch(`${API}${req.path}`, { method: "POST", headers: head, body: JSON.stringify(req.body) });
  if (!r.ok) fail(`Runway refused it (${r.status}): ${(await r.text()).slice(0, 400)}`);
  const { id } = await r.json();
  if (!id) fail("Runway's answer had no task in it.");
  const started = Date.now();
  let t = { status: "PENDING" };
  while (!["SUCCEEDED", "FAILED", "CANCELLED"].includes(t.status)) {
    if (Date.now() - started > 20 * 60e3) fail(`Still running after 20 minutes: task ${id}`);
    await new Promise((ok) => setTimeout(ok, 5000)); // Runway asks for no more than one check every 5 seconds
    process.stdout.write(".");
    const s = await fetch(`${API}/v1/tasks/${id}`, { headers: head });
    t = s.ok ? await s.json() : { status: "RUNNING" };
  }
  if (t.status !== "SUCCEEDED") fail(`\nRunway stopped: ${t.status}${t.failure ? `: ${String(t.failure).slice(0, 300)}` : ""}`);
  const link = [].concat(t.output ?? [])[0];
  if (!link) fail("\nRunway finished but there's no file in the answer.");
  const saved = await download(link, out);
  addToLibrary(saved, a.what || prompt, `Runway ${req.body.model}${src ? ` (from ${src.split("/").pop()})` : ""}`);
  console.log(JSON.stringify({ saved }, null, 2));
}
