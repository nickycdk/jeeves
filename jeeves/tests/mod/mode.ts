// The /config row `autoStart` every mod test runs under unless it sets its own (spec §9: the suite runs twice, off and on).
// `npm run test:mod` runs it as written here; `npm run test:mod:on` runs a copy with 'on' (scripts/test-mod-on.sh, CI).
export const AUTO_START: 'off' | 'on' = 'off'
