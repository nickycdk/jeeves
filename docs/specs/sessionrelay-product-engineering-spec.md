# SessionRelay — Product Requirements & Engineering Specification

**Version:** 1.0 (planning brief)  
**Date:** 7 November 2026  
**Status:** Ready for discovery, architecture spikes and epic breakdown — **not yet approved for implementation**  
**Working title:** SessionRelay (temporary; verify naming before public release)  
**Audience:** Product/engineering planning agent, maintainers and future open-source contributors  
**Language:** English for implementation artifacts and public documentation; this specification is in Danish.

> **Purpose of this document:** Define the product, expected experience, requirements, boundaries, risks, acceptance criteria and Definition of Done precisely enough for a planning agent to decompose the work into epics and implementation plans. The planning agent must **not** assume that unverified Claude Code APIs can programmatically replace an interactive session.

---

## 1. Executive summary

Byg et **gratis, open-source, local-first session continuity tool til Claude Code**. Det gør det muligt at arbejde på længere udviklingsopgaver hen over flere **friske context windows** uden manuel kopiering af prompts, handovers eller session state. Når den aktuelle sessions context-forbrug rammer en konfigureret tærskel (standard **50 %**), skal værktøjet:

1. Opdage det via understøttede, dokumenterede data.
2. Afvente et sikkert stop i den aktuelle arbejdsproces.
3. Bevare det oprindelige mål og en struktureret, verificerbar handover.
4. Validere, at handover/state kan indlæses og ikke modsiger repository-tilstanden.
5. Oprette en **ægte ny conversation/session med frisk context**, ikke `--resume` af den gamle.
6. Genindlæse målet og handoveren, fortsætte fra næste konkrete step og gentage processen efter behov.
7. Stoppe ved fuldført opgave, brugerintervention, blokering eller sikkerhedsgrænse.

**Primær brugerflade:** Claude Codes eksisterende interaktive CLI i en integreret terminal, især **Cursor**. Brugeren skal kunne fortsætte med almindelige Claude Code-features, permissions, MCP, skills og keyboard shortcuts. Ingen native Mac-app og ingen reimplementering af hele Claude Codes terminal-UI i MVP.

**Arkitekturpræference:** Claude Code **plugin/mod først**, fordi mods kan køre inde i interaktive Claude Code-sessioner. En lille lokal CLI/supervisor må tilføjes **kun hvis teknisk nødvendigt** for virkelig automatisk session-rotation og verificeret fuld terminal-kompatibilitet. Denne beslutning er låst bag en tidlig feasibility spike.

**North-star:** En bruger kan starte en lang opgave fra Cursors terminal, opleve mindst **to automatiske context-rotationer** og nå en verificerbar sluttilstand uden manuelt at skrive 'fortsæt' eller kopiere context.

---

## 2. Baggrund, problem og motivation

### 2.1 Problem

Lange Claude Code-sessions akkumulerer tools, output, diskussion, beslutninger og code-reviews. Context-compaction kan hjælpe, men brugeren ønsker at erstatte voksende sessions med friske sessions og **eksplicit, kurateret arbejdsstate**. I dag indebærer et sådant workflow ofte manuel handover, `/clear`, kopi af instruks og kontrol af, at næste session faktisk fortsætter korrekt.

### 2.2 Brugerproblemer

- Manuelle context-skift afbryder flowet og kræver opmærksomhed.
- Handover kan miste oprindeligt mål, constraints, afklaringer, filer og 'Definition of Done'.
- En ny session kan gentage arbejde, ændre tidligere beslutninger eller erklære opgaven færdig for tidligt.
- Context-måling forveksles let med kontoens rate limits.
- Process-genstart og tilladelser kan ødelægge den normale interaktive oplevelse.
- En fejl under rotation kan efterlade inkonsistent state eller sætte flere agents i gang på samme workspace.

### 2.3 Primære brugere

- Solo developers og tekniske leads, der bruger Claude Code i Cursor/VS Code-terminaler.
- Developers, der udfører længere implementeringer, refactors eller bug-fixes.
- Open-source-brugere, der vil installere én udvidelse med rimelige defaults og ingen API-server.

### 2.4 Principper

1. **Claude Code skal fortsat føles som Claude Code.**
2. **Local-first, open source, minimal setup.**
3. **Forudsigelige state-transitions frem for agent-magiske løfter.**
4. **Sikkerhed og brugerens permissions over automatisering.**
5. **Oprindeligt mål er immutable; handover er revisioner, ikke erstatninger.**
6. **Verificer faktisk fremdrift mod repository og tests.**
7. **Fail safe og tydeligt; aldrig stille destruktivt.**
8. **Frisk context betyder virkelig ny conversation, ikke genoptagelse af gammel history.**

---

## 3. Goals, non-goals og scope

### 3.1 Mål (MUST)

- Automatisk, konfigurerbar context-baseret rotation med standard 50 %.
- Ny conversation efter hver rotation; ingen implicit historikgenbrug via resume.
- Sikker, versionsstyret og valideret handover.
- Fortsættelse af den oprindelige task uden at kræve ny brugerprompt ved hver rotation.
- Fungerer i Cursors integrerede terminal, hvis arkitekturspiken bekræfter mulighed for fuld auto uden at bryde interaktivitet.
- Bevar standard Claude Code-adfærd, særligt permissions, tastaturinput, MCP og plugins.
- Manual override: pause, resume, rotate now, status og recover.
- Nem installation og afinstallation, offentlig dokumentation og sikker fejlhåndtering.

### 3.2 Ikke-mål for MVP

- Ingen selvstændig Mac/Windows desktop-app.
- Ingen cloud dashboard, hosted backend, brugerlogin eller synk.
- Ingen automatisk multi-agent orkestrering eller plan-/task-management-platform.
- Ingen støtte til Codex, Cursor Agent eller andre providers i første release; design interfaces, så senere adapters kan tilføjes.
- Ingen bypass af Claude Code-permissions eller abonnementets rate limits.
- Ingen automatisk commit, push, reset, stashing eller ændringer af git-historik.
- Ingen løfter om, at alle opgaver altid kan gennemføres autonomt.
- Ingen fuld genskabelse af tidligere samtalehistorik som standard.

### 3.3 Scopeprioriteter

**P0 / MVP:** monitoring, safe handover, rigtig session-rotation, auto continuation, local state, status, pause, error/recovery, sikkerhed, Cursor/macOS, installation, tests.  
**P1:** Linux, detaljeret historik, konfigurations-UI, mere avancerede test gates, perf/observability, bedre compatibility matrix.  
**P2:** Windows, andre agent-adapters, optional dashboard, deling af handover-policies, multi-task orchestration.

