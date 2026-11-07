# 08 — Open-Source Release Plan

## 1. Repository

- **Host:** public GitHub repo under the maintainer's account/org, name `jeeves` (the product name, D-22). No "claude" in the repo, package or product name ([V-DOCS] legal: "you can't use the Claude Code or Anthropic names or logos as part of your own product, feature, or company name"). Descriptive use is fine: "A session-continuity plugin for Claude Code".
- **Layout:** as in 02 §3, plus `docs/`, `fixtures/`, `tests/`, `.github/`.
- The repository root is both the plugin and its marketplace (`.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` with `"source": "./"`), so the install line is one command.

## 2. Required files (FR-15, AC-24)

| File | Content |
|---|---|
| `LICENSE` | MIT (PRD recommendation) unless maintainer picks Apache-2.0 (Q-7); also `license` SPDX in plugin.json (directory requires one of them) |
| `README.md` | Per PRD §17 list; first line is the listing summary; install section with the exact lines below |
| `CONTRIBUTING.md` | Setup, `npm run` scripts, test layers, PTY E2E cost note, story/ADR process |
| `SECURITY.md` | Private reporting channel (GitHub security advisories), supported versions, scope (local state, redaction limits) |
| `PRIVACY.md` | What is stored, where, retention (until `/relay purge` or manual delete), no network, no telemetry, redaction limits |
| `CHANGELOG.md` | Keep a Changelog format, semver |
| `CODE_OF_CONDUCT.md` | Contributor Covenant |
| `.github/ISSUE_TEMPLATE/` | bug (asks for `/relay status --diagnose` output), feature, compatibility report |
| `.github/PULL_REQUEST_TEMPLATE.md` | story ID, tests, evidence, docs checklist |
| `docs/compatibility.md`, `docs/troubleshooting.md`, `docs/architecture.md` | generated/maintained per stories ST-8.2/8.3 |
| `.claude-plugin/icon.png` | square PNG 512–2048 px (directory recommends) |

## 3. Install, update, uninstall (documented exactly)

At the Claude Code prompt:
```
/plugin install jeeves --marketplace <owner>/jeeves
```
From a shell: `claude plugin install jeeves --marketplace <owner>/jeeves`.
Update: `claude plugin update jeeves@<marketplace>` (third-party marketplaces do not auto-update by default [V-DOCS]).
Uninstall: `claude plugin uninstall jeeves`. State is not deleted by uninstall; README gives the path and `/relay purge --all` (run before uninstall) or manual deletion.

No npm package, no CLI, no API key, no service.

## 4. CI (GitHub Actions)

- `ci.yml` on PR/push: matrix `macos-latest`, `ubuntu-latest`; Node 22; `npm ci` (lockfile); typecheck, lint, unit, storage/process tests; `claude plugin validate .` when the CLI is installable without credentials.
- `compat.yml` (nightly + release): install each supported Claude Code version, run `claude plugin validate` and `claude plugin test` (no model calls, no auth needed for the test kit — verify in ST-8.3; if auth is required, run on a maintainer-hosted runner with no secrets in logs).
- PTY E2E is **not** in public CI (needs an authenticated account and costs usage); run by maintainers before gates, evidence committed (06 §5).
- Permissions: workflow-level `permissions: contents: read`; release job alone gets `contents: write` and `id-token: write` (attestation). Actions pinned by commit SHA. No `pull_request_target`.

## 5. Supply chain

- Zero runtime dependencies (ADR-008); dev dependency `typescript` pinned exactly; `package-lock.json` committed.
- Dependabot (actions + npm) with grouped weekly PRs; GitHub dependency review on PRs.
- Secret scanning + push protection enabled; CodeQL (JavaScript/TypeScript) weekly.
- Release artifacts: a zip of the plugin tree built from a clean checkout by the release workflow, SHA-256 checksums, GitHub artifact attestation (SLSA provenance). Tags signed if the maintainer has signing set up ("signed release if practical", PRD §10).
- `claude plugin validate --profile directory` passes before a plugin-directory submission (README, LICENSE, icon).

## 6. Versioning and release process

- SemVer. `0.x` while the mods API is early access; breaking state-schema changes ship with migrations and a CHANGELOG "Migration" note.
- `plugin.json` `version` = git tag. Supported Claude Code range recorded in README, `docs/compatibility.md` and `probe.ts` constant (single source: `probe.ts` exports it; docs generated).
- Release checklist (ST-9.3): gates in 06 §7 green → CHANGELOG → bump version → tag → release workflow → verify install from the tag on a clean user → announce.
- Hotfix path: patch release when a Claude Code update breaks the probe or rotation; until fixed, the probe marks the new version `assisted` so users are never told rotation works when it doesn't.

## 7. Claims policy (AC-25)

Public text (README, release notes, directory listing) may claim only what the evidence pack proves for `full` mode on listed versions:
- ✅ "Automatically starts a fresh Claude Code conversation at your context threshold and continues your task from a validated handover — inside your normal terminal session."
- ✅ "No API key, no server, everything stays on your machine."
- ❌ "Unattended" or "never needs your input" (permission prompts and blockers still need the user — R-09).
- ❌ Any implication of being an Anthropic product.
Assisted mode is described as such wherever it applies.

## 8. Community and maintenance

- Issue labels: `compat` (Claude Code version breakage, highest priority), `handover-quality` (attach redacted handover), `bug`, `docs`, `good first issue`.
- Compatibility watch: after each Claude Code release, run `compat.yml`; update matrix within a week.
- Contribution flow: new behaviour needs a story-style issue with AC; ADR for architectural changes; PRs must include tests and, for user-visible changes, docs.

## 9. Pre-release checklist (copy into the v0.1.0 release issue)

- [ ] Name/domain/repo availability and trademark search done (ST-9.3)
- [ ] LICENSE, SECURITY, PRIVACY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG present
- [ ] README install lines tested from the tag on a clean macOS user
- [ ] AC-01…AC-25 evidence pack linked
- [ ] Security review closed (no Critical/High)
- [ ] Compatibility matrix lists exact tested versions
- [ ] Release artifact reproducible (hash matches a second clean build)
- [ ] Upstream answer on plugin-invoked `/clear` linked (Q-1), or README states the dependency plainly
- [ ] Maintainer sign-off on demo, architecture and docs
