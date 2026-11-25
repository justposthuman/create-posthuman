#!/usr/bin/env node
// More than one brand in one folder (AGENTS.md, "More than one brand").
//
//   brand/                 the main brand: about.md, voice.md, plus the files every brand shares (accounts.md, the
//                          copy of all your Posthuman accounts; sources.md, where your stuff is)
//   brands/<name>/         another brand: its own about.md and voice.md (anything missing falls back to brand/)
//
// A post belongs to the brand in its `brand:` line. With none, to the brand whose about.md lists its accounts under
// "Accounts on Posthuman" (by account id, like "Instagram @shop (12)"), and otherwise to the main brand.
//
//   node tools/brands.mjs                          the brands here, and which accounts each one has
//   node tools/brands.mjs add "Kitchen Table" [--accounts 10,12,15]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseAccounts } from "./account-rules.mjs";
import { fail, parseArgs } from "./lib.mjs";
import { listOf } from "./post-rules.mjs";

const HERE = fileURLToPath(import.meta.url);
const ROOT0 = path.resolve(path.dirname(HERE), "..");
const readIf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").replace(/\r/g, "") : "");
export const slugOf = (name) => String(name).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40);

/** The account ids a brand's about.md lists under "Accounts on Posthuman": "(12)", "(account 12)", "account_id: 12". */
export function accountIdsIn(about) {
  const sec = String(about).replace(/\r/g, "").match(/(?:^|\n)## Accounts on Posthuman\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? "";
  const clean = sec.replace(/<!--[\s\S]*?-->/g, "");
  return [...new Set([...clean.matchAll(/\((?:account[ _]?(?:id)?:?\s*)?(\d+)\)|account[ _]id:?\s*(\d+)/gi)].map((m) => Number(m[1] || m[2])))];
}

/** [{ slug, name, dir, ids }]: the main brand first (slug ""), then each folder in brands/. */
export function brandsOf(root = ROOT0) {
  const one = (slug, dir) => {
    const about = readIf(path.join(dir, "about.md"));
    return { slug, name: about.match(/^# About (.+)$/m)?.[1].trim() || slug || path.basename(root), dir, ids: accountIdsIn(about) };
  };
  const out = [one("", path.join(root, "brand"))];
  const bd = path.join(root, "brands");
  if (fs.existsSync(bd))
    for (const e of fs.readdirSync(bd, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name)))
      if (e.isDirectory() && !e.name.startsWith("_") && (fs.existsSync(path.join(bd, e.name, "about.md")) || fs.existsSync(path.join(bd, e.name, "voice.md")))) out.push(one(e.name, path.join(bd, e.name)));
  return out;
}

/** A brand's own file, or the main brand's when it doesn't have one. */
export function brandFile(b, name, root = ROOT0) {
  const own = b && path.join(b.dir, name);
  return own && fs.existsSync(own) ? own : path.join(root, "brand", name);
}

/** Which brand a post is: its `brand:` line, else the brand that lists its accounts, else the main one. */
export function brandOfPost(front, brands, accounts = []) {
  const want = String(front?.brand ?? "").trim();
  // the folder name first (it's unique), then the brand's name
  if (want) return brands.find((b) => b.slug && b.slug === slugOf(want)) ?? brands.find((b) => b.name.toLowerCase() === want.toLowerCase()) ?? brands[0];
  const ids = listOf(front?.accounts).map((line) => accounts.find((a) => a.account.toLowerCase() === line.toLowerCase())?.account_id).filter(Boolean);
  if (ids.length) {
    const hit = brands.slice(1).find((b) => b.ids.length && ids.every((id) => b.ids.includes(id)));
    if (hit) return hit;
  }
  return brands[0];
}

const ABOUT = (name, ids) => `# About ${name}

## What it is
<!-- fill: one or two sentences -->

## Who it's for
<!-- fill: the people who should care, in plain words -->

## Topics
<!-- fill: the 3 to 5 things you post about, one per line, with how many a week if you know: "- Building the app (~3)" -->

## Links
<!-- fill: website, shop, app, newsletter -->

## Accounts on Posthuman
${ids.length ? ids.map((id) => `- (${id})`).join("\n") : '<!-- fill: one line each, with its account id in brackets: "- Instagram @shop (12): photos + Reels" -->'}

## Goals
<!-- fill: what posting is for (followers, sign-ups, sales, a launch), the number that means it worked, by when -->

## This month
<!-- fill: what's going on: a launch, a sale, a season, a series -->
`;
const VOICE = (name) => `# How ${name} sounds

Every agent reads this before it writes a post for ${name}. Keep it to about a page. Lines the user wrote stay. An
agent can merge and tidy around them, never drop or reword them.

## Voice
<!-- fill: three words, then a few lines -->

## Never do
<!-- fill: "no hashtags", "never mention prices" -->

## Words we use
<!-- fill: names, spellings, sign-offs -->

## Examples we love
<!-- fill: two or three real posts that sound right -->

## What worked
<!-- the agent adds these from real results -->
`;

/** Make brands/<slug>/ with a blank about.md and voice.md. */
export function addBrand(name, { ids = [], root = ROOT0 } = {}) {
  const slug = slugOf(name);
  if (!slug) throw new Error("Give the brand a name.");
  const dir = path.join(root, "brands", slug);
  if (fs.existsSync(dir)) throw new Error(`brands/${slug} is already here.`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "about.md"), ABOUT(name, ids));
  fs.writeFileSync(path.join(dir, "voice.md"), VOICE(name));
  return { slug, dir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === HERE) {
  const a = parseArgs(process.argv.slice(2));
  if (a._[0] === "add") {
    const name = a._.slice(1).join(" ").trim();
    if (!name) fail('Usage: node tools/brands.mjs add "Brand name" [--accounts 10,12]');
    const ids = String(a.accounts ?? "").split(/[,\s]+/).map(Number).filter(Boolean);
    try {
      const b = addBrand(name, { ids });
      console.log(`Made brands/${b.slug}/ (about.md, voice.md). Fill them in, then put "brand: ${b.slug}" on its posts.`);
    } catch (e) {
      fail(e.message);
    }
    process.exit(0);
  }
  const accts = parseAccounts(readIf(path.join(ROOT0, "brand", "accounts.md")));
  for (const b of brandsOf()) {
    const names = b.ids.map((id) => accts.find((x) => x.account_id === id)?.account ?? `account ${id}`);
    console.log(`${b.slug ? `brands/${b.slug}` : "brand (main)"}: ${b.name}${names.length ? `: ${names.join(", ")}` : b.slug ? ": no accounts listed in its about.md" : ""}`);
  }
}
