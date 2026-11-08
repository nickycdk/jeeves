# Q-1 — Draft upstream question (NOT POSTED)

Status: draft for the maintainer to review and post (ST-0.7). Suggested venue: a GitHub Discussion (Q&A) on `anthropics/claude-code`, or an issue labelled `question` if Discussions are closed. Record the link in `07-risks-and-open-questions.md` Q-1 once posted.

---

**Title:** Mods: is calling `$.command.run({ command: 'clear' })` from a plugin a supported use?

**Body:**

I'm building an open-source Claude Code plugin (a mod with one hooks module). It keeps long tasks inside a healthy context window. When context passes a threshold, it waits for a safe point, has Claude write a handover, starts a fresh conversation, and continues the task in that conversation without the user typing anything.

The fresh conversation comes from the mods API:

```ts
await $.command.run({ command: 'clear', args: '' })   // then
// classic.SessionStart (source 'clear') -> additionalContext: [handover]
await $.prompt.submit({ text: continuation })
```

On Claude Code 2.1.319 (macOS) this works:

- `session.end` fires with `reason: 'clear'`, and `classic.SessionStart` fires with `source: 'clear'` and a new session id.
- Model, permission mode, cwd, `--add-dir` directories, MCP tools and session crons are all kept.
- The new conversation has no earlier messages.

The type declarations describe `$.command.run` as running a slash command "as if the person typed `/command args`". They don't exclude built-ins. But I couldn't find anything in the docs that says a plugin may invoke `/clear`. The API header also says the surface is early access and may change.

Questions:

1. Is a plugin invoking the built-in `/clear` through `$.command.run` an intended, supported use? Or could it be restricted, for example to user-typed built-ins only, in a future release?
2. If it is supported, could it be documented, or covered by a compatibility note, so plugins can depend on it?
3. If it is not intended, is there a recommended way for a mod to start a fresh conversation in the same interactive process? (We avoid `--resume`, process restarts and PTY wrappers on purpose: we want the user's terminal, permissions and auth left alone.)

What we do to stay safe either way:

- A capability probe at session start.
- An honest "assisted mode" if the call is refused: the user runs `/clear`, then `/relay continue`.
- A pinned, tested version range.
- We never edit transcripts or send keystrokes.

Environment: Claude Code 2.1.319, macOS 14 (Darwin 23.6), mod loaded with `--plugin-dir`.

Thanks!

---

Notes for the maintainer before posting:

- Keep the product name out until the naming check (ST-9.3), or use the working name if you're comfortable with it.
- Don't attach logs that contain session IDs or paths. The snippet above is enough.
