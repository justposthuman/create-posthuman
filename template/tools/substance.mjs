#!/usr/bin/env node
// The substance check from the command line: does each post give the reader something?
//
//   node tools/substance.mjs posts/*.md        flags per post (exit 1 if any)
//
// Run it before the humanize pass (tools/humanize.mjs). Rules and the five kinds: tools/substance-rules.mjs.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listOf, parsePost } from "./post-rules.mjs";
import { substance } from "./substance-rules.mjs";
export { GIVES, substance } from "./substance-rules.mjs";

/** gives / payload / media and the main words from a post file. */
export function readPost(file) {
  const p = parsePost(fs.readFileSync(file, "utf8"));
  return { gives: p.front.gives ?? "", payload: p.front.payload ?? "", media: listOf(p.front.media), words: p.everywhere };
}

const HERE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  const files = process.argv.slice(2).filter((f) => !path.basename(f).startsWith("_"));
  if (!files.length) {
    console.error("Usage: node tools/substance.mjs posts/file.md [more…]");
    process.exit(2);
  }
  let any = 0;
  for (const f of files) {
    const p = readPost(f);
    const flags = substance(p);
    any += flags.length;
    console.log(flags.length ? `${f}: ${flags.length} to look at` : `${f}: gives ${p.gives} (${p.payload})`);
    for (const x of flags) console.log(`  - ${x.issue}. ${x.fix}`);
  }
  process.exit(any ? 1 : 0);
}
