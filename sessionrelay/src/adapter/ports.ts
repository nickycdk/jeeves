// The seams the adapter needs from the engine (02 §3). Storage only uses FsPort, so it also runs on real Node fs in tests.

export type ProcResult = { exitCode: number; stdout: string; stderr: string }
export type RunOptions = { cwd?: string; timeoutMs?: number }

export interface FsPort {
  /** Whole file as UTF-8 text; rejects when it does not exist. */
  read(path: string): Promise<string>
  /** Whole-file write; creates missing parent directories. */
  write(path: string, text: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** A host command by argv, no shell. */
  run(argv: string[], opts?: RunOptions): Promise<ProcResult>
  env(name: string): Promise<string | undefined>
}
