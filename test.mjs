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
} finally {
  srv.kill();
}
const { parseAngles } = await import(path.join(dir, "tools/studio-more.mjs"));
const pa = parseAngles('Sure! Here you go:\n[{"angle":"A","gives":"TIP","payload":"p","first_line":"f"},{"angle":"B","gives":"weird"}]\nHope that helps');
ok(pa.length === 2 && pa[0].gives === "tip" && pa[1].gives === "", "brainstorm answers are read even with words around them; unknown kinds left blank");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} failed` : "\nall passed");
process.exit(bad ? 1 : 0);
