import { memo, useEffect, useMemo, useState } from 'react'
import type { Rate } from './cardTable'
import type { AnalyticsPopulation } from './population'
import { toneClass, winRateTone } from './tone'

type Element = 'air' | 'earth' | 'fire' | 'water'
interface SiteOffset { forward: number; right: number }
interface SiteSquare extends SiteOffset { share: number; rate: Rate }
interface SiteOpening { offsets: SiteOffset[]; share: number; rate: Rate }
export interface SiteOpeningsResponse extends AnalyticsPopulation {
  generatedAt: number
  totalPlayerGames: number
  trackedPlayerGames: number
  sites: Array<{ playerGames: number; squares: SiteSquare[] }>
  openings: SiteOpening[]
  openingPlayerGames: number
}

const ELEMENTS: Array<{ key: Element; label: string }> = [
  { key: 'air', label: 'Air' }, { key: 'earth', label: 'Earth' }, { key: 'fire', label: 'Fire' }, { key: 'water', label: 'Water' },
]
const SITE_LABELS = ['2nd site', '3rd site']
const DEFAULT_MINIMUM_GAMES = 10
type ColorMode = 'share' | 'winRate'
type OpeningSort = 'share' | 'winRate'

interface Bounds { back: number; forward: number; left: number; right: number }
// Always show at least the squares next to home, so boards keep a familiar size.
const MINIMUM_BOUNDS: Bounds = { back: 0, forward: 2, left: -2, right: 2 }

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function offsetName({ forward, right }: SiteOffset): string {
  if (!forward && !right) return 'Home site'
  const parts = [forward ? `${Math.abs(forward)} ${forward > 0 ? 'forward' : 'back'}` : '',
    right ? `${Math.abs(right)} ${right > 0 ? 'right' : 'left'}` : ''].filter(Boolean)
  return `${parts.join(', ')} from home`
}

/** Home is the middle of the player's back row, so nothing is drawn behind it. */
function boundsOf(offsets: Iterable<SiteOffset>, minimum: Bounds): Bounds {
  const bounds = { ...minimum }
  for (const { forward, right } of offsets) {
    if (forward < 0) continue
    bounds.forward = Math.max(bounds.forward, forward)
    bounds.left = Math.min(bounds.left, right)
    bounds.right = Math.max(bounds.right, right)
  }
  return bounds
}

/** Squares from the player's side: the furthest-forward row first, so home sits toward the bottom. */
function displayOffsets(bounds: Bounds): SiteOffset[] {
  const offsets: SiteOffset[] = []
  for (let forward = bounds.forward; forward >= bounds.back; forward--) {
    for (let right = bounds.left; right <= bounds.right; right++) offsets.push({ forward, right })
  }
  return offsets
}

const offsetKey = ({ forward, right }: SiteOffset) => `${forward},${right}`

function heat(mode: ColorMode, share: number, winRate: number | null, maxShare: number): string | undefined {
  if (mode === 'share') return share > 0 ? `rgba(215, 184, 109, ${(0.08 + 0.55 * share / Math.max(maxShare, 0.0001)).toFixed(3)})` : undefined
  if (winRate === null) return undefined
  const strength = Math.min(1, Math.abs(winRate - 0.5) / 0.15)
  return winRate >= 0.5 ? `rgba(76, 186, 134, ${(0.1 + 0.45 * strength).toFixed(3)})` : `rgba(226, 112, 92, ${(0.1 + 0.45 * strength).toFixed(3)})`
}

interface SiteBoardProps {
  label: string
  playerGames: number
  squares: SiteSquare[]
  bounds: Bounds
  mode: ColorMode
  minimumGames: number
}

function SiteBoardInner({ label, playerGames, squares, bounds, mode, minimumGames }: SiteBoardProps) {
  const byOffset = new Map(squares.map(entry => [offsetKey(entry), entry]))
  const maxShare = Math.max(0, ...squares.map(entry => entry.share))
  return <figure className="game-analytics__site-board">
    <figcaption><span>{label}</span><span className="game-analytics__sample">{playerGames.toLocaleString()} games</span></figcaption>
    <div className="game-analytics__site-grid" role="grid" aria-label={`${label} squares relative to home`}
      style={{ gridTemplateColumns: `repeat(${bounds.right - bounds.left + 1}, minmax(0, 1fr))` }}>
      {displayOffsets(bounds).map(offset => {
        const home = !offset.forward && !offset.right
        const entry = byOffset.get(offsetKey(offset))
        const games = entry?.rate.playerGames ?? 0
        const small = games < minimumGames
        const winRate = small ? null : entry?.rate.winRate ?? null
        const description = home ? 'Home site' : entry ? `${offsetName(offset)}: ${percent(entry.share)} of games · ${games.toLocaleString()} games · win rate ${percent(entry.rate.winRate)}`
          : `${offsetName(offset)}: no games`
        return <div key={offsetKey(offset)} role="gridcell" title={description} aria-label={description}
          className={`game-analytics__site-square${home ? ' is-home' : ''}${small ? ' is-small' : ''}`}
          style={{ background: entry ? heat(mode, entry.share, winRate, maxShare) : undefined }}>
          {home ? <span className="game-analytics__site-home">Home</span> : entry ? <>
            <span className="game-analytics__site-share">{percent(entry.share)}</span>
            <span className="game-analytics__site-rate">{winRate === null ? `${games} g` : `${percent(winRate)} WR`}</span>
          </> : null}
        </div>
      })}
    </div>
  </figure>
}

