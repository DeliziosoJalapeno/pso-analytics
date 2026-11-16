export interface AnalyticsPopulation {
  releasedThrough: string | null
  dataAvailable: boolean
  totalGames: number
}

/** Limited card pools the host can filter by; matches the server's inferred deck source. */
export const LIMITED_SOURCE_LABELS: Record<string, string> = {
  alpha_beta: 'Alpha/Beta',
  arthurian_legends: 'Arthurian Legends',
  gothic: 'Gothic',
  dragonlord: 'Dragonlord',
  frogimago_cube: 'Frogimago\'s Cube',
  mixed: 'Mixed sets',
}
