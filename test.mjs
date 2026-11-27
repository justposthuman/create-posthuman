// Makes a kit in a temp folder and checks it: the copy, the placeholders, the dotfiles, and every tool (dry runs, and
// a real ffmpeg mix on a clip generated here). No keys, nothing sent anywhere.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let bad = 0;
const ok = (c, m) => { console.log(`${c ? "ok  " : "FAIL"} ${m}`); if (!c) bad++; };
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, FAL_KEY: "", ELEVENLABS_API_KEY: "" } });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ph-kit-"));
const dir = path.join(tmp, "kitchen-table");
let r = run("node", [path.resolve("bin/create.mjs"), dir, "--url", "https://example.test/"]);
ok(r.status === 0, "create runs");
ok(r.stdout.includes("Kitchen Table") && r.stdout.includes("codex mcp add posthuman --url https://example.test/api/mcp"), "…and says what to do next");
for (const f of [".gitignore", ".env.example", ".mcp.json", "AGENTS.md", "CLAUDE.md", "brand/voice.md", "ideas/inbox.md", "posts/_template.md", "library/INDEX.md", "recipes/voiceover.md", "tools/fal.mjs"]) ok(fs.existsSync(path.join(dir, f)), `has ${f}`);
ok(!fs.existsSync(path.join(dir, "_gitignore")), "dotfiles renamed");
const all = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? all(path.join(d, e.name)) : [path.join(d, e.name)]));
ok(!all(dir).some((f) => /\{\{[A-Z_]+\}\}/.test(fs.readFileSync(f, "utf8"))), "no placeholder left");
ok(JSON.parse(fs.readFileSync(path.join(dir, ".mcp.json"), "utf8")).mcpServers.posthuman.url === "https://example.test/api/mcp", ".mcp.json points at Posthuman");
ok(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").includes("**Kitchen Table**"), "AGENTS.md has the brand's name");
ok(fs.readFileSync(path.join(dir, ".gitignore"), "utf8").includes(".env"), ".env is never committed");
r = run("node", [path.resolve("bin/create.mjs"), dir]);
ok(r.status !== 0 && /already has files/.test(r.stderr), "won't write into a folder that has files");

// tools: no key → plain message
r = run("node", ["tools/fal.mjs", "fal-ai/flux-2-pro", "--input", '{"prompt":"x"}', "--out", "library/x.png"], dir);
ok(r.status !== 0 && /FAL_KEY isn't set/.test(r.stderr), "fal without a key: says how to add one");
r = run("node", ["tools/voice.mjs", "--text", "hi", "--voice", "v", "--out", "library/x.mp3"], dir);
ok(r.status !== 0 && /ELEVENLABS_API_KEY isn't set/.test(r.stderr), "voice without a key: says how to add one");

// a test picture and clip, generated (never the user's own files)
const ff = run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x568:rate=24:duration=3", "-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "library/test-clip.mp4"], dir);
const haveFf = ff.status === 0;
run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "library/test-voice.mp3"], dir);
run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=teal:size=64x64", "-frames:v", "1", "library/test.png"], dir);

r = run("node", ["tools/fal.mjs", "fal-ai/kling-video/v3/pro/image-to-video", "--file", "image_url=library/test.png", "--input", '{"prompt":"slow push-in","duration":"5"}', "--out", "library/clip.mp4", "--dry"], dir);
const dry = r.status === 0 ? JSON.parse(r.stdout) : {};
ok(dry.post === "https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video" && /^data:image\/png;base64,/.test(dry.input?.image_url) && dry.input.prompt === "slow push-in", "fal dry run: local file goes in as a data: address, input kept");
r = run("node", ["tools/fal.mjs", "fal-ai/x", "--input", "{nope", "--out", "a.png"], dir);
ok(r.status !== 0 && /must be JSON/.test(r.stderr), "fal: bad JSON is said plainly");
fs.writeFileSync(path.join(dir, "posts/s.script.txt"), "Twenty seconds of words.");
r = run("node", ["tools/voice.mjs", "--text-file", "posts/s.script.txt", "--voice", "abc", "--out", "library/v.mp3", "--dry"], dir);
const vd = r.status === 0 ? JSON.parse(r.stdout) : {};
ok(vd.post?.includes("/v1/text-to-speech/abc") && vd.body?.model_id === "eleven_v4" && vd.body?.text === "Twenty seconds of words.", "voice dry run: script, voice and model");
r = run("node", ["tools/voice.mjs", "--sfx", "a page turning", "--seconds", "3", "--out", "library/s.mp3", "--dry"], dir);
ok(r.status === 0 && JSON.parse(r.stdout).post.includes("/v1/sound-generation"), "sound effects dry run");
fs.writeFileSync(path.join(dir, ".env"), "ELEVENLABS_VOICE_ID=from-env\n");
r = run("node", ["tools/voice.mjs", "--text", "hi", "--out", "library/v.mp3", "--dry"], dir);
ok(r.status === 0 && JSON.parse(r.stdout).post.includes("/from-env?"), "the voice comes from .env when not given");

