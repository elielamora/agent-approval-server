# claude-approval-server

Approval server for Claude Code hooks. Intercepts tool calls and presents them for review in a web UI, and tracks idle sessions so you can check whether more work is needed.

## How it works

**Approvals:**

1. Claude Code fires a `PermissionRequest` hook — a shell shim enriches the payload with terminal environment info and forwards it to `POST /pending`
2. The server queues the item and holds the connection open
3. A browser notification appears — clicking it focuses the web UI tab
4. The item appears in the web UI at `http://localhost:4759`, where you can approve/deny, request an AI explanation, or focus the originating terminal window
5. The server responds to the hook with the decision

You can also approve or deny from Claude Code's own CLI prompt. When you do, the `PostToolUse` hook fires and the server automatically clears the stale pending item.

If no decision is made before the hook times out, the server closes the connection and Claude falls back to its normal CLI permission prompt.

**AskUserQuestion:**

When Claude uses `AskUserQuestion`, the web UI shows the question text and available options as read-only context. Use **Focus** to bring the terminal forward and answer there, or **Dismiss** to acknowledge and clear the card. The card also clears automatically when the next tool call from that session arrives.

**Plan review (ExitPlanMode / EnterPlanMode):**

When Claude enters or exits plan mode, the web UI highlights the card and opens a full-screen modal showing the plan. Use **Approve Plan** to let Claude proceed or **Deny** to reject it.

**Terminal focus:**

The hook shim captures terminal environment variables (`TERM_PROGRAM`, `ITERM_SESSION_ID`, `GHOSTTY_RESOURCES_DIR`) and includes them in the payload. The web UI shows a Focus button on each card that activates the originating terminal window via AppleScript. Supported terminals:

- **iTerm2** — focuses the exact session (tab + split) using the session's unique ID
- **Ghostty** (1.3+) — matches by working directory to find the right window/tab
- **VSCode** — uses `open -a` with the git root directory, which switches to the correct Space and window

**Session tracking:**

When a Claude session ends, the `Stop` hook fires. The server records the finished session and shows it in the **Idle Sessions** column of the web UI. Each card displays the final assistant output from the session transcript, a Focus button to return to the terminal, and a Dismiss button to clear the card.

**Mobile (local network):**

The server listens on `0.0.0.0:4759`, so it's reachable from any device on your local network. Open `http://<your-mac-ip>:4759` on your phone or tablet to see the approval queue.

Cards that require terminal focus show a **Review on computer** button on mobile. Tapping it marks the card as snoozed and moves it to a **For Review** section — it stays visible on desktop for action there.

**Settings:**

Click the ⚙ button in the top-right corner to open Settings. You can choose between dark and light themes, toggle browser notifications on/off, and toggle whether approval notifications stay on screen until dismissed. Settings are saved to `~/.claude/claude-approval-server/settings.json` and persist across restarts.

## Prerequisites

```sh
brew install jq
```

## Install

```sh
brew tap wagenet/claude-approval-server https://github.com/wagenet/claude-approval-server
brew install claude-approval-server
brew services start claude-approval-server
```

After installing, configure Claude Code hooks:

```sh
claude-approval-server install-hooks
```

Restart Claude Code for hook changes to take effect.

The binary is self-contained — no bun or other runtime required.

## Update

```sh
brew upgrade claude-approval-server
brew services restart claude-approval-server
```

## SwiftBar integration (optional)

