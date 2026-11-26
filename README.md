# create-posthuman

A starter folder for your own AI agent. Your brand's voice, ideas, media and posts live on your computer as plain
files, so every chat starts knowing what the last one learned. Posts go out through Posthuman.

Free and open source (MIT, see LICENSE): use it, change it, make it your own. Posting goes through a Posthuman
account (free to start).

```
npx create-posthuman my-brand
cd my-brand
claude            # or codex, or any agent that reads AGENTS.md
> get to know me
```

Or open Studio, the folder's own page on your computer, and start with **Get to know you**:

```
node tools/studio.mjs
```

- **Your agent does the creative work here.** It writes in your voice, keeps the ideas inbox, and makes media with
  your own keys: fal, ElevenLabs, OpenAI, Google Gemini, Higgsfield, Runway, Luma, Pexels or Replicate (captions on clips, photo edits, free
  stock photos, voiceovers, images and video).
- **Posthuman only posts.** Your keys never leave this folder.
- **It learns as it goes.** Your edits and the posts that did well become lines in `brand/voice.md`. A short version
  goes to Posthuman's account notes, so ChatGPT and your phone know them too.

Options: `--name "Brand name"` (default: from the folder name), `--url https://your-posthuman` (default
https://justposthuman.com).

## This repo
- `bin/create.mjs`: copies `template/`, fills in the name and address, and renames `_gitignore` / `_env.example` /
  `_mcp.json` to their dot names (npm drops dotfiles from packages).
- `template/`: what people get. `AGENTS.md` is the heart of it.
- `npm test`: makes a folder in a temp directory, then checks the copy and every tool (dry runs, plus a real ffmpeg
  mix on a generated test clip). It needs no keys and sends nothing.
