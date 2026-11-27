// The services the kit can use with the user's own keys (in .env, never sent anywhere but the service itself).
// Pure, so Studio's server, its page and the tools read the same list. Prices are rough, checked 2026-11; each
// service's own pricing page is the truth.
//
//   id          what the tools and Studio call it
//   env         the .env line it needs (also: more lines it needs too; extra: optional lines that help)
//   get         where to make a key
//   jobs        what it's good for here: image, edit, video, voiceover, sound, captions, stock
//   tool        the script in tools/ that talks to it

export const PROVIDERS = [
  { id: "fal", name: "fal.ai", env: "FAL_KEY", get: "https://fal.ai/dashboard/keys", jobs: ["image", "video"], tool: "fal.mjs", note: "Hundreds of models behind one key: FLUX, Kling, Veo, Seedance, Nano Banana…" },
  { id: "elevenlabs", name: "ElevenLabs", env: "ELEVENLABS_API_KEY", extra: ["ELEVENLABS_VOICE_ID"], get: "https://elevenlabs.io/app/settings/api-keys", jobs: ["voiceover", "sound"], tool: "voice.mjs", note: "The most natural voices, and sound effects." },
  { id: "openai", name: "OpenAI", env: "OPENAI_API_KEY", get: "https://platform.openai.com/api-keys", jobs: ["captions", "image", "edit", "voiceover"], tool: "openai.mjs", note: "Captions for clips (Whisper), images with readable words in them, voiceovers." },
  { id: "gemini", name: "Google Gemini", env: "GEMINI_API_KEY", get: "https://aistudio.google.com/apikey", jobs: ["edit", "image"], tool: "gemini.mjs", note: "Photo edits from a sentence (Nano Banana): your screenshot on a phone, a new background." },
  { id: "pexels", name: "Pexels", env: "PEXELS_API_KEY", get: "https://www.pexels.com/api/", jobs: ["stock"], tool: "pexels.mjs", note: "Free real photos and clips (credit the photographer). Real beats made-up." },
  { id: "higgsfield", name: "Higgsfield", env: "HF_CREDENTIALS", or: [["HF_KEY"], ["HF_API_KEY_ID", "HF_API_KEY_SECRET"]], get: "https://open.higgsfield.ai/api-keys", jobs: ["video", "image"], tool: "higgsfield.mjs", note: "Video and images from the newest models (Kling, Seedance, Wan, MiniMax, Grok Imagine…), pay as you go. The API is billed apart from a Higgsfield plan." },
  { id: "runway", name: "Runway", env: "RUNWAYML_API_SECRET", get: "https://dev.runway.com", jobs: ["video", "image"], tool: "runway.mjs", note: "Gen-4 video from a photo or words (also Veo, Seedance, Kling on its credits). The API has its own credits." },
  { id: "luma", name: "Luma", env: "LUMA_API_KEY", get: "https://platform.lumalabs.ai", jobs: ["video", "image"], tool: "luma.mjs", note: "Ray video: smooth, real-looking motion from a photo or words." },
  { id: "replicate", name: "Replicate", env: "REPLICATE_API_TOKEN", get: "https://replicate.com/account/api-tokens", jobs: ["image", "video", "edit"], tool: "replicate.mjs", note: "Any model on Replicate, for people whose models live there." },
];

export const JOBS = {
  image: "A picture from words",
  edit: "Change a photo with words",
  video: "A photo that moves",
  voiceover: "A voiceover",
  sound: "Sound effects",
  captions: "Captions on a clip",
  stock: "Real stock photos and clips",
};

/** Which services have a key: { fal: true, openai: false, … } (read with lib.mjs key()). */
// or: other ways to give the same key (Higgsfield's one line, or its older pair of lines).
export const keysWith = (key) => Object.fromEntries(PROVIDERS.map((p) => [p.id, [[p.env, ...(p.also ?? [])], ...(p.or ?? [])].some((set) => set.every((e) => !!key(e)))]));

/** The services that can do a job, the ones with a key first. */
export const whoCan = (job, have = {}) => PROVIDERS.filter((p) => p.jobs.includes(job)).sort((a, b) => Number(!!have[b.id]) - Number(!!have[a.id]));
