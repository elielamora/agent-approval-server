import type { PendingEntry, IdleSession } from "./types";

export const AUTO_DENY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes — must match Claude hook timeout
export const IDLE_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const pendingRequests = new Map<string, PendingEntry>();
export const idleSessions = new Map<string, IdleSession>();
