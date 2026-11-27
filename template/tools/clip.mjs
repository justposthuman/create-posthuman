#!/usr/bin/env node
// Clip it: short clips out of a long video (a talk, a stream, a podcast, a screen recording with you explaining).
//
//   node tools/clip.mjs hear library/talk.mp4                    hear the words (OpenAI Whisper, under 1¢ a minute)
//   node tools/clip.mjs hear library/talk.mp4 --srt talk.vtt     or use a captions file you already have (free;
//                                                                YouTube lets you download yours as .srt or .vtt)
//   node tools/clip.mjs lines library/talk.mp4                   the transcript as "[12:03] what was said" lines
//   node tools/clip.mjs cut library/talk.mp4 --from 12:03 --to 12:41 [--size 9:16|4:5|1:1|wide] [--fit blur|crop]
//                                                                [--no-captions] [--name "a few words"] [--dry]
//
// "hear" writes library/talk.transcript.json next to the video. Your agent reads the lines and suggests the clips
// (Studio: Make → Clip it does all of it on one card). "cut" makes one clip: cut out, turned vertical (the whole
// picture over a blurred copy of itself, or --fit crop to fill), the words burned in a few at a time, saved in the
// library with a line in INDEX.md.
//
// It finds moments from what's SAID, not what's shown: a great silent moment won't come up. Needs ffmpeg.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { burnArgs } from "./captions.mjs";
import { addToLibrary, fail, parseArgs, save } from "./lib.mjs";
import { wordsToSrt } from "./openai.mjs";
import { SIZES, verticalArgs } from "./vertical.mjs";

// ---------- pure: the test reads these ----------

