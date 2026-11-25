// The substance check: does this post give the reader something, or is it only a joke? Pure (no Node imports), so
// Studio's page and tools/substance.mjs use the same rules. Runs before the humanize pass: content first, then
// make it sound human.
//
// Every post says what it gives (frontmatter `gives:`) and names the one real thing (`payload:`):
//   story   what actually happened, with one true detail
//   tip     something the reader can use today
//   number  a real number (best in a screenshot)
//   show    the thing itself: a screenshot, a clip, a before and after
//   opinion a take, with the reason behind it

export const GIVES = {
  story: "what actually happened, with one true detail",
  tip: "something the reader can use today",
  number: "a real number, best in a screenshot",
  show: "the thing itself: a screenshot, a clip, a before and after",
  opinion: "a take, with the reason behind it",
};

const MEDIA = /\.(jpe?g|png|webp|gif|mp4|mov)$/i;

/** [{ issue, fix }] for one post: { gives, payload, words, media: [files] }. Empty = it gives something. */
export function substance({ gives = "", payload = "", words = "", media = [] }) {
  const out = [];
  const g = String(gives).trim().toLowerCase();
  const pics = media.filter((f) => MEDIA.test(f));
  const plain = words.replace(/\s+/g, " ").trim();
  if (!g) out.push({ issue: "gives nothing named", fix: `Pick what the reader gets: ${Object.keys(GIVES).join(", ")}. The joke is the delivery, not the content.` });
  else if (!GIVES[g]) out.push({ issue: `"${gives}" isn't one of the five`, fix: `Use one of: ${Object.keys(GIVES).join(", ")}.` });
  if (g && !String(payload).trim()) out.push({ issue: "no real thing named", fix: "Write the one true detail, tip, number or reason in payload: (one line). If there isn't one, ask the user." });
  if (g === "show" && !pics.length) out.push({ issue: "show, but nothing to see", fix: "Add the screenshot or clip from library/ (or ask the user for one)." });
  if (g === "number" && !/\d/.test(plain)) out.push({ issue: "number, but no number in the words", fix: "Put the real number in the post." });
  if (g === "tip" && plain.length < 90) out.push({ issue: "tip, but very short", fix: "Say the tip plainly enough that someone could do it today." });
  if (g === "opinion" && !/\b(because|since|so|which is why|that's why|the reason)\b/i.test(plain)) out.push({ issue: "opinion, but no reason", fix: "Add the why, in a few words." });
  if (!pics.length && plain.length < 120 && !/\d/.test(plain)) out.push({ issue: "might be only a joke", fix: "Short, no number, nothing to see. What does the reader actually get from it?" });
  return out;
}
