#!/usr/bin/env bash
set -euo pipefail

# Simple smoke test to validate local Copilot hook integration with the approval server.
# - Posts a synthetic Copilot preToolUse payload (agent=copilot) to /pending via the agent-shim
# - Polls /queue for the created item using the session_id
# - POSTs an allow decision to /decide/<id>
# - Prints the shim's response

command -v curl >/dev/null 2>&1 || { echo "curl required"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq required"; exit 1; }

SESSION_ID="test-$(date +%s)-$RANDOM"

PAYLOAD=$(jq -n \
  --arg agent "copilot" \
  --arg session_id "$SESSION_ID" \
  --arg cwd "$PWD" \
  --arg toolName "bash" \
  --arg toolArgs '{"command":"echo hi"}' \
  '{agent:$agent, session_id:$session_id, cwd:$cwd, toolName:$toolName, toolArgs:$toolArgs}')

echo "Using session_id=$SESSION_ID"

echo "$PAYLOAD" | ./scripts/agent-shim.sh copilot pending > /tmp/agent_shim_response.json 2>/tmp/agent_shim_err.log &
SHIM_PID=$!

echo "Started agent shim (pid=$SHIM_PID), waiting for pending item..."

id=""
for i in $(seq 1 20); do
  id=$(curl -s http://localhost:4759/queue | jq -r --arg sid "$SESSION_ID" '.[] | select(.session_id==$sid) | .id' | head -n1)
  if [ -n "$id" ] && [ "$id" != "null" ]; then
    echo "Found pending id: $id"
    break
  fi
  sleep 0.5
done

if [ -z "$id" ] || [ "$id" = "null" ]; then
  echo "Timed out waiting for pending item. Check server is running at http://localhost:4759"
  kill "$SHIM_PID" 2>/dev/null || true
  exit 1
fi

# Approve the request
echo "Approving pending id=$id"
curl -s -X POST -H 'Content-Type: application/json' -d '{"decision":"allow"}' "http://localhost:4759/decide/$id" >/dev/null || true

# Wait for shim to exit and show response
wait "$SHIM_PID" || true

echo "--- agent-shim stdout ---"
cat /tmp/agent_shim_response.json || true

echo "--- agent-shim stderr ---"
cat /tmp/agent_shim_err.log || true

echo "Test complete."
