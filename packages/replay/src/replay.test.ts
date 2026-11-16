import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { cardsOnBoard, playedCards, realmSquareAt, turnSnapshots, viewAt } from './index.ts'
import type { ContributorReplay } from './index.ts'

const { manifest } = JSON.parse(readFileSync(new URL('../../../fixtures/replays/replay_example.json', import.meta.url), 'utf8')) as ContributorReplay

test('patches play forward: moves, taps and resources', () => {
  const afterTap = viewAt(manifest, 5)
  assert.equal(afterTap.objects.find((object) => object.objectId === 'a2')?.kind === 'card'
    && (afterTap.objects.find((object) => object.objectId === 'a2') as { tapped: boolean }).tapped, true)
  assert.equal(afterTap.resources[1]?.life, 20)
  assert.equal(viewAt(manifest, 6).resources[1]?.life, 17)
  assert.equal(viewAt(manifest, 1).privateCards.some((card) => card.objectId === 'h1'), false, 'the played site left the hand')
  assert.equal(viewAt(manifest, -1).privateCards.length, 3)
})

test('realm squares come from card positions', () => {
  assert.deepEqual(realmSquareAt({ x: 223, y: 99 }), { column: 0, row: 0 })
  assert.deepEqual(realmSquareAt({ x: 223 + 4 * 116, y: 99 + 3 * 116 }), { column: 4, row: 3 })
  assert.equal(realmSquareAt({ x: 0, y: 0 }), null)
  assert.deepEqual(cardsOnBoard(viewAt(manifest, 4)).map((card) => `${card.name}@${card.square.column},${card.square.row}`).sort(),
    ['Arid Desert@2,0', 'Flamecaller@2,0', 'Pudge Butcher@2,1', 'Sorcerer@2,3', 'Spire@2,3'])
})

test('turn snapshots end where the next turn starts', () => {
  const turns = turnSnapshots(manifest)
  assert.deepEqual(turns.map((turn) => [turn.number, turn.activeSeat]), [[1, 1], [2, 2], [3, 1]])
  assert.equal(turns[0]!.end.zoneCounts[1]?.hand, 2)
  assert.equal(turns[1]!.end.resources[1]?.life, 17)
  assert.equal(turns[1]!.end.objects.filter((object) => object.kind === 'card').length, 5)
})

test('played cards list what reached the realm, in order', () => {
  assert.deepEqual(playedCards(manifest).map((card) => [card.turn, card.seat, card.name]), [
    [1, 1, 'Spire'], [2, 2, 'Arid Desert'], [2, 2, 'Pudge Butcher'],
  ])
})
