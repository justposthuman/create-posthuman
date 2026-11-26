#!/usr/bin/env node
// The humanize check, and the last look before the user sees a draft. No AI, no network, free.
//
//   node tools/humanize.mjs posts/2026-11-24-slug.md [more files…]    flags per post (exit 1 if any)
//   node tools/humanize.mjs --text "words to check"
//
// For each post it checks:
//   - what makes words read like AI or marketing wrote them (tools/humanize-rules.mjs), the main words and every
//     account's own words;
//   - the user's own no's from the post's brand's voice.md (brand/, or brands/<name>/ for its brand): a quoted
//     "never" phrase; a missing question when the voice says every post ends with an ask;
//   - each account's words against its platform's length (each part of a thread on X, Bluesky, Mastodon, Threads)
//     and its hard no's from brand/accounts.md.
//
// It's a smoke alarm, not a judge: a flag means "look again", and a line can stay if it's really how the user
// talks. The fix for each one is in recipes/humanize.md. Studio shows the same flags on every card.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitCheck, parseAccounts, setupFor } from "./account-rules.mjs";
import { brandFile, brandOfPost, brandsOf } from "./brands.mjs";
import { check, parseVoice } from "./humanize-rules.mjs";
import { lengthCheck, platformOf } from "./length-rules.mjs";
import { listOf, parsePost, wordsFor } from "./post-rules.mjs";
export { check, parseVoice, RULES } from "./humanize-rules.mjs";

const HERE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(HERE), "..");
const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");

/** The user's own rules from a brand's voice.md (the main brand's by default; empty when there's no file yet). */
export const voiceRules = (root = ROOT, brand = null) => parseVoice(readIf(brand ? brandFile(brand, "voice.md", root) : path.join(root, "brand", "voice.md")));

/** The main words of a post file (the "## Everywhere" part). */
export function wordsOf(file) {
  const s = fs.readFileSync(file, "utf8");
  return parsePost(s).everywhere || s;
}

/** Every flag for one post file: [{ where, tell, found, fix }]. where = "" for the main words, else the account. */
export function checkPost(file, { root = ROOT } = {}) {
  const p = parsePost(fs.readFileSync(file, "utf8"));
  const accts = parseAccounts(readIf(path.join(root, "brand", "accounts.md")));
  // each post is judged by its own brand's voice (brands/<name>/voice.md), never another brand's
  const voice = voiceRules(root, brandOfPost(p.front, brandsOf(root), accts));
  const media = listOf(p.front.media).length;
  const out = check(p.everywhere, { voice }).map((f) => ({ where: "", ...f }));
  // an account's own words: the AI tells and the voice, but hashtags are that account's call (its setup says)
  // Search-first places (Pinterest, Google Business) don't get a question at the end: nobody's there to answer it.
  const searchFirst = (acct) => ["pinterest", "google_business"].includes(platformOf(acct)?.id);
  for (const x of p.per) {
    const own = wordsFor(p, x.account);
    if (own === p.everywhere) continue;
    for (const f of check(own, { voice, hashtagsOk: true })) {
      if (f.tell === "no ask at the end" && searchFirst(x.account)) continue;
      if (!out.some((o) => o.tell === f.tell && o.found.join() === f.found.join())) out.push({ where: x.account, ...f });
    }
  }
  for (const acct of listOf(p.front.accounts)) {
    const w = wordsFor(p, acct);
    const known = setupFor(acct, accts);
    for (const f of [...lengthCheck(acct, w, { media, max: known?.max }), ...fitCheck(known?.setup, w)]) out.push({ where: acct, tell: f.issue, found: [], fix: f.fix });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--text");
  const files = args.filter((a) => !a.startsWith("--") && !path.basename(a).startsWith("_"));
  if (i < 0 && !files.length) {
    console.error('Usage: node tools/humanize.mjs posts/file.md [more…]   or   --text "words"');
    process.exit(2);
  }
  const items = i >= 0 ? [["(text)", check(args[i + 1] ?? "", { voice: voiceRules() }).map((f) => ({ where: "", ...f }))]] : files.map((f) => [f, checkPost(f)]);
  let any = 0;
  for (const [name, flags] of items) {
    any += flags.length;
    console.log(flags.length ? `${name}: ${flags.length} to look at` : `${name}: reads human`);
    for (const f of flags) console.log(`  - ${f.where ? `${f.where}: ` : ""}${f.tell}${f.found.length ? `: ${f.found.map((x) => `"${x}"`).join(", ")}` : ""}. ${f.fix}`);
  }
  process.exit(any ? 1 : 0);
}
