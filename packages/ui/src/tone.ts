/** Diverging color step for a win rate: -3 (well below 50%) to 3 (well above). */
export function winRateTone(winRate: number | null | undefined): number | null {
  if (winRate === null || winRate === undefined) return null
  return toneStep((winRate - 0.5) * 100, [1, 3, 6])
}

/** Same scale for a percentage-point difference between two win rates. */
export function differenceTone(difference: number | null): number | null {
  return difference === null ? null : toneStep(difference * 100, [1.5, 4, 8])
}

function toneStep(points: number, steps: readonly [number, number, number]): number {
  const size = Math.abs(points)
  const step = size < steps[0] ? 0 : size < steps[1] ? 1 : size < steps[2] ? 2 : 3
  return points < 0 ? -step : step
}

/** Class for a toned value; styles live in style.css. */
export function toneClass(step: number | null): string {
  return step === null ? 'ga-tone' : `ga-tone ga-tone--${step < 0 ? 'm' : 'p'}${Math.abs(step)}`
}
