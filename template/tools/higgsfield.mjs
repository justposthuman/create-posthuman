#!/usr/bin/env node
// Higgsfield with your own API credential (HF_API_KEY_ID and HF_API_KEY_SECRET in .env, from console.higgsfield.ai).
// The API is billed apart from a higgsfield.ai plan.
//
//   node tools/higgsfield.mjs higgsfield/cinema-studio/4.0 --input '{"prompt":"a slow dolly-in on a desk at night"}' --out library/desk.mp4
//   node tools/higgsfield.mjs <endpoint id> --input '{…}' [--file image_url=https://…] --out library/name.ext [--what "alt"] [--dry]
//
// Each model has its own endpoint id and inputs: docs.higgsfield.ai → Models → the model's page. Many of the same
// models (Kling, Hailuo, Wan, Recraft, Ideogram) are also on fal (tools/fal.mjs) and Replicate.
// --file key=path puts a local file in as a data: address; if a model wants a link, give key=https://… instead.

import crypto from "node:crypto";
import { addToLibrary, dataUri, download, fail, key, parseArgs } from "./lib.mjs";

const API = (process.env.HIGGSFIELD_API_BASE || "https://api.higgsfield.ai").replace(/\/+$/, "");
const a = parseArgs(process.argv.slice(2));
const endpoint = String(a._[0] ?? "").replace(/^\/+/, "");
if (!endpoint || !a.out) fail("Usage: node tools/higgsfield.mjs <endpoint id, e.g. higgsfield/cinema-studio/4.0> --input '<json>' --out library/name.ext");

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
  const v = f.slice(i + 1);
  input[f.slice(0, i)] = /^https?:\/\//.test(v) ? v : dataUri(v);
}

if (a.dry) {
  const shown = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" && v.startsWith("data:") ? `${v.slice(0, 30)}… (${Math.round(v.length / 1024)} KB)` : v]));
  console.log(JSON.stringify({ post: `${API}/${endpoint}`, input: shown, out: a.out }, null, 2));
  process.exit(0);
}
const id = key("HF_API_KEY_ID"), secret = key("HF_API_KEY_SECRET");
if (!id || !secret) fail("HF_API_KEY_ID and HF_API_KEY_SECRET aren't both set. Add them to .env (copy .env.example): make a credential at console.higgsfield.ai.");
const head = { Authorization: `Key ${id}:${secret}`, "Content-Type": "application/json" };

const sub = await fetch(`${API}/${endpoint}`, { method: "POST", headers: { ...head, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(input) });
if (!sub.ok) fail(`Higgsfield refused it (${sub.status}): ${(await sub.text()).slice(0, 400)}`);
const job = await sub.json();
const statusUrl = job.status_url || (job.request_id && `${API}/requests/${job.request_id}/status`);
if (!statusUrl) fail(`Higgsfield's answer had no request in it: ${JSON.stringify(job).slice(0, 300)}`);

const started = Date.now();
let st = job;
while (!["completed", "failed", "nsfw", "canceled"].includes(st.status)) {
  if (Date.now() - started > 20 * 60e3) fail(`Still running after 20 minutes: ${statusUrl}`);
  await new Promise((ok) => setTimeout(ok, 4000));
  process.stdout.write(".");
  const r = await fetch(statusUrl, { headers: head });
  st = r.ok ? await r.json() : { status: "in_progress" };
}
if (st.status !== "completed") fail(`\nHiggsfield stopped: ${st.status}${st.status === "nsfw" ? " (it flagged the content)" : ""}`);
const link = st.video?.url || st.images?.[0]?.url || st.audio?.url || st.audios?.[0]?.url;
if (!link) fail(`\nHiggsfield finished but there's no file in the answer: ${JSON.stringify(st).slice(0, 300)}`);
const saved = await download(link, a.out);
addToLibrary(saved, a.what || input.prompt || endpoint, `Higgsfield ${endpoint}`);
console.log(JSON.stringify({ saved, note: "Higgsfield's links expire: the file is saved here now." }, null, 2));
