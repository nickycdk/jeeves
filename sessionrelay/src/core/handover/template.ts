// Text SessionRelay hands to Claude (ADR-003, ADR-004). Pure.

/** The one hidden note per rotation, at the first main-loop tool result after the threshold (S-03: 5/5, no further tool calls). */
export const QUIESCE_NOTE = 'SessionRelay: the context threshold was reached. Finish the step you are on, do not start any new step or tool call, and end your turn now with a one-line summary of what is done and what is left.'
