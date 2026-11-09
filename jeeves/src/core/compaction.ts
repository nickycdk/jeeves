// Turn mode's compaction signal (ADR-006 A1): `session.compact` is skipped there, so a sharp fall in the context
// reading stands for it. Pure.

/**
 * The fall, in tokens, that reads as a compaction. Live (2.1.319, spec §4 item 4) contexts only grow from reading to
 * reading; a typed `/compact` of a 12.8K-token conversation fell 12,315 (to the ~57.5K base), and a one-turn rewind gave
 * no reading at all. A compaction near any threshold falls by tens of thousands; a rewind of more than this many tokens
 * reads as one (one rotation that was not needed: harmless).
 */
export const COMPACTION_DROP = 10_000

/** A reading's size in tokens: its own count, else its percent of the window; null when neither is known. */
export const tokensOf = (r: { tokens?: number; percent?: number; window: number }): number | null =>
  r.tokens !== undefined ? r.tokens : r.percent !== undefined && r.window > 0 ? Math.round((r.percent * r.window) / 100) : null

/** The last reading of a session, for the next one to be compared with. */
export type Last = { sessionId: string; tokens: number } | null

/**
 * Whether `tokens` in `sessionId` after `last` is a compaction. Any /clear (Jeeves's or the user's) gives a new session
 * id, so a reading is only ever compared with one from the same conversation.
 */
export const isCompaction = (last: Last, sessionId: string, tokens: number | null): boolean =>
  last !== null && tokens !== null && last.sessionId === sessionId && last.tokens - tokens > COMPACTION_DROP
