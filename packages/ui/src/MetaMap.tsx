import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Rate } from './cardTable'
import { toneClass, winRateTone } from './tone'

export interface MetaMapRow { avatarKeys: string[]; metaShare: number; rate: Rate }
/** A win rate the map plots instead of the all-games one, such as one that weighs every player equally. */
export interface MetaMapWinRate {
  /** Short name, such as "player avg win rate". */
  label: string
  /** Sentence under the map title while this win rate is plotted. */
  description: string
  value: (row: MetaMapRow) => number | null
}
/** A share the map can place dots by instead of the share of games, such as the share of players. */
export interface MetaMapShare {
  /** X-axis label, such as "Share of players". */
  axisLabel: string
  /** Short detail under the share in highlights, such as "of players". */
  detail: string
  /** Rows with null or 0 are left off the map. */
  value: (row: MetaMapRow) => number | null
}
type WinRateOf = (row: MetaMapRow) => number | null
type ShareOf = (row: MetaMapRow) => number | null
const gameShare: ShareOf = row => row.metaShare
const allGamesWinRate: WinRateOf = row => row.rate.winRate
interface MetaMapResponse { dataAvailable: boolean; totalPlayerGames: number; avatars: MetaMapRow[] }
interface Period { from: string; through: string }
interface Point { key: string; name: string; share: number; winRate: number; games: number }

const DEFAULT_MINIMUM_GAMES = 20
const LABEL_LIMIT = 14
const PERIOD_DAYS = 30

