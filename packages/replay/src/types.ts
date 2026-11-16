// Loose types for PSO replay files (see fixtures/replays; keys no longer serve replays). They cover the fields most
// stats need; the real objects carry more. See docs/REPLAY_FORMAT.md for the whole picture.

export type Seat = 1 | 2 | 3 | 4
export type Zone = 'spellbook' | 'atlas' | 'collection' | 'hand' | 'bound' | 'grid' | 'staging' | 'cemetery' | 'banished'

export interface CardDefinition {
  id: string
  name: string
  type: string
  rarity?: string
  cost?: number | null
  elements?: string[]
  thresholds?: string[]
  [field: string]: unknown
}

export interface Transform { x: number; y: number; rotation: number; z: number; scale?: number }

export interface CardObject {
  kind: 'card'
  objectId: string
  /** null when the card is face down to the recording player. */
  card: CardDefinition | null
  ownerSeat: Seat | null
  controllerSeat: Seat
  zone: 'grid' | 'staging' | 'cemetery' | 'banished'
  zoneSeat: Seat | null
  faceUp: boolean
  tapped: boolean
  transform: Transform
  attachedToObjectId?: string | null
  [field: string]: unknown
}

export interface OtherObject {
  kind: 'counter' | 'die' | 'token'
  objectId: string
  transform: Transform
  [field: string]: unknown
}

export type TableObject = CardObject | OtherObject

export interface PrivateCard {
  objectId: string
  card: CardDefinition
  zone: 'spellbook' | 'atlas' | 'collection' | 'hand'
  faceUp: boolean
  [field: string]: unknown
}

export interface Resources {
  life: number
  mana: number
  maxMana: number
  thresholds: Record<string, number>
  [field: string]: unknown
}

export interface ZoneCounts { spellbook: number; atlas: number; collection: number; hand: number; cemetery: number; banished: number }

export interface Participant { id: string; name: string; role: string; seat: Seat | null; [field: string]: unknown }

export interface Activity { id: string; at: number; kind: 'log'; actorParticipantId: string | null; actorName: string; message: string; [field: string]: unknown }

export interface ReplayView {
  id: string
  revision: number
  format?: string
  perspectiveSeat: Seat
  participants: Participant[]
  resources: Partial<Record<Seat, Resources>>
  zoneCounts: Partial<Record<Seat, ZoneCounts>>
  /** The recording player's own hidden cards (hand, and piles while they search them). */
  privateCards: PrivateCard[]
  /** Cards on the table, in cemeteries and banished. */
  objects: TableObject[]
  fixtures: Array<{ objectId: string; [field: string]: unknown }>
  activity: Activity[]
  turn?: { activeSeat: Seat | null; startedAt: number | null; number?: number }
  opponentHandCards?: PrivateCard[]
  [field: string]: unknown
}

export interface EntityPatch<T> {
  upsert: T[]
  remove: string[]
  order?: string[]
  update?: Array<{ id: string; changes: Partial<T>; unset?: string[] }>
}

export interface ReplayPatch {
  tabletopId: string
  baseRevision: number
  revision: number
  state?: Partial<ReplayView>
  participants?: EntityPatch<Participant>
  privateCards?: EntityPatch<PrivateCard>
  revealedHandCards?: EntityPatch<PrivateCard>
  objects?: EntityPatch<TableObject>
  fixtures?: EntityPatch<{ objectId: string }>
  animationEvents?: EntityPatch<{ id: string }>
  drawings?: EntityPatch<{ id: string }>
  activity?: EntityPatch<Activity>
  opponentHandCards?: EntityPatch<PrivateCard>
  [field: string]: unknown
}

export interface CardMove { objectId: string; sourceZone: Zone; destinationZone: Zone; sourceSeat: Seat; destinationSeat: Seat }

export interface ReplayEvent {
  index: number
  revision: number
  at: number
  actorParticipantId: string | null
  actorName: string
  label: string
  /** The command that made this change, such as play_private, move, toggle_tap or pass_turn. */
  kind: string
  turnBoundary: boolean
  /** Present on newer replays. */
  cardMoves?: CardMove[]
  patch: ReplayPatch
}

export interface ReplayManifest {
  schemaVersion: 1
  replayId: string
  tableName: string
  perspectiveParticipantId: string
  perspectiveName: string
  perspectiveSeat: Seat
  recordedFrom: number
  recordedTo: number
  initialView: ReplayView
  events: ReplayEvent[]
}

export interface ContributorReplay {
  replayId: string
  manifest: ReplayManifest
  summary?: Record<string, unknown>
  [field: string]: unknown
}
