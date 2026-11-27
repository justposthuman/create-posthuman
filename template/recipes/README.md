# Recipes

Step-by-step ways to make media here and post it through Posthuman. Each one says what it needs and what it costs.
Prices and model names were checked on 2026-11-20. These services change, so if a call is refused, check the model's
page (fal.ai/models → the model → API) and update the recipe.

- [weekly-batch.md](weekly-batch.md): the week's posts in one sitting, starting from three real things from the user
- [humanize.md](humanize.md): the last pass on every draft, so it reads like you said it, not like AI wrote it (free check + rewrite)
- [photo-to-video.md](photo-to-video.md): one of your photos becomes a 5-second clip for TikTok and Reels (fal)
- [voiceover.md](voiceover.md): a voiceover on your own clip (ElevenLabs + ffmpeg)
- [empty-days.md](empty-days.md): an image for each empty day this week, saved as drafts (fal)
- [clip-it.md](clip-it.md): short vertical clips with captions out of a long video (a talk, a stream, a podcast); your agent picks the moments (OpenAI Whisper about 36¢ an hour, or free with your own captions file)
- Studio's **Make → Carousel**: a post as swipeable slides for Instagram, LinkedIn and TikTok photo mode, one per paragraph, in your look (`brand/look.md`); free, drawn on your computer
- [captions.md](captions.md): captions burned into a clip, a few words at a time, the words heard from the clip (OpenAI Whisper, under 1¢ a minute, + ffmpeg)
- `node tools/gemini.mjs edit library/shot.png "put it on a phone on a desk"` (or `tools/openai.mjs edit`): change a photo with words, the rest kept as it is (about 4¢)
- `node tools/openai.mjs image "…"`: a picture with readable words in it (a sign, a label), where FLUX tends to garble them (about 4-7¢)
- `node tools/openai.mjs speak "…"`: a voiceover without ElevenLabs (about 1.5¢ a minute; then `tools/mix.mjs` onto the clip)
- `node tools/pexels.mjs search "…"` then `get <id>`: a free real stock photo or clip, photographer credited in library/INDEX.md (Pexels)
- `node tools/replicate.mjs owner/model --input '{…}'`: any model on Replicate, like `tools/fal.mjs` for fal
- `node tools/runway.mjs video library/photo.jpg "the motion"` / `node tools/luma.mjs video …`: a photo that moves, on Runway (Gen-4) or Luma (Ray), for people who already pay for one
- `node tools/higgsfield.mjs kling-video/v4.0/text-to-video --input '{"prompt":"…","duration":5}' --out library/x.mp4`: video on Higgsfield (Kling, Seedance, Wan, MiniMax…; each model's id, fields and price a second are on open.higgsfield.ai → Explore models → API). About 63¢ for 5 seconds of Kling 4.0 at 1080p
- `node tools/vertical.mjs library/clip.mp4`: a wide clip or photo made to fit Reels, TikTok and Shorts (9:16) or an Instagram picture (`--size 4:5`), the whole picture kept over a blurred copy of itself (free, ffmpeg)

Write your own: copy one, keep the same parts (Needs · Costs · Steps · Watch out), and add it to this list.
