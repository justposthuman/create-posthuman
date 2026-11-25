#!/usr/bin/env node
// Run any fal model and save what it makes into library/.
//
//   node tools/fal.mjs <model> --input '<json>' [--file key=path ...] --out library/name.ext [--what "alt text"] [--dry]
//
// e.g. node tools/fal.mjs fal-ai/flux-2-pro --input '{"prompt":"a worksheet on a kitchen table, morning light","image_size":{"width":1080,"height":1350}}' \
//        --out library/2026-11-24-table.png --what "A printed worksheet on a wooden kitchen table"
//      node tools/fal.mjs fal-ai/kling-video/v3/pro/image-to-video --file image_url=library/photo.jpg \
//        --input '{"prompt":"slow push-in, steam rising from the mug","duration":"5"}' --out library/clip.mp4
//
// --file key=path puts a local file into the input as a data: address (or key=https://… as a link).
// --dry prints what would be sent (without the key and without the file's bytes) and stops.
// Uses fal's queue: submit, wait, fetch the result. Model names and inputs: fal.ai/models (each model's API tab).

import { addToLibrary, dataUri, download, fail, need, parseArgs } from "./lib.mjs";

const a = parseArgs(process.argv.slice(2));
const model = a._[0];
if (!model || !a.out) fail("Usage: node tools/fal.mjs <model> --input '<json>' [--file key=path] --out library/name.ext");

let input = {};
if (a.input) {
  try {
    input = JSON.parse(a.input);
  } catch {
    fail("--input must be JSON, e.g. '{\"prompt\":\"…\"}'");
  }
}
for (const f of [].concat(a.file ?? [])) {
  const i = String(f).indexOf("=");
  if (i < 1) fail(`--file wants key=path, got: ${f}`);
  const k = f.slice(0, i);
  const v = f.slice(i + 1);
  input[k] = /^https?:\/\//.test(v) ? v : dataUri(v);
}

if (a.dry) {
  const shown = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" && v.startsWith("data:") ? `${v.slice(0, 30)}… (${Math.round(v.length / 1024)} KB)` : v]));
  console.log(JSON.stringify({ post: `https://queue.fal.run/${model}`, input: shown, out: a.out }, null, 2));
  process.exit(0);
}

const KEY = need("FAL_KEY", "fal.ai/dashboard/keys");
const head = { Authorization: `Key ${KEY}`, "Content-Type": "application/json" };

const sub = await fetch(`https://queue.fal.run/${model}`, { method: "POST", headers: head, body: JSON.stringify(input) });
if (!sub.ok) fail(`fal refused it (${sub.status}): ${(await sub.text()).slice(0, 600)}`);
const job = await sub.json();
if (!job.status_url || !job.response_url) fail(`fal's answer had no job in it: ${JSON.stringify(job).slice(0, 400)}`);
process.stderr.write(`Sent to fal (${job.request_id}). Waiting`);

const started = Date.now();
const LIMIT = 15 * 60e3; // video can take a few minutes
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await fetch(job.status_url, { headers: head });
  const st = s.ok ? await s.json() : { status: `HTTP ${s.status}` };
  if (st.status === "COMPLETED") break;
  if (!["IN_QUEUE", "IN_PROGRESS"].includes(st.status)) fail(`\nfal stopped: ${JSON.stringify(st).slice(0, 600)}`);
  if (Date.now() - started > LIMIT) fail(`\nStill not done after 15 minutes. Check it later: ${job.response_url}`);
  process.stderr.write(".");
}
process.stderr.write("\n");

const res = await fetch(job.response_url, { headers: head });
if (!res.ok) fail(`fal finished but the result didn't come (${res.status}): ${(await res.text()).slice(0, 400)}`);
const out = await res.json();

// The file is somewhere in the answer: video.url, images[0].url, audio.url, image.url…
const find = (o) => {
  if (!o || typeof o !== "object") return null;
  if (typeof o.url === "string" && /^https?:/.test(o.url)) return o.url;
  for (const k of ["video", "images", "image", "audio", "audio_file", "output"]) if (o[k]) { const u = find(Array.isArray(o[k]) ? o[k][0] : o[k]); if (u) return u; }
  for (const v of Object.values(o)) { const u = find(Array.isArray(v) ? v[0] : v); if (u) return u; }
  return null;
};
const url = find(out);
if (!url) fail(`fal finished but there's no file in the answer: ${JSON.stringify(out).slice(0, 600)}`);

const saved = await download(url, a.out);
addToLibrary(saved, a.what ?? input.prompt ?? "", `fal ${model}`);
console.log(JSON.stringify({ saved, link: url, note: "fal's links don't last forever: give the link to Posthuman (add_media_from_url) soon, or upload the saved file." }, null, 2));
