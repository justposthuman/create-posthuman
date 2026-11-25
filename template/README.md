# {{BRAND}}

A folder for your AI agent (Claude Code, Codex, Cursor or any agent that reads `AGENTS.md`). It keeps your brand's
voice, ideas, media and posts here on your computer, so every chat starts knowing what the last one learned. Posts go
out through [Posthuman]({{POSTHUMAN_URL}}).

## Start
1. Open your agent in this folder.
   - **Claude Code:** `claude`, then type `/mcp` and sign in to Posthuman (this folder's `.mcp.json` already points
     at it).
   - **Codex:** `codex mcp add posthuman --url {{POSTHUMAN_URL}}/api/mcp` once, then `codex`.
   - **Anything else:** add an MCP server with the address `{{POSTHUMAN_URL}}/api/mcp`.
2. Say **"get to know me"** (or open Studio, below: a new folder starts on **Get to know you**). It reads your
   links, asks what posting is for, and goes through your real posts one at a time ("so me" or "not me"), then
   fills in `brand/`.
3. Then just talk to it: "turn this week's ideas into posts", "make a short clip from this photo", "how did last
   week do?"

## See it all: Studio
`node tools/studio.mjs` opens your week in the browser, on this computer only. You can:
- edit the words and see how each platform shows them
- add pictures and write their descriptions
- approve or drop a post
- ask for a rewrite ("punchier")
- press **Humanize** for a last pass that strips anything that sounds like AI (each card shows how many AI tells it has)

Studio also has **Your stuff**: the screenshots, clips and projects you already have, right where they are (you say
which folders in `brand/sources.md`). Your agent can describe them and pitch a post for each, your projects' commits
this week become real numbers, and **Bring in from your phone** pulls in what you saved for later in Posthuman. And
**Accounts**: how each account works, as you set it up in Posthuman (**Make it yours**: who reads it, how you sound there, the hard no's). Posts that break a no get flagged on the Week.

**Schedule approved** then hands the posts to your agent, which posts them through Posthuman. Rewrite and Schedule
run Claude Code if you have it. Without it, the note is saved for your agent to pick up.

## Making media (optional)
Copy `.env.example` to `.env` and add the keys you have:
- `FAL_KEY` from fal.ai for images and video
- `ELEVENLABS_API_KEY` from elevenlabs.io for voiceovers

Your keys stay in this folder. Your agent uses them from here, and Posthuman never sees them. Recipes are in
`recipes/`. Each one says what it costs.

## What's where
```
AGENTS.md       how your agent works here (CLAUDE.md points to it)
brand/          about.md (what it is, who it's for, your goals) · past-posts.md (your posts, looked at one by one)
                · voice.md (how it sounds, never do, what worked)
                accounts.md (each account's setup, copied from Posthuman) · sources.md (where your stuff is)
ideas/          inbox.md, one line per idea; bigger ones get their own file
posts/          one file per post: the words per account, when, and how it did
library/        pictures, clips and audio, listed in INDEX.md
recipes/        step-by-step: photo → video, voiceover on your clip, images for empty days
tools/          studio.mjs (the week in your browser) + small scripts the recipes use (Node 18+, nothing to install)
```

Everything is a plain text file. Read it, change it, and keep it in git if you like. Lines you write yourself in
`brand/voice.md` stay. Your agent tidies around them and never drops them.

Made {{CREATED}} with `create-posthuman`.
