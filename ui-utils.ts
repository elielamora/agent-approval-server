export function badgeClass(toolName: string | undefined): string {
  if (toolName === 'Bash')  return 'badge-bash'
  if (toolName === 'Write') return 'badge-write'
  if (toolName === 'Edit')  return 'badge-edit'
  if (toolName === 'ExitPlanMode' || toolName === 'EnterPlanMode') return 'badge-plan'
  return 'badge-default'
}

export function shortCwd(cwd: string): string {
  if (!cwd) return ''
  const parts = cwd.split('/').filter(Boolean)
  return parts.length <= 2 ? cwd : '…/' + parts.slice(-2).join('/')
}

export function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    json: 'json', py: 'python',
    sh: 'bash', bash: 'bash',
    rb: 'ruby', go: 'go', rs: 'rust',
    html: 'html', css: 'css',
    md: 'markdown', yaml: 'yaml', yml: 'yaml',
    sql: 'sql',
  }
  return map[ext] ?? 'plaintext'
}
