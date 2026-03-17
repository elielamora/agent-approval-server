# claude-approval-server

HTTP approval server for Claude Code's `PermissionRequest` hook. Blocks tool calls until approved or denied via a web UI.

## How it works

1. Claude Code fires a `PermissionRequest` HTTP hook to `POST /pending`
2. The server holds the connection open (up to 10 minutes), queuing the item
3. A macOS notification appears via `alerter` — you can approve/deny directly from the notification
4. The item also appears in the web UI at `http://localhost:4759`, where you can approve/deny or request an AI explanation of the tool call
5. The server responds to the hook, unblocking Claude

You can still approve the request from Claude Code's own CLI prompt instead of the web UI or notification. When you do, the `PostToolUse` hook fires, and the server automatically clears the now-stale pending item so it doesn't linger in the queue.

If no decision is made within 10 minutes, the request is auto-denied.

## Prerequisites

```sh
brew install vjeantet/tap/alerter
```

## Run (dev)

```sh
bun run index.ts
```

UI: http://localhost:4759
Health: http://localhost:4759/health

## Hook configuration

Already added to `~/.claude/settings.json`:

```json
"hooks": {
  "PermissionRequest": [{
    "hooks": [{ "type": "http", "url": "http://localhost:4759/pending", "timeout": 600 }]
  }],
  "PostToolUse": [{
    "hooks": [{ "type": "http", "url": "http://localhost:4759/post-tool-use", "timeout": 5 }]
  }]
}
```

`PermissionRequest` — Claude waits up to 10 minutes for approval. If the server is unreachable, Claude falls back to its normal approval prompt.

`PostToolUse` — fires after each tool runs. If you approved a request from the CLI prompt (bypassing the web UI), this clears the stale pending item from the queue automatically.

## Install as a persistent background service (launchd)

Copy the plist to the LaunchAgents directory and load it:

```sh
cp com.pwagenet.claude-approval.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.pwagenet.claude-approval.plist
```

Check it's running:

```sh
launchctl list | grep claude-approval
curl http://localhost:4759/health
```

Logs:
- stdout: `/tmp/claude-approval.log`
- stderr: `/tmp/claude-approval.error.log`

### Stop / unload

```sh
launchctl unload ~/Library/LaunchAgents/com.pwagenet.claude-approval.plist
```

### Restart after changes

```sh
launchctl unload ~/Library/LaunchAgents/com.pwagenet.claude-approval.plist
cp com.pwagenet.claude-approval.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.pwagenet.claude-approval.plist
```

