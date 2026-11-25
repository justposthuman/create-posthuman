# Humanize: the last pass before the user sees a draft

**Needs:** nothing (the check is free; the rewrite uses your agent)
**When:** every draft, after the substance check (`tools/substance.mjs`), as the final step before you show it to the user. Studio's **Humanize** button runs the same pass.

## Steps
1. Run the check: `node tools/humanize.mjs posts/<file>.md`. Every flag is something to look at again.
2. Fix each flag the way it says. A flag can stay only if it's really how the user talks (check brand/voice.md and
   their past posts), and then say so in the post's Notes.
3. Then simplify, even if nothing was flagged:
   - **Say it out loud.** If it sounds like reading, rewrite it until it sounds like talking.
   - **Cut about a fifth.** First words to go: intros, "really", "just", "actually", the line that explains the joke.
   - **Plain words.** "use", not "leverage". "fix", not "address". Contractions: "it's", "I'm", "didn't".
   - **One real detail** beats three general ones: the number, the name, the thing that actually happened.
   - **End the way brand/voice.md says.** A real question people can answer if the voice asks for one (never a
     generic "thoughts?"), otherwise the twist. Never a summary or a tidy moral.
   - **Uneven is fine.** Real people write one short line, then a longer one. Don't make every line the same length.
4. Never add facts, numbers or moments that aren't true to make it livelier. Funnier, not falser. And keep the post's `payload:`: simplifying must never cut the real thing the post gives.
5. Run the check again. Clean, or every flag explained.

## The usual giveaways (what the check looks for)
Dashes used like commas · "it's not X, it's Y" · "not just X but Y" · delve, leverage, unlock, seamless,
game-changer, journey · "here's the thing", "let that sink in", "the best part?" · opening with "Ever wondered" ·
🚀 ✨ 🔥 🧵 · "…" for drama · more than one "!" · "thoughts?", "follow for more" · hashtags outside Mastodon ·
sentences over 28 words · tech words a non-coder wouldn't get.

## What's theirs (read from the folder)
- **brand/voice.md:** a phrase quoted under *Never do* (Don't end with "tell me what's bad"), or quoted after a
  no or never anywhere else (Skip the fancy word ("gratifying")). And when the voice says every post ends with an
  ask, a post with no question at the end of it.
- **brand/accounts.md and the platform:** each account's words against its hard no's and its length. X counts a
  link as 23 and an emoji as 2; on X, Bluesky, Mastodon and Threads each part of a thread has to fit.
