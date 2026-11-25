// The humanize rules and check: pure, no Node imports, so the same file runs in Studio's page and in
// tools/humanize.mjs. Edit the list here; both pick it up.

// [pattern, flags, what it is, how to fix it]. Kept as plain strings so Studio's page can use the same list.
export const RULES = [
  ["—|–| -- ", "g", "dash", "AI's favorite punctuation. Use a period or a comma."],
  ["\\b(?:it'?s|this is|that'?s)\\s+not\\s+(?:just\\s+)?(?:about\\s+)?[^.,!?\\n]{1,40}[,;]\\s*(?:it'?s|but)\\b", "gi", "not X, it's Y", "The classic AI contrast. Just say the Y."],
  ["\\bnot (?:just|only) [^.,!?\\n]{1,40},? but (?:also )?", "gi", "not just X but Y", "Say the thing directly."],
  ["\\b(?:delve|tapestry|testament|landscape|realm|navigat(?:e|ing) the|leverag(?:e|ing)|unlock(?:s|ing)?|elevate|seamless(?:ly)?|robust|game[- ]?changer|revolutioni[sz]e|harness(?:ing)?|embark|journey|crucial|pivotal|foster|vibrant|ever-evolving|supercharge|empower(?:s|ing)?|cutting-edge|next-level|synergy|paradigm|holistic|streamline)\\b", "gi", "AI word", "Nobody says this out loud. Use the plain word."],
  ["\\b(?:in today'?s (?:world|fast-paced)|it'?s worth noting|let'?s dive in|dive into|here'?s the thing|buckle up|the truth is|let that sink in|read that again|hot take:|unpopular opinion:|spoiler:|plot twist:|in a world where|at the end of the day|the best part\\?|the result\\?|the secret\\?|the kicker\\?)", "gi", "stock phrase", "A phrase every AI post uses. Cut it, or say it your way."],
  ["^(?:ever wondered|have you ever|imagine (?:if|a world)|picture this|what if i told you)", "gim", "rhetorical opener", "Start with the actual thing that happened."],
  ["[🚀✨💡🔥👇🧵💯🙌⚡️🎯📈🤯]", "gu", "hype emoji", "Reads as a template. Drop it, or keep one that means something."],
  ["\\.\\.\\.|…", "g", "dramatic dots", "Fake drama. End the sentence."],
  ["!.*!", "gs", "exclamation marks", "More than one sounds like an ad. Keep at most one."],
  ["\\b(?:follow for more|like and share|drop a comment|smash that|let me know (?:what you think|in the comments)|thoughts\\?|agree\\?)", "gi", "generic ask", "Ask a real question people can answer, or none."],
  ["\\b(?:commits?|MRR|ARR|deploy(?:ed|s|ing)?|refactor(?:ed|ing)?|endpoints?|repo|API|SDK|latency|codebase|stack trace|PR|merge(?:d)?|devnet|mainnet|blockchain infrastructure|zero-knowledge proof|test suite|polyfill|deprecated)\\b", "g", "tech word", "Would a friend who doesn't code get it? If not, say it in everyday words."],
];

const compiled = RULES.map(([src, flags, tell, fix]) => ({ re: new RegExp(src, flags), tell, fix }));

// ---------- the user's own rules, from brand/voice.md ----------
// The fixed list above catches what every AI writes. This part catches what this user said no to:
//   - a quoted phrase under "Never do" (Don't end with "tell me what's bad"), or quoted right after a no, never,
//     don't, skip or avoid anywhere else (Skip the fancy one ("gratifying"));
//   - "end with a real ask / question / convo starter" anywhere in it: then a post with no question at the end
//     of its main part is flagged.
// Quotes the user said about a post (Sam: "all AI lol", (Sam, 11-24: "sure")) are their reactions, not banned
// words, so a quote right after a colon is skipped, and so are long ones and excerpts with "…" in them.

