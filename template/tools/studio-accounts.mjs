// Studio's Accounts place: each account's setup (brand/accounts.md, a copy of Posthuman's "Make it yours"). Plain
// files and the user's own agent; the only Posthuman tools used here are read-only (the briefing, for Refresh).

import fs from "node:fs";
import path from "node:path";
import { answersToSetup, cleanAnswers, introFor, parseAccounts, writeAccounts } from "./account-rules.mjs";
import { ROOT } from "./lib.mjs";
import { listOf, parsePost } from "./post-rules.mjs";
import { POSTHUMAN_READ, runAgent } from "./studio-more.mjs";

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").replace(/\r/g, "") : "");
export const ACCOUNTS = path.join(ROOT, "brand", "accounts.md");
const mcpConfig = () => (fs.existsSync(path.join(ROOT, ".mcp.json")) ? ["--mcp-config", path.join(ROOT, ".mcp.json")] : []);
const json = (out) => {
  const i = out.indexOf("[");
  const j = out.lastIndexOf("]");
  if (i < 0 || j < i) throw new Error("Your agent didn't come back with an answer. Try again.");
  return JSON.parse(out.slice(i, j + 1));
};

/** Posthuman's address, from .mcp.json (for "change it in Posthuman" links). */
export function posthumanUrl() {
  try {
    const u = JSON.parse(read(path.join(ROOT, ".mcp.json"))).mcpServers?.posthuman?.url;
    return u ? new URL(u).origin : "";
  } catch {
    return "";
  }
}

// ---------- accounts ----------

/** The account lines of every post file (not dropped): what's already written for which account. */
function postAccounts() {
  const dir = path.join(ROOT, "posts");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_")).flatMap((f) => {
    const p = parsePost(read(path.join(dir, f)));
    return p.front.status === "dropped" ? [] : listOf(p.front.accounts);
  });
}

export const accountsView = () => {
  const accounts = parseAccounts(read(ACCOUNTS));
  const lines = postAccounts();
  for (const a of accounts) a.intro = introFor(a, accounts, lines);
  return { accounts, synced: fs.existsSync(ACCOUNTS) && (/<!-- refreshed /.test(read(ACCOUNTS)) || accounts.some((a) => a.account_id)) ? Math.round(fs.statSync(ACCOUNTS).mtimeMs) : 0, /* the stub was never copied from Posthuman; a copy the agent wrote has account ids */ posthuman: posthumanUrl() };
};

/** Refresh brand/accounts.md from Posthuman's briefing (read only). */
export function refreshAccounts() {
  const prompt =
    "Call the posthuman briefing tool. Reply with ONLY a JSON array, nothing else: one object per account in the briefing, " +
    '{"account_id": its account_id, "account": its account name exactly as the briefing says it, "setup": its setup object exactly as given, or the string "not yet", "past_posts": its past_posts number, or 0 when the briefing shows none, "max_characters": its max_characters number only when the briefing gives one (an X account with Premium), else leave it out}. ' +
    "If Posthuman isn't connected, reply with exactly: NOT CONNECTED";
  return runAgent("accounts", prompt, [...mcpConfig(), "--allowedTools", ...POSTHUMAN_READ, "--disallowedTools", "Bash", "Edit", "Write"], {
    onDone(job) {
      if (/NOT CONNECTED/.test(job.out) && !job.out.includes("[")) throw new Error("Posthuman isn't connected in this folder yet. Open your agent here and sign in (/mcp).");
      const list = json(job.out).filter((a) => a && a.account);
      fs.mkdirSync(path.dirname(ACCOUNTS), { recursive: true });
      fs.writeFileSync(ACCOUNTS, writeAccounts(list, { url: posthumanUrl() }));
      job.count = list.length;
    },
  });
}

// ---------- a hello on a brand-new account (AGENTS.md: "A new account says hello") ----------

const WRITE = ["Read", "Write", "Edit", "Glob", "Grep", "Bash(node tools/substance.mjs:*)", "Bash(node tools/humanize.mjs:*)"];

