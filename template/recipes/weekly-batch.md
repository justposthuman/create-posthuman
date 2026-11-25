# Weekly batch (once a week, about 20–30 minutes of the user's time)

**Needs:** Posthuman connected
**Costs:** whatever the platforms charge to post (X is about 1.5¢ a post, 20¢ with a link). Nothing for the drafting.

## Steps
1. `briefing`: what's already scheduled, the empty days, and how last week did (`get_results`). Anything that
   clearly beat the usual goes under *What worked* in brand/voice.md, and `remember` it on that account.
2. **Raw material first.** Gather what's there: `node tools/sources.mjs` (new pictures and clips in their folders,
   each project's commits this week), what they saved for later on their phone (`list_media saved_only`, or Studio's
   **Bring in from your phone**), and raw/<sunday>.md. Show it, then ask in one message only for what's missing of
   three real things: a screenshot, a number, something that happened. Add the open lines from ideas/inbox.md.
3. Pick what each post **gives** (story / tip / number / show / opinion) and its **payload** before writing a word.
   One real thing per post. Nothing real? Leave the day empty rather than post filler.
4. Write the drafts, one file each in posts/, in brand/voice.md's voice. Building posts get their screenshot.
5. `node tools/substance.mjs posts/*.md`, then the humanize pass (recipes/humanize.md) on each.
6. Show the user the week in one list (day, time, what it gives, first line), or tell them to open Studio
   (`node tools/studio.mjs`). Their edits are the voice: learn from them.
7. Schedule what they approve (`status: approved`) through Posthuman and write each `posthuman_post_id` into its file.
