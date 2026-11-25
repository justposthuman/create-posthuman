# Photo → short video

**Needs:** `FAL_KEY` in `.env` · a photo of the user's own (product, table, shop) · Posthuman connected
**Costs:** about 55¢ to $2 per 5-second clip, paid to fal. Kling 3 Pro is about 11¢ a second without sound, Veo 3.1
about 40¢ a second with sound.

## Steps
1. Get the photo into `library/` (copy it in, named `YYYY-MM-DD-slug.jpg`) and describe it in one sentence.
2. Ask the user for the motion in a few words: a slow push-in, steam rising, pages turning. Keep everything in the
   photo as it is and only add the motion.
3. Make it (check the model's API tab first if this is the first run in a while):
   ```
   node tools/fal.mjs fal-ai/kling-video/v3/pro/image-to-video \
     --file image_url=library/2026-11-24-mug.jpg \
     --input '{"prompt":"slow push-in, steam rising from the mug, everything else still","duration":"5"}' \
     --out library/2026-11-24-mug.mp4 --what "A mug of coffee on the worksheet, steam rising"
   ```
4. Show the user. If they like it, hand Posthuman the `link` from the output **straight away** with
   `add_media_from_url` (fal's links don't last). If it's gone, use `request_upload_link` and POST the saved file.
5. Write the post file in `posts/`, with words in the brand's voice. Schedule it to TikTok and Instagram with
   `made_with_ai: true`. Ask who can see it on TikTok, since TikTok has no default.

## Watch out
- A real photo with motion looks like the user. A clip invented from nothing looks like everyone else's.
- Vertical photos make vertical clips. Crop to 9:16 first if it's for TikTok or Reels.
