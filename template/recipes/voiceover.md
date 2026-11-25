# Voiceover on your own clip

**Needs:** `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in `.env` · ffmpeg (`ffmpeg -version`) · a clip of the
user's own · Posthuman connected. For a business, a paid ElevenLabs plan. The free plan doesn't allow commercial use.
**Costs:** a few cents per clip on most plans (ElevenLabs counts characters of script).

## Steps
1. Put the clip in `library/`. Note how long it is (`ffprobe -v error -show_entries format=duration -of csv=p=0 file`).
2. Write a script in the brand's voice that fits the clip: about 2.5 words a second, so 20 seconds is about 50 words.
   Save it next to the post as `posts/YYYY-MM-DD-slug.script.txt`. **Show the user and wait for their OK.**
3. Make the voice (no voice picked yet? `node tools/voice.mjs --list`, then ask the user):
   ```
   node tools/voice.mjs --text-file posts/2026-11-24-slug.script.txt --out library/2026-11-24-slug-voice.mp3
   ```
4. Put it on the clip, with the clip's own sound quietly underneath:
   ```
   node tools/mix.mjs --video library/2026-11-24-slug.mp4 --audio library/2026-11-24-slug-voice.mp3 \
     --out library/2026-11-24-slug-voiced.mp4
   ```
5. Get an upload link from Posthuman (`request_upload_link`), POST the file to it, and schedule with the `media_id`
   it returns, to Reels and TikTok with `made_with_ai: true`:
   ```
   curl -X POST --data-binary @library/2026-11-24-slug-voiced.mp4 -H "Content-Type: video/mp4" "<upload link>"
   ```

## Watch out
- An AI voice counts as AI-made, so set `made_with_ai: true`. Use a voice the user has the right to use. ElevenLabs'
  library voices are fine on a paid plan.
- Sound effects instead of a voice: `node tools/voice.mjs --sfx "a page turning, quiet room" --seconds 3 --out …`.
