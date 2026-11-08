// Identity derivation (02 §6.1). Pure: hashing and randomness are passed in.

/** What projectId hashes: realpath(git common dir) | realpath(worktree root); non-git dirs hash their cwd. */
export function projectKey(id: { commonDir: string; worktree: string } | { cwd: string }): string {
  return 'commonDir' in id ? `${id.commonDir}|${id.worktree}` : `nogit|${id.cwd}`
}

export const projectIdFromHash = (sha256Hex: string) => sha256Hex.slice(0, 16)

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'
const base32 = (bytes: Uint8Array, n: number) => Array.from(bytes.slice(0, n), b => BASE32[b % 32]).join('')
const ymd = (nowMs: number) => new Date(nowMs).toISOString().slice(0, 10).replaceAll('-', '')

/** "t_" + yyyymmdd + "_" + 6 base32 chars, from 6 random bytes. */
export const newTaskId = (nowMs: number, random: Uint8Array) => `t_${ymd(nowMs)}_${base32(random, 6)}`
export const newRotationId = (nowMs: number, random: Uint8Array) => `r_${ymd(nowMs)}_${base32(random, 6)}`
