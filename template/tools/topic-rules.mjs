// Topics: the few things the brand posts about, from brand/about.md (## Topics, or ## Pillars), so each post can say
// which one it is (frontmatter `topic:`) and the week can keep its mix. Pure, so the page and tools agree.
//
//   ## Topics                                  ## Pillars (about 6–7 posts a week)
//   - Building the app (~3 a week)             1. Building in public (~7): Posthuman, Kitchen Table…
//   - Behind the scenes                        2. AI agents doing the work (~3): overnight runs…
//
// A number like "~3" is how many a week the user wants of it (optional).

/** [{ name, per_week|null }] from the about file's Topics or Pillars section. */
export function topicsOf(about = "") {
  const m = String(about).replace(/\r/g, "").match(/^## (?:Topics|Pillars)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.match(/^\s*(?:[-*]|\d+[.)])\s+(.+)$/)?.[1])
    .filter(Boolean)
    .map((l) => {
      const per = l.match(/\(~?\s*(\d+)[^)]*\)/);
      const name = l.split(/\s*[(:]/)[0].replace(/\*\*/g, "").trim();
      return { name, per_week: per ? Number(per[1]) : null };
    })
    .filter((t) => t.name && !t.name.startsWith("<!--"));
}

/** The topic a post's `topic:` names, matched loosely ("building" → "Building in public"). */
export function matchTopic(value, topics) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  return topics.find((t) => t.name.toLowerCase() === v) || topics.find((t) => t.name.toLowerCase().startsWith(v) || v.startsWith(t.name.toLowerCase())) || topics.find((t) => t.name.toLowerCase().includes(v)) || null;
}

/** This week's mix: [{ name, count, per_week }] plus posts with no topic. */
export function mixOf(posts, topics) {
  const out = topics.map((t) => ({ name: t.name, count: 0, per_week: t.per_week }));
  let none = 0;
  for (const p of posts) {
    const t = matchTopic(p.topic, topics);
    if (t) out.find((x) => x.name === t.name).count++;
    else none++;
  }
  return { mix: out, none };
}
