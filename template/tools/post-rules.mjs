// A post file, read and written: pure (no Node imports), so Studio's page, Studio's server and the tools all read
// posts the same way.
//
//   ---
//   status: draft
//   accounts: [X @shop, Threads @shop, Mastodon @shop@mastodon.social]
//   ---
//
//   # Words
//
//   ## Everywhere
//   The main words. A line holding only --- starts the next part of a thread.
//
//   ## Per account (only where it differs)
//   - Mastodon @shop@mastodon.social: …same words… + #buildinpublic
//   ### Threads @shop
//   Words for one account can be as long as they need,
//   on as many lines as they need, with their own --- parts.
//
// One-line words go as "- Account: words". Anything longer goes under its own "### Account" heading, down to the
// next "### " (one-liners first, then the headings). Every other "# …" section (Notes, How it did, First draft) is
// kept as it is.

/** { front, order, everywhere, per: [{ account, words }], other: [{ title, text }] } */
export function parsePost(text) {
  text = String(text ?? "").replace(/\r/g, "");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const front = {};
  const order = [];
  let body = text;
  if (m) {
    body = m[2];
    for (const line of m[1].split("\n")) {
      const k = line.match(/^([a-z_]+):\s?(.*)$/);
      if (!k) continue;
      order.push(k[1]);
      front[k[1]] = k[2].replace(/\s+#.*$/, "").trim();
    }
  }
  const sections = [];
  let cur = null;
  for (const line of body.split("\n")) {
    const h = line.match(/^# (.+)$/);
    if (h) sections.push((cur = { title: h[1].trim(), lines: [] }));
    else if (cur) cur.lines.push(line);
  }
  const words = sections.find((s) => s.title === "Words");
  let everywhere = "";
  const per = [];
  if (words) {
    const txt = words.lines.join("\n");
    everywhere = (txt.match(/## Everywhere\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? "").trim();
    const pa = txt.match(/## Per account[^\n]*\n([\s\S]*?)(?=\n## |$)/);
    if (pa) {
      let block = null;
      for (const l of pa[1].split("\n")) {
        const h = l.match(/^### +(.+?)\s*$/);
        if (h) {
          per.push((block = { account: h[1], words: [] }));
          continue;
        }
        if (block) {
          block.words.push(l);
          continue;
        }
        // "\n" typed out in a one-liner is a line break (older files did that to fit long words on one line)
        const x = l.match(/^- ([^:]+):\s*(.*)$/);
        if (x) per.push({ account: x[1].trim(), words: x[2].trim().replace(/\\n/g, "\n") });
      }
      for (const x of per) if (Array.isArray(x.words)) x.words = x.words.join("\n").trim();
    }
  }
  const other = sections.filter((s) => s.title !== "Words").map((s) => ({ title: s.title, text: s.lines.join("\n").trim() }));
  return { front, order, everywhere, per, other };
}

export function writePost(p) {
  const keys = [...new Set([...p.order, ...Object.keys(p.front)])];
  const fm = keys.map((k) => `${k}: ${p.front[k] ?? ""}`.trimEnd()).join("\n");
  const words = (x) => String(x.words ?? "").trim();
  const one = p.per.filter((x) => !words(x).includes("\n")).map((x) => `- ${x.account}: ${words(x)}`);
  const long = p.per.filter((x) => words(x).includes("\n")).map((x) => `### ${x.account}\n${words(x)}`);
  const per = [...one, ...long].join("\n") || "(none)";
  const other = p.other.map((s) => `# ${s.title}\n${s.text}\n`).join("\n");
  return `---\n${fm}\n---\n\n# Words\n\n## Everywhere\n${p.everywhere.trim()}\n\n## Per account (only where it differs)\n${per}\n\n${other}`.replace(/\n{3,}/g, "\n\n");
}

/** "[a, b]" → ["a", "b"] */
export const listOf = (v) => String(v || "").replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);

/** The words one account gets: its own, with "…same words… + #tag" meaning the main words and then the rest. */
export function wordsFor(p, account) {
  const own = p.per.find((x) => x.account === account)?.words;
  if (!own) return p.everywhere;
  return own.replace(/…\s*same (words|thread)\s*…\s*\+?\s*/i, `${p.everywhere}\n\n`).trim();
}

/** A thread's parts: split on a line holding only ---. */
export const partsOf = (text) => String(text ?? "").split(/\n-{3}[ \t]*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);

// ---------- Update suggested ----------
// When the user shares news (raw/<week>.md, or in chat), the agent checks the drafts and scheduled posts still to
// come for lines it makes stale ("19 days left", "$0 so far", "coming soon") and writes what to change under the
// post's own "# Update suggested" section, one item per change:
//
//   # Update suggested
//   - old: Profit so far: $0.
//     new: First paying customer this week.
//     why: raw 2026-11-29: "first paying customer"
//
// "old" is the exact words as they are in the post (the main words or one account's own). Nothing changes until the
// user presses Apply in Studio (or says yes in chat); a scheduled post is then changed in place with update_post.

/** The items under "# Update suggested": [{ old, new, why }] (only ones with both old and new). */
export function updatesOf(text) {
  const out = [];
  let cur = null;
  for (const line of String(text ?? "").replace(/\r/g, "").split("\n")) {
    const m = line.match(/^\s*(?:-\s*)?(old|new|why):\s?(.*)$/);
    if (!m) continue;
    if (m[1] === "old" && /^\s*-/.test(line)) out.push((cur = { old: m[2], new: "", why: "" }));
    else if (cur) cur[m[1]] = m[2];
  }
  return out.filter((x) => x.old.trim() && x.new.trim() && x.old !== x.new);
}
/** The section text for a list of items (empty list → ""). */
export const updatesText = (items) => items.map((x) => `- old: ${x.old}\n  new: ${x.new}${x.why ? `\n  why: ${x.why}` : ""}`).join("\n");

/** Apply items to a parsed post's words (main + each account's own): { post, applied: [items], missing: [items] }. */
export function applyUpdates(p, items) {
  const applied = [];
  const missing = [];
  const everywhere = { v: p.everywhere };
  const per = p.per.map((x) => ({ ...x }));
  for (const it of items) {
    let hit = false;
    if (everywhere.v.includes(it.old)) { everywhere.v = everywhere.v.split(it.old).join(it.new); hit = true; }
    for (const x of per) if (String(x.words).includes(it.old)) { x.words = String(x.words).split(it.old).join(it.new); hit = true; }
    (hit ? applied : missing).push(it);
  }
  return { post: { ...p, everywhere: everywhere.v, per }, applied, missing };
}
