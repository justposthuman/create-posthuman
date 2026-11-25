#!/usr/bin/env node
// Put a voiceover (or music) on a clip with ffmpeg, keeping the clip's own sound quietly underneath.
//
//   node tools/mix.mjs --video library/clip.mp4 --audio library/voice.mp3 --out library/clip-voiced.mp4 [--under 0.15] [--dry]
//
// --under is how loud the clip's own sound stays (0 = gone, 1 = as it was; default 0.15). The video is copied as it
// is (not re-encoded); the result is as long as the clip. Needs ffmpeg (ffmpeg -version).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { addToLibrary, fail, parseArgs } from "./lib.mjs";

const a = parseArgs(process.argv.slice(2));
if (!a.video || !a.audio || !a.out) fail("Usage: node tools/mix.mjs --video clip.mp4 --audio voice.mp3 --out library/clip-voiced.mp4");
for (const f of [a.video, a.audio]) if (!fs.existsSync(f)) fail(`No such file: ${f}`);
const under = a.under === undefined ? 0.15 : Number(a.under);
if (!(under >= 0 && under <= 1)) fail("--under is between 0 and 1.");

const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", String(a.video)], { encoding: "utf8" });
if (probe.error) fail("ffmpeg isn't installed (ffprobe not found). Install it from your package manager, then try again.");
const clipHasSound = !!probe.stdout.trim();

const filter = clipHasSound && under > 0
  ? `[0:a]volume=${under}[bed];[1:a]volume=1[v];[bed][v]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`
  : `[1:a]apad[a]`;
const args = ["-y", "-i", String(a.video), "-i", String(a.audio), "-filter_complex", filter, "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", String(a.out)];

if (a.dry) {
  console.log(["ffmpeg", ...args.map((x) => (/[\s;\[\]]/.test(x) ? `'${x}'` : x))].join(" "));
  process.exit(0);
}
fs.mkdirSync(path.dirname(path.resolve(String(a.out))), { recursive: true });
const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
if (r.status !== 0) fail(`ffmpeg failed:\n${(r.stderr || "").split("\n").slice(-12).join("\n")}`);
addToLibrary(String(a.out), `${path.basename(String(a.video))} with ${path.basename(String(a.audio))}`, "ffmpeg (tools/mix.mjs)");
console.log(JSON.stringify({ saved: path.resolve(String(a.out)) }, null, 2));