[SwiftBar](https://swiftbar.app) is a macOS menu bar app that runs scripts on a schedule. The integration shows a badge with the number of pending approvals in your menu bar and opens the web UI in a webview when clicked.

SwiftBar integration is automatic — if SwiftBar is installed (v2.0.0+), the server registers an ephemeral menu bar plugin on startup. No manual install step required. The plugin clears itself when the server shuts down.

When you install SwiftBar, you will need to `brew services restart claude-approval-server`.

## Commands

### Install and Uninstall Hooks

See [Hook configuration](#hook-configuration-reference) below to see what hooks will be installed.

```sh
claude-approval-server install-hooks   # Configure Claude Code hooks in ~/.claude/settings.json
claude-approval-server uninstall       # Remove Claude Code hooks
```

> [!NOTE]
> Re-run `install-hooks` if you clear `~/.claude/settings.json` or after upgrading.

### Running the Server

```sh
claude-approval-server serve           # Start the server (used by brew services)
claude-approval-server status          # Show server status
claude-approval-server logs            # Tail server logs
```

## Logs

- stdout: `/tmp/claude-approval.log`
- stderr: `/tmp/claude-approval.error.log`

## Run (dev)

See [CONTRIBUTING.md](CONTRIBUTING.md#dev-setup) for dev setup and port configuration.

## Hook configuration (reference)

`claude-approval-server install-hooks [agent]` installs the local hook shim and, when possible, configures the agent to call it. For Claude the command will merge entries into `~/.claude/settings.json`. For other agents the shim is installed and manual configuration instructions are printed.

The shim accepts an AGENT environment variable (defaults to `claude`) so the same script can be reused for other agents. Example shim invocation installed to `~/.claude/claude-approval-server/hook-shim.sh`:

```sh
# Default (Claude)
~/.claude/claude-approval-server/hook-shim.sh pending

# Or explicitly for Copilot
AGENT=copilot ~/.claude/claude-approval-server/hook-shim.sh pending
```

`claude-approval-server install-hooks` adds the following entries to `~/.claude/settings.json` for Claude:

```json
"hooks": {
  "PermissionRequest": [{
    "matcher": "",
    "hooks": [{
      "type": "command",
      "command": "~/.claude/claude-approval-server/hook-shim.sh pending",
      "timeout": 600
    }]
  }],
  "PostToolUse": [{
    "matcher": "",
    "hooks": [{
      "type": "command",
      "command": "~/.claude/claude-approval-server/hook-shim.sh post-tool-use",
      "timeout": 5
    }]
  }],
  "Stop": [{
    "matcher": "",
    "hooks": [{
      "type": "command",
      "command": "~/.claude/claude-approval-server/hook-shim.sh stop"
    }]
  }]
}
```

Note on multi-agent usage

- The server includes a pluggable adapter layer (claude, copilot, gemini) so a single approval server can accept and normalize requests from multiple agents.
- For agents that support hooks (Copilot, Gemini), configure their hooks to run the shim (see agent docs). Use `AGENT=<agent>` so the server knows which adapter to use.
- For agents without configurable hooks, consider using a wrapper script that posts the same JSON payload to `http://localhost:4759/pending` (setting `agent=<name>` in the body or using `AGENT=`) and then proceeds based on the approval response.
- UI: The web UI includes an agent dropdown in the top bar to filter the queue by agent, and each queue card has a "Raw" button to view the original hook payload for debugging and inspection.

Testing locally with Copilot

1. Install dependencies (jq, curl) and ensure Bun is available for server dev.
2. Start the server (API only):

   PORT=4759 bun --hot src/index.ts

   Or start full dev (API + UI):

   bun run dev

3. Make shims executable:

   chmod +x scripts/agent-shim.sh
   chmod +x scripts/test-copilot.sh

4. Quick smoke test (no Copilot required):

   ./scripts/test-copilot.sh

5. To exercise the real Copilot CLI, run the CLI from this repository (it will pick up .github/hooks/hooks.json) and trigger a preToolUse event.

6. Confirm adapter list / status:

   curl http://localhost:4759/adapters | jq .
   curl http://localhost:4759/queue | jq .



`PermissionRequest` — if the server is unreachable or times out, the agent should fall back to its normal CLI approval prompt (behavior depends on the agent).

`PostToolUse` — fires after each tool runs. If you approved a request from the CLI prompt (bypassing the web UI), this clears the stale pending item from the queue automatically (Claude behavior).

`Stop` — fires when a session ends. The server records it in the Idle Sessions column until dismissed or until the 24-hour TTL expires.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the release process and dev setup.
