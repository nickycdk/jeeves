#!/bin/sh
# Release artifact (ST-9.3): the marketplace file, the plugin folder and the root README of one commit, as a zip with
# its SHA-256. `git archive -0` stores files uncompressed with the commit's time, so the same commit gives the same
# bytes on any machine. The planning documents are not included.
# Usage: jeeves/scripts/release-zip.sh [commit (default HEAD)] [output folder (default dist)]
set -e
ref=${1:-HEAD}
out=${2:-dist}
cd "$(git rev-parse --show-toplevel)"
v=$(git show "$ref:jeeves/.claude-plugin/plugin.json" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).version)')
name="jeeves-$v"
mkdir -p "$out"
git archive --format=zip -0 --prefix="$name/" -o "$out/$name.zip" "$ref" .claude-plugin jeeves README.md
(cd "$out" && shasum -a 256 "$name.zip" > "$name.zip.sha256" && cat "$name.zip.sha256")