// ---------- more keys: OpenAI, Gemini, Pexels, Replicate, captions (dry runs: nothing is sent) ----------
{
  const J = (args) => { const x = run("node", args, dir); return x.status === 0 ? JSON.parse(x.stdout) : { err: x.stderr }; };
  let d = J(["tools/openai.mjs", "image", "a sign that says OPEN", "--out", "library/sign.png", "--dry"]);
  ok(d.post?.endsWith("/images/generations") && d.model === "gpt-image-1" && d.size === "1024x1536", "openai: an image, tall by default");
  d = J(["tools/openai.mjs", "edit", "library/test.png", "on a phone", "--out", "library/p.png", "--dry"]);
  ok(d.post?.endsWith("/images/edits") && d.image === "library/test.png", "openai: a photo edit");
  d = J(["tools/openai.mjs", "speak", "Hello there.", "--out", "library/h.mp3", "--voice", "nova", "--dry"]);
  ok(d.post?.endsWith("/audio/speech") && d.voice === "nova" && d.input === "Hello there.", "openai: a voiceover");
  const OA = await import(path.join(dir, "tools/openai.mjs"));
  const srt = OA.wordsToSrt([{ word: "Most", start: 0, end: 0.3 }, { word: "of", start: 0.3, end: 0.4 }, { word: "what", start: 0.4, end: 0.6 }, { word: "I", start: 0.6, end: 0.7 }, { word: "build,", start: 0.7, end: 1 }, { word: "ships.", start: 1.1, end: 1.5 }]);
  ok(/^1\n00:00:00,000 --> 00:00:00,700\nMost of what I\n/.test(srt) && srt.includes("2\n00:00:00,700 --> 00:00:01,000\nbuild,") && srt.includes("\nships.\n"), "captions: a few words at a time, cut at punctuation, SRT times");
  d = J(["tools/captions.mjs", "library/test-clip.mp4", "--dry"]);
  ok(/openai\.mjs transcribe library\/test-clip\.mp4 --out library\/test-clip\.srt/.test(d.hear) && d.burn?.includes("subtitles=captions.srt") && d.out === "library/test-clip-captions.mp4", "captions: hear the words, then burn them in");
  d = J(["tools/captions.mjs", "library/test-clip.mp4", "--srt", "library/fixed.srt", "--dry"]);
  ok(/no/.test(d.hear), "…or burn in a .srt you fixed, without OpenAI");
  d = J(["tools/gemini.mjs", "edit", "library/test.png", "on a desk", "--out", "library/d.png", "--dry"]);
  ok(d.post?.endsWith("/models/gemini-2.5-flash-image:generateContent") && d.image === "library/test.png", "gemini: a photo edit (Nano Banana)");
  d = J(["tools/pexels.mjs", "search", "coffee desk", "--shape", "portrait", "--dry"]);
  ok(d.get?.includes("/v1/search?query=coffee+desk") && d.get.includes("orientation=portrait"), "pexels: a photo search");
  d = J(["tools/pexels.mjs", "search", "rain", "--videos", "--dry"]);
  ok(d.get?.includes("/videos/search?query=rain"), "…and clips");
  const PX = await import(path.join(dir, "tools/pexels.mjs"));
  ok(PX.pickFile([{ file_type: "video/mp4", link: "4k", width: 3840, height: 2160 }, { file_type: "video/mp4", link: "hd", width: 1080, height: 1920 }, { file_type: "video/mp4", link: "sd", width: 360, height: 640 }]).link === "hd", "…a clip comes as the ~1080 file, not 4K");
  d = J(["tools/replicate.mjs", "black-forest-labs/flux-1.1-pro", "--input", '{"prompt":"a desk"}', "--out", "library/r.png", "--dry"]);
  ok(d.post?.endsWith("/models/black-forest-labs/flux-1.1-pro/predictions") && d.input?.prompt === "a desk", "replicate: a model by name");
  d = J(["tools/replicate.mjs", "owner/m:abc123", "--file", "image=library/test.png", "--out", "library/r.mp4", "--dry"]);
  ok(d.post?.endsWith("/predictions") && d.version === "abc123" && /^data:image\/png;base64,/.test(d.input?.image), "…or a pinned version, with a local file");
  d = J(["tools/higgsfield.mjs", "kling-video/v4.0/text-to-video", "--input", '{"prompt":"a slow dolly-in"}', "--out", "library/h.mp4", "--dry"]);
  ok(d.post === "https://api.higgsfield.ai/kling-video/v4.0/text-to-video" && d.input?.prompt === "a slow dolly-in", "higgsfield: a model by its endpoint id");
  d = J(["tools/runway.mjs", "video", "library/test.png", "slow push-in", "--out", "library/rw.mp4", "--dry"]);
  ok(d.post === "https://api.dev.runwayml.com/v1/image_to_video" && d.version === "2024-11-06" && d.body?.model === "gen4_turbo" && d.body.ratio === "720:1280" && d.body.duration === 5 && /^data:image\/png/.test(d.body.promptImage), "runway: a photo that moves, vertical, Gen-4 Turbo");
  const RW = await import(path.join(dir, "tools/runway.mjs"));
  ok(RW.runwayRequest("video", { image: "https://x/p.png", prompt: "p", model: "gen4.5" }).body.promptImage[0].position === "first" && RW.runwayRequest("text-video", { prompt: "p" }).path === "/v1/text_to_video" && RW.runwayRequest("image", { prompt: "p" }).body.model === "gen4_image", "…gen4.5 takes the photo as a list; words-only video and images too");
  d = J(["tools/luma.mjs", "video", "library/test.png", "slow push-in", "--out", "library/lu.mp4", "--dry"]);
  ok(d.post === "https://agents.lumalabs.ai/v1/generations" && d.body?.model === "ray-3.2" && d.body.type === "video" && d.body.aspect_ratio === "9:16" && d.body.video.duration === "5s" && d.body.video.start_frame?.media_type === "image/png", "luma: a photo that moves (Ray 3.2, 9:16, 5 s)");
  const LU = await import(path.join(dir, "tools/luma.mjs"));
  ok(LU.lumaRequest("video", { prompt: "p", frame: { url: "https://x" }, seconds: 10 }).video.duration === "5s" && LU.lumaRequest("text-video", { prompt: "p", seconds: 10 }).video.duration === "10s", "…10 seconds only without a starting photo (Luma's rule)");
  const PV = await import(path.join(dir, "tools/providers.mjs"));
  ok(PV.keysWith((n) => (n === "HF_API_KEY_ID" ? "x" : "")).higgsfield === false && PV.keysWith((n) => (n.startsWith("HF_API_KEY_") ? "x" : "")).higgsfield === true && PV.keysWith((n) => (n === "HF_CREDENTIALS" ? "id:secret" : "")).higgsfield === true, "…Higgsfield: its one-line key, or the old id + secret pair (not half of it)");
  ok(PV.whoCan("captions")[0].id === "openai" && PV.whoCan("edit", { openai: true })[0].id === "openai" && PV.PROVIDERS.every((p) => /^https:\/\//.test(p.get) && p.env), "providers: every service says its .env line and where to get a key");
  const envNow = fs.readFileSync(path.join(dir, ".env.example"), "utf8");
  ok(PV.PROVIDERS.every((p) => [p.env, ...(p.also ?? [])].every((e) => envNow.includes(`${e}=`))), "…and .env.example has a line for each");
}

if (haveFf) {
  r = run("node", ["tools/mix.mjs", "--video", "library/test-clip.mp4", "--audio", "library/test-voice.mp3", "--out", "library/test-voiced.mp4"], dir);
  ok(r.status === 0 && fs.statSync(path.join(dir, "library/test-voiced.mp4")).size > 1000, "mix: a real ffmpeg mix works");
  const streams = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", "library/test-voiced.mp4"], dir).stdout;
  ok(streams.includes("video") && streams.includes("audio"), "…with picture and sound");
  ok(fs.readFileSync(path.join(dir, "library/INDEX.md"), "utf8").includes("| test-voiced.mp4 |"), "…and it's listed in library/INDEX.md");
} else console.log("skip mix (no ffmpeg here)");


// ---------- humanize check ----------
const { check } = await import(path.join(dir, "tools/humanize-rules.mjs"));
const t1 = check("Here's the thing — it's not just a tool, it's a journey 🚀... Thoughts? #buildinpublic").map((x) => x.tell);
ok(["dash", "not X, it's Y", "AI word", "stock phrase", "hype emoji", "dramatic dots", "generic ask", "hashtags"].every((x) => t1.includes(x)), "humanize: catches the usual AI giveaways");
ok(check("My kids can count to 7. I apparently can't.").length === 0 && check("9-5: day job.\n5-8:30: dad.").length === 0, "…and leaves a plain post alone (9-5 isn't a dash)");
ok(check("Shipped 36 commits and a refactor of the API.").some((x) => x.tell === "tech word"), "…flags tech words");
ok(check("#buildinpublic", { hashtagsOk: true }).length === 0, "…hashtags are fine where they're wanted");
fs.writeFileSync(path.join(dir, "posts/2026-11-25-ai.md"), "---\nstatus: draft\n---\n\n# Words\n\n## Everywhere\nLet's dive in 🚀\n\n## Per account (only where it differs)\n(none)\n");
r = run("node", ["tools/humanize.mjs", "posts/2026-11-25-ai.md"], dir);
ok(r.status === 1 && /stock phrase/.test(r.stdout) && /hype emoji/.test(r.stdout), "humanize CLI: flags a post file, exit 1");
fs.rmSync(path.join(dir, "posts/2026-11-25-ai.md"));

// ---------- the user's own no's (brand/voice.md) ----------
const HR = await import(path.join(dir, "tools/humanize-rules.mjs"));
const vr = HR.parseVoice(`## Voice
- Every post opens a conversation: end with a real ask or a convo starter people can answer.
- Plain everyday words. Skip the fancy one ("gratifying") when there's a simpler one (Sam, 11-24).

## Never do
- Don't end with "tell me what's bad" (Sam, 11-25: "Stop telling me to tell them it's bad").
- Never end on a tidy moral (Sam, 11-24: "sure").
- Not me: "Bought a standing desk to be more productive, and now I mostly stand there reading reviews of other standing desks." (X, Oct 16). Sam: "all AI lol".
<!-- fill: "no hashtags" -->
`);
ok(vr.endsWithAsk && vr.banned.includes("tell me what's bad") && vr.banned.includes("gratifying"), "voice: quoted no's are read, from Never do and after a no elsewhere");
ok(!vr.banned.some((b) => /sure|stop telling|all ai|no hashtags|\(x, oct/.test(b)), "…but not the user's reactions, long quotes, the gap between two quotes, or the fill comments");
ok(HR.parseVoice(fs.readFileSync(path.join(dir, "brand/voice.md"), "utf8")).banned.length === 0, "…and the starter voice file has none");
const vt = (w) => HR.check(w, { voice: vr }).map((x) => x.tell);
ok(vt("Built a thing.\n\nTell me what\u2019s bad.").includes("your never-do") && vt("A gratifying day.").includes("your never-do") && !vt("Gratifyingly plain? Yes?").includes("your never-do"), "humanize: flags the user's own never-do phrases, whole words only");
ok(vt("Try it free on the App Store.\n---\nhttps://x.test").includes("no ask at the end") && !vt("What are you building?\n---\nhttps://x.test").includes("no ask at the end") && !vt("Would you use it? 🤙").includes("no ask at the end"), "…and a post with no question when the voice says every post ends with an ask");
ok(!HR.check("Try it free.").some((x) => x.tell === "no ask at the end"), "…only when the voice says so");

// ---------- lengths (tools/length-rules.mjs) ----------
const LR = await import(path.join(dir, "tools/length-rules.mjs"));
const helloPost = "Never said who's behind this account.\n\nI'm Sam, a dev and dad of two. I built Hatch because I kept dropping the ball on stuff that mattered to me. Reminders weren't cutting it.\n\nSo it checks in first, at your times, and remembers what you said you'd do.\n\nWhat habit do you keep dropping?";
ok(LR.lengthsFor("X @shop", helloPost)[0].length === 287, "length: X counts like X does (287, the same as Posthuman's check_post)");
ok(LR.lengthOn(LR.platformOf("X @shop"), "see https://example.test/a/very/long/link/that/goes/on") === 27 && LR.lengthOn(LR.platformOf("X @shop"), "hi 👋") === 5 && LR.lengthOn(LR.platformOf("Bluesky @s.bsky.social"), "hi 👋") === 4, "…a link is 23 on X, an emoji 2 on X and 1 on Bluesky");
ok(LR.lengthCheck("X @shop", "a".repeat(200) + "\n---\n" + "b".repeat(281))[0]?.issue.startsWith("part 2 is 281") && LR.lengthCheck("Instagram @shop", "a".repeat(2000) + "\n---\n" + "b".repeat(300)).length === 1, "…each part on a thread platform, the whole post elsewhere");
ok(LR.lengthCheck("Telegram shop", "a".repeat(1100)).length === 0 && LR.lengthCheck("Telegram shop", "a".repeat(1100), { media: 1 }).length === 1 && LR.platformOf("Threads @shop.dev")?.name === "Threads" && LR.platformOf("Pinterest Kitchen Table")?.limit === 800, "…Telegram's shorter caption with media, and account lines find their platform");

// ---------- post files (tools/post-rules.mjs) ----------
const PR = await import(path.join(dir, "tools/post-rules.mjs"));
const longPost = `---
status: draft
accounts: [X @shop, Threads @shop, Mastodon @shop@mastodon.social, Bluesky @shop.bsky.social]
---

# Words

## Everywhere
Main words.

## Per account (only where it differs)
- Mastodon @shop@mastodon.social: …same words… + #buildinpublic
- Bluesky @shop.bsky.social: First line.\\nSecond line.
### Threads @shop
Hi Threads.

- a list line stays in the words
---
The link: https://example.test

# Notes
Keep me.
`;
const pp = PR.parsePost(longPost);
ok(pp.per.length === 3 && pp.per[2].account === "Threads @shop" && pp.per[2].words === "Hi Threads.\n\n- a list line stays in the words\n---\nThe link: https://example.test", "post file: an account's own words can run over many lines under ### (with their own thread parts)");
ok(pp.per[1].words === "First line.\nSecond line." && PR.wordsFor(pp, "Mastodon @shop@mastodon.social") === "Main words.\n\n#buildinpublic" && PR.wordsFor(pp, "X @shop") === "Main words.", "…an old one-liner with \\n typed out still reads, and …same words… still expands");
const again = PR.parsePost(PR.writePost(pp));
ok(JSON.stringify(again.per) === JSON.stringify(pp.per) && PR.writePost(pp).includes("### Threads @shop\nHi Threads.") && PR.writePost(pp).includes("Keep me."), "…and writing it back keeps every account's words and the rest of the file");
fs.writeFileSync(path.join(dir, "brand/voice.md"), "# Voice\n\n## Voice\n- End with a real question people can answer.\n\n## Never do\n- Don't end with \"tell me what's bad\".\n");
fs.writeFileSync(path.join(dir, "posts/2026-11-25-long.md"), longPost.replace("Main words.", "Main words. Tell me what's bad.\n\n" + "word ".repeat(60).trim()));
r = run("node", ["tools/humanize.mjs", "posts/2026-11-25-long.md"], dir);
ok(r.status === 1 && /your never-do: "tell me what's bad"/.test(r.stdout) && /X @shop: it's 3\d\d characters; X takes 280/.test(r.stdout) && /no ask at the end/.test(r.stdout), "humanize CLI: reads brand/voice.md, and says which account is too long and by how much");
fs.rmSync(path.join(dir, "posts/2026-11-25-long.md"));
fs.copyFileSync(path.join(path.resolve("template"), "brand/voice.md"), path.join(dir, "brand/voice.md"));
ok(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").includes("**The angle is theirs.**") && !/draft from it first, then from ideas\/inbox/.test(fs.readFileSync(path.join(dir, "tools/studio-more.mjs"), "utf8")), "drafting waits for the user's angle (AGENTS.md, and Studio's Draft the week)");

// ---------- substance check ----------
const { substance } = await import(path.join(dir, "tools/substance-rules.mjs"));
const issues = (p) => substance(p).map((x) => x.issue);
ok(issues({ words: "My kids can count to 7. I apparently can't." }).includes("gives nothing named"), "substance: a post that names nothing it gives is flagged");
ok(issues({ gives: "story", words: "x".repeat(150) }).includes("no real thing named"), "…a kind with no payload is flagged");
ok(issues({ gives: "show", payload: "the calendar", words: "x".repeat(150) }).some((i) => /nothing to see/.test(i)) && !issues({ gives: "show", payload: "the calendar", words: "x".repeat(150), media: ["a.png"] }).length, "…show needs a picture or clip");
ok(issues({ gives: "opinion", payload: "privacy wins", words: "Privacy wins. ".repeat(10) }).some((i) => /no reason/.test(i)) && !issues({ gives: "opinion", payload: "privacy wins", words: "Privacy wins, because waiting loses to convenience every single time you make people wait for it. Ask anyone behind a guy paying by check." }).length, "…an opinion needs its reason");
ok(issues({ gives: "tip", payload: "check the charge date", words: "My app's 7-day free trial was quietly giving people 6 days. If you sell a trial, sign up yourself and check the date it says you'll be charged." }).length === 0, "…a real tip passes");
ok(issues({ gives: "story", payload: "x", words: "Sleep: on backorder." }).includes("might be only a joke"), "…a short joke with nothing in it is called out");
fs.writeFileSync(path.join(dir, "posts/2026-11-25-thin.md"), "---\nstatus: draft\nmedia: []\n---\n\n# Words\n\n## Everywhere\nSleep: on backorder.\n\n## Per account (only where it differs)\n(none)\n");
r = run("node", ["tools/substance.mjs", "posts/2026-11-25-thin.md", "posts/_template.md"], dir);
ok(r.status === 1 && /gives nothing named/.test(r.stdout) && !/_template/.test(r.stdout), "substance CLI: flags a thin post, skips the template");
fs.rmSync(path.join(dir, "posts/2026-11-25-thin.md"));
ok(fs.readFileSync(path.join(dir, "posts/_template.md"), "utf8").includes("gives:") && fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").includes("Raw material first"), "the template and AGENTS.md ask for it");

// ---------- account setups (brand/accounts.md, a copy of Posthuman's) ----------
const AR = await import(path.join(dir, "tools/account-rules.mjs"));
ok(AR.parseAccounts(fs.readFileSync(path.join(dir, "brand/accounts.md"), "utf8")).length === 0 && fs.readFileSync(path.join(dir, "brand/accounts.md"), "utf8").includes("https://example.test/accounts"), "accounts: the starter file is empty and points at Posthuman");
const acctFile = AR.writeAccounts([
  { account_id: 3, account: "X @shop", setup: { who_reads_it: "parents", sounds: "warm", what_goes_here: "its own posts, written for here", never: ["hashtags", "naming my day job, Acme"], like_this: "One line\nthat's so me" } },
  { account_id: 4, account: "Mastodon @shop@mastodon.social", setup: { never: ["hashtags", "emoji"] } },
  { account_id: 5, account: "Bluesky shop.bsky.social", setup: "not yet" },
], { url: "https://example.test" });
const accts = AR.parseAccounts(acctFile);
ok(accts.length === 3 && accts[0].account_id === 3 && accts[0].setup.never.join("|") === "hashtags|naming my day job, Acme" && accts[0].setup.like_this === "One line that's so me" && accts[2].setup === null, "accounts: the briefing's setups written and read back (no's kept whole, not yet = none)");
// X Premium: the briefing's max_characters is kept as "- longest post:" and the length check uses it
{
  const AR3 = await import(path.join(dir, "tools/account-rules.mjs"));
  const LR3 = await import(path.join(dir, "tools/length-rules.mjs"));
  const md = AR3.writeAccounts([{ account_id: 6, account: "X @me", setup: "not yet", past_posts: 40, max_characters: 25000 }, { account_id: 7, account: "X @other", setup: "not yet", past_posts: 3 }]);
  const back = AR3.parseAccounts(md);
  ok(md.includes("- longest post: 25000") && back[0].max === 25000 && !back[1].max, "accounts: a long-post account keeps its longest post (X Premium), others don't get one");
  const long = "word ".repeat(120).trim();
  ok(LR3.lengthCheck("X @me", long, { max: back[0].max }).length === 0 && LR3.lengthCheck("X @other", long, { max: back[1].max }).length === 1, "length: X Premium takes a long post; plain X still says 280");
  const saved = fs.readFileSync(path.join(dir, "brand/accounts.md"), "utf8");
  fs.writeFileSync(path.join(dir, "brand/accounts.md"), md);
  fs.writeFileSync(path.join(dir, "posts/2026-11-30-long.md"), `---\nstatus: draft\naccounts: [X @me, X @other]\n---\n\n# Words\n\n## Everywhere\n${long}\n\nWhat do you think?\n`);
  const hl = run("node", ["tools/humanize.mjs", "posts/2026-11-30-long.md"], dir).stdout;
  ok(/X @other: it's \d+ characters; X takes 280/.test(hl) && !/X @me:/.test(hl), "humanize: the long post is fine on the Premium account, too long on the other");
  fs.rmSync(path.join(dir, "posts/2026-11-30-long.md"));
  fs.writeFileSync(path.join(dir, "brand/accounts.md"), saved);
}
ok(AR.setupFor("x @shop", accts)?.account_id === 3 && AR.setupFor("Mastodon", accts)?.account_id === 4 && AR.setupFor("Bluesky", accts)?.account_id === 5 && AR.setupFor("TikTok @else", accts) === null, "accounts: a post's account line finds its setup");
const fc = (w, i = 0) => AR.fitCheck(accts[i].setup, w).map((x) => x.issue);
ok(fc("ship it #buildinpublic").some((x) => /hashtags/.test(x)) && fc("long day at Acme").some((x) => /Acme/.test(x)) && fc("long day at acmeish") .length === 0 && fc("plain words").length === 0, "fit check: hashtags and never-named words flagged, whole words only");
ok(fc("nice 🔥", 1).some((x) => /emoji/.test(x)) && fc("nice 🔥", 0).length === 0, "fit check: emoji only where the account says no emoji");

// ---------- your stuff (brand/sources.md): generated pictures and a scratch git project, never real files ----------
const shots = path.join(tmp, "Screenshots");
fs.mkdirSync(path.join(shots, "deeper"), { recursive: true });
run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=orange:size=64x64", "-frames:v", "1", path.join(shots, "Screenshot 2026-11-23.png")], dir);
run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=navy:size=64x64", "-frames:v", "1", path.join(shots, "deeper", "bug.png")], dir);
fs.writeFileSync(path.join(shots, "notes.txt"), "not media");
fs.mkdirSync(path.join(shots, ".hidden"));
fs.writeFileSync(path.join(shots, ".hidden", "x.png"), "x");
const oldShot = path.join(shots, "old.png");
fs.copyFileSync(path.join(shots, "deeper", "bug.png"), oldShot);
fs.utimesSync(oldShot, new Date(Date.now() - 90 * 864e5), new Date(Date.now() - 90 * 864e5));
const proj = path.join(tmp, "my-app");
fs.mkdirSync(proj);
for (const args of [["init", "-q"], ["config", "user.name", "Test Person"], ["config", "user.email", "t@example.test"]]) run("git", ["-C", proj, ...args], dir);
for (const msg of ["Fix the login bug", "Ship the calendar"]) {
  fs.writeFileSync(path.join(proj, "f.txt"), msg);
  run("git", ["-C", proj, "add", "."], dir);
  run("git", ["-C", proj, "commit", "-q", "-m", msg], dir);
}
const SO = await import(path.join(dir, "tools/sources.mjs"));
ok(SO.readSources().media.length === 0 && fs.existsSync(path.join(dir, "brand/sources.md")), "sources: the kit starts with an empty brand/sources.md");
let threw = "";
try { SO.checkFolder(path.join(tmp, "nope")); } catch (e) { threw = e.message; }
ok(/no folder/.test(threw), "sources: a folder that isn't there is refused");
threw = "";
try { SO.checkFolder(os.homedir()); } catch (e) { threw = e.message; }
ok(/smaller folder/.test(threw), "sources: the whole home folder is refused");
SO.writeSources({ media: [shots], projects: [proj] });
const srcs = SO.readSources();
ok(srcs.media[0] === shots && srcs.projects[0] === proj, "sources: written and read back");
const scanned = SO.scanMedia({ days: 60 });
ok(scanned.length === 2 && scanned.every((m) => m.kind === "image") && !scanned.some((m) => /\.hidden|old\.png|notes/.test(m.path)), "scan: pictures from the last 60 days, in subfolders too; not old ones, hidden ones or other files");
ok(SO.scanMedia({ days: 365 }).length === 3, "…a longer window finds the old one");
const wk = SO.projectWeek(proj, "2000-01-01");
ok(wk.commits === 2 && wk.subjects.includes("Ship the calendar") && wk.name === "my-app", "projects: this week's commits and what they say");
ok(SO.projectWeek(shots, "2000-01-01") === null, "…a folder without git is skipped");
ok(SO.inSources(path.join(shots, "deeper", "bug.png")) && !SO.inSources(path.join(shots, "notes.txt")) && !SO.inSources(path.join(dir, ".env.example")) && !SO.inSources(path.join(shots, "..", "my-app", "f.txt")), "only media inside the listed folders counts as yours to serve");
SO.addFound([{ path: path.join(shots, "deeper", "bug.png"), says: "an error | dialog", angle: "the bug that ate Tuesday" }]);
ok(SO.readFound().get(path.join(shots, "deeper", "bug.png"))?.angle === "the bug that ate Tuesday" && SO.readFound().get(path.join(shots, "deeper", "bug.png")).says === "an error / dialog", "found.md keeps what the agent saw, safely in a table");
const used = SO.useFound(path.join(shots, "deeper", "bug.png"));
ok(fs.existsSync(path.join(dir, "library", used)) && fs.existsSync(path.join(shots, "deeper", "bug.png")) && fs.readFileSync(path.join(dir, "library/INDEX.md"), "utf8").includes("an error / dialog"), "use one: copied into library/ (the original stays), listed with what it shows");
ok(SO.useFound(path.join(shots, "deeper", "bug.png")) === used, "…using it again doesn't make a second copy");
r = run("node", ["tools/sources.mjs", "--days", "60"], dir);
ok(r.status === 0 && /Pictures and clips from the last 60 days: 2/.test(r.stdout) && /my-app: 2 commits/.test(r.stdout) && /the bug that ate|an error/.test(r.stdout), "sources CLI: what's new, and each project's week");

// ---------- topics (tools/topic-rules.mjs) ----------
const TR = await import(path.join(dir, "tools/topic-rules.mjs"));
ok(TR.topicsOf(fs.readFileSync(path.join(dir, "brand/about.md"), "utf8")).length === 0, "topics: the template starts with none (the fill marker isn't one)");
const pillars = TR.topicsOf("## Pillars (about 6–7 posts a week on X)\n1. Building in public (~7): Posthuman, Kitchen Table.\n2. AI agents doing the work (~3): overnight runs.\n3. **Privacy thesis** (~3): Zcash.\n4. Dev dad life\n\n## Series\n- Sunday Numbers");
ok(pillars.map((t) => t.name).join("|") === "Building in public|AI agents doing the work|Privacy thesis|Dev dad life" && pillars[0].per_week === 7 && pillars[3].per_week === null, "topics: read from a Pillars list, with how many a week");
ok(TR.topicsOf("## Topics\n- Building the app (~3 a week)\n- Behind the scenes\n")[0].per_week === 3, "…or a Topics list");
ok(TR.matchTopic("building", pillars)?.name === "Building in public" && TR.matchTopic("privacy", pillars)?.name === "Privacy thesis" && TR.matchTopic("cooking", pillars) === null, "a post's topic: matched loosely, unknown ones left alone");
const mx = TR.mixOf([{ topic: "building" }, { topic: "Building in public" }, { topic: "" }, { topic: "privacy thesis" }], pillars);
ok(mx.mix[0].count === 2 && mx.mix[2].count === 1 && mx.none === 1, "the week's mix counts each topic");

// ---------- get to know you (tools/knowyou.mjs) ----------
const KY = await import(path.join(dir, "tools/knowyou.mjs"));
const aboutStart = fs.readFileSync(path.join(dir, "brand/about.md"), "utf8");
ok(aboutStart.includes("## Goals") && KY.sectionOf(aboutStart, "Goals") === "" && KY.sectionOf(aboutStart, "Who it's for") === "", "about.md starts with an empty Goals section (fill markers don't count)");
const t2 = KY.setSection(aboutStart, "Who it's for", "Parents of 5 to 8 year olds");
ok(KY.sectionOf(t2, "Who it's for") === "Parents of 5 to 8 year olds" && !t2.includes("fill: the people") && t2.includes("## Links") && t2.indexOf("## Who it's for") < t2.indexOf("## Links"), "a section is filled in place, its fill marker gone, the rest kept");
ok(KY.sectionOf(KY.setSection("# A\n", "New", "x"), "New") === "x", "…or added when it's missing");
ok(KY.sectionOf(KY.addToSection("## Never do\n- a\n", "Never do", ["- a", "- b"]), "Never do") === "- a\n- b", "adding lines skips ones already there");
let threwG = "";
try { KY.saveGoals({}); } catch (e) { threwG = e.message; }
ok(/Pick what posting is for/.test(threwG), "goals: nothing picked is refused");
KY.saveGoals({ aims: ["signups", "made-up"], number: "50 sign-ups", by: "Dec 16" });
let ab = KY.aboutView();
ok(ab.goals.includes("For: sign-ups or downloads") && ab.goals.includes("It worked if: 50 sign-ups") && ab.goals.includes("By: Dec 16") && !ab.goals.includes("made-up"), "goals saved under Goals in plain words");
KY.saveAbout({ what_it_is: "A worksheets app.", who_its_for: "Parents", facts: ["iPhone and Android", "$19.99 once"], links: ["https://example.test the site"] });
ab = KY.aboutView();
ok(ab.what_it_is.startsWith("A worksheets app.\n- iPhone and Android") && ab.who_its_for === "Parents" && ab.links.includes("example.test") && ab.goals.includes("50 sign-ups"), "the links' draft goes into about.md, goals kept");
KY.writePast([
  { account: "X @shop", date: "2026-10-02", stats: "1,204 views · did well", words: "Day 3 of building.\nThe coffee is strong.", verdict: "", why: "" },
  { account: "X @shop", date: "2026-10-01", stats: "", words: "Huge news!!! Our app is a game-changer", verdict: "", why: "" },
]);
let past = KY.parsePast();
ok(past.length === 2 && past[0].words === "Day 3 of building.\nThe coffee is strong." && past[0].stats.includes("did well"), "past posts: written and read back, words and stats kept");
KY.judgePast(0, "so me", "the joke's on me");
let r2 = KY.judgePast(1, "not me", "too salesy");
const vf = fs.readFileSync(path.join(dir, "brand/voice.md"), "utf8");
ok(r2.left === 0 && KY.sectionOf(vf, "Examples we love").includes('"Day 3 of building. / The coffee is strong." (X @shop, 2026-10-02: the joke\'s on me)') && KY.sectionOf(vf, "What worked").includes("the joke's on me") && KY.sectionOf(vf, "Never do").includes("too salesy (not like"), "so me → Examples we love (and What worked for a winner); not me → Never do, with their why");
ok(KY.parsePast()[1].verdict === "not me" && KY.parsePast()[1].why === "too salesy", "…and the verdict is kept with the post");
// in step with Posthuman's About you
fs.writeFileSync(path.join(dir, "brand/about.md"), KY.setSection(KY.setSection(fs.readFileSync(path.join(dir, "brand/about.md"), "utf8"), "Topics", "- Real worksheets (~3)\n- Behind the scenes"), "Goals", "- For: sign-ups or downloads, sales\n- It worked if: 50 sign-ups\n- By: Dec 16"));
const ph = KY.aboutForPosthuman();
ok(ph.what === "A worksheets app." && ph.who === "Parents" && ph.topics.join("|") === "Real worksheets|Behind the scenes" && ph.aims.join() === "signups,sales" && ph.worked_if === "50 sign-ups" && ph.by_when === "Dec 16" && ph.links[0].startsWith("https://example.test") && !("why" in ph), "about.md → set_about fields: what (no fact bullets), who, topics, goal parts, links; empty ones left out");
fs.writeFileSync(path.join(dir, "brand/about.md"), aboutStart);
const filledNow = KY.fillFromPosthuman({ what_they_make: "Kitchen Table, a worksheets app", for_whom: "parents", goal: "sales · it worked if 10 sales a week · by Jan 1", topics: ["Worksheets"], links: ["https://kt.test"] });
const ab2 = KY.aboutView();
ok(filledNow.length === 5 && ab2.what_it_is === "Kitchen Table, a worksheets app" && ab2.goals.includes("- It worked if: 10 sales a week") && ab2.goals.includes("- By: Jan 1") && ab2.goals.includes("- For: sales"), "Posthuman's about_you fills an empty about.md, goal split back into lines");
ok(KY.fillFromPosthuman({ what_they_make: "something else" }).length === 0 && KY.aboutView().what_it_is === "Kitchen Table, a worksheets app", "…but never over what this folder already has");
ok(KY.aboutForPosthuman().aims.join() === "sales" && KY.aboutForPosthuman().worked_if === "10 sales a week", "…and goes back to Posthuman the same");
fs.writeFileSync(path.join(dir, "brand/about.md"), aboutStart);
fs.rmSync(path.join(dir, "brand/past-posts.md"));

// ---------- Studio: a real server in the test folder, no agent, no browser ----------
fs.writeFileSync(path.join(dir, "brand/accounts.md"), acctFile);
fs.writeFileSync(path.join(dir, "posts/2026-11-24-hello.md"), `---
status: draft
when: Tue 24 07:30 ET
kind: building
accounts: [X @shop, Bluesky, Mastodon]
posthuman_post_id:
media: []
made_with_ai: false
---

# Words

## Everywhere
First part.
---
Second part.

## Per account (only where it differs)
- Mastodon: …same words… + #buildinpublic

# Notes
CONFIRM the number.

# How it did
<!-- later -->
`);
const port = 47000 + Math.floor(Math.random() * 2000);
const { spawn } = await import("node:child_process");
const srv = spawn("node", ["tools/studio.mjs", "--port", String(port), "--no-open"], { cwd: dir, env: { ...process.env, STUDIO_AGENT: "none" }, stdio: "pipe" });
await new Promise((ok) => { srv.stdout.on("data", (d) => String(d).includes("Studio for") && ok()); setTimeout(ok, 4000); });
const base = `http://127.0.0.1:${port}`;
try {
  const page = await (await fetch(base + "/")).text();
  const token = page.match(/const TOKEN = "([\w-]+)"/)?.[1];
  ok(token && token !== "__TOKEN__" && page.includes("Schedule approved"), "studio serves the page with a one-time token");
  ok((await fetch(base + "/api/state")).status === 403, "…the API refuses a request without the token");
  const h = { "X-Studio-Token": token, "Content-Type": "application/json" };
  const http = await import("node:http");
  const hostCode = await new Promise((ok) => http.get({ host: "127.0.0.1", port, path: "/api/state", headers: { ...h, Host: "evil.example" } }, (res) => { res.resume(); ok(res.statusCode); }));
  ok(hostCode === 403, "…and one for another host name (DNS rebinding)");
  let st = await (await fetch(base + "/api/state", { headers: h })).json();
  const p = st.posts.find((x) => x.slug === "2026-11-24-hello");
  ok(p && p.date === "2026-11-24" && p.time === "07:30" && p.accounts.length === 3 && p.flagged && p.everywhere.includes("\n---\n") && p.per[0].account === "Mastodon", "it reads a post file: date, time, accounts, thread, own words, the CONFIRM flag");
  ok(!st.posts.some((x) => x.slug.startsWith("_")), "…and leaves the template out");
  ok(Array.isArray(p.tells), "…with its humanize flags");
  ok(p.substance.some((x) => x.issue === "gives nothing named"), "…and its substance flags");
  ok((await fetch(`${base}/humanize-rules.mjs?t=${token}`)).status === 200 && (await fetch(`${base}/humanize-rules.mjs`)).status === 403, "the page gets the same humanize rules (with the token)");

  let r = await fetch(base + "/api/post/2026-11-24-hello", { method: "PUT", headers: h, body: JSON.stringify({ everywhere: "First part, better.\n---\nSecond part.", status: "approved", mtime: p.mtime }) });
  const saved = (await r.json()).post;
  const file = fs.readFileSync(path.join(dir, "posts/2026-11-24-hello.md"), "utf8");
  ok(r.status === 200 && saved.status === "approved" && file.includes("status: approved") && file.includes("First part, better."), "edit + approve writes the file");
  ok(file.includes("# First draft") && file.includes("First part.\n---"), "…keeping the agent's first draft for it to learn from");
  ok(file.includes("CONFIRM the number.") && file.includes("# How it did") && file.includes("- Mastodon: …same words… + #buildinpublic"), "…and every other part of the file as it was");
  r = await fetch(base + "/api/post/2026-11-24-hello", { method: "PUT", headers: h, body: JSON.stringify({ gives: "tip", payload: "check the charge date # not a comment\nnew line" }) });
  const gv = (await r.json()).post;
  ok(gv.gives === "tip" && gv.payload === "check the charge date   not a comment new line" && fs.readFileSync(path.join(dir, "posts/2026-11-24-hello.md"), "utf8").includes("gives: tip"), "what it gives + its payload save into the frontmatter, kept on one line");
  ok(Array.isArray(p.long) && st.voice && Array.isArray(st.voice.banned) && (await fetch(`${base}/length-rules.mjs?t=${token}`)).status === 200 && (await fetch(`${base}/post-rules.mjs?t=${token}`)).status === 200, "…with its length flags, the voice rules and the shared length and post rules for the page");
  r = await fetch(base + "/api/post/2026-11-24-hello", { method: "PUT", headers: h, body: JSON.stringify({ per: [{ account: "Mastodon", words: "…same words… + #buildinpublic" }, { account: "Bluesky", words: "Line one.\n\nLine two.\n---\nhttps://example.test" }] }) });
  const pl = (await r.json()).post;
  ok(r.status === 200 && pl.per[1].words === "Line one.\n\nLine two.\n---\nhttps://example.test" && fs.readFileSync(path.join(dir, "posts/2026-11-24-hello.md"), "utf8").includes("### Bluesky\nLine one."), "an account's own words on many lines save whole (they used to keep only the first line)");
  r = await fetch(base + "/api/post/2026-11-24-hello", { method: "PUT", headers: h, body: JSON.stringify({ everywhere: "x".repeat(300) }) });
  ok((await r.json()).post.long.some((f) => f.account === "X @shop" && /X takes 280/.test(f.issues[0].issue)), "a post too long for one of its accounts is flagged on its card");
  r = await fetch(base + "/api/post/2026-11-24-hello", { method: "PUT", headers: h, body: JSON.stringify({ everywhere: "stale", mtime: p.mtime }) });
  ok(r.status === 409, "a save over a file that changed since (the agent's work) is refused");
  ok((await fetch(base + "/api/post/..%2Fbrand%2Fvoice", { method: "PUT", headers: h, body: "{}" })).status === 404, "no writing outside posts/");

  const png = fs.readFileSync(path.join(dir, "library/test.png"));
  r = await fetch(base + "/api/upload?name=" + encodeURIComponent("my photo.png"), { method: "POST", headers: { "X-Studio-Token": token }, body: png });
  const up = await r.json();
  ok(r.status === 200 && /^\d{4}-\d{2}-\d{2}-my-photo\.png$/.test(up.file) && fs.existsSync(path.join(dir, "library", up.file)), "a dropped picture lands in library/ with a dated name");
  r = await fetch(base + "/api/upload?name=evil.html", { method: "POST", headers: { "X-Studio-Token": token }, body: "<script>" });
  ok(r.status === 400, "…pictures, video and audio only");
  await fetch(base + "/api/alt", { method: "PUT", headers: h, body: JSON.stringify({ file: up.file, alt: "A teal square" }) });
  st = await (await fetch(base + "/api/state", { headers: h })).json();
  ok(st.library.find((x) => x.file === up.file)?.alt === "A teal square", "its description is saved in library/INDEX.md");
  ok((await fetch(`${base}/library/${up.file}?t=${token}`)).status === 200 && (await fetch(`${base}/library/${up.file}`)).status === 403 && (await fetch(`${base}/library/..%2F.env?t=${token}`)).status === 404, "library files are served with the token, never outside library/");

  await fetch(base + "/api/idea", { method: "POST", headers: h, body: JSON.stringify({ text: "a post about dropping files" }) });
  ok(fs.readFileSync(path.join(dir, "ideas/inbox.md"), "utf8").includes("- [ ] a post about dropping files (studio,"), "an idea from Studio goes into the inbox");

  r = await fetch(base + "/api/rewrite/2026-11-24-hello", { method: "POST", headers: h, body: JSON.stringify({ note: "punchier" }) });
  const rw = await r.json();
  ok(rw.queued && fs.readFileSync(path.join(dir, "posts/2026-11-24-hello.md"), "utf8").includes("# Rewrite asked\npunchier"), "no agent: a rewrite note is saved in the post for the agent");
  r = await fetch(base + "/api/rewrite/2026-11-24-hello", { method: "POST", headers: h, body: JSON.stringify({ humanize: true }) });
  ok((await r.json()).queued && fs.readFileSync(path.join(dir, "posts/2026-11-24-hello.md"), "utf8").includes("# Rewrite asked\nHumanize it"), "no agent: Humanize leaves the note for the agent");
  ok((await fetch(base + "/api/schedule", { method: "POST", headers: h })).status === 400, "no agent: Schedule says to ask the agent instead");

  // ---------- Update suggested ----------
  fs.writeFileSync(path.join(dir, "posts/2026-12-01-upd.md"), `---
status: draft
when: 2026-12-01 09:00
accounts: [X @shop, Threads @shop]
---

# Words

## Everywhere
Profit so far: $0. 19 days left.

## Per account (only where it differs)
- Threads @shop: 19 days left, and counting.

# Notes
keep me

# Update suggested
- old: 19 days left
  new: 18 days left
  why: the date
- old: Profit so far: $0.
  new: First sale this week.
  why: raw: first sale
`);
  st = await (await fetch(base + "/api/state", { headers: h })).json();
  const up1 = st.posts.find((x) => x.slug === "2026-12-01-upd");
  ok(up1.update_suggested.length === 2 && up1.update_suggested[0].new === "18 days left" && !up1.other.some((s) => s.title === "Update suggested"), "a post's suggested updates show up as items, not as a loose section");
  r = await fetch(base + "/api/update/2026-12-01-upd", { method: "POST", headers: h, body: JSON.stringify({ items: [0] }) });
  let ur = await r.json();
  let uf = fs.readFileSync(path.join(dir, "posts/2026-12-01-upd.md"), "utf8");
  ok(ur.applied === 1 && uf.includes("Profit so far: $0. 18 days left.") && uf.includes("- Threads @shop: 18 days left, and counting.") && uf.includes("keep me"), "Apply changes the words everywhere they appear (main and each account's own), keeping the rest");
  ok(ur.post.update_suggested.length === 1 && ur.post.update_suggested[0].new === "First sale this week." && !ur.job, "…leaves the other suggestion, and a draft needs no trip to Posthuman");
  r = await fetch(base + "/api/update/2026-12-01-upd", { method: "POST", headers: h, body: JSON.stringify({ items: "all", dismiss: true }) });
  ur = await r.json();
  uf = fs.readFileSync(path.join(dir, "posts/2026-12-01-upd.md"), "utf8");
  ok(ur.post.update_suggested.length === 0 && !uf.includes("# Update suggested") && uf.includes("Profit so far: $0."), "Dismiss drops a suggestion without touching the words");
  fs.writeFileSync(path.join(dir, "posts/2026-12-01-upd.md"), uf.replace("status: draft", "status: scheduled\nposthuman_post_id: 77") + "\n# Update suggested\n- old: Profit so far: $0.\n  new: First sale.\n");
  r = await fetch(base + "/api/update/2026-12-01-upd", { method: "POST", headers: h, body: JSON.stringify({ items: "all" }) });
  uf = fs.readFileSync(path.join(dir, "posts/2026-12-01-upd.md"), "utf8");
  ok(uf.includes("First sale. 18 days left.") && /CONFIRM: changed here, not yet in Posthuman \(post 77\)/.test(uf), "no agent: a scheduled post changes here and is flagged to change in Posthuman too");
  ok((await fetch(base + "/api/update-week", { method: "POST", headers: h, body: "{}" })).status >= 400, "no agent: Update the week needs one");
  fs.rmSync(path.join(dir, "posts/2026-12-01-upd.md"));

  // ---------- the rail's other places ----------
  st = await (await fetch(base + "/api/state", { headers: h })).json();
  ok(/^\d{4}-\d{2}-\d{2}$/.test(st.week) && st.keys && st.keys.fal === false && st.recipes.video, "state carries the week, which keys are set (never the keys) and the recipes");
  ok(page.includes('class="hollow"') && page.includes("Brainstorm") && page.includes("This week's raw") && page.includes('data-view="make"'), "the page wears the Posthuman wordmark and has the rail places");
  let rawd = await (await fetch(base + "/api/raw?week=" + st.week, { headers: h })).json();
  ok(rawd.week === st.week && rawd.shots.length === 0, "raw: an empty week to start");
  rawd = await (await fetch(base + "/api/raw", { method: "PUT", headers: h, body: JSON.stringify({ week: st.week, shots: [{ file: up.file, note: "the calendar" }, { file: "../.env", note: "nope" }], numbers: ["3 sign-ups"], happened: ["the app logged me out at midnight"] }) })).json();
  const rawText = fs.readFileSync(path.join(dir, "raw", `${st.week}.md`), "utf8");
  ok(rawd.shots.length === 1 && rawd.numbers[0] === "3 sign-ups" && rawText.includes(`- library/${up.file}: the calendar`) && !rawText.includes(".env"), "raw: screenshots (library only), numbers and what happened saved to raw/<week>.md");
  ok((await fetch(base + "/api/draft-week", { method: "POST", headers: h, body: JSON.stringify({ week: st.week }) })).status === 400, "no agent: drafting the week says so");
  ok((await fetch(base + "/api/brainstorm", { method: "POST", headers: h, body: JSON.stringify({ text: "x" }) })).status === 400, "no agent: brainstorm says so");
  r = await fetch(base + "/api/keep", { method: "POST", headers: h, body: JSON.stringify({ angle: { angle: "The 6-day trial", gives: "tip", payload: "check the charge date", first_line: "My 7-day trial gave 6 days.", needs: "" }, as: "idea" }) });
  ok(r.status === 200 && fs.readFileSync(path.join(dir, "ideas/inbox.md"), "utf8").includes("The 6-day trial (gives tip: check the charge date)"), "keep an angle as an idea");
  r = await fetch(base + "/api/keep", { method: "POST", headers: h, body: JSON.stringify({ angle: { angle: "The 6-day trial", gives: "show", payload: "the calendar", first_line: "Look at this.", needs: "the screenshot" }, as: "draft", date: "2026-11-26", files: [up.file, "../../etc/passwd"] }) });
  const kd = await r.json();
  const kf = fs.readFileSync(path.join(dir, "posts", `${kd.slug}.md`), "utf8");
  ok(kd.slug === "2026-11-26-the-6-day-trial" && kf.includes("gives: show") && kf.includes(`media: [${up.file}]`) && kf.includes("Look at this.") && kf.includes("Needs: the screenshot"), "keep an angle as a draft: a post file on that day, with what it gives and the picture");
  // ---------- Get to know you ----------
  let kn = await (await fetch(base + "/api/know", { headers: h })).json();
  ok(st.know?.todo === 3 && kn.past.length === 0 && kn.aims.signups, "a new folder: three steps to go, and the goals to pick from");
  ok(Array.isArray(st.topics) && st.topics.length === 0, "no topics yet in a new folder");
  fs.writeFileSync(path.join(dir, "brand/about.md"), fs.readFileSync(path.join(dir, "brand/about.md"), "utf8").replace(/## Topics\n[^\n]*\n/, "## Topics\n- Building the app (~3)\n- Behind the scenes\n"));
  st = await (await fetch(base + "/api/state", { headers: h })).json();
  ok(st.topics.length === 2 && st.topics[0].per_week === 3, "topics from about.md reach the page");
  r = await fetch(base + "/api/post/2026-11-24-hello", { method: "PUT", headers: h, body: JSON.stringify({ topic: "Behind the scenes", media: [up.file] }) });
  const tp = (await r.json()).post;
  ok(tp.topic === "Behind the scenes" && fs.readFileSync(path.join(dir, "posts/2026-11-24-hello.md"), "utf8").includes("topic: Behind the scenes"), "a post's topic saves into its frontmatter");
  ok(fs.readFileSync(path.join(dir, "library/INDEX.md"), "utf8").split("\n").find((l) => l.includes(`| ${up.file} |`))?.includes("2026-11-24-hello"), "adding a file to a post fills its Used in column");
  ok(page.includes('data-view="know"') && page.includes('location.hash = "#know"'), "the page has Get to know you, and a new folder starts there");
  r = await fetch(base + "/api/know/goals", { method: "PUT", headers: h, body: JSON.stringify({ aims: ["followers"], number: "1,000 followers on X" }) });
  ok(r.status === 200 && (await r.json()).about.goals.includes("1,000 followers"), "goals saved from Studio");
  ok((await fetch(base + "/api/know/goals", { method: "PUT", headers: h, body: "{}" })).status === 400, "…an empty goal is refused");
  r = await fetch(base + "/api/know/about", { method: "PUT", headers: h, body: JSON.stringify({ what_it_is: "A test shop.", who_its_for: "Testers", facts: [], links: [] }) });
  ok((await r.json()).about.what_it_is === "A test shop.", "the links' draft is saved from Studio");
  for (const [u, b] of [["/api/know/links", { urls: ["https://example.test"] }], ["/api/know/past", {}], ["/api/know/sync", {}]]) ok((await fetch(base + u, { method: "POST", headers: h, body: JSON.stringify(b) })).status === 400, `no agent: ${u} says so`);
  ok((await fetch(base + "/api/know/judge", { method: "POST", headers: h, body: JSON.stringify({ i: 9, verdict: "so me" }) })).status === 400, "judging a post that isn't there is refused");
  st = await (await fetch(base + "/api/state", { headers: h })).json();
  ok(st.know.todo === 1, "two steps done: one to go");

  // ---------- Your stuff ----------
  const stuff = await (await fetch(base + "/api/stuff?days=60", { headers: h })).json();
  ok(stuff.media.length === 2 && stuff.media.some((m) => m.angle === "the bug that ate Tuesday") && stuff.projects[0]?.name === "my-app", "Your stuff: pictures (with what the agent saw) and the projects");
  const one = stuff.media.find((m) => m.path.endsWith("Screenshot 2026-11-23.png"));
  ok((await fetch(`${base}/found?p=${encodeURIComponent(one.path)}&t=${token}`)).status === 200, "…a picture from your folder is shown");
  ok((await fetch(`${base}/found?p=${encodeURIComponent(one.path)}`)).status === 403 && (await fetch(`${base}/found?p=${encodeURIComponent(path.join(dir, ".env"))}&t=${token}`)).status === 404 && (await fetch(`${base}/found?p=${encodeURIComponent(path.join(proj, "f.txt"))}&t=${token}`)).status === 404, "…never without the token, never a file outside your picture folders");
  r = await fetch(base + "/api/sources", { method: "PUT", headers: h, body: JSON.stringify({ media: [shots, path.join(tmp, "missing")], projects: [] }) });
  ok(r.status === 400 && SO.readSources().projects.length === 1, "a folder that isn't there: refused, nothing changed");
  r = await fetch(base + "/api/stuff/use", { method: "POST", headers: h, body: JSON.stringify({ path: one.path, raw: true, note: "the calendar" }) });
  const usedFile = (await r.json()).file;
  const rawNow = await (await fetch(base + "/api/raw", { headers: h })).json();
  ok(r.status === 200 && fs.existsSync(path.join(dir, "library", usedFile)) && rawNow.shots.some((x) => x.file === usedFile && x.note === "the calendar"), "Into this week's raw: copied to the library and added to the week");
  ok((await fetch(base + "/api/stuff/use", { method: "POST", headers: h, body: JSON.stringify({ path: path.join(dir, ".env.example") }) })).status === 400, "…a file outside your folders is refused");
  for (const u of ["/api/stuff/describe", "/api/stuff/phone"]) ok((await fetch(base + u, { method: "POST", headers: h, body: JSON.stringify({ paths: [one.path] }) })).status === 400, `no agent: ${u} says so`);
  ok(page.includes('data-view="stuff"'), "the page has Your stuff");

  // ---------- Accounts ----------
  st = await (await fetch(base + "/api/state", { headers: h })).json();
  ok(!("people" in st) && st.accounts.accounts.length === 3 && st.accounts.posthuman === "https://example.test", "state carries the account setups (and nothing about other people)");
  const hello = st.posts.find((x) => x.slug === "2026-11-24-hello");
  ok(hello.fits.length === 1 && hello.fits[0].account === "Mastodon" && /hashtags/.test(hello.fits[0].issues[0].issue), "a post whose Mastodon words add a hashtag is flagged for that account only");
  ok(page.includes('data-view="accounts"') && !page.includes('data-view="people"') && (await fetch(`${base}/account-rules.mjs?t=${token}`)).status === 200 && (await fetch(`${base}/account-rules.mjs`)).status === 403, "the page has Accounts, and gets its rules with the token");
  ok((await fetch(base + "/api/accounts/refresh", { method: "POST", headers: h, body: "{}" })).status === 400, "no agent: Refresh says so");
  ok(!fs.existsSync(path.join(dir, "brand/people.md")) && !fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").includes("people.md"), "no file about other people");

  r = await fetch(base + "/api/make", { method: "POST", headers: h, body: JSON.stringify({ recipe: "image", prompt: "a table" }) });
  ok(r.status !== 200 && /FAL_KEY/.test((await r.json()).error), "make without a key: says which key to add");
  r = await fetch(base + "/api/make", { method: "POST", headers: h, body: JSON.stringify({ recipe: "captions", clip: "test-clip.mp4" }) });
  ok(r.status !== 200 && /OPENAI_API_KEY/.test((await r.json()).error), "…captions say OPENAI_API_KEY");
  const stk = await fetch(base + "/api/stock?q=coffee", { headers: h });
  ok(stk.status === 400 && /PEXELS_API_KEY/.test((await stk.json()).error), "…and stock search says PEXELS_API_KEY");
  const stS = await (await fetch(base + "/api/state", { headers: h })).json();
  ok(stS.providers.length === 9 && "openai" in stS.keys && stS.recipes.captions.via.openai, "studio: the page gets every service, which have keys, and what each recipe can use");
} finally {
  srv.kill();
}
const { parseAngles } = await import(path.join(dir, "tools/studio-more.mjs"));
const pa = parseAngles('Sure! Here you go:\n[{"angle":"A","gives":"TIP","payload":"p","first_line":"f"},{"angle":"B","gives":"weird"}]\nHope that helps');
ok(pa.length === 2 && pa[0].gives === "tip" && pa[1].gives === "", "brainstorm answers are read even with words around them; unknown kinds left blank");

// ---------- new accounts and "you choose" (tools/account-rules.mjs) ----------
const AR2 = await import(path.join(dir, "tools/account-rules.mjs"));
const fresh = AR2.parseAccounts(AR2.writeAccounts([
  { account_id: 21, account: "Threads @shop", setup: "not yet", past_posts: 0 },
  { account_id: 22, account: "X @shop", setup: { never: ["hashtags"] }, past_posts: 46 },
  { account_id: 23, account: "Pinterest Shop Boards", setup: "not yet", past_posts: 0 },
  { account_id: 24, account: "Bluesky shop.bsky.social", setup: "not yet" },
  { account_id: 25, account: "Instagram @shop", setup: "not yet", past_posts: 0 },
]));
ok(fresh[0].posts === 0 && fresh[1].posts === 46 && fresh[3].posts === null, "accounts: how many posts each has is kept (and unknown stays unknown)");
const intro = fresh.map((a) => AR2.introFor(a, fresh, ["Instagram @shop"]));
ok(intro.join("|") === "yes||skip||" && AR2.introFor(fresh[0], fresh, ["X @shop"]) === "yes" && AR2.introFor(fresh[0], fresh, ["Threads"]) === "", "intro: only a brand-new account with nothing written for it; Pinterest is skipped; an old copy with no count gets none");
const sug = AR2.cleanAnswers({ audience: " parents  of kids ", role: "boss", no_hashtags: 1, example: "", why: "x", evil: "drop table" });
ok(sug.role === "own" && sug.audience === "parents of kids" && sug.no_hashtags === true && !("example" in sug) && !("evil" in sug) && !("why" in sug), "you choose: an agent's suggestion is cut down to the six answers");
const st6 = AR2.answersToSetup({ audience: "parents", sound: "warm", role: "big", rhythm: "weekly", no_links: true, never_name: "Acme", example: "So me." });
ok(st6.what_goes_here === "only the big moments" && st6.never.join("|") === "links|naming Acme" && st6.like_this === "So me." && AR2.fitCheck(st6, "at Acme today").length === 1, "…and saved answers read back as a setup the checks use");
ok(/A new account says hello/.test(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")) && /"You choose\."/.test(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")), "AGENTS.md says when to write an intro and how 'you choose' works");

// Studio with a stand-in agent: what it's asked, what it may use, and what lands in the folder
const fakeBin = path.join(tmp, "bin");
fs.mkdirSync(fakeBin, { recursive: true });
fs.writeFileSync(path.join(fakeBin, "claude"), `#!/usr/bin/env node
const fs = require("fs");
const a = process.argv.slice(2);
const prompt = a[a.indexOf("-p") + 1] || "";
fs.appendFileSync(${JSON.stringify(path.join(tmp, "agent-log.jsonl"))}, JSON.stringify({ prompt, allowed: a.slice(a.indexOf("--allowedTools") + 1) }) + "\\n");
if (/suggest the six answers/.test(prompt)) console.log('Here: [{"account_id": 21, "audience": "parents", "sound": "warm", "role": "own", "rhythm": "twice a week", "no_hashtags": true, "example": "", "why": "from your X posts"}]');
else if (/call the posthuman set_up_account/.test(prompt)) console.log('[{"account_id": 21, "saved": true, "say": "Saved."}]');
else if (/A new account says hello/.test(prompt)) { fs.writeFileSync("posts/2026-11-26-threads-intro.md", "---\\nstatus: draft\\naccounts: [Threads @shop]\\n---\\n\\n# Words\\n\\n## Everywhere\\nHi.\\n"); console.log("posts/2026-11-26-threads-intro.md\\nHi."); }
`, { mode: 0o755 });
fs.writeFileSync(path.join(dir, "brand/accounts.md"), AR2.writeAccounts([
  { account_id: 21, account: "Threads @shop", setup: "not yet", past_posts: 0 },
  { account_id: 23, account: "Pinterest Shop Boards", setup: "not yet", past_posts: 0 },
]));
const port2 = port + 1;
const srv2 = spawn("node", ["tools/studio.mjs", "--port", String(port2), "--no-open"], { cwd: dir, env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` }, stdio: "pipe" });
await new Promise((ok) => { srv2.stdout.on("data", (d) => String(d).includes("Studio for") && ok()); setTimeout(ok, 4000); });
try {
  const b2 = `http://127.0.0.1:${port2}`;
  const tok = (await (await fetch(b2 + "/")).text()).match(/const TOKEN = "([\w-]+)"/)?.[1];
  const h2 = { "X-Studio-Token": tok, "Content-Type": "application/json" };
  const wait = async (id) => { for (let i = 0; i < 100; i++) { const j = await (await fetch(`${b2}/api/job/${id}`, { headers: h2 })).json(); if (j.state !== "running") return j; await new Promise((r) => setTimeout(r, 100)); } return {}; };
  const log = () => fs.readFileSync(path.join(tmp, "agent-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  let s2 = await (await fetch(b2 + "/api/state", { headers: h2 })).json();
  ok(s2.accounts.accounts.map((a) => a.intro).join("|") === "yes|skip", "studio: a brand-new account shows Write an intro; Pinterest says why not");

  let j = await wait((await (await fetch(b2 + "/api/accounts/suggest", { method: "POST", headers: h2, body: JSON.stringify({ ids: [21] }) })).json()).job);
  ok(j.state === "done" && j.suggestions?.[0]?.audience === "parents" && !("example" in j.suggestions[0]) && j.suggestions[0].why === "from your X posts", "you choose: suggestions come back for the page, and nothing is saved yet");
  const allowedOnly = (x) => x.allowed.slice(0, x.allowed.indexOf("--disallowedTools") < 0 ? undefined : x.allowed.indexOf("--disallowedTools"));
  ok(!/set_up_account|Write|Edit|Bash/.test(allowedOnly(log().at(-1)).join(" ")) && log().at(-1).allowed.includes("Write") && !/- who reads it/.test(fs.readFileSync(path.join(dir, "brand/accounts.md"), "utf8")), "…the suggesting agent can read but can't save or write anything");

  j = await wait((await (await fetch(b2 + "/api/accounts/save", { method: "POST", headers: h2, body: JSON.stringify({ items: [{ ...j.suggestions[0], audience: "parents of 5 to 8 year olds" }] }) })).json()).job);
  const af = fs.readFileSync(path.join(dir, "brand/accounts.md"), "utf8");
  ok(j.state === "done" && j.saved?.[0] === 21 && af.includes("- who reads it: parents of 5 to 8 year olds") && af.includes("- never: hashtags") && af.includes("- posts so far: 0"), "…Save sends what the user saw (with their edit) and updates the local copy");
  ok(log().at(-1).allowed.join(" ") === "mcp__posthuman__set_up_account --disallowedTools Bash Edit Write Read" && log().at(-1).prompt.includes('"audience":"parents of 5 to 8 year olds"'), "…and the saving agent may only call set_up_account, with exactly those answers");

  j = await wait((await (await fetch(b2 + "/api/accounts/intro", { method: "POST", headers: h2, body: JSON.stringify({ account: "Threads @shop" }) })).json()).job);
  s2 = await (await fetch(b2 + "/api/state", { headers: h2 })).json();
  ok(j.state === "done" && j.file === "posts/2026-11-26-threads-intro.md" && s2.posts.some((p) => p.slug === "2026-11-26-threads-intro") && s2.accounts.accounts.find((a) => a.account_id === 21).intro === "", "intro: one draft lands on the Week, and the account stops asking for one");
  ok(!log().at(-1).allowed.some((x) => /create_post|update_post|set_up_account/.test(x)) && /Do NOT schedule/.test(log().at(-1).prompt), "…and the intro agent can't schedule anything");
  ok((await fetch(b2 + "/api/accounts/intro", { method: "POST", headers: h2, body: JSON.stringify({ account: "Nope" }) })).status === 400, "…an account that isn't there is refused");
  const page2 = await (await fetch(b2 + "/")).text();
  ok(!page2.includes("Save and send") && page2.includes("function inPosthuman") && page2.includes('class="card inph"') && page2.includes("function platformsLine"), "studio: a post already in Posthuman is a link to it there (the website is where it's changed); cards name their platforms");
  ok((await fetch(b2 + "/api/send/2026-11-27-live", { method: "POST", headers: h2 })).status === 404, "…and Studio no longer sends changes to Posthuman itself");
} finally {
  srv2.kill();
  await new Promise((r) => (srv2.exitCode !== null ? r() : srv2.once("exit", r)));
}

// ---------- 7a: Studio finds a free port ----------
{
  const net = await import("node:net");
  const first = 49000 + Math.floor(Math.random() * 1000);
  const blocker = net.createServer().listen(first, "127.0.0.1");
  await new Promise((r) => blocker.once("listening", r));
  const s3 = spawn("node", ["tools/studio.mjs", "--no-open"], { cwd: dir, env: { ...process.env, STUDIO_AGENT: "none", STUDIO_FIRST_PORT: String(first) }, stdio: "pipe" });
  let out3 = "";
  await new Promise((ok) => { s3.stdout.on("data", (d) => { out3 += d; if (out3.includes("Studio for")) ok(); }); setTimeout(ok, 4000); });
  s3.kill();
  ok(out3.includes(`127.0.0.1:${first + 1}/`) && out3.includes(`(${first} was busy)`), "studio: a busy port moves to the next free one, and says so");
  const s4 = spawnSync("node", ["tools/studio.mjs", "--no-open", "--port", String(first)], { cwd: dir, encoding: "utf8", env: { ...process.env, STUDIO_AGENT: "none" }, timeout: 8000 });
  ok(s4.status === 1 && /Port \d+ is busy\. Leave --port off/.test(s4.stderr), "…but --port asks for exactly that one, and says how to get a free one");
  blocker.close();
}

// ---------- Studio says where it is ----------
{
  const first = 50000 + Math.floor(Math.random() * 1000);
  const env = { ...process.env, STUDIO_AGENT: "none", STUDIO_FIRST_PORT: String(first) };
  const where = () => spawnSync("node", ["tools/studio.mjs", "--where"], { cwd: dir, encoding: "utf8", env, timeout: 8000 });
  ok(where().status === 1 && /isn't open\. Start it: node tools\/studio\.mjs/.test(where().stdout), "studio --where: says it isn't open, and how to start it");
  const s5 = spawn("node", ["tools/studio.mjs", "--no-open"], { cwd: dir, env, stdio: "pipe" });
  let out5 = "";
  await new Promise((r) => { s5.stdout.on("data", (d) => { out5 += d; if (out5.includes("Studio for")) r(); }); setTimeout(r, 4000); });
  const url5 = `http://127.0.0.1:${first}/`;
  const w = where();
  ok(w.status === 0 && w.stdout.includes(`Studio is open: ${url5}`) && JSON.parse(fs.readFileSync(path.join(dir, ".studio"), "utf8")).url === url5, "studio --where: gives the address of this folder's Studio while it runs");
  const again = spawnSync("node", ["tools/studio.mjs", "--no-open"], { cwd: dir, encoding: "utf8", env, timeout: 8000 });
  ok(again.status === 0 && again.stdout.includes(`already open: ${url5}`), "studio: starting it again points to the one that's open, not a second one");
  ok(fs.readFileSync(path.join(dir, ".gitignore"), "utf8").includes(".studio"), "…and .studio stays out of git");
  s5.kill();
  await new Promise((r) => (s5.exitCode !== null ? r() : s5.once("exit", r)));
  ok(!fs.existsSync(path.join(dir, ".studio")) && where().status === 1, "…and when it stops, it's gone");
  fs.writeFileSync(path.join(dir, ".studio"), JSON.stringify({ url: url5, pid: 1 }));
  ok(where().status === 1, "…a leftover .studio from a crash doesn't count");
  fs.rmSync(path.join(dir, ".studio"));
  ok(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8").includes("**Give them the link.**"), "AGENTS.md: the agent gives the Studio link when drafts are ready, and offers to open it");
}

// ---------- 7b: tools/vertical.mjs ----------
{
  const VT = await import(path.join(dir, "tools/vertical.mjs"));
  const va = VT.verticalArgs("library/a.mp4", "library/a-vertical.mp4");
  ok(va.join(" ").includes("scale=1080:1920:force_original_aspect_ratio=increase") && va.join(" ").includes("boxblur") && va.includes("0:a?") && VT.verticalArgs("p.png", "p-4x5.png", { size: "4:5", fit: "crop" }).join(" ").includes("crop=1080:1350") && VT.verticalArgs("p.png", "o.png").includes("-frames:v"), "vertical: blur fill by default, crop when asked, pictures get one frame, sound kept when there is some");
  let vr = run("node", ["tools/vertical.mjs", "library/test.png", "--size", "16:9"], dir);
  ok(vr.status !== 0 && /--size is one of 9:16, 4:5, 1:1/.test(vr.stderr), "…a size it doesn't know is said plainly");
  if (haveFf) {
    run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2", "-f", "lavfi", "-i", "sine=frequency=330:duration=2", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "library/wide.mp4"], dir);
    vr = run("node", ["tools/vertical.mjs", "library/wide.mp4"], dir);
    const dims = run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0", "library/wide-vertical.mp4"], dir).stdout;
    ok(vr.status === 0 && dims.includes("video,1080,1920") && dims.includes("audio") && fs.readFileSync(path.join(dir, "library/INDEX.md"), "utf8").includes("| wide-vertical.mp4 |"), "…a real 16:9 clip comes out 1080x1920 with its sound, listed in library/INDEX.md");
    vr = run("node", ["tools/vertical.mjs", "library/test.png", "--size", "4:5"], dir);
    ok(vr.status === 0 && run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", "library/test-4x5.png"], dir).stdout.trim() === "1080,1350", "…and a photo comes out 4:5 for Instagram");
  } else console.log("skip vertical run (no ffmpeg here)");
}

// ---------- 7c: more than one brand ----------
{
  const BR = await import(path.join(dir, "tools/brands.mjs"));
  ok(BR.accountIdsIn("## Accounts on Posthuman\n- Instagram @kt (10): reels\n- Threads (account 15)\n<!-- fill: (99) -->\n## Goals\n- (3)").join() === "10,15", "brands: an about.md's accounts are read by their ids (not from comments or other sections)");
  let r7 = run("node", ["tools/brands.mjs", "add", "Kitchen Table", "--accounts", "10,15"], dir);
  ok(r7.status === 0 && fs.existsSync(path.join(dir, "brands/kitchen-table/about.md")) && fs.readFileSync(path.join(dir, "brands/kitchen-table/about.md"), "utf8").includes("# About Kitchen Table") && fs.readFileSync(path.join(dir, "brands/kitchen-table/about.md"), "utf8").includes("- (10)"), "brands add: makes brands/<name>/ with its about.md (its accounts listed) and voice.md");
  ok(run("node", ["tools/brands.mjs", "add", "Kitchen Table"], dir).status !== 0, "…and won't make the same one twice");
  const bl = BR.brandsOf(dir);
  ok(bl.length === 2 && bl[0].slug === "" && bl[1].slug === "kitchen-table" && bl[1].name === "Kitchen Table" && bl[1].ids.join() === "10,15", "brands: the main one first, then each folder in brands/");
  const acc = [{ account: "Instagram @kt", account_id: 10 }, { account: "Threads @kt", account_id: 15 }, { account: "X @me", account_id: 6 }];
  ok(BR.brandOfPost({ brand: "kitchen-table" }, bl).slug === "kitchen-table" && BR.brandOfPost({ brand: "Kitchen Table" }, bl).slug === "kitchen-table" && BR.brandOfPost({ accounts: "[Instagram @kt, Threads @kt]" }, bl, acc).slug === "kitchen-table" && BR.brandOfPost({ accounts: "[Instagram @kt, X @me]" }, bl, acc).slug === "" && BR.brandOfPost({ brand: "gone" }, bl).slug === "", "a post's brand: its brand: line, else the brand that lists all its accounts, else the main one");
  ok(BR.brandFile(bl[1], "voice.md", dir).endsWith("brands/kitchen-table/voice.md") && BR.brandFile(bl[1], "sources.md", dir).endsWith(path.join("brand", "sources.md")), "…and a brand's own file, or the main brand's when it has none");

  // each post is judged by its own brand's voice
  fs.writeFileSync(path.join(dir, "brand/voice.md"), "## Voice\n- End with a real question.\n");
  fs.writeFileSync(path.join(dir, "brands/kitchen-table/voice.md"), "## Never do\n- Don't say \"print tonight\".\n");
  const post7 = (brand, words) => `---\nstatus: draft\nbrand: ${brand}\naccounts: [Instagram @kt]\n---\n\n# Words\n\n## Everywhere\n${words}\n\n## Per account (only where it differs)\n(none)\n`;
  fs.writeFileSync(path.join(dir, "posts/2026-11-28-kt.md"), post7("kitchen-table", "101 pages. Print tonight."));
  fs.writeFileSync(path.join(dir, "posts/2026-11-28-me.md"), post7("", "101 pages. Print tonight."));
  r7 = run("node", ["tools/humanize.mjs", "posts/2026-11-28-kt.md"], dir);
  const r7b = run("node", ["tools/humanize.mjs", "posts/2026-11-28-me.md"], dir);
  fs.writeFileSync(path.join(dir, "posts/2026-11-28-pin.md"), "---\nstatus: draft\naccounts: [Pinterest Shop, Threads @me]\n---\n\n# Words\n\n## Everywhere\nWhat grade are they in?\n\n## Per account (only where it differs)\n- Pinterest Shop: Free grade 3 reading worksheet.\n");
  const rpin = run("node", ["tools/humanize.mjs", "posts/2026-11-28-pin.md"], dir);
  ok(rpin.status === 0, "humanize: a Pinterest pin isn't asked to end on a question (people find pins by search)");
  fs.rmSync(path.join(dir, "posts/2026-11-28-pin.md"));
  ok(/your never-do: "print tonight"/.test(r7.stdout) && !/no ask at the end/.test(r7.stdout) && /no ask at the end/.test(r7b.stdout) && !/print tonight/.test(r7b.stdout), "humanize: a Kitchen Table post is judged by Kitchen Table's voice, a main-brand post by the main one");

  const port7 = 50500 + Math.floor(Math.random() * 1000);
  const s7 = spawn("node", ["tools/studio.mjs", "--port", String(port7), "--no-open"], { cwd: dir, env: { ...process.env, STUDIO_AGENT: "none" }, stdio: "pipe" });
  await new Promise((ok) => { s7.stdout.on("data", (d) => String(d).includes("Studio for") && ok()); setTimeout(ok, 4000); });
  try {
    const b7 = `http://127.0.0.1:${port7}`;
    const tok7 = (await (await fetch(b7 + "/")).text()).match(/const TOKEN = "([\w-]+)"/)?.[1];
    const h7 = { "X-Studio-Token": tok7, "Content-Type": "application/json" };
    let s = await (await fetch(b7 + "/api/state", { headers: h7 })).json();
    const kt = s.posts.find((p) => p.slug === "2026-11-28-kt"), me = s.posts.find((p) => p.slug === "2026-11-28-me");
    ok(s.brands.map((b) => b.name).join("|").endsWith("|Kitchen Table") && s.voices["kitchen-table"].banned.includes("print tonight") && "kitchen-table" in s.topicsBy, "studio: the page gets every brand, with its own voice rules and topics");
    ok(kt.brand === "kitchen-table" && kt.tells.some((x) => x.tell === "your never-do") && me.brand === "" && me.tells.some((x) => x.tell === "no ask at the end"), "…and each card is judged by its own brand");
    const rr = await fetch(b7 + "/api/post/2026-11-28-me", { method: "PUT", headers: h7, body: JSON.stringify({ brand: "kitchen-table" }) });
    ok((await rr.json()).post.brand === "kitchen-table" && fs.readFileSync(path.join(dir, "posts/2026-11-28-me.md"), "utf8").includes("brand: kitchen-table"), "…moving a post to another brand saves its brand: line");
  } finally {
    s7.kill();
  }
  for (const f of ["posts/2026-11-28-kt.md", "posts/2026-11-28-me.md"]) fs.rmSync(path.join(dir, f));
  fs.rmSync(path.join(dir, "brands"), { recursive: true });
  fs.copyFileSync(path.join(path.resolve("template"), "brand/voice.md"), path.join(dir, "brand/voice.md"));
  ok(/## More than one brand/.test(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")) && fs.readFileSync(path.join(dir, "posts/_template.md"), "utf8").includes("brand:"), "AGENTS.md and the post template say how brands work");
}

// ---------- Clip it: tools/clip.mjs + Studio's card ----------
{
  const C = await import(path.join(dir, "tools/clip.mjs"));
  ok(C.parseTime("75") === 75 && C.parseTime("1:15") === 75 && C.parseTime("1:02:03,5") === 3723.5 && Number.isNaN(C.parseTime("soon")), "clip: reads times (75, 1:15, 1:02:03,5)");
  ok(C.clock(75) === "1:15" && C.clock(3723) === "1:02:03", "…and writes them back");
  const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<c>So here's</c> the thing.\n\n00:00:04.000 --> 00:00:04.010\nSo here's the thing.\n\n00:00:05.000 --> 00:00:09.500\nI shipped it at 1am.\n";
  const cues = C.cuesFromCaptions(vtt);
  ok(cues.length === 2 && cues[0].text === "So here's the thing." && cues[1].start === 5, "…a .vtt file becomes lines (tags gone, YouTube's repeated line dropped)");
  const T = { seconds: 40, segments: [
    { start: 0, end: 4, text: "So, um, where was I." }, { start: 4, end: 9, text: "Here's the thing nobody tells you about launching." },
    { start: 9, end: 14, text: "You get one day of attention," }, { start: 14, end: 22, text: "and then it's you posting every day for a year." },
    { start: 22, end: 30, text: "That's the job." }, { start: 30, end: 40, text: "Anyway, the second thing." } ],
    words: "Here's the thing nobody tells you about launching".split(" ").map((w, i) => ({ word: w, start: 4 + i * 0.6, end: 4.5 + i * 0.6 })) };
  const lines = C.transcriptLines(T);
  ok(lines.split("\n")[0] === "[0:00] So, um, where was I." && lines.includes("[0:09] You get one day of attention, and then it's you posting every day for a year."), "…the transcript reads as timed sentences for the agent");
  const picks = C.pickClips('Here you go: [{"from":"0:05","to":"0:29","hook":"Here\'s the thing","why":"a claim","topic":"x"},{"from":"0:10","to":"0:20","hook":"overlaps"},{"from":"0:01","to":"0:03"},{"from":"soon","to":"0:40"}]', T);
  ok(picks.length === 1 && picks[0].from === 4 && picks[0].to === 30, "…the agent's picks snap to whole sentences; too short, overlapping or not a time are dropped");
  ok(C.pickClips("no json here", T).length === 0, "…and an answer with no list gives no clips");
  const srt = C.windowSrt(T, 4, 9);
  ok(/^1\n00:00:00,000 --> /.test(srt) && srt.includes("Here's the thing\n"), "…a clip's captions start at 0, from the words heard");
  const fromLines = C.windowSrt({ segments: T.segments }, 9, 22);
  ok(fromLines.startsWith("1\n00:00:00,000 --> ") && fromLines.includes("\nYou get\n") && !fromLines.includes("You get one day of attention,"), "…or from the captions file's lines, still a few words at a time");
  const ca = C.cutArgs("in.mp4", "out.mp4", { from: 5, to: 20 });
  ok(ca.slice(0, 5).join(" ") === "-y -ss 5 -to 20" && ca.includes("in.mp4") && ca.join(" ").includes("1080:1920"), "…cuts with the vertical shape");
  ok(!C.cutArgs("in.mp4", "out.mp4", { from: 5, to: 20, size: "wide" }).includes("-filter_complex"), "…or leaves it wide");
  const pr = C.suggestPrompt({ linesFile: "library/talk.transcript.txt", seconds: 3600, brand: "Kitchen Table", topics: ["Worksheets"], goal: "sales" });
  ok(pr.includes("library/talk.transcript.txt") && pr.includes("1:00:00") && pr.includes("Worksheets") && /only have the words/.test(pr) && /JSON array/.test(pr), "…the agent is told what makes a clip, and that it only has the words");

  if (haveFf) {
    run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=40", "-f", "lavfi", "-i", "sine=frequency=300:duration=40", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "library/talk.mp4"], dir);
    fs.writeFileSync(path.join(dir, "library/talk.vtt"), "WEBVTT\n\n" + T.segments.map((g) => `00:00:${String(g.start).padStart(2, "0")}.000 --> 00:00:${String(g.end).padStart(2, "0")}.000\n${g.text}\n`).join("\n"));
    let cr = run("node", ["tools/clip.mjs", "hear", "library/talk.mp4", "--srt", "library/talk.vtt"], dir);
    ok(cr.status === 0 && JSON.parse(fs.readFileSync(path.join(dir, "library/talk.transcript.json"), "utf8")).segments.length === 6, "clip hear: a captions file becomes the transcript, free");
    cr = run("node", ["tools/clip.mjs", "cut", "library/talk.mp4", "--from", "4", "--to", "22", "--out", "library/cut-test.mp4"], dir);
    const probe = run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height:format=duration", "-of", "json", "library/cut-test.mp4"], dir);
    const pj = probe.status === 0 ? JSON.parse(probe.stdout) : {};
    ok(cr.status === 0 && pj.streams?.[0]?.width === 1080 && pj.streams?.[0]?.height === 1920 && Math.abs(Number(pj.format?.duration) - 18) < 0.6, "clip cut: 18 seconds, vertical, captions burned in (real ffmpeg)");
    ok(fs.readFileSync(path.join(dir, "library/INDEX.md"), "utf8").includes("| cut-test.mp4 | Clip 0:04–0:22 of talk.mp4"), "…with its line in INDEX.md, saying what's said");
    cr = run("node", ["tools/clip.mjs", "cut", "library/talk.mp4", "--from", "4", "--to", "9", "--no-captions", "--size", "wide", "--out", "library/cut-wide.mp4"], dir);
    ok(cr.status === 0 && fs.existsSync(path.join(dir, "library/cut-wide.mp4")), "…or wide, without captions");

    // Studio's card: where the video stands, hear it from the captions file, cut the ticked ones
    const portC = 51600 + Math.floor(Math.random() * 1000);
    const sc = spawn("node", ["tools/studio.mjs", "--port", String(portC), "--no-open"], { cwd: dir, env: { ...process.env, STUDIO_AGENT: "none", OPENAI_API_KEY: "" }, stdio: "pipe" });
    await new Promise((res) => { sc.stdout.on("data", (d) => String(d).includes("Studio for") && res()); setTimeout(res, 4000); });
    try {
      const bc = `http://127.0.0.1:${portC}`;
      const tokC = (await (await fetch(bc + "/")).text()).match(/const TOKEN = "([\w-]+)"/)?.[1];
      const hc = { "X-Studio-Token": tokC, "Content-Type": "application/json" };
      const wait = async (id) => { for (let i = 0; i < 80; i++) { const j = await (await fetch(`${bc}/api/job/${id}`, { headers: hc })).json(); if (j.state !== "running") return j; await new Promise((r2) => setTimeout(r2, 250)); } return {}; };
      fs.rmSync(path.join(dir, "library/talk.transcript.json"));
      let st = await (await fetch(`${bc}/api/clip?video=talk.mp4`, { headers: hc })).json();
      ok(st.heard === null && Math.round(st.seconds) === 40 && st.captions.includes("talk.vtt"), "studio clip: a new video isn't heard yet, and the captions file is offered");
      let rq = await fetch(bc + "/api/clip/hear", { method: "POST", headers: hc, body: JSON.stringify({ video: "talk.mp4" }) });
      ok(rq.status === 500 && /OPENAI_API_KEY/.test((await rq.json()).error), "…hearing without an OpenAI key says to add one, or use a captions file");
      rq = await fetch(bc + "/api/clip/hear", { method: "POST", headers: hc, body: JSON.stringify({ video: "talk.mp4", srt: "talk.vtt" }) });
      ok((await wait((await rq.json()).job)).state === "done" && (await (await fetch(`${bc}/api/clip?video=talk.mp4`, { headers: hc })).json()).heard?.sentences === 6, "…heard from the captions file");
      rq = await fetch(bc + "/api/clip/suggest", { method: "POST", headers: hc, body: JSON.stringify({ video: "talk.mp4" }) });
      ok(rq.status === 500 && /Claude Code/.test((await rq.json()).error), "…suggesting needs an agent, and says what to do without one");
      rq = await fetch(bc + "/api/clip/cut", { method: "POST", headers: hc, body: JSON.stringify({ video: "talk.mp4", picks: [{ from: 4, to: 14, hook: "Here's the thing nobody tells you" }], size: "1:1" }) });
      const cut = await rq.json();
      ok((await wait(cut.job)).state === "done" && fs.existsSync(path.join(dir, cut.files[0])) && /clip-here-s-the-thing-nobody-tells-you\.mp4$/.test(cut.files[0]), "…cuts the ticked one into the library");
      ok(fs.readFileSync(path.join(dir, "ideas/inbox.md"), "utf8").includes(`- [ ] Clip: "Here's the thing nobody tells you" (${cut.files[0]}, from talk.mp4 at 0:04`), "…and it waits as an idea in the inbox");
      rq = await fetch(bc + "/api/clip?video=../AGENTS.md", { headers: hc });
      ok(rq.status === 500, "…only videos inside library/");
    } finally {
      sc.kill();
    }
  }
}

// ---------- Carousel: tools/carousel-rules.mjs + Studio's look and split ----------
{
  const K = await import(path.join(dir, "tools/carousel-rules.mjs"));
  const L = K.lookOf("- background: #112233\n- text: #FFFFFF\n- accent: red\n- font: Comic Sans\n- handle: @shop");
  ok(L.background === "#112233" && L.text === "#ffffff" && L.accent === K.DEFAULT_LOOK.accent && L.font === "Archivo" && L.handle === "@shop", "carousel: brand/look.md is read; a colour or font it can't use keeps the default");
  ok(K.lookOf(K.lookText(L)).background === "#112233" && K.lookText(L).startsWith("# How the brand looks"), "…and written back the same");
  ok(K.splitSlides("Hook line.\n\nPoint one\nstill one.\n---\nPoint two.\n\n\nAsk?").join("|") === "Hook line.|Point one still one.|Point two.|Ask?", "…a blank line or --- starts the next slide");
  ok(K.parseSlides('Sure: ["One", "Two *big*", ""]').join("|") === "One|Two *big*" && K.parseSlides("nope").length === 0, "…the agent's slides are read from its list");
  ok(JSON.stringify(K.runsOf("I cut it to *one*.")) === JSON.stringify([{ text: "I cut it to ", hot: false }, { text: "one", hot: true }, { text: ".", hot: false }]), "…*stars* mark the accent word");
  const pr = K.slidesPrompt("Fifty sign-ups. Half quit.", "plain, no hype");
  ok(pr.includes("Fifty sign-ups. Half quit.") && /Never add a fact/.test(pr) && pr.includes("plain, no hype"), "…the agent is told to shorten, never invent");

  const portK = 52700 + Math.floor(Math.random() * 1000);
  const sk = spawn("node", ["tools/studio.mjs", "--port", String(portK), "--no-open"], { cwd: dir, env: { ...process.env, STUDIO_AGENT: "none" }, stdio: "pipe" });
  await new Promise((res) => { sk.stdout.on("data", (d) => String(d).includes("Studio for") && res()); setTimeout(res, 4000); });
  try {
    const bk = `http://127.0.0.1:${portK}`;
    const tokK = (await (await fetch(bk + "/")).text()).match(/const TOKEN = "([\w-]+)"/)?.[1];
    const hk = { "X-Studio-Token": tokK, "Content-Type": "application/json" };
    let lk = await (await fetch(bk + "/api/look", { headers: hk })).json();
    ok(lk.background === K.DEFAULT_LOOK.background && !fs.existsSync(path.join(dir, "brand/look.md")), "studio carousel: no look.md yet gives the default look");
    lk = await (await fetch(bk + "/api/look", { method: "PUT", headers: hk, body: JSON.stringify({ ...lk, accent: "#ff8800", handle: "@kt" }) })).json();
    ok(lk.accent === "#ff8800" && fs.readFileSync(path.join(dir, "brand/look.md"), "utf8").includes("- handle: @kt"), "…Save as my look writes brand/look.md");
    const sr = await fetch(bk + "/api/carousel/split", { method: "POST", headers: hk, body: JSON.stringify({ words: "A post." }) });
    ok(sr.status === 500 && /one slide per paragraph/.test((await sr.json()).error), "…splitting without an agent says how to do it by hand");
    ok((await fetch(bk + "/carousel-rules.mjs?t=" + tokK)).status === 200, "…the page gets the same rules");
  } finally {
    sk.kill();
  }
  fs.rmSync(path.join(dir, "brand/look.md"), { force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
