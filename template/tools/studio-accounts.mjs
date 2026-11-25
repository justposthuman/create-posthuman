// Studio's Accounts place: each account's setup (brand/accounts.md, a copy of Posthuman's "Make it yours"). Plain
// files and the user's own agent; the only Posthuman tools used here are read-only (the briefing, for Refresh).

import fs from "node:fs";
import path from "node:path";
import { parseAccounts, writeAccounts } from "./account-rules.mjs";
import { ROOT } from "./lib.mjs";
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

export const accountsView = () => ({ accounts: parseAccounts(read(ACCOUNTS)), synced: fs.existsSync(ACCOUNTS) && /<!-- refreshed /.test(read(ACCOUNTS)) ? Math.round(fs.statSync(ACCOUNTS).mtimeMs) : 0, /* the stub was never copied from Posthuman */ posthuman: posthumanUrl() });

/** Refresh brand/accounts.md from Posthuman's briefing (read only). */
export function refreshAccounts() {
  const prompt =
    "Call the posthuman briefing tool. Reply with ONLY a JSON array, nothing else: one object per account in the briefing, " +
    '{"account_id": its account_id, "account": its account name exactly as the briefing says it, "setup": its setup object exactly as given, or the string "not yet"}. ' +
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
