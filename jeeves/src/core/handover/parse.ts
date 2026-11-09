// Handover parser (ST-3.5, FR-07): finds exactly one sentinel block in Claude's last message and splits it into
// its sections (seven; a v1 block has six, without Current goal). Tolerant of CRLF, code fences, prose around the block, heading case and spacing. Pure; line-based
// (no backtracking regex over the whole text), so it never throws and stays linear on any input.
import { CLOSE, GOAL, GOAL_BULLETS_MAX, GOAL_CHARS_MAX, HEADINGS } from './template.ts'

export type Heading = (typeof HEADINGS)[number]
export type Tag = 'verified' | 'inferred' | 'unknown'
export type Item = { tag: Tag | null; text: string; numbered: boolean }
export type Narrative = {
  taskId: string | null
  rotationId: string | null
  /** The block between its first and last line, LF line ends. */
  body: string
  sections: Record<Heading, Item[]>
}

export type ParseCode =
  | 'NO_BLOCK' | 'MULTIPLE_BLOCKS' | 'UNCLOSED' | 'MISSING_HEADING' | 'DUPLICATE_HEADING'
  | 'EMPTY_SECTION' | 'NO_BULLET' | 'NO_NUMBERED_ACTION' | 'UNTAGGED' | 'GOAL_BULLETS' | 'GOAL_TOO_LONG'
export type ParseError = { code: ParseCode; message: string }
export type ParseResult = { ok: true; value: Narrative } | { ok: false; errors: ParseError[] }

const OPEN_RE = /^\s*(?:`{3,}\w*\s*)?<<<\s*JEEVES-HANDOVER\s+v1\b(.*)$/i
const CLOSE_RE = /^\s*JEEVES-HANDOVER\s*>>>/i
// Trailing spaces, #s and colons are dropped by key(), so the pattern needs no backtracking tail.
const HEADING_RE = /^\s{0,3}#{2,3}\s+(.*)$/
const ITEM_RE = /^\s*(?:([-*•+])|(\d+)[.)])\s+(.*)$/
const TAG_RE = /\[(verified|inferred|unknown)\]/i
const FENCE_RE = /^\s*`{3,}/

/** Letters and digits only, lower case: "Do not repeat / do not change:" and "do not repeat/do not change" are one key. */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const BY_KEY = new Map<string, Heading>(HEADINGS.map(h => [key(h), h]))

const attr = (line: string, name: string) => new RegExp(`\\b${name}=(\\S+)`).exec(line)?.[1] ?? null

/**
 * `requireGoal` false: a v1 block without "Current goal" parses, with that section empty (ST-13.6). Only a new handover
 * of a task created after the upgrade is held to the seventh heading; files Jeeves already wrote are read leniently.
 */
export function parseHandover(text: string, opts: { requireGoal?: boolean } = {}): ParseResult {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const opens = lines.flatMap((l, i) => (OPEN_RE.test(l) ? [i] : []))
  if (opens.length === 0) return fail('NO_BLOCK', `no "<<<JEEVES-HANDOVER v1" line found; reply with one block whose last line is ${CLOSE}`)
  if (opens.length > 1) return fail('MULTIPLE_BLOCKS', `found ${opens.length} handover blocks; reply with exactly one`)
  const start = opens[0]!
  const end = lines.findIndex((l, i) => i > start && CLOSE_RE.test(l))
  if (end < 0) return fail('UNCLOSED', `the handover block has no closing "${CLOSE}" line`)

  const header = OPEN_RE.exec(lines[start]!)![1]!
  const bodyLines = lines.slice(start + 1, end)
  const sections = new Map<Heading, string[]>()
  const errors: ParseError[] = []
  let current: string[] | null = null
  for (const line of bodyLines) {
    const h = HEADING_RE.exec(line)
    if (h) {
      const heading = BY_KEY.get(key(h[1]!))
      if (heading && sections.has(heading)) errors.push({ code: 'DUPLICATE_HEADING', message: `section "## ${heading}" appears twice` })
      // An unknown heading's lines are dropped, never added to the section before it.
      current = heading && !sections.has(heading) ? [] : null
      if (current && heading) sections.set(heading, current)
      continue
    }
    if (current && !FENCE_RE.test(line)) current.push(line)
  }

  const out = {} as Record<Heading, Item[]>
  let untagged = 0
  for (const h of HEADINGS) {
    const raw = sections.get(h)
    if (raw === undefined && h === GOAL && !opts.requireGoal) { out[h] = []; continue }
    if (raw === undefined) { errors.push({ code: 'MISSING_HEADING', message: `missing section "## ${h}"` }); out[h] = []; continue }
    const items = toItems(raw)
    out[h] = items
    if (raw.every(l => !l.trim())) errors.push({ code: 'EMPTY_SECTION', message: `section "## ${h}" is empty; write "- [verified] none" if there is nothing` })
    else if (!items.length) errors.push({ code: 'NO_BULLET', message: `section "## ${h}" has no bullet` })
    else if (h === 'Exact next actions' && !items.some(i => i.numbered)) errors.push({ code: 'NO_NUMBERED_ACTION', message: '"## Exact next actions" needs a numbered item ("1. ...")' })
    if (h === GOAL && items.length > GOAL_BULLETS_MAX) errors.push({ code: 'GOAL_BULLETS', message: `"## ${GOAL}" has ${items.length} bullets; write 1 or ${GOAL_BULLETS_MAX}` })
    const long = h === GOAL ? items.filter(i => i.text.length > GOAL_CHARS_MAX).length : 0
    if (long) errors.push({ code: 'GOAL_TOO_LONG', message: `${long} "## ${GOAL}" bullet(s) are over ${GOAL_CHARS_MAX} characters; shorten them` })
    untagged += items.filter(i => i.tag === null).length
  }
  if (untagged) errors.push({ code: 'UNTAGGED', message: `${untagged} bullet(s) lack a [verified], [inferred] or [unknown] tag` })
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { taskId: attr(header, 'task'), rotationId: attr(header, 'rotation'), body: bodyLines.join('\n'), sections: out } }
}

/** Bullet and numbered lines; an indented or plain line after one continues it. */
function toItems(lines: string[]): Item[] {
  const items: Item[] = []
  for (const line of lines) {
    const m = ITEM_RE.exec(line)
    if (m) {
      const text = m[3]!.trim()
      const tag = TAG_RE.exec(text)?.[1]?.toLowerCase() as Tag | undefined
      items.push({ tag: tag ?? null, text, numbered: m[2] !== undefined })
    } else if (line.trim() && items.length) {
      const last = items[items.length - 1]!
      last.text = `${last.text} ${line.trim()}`
    }
  }
  return items
}

const fail = (code: ParseCode, message: string): ParseResult => ({ ok: false, errors: [{ code, message }] })
