// Example stat prototype: which cards reach the realm by each player's turn, over a folder of replays.
//   npx tsx examples/played-by-turn.ts fixtures/replays
// Copy this file to start your own; docs/WRITING_A_STAT.md explains how a prototype becomes a PSO stat.
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { playedCards } from '@pso-analytics/replay'
import type { ContributorReplay } from '@pso-analytics/replay'

const folder = process.argv[2] ?? path.resolve(import.meta.dirname, '../replays')
const files = readdirSync(folder).filter((name) => name.startsWith('replay_') && name.endsWith('.json'))
if (!files.length) {
  console.error(`No replays in ${folder}. Pass fixtures/replays.`)
  process.exit(1)
}

// Table turns count both players; a player's own turn is roughly (table turn + 1) / 2.
const byCard = new Map<string, number[]>()
for (const file of files) {
  const { manifest } = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as ContributorReplay
  for (const play of playedCards(manifest)) {
    if (play.type === 'Site' || play.turn === null) continue
    const ownTurn = Math.ceil(play.turn / 2)
    const turns = byCard.get(play.name) ?? []
    turns.push(ownTurn)
    byCard.set(play.name, turns)
  }
}
const rows = [...byCard].map(([name, turns]) => ({
  name, plays: turns.length, averageOwnTurn: turns.reduce((sum, turn) => sum + turn, 0) / turns.length,
}))
rows.sort((left, right) => right.plays - left.plays)
console.log(`${files.length} replays`)
console.table(rows.slice(0, 25).map((row) => ({ ...row, averageOwnTurn: row.averageOwnTurn.toFixed(1) })))