/** "75", "1:15", "1:02:03.5", "01:02:03,500" → seconds. NaN when it isn't a time. */
export function parseTime(s) {
  const t = String(s ?? "").trim().replace(",", ".");
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return NaN;
  return t.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
}
/** seconds → "4:05" or "1:02:03" */
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** A captions file (.srt or .vtt) → [{ start, end, text }]. */
export function cuesFromCaptions(text) {
  const time = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/g;
  const cues = [];
  for (const block of String(text).replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [a, b] = lines[at].match(time) ?? [];
    if (!a || !b) continue;
    const words = lines.slice(at + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (words) cues.push({ start: parseTime(a), end: parseTime(b), text: words });
  }
  // YouTube's own captions repeat each line as the next one rolls in: drop a cue that only repeats the one before it.
  return cues.filter((c, i) => !(i && cues[i - 1].text === c.text));
}

/** The transcript as lines for an agent: whole sentences, each up to about 15 seconds, with the time it starts. */
export function transcriptLines(t) {
  const out = [];
  let cur = null;
  for (const g of t.segments ?? []) {
    if (!cur) cur = { start: g.start, end: g.end, text: g.text };
    else { cur.end = g.end; cur.text += ` ${g.text}`; }
    if (/[.!?]["')\]]?$/.test(cur.text) || cur.end - cur.start >= 15) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out.map((l) => `[${clock(l.start)}] ${l.text.replace(/\s+/g, " ").trim()}`).join("\n");
}

/** Captions for one clip, its times starting at 0, a few words at a time: from each word's time when the words were
 *  heard; from a captions file's lines, each line's words spread evenly over its time (close enough to read along). */
export function windowSrt(t, from, to) {
  const words = t.words?.length
    ? t.words
    : (t.segments ?? []).flatMap((g) => {
        const ws = g.text.split(/\s+/).filter(Boolean);
        const step = (g.end - g.start) / Math.max(1, ws.length);
        return ws.map((w, i) => ({ word: w, start: g.start + i * step, end: g.start + (i + 1) * step }));
      });
  return wordsToSrt(words.filter((w) => w.end > from && w.start < to).map((w) => ({ word: w.word, start: Math.max(0, w.start - from), end: Math.min(to, w.end) - from })));
}

/** ffmpeg's arguments to cut [from, to] out of a video and shape it. Pure: the test reads it. */
export function cutArgs(input, out, { from, to, size = "9:16", fit = "blur" }) {
  const span = ["-ss", String(from), "-to", String(to)];
  if (size === "wide") return ["-y", ...span, "-i", input, "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
  const v = verticalArgs(input, out, { size, fit }); // ["-y", "-i", input, …]
  return ["-y", ...span, ...v.slice(1)];
}

/** What an agent is asked: the moments worth a clip, from the transcript's lines (in a file it reads). */
export function suggestPrompt({ linesFile, seconds, brand = "", voice = "", topics = [], goal = "" }) {
  return [
    `You're finding short clips in a long video (${clock(seconds)} long) for ${brand || "the user"} to post on Reels, TikTok, Shorts and X.`,
    `Read the transcript in ${linesFile}: one line per sentence or two, each starting with the time it's said.`,
    "",
    "Pick 3 to 6 moments that work on their own, to someone scrolling with the sound off who has never seen the rest:",
    "- It starts on a line that makes someone stop: a claim, a number, a question, a story starting, a strong opinion. Not on \"so\", \"um\" or a reply to something earlier.",
    "- It ends on a finished thought, not mid-sentence.",
    "- 15 to 60 seconds. Shorter is better when the point lands sooner.",
    "- It gives the viewer something real (a tip, a story, a number, a reason), not only a joke.",
    topics.length ? `- Prefer moments about these topics: ${topics.join(", ")}.` : "",
    goal ? `- What posting is for: ${goal}` : "",
    voice ? `- How they sound (pick moments that sound like this):\n${voice.slice(0, 1200)}` : "",
    "- You only have the words. Never pick a moment for something you guess is on screen.",
    "",
    'Answer with ONLY a JSON array, best first: [{"from":"m:ss","to":"m:ss","hook":"its first line, word for word","why":"one short line: why someone would stop on it","topic":"one of the topics, or \\"\\""}]',
  ].filter((l) => l !== "").join("\n");
}

/** The agent's answer → clips that can really be cut: inside the video, 8 to 90 seconds, snapped to whole sentences,
 *  not overlapping, at most 8. */
export function pickClips(answer, t) {
  const m = String(answer ?? "").match(/\[[\s\S]*\]/);
  if (!m) return [];
  let raw;
  try { raw = JSON.parse(m[0]); } catch { return []; }
  const segs = t.segments ?? [];
  const seconds = t.seconds || segs.at(-1)?.end || 0;
  const startOf = (x) => segs.filter((g) => g.start <= x + 0.5).at(-1)?.start ?? x;
  const endOf = (x) => segs.find((g) => g.end >= x - 0.5)?.end ?? x;
  const out = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    let from = parseTime(c?.from), to = parseTime(c?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    from = Math.max(0, startOf(from));
    to = Math.min(seconds || to, endOf(to));
    if (to - from < 8 || to - from > 90) continue;
    if (out.some((o) => from < o.to && to > o.from)) continue;
    out.push({ from: +from.toFixed(2), to: +to.toFixed(2), hook: String(c.hook ?? "").slice(0, 200), why: String(c.why ?? "").slice(0, 200), topic: String(c.topic ?? "").slice(0, 60) });
    if (out.length >= 8) break;
  }
  return out;
}

/** Where a video's transcript lives: next to it. */
export const transcriptOf = (video) => path.join(path.dirname(video), `${path.basename(video, path.extname(video))}.transcript.json`);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "clip";

// ---------- the command ----------

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const a = parseArgs(process.argv.slice(2));
  const [cmd, video] = a._;
  if (!["hear", "lines", "cut"].includes(cmd) || !video) fail("Usage: node tools/clip.mjs hear|lines|cut library/video.mp4 … (see the top of this file)");
  if (!fs.existsSync(video)) fail(`No such file: ${video}`);
  const tfile = transcriptOf(video);
  const here = path.dirname(new URL(import.meta.url).pathname);
  const probe = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout) || 0;

  if (cmd === "hear") {
    if (typeof a.srt === "string") {
      if (!fs.existsSync(a.srt)) fail(`No such file: ${a.srt}`);
      const segments = cuesFromCaptions(fs.readFileSync(a.srt, "utf8"));
      if (!segments.length) fail(`No captions found in ${a.srt} (is it an .srt or .vtt file?).`);
      save(tfile, Buffer.from(JSON.stringify({ source: path.basename(video), seconds: +(probe(video) || segments.at(-1).end).toFixed(2), heard_by: `your captions file (${path.basename(a.srt)})`, text: segments.map((g) => g.text).join(" "), segments, words: [] }, null, 1)));
    } else {
      if (a.dry) { console.log(JSON.stringify({ hear: `node tools/openai.mjs transcribe ${video} --out ${tfile}`, minutes: +(probe(video) / 60).toFixed(1) }, null, 2)); process.exit(0); }
      const r = spawnSync(process.execPath, [path.join(here, "openai.mjs"), "transcribe", video, "--out", tfile, ...(typeof a.lang === "string" ? ["--lang", a.lang] : [])], { stdio: ["ignore", "ignore", "inherit"] });
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
    const t = JSON.parse(fs.readFileSync(tfile, "utf8"));
    console.log(JSON.stringify({ saved: path.resolve(tfile), minutes: +(t.seconds / 60).toFixed(1), sentences: t.segments.length, heard_by: t.heard_by }, null, 2));
  } else if (cmd === "lines") {
    if (!fs.existsSync(tfile)) fail(`Hear it first: node tools/clip.mjs hear ${video}`);
    console.log(transcriptLines(JSON.parse(fs.readFileSync(tfile, "utf8"))));
  } else {
    const from = parseTime(a.from), to = parseTime(a.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) fail("Say where: --from 12:03 --to 12:41");
    const size = typeof a.size === "string" ? a.size : "9:16";
    if (size !== "wide" && !SIZES[size]) fail(`--size is one of ${[...Object.keys(SIZES), "wide"].join(", ")}.`);
    const fit = typeof a.fit === "string" ? a.fit : "blur";
    const words = a.captions !== false && !a["no-captions"];
    const t = fs.existsSync(tfile) ? JSON.parse(fs.readFileSync(tfile, "utf8")) : null;
    if (words && !t) fail(`No transcript for the captions yet: run "node tools/clip.mjs hear ${video}" first, or add --no-captions.`);
    const name = typeof a.name === "string" ? a.name : `${path.basename(video, path.extname(video))}-${clock(from).replace(/:/g, "m")}`;
    const out = typeof a.out === "string" ? a.out : path.join("library", `${new Date().toISOString().slice(0, 10)}-clip-${slug(name)}.mp4`);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "clip-"));
    const cut = words ? path.join(work, "cut.mp4") : path.resolve(out);
    if (a.dry) {
      console.log(JSON.stringify({ cut: ["ffmpeg", ...cutArgs(path.resolve(video), cut, { from, to, size, fit })].join(" "), captions: words ? windowSrt(t, from, to).split("\n").slice(0, 8).join("\n") : "none", out }, null, 2));
      process.exit(0);
    }
    if (spawnSync("ffmpeg", ["-version"]).error) fail("ffmpeg isn't installed. Install it from your package manager, then try again.");
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    let r = spawnSync("ffmpeg", ["-v", "error", ...cutArgs(path.resolve(video), cut, { from, to, size, fit })], { encoding: "utf8" });
    if (r.status !== 0) fail(`ffmpeg couldn't cut it:\n${(r.stderr || "").split("\n").slice(-10).join("\n")}`);
    if (words) {
      fs.writeFileSync(path.join(work, "captions.srt"), windowSrt(t, from, to));
      r = spawnSync("ffmpeg", ["-v", "error", ...burnArgs(cut, path.resolve(out))], { cwd: work, encoding: "utf8" });
      if (r.status !== 0) fail(`ffmpeg couldn't add the captions:\n${(r.stderr || "").split("\n").slice(-10).join("\n")}`);
    }
    const said = t ? transcriptLines({ segments: (t.segments ?? []).filter((g) => g.end > from && g.start < to) }).replace(/\[[\d:]+\] /g, "").replace(/\n/g, " ") : "";
    addToLibrary(out, `Clip ${clock(from)}–${clock(to)} of ${path.basename(video)}${said ? `: "${said.slice(0, 160)}${said.length > 160 ? "…" : ""}"` : ""}`, `ffmpeg (tools/clip.mjs)${words ? ", captions from the transcript" : ""}`);
    console.log(JSON.stringify({ saved: path.resolve(out), seconds: +(to - from).toFixed(1), size, captions: words }, null, 2));
  }
}
