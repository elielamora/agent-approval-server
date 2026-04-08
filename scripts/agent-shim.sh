#!/usr/bin/env bash
# Generic agent shim: enriches incoming hook payloads and forwards to the approval server.
# Usage: agent-shim.sh <agent> <endpoint>  (e.g., "copilot" "pending")
# Reads payload from stdin. Requires: jq, curl

AGENT_ARG="${1:-}" 
ENDPOINT="${2:-pending}"
PORT="${PORT:-4759}"
PAYLOAD="$(cat)"

TERMINAL_INFO=$(jq -n \
  --arg term_program "${TERM_PROGRAM:-}" \
  --arg iterm_session_id "${ITERM_SESSION_ID:-}" \
  --arg ghostty_resources_dir "${GHOSTTY_RESOURCES_DIR:-}" \
  '{term_program: $term_program, iterm_session_id: $iterm_session_id, ghostty_resources_dir: $ghostty_resources_dir}')

AGENT="${AGENT_ARG:-${AGENT:-claude}}"

ENRICHED=$(echo "$PAYLOAD" | jq --argjson ti "$TERMINAL_INFO" --arg cwd "${PWD:-}" --arg agent "$AGENT" '. + {terminal_info: $ti, agent: $agent} | if (.cwd == null or .cwd == "") then . + {cwd: $cwd} else . end')

# Write sentinel for debugging hook invocations
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "$timestamp $ENDPOINT $AGENT $PWD" >> "/tmp/hook-invoked-${AGENT}.log"
printf '%s\n' "$ENRICHED" >> "/tmp/hook-invoked-${AGENT}.log"

curl -sS --max-time 610 \
  -X POST -H 'Content-Type: application/json' \
  -d "$ENRICHED" \
  "http://localhost:${PORT}/${ENDPOINT}"