const norm = (s) => String(s).toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, " ").trim();

/** { banned: ["tell me what's bad", …], endsWithAsk } from brand/voice.md's text. */
export function parseVoice(text = "") {
  const banned = [];
  let section = "";
  let endsWithAsk = false;
  const body = String(text).replace(/\r/g, "").replace(/<!--[\s\S]*?-->/g, "");
  // a bullet can wrap onto the next lines: join them first
  const lines = body.split("\n").reduce((a, l) => (/^\s{2,}\S/.test(l) && a.length && !/^#/.test(a[a.length - 1]) ? ((a[a.length - 1] += ` ${l.trim()}`), a) : [...a, l]), []);
  for (const line of lines) {
    const h = line.match(/^## +(.+)$/);
    if (h) {
      section = h[1].trim().toLowerCase();
      continue;
    }
    if (/\bend(?:s|ing)? (?:with|on) (?:a |an )?(?:real |actual |genuine )?(?:ask|question|convo|conversation)/i.test(line)) endsWithAsk = true;
    for (const m of line.matchAll(/["\u201c]([^"\u201d\n]*)["\u201d]/g)) {
      const q = m[1].trim();
      const before = line.slice(Math.max(0, m.index - 40), m.index);
      if (q.length < 2 || /:\s*$/.test(before) || /…|\.\.\./.test(q) || q.split(/\s+/).length > 12) continue;
      const neverHere = /^never/.test(section);
      const negated = /\b(?:no|never|don'?t|do not|skip|avoid|not)\b[^.;]*$/i.test(before);
      if (neverHere || negated) banned.push(norm(q).replace(/[.!?]+$/, ""));
    }
  }
  return { banned: [...new Set(banned)].filter((b) => b.length > 1), endsWithAsk };
}

/** The flags for some words: [{ tell, fix, found: ["…"] }]. Hashtags only count where they're not wanted.
 *  voice: parseVoice(brand/voice.md), for the user's own no's. */
export function check(text, { hashtagsOk = false, voice = null } = {}) {
  const out = [];
  if (voice?.banned?.length) {
    const t = norm(text);
    const hit = voice.banned.filter((b) => new RegExp(`(^|[^\\p{L}\\d])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\d])`, "iu").test(t));
    if (hit.length) out.push({ tell: "your never-do", fix: "Your voice.md says not this. Say it another way, or leave it out.", found: hit.slice(0, 5) });
  }
  if (voice?.endsWithAsk) {
    // the main part: the first one, or the one before a reply that's only a link
    const parts = String(text).split(/\n-{3}[ \t]*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    const asks = parts.some((p) => /\?["')\u201d]?\s*(?:\p{Extended_Pictographic}\s*)*$/u.test(p.split(/\n\s*\n/).filter((x) => !/^#\w/.test(x.trim())).pop() ?? ""));
    if (parts.length && !asks) out.push({ tell: "no ask at the end", fix: "Your voice.md says every post ends with a real ask. End it on a question people can answer.", found: [(parts[0].split("\n").filter(Boolean).pop() ?? "").slice(0, 60)] });
  }
  for (const { re, tell, fix } of compiled) {
    const found = [...text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))].map((m) => m[0].trim()).filter(Boolean);
    if (found.length) out.push({ tell, fix, found: [...new Set(found)].slice(0, 5) });
  }
  if (!hashtagsOk) {
    const tags = text.match(/(?:^|\s)#[A-Za-z]\w+/g);
    if (tags) out.push({ tell: "hashtags", fix: "Only Mastodon needs them. Leave them out here.", found: tags.map((t) => t.trim()).slice(0, 5) });
  }
  const long = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.split(/\s+/).filter(Boolean).length > 28);
  if (long.length) out.push({ tell: "long sentence", fix: "Over 28 words. Split it or cut it.", found: long.map((s) => `${s.slice(0, 50)}…`).slice(0, 3) });
  return out;
}

