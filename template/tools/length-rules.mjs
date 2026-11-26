// Does each account's words fit its platform? Pure (no Node imports), so Studio's page, Studio's server and
// tools/humanize.mjs count the same way. The limits are the ones Posthuman's get_platform_rules gives (checked
// 2026-11-25); Posthuman's check_post is still the final word.
//
// Thread platforms (X, Bluesky, Mastodon, Threads) post each --- part under the one before, so each part has to fit.
// Everywhere else the parts go out as one post, so the whole thing has to fit.
// Some accounts take more than their platform usually does (X with Premium: 25,000). Posthuman's briefing says so
// (max_characters), brand/accounts.md keeps it as "- longest post:", and the callers pass it here as { max }.

export const PLATFORMS = [
  { id: "x", re: /^x\b|^twitter\b/i, name: "X", limit: 280, thread: true, count: "x" },
  { id: "bluesky", re: /bluesky|bsky/i, name: "Bluesky", limit: 300, thread: true, count: "graphemes" },
  { id: "mastodon", re: /mastodon/i, name: "Mastodon", limit: 500, thread: true, count: "mastodon" },
  { id: "threads", re: /^threads\b/i, name: "Threads", limit: 500, thread: true },
  { id: "instagram", re: /instagram/i, name: "Instagram", limit: 2200 },
  { id: "tiktok", re: /tiktok/i, name: "TikTok", limit: 2200 },
  { id: "youtube", re: /youtube/i, name: "YouTube", limit: 5000 },
  { id: "linkedin", re: /linkedin/i, name: "LinkedIn", limit: 3000 },
  { id: "pinterest", re: /pinterest/i, name: "Pinterest", limit: 800 },
  { id: "telegram", re: /telegram/i, name: "Telegram", limit: 4096, withMedia: 1024 },
  { id: "discord", re: /discord/i, name: "Discord", limit: 2000 },
  { id: "facebook", re: /facebook/i, name: "Facebook", limit: 63206 },
  { id: "google_business", re: /google/i, name: "Google Business", limit: 1500 },
  { id: "tumblr", re: /tumblr/i, name: "Tumblr", limit: 4096 },
  { id: "nostr", re: /nostr/i, name: "Nostr", limit: 10000 },
  { id: "reddit", re: /reddit/i, name: "Reddit", limit: 40000 },
  { id: "lemmy", re: /lemmy/i, name: "Lemmy", limit: 10000 },
];

/** The platform an account line is on ("X @shop", "Threads @shop.dev", "Pinterest Kitchen Table"), or null. */
export const platformOf = (account) => PLATFORMS.find((p) => p.re.test(String(account).trim())) || null;

const URL_RE = /https?:\/\/\S+/g;
// X counts most of Latin, punctuation and the like as 1 and everything else (CJK, emoji) as 2; every link as 23.
const X_LIGHT = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
function xCount(s) {
  let n = 0;
  const rest = s.replace(URL_RE, () => ((n += 23), ""));
  const seg = typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter().segment(rest)].map((x) => x.segment) : [...rest];
  for (const g of seg) {
    const cp = g.codePointAt(0);
    n += g.length > 2 || /\p{Extended_Pictographic}/u.test(g) ? 2 : X_LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
  }
  return n;
}
const graphemes = (s) => (typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter().segment(s)].length : [...s].length);

/** How long some words are, the way this platform counts them. */
export function lengthOn(platform, text) {
  const s = String(text ?? "");
  if (platform?.count === "x") return xCount(s);
  if (platform?.count === "graphemes") return graphemes(s);
  if (platform?.count === "mastodon") return [...s.replace(URL_RE, "x".repeat(23))].length;
  return [...s].length;
}

const split = (t) => String(t ?? "").split(/\n-{3}[ \t]*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

/** [{ part, length, limit }] for one account's words: each part on a thread platform, the whole post elsewhere. */
export function lengthsFor(account, words, { media = 0, max = 0 } = {}) {
  const p = platformOf(account);
  if (!p) return [];
  const limit = Number(max) > 0 ? Number(max) : media && p.withMedia ? p.withMedia : p.limit;
  const parts = split(words);
  if (p.thread) return parts.map((t, i) => ({ part: parts.length > 1 ? i + 1 : 0, length: lengthOn(p, t), limit }));
  return [{ part: 0, length: lengthOn(p, parts.join("\n\n")), limit }];
}

/** [{ issue, fix }] when an account's words are too long, like the other checks. */
export function lengthCheck(account, words, opts) {
  const p = platformOf(account);
  return lengthsFor(account, words, opts)
    .filter((x) => x.length > x.limit)
    .map((x) => ({
      issue: `${x.part ? `part ${x.part} is` : "it's"} ${x.length} characters; ${p.name} takes ${x.limit}`,
      fix: `Cut ${x.length - x.limit}${p.thread ? ", or move a line into the next part (--- on its own line)" : ""}.`,
    }));
}
