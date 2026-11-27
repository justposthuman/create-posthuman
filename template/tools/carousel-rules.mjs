// Carousel: a post as swipeable slides (Instagram, LinkedIn, TikTok photo mode). Studio draws them in the browser
// (Make → Carousel), free; this file is the plain part both sides use: the brand's look (brand/look.md), how text
// becomes slides, and what the agent is asked when it splits a post. Pure (no Node imports), so the test reads it.

export const SHAPES = { "4:5": { w: 1080, h: 1350, for: "Instagram, LinkedIn" }, "1:1": { w: 1080, h: 1080, for: "square" }, "9:16": { w: 1080, h: 1920, for: "TikTok photo mode, Stories" } };
export const FONTS = ["Archivo", "Georgia", "system-ui"];
export const DEFAULT_LOOK = { background: "#4a22d4", text: "#f6f1e6", accent: "#d2ff3a", font: "Archivo", handle: "" };

/** brand/look.md → { background, text, accent, font, handle }; anything missing or not a colour keeps its default. */
export function lookOf(md = "") {
  const get = (k) => String(md).match(new RegExp(`^-\\s*${k}:\\s*(.+)$`, "mi"))?.[1]?.trim() ?? "";
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
  return {
    background: hex(get("background"), DEFAULT_LOOK.background),
    text: hex(get("text"), DEFAULT_LOOK.text),
    accent: hex(get("accent"), DEFAULT_LOOK.accent),
    font: FONTS.includes(get("font")) ? get("font") : DEFAULT_LOOK.font,
    handle: get("handle").replace(/[\r\n]/g, "").slice(0, 40),
  };
}
export function lookText(l) {
  const x = lookOf(`- background: ${l.background}\n- text: ${l.text}\n- accent: ${l.accent}\n- font: ${l.font}\n- handle: ${l.handle ?? ""}`);
  return `# How the brand looks\n\nUsed by Studio's Carousel (Make → Carousel). Colours as #rrggbb; font is one of ${FONTS.join(", ")}.\n\n- background: ${x.background}\n- text: ${x.text}\n- accent: ${x.accent}\n- font: ${x.font}\n- handle: ${x.handle}\n`;
}

/** Text → slides: a blank line starts a new slide; a line with only --- does too (a thread's parts). */
export function splitSlides(text) {
  return String(text ?? "").replace(/\r/g, "").split(/\n\s*(?:---\s*)?\n|\n---\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);
}

/** What the agent is asked: the same words, cut into slides. It never adds a fact. */
export function slidesPrompt(words, voice = "") {
  return [
    "Turn this post into a swipeable carousel (Instagram, LinkedIn): 4 to 8 slides.",
    "- Slide 1 is the hook: the post's strongest line, 12 words or fewer, so someone stops and swipes.",
    "- Each middle slide says ONE thing in 30 words or fewer, in the post's own words where you can.",
    "- The last slide is the post's ending (its question or ask).",
    "- Never add a fact, number, name or claim that isn't in the post. Shorten; don't invent.",
    "- Wrap one or two words per slide in *asterisks* to show them in the accent colour (the word that matters most). Not every slide.",
    voice ? `- How the brand sounds:\n${String(voice).slice(0, 800)}` : "",
    "",
    "The post:",
    String(words).slice(0, 4000),
    "",
    'Answer with ONLY a JSON array of strings, one per slide: ["…", "…"]',
  ].filter((l) => l !== "").join("\n");
}

/** The agent's answer → slides (4 to 10 strings), or [] when it isn't a list. */
export function parseSlides(answer) {
  const m = String(answer ?? "").match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const a = JSON.parse(m[0]);
    return Array.isArray(a) ? a.map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10) : [];
  } catch {
    return [];
  }
}

/** "a *word* here" → [{ text: "a ", hot: false }, { text: "word", hot: true }, { text: " here", hot: false }] */
export function runsOf(s) {
  const out = [];
  String(s).split(/(\*[^*]+\*)/).forEach((part) => {
    if (!part) return;
    const hot = /^\*[^*]+\*$/.test(part);
    out.push({ text: hot ? part.slice(1, -1) : part, hot });
  });
  return out;
}
