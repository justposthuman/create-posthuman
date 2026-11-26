# Captions on a clip

Most people watch Reels, TikTok and Shorts with the sound off. Captions, a few words at a time, keep them watching.

**Needs:** a clip with talking in it (library/), ffmpeg, and `OPENAI_API_KEY` in .env to hear the words.
**Costs:** under 1¢ a minute of talking (OpenAI Whisper, 2026-11). Burning them in is free.

## Steps
1. `node tools/captions.mjs library/clip.mp4`. It takes the sound out, OpenAI writes down the words with their
   times, and it saves `library/clip.srt` (plain text) and `library/clip-captions.mp4` with the words burned in,
   big and white, low in the frame.
2. **Read the .srt.** Names, brands and app names come out wrong sometimes ("post human"). Fix the word in the
   .srt, then burn again without OpenAI: `node tools/captions.mjs library/clip.mp4 --srt library/clip.srt`.
3. Wide clip? Make it vertical first (`node tools/vertical.mjs`), then caption the vertical one, so the words
   sit inside the frame.

Studio: **Make → Captions on your clip**.

## Watch out
- Never change what was said to make it read better. Captions are what the person said.
- A clip with music and no talking has nothing to caption: say so instead of making something up.
