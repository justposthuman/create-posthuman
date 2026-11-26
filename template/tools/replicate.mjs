#!/usr/bin/env node
// Run any model on Replicate with your own token (REPLICATE_API_TOKEN in .env) and save what it makes into library/.
//
//   node tools/replicate.mjs black-forest-labs/flux-1.1-pro --input '{"prompt":"…","aspect_ratio":"4:5"}' --out library/name.png
//   node tools/replicate.mjs owner/model:versionhash --input '{…}' --file image=library/photo.jpg --out library/clip.mp4
//   ... [--what "alt text"] [--dry]
//
// Model names and inputs: replicate.com/explore (each model's API tab). Prices are per model, on its page.
// --file key=path puts a local file into the input as a data: address (or key=https://… as a link).

import { addToLibrary, dataUri, download, fail, need, parseArgs } from "./lib.mjs";

const API = (process.env.REPLICATE_API_BASE || "https://api.replicate.com/v1").replace(/\/+$/, "");
const a = parseArgs(process.argv.slice(2));
const model = a._[0];
if (!model || !a.out) fail("Usage: node tools/replicate.mjs owner/model[:version] --input '<json>' [--file key=path] --out library/name.ext");

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
// owner/name → the model's own endpoint; owner/name:version → a pinned version
const [name, version] = String(model).split(":");
const url = version ? `${API}/predictions` : `${API}/models/${name}/predictions`;
const body = version ? { version, input } : { input };

if (a.dry) {
  const shown = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, typeof v === "string" && v.startsWith("data:") ? `${v.slice(0, 30)}… (${Math.round(v.length / 1024)} KB)` : v]));
  console.log(JSON.stringify({ post: url, ...(version ? { version } : {}), input: shown, out: a.out }, null, 2));
  process.exit(0);
}
const head = { Authorization: `Bearer ${need("REPLICATE_API_TOKEN", "replicate.com/account/api-tokens")}`, "Content-Type": "application/json" };
let r = await fetch(url, { method: "POST", headers: { ...head, Prefer: "wait=60" }, body: JSON.stringify(body) });
if (!r.ok) fail(`Replicate refused it (${r.status}): ${(await r.text()).slice(0, 400)}`);
let p = await r.json();
const started = Date.now();
while (!["succeeded", "failed", "canceled"].includes(p.status)) {
  if (Date.now() - started > 15 * 60e3) fail(`Still running after 15 minutes: ${p.urls?.get}`);
  await new Promise((ok) => setTimeout(ok, 3000));
  process.stdout.write(".");
  r = await fetch(p.urls.get, { headers: head });
  p = await r.json();
}
if (p.status !== "succeeded") fail(`\nReplicate stopped: ${p.status}${p.error ? `: ${String(p.error).slice(0, 400)}` : ""}`);
const link = [].concat(p.output ?? []).find((x) => typeof x === "string" && /^https?:\/\//.test(x));
if (!link) fail(`\nReplicate finished but there's no file in the answer: ${JSON.stringify(p.output).slice(0, 300)}`);
const saved = await download(link, a.out);
addToLibrary(saved, a.what || input.prompt || model, `Replicate ${name}`);
console.log(JSON.stringify({ saved }, null, 2));
