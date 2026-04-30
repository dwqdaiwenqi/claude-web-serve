import type { SessionMessage } from '@/http/index'
import type { FileDiff } from './index'

export function mergeDiffs(prev: FileDiff[], incoming: FileDiff[]): FileDiff[] {
  const result = [...prev]
  for (const d of incoming) {
    const idx = result.findIndex((x) => x.file === d.file)
    if (idx === -1) {
      result.push(d)
    } else {
      const e = result[idx]
      result[idx] = {
        ...e,
        after: d.after,
        additions: e.additions + d.additions,
        deletions: e.deletions + d.deletions,
        status: e.status === 'added' ? 'added' : d.status,
      }
    }
  }
  return result
}

export function extractDiffsFromMessages(sdkMsgs: SessionMessage[]): FileDiff[] {
  const diffMap = new Map<string, FileDiff>()
  for (const m of sdkMsgs) {
    if (m.type !== 'assistant') continue
    const blocks: any[] = Array.isArray((m.message as any)?.content)
      ? (m.message as any).content
      : []
    for (const block of blocks) {
      if (block.type !== 'tool_use') continue
      const inp = block.input ?? {}
      if (block.name === 'Write') {
        const filePath: string = inp.file_path ?? ''
        const after: string = inp.content ?? ''
        if (!filePath) continue
        const existing = diffMap.get(filePath)
        if (existing) {
          diffMap.set(filePath, {
            ...existing,
            after,
            status: 'modified',
            additions: after.split('\n').length,
            deletions: existing.before.split('\n').length,
          })
        } else {
          diffMap.set(filePath, {
            file: filePath,
            status: 'added',
            before: '',
            after,
            additions: after.split('\n').length,
            deletions: 0,
          })
        }
      } else if (block.name === 'Edit') {
        const filePath: string = inp.file_path ?? ''
        const oldStr: string = inp.old_string ?? ''
        const newStr: string = inp.new_string ?? ''
        if (!filePath) continue
        const existing = diffMap.get(filePath)
        const before = existing ? existing.before || oldStr : oldStr
        const prevAfter = existing ? existing.after || oldStr : oldStr
        const after = prevAfter.replace(oldStr, newStr)
        const additions = newStr.split('\n').length
        const deletions = oldStr.split('\n').length
        if (existing) {
          diffMap.set(filePath, {
            ...existing,
            after,
            additions: existing.additions + additions,
            deletions: existing.deletions + deletions,
          })
        } else {
          diffMap.set(filePath, {
            file: filePath,
            status: 'modified',
            before,
            after,
            additions,
            deletions,
          })
        }
      }
    }
  }
  return Array.from(diffMap.values())
}