const SiteBoard = memo(SiteBoardInner)

function OpeningShapeInner({ offsets, bounds }: { offsets: SiteOffset[]; bounds: Bounds }) {
  const marked = new Set(offsets.map(offsetKey))
  return <span className="game-analytics__site-shape" role="img" aria-label={`Home, then ${offsets.map(offsetName).join('; ')}`}
    style={{ gridTemplateColumns: `repeat(${bounds.right - bounds.left + 1}, 10px)` }}>
    {displayOffsets(bounds).map(offset => <span key={offsetKey(offset)}
      className={!offset.forward && !offset.right ? 'is-home' : marked.has(offsetKey(offset)) ? 'is-marked' : undefined} />)}
  </span>
}

const OpeningShape = memo(OpeningShapeInner)

interface SiteOpeningsProps {
  endpoint: string
  /** The shared format, dates, game type and set selection. */
  query: string
  active: boolean
  avatarOptions: readonly string[]
  /** Reports the filtered population for the page header, keyed by the shared selection. */
  onPopulation: (key: string, data: AnalyticsPopulation | null) => void
}

function SiteOpeningsInner({ endpoint, query, active, avatarOptions, onPopulation }: SiteOpeningsProps) {
  const [avatar, setAvatar] = useState('')
  const [turnOrder, setTurnOrder] = useState<'' | 'first' | 'second'>('')
  const [elements, setElements] = useState<ReadonlySet<Element | 'none'>>(() => new Set())
  const [mode, setMode] = useState<ColorMode>('share')
  const [minimumGames, setMinimumGames] = useState(DEFAULT_MINIMUM_GAMES)
  const [sort, setSort] = useState<OpeningSort>('share')
  const [result, setResult] = useState<{ key: string; data: SiteOpeningsResponse } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const params = new URLSearchParams(query)
  if (avatar) params.set('avatar', avatar)
  if (turnOrder) params.set('turnOrder', turnOrder)
  if (elements.size) params.set('elements', elements.has('none') ? 'none' : ELEMENTS.filter(({ key }) => elements.has(key)).map(({ key }) => key).join(','))
  const requestQuery = params.toString()
  const key = `${endpoint}?${requestQuery}`
  const data = result?.key === key ? result.data : null

  useEffect(() => {
    if (!active || result?.key === key) return
    const controller = new AbortController()
    setError(null)
    const load = async () => {
      try {
        const response = await fetch(`${endpoint}/site-openings?${requestQuery}`, { signal: controller.signal })
        if (!response.ok) throw new Error('Site openings could not be loaded')
        const value = await response.json() as SiteOpeningsResponse
        if (!controller.signal.aborted) setResult({ key, data: value })
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : 'Could not load site openings')
      }
    }
    void load()
    return () => controller.abort()
  }, [active, endpoint, requestQuery, key, retry])

  useEffect(() => { if (active) onPopulation(`${endpoint}?${query}`, data) }, [active, endpoint, query, data, onPopulation])

  const toggleElement = (element: Element | 'none') => setElements(current => {
    const next = new Set(current)
    if (element === 'none') return current.has('none') ? new Set() : new Set(['none'])
    next.delete('none')
    if (next.has(element)) next.delete(element)
    else next.add(element)
    return next
  })
  const openings = useMemo(() => (data?.openings ?? [])
    .filter(opening => (opening.rate.playerGames ?? 0) >= minimumGames)
    .sort((left, right) => sort === 'share' ? right.share - left.share
      : (right.rate.winRate ?? -1) - (left.rate.winRate ?? -1) || right.share - left.share), [data, minimumGames, sort])
  const boardBounds = useMemo(() => boundsOf((data?.sites ?? []).flatMap(site => site.squares), MINIMUM_BOUNDS), [data])
  const shapeBounds = useMemo(() => boundsOf(openings.flatMap(opening => opening.offsets), { back: 0, forward: 1, left: -1, right: 1 }), [openings])

  return <section className="game-analytics__panel" aria-labelledby="site-openings-title">
    <h2 id="site-openings-title">Site openings</h2>
    <p className="game-analytics__hint">Where each player put their second and third sites relative to home, the middle of their own back row where the Avatar starts, seen from their own side of the realm: forward is toward the opponent. Win rates are for the player who played the sites.</p>
    <div className="game-analytics__card-tools">
      <select aria-label="Avatar" value={avatar} onChange={event => setAvatar(event.target.value)}>
        <option value="">Any Avatar</option>
        {avatarOptions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <select aria-label="Turn order" value={turnOrder} onChange={event => setTurnOrder(event.target.value as '' | 'first' | 'second')}>
        <option value="">Going first or second</option>
        <option value="first">Going first</option>
        <option value="second">Going second</option>
      </select>
      <div className="game-analytics__meta-views game-analytics__site-elements" role="group" aria-label="Spellbook elements (exact)">
        <button type="button" aria-pressed={elements.size === 0} onClick={() => setElements(new Set())}>Any elements</button>
        {ELEMENTS.map(({ key: element, label }) => <button key={element} type="button" aria-pressed={elements.has(element)}
          onClick={() => toggleElement(element)}>{label}</button>)}
        <button type="button" aria-pressed={elements.has('none')} onClick={() => toggleElement('none')}>Colorless</button>
      </div>
    </div>
    {elements.size && !elements.has('none') ? <p className="game-analytics__sample">Decks whose spells need exactly {ELEMENTS.filter(({ key: element }) => elements.has(element)).map(({ label }) => label).join(' + ')}.</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></p>
      : !data ? <p role="status">Loading site openings…</p>
        : !data.dataAvailable ? <p role="status">Analytics data not loaded.</p>
          : !data.totalPlayerGames ? <p>No games match this selection.</p>
            : !data.trackedPlayerGames ? <p>None of these {data.totalPlayerGames.toLocaleString()} player-games have site positions recorded yet.</p>
              : <>
                <p className="game-analytics__sample">{data.trackedPlayerGames.toLocaleString()} of {data.totalPlayerGames.toLocaleString()} player-games have site positions recorded.</p>
                <div className="game-analytics__site-controls">
                  <div className="game-analytics__meta-views" role="group" aria-label="Square shading">
                    <button type="button" aria-pressed={mode === 'share'} onClick={() => setMode('share')}>Shade by share</button>
                    <button type="button" aria-pressed={mode === 'winRate'} onClick={() => setMode('winRate')}>Shade by win rate</button>
                  </div>
                  <label className="game-analytics__threshold">
                    <span>Min. games</span>
                    <input type="number" inputMode="numeric" min={0} step={5} value={minimumGames} aria-label="Minimum games for a win rate"
                      onChange={event => {
                        const value = event.target.valueAsNumber
                        if (Number.isFinite(value)) setMinimumGames(Math.max(0, Math.round(value)))
                      }} />
                  </label>
                </div>
                <div className="game-analytics__site-boards">
                  {data.sites.map((site, index) => <SiteBoard key={index} label={SITE_LABELS[index] ?? `Site ${index + 2}`}
                    playerGames={site.playerGames} squares={site.squares} bounds={boardBounds} mode={mode} minimumGames={minimumGames} />)}
                </div>
                <div className="game-analytics__panel-heading game-analytics__site-openings-heading">
                  <h3>Three-site openings</h3>
                  <span className="game-analytics__card-count" role="status">
                    {openings.length.toLocaleString()} shapes with {minimumGames}+ games · {data.openingPlayerGames.toLocaleString()} games played three sites
                  </span>
                </div>
                <p className="game-analytics__sample">Home plus the squares of the next two sites, in either order.</p>
                {openings.length === 0 ? <p>No opening reaches the minimum games. Lower it to see smaller samples.</p>
                  : <div className="game-analytics__table-wrap" tabIndex={0} aria-label="Three-site openings">
                    <table className="game-analytics__site-table"><thead><tr>
                      <th scope="col">Opening</th>
                      <th scope="col" aria-sort={sort === 'share' ? 'descending' : 'none'}>
                        <button type="button" className="game-analytics__sort" onClick={() => setSort('share')}>Share{sort === 'share' ? ' ↓' : ''}</button></th>
                      <th scope="col">Games</th>
                      <th scope="col" aria-sort={sort === 'winRate' ? 'descending' : 'none'}>
                        <button type="button" className="game-analytics__sort" onClick={() => setSort('winRate')}>Win rate{sort === 'winRate' ? ' ↓' : ''}</button></th>
                    </tr></thead>
                    <tbody>{openings.map(opening => <tr key={opening.offsets.map(offsetKey).join(';')}>
                      <th scope="row"><OpeningShape offsets={opening.offsets} bounds={shapeBounds} /></th>
                      <td data-label="Share">{percent(opening.share)}</td>
                      <td data-label="Games">{opening.rate.playerGames?.toLocaleString() ?? '—'}</td>
                      <td data-label="Win rate"><span className={`game-analytics__pill ${toneClass(winRateTone(opening.rate.winRate))}`}>{percent(opening.rate.winRate)}</span></td>
                    </tr>)}</tbody></table>
                  </div>}
              </>}
  </section>
}

export const SiteOpenings = memo(SiteOpeningsInner)
