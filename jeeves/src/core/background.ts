// Turn mode's own record of background work (ADR-004 A2): no event outside `classic.*` lists it. Pure.

/** Ids of work a main-loop tool call started in the background and no notification has ended yet. */
export type Background = readonly string[]

/** `tool.call` answered with a `backgroundTaskId`. */
export const started = (b: Background, id: string): Background => (b.includes(id) ? b : [...b, id])

/**
 * A `prompt.submit` with origin `task-notification`. Live (2.1.319) its text names the task (`<task-id>…</task-id>`):
 * that id goes. Without an id the oldest goes (the ADR's count, clamped at zero); an id never started here (a
 * subagent's, or work from before counting began) changes nothing.
 */
export function notified(b: Background, text: string): Background {
  const id = /<task-id>([^<]+)<\/task-id>/.exec(text)?.[1]?.trim()
  return id === undefined ? b.slice(1) : b.filter(x => x !== id)
}
