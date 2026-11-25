#!/usr/bin/env node
// Make a wide clip or photo fit Reels, TikTok, Shorts (9:16) or an Instagram picture (4:5, 1:1). Free, with ffmpeg.
//
//   node tools/vertical.mjs library/clip.mp4                       9:16, the clip sharp over a blurred copy of itself
//   node tools/vertical.mjs library/clip.mp4 --fit crop            9:16, cut to fill (loses the sides)
//   node tools/vertical.mjs library/photo.png --size 4:5           an Instagram picture
//   ... [--out library/name.mp4] [--dry]
//
// blur (the default) keeps the whole picture: nothing important gets cut off. crop fills the frame but cuts the
// sides of a wide clip, so only use it when the thing is in the middle. The sound is kept. The new file goes next to
// the old one (`-vertical`, `-4x5`, `-square`) with a line in library/INDEX.md. Needs ffmpeg (ffmpeg -version).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { addToLibrary, fail, parseArgs } from "./lib.mjs";

export const SIZES = { "9:16": { w: 1080, h: 1920, tag: "vertical" }, "4:5": { w: 1080, h: 1350, tag: "4x5" }, "1:1": { w: 1080, h: 1080, tag: "square" } };
const PICTURE = /\.(jpe?g|png|webp)$/i;

/** ffmpeg's arguments for one file (pure, so the test can read them). */
export function verticalArgs(input, out, { size = "9:16", fit = "blur" } = {}) {
  const s = SIZES[size];
  if (!s) throw new Error(`--size is one of ${Object.keys(SIZES).join(", ")}.`);
  if (!["blur", "crop"].includes(fit)) throw new Error("--fit is blur or crop.");
  const { w, h } = s;
  const fill = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const filter = fit === "crop" ? `[0:v]${fill},setsar=1[v]` : `[0:v]${fill},boxblur=30:3,eq=brightness=-0.06[bg];[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
  const picture = PICTURE.test(input);
  return picture
    ? ["-y", "-i", input, "-filter_complex", filter, "-map", "[v]", "-frames:v", "1", out]
    : ["-y", "-i", input, "-filter_complex", filter, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const a = parseArgs(process.argv.slice(2));
  const input = a._[0];
  if (!input) fail("Usage: node tools/vertical.mjs library/clip.mp4 [--size 9:16|4:5|1:1] [--fit blur|crop] [--out library/name.mp4]");
  if (!fs.existsSync(input)) fail(`No such file: ${input}`);
  const size = typeof a.size === "string" ? a.size : "9:16";
  const fit = typeof a.fit === "string" ? a.fit : "blur";
  const ext = path.extname(input);
  const out = typeof a.out === "string" ? a.out : path.join(path.dirname(input), `${path.basename(input, ext)}-${SIZES[size]?.tag ?? "x"}${ext}`);
  let args;
  try {
    args = verticalArgs(String(input), String(out), { size, fit });
  } catch (e) {
    fail(e.message);
  }
  if (a.dry) {
    console.log(["ffmpeg", ...args.map((x) => (/[\s;\[\]=:,]/.test(x) ? `'${x}'` : x))].join(" "));
    process.exit(0);
  }
  if (spawnSync("ffmpeg", ["-version"]).error) fail("ffmpeg isn't installed. Install it from your package manager, then try again.");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) fail(`ffmpeg failed:\n${(r.stderr || "").split("\n").slice(-12).join("\n")}`);
  addToLibrary(out, `${path.basename(input)} as ${size}${fit === "blur" ? ", over a blurred copy of itself" : ", cropped to fill"}`, "ffmpeg (tools/vertical.mjs)");
  console.log(JSON.stringify({ saved: path.resolve(out), size, fit }, null, 2));
}