/** Draft one intro post for one account. Never schedules it. */
export function writeIntro(account) {
  const a = parseAccounts(read(ACCOUNTS)).find((x) => x.account === account);
  if (!a) throw new Error("No such account in brand/accounts.md. Refresh from Posthuman first.");
  const prompt =
    `Follow AGENTS.md, "A new account says hello", for this one account: ${a.account}. ` +
    "Write ONE draft post file in posts/ (status: draft, accounts: [that account only], made_with_ai true only if its media was made with AI), dated the next day that has no post for it. " +
    "Write it from brand/about.md, brand/voice.md and that account's setup in brand/accounts.md (who reads it, how they sound there, its hard no's): who's behind it, what people will get here, and a real question to end on. True facts only, nothing the folder doesn't say. " +
    "Instagram, TikTok and YouTube need a picture or clip: use one from library/INDEX.md that fits (add the post's file name to its Used in column), and if there's none, say so in # Notes as \"CONFIRM: needs a clip\". YouTube also needs a title line in # Notes. " +
    "Then run node tools/substance.mjs and node tools/humanize.mjs on the file and fix every flag. Do NOT schedule anything and don't change other files. " +
    "At the end reply with the file name on its own line, then the words.";
  return runAgent("intro", prompt, [...mcpConfig(), "--allowedTools", ...WRITE, ...POSTHUMAN_READ], {
    onDone(job) {
      job.file = (job.out.match(/posts\/[\w.-]+\.md/) || [""])[0];
    },
  });
}

// ---------- "you choose": suggest the six answers, save them on the user's yes ----------

/** Suggest the six setup answers for some accounts, from their past posts and the brand files. Read only. */
export function suggestSetups(ids) {
  const list = parseAccounts(read(ACCOUNTS)).filter((a) => ids.includes(a.account_id));
  if (!list.length) throw new Error("No such accounts in brand/accounts.md. Refresh from Posthuman first.");
  const prompt =
    `The user asked you to choose the setup for these accounts: ${list.map((a) => `${a.account} (account_id ${a.account_id})`).join(", ")}. ` +
    "For each one, read its past posts if Posthuman has any (past_posts), and brand/about.md, brand/voice.md and the other accounts' setups in brand/accounts.md, then suggest the six answers the way the user would say them. " +
    "Reply with ONLY a JSON array, nothing else: one object per account, " +
    '{"account_id": n, "audience": "who reads it", "sound": "how they sound here", "role": "own" | "copy" | "big", "rhythm": "how often and when", "no_hashtags": true|false, "no_links": true|false, "no_emoji": true|false, "never_name": "words never to use here, comma separated, or empty", "example": "one of their own posts word for word, or empty", "why": "a few words on where this came from"}. ' +
    "Never make up an example: only a real post of theirs, or empty. These are only suggestions: the user sees them before anything is saved.";
  return runAgent("suggest", prompt, [...mcpConfig(), "--allowedTools", "Read", "Glob", "Grep", ...POSTHUMAN_READ, "--disallowedTools", "Bash", "Edit", "Write"], {
    onDone(job) {
      job.suggestions = json(job.out).filter((x) => x && ids.includes(Number(x.account_id))).map((x) => ({ account_id: Number(x.account_id), why: String(x.why ?? "").slice(0, 200), ...cleanAnswers(x) }));
    },
  });
}

/** Save the answers the user said yes to: Posthuman's set_up_account, then the local copy in brand/accounts.md. */
export function saveSetups(items) {
  const all = parseAccounts(read(ACCOUNTS));
  const list = items.map((x) => ({ account_id: Number(x.account_id), ...cleanAnswers(x) })).filter((x) => all.some((a) => a.account_id === x.account_id));
  if (!list.length) throw new Error("Nothing to save.");
  const prompt =
    "The user read these setup answers and said yes to them. For each object, call the posthuman set_up_account tool once with exactly these fields and values, nothing added or changed: " +
    `${JSON.stringify(list)}. ` +
    "Reply with ONLY a JSON array: one object per account, {\"account_id\": n, \"saved\": true|false, \"say\": what Posthuman said, in a few words}. If Posthuman isn't connected, reply with exactly: NOT CONNECTED";
  return runAgent("setup", prompt, [...mcpConfig(), "--allowedTools", "mcp__posthuman__set_up_account", "--disallowedTools", "Bash", "Edit", "Write", "Read"], {
    onDone(job) {
      if (/NOT CONNECTED/.test(job.out) && !job.out.includes("[")) throw new Error("Posthuman isn't connected in this folder yet. Open your agent here and sign in (/mcp).");
      const res = json(job.out);
      const ok = new Set(res.filter((r) => r.saved).map((r) => Number(r.account_id)));
      // keep the local copy in step (the next Refresh brings Posthuman's own version anyway)
      const next = all.map((a) => {
        const x = list.find((y) => y.account_id === a.account_id);
        return { ...a, setup: x && ok.has(a.account_id) ? answersToSetup(x) : a.setup || "not yet" };
      });
      fs.writeFileSync(ACCOUNTS, writeAccounts(next, { url: posthumanUrl() }));
      job.saved = [...ok];
      job.results = res;
    },
  });
}
