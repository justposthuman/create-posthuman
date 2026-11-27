# Clip it: short clips from a long video

A talk, a stream, a podcast, a long screen recording with you explaining: there are usually a few 30-second moments
in it that work on their own. This finds them, cuts them, makes them vertical and puts the words on screen.

**Needs:** the video in library/, ffmpeg, and either `OPENAI_API_KEY` in .env (to hear the words) or a captions
file you already have (.srt or .vtt; YouTube lets you download yours from YouTube Studio → Subtitles).
**Costs:** under 1¢ a minute to hear it (OpenAI Whisper, 2026-11), so about 36¢ for an hour. Free with your own
captions file. Cutting is free.

## Steps
1. **Hear it once.** `node tools/clip.mjs hear library/talk.mp4` (or `--srt library/talk.vtt`). It saves
   `library/talk.transcript.json` next to the video: every sentence with its time. Past about an hour it goes up
   in pieces; that's fine.
2. **Find the moments.** `node tools/clip.mjs lines library/talk.mp4` prints the transcript as `[12:03] what was
   said` lines. Read it and pick 3 to 6 moments that work for someone scrolling with the sound off who never saw the
   rest: they start on a line that makes you stop (a claim, a number, a question, a story starting), end on a
   finished thought, run 15 to 60 seconds, and give the viewer something real. Show the user the list (time,
   first line, why) and let them choose.
3. **Cut them.** `node tools/clip.mjs cut library/talk.mp4 --from 12:03 --to 12:41`: cut out, made 9:16 (the whole
   picture over a blurred copy of itself; `--fit crop` fills the frame instead, `--size 4:5`, `1:1` or `wide`),
   the words burned in a few at a time, saved in library/ with a line in INDEX.md. `--no-captions` leaves them off.
4. Each clip is a post idea. The angle is still the user's: ask what it's about and how it should feel.

Studio: **Make → Clip it** does all of it on one card: hear, suggest (your agent), tick and nudge the times, watch
each one, cut.

## Watch out
- It only knows what was said. A great moment with no talking won't come up: ask the user if they remember one.
- Read the captions on the cut clip. Names and brands can come out wrong; the transcript is plain text to fix,
  then cut again.
- Only clip what the user has the right to post: their own video, or a talk they gave with the organiser's OK.
