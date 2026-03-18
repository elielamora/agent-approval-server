import { randomUUID } from 'crypto'
import type { PendingEntry, StoppedSession } from './types'
import {
  stableStringify,
  buildExplainPrompt,
  buildFocusScript,
  allowResponse,
  denyResponse,
  logRemoval,
} from './utils'

function focusTerminal(entry: PendingEntry) {
  const script = buildFocusScript(entry.payload)
  if (!script) return
  Bun.spawn(['osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' })
}


export function createRoutes(
  pending: Map<string, PendingEntry>,
  stoppedSessions: Map<string, StoppedSession>,
  autoDenyMs: number,
) {
  return {
    '/config': {
      GET() {
        return Response.json({ autoDenyMs })
      },
    },

    '/queue': {
      GET() {
        const items = [...pending.entries()].map(([id, { payload, enqueuedAt, explanation }]) => ({
          id,
          enqueuedAt,
          explanation,
          ...payload,
        }))
        return Response.json(items)
      },
    },

    '/decide/:id': {
      async POST(req: Request & { params: { id: string } }) {
        const id = req.params.id
        const entry = pending.get(id)
        if (!entry) {
          return Response.json({ error: 'Not found or already decided' }, { status: 404 })
        }
        const body = (await req.json()) as { decision: string; message?: string }
        logRemoval(id, `web-ui:${body.decision}`, entry)
        pending.delete(id)
        entry.resolve(body.decision === 'allow' ? 'allow' : (body.message ?? body.decision))
        return Response.json({ ok: true })
      },
    },

    '/focus/:id': {
      POST(req: Request & { params: { id: string } }) {
        const entry = pending.get(req.params.id)
        if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
        focusTerminal(entry)
        return Response.json({ ok: true })
      },
    },

    '/post-tool-use': {
      async POST(req: Request) {
        const payload = (await req.json()) as Record<string, unknown>
        const sessionId = payload.session_id as string
        const toolName = payload.tool_name as string

        const toolInput = stableStringify(payload.tool_input)
        for (const [id, entry] of pending) {
          if (
            entry.payload.session_id === sessionId &&
            entry.payload.tool_name === toolName &&
            stableStringify(entry.payload.tool_input) === toolInput
          ) {
            logRemoval(id, 'post-tool-use', entry)
            pending.delete(id)
            entry.resolve('allow')
            break
          }
        }

        return Response.json({ ok: true })
      },
    },

    '/explain/:id': {
      async GET(req: Request & { params: { id: string } }) {
        const entry = pending.get(req.params.id)
        if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })
        if (entry.explaining) return Response.json({ error: 'Already in progress' }, { status: 409 })
        if (entry.explanation) return Response.json({ explanation: entry.explanation })

        entry.explaining = true
        try {
          const prompt = buildExplainPrompt(entry.payload)
          const proc = Bun.spawn(['claude', '-p', prompt, '--model', 'haiku'], { stdout: 'pipe', stderr: 'pipe' })
          const timeout = setTimeout(() => proc.kill(), 30_000)
          const [text, err] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
          ])
          clearTimeout(timeout)
          if (!text.trim() && err.trim()) {
            console.error('[explain]', err.trim())
            return Response.json({ error: err.trim() }, { status: 500 })
          }
          entry.explanation = text.trim()
          return Response.json({ explanation: entry.explanation })
        } catch (e) {
          console.error('[explain]', e)
          return Response.json({ error: String(e) }, { status: 500 })
        } finally {
          entry.explaining = false
        }
      },
    },

    '/health': {
      GET() {
        return Response.json({ ok: true, pending: pending.size, stopped: stoppedSessions.size })
      },
    },

    '/stop': {
      async POST(req: Request) {
        const payload = (await req.json()) as Record<string, unknown>
        const sessionId = payload.session_id as string
        const transcriptPath = payload.transcript_path as string | undefined
        stoppedSessions.set(sessionId, { sessionId, stoppedAt: Date.now(), transcriptPath, payload })
        console.log(`[stop] session=${sessionId}`)
        return Response.json({ ok: true })
      },
    },

    '/stopped': {
      GET() {
        const items = [...stoppedSessions.values()].map(({ sessionId, stoppedAt, transcriptPath, payload }) => ({
          sessionId, stoppedAt, transcriptPath,
          terminal_info: payload.terminal_info,
        }))
        return Response.json(items)
      },
    },

    '/stopped/:id': {
      DELETE(req: Request & { params: { id: string } }) {
        const deleted = stoppedSessions.delete(req.params.id)
        return deleted
          ? Response.json({ ok: true })
          : Response.json({ error: 'Not found' }, { status: 404 })
      },
    },

    '/stopped/:id/output': {
      async GET(req: Request & { params: { id: string } }) {
        const session = stoppedSessions.get(req.params.id)
        if (!session) return Response.json({ error: 'Not found' }, { status: 404 })
        if (!session.transcriptPath) return Response.json({ error: 'No transcript' }, { status: 404 })
        try {
          const text = await Bun.file(session.transcriptPath).text()
          const lines = text.trim().split('\n').filter(Boolean)
          let lastText: string | null = null
          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              const msg = entry.message
              if (msg?.role === 'assistant' && Array.isArray(msg.content)) {
                const texts = msg.content
                  .filter((b: { type: string }) => b.type === 'text')
                  .map((b: { text: string }) => b.text)
                  .join('')
                if (texts) lastText = texts
              }
            } catch { /* skip malformed lines */ }
          }
          if (!lastText) return Response.json({ error: 'No output found' }, { status: 404 })
          return Response.json({ output: lastText })
        } catch (e) {
          return Response.json({ error: String(e) }, { status: 500 })
        }
      },
    },

    '/focus-stopped/:id': {
      POST(req: Request & { params: { id: string } }) {
        const session = stoppedSessions.get(req.params.id)
        if (!session) return Response.json({ error: 'Not found' }, { status: 404 })
        const script = buildFocusScript(session.payload)
        if (script) Bun.spawn(['osascript', '-e', script], { stdout: 'ignore', stderr: 'ignore' })
        return Response.json({ ok: true })
      },
    },

    '/pending': {
      async POST(req: Request) {
        const payload = (await req.json()) as Record<string, unknown>

        const id = randomUUID()
        let resolveDecision!: (decision: string) => void
        const decisionPromise = new Promise<string>((resolve) => {
          resolveDecision = resolve
        })

        // Auto-resolve any lingering AskUserQuestion entries for this session
        const incomingSession = payload.session_id as string | undefined
        if (incomingSession) {
          for (const [pendingId, entry] of pending) {
            if (entry.payload.session_id === incomingSession && entry.payload.tool_name === 'AskUserQuestion') {
              logRemoval(pendingId, 'new-session-activity', entry)
              pending.delete(pendingId)
              entry.resolve('allow')
            }
          }
        }

        pending.set(id, { resolve: resolveDecision, payload, enqueuedAt: Date.now() })
        const toolName = (payload.tool_name as string) ?? 'unknown'
        const summary = JSON.stringify(payload.tool_input ?? '')
        console.log(`[enqueue] ${toolName} | ${summary.slice(0, 120)} | id=${id}`)

        setTimeout(() => {
          const entry = pending.get(id)
          if (entry) {
            logRemoval(id, 'auto-deny-timeout', entry)
            pending.delete(id)
            resolveDecision('deny')
          }
        }, autoDenyMs)

        const encoder = new TextEncoder()
        let clientGone = false

        const stream = new ReadableStream({
          start(controller) {
            decisionPromise.then((decision) => {
              if (clientGone) return
              try {
                controller.enqueue(encoder.encode(JSON.stringify(
                  decision === 'allow' ? allowResponse() : denyResponse()
                )))
                controller.close()
              } catch {}
            })
          },
          cancel() {
            clientGone = true
            const entry = pending.get(id)
            if (entry) {
              logRemoval(id, 'stream-cancel', entry)
              pending.delete(id)
              resolveDecision('deny')
            }
          },
        })

        return new Response(stream, { headers: { 'Content-Type': 'application/json' } })
      },
    },
  }
}
