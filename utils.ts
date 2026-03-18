import { existsSync } from 'fs'
import type { TerminalInfo, PendingEntry } from './types'

export function stableStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') return JSON.stringify(val)
  if (Array.isArray(val)) return '[' + val.map(stableStringify).join(',') + ']'
  const obj = val as Record<string, unknown>
  return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

export function buildExplainPrompt(payload: Record<string, unknown>): string {
  const toolName = payload.tool_name as string
  const input = (payload.tool_input ?? {}) as Record<string, unknown>

  if (toolName === 'Bash') {
    return `Briefly explain what this shell command does (2-3 sentences):\n\n\`\`\`bash\n${input.command}\n\`\`\``
  }
  if (toolName === 'Edit') {
    const path = input.file_path ?? input.path ?? 'unknown'
    return `Briefly explain what this code edit to ${path} does (2-3 sentences):\n\nRemoving:\n\`\`\`\n${input.old_string}\n\`\`\`\n\nAdding:\n\`\`\`\n${input.new_string}\n\`\`\``
  }
  if (toolName === 'Write') {
    const path = input.file_path ?? input.path ?? 'unknown'
    const content = String(input.content ?? '').slice(0, 3000)
    return `Briefly explain what writing this content to ${path} does (2-3 sentences):\n\n\`\`\`\n${content}\n\`\`\``
  }
  return `Briefly explain what this ${toolName} tool call does (2-3 sentences):\n\n${JSON.stringify(input, null, 2)}`
}

export function findGitRoot(dir: string): string {
  let current = dir
  while (current && current !== '/') {
    if (existsSync(`${current}/.git`)) return current
    current = current.substring(0, current.lastIndexOf('/'))
  }
  return dir
}

export function buildFocusScript(payload: Record<string, unknown>): string | null {
  const info = (payload.terminal_info ?? {}) as TerminalInfo
  const cwd = (payload.cwd ?? '') as string
  const termProgram = (info.term_program ?? '').toLowerCase()

  if (info.iterm_session_id) {
    const guid = info.iterm_session_id.split(':')[1]
    if (!guid) return null
    return `
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        if unique ID of s is "${guid}" then
          select t
          tell s to select
        end if
      end repeat
    end repeat
  end repeat
  activate
end tell`
  }

  if (info.ghostty_resources_dir || termProgram === 'ghostty') {
    if (!cwd) return 'tell application "Ghostty" to activate'
    return `
tell application "Ghostty"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with trm in terminals of t
        if working directory of trm is "${cwd}" then
          set index of w to 1
          set selected of t to true
          activate
          return
        end if
      end repeat
    end repeat
  end repeat
  activate
end tell`
  }

  if (termProgram === 'vscode') {
    if (!cwd) return 'tell application "Code" to activate'
    const root = findGitRoot(cwd)
    const escaped = root.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `do shell script "open -a 'Visual Studio Code' \\"${escaped}\\""`
  }

  return null
}

export function allowResponse() {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' },
    },
  }
}

export function denyResponse(reason = 'Denied by user') {
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: reason },
    },
  }
}

export function logRemoval(id: string, reason: string, entry: Pick<PendingEntry, 'payload'>) {
  const tool = entry.payload.tool_name as string ?? 'unknown'
  const input = JSON.stringify(entry.payload.tool_input ?? '').slice(0, 120)
  console.log(`[remove] ${reason} | ${tool} | ${input} | id=${id}`)
}
