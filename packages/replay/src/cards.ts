import { realmSquareAt } from './board.ts'
import { frames } from './playback.ts'
import type { CardObject, ReplayManifest, ReplayView, Seat } from './types.ts'

export interface BoardCard {
  objectId: string
  name: string | null
  type: string | null
  controllerSeat: Seat
  square: { column: number; row: number }
  tapped: boolean
}

/** Cards on the realm in a view, with their squares. Face-down cards have no name. */
export function cardsOnBoard(view: ReplayView): BoardCard[] {
  return view.objects.flatMap((object) => {
    if (object.kind !== 'card' || object.zone !== 'grid') return []
    const card = object as CardObject
    const square = realmSquareAt(card.transform)
    if (!square) return []
    return [{
      objectId: card.objectId, name: card.card?.name ?? null, type: card.card?.type ?? null,
      controllerSeat: card.controllerSeat, square, tapped: card.tapped,
    }]
  })
}

export interface PlayedCard {
  eventIndex: number
  at: number
  turn: number | null
  seat: Seat
  name: string
  type: string
  square: { column: number; row: number } | null
}

/**
 * Cards that reached the realm from a hand or pile, in order. Uses each event's cardMoves when the
 * replay has them, and otherwise watches for card objects that newly appear face up on the grid.
 */
export function playedCards(manifest: ReplayManifest): PlayedCard[] {
  const played: PlayedCard[] = []
  const seen = new Set<string>()
  for (const { event, view } of frames(manifest)) {
    const onGrid = new Map(view.objects.filter((object): object is CardObject => object.kind === 'card' && object.zone === 'grid')
      .map((card) => [card.objectId, card]))
    if (!event) {
      for (const id of onGrid.keys()) seen.add(id)
      continue
    }
    const fromHidden = event.cardMoves
      ?.filter((move) => move.destinationZone === 'grid' && !['grid', 'staging'].includes(move.sourceZone))
      .map((move) => move.objectId)
    const candidates = fromHidden ?? [...onGrid.keys()].filter((id) => !seen.has(id))
    for (const id of candidates) {
      const card = onGrid.get(id)
      if (!card?.card || seen.has(id)) continue
      seen.add(id)
      played.push({
        eventIndex: event.index, at: event.at, turn: view.turn?.number ?? null, seat: card.controllerSeat,
        name: card.card.name, type: card.card.type, square: realmSquareAt(card.transform),
      })
    }
    for (const id of onGrid.keys()) seen.add(id)
  }
  return played
}
