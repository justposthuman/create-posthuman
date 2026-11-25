// Each account's setup ("Make it yours" in Posthuman: who reads it, how the user sounds there, what goes there, how
// often, the hard no's, a post that's so them), as the local copy in brand/accounts.md. Posthuman holds the real one;
// the agent refreshes this copy from the briefing each session (or Studio's Refresh). Pure, so Studio's page and the
// tools read it the same way.
//
//   ## X @mybrand
//   - account_id: 12
//   - who reads it: indie devs and people building on the side
//   - sounds: short and dry, a punchline at the end
//   - what goes here: its own posts, written for here
//   - how often: one a day, evenings
//   - never: hashtags; naming my day job, Acme
//   - like this: Day 3 of building after the kids go to bed…

const KEYS = { account_id: "account_id", "who reads it": "who_reads_it", sounds: "sounds", "what goes here": "what_goes_here", "how often": "how_often", never: "never", "like this": "like_this" };

export function parseAccounts(text = "") {
  const out = [];
  let cur = null;
  let inComment = false;
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    if (inComment || /^\s*<!--/.test(line)) {
      inComment = !line.includes("-->");
      continue;
    }
    const h = line.match(/^## +(.+?)\s*$/);
    if (h) {
      out.push((cur = { account: h[1].trim(), setup: null }));
      continue;
    }
    const kv = cur && line.match(/^\s*[-*]\s*([a-z_ ]+):\s*(.*)$/i);
    if (!kv) continue;
    const k = KEYS[kv[1].trim().toLowerCase()];
    if (!k) continue;
    if (k === "account_id") cur.account_id = Number(kv[2]) || null;
    else if (/^not yet/i.test(kv[2])) continue;
    else {
      cur.setup ??= {};
      cur.setup[k] = k === "never" ? kv[2].split(kv[2].includes(";") ? ";" : ",").map((s) => s.trim()).filter(Boolean) : kv[2].trim();
    }
  }
  return out;
}

/** The file from the briefing's accounts: [{ account_id, account, setup }] (setup = the briefing's object, or "not yet"). */
export function writeAccounts(accounts, { url = "", now = new Date() } = {}) {
  const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const one = (a) => {
    const s = a.setup && typeof a.setup === "object" ? a.setup : null;
    return [
      `## ${line(a.account)}`,
      a.account_id ? `- account_id: ${a.account_id}` : "",
      ...(s
        ? [
            s.who_reads_it && `- who reads it: ${line(s.who_reads_it)}`,
            s.sounds && `- sounds: ${line(s.sounds)}`,
            s.what_goes_here && `- what goes here: ${line(s.what_goes_here)}`,
            s.how_often && `- how often: ${line(s.how_often)}`,
            s.never?.length && `- never: ${[].concat(s.never).map(line).join("; ")}`,
            s.like_this && `- like this: ${line(s.like_this)}`,
          ]
        : ["- not yet: ask the setup questions (AGENTS.md, Accounts)"]),
    ]
      .filter(Boolean)
      .join("\n");
  };
  return `# Accounts

How each account works, as the user set it up in Posthuman ("Make it yours"). This is a copy: your agent refreshes
it from Posthuman's briefing. To change it, change it in Posthuman${url ? ` (${url.replace(/\/$/, "")}/accounts)` : ""} or ask your agent, which suggests the change there.

<!-- refreshed ${now.toISOString().slice(0, 16).replace("T", " ")} UTC -->

${accounts.map(one).join("\n\n")}
`;
}

/** Which setup belongs to a post's account line ("x @mybrand", "bluesky mybrand.bsky.social"). */
export function setupFor(acct, accounts) {
  const a = String(acct).toLowerCase();
  const handle = (a.match(/@?[\w.-]+(?:@[\w.-]+)?$/) || [""])[0].replace(/^@/, "");
  return (
    accounts.find((x) => x.account.toLowerCase() === a) ||
    accounts.find((x) => handle && x.account.toLowerCase().replace(/@/g, "").includes(handle) && x.account.toLowerCase().split(/\s/)[0] === a.split(/\s/)[0]) ||
    accounts.find((x) => handle && x.account.toLowerCase().replace(/@/g, "").includes(handle)) ||
    null
  );
}

const EMOJI = /\p{Extended_Pictographic}/u;
/** Words that break an account's hard no's: [{ issue, fix }] like the other checks. The same rules as Posthuman's hints. */
export function fitCheck(setup, words) {
  const out = [];
  if (!setup?.never?.length || !words) return out;
  const never = setup.never.map((n) => n.toLowerCase());
  if (never.includes("hashtags") && /(^|\s)#[\p{L}\d_]+/u.test(words)) out.push({ issue: "hashtags, but this account says no hashtags", fix: "Take them out (or give this account its own words)." });
  if (never.includes("links") && /https?:\/\/|\bwww\.\S+\.\S+/i.test(words)) out.push({ issue: "a link, but this account says no links", fix: "Take it out, or say where to find it in words." });
  if (never.includes("emoji") && EMOJI.test(words)) out.push({ issue: "emoji, but this account says no emoji", fix: "Take them out." });
  for (const n of setup.never) {
    const m = n.match(/^naming\s+(.+)$/i);
    if (!m) continue;
    for (const w of m[1].split(",").map((x) => x.trim()).filter((x) => x.length > 1)) {
      if (new RegExp(`(^|[^\\p{L}\\d])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\d])`, "iu").test(words)) out.push({ issue: `names “${w}”, which this account never names`, fix: "Leave it out here." });
    }
  }
  return out;
}
