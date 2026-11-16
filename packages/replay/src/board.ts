import type { Transform } from './types.ts'

export const BOARD_COLUMNS = 5
export const BOARD_ROWS = 4

/**
 * The realm square under a card, or null when it sits off the 5x4 grid (staging, hands, piles).
 * Same arithmetic PSO uses for cast locations.
 */
export function realmSquareAt(transform: Pick<Transform, 'x' | 'y'>): { column: number; row: number } | null {
  const column = Math.floor((transform.x + 45 - 210) / 116)
  const row = Math.floor((transform.y + 63 - 104) / 116)
  if (column < 0 || column >= BOARD_COLUMNS || row < 0 || row >= BOARD_ROWS) return null
  return { column, row }
}