**Vigtig go/no-go:** Hvis ægte frisk session + fuldt bevaret interaktiv Cursor-terminal **ikke** kan bevises med eksisterende Claude Code-integrationspunkter, må v1 ikke markedsføres som fuldauto. Lever en transparent *assisted mode* som særskilt scope eller afvent API-støtte. Ikke en skjult degradering.

---

## 4. Brugeroplevelse og onboarding

### 4.1 Førstegangsoplevelse

- Installér plugin fra et offentligt Claude Code-plugin-marketplace eller via dokumenteret lokal installation.
- Ingen obligatorisk konto eller egen Anthropic API-nøgle i værktøjet.
- Se en 30-sekunders quickstart: aktivér automatik, start opgave, læs status.
- Plugin skal kunne bruges i **den almindelige** `claude`-session, hvis mulig; ved behov for en supervisor findes en enkel separat launcher. Målet er ikke at kræve en anden editor.
- Brugerens eksisterende Claude Code-autentifikation og permissions respekteres; værktøjet håndterer aldrig credentials.
- Første gang funktionen aktiveres: kort forklaring af, at arbejdsstate skrives lokalt, og at en ny session senere bliver startet.

Eksempel på ønsket flow (**kommandoer er produkteksempler, ikke verificerede native kommandoer**):

```text
# I Cursor-terminalen
claude
/relay on
/relay threshold 50

> Implement video calls according to the project spec ...

[SessionRelay] Active · context 32% · rotate at 50%
...
[SessionRelay] 52% · finishing current work safely
[SessionRelay] Handover validated · starting fresh session
[SessionRelay] Session 2 · context 9% · continuing task
```

Hvis en separat launcher viser sig nødvendig, skal alternativet være enkelt og eksplicit (`sessionrelay` som **illustrativt** navn), og ingen usand påstande må fremsættes om, at `claude -p` giver samme interaktive UI som `claude`.

### 4.2 Kontroller / ønsket command surface

- `/relay on`: Aktivér på aktuel task/session (eksplicit opt-in).
- `/relay off`: Deaktivér uden at afbryde nuværende Claude-session.
- `/relay status`: Context %, threshold, tilstand, seneste rotation, task og state-path.
- `/relay threshold <number>`: Ændr threshold med validering.
- `/relay rotate`: Bed om sikker handover/rotation nu.
- `/relay pause` og `/relay resume`: Sæt auto-rotation på pause eller genoptag.
- `/relay history`: Se kort lokal historik over rotations.
- `/relay recover`: Genopret efter afbrudt rotation, uden dobbelt-opstart.
- `/relay help`: Enkle forklaringer og links.

Kommandoernes endelige navne skal valideres mod pluginets command API og andre installerede plugins. Menneskevenlige fejlbeskeder er obligatoriske.

### 4.3 Feedback i terminalen

- Minimal status, helst en diskret visning over prompten, som ikke fortrænger standard UI.
- Vis kun relevante overgangsbegivenheder; ingen spam efter hver tool call.
- Eksempler: `Monitoring · 34% / 50%`, `Handover requested`, `Validated`, `Starting fresh`, `Paused: permission required`, `Recovered`, `Completed`.
- Narrow terminals: brug kort tekst, ingen vandrette layoutproblemer.
- Hver auto-rotation skal være synlig og kunne forklares i historikken.
- Standard Claude Code-UI og genveje skal forblive brugbare.

### 4.4 Task-model og opt-in

Automatik aktiveres **ikke** stiltiende for alle samtaler efter installation. Brugeren skal aktivt starte eller aktivere en 'managed task'. En managed task har et originalt mål, optional constraints og en Definition of Done. Ved en kort, ad hoc samtale uden aktiv managed task må plugin kun vise neutral context-status eller være inaktiv.

Ved opgaver startet med fri prompt skal værktøjet kunne udlede et *task candidate*, men skal bevare det præcise original-input uændret. Agentgenererede opgaveomskrivninger er supplementer, ikke autoritative ændringer.

---

## 5. Funktionelle krav

### FR-01: Environment detection og kompatibilitet

**MUST:** Registrér Claude Code-version, terminaltype, OS, plugin-/mod-støtte og eventuelle kendte inkompatibiliteter. Giv klar fejl med foreslået handling. Foretag ikke lydløst ændringer af globale Claude-settings.

**Acceptance:** Ved for gammel version vises præcist, hvad der mangler, og der startes ingen auto-rotation.

### FR-02: Sand context-overvågning

**MUST:** Brug dokumenteret session-context, ikke gæt ud fra antal beskeder, outputlængde eller abonnements-ratelimits. Primær mod-kilde: `$.session.usage().context.percent`, når understøttet. Fallback til dokumenteret `context_window.used_percentage` i statusline-data kun hvis arkitekturen tillader det uden side effects. Mål **main conversation**, ikke en subagents forbrug.

**Acceptance:** Null, stale eller unsupported værdier må aldrig blive til `0 %` eller udløse forkert rotation. Markér `unknown` og prøv igen senere.

### FR-03: Threshold og trigger

**MUST:** Default 50 %; konfigurerbar threshold (foreslået 20–90 %, valider ved design). Udløs når målt brug er `>= threshold`. Trigger kun én gang pr. session og rotationsforsøg; ny session genarmeres først ved registreret frisk context.

**SHOULD:** Korte advarsler før threshold, fx ved 5 procentpoint under. Anvend hysterese og cooldown for at forhindre loops.

**Acceptance:** 49 % = ingen rotation, 50 % = én rotation; gentagne events ved 51 % skaber ikke yderligere handovers.

### FR-04: Safe boundary

**MUST:** Afbryd aldrig midt i et tool call, en aktiv edit, permission prompt eller et uafsluttet multi-step side-effect. Marker først `ROTATION_REQUESTED`, og fortsæt ved et verificeret sikkert grænsepunkt. Hvis sikkerhed ikke kan afgøres, stop med tydelig status eller gå til assisted mode.

**MUST:** Håndtér lange agent-turns, subagents, baggrundsprocesser og parallelle tool calls ved at afvente/afslutte kontrolleret. Sæt tidsgrænse og brugerintervention på.

**Acceptance:** Ingen halvskrevne handovers eller forældreløse child processes ved normal rotation.

### FR-05: Immutable original task

