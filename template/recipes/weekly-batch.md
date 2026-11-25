# Weekly batch (once a week, about 20–30 minutes of the user's time)

**Needs:** Posthuman connected
**Costs:** whatever the platforms charge to post (X is about 1.5¢ a post, 20¢ with a link). Nothing for the drafting.

## Steps
1. `briefing`: what's already scheduled, the empty days, and how last week did (`get_results`). Anything that
   clearly beat the usual goes under *What worked* in brand/voice.md, and `remember` it on that account.
2. **Raw material first.** Gather what's there: `node tools/sources.mjs` (new pictures and clips in their folders,
   each project's commits this week), what they saved for later on their phone (`list_media saved_only`, or Studio's
   **Bring in from your phone**), and raw/<sunday>.md. Add the open lines from ideas/inbox.md.
3. **Their pick.** Show it all in one message as a short list, ask for what's missing of three real things (a
   screenshot, a number, something that happened), and ask which ones they want posts about this week and how each
   should come across. Wait. They pick the angles; you don't fill the week with your own (AGENTS.md, *The angle is
   theirs*). The repeating posts they already said yes to go in as usual.
4. For each one they picked: what it **gives** (story / tip / number / show / opinion) and its **payload**, then the
   words, one file each in posts/, in brand/voice.md's voice. Building posts get their screenshot. They gave a topic
   but not the feel? Write two short takes and let them pick.
5. `node tools/substance.mjs posts/*.md`, then the humanize pass (recipes/humanize.md) on each: it also catches their own no's and anything too long.
6. Show the user the week in one list (day, time, what it gives, first line), or tell them to open Studio
   (`node tools/studio.mjs`). Their edits are the voice: learn from them.
7. Schedule what they approve (`status: approved`) through Posthuman and write each `posthuman_post_id` into its file.
