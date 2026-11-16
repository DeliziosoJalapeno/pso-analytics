# Replay format

A replay is a starting picture of the table plus a list of changes. `packages/replay` reads it for you; this page explains what is inside so you can go further. [fixtures/replays/replay_example.json](../fixtures/replays/replay_example.json) is a small made-up replay in exactly this shape.

## The file

A replay file is `{ replayId, manifest }` (PSO keys do not serve replays; use the fixture):

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Always `1` for now |
| `perspectiveSeat` | The seat this replay was recorded from (1 or 2). Hidden cards are as that player saw them |
| `perspectiveName` | `Player 1` or `Player 2` |
| `recordedFrom`, `recordedTo` | Unix milliseconds |
| `initialView` | The table when recording started |
| `events` | Every change after that, in order |

Each game has up to two replays, one per seat. A replay only shows what its player could see: their own hand and draws, but only the backs of the opponent's hand.

## The view

A view is the whole table at one moment. The fields most stats need:

| Field | Meaning |
| --- | --- |
| `objects` | Everything public on the table: cards on the realm (`zone: 'grid'`), in staging, cemeteries and banished, plus counters, dice and tokens |
| `privateCards` | The recording player's hidden cards: their hand (`zone: 'hand'`), and pile cards while they look through them |
| `resources[seat]` | `{ life, mana, maxMana, thresholds: { air, earth, fire, water } }` |
| `zoneCounts[seat]` | How many cards are in `spellbook`, `atlas`, `collection`, `hand`, `cemetery`, `banished` |
| `turn` | `{ activeSeat, startedAt, number }`. `number` counts every turn started at the table, both players' |
| `participants` | `{ id, name, role, seat }`. Spectators have `seat: null` |
| `activity` | The table log (`kind: 'log'`). Chat is removed |
| `opponentHandCards` | Present only while the opponent revealed their hand |

A card object looks like:

```json
{
  "kind": "card", "objectId": "o2",
  "card": { "id": "bet:pudge-butcher", "name": "Pudge Butcher", "type": "Minion", "cost": 1, "elements": ["Fire"], "thresholds": ["fire:1"] },
  "ownerSeat": 2, "controllerSeat": 2, "zone": "grid", "faceUp": true, "tapped": false,
  "transform": { "x": 397, "y": 215, "rotation": 0, "z": 1 }
}
```

`card` is `null` for a card face down to the recording player. `card.type` is one of `Avatar`, `Site`, `Minion`, `Magic`, `Aura`, `Artifact`.

### Realm squares

The realm is 5 columns by 4 rows. A card's square comes from its `transform`:

```ts
column = Math.floor((x + 45 - 210) / 116)   // 0..4
row    = Math.floor((y + 63 - 104) / 116)   // 0..3
```

Anything outside 0–4 / 0–3 is off the realm. `realmSquareAt` in `packages/replay` does this. Rows are in table coordinates, so check which row each Avatar starts on before you call a row "near" or "far".

## Events

| Field | Meaning |
| --- | --- |
| `index` | Position in the list, from 0 |
| `at` | Unix milliseconds |
| `actorName` | `Player 1`, `Player 2`, `Spectator` or `System` |
| `kind` | The table command, such as `play_private` (from hand), `play_top`, `move`, `toggle_tap`, `set_resource`, `adjust_resource`, `draw`, `start_turn`, `pass_turn`, `roll_die`, `scry_commit` |
| `label` | A readable summary, such as `Player 1 played Spire` |
| `turnBoundary` | `true` when this event starts a new turn |
| `cardMoves` | On newer replays: `[{ objectId, sourceZone, destinationZone, sourceSeat, destinationSeat }]` |
| `patch` | What changed |

Treat `kind` and `label` as hints. Players move cards by hand, so "played a card" is really "a card went from hand to the realm"; `cardMoves` (or comparing views) is the reliable signal.

### Patches

`patch.state` holds top-level fields that changed, such as `resources`, `zoneCounts` or `turn`; each replaces the old value whole.

Lists (`objects`, `privateCards`, `participants`, `activity`, `fixtures`, `drawings`, `animationEvents`, `revealedHandCards`, `opponentHandCards`) change through an entity patch:

```json
{ "upsert": [ { "objectId": "o2", "...": "whole new entry" } ],
  "remove": [ "h1" ],
  "update": [ { "id": "a2", "changes": { "tapped": true }, "unset": [] } ],
  "order": [ "optional", "full", "order", "of", "ids" ] }
```

Apply them in that order: drop `remove`, add or replace `upsert`, merge `update.changes` into existing entries and delete the `unset` fields, then reorder by `order` when present. Entries are keyed by `objectId`, or `id` for participants, activity, drawings and animations.

`revision` increases with every event. Replays can skip revisions (for state that is not recorded), so don't insist that `patch.baseRevision` equals the previous revision; `applyPatch` doesn't.

## What a replay won't tell you

- The opponent's hand and draws, unless revealed. Use the other seat's replay of the same game when it is public.
- Rules. The table does not know that a minion died; a player moved it to the cemetery. Life totals are whatever the players set.
- Mulligans directly. The kept hand is the hand when the first turn starts.
- Names, chat, or accounts. These are removed before you get the replay.
