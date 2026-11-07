#!/usr/bin/env bash
# Publish a finished case: scrub machine paths, run the health check, commit, push.
#
#   tools/publish_case.sh cases/<category>/<slug> "One-line summary of what was learned"
#
# Also commits skill/SKILL.md, LEARNING_MAP.md, README*.md and AGENT_SKILLS.md if the
# retrospective promoted rules into them. Pushes only when MOTION_AGENT_AUTO_PUBLISH=1
# or --push is given; otherwise it commits locally and prints the push command.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASE="${1:?usage: publish_case.sh cases/<category>/<slug> \"summary\" [--push]}"
SUMMARY="${2:?give a one-line summary}"
PUSH="${3:-}"
cd "$ROOT"

[ -f "$CASE/RECIPE.md" ] || { echo "Missing $CASE/RECIPE.md" >&2; exit 1; }
case "$CASE" in cases/_inbox/*) echo "Move the draft out of cases/_inbox/ into cases/<category>/ first." >&2; exit 1;; esac
if grep -q '<!-- Fill every section' "$CASE/RECIPE.md"; then
  echo "RECIPE.md still has the template comment; finish it first." >&2; exit 1
fi

# Scrub absolute home paths (any user) from text files in the case.
LC_ALL=C find "$CASE" -type f \( -name '*.md' -o -name '*.jsx' -o -name '*.js' -o -name '*.py' -o -name '*.json' -o -name '*.txt' \) \
  -exec sed -i '' -E 's#/Users/[^/"'"'"' ]+/#~/#g' {} +

# No media binaries in git (keep frames small: jpg/png evidence only).
if find "$CASE" -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.aep' -o -iname '*.wav' \) | grep -q .; then
  echo "Remove video/audio/.aep files from $CASE (keep frames only)." >&2; exit 1
fi

python3 tools/health_check.py >/dev/null || { echo "health_check failed" >&2; exit 1; }

git add "$CASE"
for f in skill/SKILL.md LEARNING_MAP.md README.md README.zh-CN.md AGENT_SKILLS.md; do
  [ -f "$f" ] && git add "$f"
done
git commit -q -m "Add case $(basename "$CASE"): $SUMMARY"
echo "Committed: $(git log --oneline -1)"

if [ "${MOTION_AGENT_AUTO_PUBLISH:-0}" = "1" ] || [ "$PUSH" = "--push" ]; then
  git push -q && echo "Pushed to $(git remote get-url origin)"
else
  echo "Not pushed. Run: git push   (or set MOTION_AGENT_AUTO_PUBLISH=1)"
fi
