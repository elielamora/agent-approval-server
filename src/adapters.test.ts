import { test, expect } from "bun:test";
import { getAdapter, listAdapters } from "./adapters";

test("adapters registered", () => {
  const adapters = listAdapters();
  expect(adapters.includes("claude")).toBe(true);
  expect(adapters.includes("copilot")).toBe(true);
  expect(adapters.includes("gemini")).toBe(true);
});

test("claude adapter normalize & formatDecision", () => {
  const payload = {
    session_id: "s1",
    tool_name: "Bash",
    tool_input: { command: "ls -la" },
    terminal_info: { term_program: "iTerm" },
  } as Record<string, unknown>;
  const adapter = getAdapter("claude", payload);
  const approval = adapter.normalize(payload);
  expect(approval.agent).toBe("claude");
  expect(approval.tool_name).toBe("Bash");
  const bodyAllow = adapter.formatDecision("allow");
  expect(bodyAllow).toBeTruthy();
  const bodyDismiss = adapter.formatDecision("dismiss");
  expect(bodyDismiss).toBe(null);
});

test("copilot adapter normalize & formatDecision", () => {
  const payload = { agent: "copilot", session_id: "c1", tool_name: "bash", tool_input: { command: "echo hi" } } as Record<string, unknown>;
  const adapter = getAdapter("copilot", payload);
  const approval = adapter.normalize(payload);
  expect(approval.agent).toBe("copilot");
  expect(approval.tool_name).toBe("bash");
  const allow = adapter.formatDecision("allow");
  expect(allow).toEqual({ permissionDecision: "allow" });
  const deny = adapter.formatDecision("deny");
  expect(deny).toEqual({ permissionDecision: "deny", permissionDecisionReason: "Denied by user" });
  const dismiss = adapter.formatDecision("dismiss");
  expect(dismiss).toBe(null);
});

test("gemini adapter normalize & formatDecision", () => {
  const payload = { agent: "gemini", session_id: "g1", tool_name: "Write", tool_input: { file_path: "a.txt" } } as Record<string, unknown>;
  const adapter = getAdapter("gemini", payload);
  const approval = adapter.normalize(payload);
  expect(approval.agent).toBe("gemini");
  expect(approval.tool_name).toBe("Write");
  const allow = adapter.formatDecision("allow");
  expect(allow).toEqual({ decision: "allow" });
  const deny = adapter.formatDecision("deny");
  expect(deny).toEqual({ decision: "deny", reason: "Denied by user" });
  const dismiss = adapter.formatDecision("dismiss");
  expect(dismiss).toBe(null);
});