**MUST:** Gem original user prompt (og eventuelt efterfølgende eksplicitte ændringer) i separate, append-only revisions. Hver ny session skal modtage seneste eksplicit godkendte task-revision, ikke et hallucineret omskrevet mål.

**Acceptance:** Efter tre rotationer kan man sammenligne original prompt med den aktive task og se alle bevidste ændringer.

### FR-06: Handover generation

**MUST:** Handover skal følge en standardstruktur, der er kort nok til frisk context og rig nok til sikker fortsættelse:

1. Task ID, session sequence, timestamp, branch/worktree/cwd.
2. Original goal, requirements, constraints og DoD (reference, ikke nødvendigvis duplikeret fuldt ud).
3. Hvad der faktisk blev ændret (filer, kort beskrivelse, ikke blot intentioner).
4. Beslutninger og begrundelser.
5. Tests/checks udført, resultater og kendte fejl.
6. Aktuelle blockers, åbne spørgsmål og risici.
7. Eksakt næste sikre handling og rækkefølge.
8. Arbejde som **ikke** må gentages; state som skal verificeres i repo.
9. Handoff reason/context %, samt provenance på oplysningerne.

**MUST:** Metadata verificeres deterministisk, fx git branch/status, eksisterende filpaths, process exit codes. Agentens fritekst må ikke omskrive en failed test til passed.

**SHOULD:** Marker hvert punkt som verified / inferred / unknown, hvor relevant. Begræns længden og undgå, at hele transcriptet kopieres videre.

### FR-07: Validering af handover

**MUST:** Schema valideres, session/task-ID matcher, filreferencer verificeres, repository-identitet og branch kontrolleres, handover kan parses igen. Persistér atomisk (`temp → fsync/rename` eller dokumenteret tilsvarende). Hash/checksum eller entydigt version-ID. Handover må ikke overskrive en gyldig tidligere checkpoint uden historik.

**Acceptance:** Tom, korrupt eller mismatchende handover blokerer automatisk rotation og efterlader en recoverable session.

### FR-08: Ægte ny session

**MUST:** Start en **ny** Claude conversation med ny session identity og uden tidligere transcript/context. Brug ikke `--resume`, `--continue` eller forking af gammel historik som løsning på ny context. Bevar kun nødvendige projektfiler, konfigurering og handover.

**MUST:** Samme projekt/cwd og relevante flags, model og permissions, så vidt offentlige/understøttede API'er tillader det; den nye session må ikke få forhøjede privilegier.

**Acceptance:** Test viser ny session-ID, forventet lav context baseline og kun eksplicit injiceret/task-relevant state.

### FR-09: Automatisk continuation

**MUST:** Ny session skal læse original task, seneste validerede handover og faktisk repository-state, derefter fortsætte ved første uafsluttede step. Den skal kontrollere, om arbejdet allerede er lavet, før der implementeres mere.

**MUST:** Opfølgning må ikke kræve, at brugeren manuelt skriver 'continue'. Agenten må til gengæld stoppe for brugerens godkendelse ved policy/permission/blocker.

**Acceptance:** I et automatiseret scenarie fortsætter session 2 uden manuelle prompts og undgår at gentage et allerede udført task-step.

### FR-10: Completion og DoD

**MUST:** Færdigmelding må ske, når taskens DoD og verificerbare checks er opfyldt, eller når tydeligt mærkede undtagelser godkendes af brugeren. Ved ubesvarede spørgsmål, tests der fejler, eller utilstrækkelig evidens er status `BLOCKED` eller `NEEDS_REVIEW`, ikke `COMPLETED`.

**Acceptance:** Agentens blotte tekst `done` kan ikke alene afslutte en managed task.

### FR-11: Controls og intervention

**MUST:** Brugeren kan pause/disable/manuel rotate/status/recover. Ctrl+C/Esc og permission prompts skal stadig virke som i Claude Code. En manuel pause bevares hen over genstart. `off` må ikke slette state.

**Acceptance:** Pause lige før threshold forhindrer rotation, indtil resume aktiveres.

### FR-12: Fault tolerance og recovery

**MUST:** Crash, lukket terminal, kill signal, timeout, mislykket handover, mislykket processtart, ingen auth, rate limit, permission-denied og manglende diskplads skal give genkendelige states og dokumenteret recovery. Idempotent genstart; aldrig start to workers på samme task ved én retry.

**Acceptance:** Et kunstigt crash under `VALIDATING` kan genoptages uden datatab eller duplikeret code-edit.

### FR-13: Lokal state og task-isolering

**MUST:** Gem data på maskinen med task- og session-ID, dedikeret namespace, versionering og lock. To aktive projekter påvirker ikke hinanden. To processer mod samme task skal låses og advares.

**MUST:** Værktøjet må ikke tilføje private logs eller state til git automatisk. Respektér gitignore og et konfigurerbart storage location; undgå at ændre eksisterende `.claude`-settings uden consent.

### FR-14: Status og audit trail

**MUST:** Vis task-status, rotation count, sidste success, sidste fejl, aktuelt context-forbrug (hvis kendt), threshold og state-location. Historik registrerer state-transitions med årsagskode uden hemmeligheder.

### FR-15: Open-source distribution

**MUST:** Offentlig repo, passende open-source-licens (anbefalet MIT; beslutning før release), README, CONTRIBUTING, SECURITY, CHANGELOG, issue/PR templates, reproducerbare builds, CI, versionsstyring og release-process.

**MUST:** Brug selvstændigt produktnavn uden at anvende 'Claude Code' eller 'Anthropic' som del af eget produkt-/firmanavn eller logo; kompatibilitet kan nævnes beskrivende.

### FR-16: Sikkerhed og privacy

**MUST:** Ingen credentials eller transcripts uploades til en egen server. Ingen credential harvesting. Ingen `--dangerously-skip-permissions`, automatisk sikkerhedsnedgradering eller bypass af org policy. Ingen eksekvering af shell-strings fra handover uden standard permissions. Redact følsomme data fra log/handovers så vidt muligt og dokumentér den resterende risiko. Fortrolige handovers skal ikke indgå i telemetry.

### FR-17: Kompatibilitet med almindelig Claude Code

**MUST:** Custom settings, MCP, hooks, plugins, skills, model selection, permission prompts og normal CLI adfærd skal bevares, med dokumenterede undtagelser. Værktøjet må ikke overtage en brugers eksisterende statusline eller tastaturbindings uden eksplicit valg.

---

## 6. End-to-end workflows

### Flow A: Første installation og aktiv opgave

