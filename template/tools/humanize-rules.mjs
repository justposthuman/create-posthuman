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

/** The flags for some words: [{ tell, fix, found: ["…"] }]. Hashtags only count where they're not wanted. */
export function check(text, { hashtagsOk = false } = {}) {
  const out = [];
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

