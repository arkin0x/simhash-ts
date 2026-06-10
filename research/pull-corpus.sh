#!/bin/bash
# Pull a real nostr corpus for research/collision-study.js.
#
# Requires `nak` (https://github.com/fiatjaf/nak) and relay access. Output is one
# JSON object per line: {"c": "<event content>"}. Non-deterministic: the corpus
# changes every run, which is fine for a research study and is exactly why this
# is NOT part of the test suite.
#
# Usage:
#   research/pull-corpus.sh [outfile] [kind] [pages]
#   research/pull-corpus.sh research/articles.jsonl 30023 12   # long-form (default)
#   research/pull-corpus.sh research/notes.jsonl    1     10   # short notes
set -euo pipefail

OUT="${1:-research/corpus.jsonl}"
KIND="${2:-30023}"
PAGES="${3:-12}"
RELAYS="wss://relay.damus.io wss://nos.lol wss://relay.primal.net wss://relay.nostr.band"
LIMIT=1000
[ "$KIND" = "1" ] && LIMIT=3000

command -v nak >/dev/null || { echo "nak not found (https://github.com/fiatjaf/nak)" >&2; exit 1; }

: > "$OUT"
UNTIL=$(date +%s)
for _ in $(seq 1 "$PAGES"); do
  BATCH=$(nak req -k "$KIND" --until "$UNTIL" -l "$LIMIT" $RELAYS 2>/dev/null || true)
  CNT=$(printf '%s' "$BATCH" | grep -c '^{' || true)
  [ "$CNT" -eq 0 ] && break
  printf '%s\n' "$BATCH" | jq -c 'select(.content!=null and (.content|length)>0)|{c:.content}' >> "$OUT"
  OLD=$(printf '%s' "$BATCH" | jq -s 'min_by(.created_at)|.created_at')
  { [ "$OLD" = "null" ] || [ "$OLD" = "$UNTIL" ]; } && break
  UNTIL=$OLD
done
echo "wrote $(wc -l < "$OUT") lines to $OUT (kind $KIND)"
