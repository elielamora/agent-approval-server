import { randomUUID } from 'crypto'
import index from './ui.html'

const PORT = 4759
const AUTO_DENY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

interface PendingEntry {
  resolve: (decision: string) => void
  payload: Record<string, unknown>
  enqueuedAt: number
  alerterProc?: ReturnType<typeof Bun.spawn>
}

const pending = new Map<string, PendingEntry>()

async function loadAllowedTools(): Promise<string[]> {
  try {
    const file = Bun.file(`${process.env.HOME}/.claude/settings.json`)
    const settings = await file.json()
    return settings.allowedTools ?? []
  } catch {
    return []
  }
}

async function shouldAutoAllow(payload: Record<string, unknown>): Promise<boolean> {
  const toolName = payload.tool_name as string | undefined
  const toolInput = payload.tool_input as Record<string, unknown> | undefined
  if (!toolName) return false

  const allowedTools = await loadAllowedTools()
  for (const entry of allowedTools) {
    const match = entry.match(/^([^(]+)(?:\((.+)\))?$/)
    if (!match) continue
    const [, entryTool, entryPattern] = match
    if (entryTool !== toolName) continue
    if (!entryPattern) return true
    if (toolName === 'Bash') {
      const cmd = (toolInput?.command as string) ?? ''
      const prefix = entryPattern.replace(/:?\*$/, '')
      if (cmd.startsWith(prefix)) return true
    }
  }

  if (['Read', 'Glob', 'Grep', 'LS'].includes(toolName)) return true
  if (toolName === 'Bash') {
    const cmd = (toolInput?.command as string) ?? ''
    return /^(git (status|log|diff|show)|ls |echo |cat )/.test(cmd)
  }
  return false
}

async function showNotification(id: string, toolName: string, summary: string) {
  const proc = Bun.spawn([
    'alerter',
    '--title', 'Claude needs approval',
    '--message', `${toolName}: ${summary.slice(0, 200)}`,
    '--actions', 'Allow,Deny',
    '--timeout', '0',
    '--group', id,
  ])
  const entry = pending.get(id)
  if (entry) entry.alerterProc = proc
  const text = await new Response(proc.stdout).text()
  const decision = text.trim() === 'Allow' ? 'allow' : 'deny'
  const entry2 = pending.get(id)
  if (entry2) { pending.delete(id); entry2.resolve(decision) }
}

function allowResponse() {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  }
}

function denyResponse(reason = 'Denied by user') {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }
}

Bun.serve({
  port: PORT,
  routes: {
    '/': index,

    '/queue': {
      GET() {
        const items = [...pending.entries()].map(([id, { payload, enqueuedAt }]) => ({
          id,
          enqueuedAt,
          ...payload,
        }))
        return Response.json(items)
      },
    },

    '/decide/:id': {
      async POST(req) {
        const id = req.params.id
        const entry = pending.get(id)
        if (!entry) {
          return Response.json({ error: 'Not found or already decided' }, { status: 404 })
        }
        const body = (await req.json()) as { decision: string }
        pending.delete(id)
        Bun.spawn(['alerter', '--remove', id])
        entry.resolve(body.decision)
        return Response.json({ ok: true })
      },
    },

    '/health': {
      GET() {
        return Response.json({ ok: true, pending: pending.size })
      },
    },

    '/pending': {
      async POST(req) {
        const payload = (await req.json()) as Record<string, unknown>

        if (await shouldAutoAllow(payload)) {
          return Response.json(allowResponse())
        }

        const id = randomUUID()
        const decision = await new Promise<string>((resolve) => {
          pending.set(id, { resolve, payload, enqueuedAt: Date.now() })
          const toolName = (payload.tool_name as string) ?? 'unknown'
          const summary = JSON.stringify(payload.tool_input ?? '')
          showNotification(id, toolName, summary)

          setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id)
              resolve('deny')
            }
          }, AUTO_DENY_TIMEOUT_MS)
        })

        pending.delete(id)
        return Response.json(decision === 'allow' ? allowResponse() : denyResponse())
      },
    },
  },
})

console.log(`Approval server listening on http://localhost:${PORT}`)