function percent(value: number | null, digits = 1): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`
}

function shiftDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** The later period ends on the last released day, the earlier one is the 30 days before it. */
function defaultPeriods(releasedThrough: string | null): [Period, Period] {
  const end = releasedThrough ?? new Date().toISOString().slice(0, 10)
  return [{ from: shiftDays(end, 1 - PERIOD_DAYS * 2), through: shiftDays(end, -PERIOD_DAYS) },
    { from: shiftDays(end, 1 - PERIOD_DAYS), through: end }]
}

function toPoints(rows: readonly MetaMapRow[], avatarNames: ReadonlyMap<string, string>, minimumGames: number, winRateOf: WinRateOf,
  shareOf: ShareOf): Point[] {
  return rows.flatMap(row => {
    const winRate = winRateOf(row)
    const share = shareOf(row)
    if (!row.avatarKeys.length || winRate === null || !share || (row.rate.playerGames ?? 0) < Math.max(1, minimumGames)) return []
    return [{ key: row.avatarKeys.join('|'), name: row.avatarKeys.map(key => avatarNames.get(key) ?? key).join(' + '),
      share, winRate, games: row.rate.playerGames ?? 0 }]
  })
}

function niceStep(range: number, steps: number): number {
  const raw = range / steps
  const power = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 2.5, 5, 10].find(step => step * power >= raw) ?? 10) * power
}

interface Box { x: number; y: number; width: number; height: number }
interface Domain { x0: number; x1: number; y0: number; y1: number }
// The closest zoom still shows a readable spread of points.
const MIN_SHARE_RANGE = 0.004
const MIN_RATE_RANGE = 0.03
const MAX_ZOOM_STEP = 2

function ticksFor(start: number, end: number, step: number): number[] {
  const ticks: number[] = []
  for (let tick = Math.ceil(start / step - 1e-9) * step; tick <= end + 1e-9; tick += step) ticks.push(Math.round(tick * 1e6) / 1e6)
  return ticks
}

/** Zooms by factor around a data-space anchor, staying inside the full domain; null means fully zoomed out. */
function zoomDomain(view: Domain, full: Domain, anchorX: number, anchorY: number, factor: number): Domain | null {
  const fullX = full.x1 - full.x0, fullY = full.y1 - full.y0
  const rangeX = Math.min(fullX, Math.max(MIN_SHARE_RANGE, (view.x1 - view.x0) / factor))
  const rangeY = Math.min(fullY, Math.max(MIN_RATE_RANGE, (view.y1 - view.y0) / factor))
  if (rangeX >= fullX - 1e-9 && rangeY >= fullY - 1e-9) return null
  const ratioX = (anchorX - view.x0) / (view.x1 - view.x0), ratioY = (anchorY - view.y0) / (view.y1 - view.y0)
  return clampDomain({ x0: anchorX - ratioX * rangeX, x1: anchorX - ratioX * rangeX + rangeX,
    y0: anchorY - ratioY * rangeY, y1: anchorY - ratioY * rangeY + rangeY }, full)
}

function clampDomain(view: Domain, full: Domain): Domain {
  const shiftX = view.x0 < full.x0 ? full.x0 - view.x0 : view.x1 > full.x1 ? full.x1 - view.x1 : 0
  const shiftY = view.y0 < full.y0 ? full.y0 - view.y0 : view.y1 > full.y1 ? full.y1 - view.y1 : 0
  return { x0: view.x0 + shiftX, x1: view.x1 + shiftX, y0: view.y0 + shiftY, y1: view.y1 + shiftY }
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

interface MetaMapProps {
  /** Avatar rows for the dashboard's own selection. */
  rows: readonly MetaMapRow[]
  avatarNames: ReadonlyMap<string, string>
  endpoint: string
  /** The shared format, dates, game type and set selection; compare mode replaces the dates. */
  query: string
  releasedThrough: string | null
  personal?: boolean
  altWinRate?: MetaMapWinRate
  /** Places dots by this share instead of the share of games, matching the Meta table. */
  shareAxis?: MetaMapShare
}

function MetaMapInner({ rows, avatarNames, endpoint, query, releasedThrough, personal = false, altWinRate, shareAxis }: MetaMapProps) {
  const id = useId()
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [minimumGames, setMinimumGames] = useState(DEFAULT_MINIMUM_GAMES)
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<Domain | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<{ pointers: Map<number, { x: number; y: number }>; moved: boolean; start: { x: number; y: number } | null
    lastTap: { x: number; y: number; at: number } | null }>({ pointers: new Map(), moved: false, start: null, lastTap: null })
  const [compare, setCompare] = useState(false)
  const plotAlt = Boolean(altWinRate)
  const winRateOf = altWinRate?.value ?? allGamesWinRate
  const shareOf = shareAxis?.value ?? gameShare
  const [periods, setPeriods] = useState<[Period, Period]>(() => defaultPeriods(releasedThrough))
  const [periodData, setPeriodData] = useState<Record<string, MetaMapResponse>>({})
  const [periodError, setPeriodError] = useState<string | null>(null)

  useLayoutEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(entries => setWidth(Math.round(entries[0]?.contentRect.width ?? 640)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const periodQueries = periods.map(period => {
    const params = new URLSearchParams(query)
    params.delete('from'); params.delete('through')
    if (period.from) params.set('from', period.from)
    if (period.through) params.set('through', period.through)
    return params.toString()
  }) as [string, string]
  useEffect(() => {
    if (!compare) return
    const missing = periodQueries.filter(key => !periodData[key])
    if (!missing.length) return
    const controller = new AbortController()
    setPeriodError(null)
    void Promise.all(missing.map(async key => {
      const response = await fetch(`${endpoint}/meta?${key}`, { signal: controller.signal })
      if (!response.ok) throw new Error('Period meta unavailable')
      return [key, await response.json() as MetaMapResponse] as const
    })).then(results => {
      if (!controller.signal.aborted) setPeriodData(current => ({ ...current, ...Object.fromEntries(results) }))
    }).catch(() => { if (!controller.signal.aborted) setPeriodError('Could not load one of the periods. Try different dates.') })
    return () => controller.abort()
  }, [compare, endpoint, periodQueries[0], periodQueries[1], periodData])

  const earlier = compare ? periodData[periodQueries[0]] : undefined
  const later = compare ? periodData[periodQueries[1]] : undefined
  const points = useMemo(() => toPoints(compare ? later?.avatars ?? [] : rows, avatarNames, minimumGames, winRateOf, shareOf),
    [compare, later, rows, avatarNames, minimumGames, winRateOf, shareOf])
  const previous = useMemo(() => new Map(toPoints(earlier?.avatars ?? [], avatarNames, minimumGames, winRateOf, shareOf).map(point => [point.key, point])),
    [earlier, avatarNames, minimumGames, winRateOf, shareOf])
  // Rows outside the share in use (such as Avatars nobody mains) are left off without counting as hidden.
  const hiddenCount = (compare ? later?.avatars ?? [] : rows).filter(row => row.avatarKeys.length && shareOf(row)).length - points.length

  const phone = width < 520
  const height = Math.round(Math.min(480, Math.max(300, width * (phone ? 0.95 : 0.6))))
  const margin = { top: 16, right: phone ? 12 : 20, bottom: 44, left: phone ? 40 : 48 }
  const plotted = compare ? [...points, ...points.flatMap(point => previous.get(point.key) ?? [])] : points
  const maxShare = Math.max(0.01, ...plotted.map(point => point.share))
  const fullXStep = niceStep(maxShare, phone ? 3 : 4)
  const rates = plotted.map(point => point.winRate)
  const fullYStep = (Math.max(0.6, ...rates) - Math.min(0.4, ...rates)) > 0.4 ? 0.1 : 0.05
  const full: Domain = { x0: 0, x1: Math.ceil(maxShare / fullXStep) * fullXStep,
    y0: Math.max(0, Math.floor(Math.min(0.4, ...rates) / fullYStep) * fullYStep), y1: Math.min(1, Math.ceil(Math.max(0.6, ...rates) / fullYStep) * fullYStep) }
  const domain = view ? clampDomain(view, full) : full
  const zoomed = view !== null
  // The map can measure 0 wide while its tab is hidden; keep the plot size non-negative.
  const plotWidth = Math.max(0, width - margin.left - margin.right), plotHeight = Math.max(0, height - margin.top - margin.bottom)
  const x = (share: number) => margin.left + (share - domain.x0) / (domain.x1 - domain.x0) * plotWidth
  const y = (rate: number) => margin.top + (domain.y1 - rate) / (domain.y1 - domain.y0) * plotHeight
  const inView = (point: Point) => point.share >= domain.x0 - 1e-9 && point.share <= domain.x1 + 1e-9 && point.winRate >= domain.y0 - 1e-9 && point.winRate <= domain.y1 + 1e-9
  const visible = points.filter(inView)
  const averageShare = points.length ? 1 / Math.max(points.length, 1) : 0
  const xStep = zoomed ? niceStep(domain.x1 - domain.x0, phone ? 3 : 4) : fullXStep
  const yStep = zoomed ? niceStep(domain.y1 - domain.y0, phone ? 5 : 6) : fullYStep
  const xTicks = ticksFor(domain.x0, domain.x1, xStep)
  const yTicks = ticksFor(domain.y0, domain.y1, yStep)
  // Enough decimals that every tick on a 2.5 or 0.5 point step reads exactly.
  const tickDigits = (step: number) => [0, 1, 2].find(digits => Math.abs(Math.round(step * 100 * 10 ** digits) - step * 100 * 10 ** digits) < 1e-6) ?? 2

  // Label the most played visible points first, skipping any label that would collide; zooming in reveals more names.
  const labels = useMemo(() => {
    const taken: Box[] = visible.map(point => ({ x: x(point.share) - 6, y: y(point.winRate) - 6, width: 12, height: 12 }))
    const result = new Map<string, { x: number; y: number; anchor: 'start' | 'end' }>()
    const fontWidth = phone ? 6.2 : 6.8
    const ranked = [...visible].sort((a, b) => b.share - a.share)
    const limit = zoomed ? Infinity : phone ? 7 : LABEL_LIMIT
    for (const point of ranked) {
      if (result.size >= limit && point.key !== selected) continue
      const cx = x(point.share), cy = y(point.winRate), textWidth = point.name.length * fontWidth
      const options = [
        { box: { x: cx + 9, y: cy - 8, width: textWidth, height: 16 }, label: { x: cx + 9, y: cy + 4, anchor: 'start' as const } },
        { box: { x: cx - 9 - textWidth, y: cy - 8, width: textWidth, height: 16 }, label: { x: cx - 9, y: cy + 4, anchor: 'end' as const } },
      ].filter(option => option.box.x >= margin.left - 4 && option.box.x + option.box.width <= width - 2)
      const fit = options.find(option => !taken.some(box => overlaps(box, option.box)))
      if (!fit) continue
      taken.push(fit.box)
      result.set(point.key, fit.label)
    }
    return result
  }, [visible.map(point => `${point.key}:${point.share}:${point.winRate}`).join(), width, height, domain.x0, domain.x1, domain.y0, domain.y1, selected, zoomed])

  useEffect(() => { setView(null) }, [compare, minimumGames, periodQueries[0], periodQueries[1], query, shareOf, winRateOf])

  const toData = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { share: (domain.x0 + domain.x1) / 2, rate: (domain.y0 + domain.y1) / 2 }
    return { share: domain.x0 + (clientX - rect.left - margin.left) / plotWidth * (domain.x1 - domain.x0),
      rate: domain.y1 - (clientY - rect.top - margin.top) / plotHeight * (domain.y1 - domain.y0) }
  }
  const zoomBy = (factor: number, anchor?: { share: number; rate: number }) => setView(current => {
    const base = current ? clampDomain(current, full) : full
    const point = anchor ?? { share: (base.x0 + base.x1) / 2, rate: (base.y0 + base.y1) / 2 }
    return zoomDomain(base, full, point.share, point.rate, factor)
  })
  const panBy = (dxPixels: number, dyPixels: number) => setView(current => current ? clampDomain({
    x0: current.x0 - dxPixels / plotWidth * (current.x1 - current.x0), x1: current.x1 - dxPixels / plotWidth * (current.x1 - current.x0),
    y0: current.y0 + dyPixels / plotHeight * (current.y1 - current.y0), y1: current.y1 + dyPixels / plotHeight * (current.y1 - current.y0),
  }, full) : current)

  // Ctrl/⌘ + wheel (and trackpad pinch, which browsers report the same way) zooms; a plain wheel still scrolls the page.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      zoomBy(Math.min(MAX_ZOOM_STEP, Math.max(1 / MAX_ZOOM_STEP, Math.exp(-event.deltaY * 0.01))), toData(event.clientX, event.clientY))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  })

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = gesture.current
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (state.pointers.size === 1) { state.moved = false; state.start = { x: event.clientX, y: event.clientY } }
    if (state.pointers.size === 2) svgRef.current?.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = gesture.current
    const last = state.pointers.get(event.pointerId)
    if (!last) return
    if (state.pointers.size >= 2) {
      const [a, b] = [...state.pointers.values()]
      const before = Math.hypot(a!.x - b!.x, a!.y - b!.y)
      state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      const [c, d] = [...state.pointers.values()]
      const after = Math.hypot(c!.x - d!.x, c!.y - d!.y)
      const middle = { x: (c!.x + d!.x) / 2, y: (c!.y + d!.y) / 2 }
      if (before > 0 && after > 0) zoomBy(after / before, toData(middle.x, middle.y))
      panBy((event.clientX - last.x) / 2, (event.clientY - last.y) / 2)
      state.moved = true
      return
    }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!zoomed || !state.start) return
    if (!state.moved && Math.hypot(event.clientX - state.start.x, event.clientY - state.start.y) < 6) return
    if (!state.moved) svgRef.current?.setPointerCapture(event.pointerId)
    state.moved = true
    panBy(event.clientX - last.x, event.clientY - last.y)
  }
  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    const state = gesture.current
    const wasTap = event.type === 'pointerup' && state.pointers.size === 1 && !state.moved
    state.pointers.delete(event.pointerId)
    if (state.pointers.size) return
    state.start = null
    // Double-tap (or double-click) on empty space zooms in there; browsers don't send dblclick reliably for touch.
    if (!wasTap || (event.target as Element).closest('[role="button"]')) { state.lastTap = null; return }
    const tap = { x: event.clientX, y: event.clientY, at: event.timeStamp }
    if (state.lastTap && tap.at - state.lastTap.at < 350 && Math.hypot(tap.x - state.lastTap.x, tap.y - state.lastTap.y) < 30) {
      zoomBy(MAX_ZOOM_STEP, toData(tap.x, tap.y))
      state.lastTap = null
    } else state.lastTap = tap
  }

  const tone = (rate: number) => { const step = winRateTone(rate) ?? 0; return step > 0 ? 'is-good' : step < 0 ? 'is-bad' : 'is-even' }
  const chosen = points.find(point => point.key === selected) ?? null
  const chosenBefore = chosen ? previous.get(chosen.key) ?? null : null
  const loadingPeriods = compare && (!earlier || !later) && !periodError
  const setPeriod = (index: 0 | 1, field: keyof Period, value: string) =>
    setPeriods(current => current.map((period, at) => at === index ? { ...period, [field]: value } : period) as [Period, Period])

  return <section className="game-analytics__meta-map" aria-labelledby={`${id}-title`}>
    <div className="game-analytics__meta-map-head">
      <div>
        <h3 id={`${id}-title`}>Meta map</h3>
        <p className="game-analytics__sample">Each dot is an Avatar: further right is played more, higher up wins more. {plotAlt
          ? altWinRate!.description : 'Above the line wins more than half its games.'}</p>
      </div>
      <div className="game-analytics__meta-map-tools">
        <div className="game-analytics__segmented" role="group" aria-label="Meta map periods">
          <button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>Selected dates</button>
          <button type="button" aria-pressed={compare} onClick={() => setCompare(true)}>Compare two periods</button>
        </div>
        <label className="game-analytics__threshold"><span>Min. games</span>
          <input type="number" inputMode="numeric" min={1} step={10} value={minimumGames} aria-label="Minimum games for the meta map"
            onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value)) setMinimumGames(Math.max(1, Math.round(value))) }} />
        </label>
      </div>
    </div>
    {compare ? <div className="game-analytics__meta-map-periods">
      {(['Earlier period', 'Later period'] as const).map((label, index) => <fieldset key={label}>
        <legend><span className={`game-analytics__meta-map-key${index ? ' is-later' : ''}`} aria-hidden="true" />{label}</legend>
        <label>From<input type="date" value={periods[index]!.from} max={releasedThrough ?? undefined}
          onChange={event => setPeriod(index as 0 | 1, 'from', event.target.value)} /></label>
        <label>Through<input type="date" value={periods[index]!.through} max={releasedThrough ?? undefined}
          onChange={event => setPeriod(index as 0 | 1, 'through', event.target.value)} /></label>
      </fieldset>)}
      <p className="game-analytics__sample">Arrows run from the earlier period to the later one. These dates replace the From and Through filters above for the map only{releasedThrough ? `; public data ends ${releasedThrough}` : ''}.</p>
    </div> : null}
    <div className="game-analytics__meta-map-frame" ref={frame}>
      {periodError ? <p role="alert">{periodError}</p>
        : loadingPeriods ? <p role="status">Loading both periods…</p>
          : !points.length ? <p>No Avatar has {minimumGames}+ games here yet. Lower the minimum or widen the dates.</p>
            : <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
              className={zoomed ? 'is-zoomed' : undefined}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
              onClickCapture={event => { if (gesture.current.moved) { event.stopPropagation(); gesture.current.moved = false } }}
              aria-label={`Meta map: ${points.length} Avatars by play share and win rate${compare ? ', comparing two periods' : ''}`}>
              <defs>
                <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" className="game-analytics__meta-map-arrowhead" />
                </marker>
                <clipPath id={`${id}-plot`}><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath>
              </defs>
              {yTicks.map(tick => <g key={`y${tick}`}>
                <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="game-analytics__meta-map-grid" />
                <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end" className="game-analytics__meta-map-tick">{percent(tick, tickDigits(yStep))}</text>
              </g>)}
              {xTicks.map(tick => <text key={`x${tick}`} x={x(tick)} y={height - margin.bottom + 18} textAnchor="middle"
                className="game-analytics__meta-map-tick">{percent(tick, tickDigits(xStep))}</text>)}
              <text x={(margin.left + width - margin.right) / 2} y={height - 6} textAnchor="middle" className="game-analytics__meta-map-axis">{shareAxis?.axisLabel ?? `Share of ${personal ? 'your games' : 'games'}`}</text>
              {0.5 > domain.y0 && 0.5 < domain.y1 ? <line x1={margin.left} x2={width - margin.right} y1={y(0.5)} y2={y(0.5)} className="game-analytics__meta-map-even" /> : null}
              {averageShare > domain.x0 && averageShare < domain.x1 ? <line x1={x(averageShare)} x2={x(averageShare)} y1={margin.top} y2={height - margin.bottom}
                className="game-analytics__meta-map-even" /> : null}
              <g clipPath={`url(#${id}-plot)`}>
              {compare ? points.map(point => {
                const before = previous.get(point.key)
                if (!before) return null
                const dx = x(point.share) - x(before.share), dy = y(point.winRate) - y(before.winRate)
                const length = Math.hypot(dx, dy)
                // Stop the arrow at the edge of the later dot so its head stays visible.
                const gap = length ? 9 / length : 0
                return <g key={`move-${point.key}`} className={selected && selected !== point.key ? 'is-faded' : undefined}>
                  <circle cx={x(before.share)} cy={y(before.winRate)} r={4.5} className="game-analytics__meta-map-before" />
                  {length > 10 ? <line x1={x(before.share)} y1={y(before.winRate)} x2={x(point.share) - dx * gap} y2={y(point.winRate) - dy * gap}
                    className="game-analytics__meta-map-move" markerEnd={`url(#${id}-arrow)`} /> : null}
                </g>
              }) : null}
              </g>
              {visible.map(point => {
                const label = labels.get(point.key)
                const isSelected = selected === point.key
                const description = `${point.name}: ${percent(point.share)} share, ${percent(point.winRate)} win rate, ${point.games.toLocaleString()} games`
                return <g key={point.key} role="button" tabIndex={0} aria-pressed={isSelected} aria-label={description}
                  className={`game-analytics__meta-map-point ${tone(point.winRate)}${selected && !isSelected ? ' is-faded' : ''}`}
                  onClick={() => setSelected(isSelected ? null : point.key)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(isSelected ? null : point.key) } }}>
                  <title>{description}</title>
                  <circle cx={x(point.share)} cy={y(point.winRate)} r={14} className="game-analytics__meta-map-hit" />
                  <circle cx={x(point.share)} cy={y(point.winRate)} r={isSelected ? 8 : 6} className="game-analytics__meta-map-dot" />
                  {label ? <text x={label.x} y={label.y} textAnchor={label.anchor} className="game-analytics__meta-map-label">{point.name}</text> : null}
                </g>
              })}
            </svg>}
      {points.length && !periodError && !loadingPeriods ? <div className="game-analytics__meta-map-zoom" role="group" aria-label="Meta map zoom">
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomBy(MAX_ZOOM_STEP)}>+</button>
        <button type="button" aria-label="Zoom out" title="Zoom out" disabled={!zoomed} onClick={() => zoomBy(1 / MAX_ZOOM_STEP)}>−</button>
        {zoomed ? <button type="button" className="is-reset" onClick={() => setView(null)}>Reset</button> : null}
      </div> : null}
    </div>
    <p className="game-analytics__meta-map-hint">{zoomed ? 'Drag to move around. ' : ''}Pinch, double-tap or use + to zoom in{phone ? '' : ' (Ctrl or ⌘ + scroll works too)'}.</p>
    {chosen ? <div className="game-analytics__meta-map-detail" role="status">
      <strong>{chosen.name}</strong>
      {chosenBefore ? <span>Share {percent(chosenBefore.share)} → {percent(chosen.share)} · Win rate <span className={toneClass(winRateTone(chosenBefore.winRate))}>{percent(chosenBefore.winRate)}</span> → <span className={toneClass(winRateTone(chosen.winRate))}>{percent(chosen.winRate)}</span> · {chosenBefore.games.toLocaleString()} → {chosen.games.toLocaleString()} games</span>
        : <span>{percent(chosen.share)} share · <span className={toneClass(winRateTone(chosen.winRate))}>{percent(chosen.winRate)}</span> win rate · {chosen.games.toLocaleString()} games{compare ? ' · not enough games in the earlier period' : ''}</span>}
      <button type="button" className="game-analytics-text-button" onClick={() => setSelected(null)}>Close</button>
    </div> : null}
    <p className="game-analytics__sample">Labels show the most-played Avatars. Tap a dot for any Avatar.{hiddenCount > 0 ? ` ${hiddenCount.toLocaleString()} with fewer than ${minimumGames} games ${hiddenCount === 1 ? 'is' : 'are'} hidden.` : ''} The dashed lines mark a 50% win rate and an average share.</p>
  </section>
}

export const MetaMap = memo(MetaMapInner)
