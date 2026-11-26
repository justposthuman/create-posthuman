#!/usr/bin/env node
// OpenAI with your own key (OPENAI_API_KEY in .env): images, photo edits, voiceovers, transcripts.
//
//   node tools/openai.mjs image "a hand-drawn sign that says OPEN" --out library/sign.png [--size 1024x1536] [--what "alt"]
//   node tools/openai.mjs edit library/shot.png "put this screenshot on a phone on a desk" --out library/shot-phone.png
//   node tools/openai.mjs speak "Most of what I build starts with me needing it." --out library/line.mp3 [--voice alloy] [--how "warm, unhurried"]
//   node tools/openai.mjs transcribe library/clip.mp4 --out library/clip.srt        (tools/captions.mjs burns them in)
//   ... [--model name] [--dry]
//
// Rough prices (2026-11, platform.openai.com/pricing): an image about 4-7¢ (gpt-image-1, medium), a minute of
// voice about 1.5¢ (gpt-4o-mini-tts), a minute of transcript about 0.6¢ (whisper-1). --dry prints the request.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addToLibrary, fail, need, parseArgs, save, typeOf } from "./lib.mjs";

const API = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
const SIZES = ["1024x1024", "1024x1536", "1536x1024", "auto"];

/** Words with their times → captions a few words at a time (how Reels and TikTok captions read). Pure: the test reads it. */
export function wordsToSrt(words, { most = 4, longest = 1.6 } = {}) {
  const t = (s) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const p = (n, w = 2) => String(n).padStart(w, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  const cues = [];
  let cur = [];
  for (const w of words) {
    cur.push(w);
    const span = cur.at(-1).end - cur[0].start;
    if (cur.length >= most || span >= longest || /[.!?,;:]$/.test(String(w.word).trim())) {
      cues.push(cur);
      cur = [];
    }
  }
  if (cur.length) cues.push(cur);
  return cues.map((c, i) => `${i + 1}\n${t(c[0].start)} --> ${t(c.at(-1).end)}\n${c.map((w) => String(w.word).trim()).join(" ")}\n`).join("\n");
}

async function call(pathname, init, what) {
  const r = await fetch(`${API}${pathname}`, { ...init, headers: { Authorization: `Bearer ${need("OPENAI_API_KEY", "platform.openai.com/api-keys")}`, ...(init.headers ?? {}) } });
  if (!r.ok) fail(`OpenAI ${what} failed (${r.status}): ${(await r.text()).slice(0, 400)}`);
  return r;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, ...rest] = a._;
  const out = typeof a.out === "string" ? a.out : "";
  if (!cmd || !out) fail('Usage: node tools/openai.mjs image|edit|speak|transcribe … --out library/name.ext   (see the top of this file)');

  if (cmd === "image" || cmd === "edit") {
    const src = cmd === "edit" ? rest[0] : null;
    const prompt = String(cmd === "edit" ? rest[1] ?? "" : rest[0] ?? "").trim();
    if (!prompt) fail(cmd === "edit" ? 'Usage: node tools/openai.mjs edit library/photo.png "what to change" --out …' : 'Say what the image shows: node tools/openai.mjs image "…" --out …');
    if (src && !fs.existsSync(src)) fail(`No such file: ${src}`);
    const size = typeof a.size === "string" ? a.size : "1024x1536";
    if (!SIZES.includes(size)) fail(`--size is one of ${SIZES.join(", ")}.`);
    const model = typeof a.model === "string" ? a.model : "gpt-image-1";
    if (a.dry) {
      console.log(JSON.stringify({ post: `${API}/images/${src ? "edits" : "generations"}`, model, prompt, size, ...(src ? { image: src } : {}), out }, null, 2));
      process.exit(0);
    }
    let r;
    if (src) {
      const form = new FormData();
      form.set("model", model);
      form.set("prompt", prompt);
      form.set("size", size);
      form.set("image[]", new Blob([fs.readFileSync(src)], { type: typeOf(src) }), path.basename(src));
      r = await call("/images/edits", { method: "POST", body: form }, "image edit");
    } else {
      r = await call("/images/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt, size, quality: "medium" }) }, "image");
    }
    const b64 = (await r.json()).data?.[0]?.b64_json;
    if (!b64) fail("OpenAI answered without a picture.");
    const saved = save(out, Buffer.from(b64, "base64"));
    addToLibrary(saved, a.what || prompt, `OpenAI ${model}${src ? ` (edit of ${path.basename(src)})` : ""}`);
    console.log(JSON.stringify({ saved }, null, 2));
  } else if (cmd === "speak") {
    const text = String(rest[0] ?? "").trim();
    if (!text) fail('Usage: node tools/openai.mjs speak "the words" --out library/line.mp3');
    const body = { model: typeof a.model === "string" ? a.model : "gpt-4o-mini-tts", voice: typeof a.voice === "string" ? a.voice : "alloy", input: text, ...(typeof a.how === "string" ? { instructions: a.how } : {}), response_format: "mp3" };
    if (a.dry) {
      console.log(JSON.stringify({ post: `${API}/audio/speech`, ...body, out }, null, 2));
      process.exit(0);
    }
    const r = await call("/audio/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, "voice");
    const saved = save(out, Buffer.from(await r.arrayBuffer()));
    addToLibrary(saved, `Voiceover: "${text.slice(0, 80)}"`, `OpenAI ${body.model} (${body.voice})`);
    console.log(JSON.stringify({ saved, characters: text.length }, null, 2));
  } else if (cmd === "transcribe") {
    const src = rest[0];
    if (!src || !fs.existsSync(src)) fail(`No such file: ${src ?? "(none)"}`);
    const model = typeof a.model === "string" ? a.model : "whisper-1";
    if (a.dry) {
      console.log(JSON.stringify({ post: `${API}/audio/transcriptions`, model, file: src, timestamps: "word", out }, null, 2));
      process.exit(0);
    }
    // Just the sound, small (mono, 16 kHz): the upload limit is 25 MB and a clip's video isn't needed.
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "words-")), "sound.mp3");
    const ff = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", tmp]);
    if (ff.error || ff.status !== 0) fail(`ffmpeg couldn't take the sound out of ${src} (is ffmpeg installed, and does the clip have sound?).`);
    const form = new FormData();
    form.set("model", model);
    form.set("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    if (typeof a.lang === "string") form.set("language", a.lang);
    form.set("file", new Blob([fs.readFileSync(tmp)], { type: "audio/mpeg" }), "sound.mp3");
    const r = await call("/audio/transcriptions", { method: "POST", body: form }, "transcript");
    const j = await r.json();
    if (!j.words?.length) fail("No words heard in that clip.");
    const saved = save(out, Buffer.from(wordsToSrt(j.words)));
    console.log(JSON.stringify({ saved, words: j.words.length, text: String(j.text ?? "").slice(0, 300) }, null, 2));
  } else fail(`Unknown: ${cmd}. Use image, edit, speak or transcribe.`);
}
