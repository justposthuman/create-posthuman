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
//   - posts so far: 46        (how many past posts Posthuman has for it; 0 = a brand-new account, see introFor)
//   - longest post: 25000     (only when this account takes more than its platform usually does: X with Premium)

const KEYS = { account_id: "account_id", "posts so far": "posts", "longest post": "max", "who reads it": "who_reads_it", sounds: "sounds", "what goes here": "what_goes_here", "how often": "how_often", never: "never", "like this": "like_this" };

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
      out.push((cur = { account: h[1].trim(), setup: null, posts: null }));
      continue;
    }
    const kv = cur && line.match(/^\s*[-*]\s*([a-z_ ]+):\s*(.*)$/i);
    if (!kv) continue;
    const k = KEYS[kv[1].trim().toLowerCase()];
    if (!k) continue;
    if (k === "account_id") cur.account_id = Number(kv[2]) || null;
    else if (k === "posts") cur.posts = /^\d+$/.test(kv[2].trim()) ? Number(kv[2]) : null;
    else if (k === "max") cur.max = Number(kv[2].replace(/[,_\s]/g, "")) || null;
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
      Number.isInteger(a.past_posts ?? a.posts) ? `- posts so far: ${a.past_posts ?? a.posts}` : "",
      Number(a.max_characters ?? a.max) > 0 ? `- longest post: ${Number(a.max_characters ?? a.max)}` : "",
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

// ---------- a brand-new account (AGENTS.md: "A new account says hello") ----------
// Search-first platforms: people find posts there by searching, so a hello reaches no one.
const SEARCH_FIRST = /pinterest|google/i;

/** Should this account get an intro? "yes", "skip" (search-first platform), or "" (not new, or we don't know).
 *  postAccounts: the account lines of every post file in posts/ (any status but dropped). */
export function introFor(a, all, postAccounts = []) {
  if (a.posts !== 0) return ""; // only when Posthuman says it has no posts yet (null = an older copy: unknown)
  // something is already written for it: same platform (setupFor alone would match "X @shop" to "Threads @shop")
  const first = (s) => String(s).trim().toLowerCase().split(/\s+/)[0];
  if (postAccounts.some((line) => first(line) === first(a.account) && setupFor(line, all) === a)) return "";
  return SEARCH_FIRST.test(a.account) ? "skip" : "yes";
}

// ---------- "you choose" (AGENTS.md: suggested setups, saved on the user's yes) ----------
export const ROLES = { own: "its own posts, written for here", copy: "the same posts as my main account", big: "only the big moments" };

/** The six answers as Posthuman's set_up_account takes them → the setup shape the briefing gives back. */
export function answersToSetup(x = {}) {
  const line = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const never = [x.no_hashtags && "hashtags", x.no_links && "links", x.no_emoji && "emoji", line(x.never_name) && `naming ${line(x.never_name)}`].filter(Boolean);
  const s = { who_reads_it: line(x.audience), sounds: line(x.sound), what_goes_here: ROLES[x.role] || "", how_often: line(x.rhythm), never, like_this: String(x.example ?? "").trim() };
  for (const k of Object.keys(s)) if (!s[k] || (Array.isArray(s[k]) && !s[k].length)) delete s[k];
  return s;
}

/** Only the fields set_up_account takes, cleaned (what an agent suggested may carry anything). */
export function cleanAnswers(x = {}) {
  const str = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const out = { audience: str(x.audience, 200), sound: str(x.sound, 200), role: ROLES[x.role] ? x.role : "own", rhythm: str(x.rhythm, 120), never_name: str(x.never_name, 200), example: String(x.example ?? "").trim().slice(0, 600), no_hashtags: !!x.no_hashtags, no_links: !!x.no_links, no_emoji: !!x.no_emoji };
  for (const k of ["audience", "sound", "rhythm", "never_name", "example"]) if (!out[k]) delete out[k];
  return out;
}
