#!/bin/zsh
# S-01 helper. Run inside Cursor's integrated terminal:
#   zsh docs/plans/evidence/s-01-cursor/run-s01.sh          # setup + launch claude
#   zsh docs/plans/evidence/s-01-cursor/run-s01.sh collect  # after you exit claude: save redacted log + versions
set -e
E="${0:A:h}"
STATE=/tmp/s01-cursor.last

if [[ "$1" == "collect" ]]; then
  WORK=$(cat "$STATE")
  sed -e "s#$WORK#<work>#g" -e "s#$HOME#<home>#g" "$WORK/log.jsonl" > "$E/events.jsonl"
  { echo "claude: $(claude --version)"; echo "macOS: $(sw_vers -productVersion)"; echo "cursor: $(cursor --version 2>/dev/null | head -1 || echo 'see Cursor > About')"; } > "$E/versions.txt"
  echo "Saved $E/events.jsonl and versions.txt. Rotation lines:"
  grep -E '"ev":"(session.end|classic.SessionStart|clear.resolved|submit.resolved)"' "$E/events.jsonl" || echo "  (none: rotation did not happen)"
  echo "Now paste your pass/fail notes to Claude to write RESULT.md, then: rm -rf $WORK"
  exit 0
fi

WORK=$(mktemp -d /tmp/s01-cursor.XXXX); echo "$WORK" > "$STATE"
cp -R "$E/mod" "$WORK/mod"
mkdir "$WORK/repo" && cd "$WORK/repo"
git init -q -b main && echo hello > a.txt && git add . && git -c user.email=s@x -c user.name=spike commit -qm init
cat <<'TXT'

S-01 checks — do all 7 BEFORE and AFTER typing /srspike:
  1 type while Claude answers   2 resize pane narrow/wide   3 Ctrl+C at idle, Esc mid-reply
  4 "Run the Bash command touch perm_a.txt" -> Yes; "...perm_b.txt" -> No
  5 paste: æøå 🙂 漢字   6 /help /config /mcp (Esc each), Up-arrow history   7 status shows next to your status line
Rotate: /srspike -> expect BETA / NONE / DELTA and "session 2".  Exit: Ctrl+C twice, then run with "collect".

TXT
SRSPIKE_LOG="$WORK/log.jsonl" exec claude --plugin-dir "$WORK/mod" --model haiku --permission-mode default
