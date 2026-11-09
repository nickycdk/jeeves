// The seams the adapter needs from the engine (02 §3). Storage only uses FsPort, so it also runs on real Node fs in tests.

export type ProcResult = { exitCode: number; stdout: string; stderr: string }
export type RunOptions = { cwd?: string; timeoutMs?: number; env?: Record<string, string> }

/** The only environment variables Jeeves reads (the engine wants literal names). */
export type EnvName = 'HOME' | 'XDG_STATE_HOME' | 'CLAUDE_PLUGIN_DATA' | 'JEEVES_TEST' | 'JEEVES_STATE_DIR' | 'JEEVES_TEST_THRESHOLD_OVERRIDE' | 'JEEVES_TEST_CRASH'

export interface FsPort {
  /** Whole file as UTF-8 text; rejects when it does not exist. */
  read(path: string): Promise<string>
  /** Whole-file write; creates missing parent directories. */
  write(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** Names of the directories directly under `path`; [] when it does not exist. */
  listDirs(path: string): Promise<string[]>
  /** Names of the files directly under `path`; [] when it does not exist. */
  listFiles(path: string): Promise<string[]>
  /** Every symbolic link and `..` resolved; null when the path does not exist. */
  realPath(path: string): Promise<string | null>
  /** Last modification in ms, or null when the path does not exist. */
  mtimeMs(path: string): Promise<number | null>
  /** A host command by argv, no shell. */
  run(argv: string[], opts?: RunOptions): Promise<ProcResult>
  env(name: EnvName): Promise<string | undefined>
}

export type Usage = { percent?: number; tokens?: number; window: number }

/** Everything the core's effects need from the engine. */
export interface EnginePort extends FsPort {
  version(): Promise<{ version: string; base?: string }>
  sessionId(): Promise<string>
  cwd(): Promise<string>
  /** Turns in the main conversation so far (`$.session.turns()`). */
  turns(): Promise<number>
  usage(): Promise<Usage>
  /** Tokens at which auto-compaction runs (a local estimate, no model call), or null when it is off or unknown. */
  autoCompactTokens(): Promise<number | null>
  /** When the most used rate-limit window resets (ISO), or null when unknown. */
  rateLimitReset(): Promise<string | null>
  /** This conversation's cost so far in US$, or null when unknown. */
  costUsd(): Promise<number | null>
  runCommand(name: 'clear'): Promise<void>
  /** Run `fn` once the current hook has returned (`$.clock.after`). */
  after(ms: number, fn: () => void): void
  submitPrompt(text: string): Promise<void>
  /** Submit once the current hook has returned (a command.run hook may not submit: it holds the turn). */
  submitPromptSoon(text: string, onError: (err: unknown) => void): void
  appendHiddenNote(text: string): Promise<void>
  /** Subagents and teammates whose loop is `running` now (ADR-004). */
  runningAgents(): Promise<number>
  status(text?: string): void
  toast(text: string): void
  log(text: string): void
  /** One dim transcript line the user sees and the model does not (`$.ui.log`). */
  note(text: string): void
  now(): Promise<number>
  /** This plugin's version from its plugin.json, or null when unreadable. */
  pluginVersion(): Promise<string | null>
  /**
   * True only the first time it is asked on this machine, so the `/jeeves on` notice shows once. v0.3 keeps it under its
   * own store key: `firstActivationShown` is only ever read, so it keeps meaning "v0.2 was activated here" (ST-13.2).
   */
  firstActivation(): Promise<boolean>
  /** The plugin store (`$.store`), across sessions. */
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
}
