#!/usr/bin/env node
// Captions burned into a clip, a few words at a time, the way Reels, TikTok and Shorts are watched (sound off).
//
//   node tools/captions.mjs library/clip.mp4                   hear the words (OpenAI Whisper), write library/clip.srt, burn them in
//   node tools/captions.mjs library/clip.mp4 --srt library/clip.srt    burn in captions you fixed by hand (no OpenAI)
//   ... [--out library/clip-captions.mp4] [--lang en] [--dry]
//
// The words are heard, not made up, but a name or a brand can come out wrong: the .srt is plain text, so read it,
// fix a word, then run again with --srt. Needs ffmpeg; hearing the words needs OPENAI_API_KEY (about 0.6¢ a minute).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addToLibrary, fail, parseArgs } from "./lib.mjs";

// Big, bold, white with a dark edge, low in the frame but above the apps' own buttons.
export const STYLE = "Fontsize=16,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=70";

/** ffmpeg's arguments to burn captions.srt (sitting in ffmpeg's working folder) into a clip. Pure: the test reads it. */
export const burnArgs = (input, out) => ["-y", "-i", input, "-vf", `subtitles=captions.srt:force_style='${STYLE}'`, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out];

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const a = parseArgs(process.argv.slice(2));
  const input = a._[0];
  if (!input) fail("Usage: node tools/captions.mjs library/clip.mp4 [--srt library/clip.srt] [--out library/clip-captions.mp4]");
  if (!fs.existsSync(input)) fail(`No such file: ${input}`);
  const ext = path.extname(input);
  const base = path.join(path.dirname(input), path.basename(input, ext));
  const out = typeof a.out === "string" ? a.out : `${base}-captions.mp4`;
  const srt = typeof a.srt === "string" ? a.srt : `${base}.srt`;
  if (a.dry) {
    console.log(JSON.stringify({ hear: typeof a.srt === "string" ? "no (your .srt)" : `node tools/openai.mjs transcribe ${input} --out ${srt}`, burn: ["ffmpeg", ...burnArgs(path.resolve(input), path.resolve(out))].join(" "), out }, null, 2));
    process.exit(0);
  }
  if (spawnSync("ffmpeg", ["-version"]).error) fail("ffmpeg isn't installed. Install it from your package manager, then try again.");
  if (typeof a.srt !== "string") {
    const here = path.dirname(new URL(import.meta.url).pathname);
    const r = spawnSync(process.execPath, [path.join(here, "openai.mjs"), "transcribe", input, "--out", srt, ...(typeof a.lang === "string" ? ["--lang", a.lang] : [])], { stdio: "inherit" });
    if (r.status !== 0) process.exit(r.status ?? 1);
  } else if (!fs.existsSync(srt)) fail(`No such file: ${srt}`);
  // ffmpeg's subtitles filter is fussy about paths: it reads captions.srt from a folder of its own.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "captions-"));
  fs.copyFileSync(srt, path.join(work, "captions.srt"));
  const r = spawnSync("ffmpeg", ["-v", "error", ...burnArgs(path.resolve(input), path.resolve(out))], { cwd: work, encoding: "utf8" });
  if (r.status !== 0) fail(`ffmpeg failed:\n${(r.stderr || "").split("\n").slice(-12).join("\n")}`);
  addToLibrary(out, `${path.basename(input)} with captions`, "ffmpeg (tools/captions.mjs), words heard by OpenAI Whisper");
  console.log(JSON.stringify({ saved: path.resolve(out), captions: path.resolve(srt), check: "Read the .srt: fix any wrong word, then run again with --srt." }, null, 2));
}
