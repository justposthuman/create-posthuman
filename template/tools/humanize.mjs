#!/usr/bin/env node
// The humanize check: flags what makes a post read like AI or marketing wrote it. No AI, no network, free.
//
//   node tools/humanize.mjs posts/2026-11-24-slug.md [more files…]    flags per post (exit 1 if any)
//   node tools/humanize.mjs --text "words to check"
//
// It's a smoke alarm, not a judge: a flag means "look again", and a line can stay if it's really how the user
// talks. The fix for each one is in recipes/humanize.md. Studio shows the same flags on every card.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { check } from "./humanize-rules.mjs";
export { check, RULES } from "./humanize-rules.mjs";

/** The main words of a post file (the "## Everywhere" part). */
export function wordsOf(file) {
  const s = fs.readFileSync(file, "utf8").replace(/\r/g, "");
  return s.match(/## Everywhere\n([\s\S]*?)(?=\n## |\n# |$)/)?.[1].trim() ?? s;
}

const HERE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--text");
  const items = i >= 0 ? [["(text)", args[i + 1] ?? ""]] : args.filter((a) => !a.startsWith("--")).map((f) => [f, wordsOf(f)]);
  if (!items.length) {
    console.error('Usage: node tools/humanize.mjs posts/file.md [more…]   or   --text "words"');
    process.exit(2);
  }
  let any = 0;
  for (const [name, words] of items) {
    const flags = check(words);
    any += flags.length;
    console.log(flags.length ? `${name}: ${flags.length} to look at` : `${name}: reads human`);
    for (const f of flags) console.log(`  - ${f.tell}: ${f.found.map((x) => `"${x}"`).join(", ")}. ${f.fix}`);
  }
  process.exit(any ? 1 : 0);
}
