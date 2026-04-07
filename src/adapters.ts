import { asString, allowResponse, denyResponse } from "./utils";

export interface ApprovalRequest {
  agent: string; // e.g. "claude", "copilot", "gemini"
  hook_type: string; // PermissionRequest, PostToolUse, Stop, etc.
  session_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  terminal_info?: Record<string, unknown>;
  cwd?: string;
  transcript_path?: string;
  raw_payload?: Record<string, unknown>;
  // Extra info can be attached (e.g. _old_content) and will be sent to the frontend
  [key: string]: unknown;
}

export interface Adapter {
  id: string;
  detect?: (raw: Record<string, unknown>) => boolean;
  normalize: (raw: Record<string, unknown>) => ApprovalRequest;
  formatDecision: (decision: string) => unknown | null; // return null to send empty response
  installHooks?: (shimPath: string) => Promise<void>;
  uninstallHooks?: () => Promise<void>;
}

const registry: Record<string, Adapter> = {};

export function registerAdapter(adapter: Adapter) {
  registry[adapter.id] = adapter;
}

export function getAdapter(agent?: string, raw?: Record<string, unknown>): Adapter {
  if (agent && registry[agent]) return registry[agent];
  for (const a of Object.values(registry)) {
    if (a.detect && raw && a.detect(raw)) return a;
  }
  // Fallback to Claude adapter if present
  if (registry["claude"]) return registry["claude"];
  throw new Error("No adapter registered");
}

// ----------------------
// Claude adapter (default)
// ----------------------

const claudeAdapter: Adapter = {
  id: "claude",
  detect(raw) {
    // Heuristic: Claude PermissionRequest payloads include session_id and tool_name
    return typeof raw?.session_id === "string" || typeof raw?.tool_name === "string";
  },
  normalize(raw) {
    const r = raw as Record<string, unknown>;
    return {
      agent: "claude",
      hook_type: asString(r["hookEventName"], "PermissionRequest"),
      session_id: asString(r["session_id"]),
      tool_name: asString(r["tool_name"]),
      tool_input: r["tool_input"],
      terminal_info: (r["terminal_info"] ?? {}) as Record<string, unknown>,
      cwd: asString(r["cwd"]),
      transcript_path: asString(r["transcript_path"]),
      raw_payload: r,
    };
  },
  formatDecision(decision: string) {
    if (decision === "allow") return allowResponse();
    if (decision === "dismiss") return null;
    // any other string -> deny with message ("deny" or custom message)
    if (decision === "deny") return denyResponse();
    return denyResponse(decision);
  },
};

registerAdapter(claudeAdapter);

const copilotAdapter: Adapter = {
  id: "copilot",
  detect(raw) {
    return typeof raw?.agent === "string" && (raw.agent as string) === "copilot";
  },
  normalize(raw) {
    const r = raw as Record<string, unknown>;
    return {
      agent: "copilot",
      hook_type: asString(r["hookEventName"], "PermissionRequest"),
      session_id: asString(r["session_id"] ?? r["sessionId"] ?? r["session"]),
      tool_name: asString(r["tool_name"] ?? r["tool"]),
      tool_input: r["tool_input"] ?? r["input"],
      terminal_info: (r["terminal_info"] ?? {}) as Record<string, unknown>,
      cwd: asString(r["cwd"] ?? r["working_dir"] ?? r["cwd"]),
      transcript_path: asString(r["transcript_path"]),
      raw_payload: r,
    };
  },
  formatDecision(decision: string) {
    // Copilot CLI preToolUse expects: { permissionDecision: "allow"|"deny"|"ask", permissionDecisionReason?: string }
    if (decision === "allow") return { permissionDecision: "allow" };
    if (decision === "dismiss") return null;
    if (decision === "deny") return { permissionDecision: "deny", permissionDecisionReason: "Denied by user" };
    return { permissionDecision: "deny", permissionDecisionReason: decision };
  },
};

registerAdapter(copilotAdapter);

const geminiAdapter: Adapter = {
  id: "gemini",
  detect(raw) {
    return typeof raw?.agent === "string" && (raw.agent as string) === "gemini";
  },
  normalize(raw) {
    const r = raw as Record<string, unknown>;
    return {
      agent: "gemini",
      hook_type: asString(r["hookEventName"], "PermissionRequest"),
      session_id: asString(r["session_id"] ?? r["sessionId"] ?? r["session"]),
      tool_name: asString(r["tool_name"] ?? r["tool"]),
      tool_input: r["tool_input"] ?? r["input"],
      terminal_info: (r["terminal_info"] ?? {}) as Record<string, unknown>,
      cwd: asString(r["cwd"] ?? r["working_dir"] ?? r["cwd"]),
      transcript_path: asString(r["transcript_path"]),
      raw_payload: r,
    };
  },
  formatDecision(decision: string) {
    // Gemini CLI expects a JSON decision (e.g. { decision: "deny", reason: "..." }) and uses exit codes for severity.
    if (decision === "allow") return { decision: "allow" };
    if (decision === "dismiss") return null;
    if (decision === "deny") return { decision: "deny", reason: "Denied by user" };
    return { decision: "deny", reason: decision };
  },
};

registerAdapter(geminiAdapter);

export function listAdapters(): string[] {
  return Object.keys(registry);
}
