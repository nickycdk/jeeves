// The seams the adapter needs from the engine (02 §3). Storage only uses FsPort, so it also runs on real Node fs in tests.

export type ProcResult = { exitCode: number; stdout: string; stderr: string }
export type RunOptions = { cwd?: string; timeoutMs?: number; env?: Record<string, string> }

/** The only environment variables Jeeves reads (the engine wants literal names). */
export type EnvName = 'HOME' | 'XDG_STATE_HOME' | 'CLAUDE_PLUGIN_DATA' | 'JEEVES_TEST' | 'JEEVES_STATE_DIR' | 'JEEVES_TEST_THRESHOLD_OVERRIDE'

export interface FsPort {
  /** Whole file as UTF-8 text; rejects when it does not exist. */
  read(path: string): Promise<string>
  /** Whole-file write; creates missing parent directories. */
  write(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** Names of the directories directly under `path`; [] when it does not exist. */
  listDirs(path: string): Promise<string[]>
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
  usage(): Promise<Usage>
  runCommand(name: 'clear'): Promise<void>
  submitPrompt(text: string): Promise<void>
  /** Submit once the current hook has returned (a command.run hook may not submit: it holds the turn). */
  submitPromptSoon(text: string, onError: (err: unknown) => void): void
  appendHiddenNote(text: string): Promise<void>
  /** Subagents and teammates whose loop is `running` now (ADR-004). */
  runningAgents(): Promise<number>
  status(text?: string): void
  toast(text: string): void
  log(text: string): void
  now(): Promise<number>
  /** True only the first time it is asked on this machine (a `$.store` flag), so a notice shows once. */
  firstActivation(): Promise<boolean>
}