1. Bruger installerer plugin og læser quickstart.
2. Åbner Cursor-terminal og starter `claude` som normalt.
3. Aktiverer managed mode og sætter standard 50 % (eller bruger default).
4. Starter implementering.
5. Ser diskret status og arbejder normalt.
6. Værktøjet registrerer konteksten uden at forstyrre turn eller permissions.

**Expected:** Ingen ekstra API-key eller service; auto-rotation sker ikke før opt-in.

### Flow B: Normal automatisk rotation

1. Context opdateres fra 47 % til 52 %.
2. `MONITORING → ROTATION_REQUESTED` registreres én gang.
3. Aktive tool calls/turn får lov at nå et sikkert punkt.
4. Claude instrueres til at aflevere en struktureret handover; supervisor/mod kontrollerer den.
5. Handover bliver persistent og atomisk valideret.
6. Gammel session afsluttes sikkert, ny session oprettes uden old transcript.
7. Den nye session indlæser task og handover, kontrollerer git status og fortsætter.
8. UI viser `Session 2` og en frisk context-måling.

**Expected:** Brugeren skriver ingen ekstra prompt. Handover/rotation er synlig. Ingen auto-commit.

### Flow C: Bruger ønsker manuel rotation

1. `/relay rotate` under aktiv managed task.
2. Værktøjet følger præcis samme safe/validate/restart pipeline som auto.
3. Der er ingen code-loss og ingen unødvendig proces-restart før handover er godkendt.

### Flow D: Handover mislykkes

1. Handover-output mangler obligatorisk felt eller repo mismatch.
2. Værktøjet forsøger bounded retry med specificeret fejl.
3. Ved fortsat fejl sættes `NEEDS_REVIEW`, og auto-rotation blokeres.
4. Brugeren kan se årsagen, rette/acceptére eller bruge recover.

**Expected:** Gammel verificerbar state bevares, og ingen ny worker påbegyndes uautoriseret.

### Flow E: Terminal lukker efter en handover

1. Handover er committed til lokal state; proces crasher før fresh session-start.
2. Ved næste normale start ser værktøjet en `ROTATING`/`RESTORING` task.
3. Det kontrollerer lock/processer og tilbyder eller udfører idempotent recover i henhold til opt-in.
4. Tasken fortsættes præcis én gang fra sidst gyldige checkpoint.

### Flow F: Task afsluttes

1. Claude mener, at den er færdig.
2. Værktøjet sammenholder task DoD med test-/verifikationsbeviser.
3. Ved bestået DoD: `COMPLETED`, opsummering og stop rotation.
4. Ved mangler: `NEEDS_REVIEW` eller `BLOCKED` med konkrete punkter.

---

## 7. State machine og transitions

Normative states:

```text
DISABLED
   │ user opt-in
   ▼
MONITORING ──────────────────────────────┐
   │ threshold / manual request          │
   ▼                                     │
ROTATION_REQUESTED                       │
   ▼                                     │
QUIESCING (await safe boundary)          │
   ▼                                     │
HANDOVER_GENERATING                      │
   ▼                                     │
VALIDATING ── validation failure ──► NEEDS_REVIEW
   ▼
ROTATING (finalize old; create fresh)
   ▼
RESTORING (task + handover + repo check)
   ▼
CONTINUING ───────────────────────────► MONITORING

Any active state ──► PAUSED / BLOCKED / FAILED
MONITORING / CONTINUING ──► COMPLETED
```

**Invariants:**

- En task har højst én aktiv rotation og én aktiv owner/worker.
- En rotation har immutable `rotationId`, sourceSessionId og targetSessionId (når oprettet).
- Handover valideres **før** definitiv lukning af recoverable state.
- Alle transitions er idempotente ved genudførelse, eller har en dokumenteret deduplication key.
- Auto-rotation er aldrig tilladt fra `DISABLED`, `PAUSED`, `BLOCKED`, `NEEDS_REVIEW` eller `FAILED`.
- Ingen state ændres udelukkende ud fra et LLM-udsagn, når et maskinelt check er muligt.
- Rate-limit pause og context threshold er to forskellige årsagskoder.
- Hvis en ny session starter med context over threshold, markér failure/possible loop i stedet for straks at rotere igen.

---

## 8. Data contracts og persisted state

### 8.1 Foreslået storage layout (besluttes af planning agent)

Lokalt data skal være private og ikke auto-committes. Prefer user-level state root (fx under brugerens application-support/cache) frem for at skrive ukontrolleret til repository. En **valgfri** project-local `.sessionrelay/` kan bruges til portable handovers, men kræver korrekt `.gitignore` eller eksplicit brugervalg.

```text
<local-state-root>/
  projects/<project-id>/
    tasks/<task-id>/
      task.md             # Original prompt, revisions, DoD
      config.json         # Effective task settings
      state.json          # Machine-readable state, atomic write
      handover.md         # Latest validated human-readable handover
      history/
        handover-001.md
        handover-002.md
      sessions/
        001.json
        002.json
      events.jsonl        # Redacted structured event log
      lock.json
```

### 8.2 Eksempel på config (proposed contract)

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "mode": "auto",
  "thresholdPercent": 50,
  "maxRotationsPerTask": 10,
  "maxHandoverRetries": 2,
  "maxConsecutiveFailures": 2,
  "requireValidatedHandover": true,
  "requireExplicitOptIn": true,
  "onUnsafeBoundary": "pause",
  "storage": "user-local"
}
```

Den konkrete schema må først fastlægges efter arkitekturspike. Ingen config-flag må love en implementering, der ikke findes.

### 8.3 Task state (minimum)

```json
{
  "schemaVersion": 1,
  "taskId": "task_...",
  "projectId": "project_...",
  "status": "MONITORING",
  "originalGoalRevision": 1,
  "sessionSequence": 2,
  "activeSessionId": "session_...",
  "lastValidatedHandoverId": "handover_001",
  "rotationCount": 1,
  "thresholdPercent": 50,
  "lastContextPercent": 18,
  "lastErrorCode": null,
  "updatedAt": "2026-11-07T08:00:00Z"
}
```

### 8.4 Handover template (must have)

```markdown
# Handover: <task-id> / session <n>

## Original task and DoD
Reference: task.md revision <n>

## Verified repository state
- Repo / cwd / branch / worktree:
- Git status at handover:
- Changed files (verified):

## Completed since last handover
- [verified / inferred] ...

## Decisions and constraints
- ...

## Tests and checks
- Command / exit code / relevant result / timestamp

## Open work and blockers
- ...

## Exact next actions
1. ...
2. ...

