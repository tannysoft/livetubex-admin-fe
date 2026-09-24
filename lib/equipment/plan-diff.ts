import type { PlanDiagram, PlanItem } from '../types'

/**
 * เทียบแผน 2 ชุด (ก่อน → หลัง) — ใช้ทั้งร่างผู้ช่วย AI และหน้า revision
 * จับคู่ด้วย id ของแถว/กล่อง/เส้น (id คงที่ตลอดอายุของแถว)
 */
export interface ItemDiff {
  added: PlanItem[]
  removed: PlanItem[]
  changed: { before: PlanItem; after: PlanItem }[]
}

export function diffItems(before: PlanItem[], after: PlanItem[]): ItemDiff {
  const old = new Map(before.map((i) => [i.id, i]))
  const now = new Set(after.map((i) => i.id))
  return {
    added: after.filter((i) => !old.has(i.id)),
    removed: before.filter((i) => !now.has(i.id)),
    changed: after
      .filter((i) => old.has(i.id))
      .map((i) => ({ before: old.get(i.id)!, after: i }))
      .filter(({ before: a, after: b }) =>
        a.quantity !== b.quantity || a.name !== b.name
        || (a.toLocation ?? '') !== (b.toLocation ?? '') || (a.fromLocation ?? '') !== (b.fromLocation ?? '')
        || (a.note ?? '') !== (b.note ?? ''),
      ),
  }
}

export interface DiagramChange {
  diagram: PlanDiagram
  isNew: boolean
  addedNodes: number
  addedEdges: number
  /** กล่อง + เส้นที่หายไป */
  removed: number
}

/** ผังที่ต่างจากเดิม (ผังใหม่ หรือมีกล่อง/เส้นเพิ่ม-หาย) — ผังที่ถูกลบทั้งผังดูจาก removedDiagrams() */
export function changedDiagrams(before: PlanDiagram[], after: PlanDiagram[]): DiagramChange[] {
  return after
    .map((d) => {
      const old = before.find((x) => x.id === d.id)
      const oldNodes = new Set(old?.nodes.map((n) => n.id) ?? [])
      const oldEdges = new Set(old?.edges.map((e) => e.id) ?? [])
      return {
        diagram: d,
        isNew: !old,
        addedNodes: d.nodes.filter((n) => !oldNodes.has(n.id)).length,
        addedEdges: d.edges.filter((e) => !oldEdges.has(e.id)).length,
        removed: (old?.nodes.length ?? 0) - d.nodes.filter((n) => oldNodes.has(n.id)).length
          + (old?.edges.length ?? 0) - d.edges.filter((e) => oldEdges.has(e.id)).length,
      }
    })
    .filter((c) => c.isNew || c.addedNodes || c.addedEdges || c.removed)
}

export function removedDiagrams(before: PlanDiagram[], after: PlanDiagram[]): PlanDiagram[] {
  const now = new Set(after.map((d) => d.id))
  return before.filter((d) => !now.has(d.id))
}
