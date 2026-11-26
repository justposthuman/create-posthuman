#!/usr/bin/env node
// Google Gemini with your own key (GEMINI_API_KEY in .env, from aistudio.google.com/apikey): a picture from words,
// or a photo changed with words ("Nano Banana").
//
//   node tools/gemini.mjs edit library/shot.png "put this app screenshot on a phone lying on a wooden desk" --out library/shot-desk.png
//   node tools/gemini.mjs image "a cozy desk at night, a laptop showing a calendar" --out library/desk.png
//   ... [--model gemini-2.5-flash-image] [--what "alt text"] [--dry]
//
// About 4¢ an image (2026-11, ai.google.dev/pricing; the free tier changes, check yours). Edits keep what you
// don't mention, so say only what should change. Video (Veo) is on fal with the same models: tools/fal.mjs.

import fs from "node:fs";
import path from "node:path";
import { addToLibrary, fail, need, parseArgs, save, typeOf } from "./lib.mjs";

const API = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");

const a = parseArgs(process.argv.slice(2));
const [cmd, ...rest] = a._;
const out = typeof a.out === "string" ? a.out : "";
if (!["image", "edit"].includes(cmd) || !out) fail('Usage: node tools/gemini.mjs edit library/photo.png "what to change" --out library/new.png   or   image "what it shows" --out …');
const src = cmd === "edit" ? rest[0] : null;
const prompt = String(cmd === "edit" ? rest[1] ?? "" : rest[0] ?? "").trim();
if (!prompt) fail("Say what it shows, or what to change.");
if (src && !fs.existsSync(src)) fail(`No such file: ${src}`);
const model = typeof a.model === "string" ? a.model : "gemini-2.5-flash-image";
const parts = [{ text: prompt }, ...(src ? [{ inline_data: { mime_type: typeOf(src), data: fs.readFileSync(src).toString("base64") } }] : [])];

if (a.dry) {
  console.log(JSON.stringify({ post: `${API}/models/${model}:generateContent`, prompt, ...(src ? { image: src } : {}), out }, null, 2));
  process.exit(0);
}
const r = await fetch(`${API}/models/${model}:generateContent`, {
  method: "POST",
  headers: { "x-goog-api-key": need("GEMINI_API_KEY", "aistudio.google.com/apikey"), "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
});
if (!r.ok) fail(`Gemini failed (${r.status}): ${(await r.text()).slice(0, 400)}`);
const j = await r.json();
const pic = (j.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data || p.inline_data?.data);
if (!pic) fail(`Gemini answered without a picture: ${JSON.stringify(j).slice(0, 300)}`);
const saved = save(out, Buffer.from((pic.inlineData ?? pic.inline_data).data, "base64"));
addToLibrary(saved, a.what || prompt, `Google ${model}${src ? ` (edit of ${path.basename(src)})` : ""}`);
console.log(JSON.stringify({ saved }, null, 2));
