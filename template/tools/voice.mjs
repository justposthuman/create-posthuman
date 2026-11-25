#!/usr/bin/env node
// ElevenLabs: a voiceover from a script, or a list of your voices.
//
//   node tools/voice.mjs --list
//   node tools/voice.mjs --text-file posts/2026-11-24-slug.script.txt --out library/2026-11-24-voice.mp3 [--voice <id>] [--model eleven_v4] [--dry]
//   node tools/voice.mjs --text "Short line to read" --out library/line.mp3
//   node tools/voice.mjs --sfx "a page turning, quiet room" --seconds 3 --out library/page.mp3
//
// The voice comes from --voice or ELEVENLABS_VOICE_ID in .env. ElevenLabs hands back the audio itself, saved to --out.
// Put it on a clip with ffmpeg (recipes/voiceover.md). Checked against ElevenLabs' docs 2026-11-20.

import fs from "node:fs";
import { addToLibrary, fail, key, need, parseArgs, save } from "./lib.mjs";

const a = parseArgs(process.argv.slice(2));
const API = "https://api.elevenlabs.io";

if (a.list) {
  const KEY = need("ELEVENLABS_API_KEY", "elevenlabs.io (Developers → API keys)");
  const r = await fetch(`${API}/v2/voices?page_size=100`, { headers: { "xi-api-key": KEY } });
  if (!r.ok) fail(`ElevenLabs said ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const { voices = [] } = await r.json();
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}${v.labels ? `  (${Object.values(v.labels).join(", ")})` : ""}`);
  process.exit(0);
}

if (!a.out) fail("Say where to save it: --out library/name.mp3");

let url, body, what;
if (a.sfx) {
  const seconds = a.seconds ? Number(a.seconds) : undefined;
  if (seconds !== undefined && !(seconds >= 0.5 && seconds <= 30)) fail("--seconds is 0.5 to 30.");
  url = `${API}/v1/sound-generation?output_format=mp3_44100_128`;
  body = { text: String(a.sfx), ...(seconds ? { duration_seconds: seconds } : {}) };
  what = `Sound: ${a.sfx}`;
} else {
  const text = a["text-file"] ? fs.readFileSync(String(a["text-file"]), "utf8").trim() : typeof a.text === "string" ? a.text.trim() : "";
  if (!text) fail("Give it the words: --text-file path or --text \"…\"");
  const voice = typeof a.voice === "string" ? a.voice : key("ELEVENLABS_VOICE_ID");
  if (!voice) fail("Which voice? --voice <id>, or ELEVENLABS_VOICE_ID in .env (node tools/voice.mjs --list shows yours).");
  url = `${API}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`;
  body = { text, model_id: typeof a.model === "string" ? a.model : "eleven_v4" };
  what = `Voiceover: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`;
}

if (a.dry) {
  console.log(JSON.stringify({ post: url, body, out: a.out, characters: body.text.length }, null, 2));
  process.exit(0);
}

const KEY = need("ELEVENLABS_API_KEY", "elevenlabs.io (Developers → API keys)");
const r = await fetch(url, { method: "POST", headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(body) });
if (!r.ok) fail(`ElevenLabs said ${r.status}: ${(await r.text()).slice(0, 600)}`);
const saved = save(String(a.out), Buffer.from(await r.arrayBuffer()));
addToLibrary(saved, what, a.sfx ? "ElevenLabs sound effects" : `ElevenLabs ${body.model_id}`);
console.log(JSON.stringify({ saved, characters: body.text.length }, null, 2));