## Do not repeat / do not change
- ...

## Rotation metadata
- Source session / threshold / observed usage / createdAt
```

**Security:** LLM skal instrueres til aldrig at kopiere tokens, API-keys, fulde `.env`-filer eller hemmeligheder ind i handover. Logs må ikke automatisk indeholde fuld transcript. Redaction kan ikke garanteres; brugeren informeres om, at lokal handover kan indeholde projektfølsom information.

---

## 9. Arkitektur og vigtig feasibility-afklaring

### 9.1 Foreslåede moduler

```text
[Claude Code interactive CLI in Cursor]
          │
[SessionRelay Plugin / Mod]
  ├── Environment/compatibility adapter
  ├── Context usage adapter
  ├── Status UI + user commands
  ├── Task manager / original goal
  ├── Rotation state machine
  ├── Handover generator/validator
  ├── Local state / event store / locks
  └── Session lifecycle adapter
          │
  [Optional local CLI supervisor]
  └── Fresh interactive process/session start,
      only if native mod can't do it safely
```

### 9.2 Verificerede integrationsmuligheder pr. 7 Nov 2026

- Claude Code **Mods** er TypeScript/JavaScript-funktion-hooks pakket som plugins og kan tegne UI/registrere commands. De er aktiveret i CLI fra en nyere Claude Code-version; bekræft konkret min-version mod officiel guide.
- Officiel mod-guide viser `$.session.usage()` med `context.percent`, `context.tokens` og `context.window`. Målene skal læses fra den installerede versions genererede type declarations.
- `session.start`, `turn.complete` og `ui.render` findes som dokumenterede mod-events.
- Claude Code statusline-data indeholder `context_window.used_percentage`, men denne kilde er bundet til statusline/last API response og kan være `null`.
- Claude Code CLI skelner mellem `claude` (interaktivt), `claude -p` (print/non-interaktivt) og `-c`/`-r` (genoptagelse).
- Claude Code Agent SDK har sessions og programmatisk agent-loop, men er **ikke** automatisk den samme UI-oplevelse som en almindelig `claude`-terminal.

### 9.3 Ikke verificeret — skal bevises før implementering

**SPIKE-01 (kritisk):** Kan en mod fra et aktivt interactive CLI-session sikkert fremkalde en **ny** native conversation med frisk context og fortsættelsesprompt uden at kræve manuel input og uden at miste terminaloplevelsen?

**SPIKE-02 (kritisk):** Hvis ikke, kan en ekstern supervisor styre proceslivscyklus og genopstarte **interactive** `claude` i samme Cursor-terminal via en PTY, mens input, terminal resize, Ctrl+C, keyboard shortcuts og permissions bevares? Dokumentér resultater.

**SPIKE-03:** Hvordan injiceres fortsættelsesprompt/task/handover sikkert i ny session uden at genoptage tidligere history, og hvordan detekteres gyldigt nyt session ID?

**SPIKE-04:** Kan vi hæmme eller styre automatisk compaction ved threshold, uden hack eller bypass af Claude policies? Hvis ikke, hvordan reagerer vi, når compaction sker før rotation?

**SPIKE-05:** Hvilke lifecycle events er sikre til pause efter tool batch, inkl. subagents/async operations? Hvilke events giver scope kun for hovedagenten?

**SPIKE-06:** Hvor meget af login, MCP, active model, permission state, plan mode, additional dirs og project trust overføres automatisk til en ny session via supported interfaces?

**SPIKE-07:** Kan mod-konfiguration/install med marketplace ske med få trin og uden at overskrive en allerede personlig statusline?

### 9.4 Beslutningsregler

**Path A — Mod-only:** Vælg hvis SPIKE-01/03/05 bestås og UX matcher acceptance criteria. Foretrukken løsning, enklest distribution.

**Path B — Mod + minimal supervisor:** Vælg hvis SPIKE-02/03/05 bestås med *ægte* interactive session. Bruger skal kun installere én distribution eller få fuldautomatiseret dependency-setup.

**Path C — Assisted mode:** Hvis A og B fejler, begræns feature claim. Lever fx monitor + validated handover + guidet fresh start. Markedsfør **ikke** som automatisk sessionrotation. Evaluer go/no-go med maintainer.

**Afvis:** Autostyring gennem keystroke injection, skjult PTY-hijacking, manipulation af private Claude-transcript-filer eller udokumenterede interne API'er som eneste produktionsstrategi.

---

## 10. Safety, reliability, privacy og security

- **Permissions:** Alle tool approvals fra Claude Code skal fortsat håndteres af Claude; SessionRelay må aldrig auto-godkende eller eskalere tilstand ved restart.
- **Projekttrust:** Ingen omgåelse af projekt-/organisationsrestriktioner.
- **Files:** Ikke destruktive filesystem-operationer ud over eget data-namespace og eksplicit brugerhandling. Ingen git mutation (commit, stash, reset) som del af rotation.
- **Secrets:** Ingen egen telemetry-server; redacted logs; opt-in diagnostic bundle, og preview før deling.
- **Privacy:** Everything local. Dokumentér hvilke data, der opbevares, lokation, retention og slettemåde.
- **Crash consistency:** Atomic persistence, single-owner lock, journaling, stale-lock recovery, unique rotation IDs.
- **Rate limits:** Hvis Claude svarer med rate limit/quota/auth error, skal task pauses; ingen uendelige reconnects.
- **Prompt injection:** Teksten i repository og handover er ikke autoritet til at ændre værktøjets sikkerhedspolitik; tool permissions forbliver autoritative.
- **Background tools:** Ingen ukontrolleret restart, mens eksterne side effects stadig kører.
- **Multi-worktree:** Identificér worktree; håndtér samme repo i to forskellige worktrees uden krydsforurening.
- **Cleanup:** Uninstall må ikke fjerne brugerens source files. 'Delete state' kræver eksplicit scope og confirmation.
- **Open-source supply chain:** Dependency pinning, lockfile, secret scanning, dependency review, GitHub Actions med minimale permissions og signeret release hvis praktisk.
- **Legal/branding:** Claude Code binary må ikke patches; al autentifikation er brugerens egen. Produktnavn/branding må ikke udgive sig for at være Anthropic-officielt.

---

## 11. Edge-case matrix

| Case | Forventet adfærd |
|---|---|
| Context = `null`/unknown | Vis unknown, ingen rotation, prøv igen |
| Context springer fra 40 til 70 % | Én request, safe boundary før rotation |
| Flere hooks melder threshold samtidig | Deduplicér på rotation ID |
| Automatisk compaction før threshold | Registrér/justér; undgå falsk rotation, dokumentér fallback |
| Threshold nås under aktiv tool call | Vent på safe boundary; afbryd ikke tool |
| Permission prompt afventer svar | Bevar prompt; ingen rotation før resolved |
| Aktiv subagent eller baggrundsjob | Vent eller pause tydeligt, ingen orphan processes |
| Bruger trykker Ctrl+C | Bevar almindelig Claude-semantik; ingen skjult fortsættelse |
| Handover er tom eller ulæselig | Retry bounded; derefter NEEDS_REVIEW |
| Git branch ændrer sig under handover | Stop rotation og kræv vurdering |
| Uncommitted user edits eksisterer | Bevar; medtag i verified state, ingen git manipulation |
| Projektsti flyttes | Tydelig mismatch/relink, ingen blind fortsættelse |
| Terminal lukker under restart | Persistér state, recover på næste launch |
| To managed tasks i samme repo | Task locks, isolér state; håndtér konkurrence tydeligt |
| Ny session starter > threshold | Detektér mulig loop; pause, ingen straks-rotation |
| Autentifikation udløber | Pause med besked, respekter native login |
| API/rate limit | Pause; ingen loop eller bypass |
| Disk fuld/permissions | Bloker rotation, bevar sidste valide checkpoint |
| Bruger opdaterer Claude Code | Compatibility check; forklar brudte integrationer |
| Bruger deaktiverer plugin midt i rotation | Persistér recoverable state, undgå ny auto-start |
| Task er allerede opfyldt | DoD-verificér, afslut uden unødvendig rotation |
| Gammel handover har stale filepaths | Verificér mod repo før continuation |
| Ny session gentager tidligere ændring | Detect completed work, undgå duplicate side effect |

---

## 12. Non-functional requirements og quality bars

**NFR-01 Usability:** Ny bruger kan installere, aktivere og udføre en demo-rotation efter dokumenteret quickstart uden at redigere JSON eller læse kildekode. Target: under 5 minutter ekskl. installation af Claude Code.

**NFR-02 Terminal UX:** Testes fysisk i Cursor integrated terminal på macOS. Ingen tab af input, terminal resize, Ctrl+C, Unicode rendering eller permission prompts. Hvis hybrid-tilgang ikke kan bevare dette, består den ikke MVP-gate.

**NFR-03 Low overhead:** Normal monitorering skal være letvægts og uden ekstra modelopkald pr. event. Benchmark og dokumentér p50/p95 lokal hook-overhead (target under 100 ms for almindelige checks ekskl. I/O eller API), uden unødvendig filesystem-scanning.

**NFR-04 Robusthed:** Alle state transitions er recoverable efter simuleret procesnedbrud. Intet krydstask datalæk og ingen dobbelt rotation.

**NFR-05 Observability:** Lokal status og strukturerede event logs. Ingen server. Debug mode er opt-in og redacted.

**NFR-06 Compatibility:** Dokumenteret min version for Claude Code, Node/runtime hvor nødvendigt, macOS-support; Linux P1, Windows P2. Unsupported versions afvises klart.

**NFR-07 Maintainability:** Strict TypeScript, runtime schema validation, adapter interfaces, testbar pure state-machine og ingen unødig framework-dependency.

**NFR-08 Accessibility:** Terminalbeskeder må ikke kun formidle state via farve; klare tekster og no-emoji fallback.

**NFR-09 Portability:** State schema er versioneret og fremtidigt migrérbart. Handover er læsbart Markdown.

**NFR-10 Data minimization:** Ingen fuld transcript lagres af værktøjet som default.

---

## 13. Acceptance criteria (release-blocking)

Alle AC'er skal have et automatiseret test eller eksplicit dokumenteret, reproducerbart manuel E2E-evidens. 'Agent says it works' er ikke evidens.

- **AC-01 — Install:** Ren macOS + aktuel kompatibel Claude Code: plugin installeres efter quickstart og kræver ingen egen service/API-key.
- **AC-02 — Cursor:** Åbn Cursor-terminal, start normal Claude, aktivér managed mode; original TUI og permissions virker.
- **AC-03 — Opt-in:** Uden aktivering starter der ingen automatisk rotation.
- **AC-04 — Context:** Målingen matcher dokumenteret context-kilde for hovedsessionen; rate limits blandes ikke ind.
- **AC-05 — Threshold:** Ved 49 % ingen rotation; ved 50 % nøjagtigt én rotation request.
- **AC-06 — Missing usage:** Null eller stale usage skaber ikke trigger eller falsk 0 %-visning.
- **AC-07 — Safe boundary:** Overskridelse under tool call eller permission prompt afbryder ikke operationen.
- **AC-08 — Handover:** Obligatoriske felter er til stede, handover er kort, validerbar og refererer original task.
- **AC-09 — Git truth:** Changed files/branch/tests angives ud fra kontrollerede fakta; fejlede tests er fejlede.
- **AC-10 — Fresh session:** Ny session har nyt ID og frisk context; gammel transcript er ikke genoptaget.
- **AC-11 — Continue:** Session 2 læser original task og validated handover og fortsætter uden brugerprompt.
- **AC-12 — Multi-rotation:** Testtask roterer mindst to gange, uden handover drift eller gentaget arbejde.
- **AC-13 — Completion:** Opgaven stopper ved verificeret DoD; en løs `done` uden tests er ikke nok.
- **AC-14 — Pause:** Pause forhindrer fremtidige rotationer; resume genaktiverer dem.
- **AC-15 — Manual:** Manuel rotate benytter identisk sikker pipeline som auto.
- **AC-16 — Crash recover:** Crash ved hvert væsentligt transition punkt kan recoveres uden dubleret worker/side effect.
- **AC-17 — Corrupt state:** Korrupt handover fører til NEEDS_REVIEW, ikke blind continuation.
- **AC-18 — Concurrent tasks:** To tasks/repositories isoleres; samme task har single owner.
- **AC-19 — Non-destructive:** Ingen commit/push/reset/stash eller permission bypass under standard rotation.
- **AC-20 — Uninstall:** Værktøjet kan fjernes uden at ødelægge Claude settings eller ændre brugerkode.
- **AC-21 — Documentation:** En ny contributor kan følge README, køre tests og bygge lokalt.
- **AC-22 — Compatibility:** Dokumenteret test matrix for konkret Claude Code-version og macOS/Cursor-version.
- **AC-23 — Failure clarity:** Auth, rate limit, outdated CLI, disk error og forkert project path vises forståeligt.
- **AC-24 — Open-source:** Public release har licens, security policy, release artifacts og changelog.
- **AC-25 — Honest behavior:** Hvis fuld interactive auto-restart ikke kan bygges sikkert, får brugeren tydelig assisted mode; produktet hævder ikke at opfylde AC-10/11 uden bevis.

### 13.1 Gherkin-eksempel: Normal rotation

```gherkin
Given a user has an active managed task in Cursor terminal
And the rotation threshold is 50 percent
And the latest validated context reading is 49 percent
When a main-session turn completes and usage becomes 52 percent
Then exactly one rotation is requested
And active tools finish before the handover
And a valid handover is persisted atomically
And a new conversation starts with a new session ID
And the new conversation reads the original task and handover
And continues the next unfinished action without user prompting
And no git mutation or permission escalation is performed
```

### 13.2 Gherkin-eksempel: Invalid handover

```gherkin
Given a managed task is rotating
When the handover cannot be validated after bounded retries
Then no new worker is started automatically
And the last good state remains readable
And the task becomes NEEDS_REVIEW
And the user sees a specific error and recovery guidance
```

---

## 14. Test- og verifikationsstrategi

### 14.1 Unit tests

- Context threshold and hysteresis.
- All state transitions and forbidden transitions.
- Idempotency / lock ownership / rotation IDs.
- Config schema/precedence/defaults.
- Handover schema validation/redaction.
- Path normalization, workspace identity and git metadata comparison.
- Recovery state reducer, corrupt files, atomic write simulation.

### 14.2 Integration tests

- Claude Mod events for session usage + command registration + minimal UI.
- Stubbed session lifecycle adapter, including fresh-session identity and usage-reset verification.
- Handover generation/verification with test repos, dirty worktrees and failed tests.
- Signals and process supervision (if selected).
- Permission prompts, rate limits, missing auth and plugin conflicts.

### 14.3 E2E tests

- **Required:** macOS + Cursor integrated terminal + a supported Claude Code version.
- Normal two-rotation feature implementation in a controlled fixture repo.
- Manual rotation mid-task.
- Terminal resize and narrow width.
- Ctrl+C during tool activity, handover validation and new-session init.
- Cold start recovery from crash at multiple transition boundaries.
- Two independent repositories and concurrent same-project attempts.
- Existing user MCP/skills/custom hooks unchanged.

Where feasible, automate terminal testing with a PTY test harness. Otherwise publish a reproducible manual test script and short sanitized recording/evidence. Do not log developer secrets.

### 14.4 Release test gates

- `lint`, `typecheck`, unit/integration tests, build and package validation pass.
- `claude plugin validate` and `claude plugin test` pass when a mod is used; note version/limitations.
- AC-01–AC-25 backed by reproducible evidence, with explicit `pass/fail/not supported`.
- At least one real multi-rotation demo in Cursor, not only mocked usage.
- Security and dependency review complete.

---

## 15. Definition of Ready og Definition of Done

### Definition of Ready (for implementation)

- [ ] Critical spikes 01–03 and 05 have documented results, version numbers, screenshots/log evidence and recommendation.
- [ ] ADR selects **mod-only**, **mod+supervisor** or **assisted mode**, explaining alternatives.
- [ ] Explicit MVP capability claims match the chosen architecture.
- [ ] Scope, dependencies, interfaces and state schemas reviewed by maintainer.
- [ ] Main use cases mapped to detailed acceptance tests.
- [ ] Security model reviewed, particularly auth, permissions and local state.
- [ ] Installer/distribution approach and support matrix agreed.
- [ ] No critical open unknown is disguised as an implementation assumption.

### Definition of Done — each story

- [ ] Behavior meets the story's acceptance criteria.
- [ ] Unit tests and relevant integrations added; all existing tests pass.
- [ ] Typecheck, lint and package validation pass.
- [ ] Error, cancellation and recovery behavior covered.
- [ ] No secrets or unnecessary full transcripts logged.
- [ ] Observable state and user-facing failures understandable.
- [ ] Documentation updated for changed behavior.
- [ ] Code reviewed and no Critical/High findings remain.

### Definition of Done — MVP/release

- [ ] All P0 requirements implemented or scope change explicitly approved and documented.
- [ ] AC-01–AC-25 pass for features being marketed as supported; no false 'full auto' claim.
- [ ] A real user can start a managed task inside Cursor and complete a demonstrated multi-session workflow.
- [ ] All recovery, locking, safety and non-destructive tests pass.
- [ ] Repo holds onboarding, examples, CLI/plugin docs, troubleshooting and FAQ.
- [ ] Tested supported platform/version matrix and known limitations published.
- [ ] License, security policy, changelog and release process included.
- [ ] Install/uninstall documented and verified in a clean environment.
- [ ] Privacy and data storage explained.
- [ ] Release tag/artifact builds reproducibly and CI passes.
- [ ] No permission bypass, unsafe shell injection or credentials handling.
- [ ] Maintainer has signed off on demo, architecture and documentation.

---

## 16. Risks, dependencies, open decisions

| ID | Risiko/spørgsmål | Impact | Påkrævet handling |
|---|---|---|---|
| R-01 | Mod API kan ikke automatisk skabe en ny interactive conversation | Critical | SPIKE-01, architecture gate |
| R-02 | PTY-wrapper ændrer normal TUI/permissions | Critical | SPIKE-02, real Cursor E2E |
| R-03 | Handover kan udelade vigtig implicit context | High | Immutable task, schema, checks, multi-rotation tests |
| R-04 | LLM erklærer færdig uden verification | High | Deterministisk DoD/check gates |
| R-05 | Race conditions ved session-skift | High | Atomic state machine, lock, idempotency |
| R-06 | API ændres mellem Claude Code releases | High | Versioned adapter, compatibility tests |
| R-07 | Interaktion med subagents/background tools | High | Boundary gate + manual/assisted fallback |
| R-08 | Store/hemmelige handovers | High | Data minimization, redaction, local permissions |
| R-09 | Langt tasks kræver re-approval og kan ikke fortsætte unattended | Medium | Pause and explain; preserve native permissions |
| R-10 | Product naming/trademarks | Medium | Brand check before public release |

**Beslutninger som agenten skal fremlægge, ikke træffe uden evidens:**

1. Kan v1 være mod-only, eller kræves en supervisor?
2. Hvad er præcis 'safe boundary' med subagents og parallel tool calls?
3. Hvilke supported events bruges til continuation og completion verification?
4. Hvor lagres state sikkert på tværs af OS uden repository contamination?
5. Hvilken installation er enklest og mest robust: plugin marketplace, packaged CLI eller kombination?
6. Skal auto-rotation kun være aktiv for managed tasks (anbefalet), og hvordan oprettes task uden ekstra onboarding-friktion?
7. Hvilke OS/versions støttes på release day?
8. Skal et safe stop efter threshold være hard stop eller bounded wait med assisted fallback?

---

## 17. Open-source product og developer experience

**Packaging:** Foretræk Claude Code-plugin/Mod via offentlig repository og marketplace. Hvis CLI er påkrævet, udgiv versioneret package med én let installationsvej og `doctor` for compatibility. Undgå to uafhængige installationsforløb, hvis ét script/package kan opnå samme sikkerhed.

**Public README (must contain):**

- Problem i én sætning og 30-sekunders produktdemo.
- Requirements, compatibility matrix, install/update/uninstall.
- Quickstart i Cursor og en almindelig macOS-terminal.
- Hvad auto gør, hvad den ikke gør, og hvornår den stopper.
- Data location, privacy og limitations.
- Status/commands og konfigurering med defaults.
- Recovery/troubleshooting og FAQ.
- Contributing, tests, security, release process.

**Suggested repo structure (not binding):**

```text
/
  .claude-plugin/      # Marketplace/plugin metadata as appropriate
  packages/
    plugin/            # Mod entrypoints, UI and commands
    core/              # State machine, schemas, handover logic
    supervisor/        # Only if Spike selects hybrid architecture
  fixtures/
  tests/
  docs/
    architecture/
    adr/
    troubleshooting.md
    compatibility.md
  README.md
  CONTRIBUTING.md
  SECURITY.md
  LICENSE
  CHANGELOG.md
