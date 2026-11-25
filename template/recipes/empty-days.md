# Images for the empty days

**Needs:** `FAL_KEY` in `.env` · Posthuman connected
**Costs:** about 3¢ an image with FLUX.2 Pro, 8¢ with Nano Banana 2, paid to fal.

## Steps
1. Call `briefing` and read `empty_days` for the accounts the user names (Instagram and Pinterest suit this best).
2. For each empty day, pick a topic from `ideas/inbox.md` first and only make one up if there's nothing there. Tell
   the user the plan in one line per day and the total cost, and wait for an OK.
3. Make each image. Use 4:5 for Instagram (1080×1350) and 2:3 for Pinterest (1000×1500), with no text in the image:
   ```
   node tools/fal.mjs fal-ai/flux-2-pro \
     --input '{"prompt":"…, no text","image_size":{"width":1080,"height":1350}}' \
     --out library/2026-11-25-slug.png --what "One sentence describing the picture"
   ```
4. Hand each one to Posthuman with `add_media_from_url` right away, with its one-sentence description as `alt`.
5. Write a post file for each (with its day in `when:`) and save them in Posthuman as **drafts** (`when: "draft"`),
   with `made_with_ai: true`, so the user looks before anything goes out. Tell them which day each one is for.

## Watch out
- People notice made-up images fast. They're fine for backgrounds, simple graphics and mockups. Use real photos for
  people and products.
- Pinterest needs a board for each pin. `list_accounts` has the user's boards.
