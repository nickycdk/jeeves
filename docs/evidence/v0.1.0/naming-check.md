# Naming check: "Jeeves" (ST-9.3, R-10)

**Date:** 2026-11-08 · **By:** the agent, from public web searches, `npm view` and DNS lookups. Not legal advice: the maintainer decides, ideally after a USPTO/EUIPO search of their own.

## Findings

| Where | What exists | Risk for "Jeeves, a session-continuity plugin for Claude Code" |
|---|---|---|
| Claude Code plugins | No plugin named Jeeves found (web search; the closest name is "Jev", a TypeSafe skill) | Low |
| GitHub | Several unrelated repos named jeeves: `jubishop/Jeeves` (AI git commit messages, Ruby, MIT), `preritdas/jeeves` (LLM assistant), `modess/jeeves` (Jenkins setup for PHP), `philschatz/jeeves-bot` (inactive since 2018), `Room-11/Jeeves` (chat bot). A repo `<owner>/jeeves` is free under the maintainer's own account in any case | Low: common name, different purposes. `jubishop/Jeeves` is the nearest (an AI developer tool) |
| npm | `jeeves` is taken (a Selenium wrapper, 0.0.10, last change 2022) | None: Jeeves ships no npm package (08 §3) |
| Trademarks (US, via aggregator sites, not TSDR) | "ASK JEEVES": IAC's class 9/42 registrations listed as dead; a new "ASK JEEVES" application by Ask Media Group (serial 98352285, classes 35/42, filed 2024) listed as live/pending. "JEEVES.AI" (Red Blue Media, reg. 7950696, classes 9/42, AI writing software) listed as registered | **Medium**: a live mark in class 9/42 contains the word "Jeeves" (JEEVES.AI), and Ask Media Group is reviving ASK JEEVES. A free, non-commercial open-source plugin with a descriptive tagline is a different market, but the overlap is in the software classes |
| Domains | `jeeves.dev`, `jeeves.sh`, `jeeves.ai` resolve (taken); `getjeeves.dev` did not resolve (possibly free) | Low: the project needs no domain for 0.1 |
| Anthropic naming rule (08 §1) | The name has no "Claude" or "Anthropic" in it | Pass |

## Recommendation

Usable for a free open-source 0.1 beta under the maintainer's GitHub account, with the descriptive tagline "a session-continuity plugin for Claude Code" and no logo resembling Ask Jeeves's butler. Before any commercial use, a paid offering or a plugin-directory listing, the maintainer should confirm the status of JEEVES.AI (reg. 7950696) and ASK JEEVES (serial 98352285) in USPTO TSDR. Fallback names that keep the command short are a decision for the maintainer (D-22 chose Jeeves; ADR-009 A1 keeps `/relay` as the fallback command).

## Sources

- https://markinton.com/trademark/ask-jeeves-78536688, https://markinton.com/trademark/ask-jeeves-98352285, https://trademarkdir.com/trademark/jeeves-ai-97910051, https://markinton.com/trademark/jeeves-ai-97910051
- https://www.ruby-toolbox.com/projects/jeeves-git-commit, https://github.com/preritdas/jeeves, https://awesome.ecosyste.ms/projects/github.com%2Fmodess%2Fjeeves, https://awesome.ecosyste.ms/projects/github.com%2Fphilschatz%2Fjeeves-bot, https://awesome.ecosyste.ms/projects/github.com%2FRoom-11%2FJeeves
- `npm view jeeves` (2026-11-08); `host jeeves.dev|jeeves.sh|jeeves.ai|getjeeves.dev`