```

**Maintainability:** Core logic skal være uafhængig af Claude-mod-events, så API-adapters kan skiftes. Mod-runtime har et begrænset execution environment: brug dokumenterede `$`-interfaces fremfor at antage Node globals i en mod.

**Branding:** Behold 'SessionRelay' som arbejdstitel; foretag navn/domæne/package availability-check før release. Ingen antydning af officiel Anthropic-tilknytning.

---

## 18. Instructions to the planning agent (deliverables)

**Your job is to convert this PRD into an executable engineering plan, not to implement it yet.**

1. **Read all requirements.** Preserve product principles, must-have Cursor UX, default 50 %, genuine fresh sessions, existing permissions and open-source distribution.
2. **Research the current installed Claude Code version and authoritative API typings/docs.** Validate every relied-on API against source and a minimal proof of concept. Do not treat previous assistant answers or this document's illustrative commands as implementation facts.
3. **Start with technical feasibility spikes** and deliver an ADR comparing mod-only, mod+supervisor and assisted mode. Mark blocking unknowns explicitly.
4. **Create prioritized epics** with goal, scope, architecture dependencies, user value, risks, acceptance criteria, dependencies and demonstrable completion artifacts. Do not create unrelated features.
5. **Break epics into small implementation stories/tasks** with identifiers, prerequisites, detailed acceptance criteria, test cases, estimated complexity (S/M/L), touched modules, and Definition of Done. Deliver tasks in dependency order.
6. **Create a delivery plan by milestones**, with clear gates: Feasibility → Foundation → Handover → Fresh session → Continuation → Recovery/safety → UX/distribution → Public beta.
7. **Create architecture diagrams and contracts:** state machine, sequence diagrams, data schemas, adapter APIs, concurrency model, recovery plan and compatibility matrix.
8. **Create a testing plan:** which AC maps to unit, integration, PTY or manual Cursor E2E; include test-fixture definitions and how to produce evidence.
9. **Create a risk register and decision log** with explicit owner, likelihood/impact, mitigation and open questions.
10. **Recommend the smallest viable release** that honestly delivers the core promise, plus P1/P2 backlog. Reject complexity that does not reduce user friction or failure risk.

### Required output format

```text
00-executive-plan.md
01-technical-feasibility.md
02-architecture-and-adrs.md
03-epics.md
04-backlog-stories.md
05-delivery-milestones.md
06-test-and-acceptance-plan.md
07-risks-and-open-questions.md
08-open-source-release-plan.md
```

Each epic/story must cite the relevant **FR**, **AC** and **NFR** identifiers from this document. The planning agent may propose revisions, but must list them separately as `Proposed PRD changes` with justification; do **not** silently lower requirements.

**Stop point for the planning agent:** Produce the above planning artifacts and a concise go/no-go recommendation. **Do not modify the user's projects or implement SessionRelay until the plan/architecture is approved.**

---

## 19. Official sources and research references

Checked 7 November 2026. APIs may change; re-check before implementation.

1. **Claude Code Mods announcement (Anthropic):** https://claude.com/resources/articles/claude-code-mods
2. **Getting started with Claude Code Mods (Claude.dev):** https://claude.dev/blog/getting-started-with-claude-code-mods/
3. **Anthropic's published built-in mods source:** https://github.com/anthropics/claude-code/tree/main/mods
4. **Claude Code CLI reference:** https://code.claude.com/docs/en/cli-reference
5. **Claude Code status line reference and context-window fields:** https://code.claude.com/docs/en/statusline
6. **Claude Code hooks reference:** https://code.claude.com/docs/en/hooks
7. **Agent SDK overview:** https://code.claude.com/docs/en/agent-sdk/overview
8. **Agent SDK sessions:** https://code.claude.com/docs/en/agent-sdk/sessions
9. **Settings scope and precedence:** https://code.claude.com/docs/en/settings
10. **Claude Code legal/compliance and naming guidance:** https://code.claude.com/docs/en/legal-and-compliance

---

## 20. Final product acceptance statement

**MVP'en er en succes når:** En developer kan åbne Cursors integrerede terminal, aktivere SessionRelay med minimal setup, igangsætte en længere Claude Code-opgave og se tool'et gennemføre mindst to sikre, dokumenterede **ægte nye sessions** med valideret handover og automatisk fortsættelse — mens den normale Claude Code-oplevelse og alle brugerens permissions bevares. Arbejdet skal ende i et kontrollerbart resultat eller en tydelig, recoverable pause, aldrig i stille datatab eller usande completed-statusser.

**Hvis den nødvendige native/interactive API endnu ikke gør dette forsvarligt muligt:** Arkitekturspiken skal gøre det synligt før implementation, og scope/claims skal ændres eksplicit i stedet for at levere en skrøbelig, uofficiel workaround.
