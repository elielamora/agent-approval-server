#!/usr/bin/env bash
# Hook shim: enriches Claude Code hook payloads with terminal env vars,
# then forwards to the approval server via HTTP.
# Usage: hook-shim.sh <endpoint>  (e.g., "pending" or "post-tool-use")
# Requires: jq, curl

# When invoked from the explain subprocess, do nothing (avoids spurious idle sessions).
if [[ -n "$APPROVAL_SERVER_EXPLAIN" ]]; then
  exit 0
fi

ENDPOINT="${1:-pending}"
PORT="${PORT:-4759}"
PAYLOAD="$(cat)"

TERMINAL_INFO=$(jq -n \
  --arg term_program "${TERM_PROGRAM:-}" \
  --arg iterm_session_id "${ITERM_SESSION_ID:-}" \
  --arg ghostty_resources_dir "${GHOSTTY_RESOURCES_DIR:-}" \
  '{term_program: $term_program, iterm_session_id: $iterm_session_id, ghostty_resources_dir: $ghostty_resources_dir}')

AGENT="${AGENT:-claude}"
ENRICHED=$(echo "$PAYLOAD" | jq --argjson ti "$TERMINAL_INFO" --arg cwd "${PWD:-}" --arg agent "$AGENT" '. + {terminal_info: $ti, agent: $agent} | if (.cwd == null or .cwd == "") then . + {cwd: $cwd} else . end')

# Write sentinel for debugging hook invocations
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "$timestamp $ENDPOINT $AGENT $PWD" >> "/tmp/hook-invoked-${AGENT}.log"
printf '%s\n' "$ENRICHED" >> "/tmp/hook-invoked-${AGENT}.log"

curl -sS --max-time 610 \
  -X POST -H 'Content-Type: application/json' \
  -d "$ENRICHED" \
  "http://localhost:${PORT}/$ENDPOINT"
