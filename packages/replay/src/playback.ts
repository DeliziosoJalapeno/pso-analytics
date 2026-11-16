import type { EntityPatch, ReplayEvent, ReplayManifest, ReplayPatch, ReplayView, Seat } from './types.ts'

// Collections in a view and the field that identifies their entries.
const COLLECTIONS = [
  ['participants', 'id'], ['privateCards', 'objectId'], ['revealedHandCards', 'objectId'], ['objects', 'objectId'],
  ['fixtures', 'objectId'], ['animationEvents', 'id'], ['drawings', 'id'], ['activity', 'id'], ['opponentHandCards', 'objectId'],
] as const

function applyEntityPatch<T>(current: T[] | undefined, patch: EntityPatch<T> | undefined, key: string): T[] | undefined {
  if (!patch) return current
  const keyOf = (entry: T) => (entry as Record<string, string>)[key]!
  const remove = new Set(patch.remove)
  const byId = new Map((current ?? []).filter((entry) => !remove.has(keyOf(entry))).map((entry) => [keyOf(entry), entry]))
  for (const entry of patch.upsert) byId.set(keyOf(entry), structuredClone(entry))
  for (const entry of patch.update ?? []) {
    const existing = byId.get(entry.id)
    if (!existing) continue
    const updated = { ...structuredClone(existing), ...structuredClone(entry.changes) } as Record<string, unknown>
    for (const field of entry.unset ?? []) delete updated[field]
    byId.set(entry.id, updated as T)
  }
  if (!patch.order) return [...byId.values()]
  return patch.order.flatMap((id) => byId.get(id) ?? [])
}

/**
 * Applies one event's patch. Unlike the live table, this does not insist that revisions line up:
 * replays can skip revisions for state that is never recorded, such as spectator requests.
 */
export function applyPatch(view: ReplayView, patch: ReplayPatch): ReplayView {
  const next = { ...view, ...structuredClone(patch.state ?? {}), revision: patch.revision } as ReplayView
  const target = next as Record<string, unknown>
  for (const [name, key] of COLLECTIONS) {
    const applied = applyEntityPatch(view[name] as unknown[] | undefined, patch[name] as EntityPatch<unknown> | undefined, key)
    if (applied !== undefined) target[name] = applied
  }
  return next
}

export interface Frame { event: ReplayEvent | null; view: ReplayView }

/** Every state of the game in order: the starting view, then the view after each event. */
export function* frames(manifest: ReplayManifest): Generator<Frame> {
  let view = structuredClone(manifest.initialView)
  yield { event: null, view }
  for (const event of manifest.events) {
    view = applyPatch(view, event.patch)
    yield { event, view }
  }
}

/** The view just after the event with this index (or the starting view for -1). */
export function viewAt(manifest: ReplayManifest, eventIndex: number): ReplayView {
  let last = manifest.initialView
  for (const frame of frames(manifest)) {
    if (frame.event && frame.event.index > eventIndex) break
    last = frame.view
  }
  return last
}

export interface TurnSnapshot {
  /** Turn number as the table counted it, when recorded. */
  number: number | null
  activeSeat: Seat | null
  /** The event that started this turn. */
  startEvent: ReplayEvent
  /** The table at the end of this turn (just before the next one started, or at the end of the replay). */
  end: ReplayView
}

/** The table at the end of each turn. A new turn starts at each event marked as a turn boundary. */
export function turnSnapshots(manifest: ReplayManifest): TurnSnapshot[] {
  const turns: TurnSnapshot[] = []
  let previous: ReplayView = manifest.initialView
  for (const { event, view } of frames(manifest)) {
    if (!event) continue
    if (event.turnBoundary) {
      const current = turns.at(-1)
      if (current) current.end = previous
      turns.push({ number: view.turn?.number ?? null, activeSeat: view.turn?.activeSeat ?? null, startEvent: event, end: view })
    }
    previous = view
  }
  const last = turns.at(-1)
  if (last) last.end = previous
  return turns
}
