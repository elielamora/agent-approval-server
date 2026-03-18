import type { PendingEntry, StoppedSession } from './types'

export const AUTO_DENY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export const pendingRequests = new Map<string, PendingEntry>()
export const stoppedSessions = new Map<string, StoppedSession>()
