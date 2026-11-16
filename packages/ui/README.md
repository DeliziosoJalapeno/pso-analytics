# @sorc/analytics-ui

Reusable React game analytics dashboard. It depends on React 19 and expects the `/cards`, `/meta`, `/cohort`, `/query-options`, and `/cards/:cardKey/replays` endpoints described in `docs/game-analytics.md`. Styling is included by the component import.

The **Meta** tab shares format/date/game-type controls and supports `#meta-analysis-title`. The Avatars and Avatars + colors buttons switch between sortable avatar-lineup and avatar/spellbook-color breakdowns, with meta share, player-games, and win rate. Avatars is the default. Avatars + colors includes a case-insensitive partial avatar-name search and matching combination count. Search filters loaded rows without changing share denominators or sending API requests; search and sorting persist across breakdown switches. Switching breakdowns preserves their sort settings and uses the same loaded response without another API request. Imposter is classified exclusively as Imposter even when copied avatars are recorded. Colors include small spellbook splashes and exclude atlas, avatar, and sideboard cards. Colorless and unavailable colors remain distinct. All samples are shown. Meta loads on first activation, retains results across tab switches, and cancels stale requests on population changes; it does not download replays.

Top-level **Cards** and **Query data** tabs share the format, date range and game-type selection. Switching tabs preserves card filters, pagination, expanded rows, query rules and results; changing the shared population still clears stale results. Tabs support arrow keys, Home and End. Existing `#card-analysis-title`, `#combo-analysis-title` links open the corresponding view.

```tsx
import { GameAnalyticsDashboard } from '@sorc/analytics-ui'

export function AnalyticsPage() {
  return <GameAnalyticsDashboard
    title="Card analytics"
    endpoint="/api/analytics"
    replayBaseUrl="https://playsorceryonline.com/replays"
    catalog={cardCatalog}
  />
}
```

Pass a catalog with `name`, `type`, `elements`, and `rarity` to enable card quick filters, and an optional `imageUrl` for card art. Use URLs accessible from the host website. Headings inherit the host's `--font-ui` typography. The card list filters and sorts all returned cards before showing pages of 50, with independent minimum player-game counts for each numeric column. These controls only affect the card list; combination queries retain their selected game population. Suppressed rates sort last and cannot pass a positive minimum count.

**Your deck** opens a box for a pasted deck list (`3 Phase Assassin`, `Phase Assassin x3`, or one name per line; headers such as `Atlas (20)` are skipped, and sideboard, collection and maybeboard cards are left out). While it has cards, the table shows only those cards, with every other filter still applying, and names with no games are listed under the box. Parsing (`parseDeckListCards` in `cardTable.ts`) runs in the browser with no extra request.

Previous/next buttons and a page selector appear above and below the card table. The count shows the current range and total. Filter, sort, and game-population changes reset to page 1; page changes close expanded rows. Paging uses the already loaded results without another API query.

The Cards tab leads with an **At a glance** row (most included card, best played win rate, biggest in hand vs. not in hand gap, lowest in-deck win rate), computed in the browser from the loaded `/cards` response with a 100 player-game floor (20 when no card reaches 100); selecting one searches for that card. The table opens on **Key stats** (deck share, in deck, played, in hand vs. not in hand); **All stats** shows every column, and a column being sorted on always stays visible. Win rates are colored on a diverging scale around 50% (`tone.ts`), share columns carry a bar scaled to the largest share, and an expanded card shows every metric with wins, games and matches beside its art and replays. Meta shows the same highlights for Avatars and elements. A collapsed **How to read these numbers** guide sits under the title. Meta also has a **Meta map** (`MetaMap.tsx`): an SVG scatter of Avatar share against win rate, hiding Avatars below an adjustable minimum of player-games (20), labelling the most played and showing any Avatar's numbers on tap. **Compare two periods** requests `/meta` once per period (defaulting to the 30 days ending at `releasedThrough` and the 30 before, with the shared format/game type/set) and draws an arrow from each Avatar's earlier point to its later one.

The table stays a table on mobile, with horizontal scrolling and a pinned card-name column. Card-name buttons expand a detail row with card art and currently public replay links. Only the expanded card loads its art; missing or failed images show a text fallback.

Replay links can include `player` and `opponent` matchup details: `{ avatarNames: string[], colors: ('air' | 'earth' | 'fire' | 'water')[] | null }`. Compact matchup rows show circular avatar portraits from the supplied catalog and PSO element symbols, separated by “vs.” The card player is on the left and win/loss is relative to that player, independent of the linked recording's perspective. Names and colors remain in hover titles and accessible labels. Missing art uses a portrait placeholder; `null` colors show “?” and an empty array shows a colorless ring. The API includes deck colors only from each player's own currently public recording.

Column minimums pair an independent minimum player-game count with a minimum value for every numeric column. Values use percentages, or percentage points (including negative values) for “In hand vs. not in hand,” calculated as In hand win rate minus Not in hand win rate. Blank values impose no limit; explicit zero still excludes unavailable values. All limits combine before sorting and pagination. The difference sample-size limit applies to both hand cohorts; either unavailable rate makes the difference unavailable.

`personal` shows one player's own live games across all game types, without the release date, and names the Meta tab Avatars. `live` hides the public release date for hosts that serve live data. `embedded` renders inside a host page without the Home link, full-page background, or a top-level `h1`.

## Host extensions

Internal tools are not part of this package. A host adds them through props, and without them the dashboard is the public view:

- `gameTypes`: `{ value, label }[]` adds a Game type filter (plus "All") and the query builder's game type rule; the selection is sent as `queueType`. `queue` and `onQueueChange` make it controlled.
- `metaExtension`: extra Meta controls, notes, a replacement share value, extra columns (`{ key, label, header?, value, cell }`), hidden rows, a table class, and expandable Avatar rows (`rowDetails`). Rows and the Meta response carry any extra fields the endpoint returns.
- `extraTabs`: `{ key, label, anchor, render }[]` adds tabs after the built-in ones; `render` gets `{ endpoint, query, active, replayBaseUrl }`.
- `headerControls`: content beside the Home link.


The query builder searches catalog names and recorded/custom names with partial words and typo tolerance. Avatar fields show avatars; card fields show other cards. Selecting a suggestion uses its full name, while “Use …” accepts an exact custom name. Typing alone does not silently submit an unselected misspelling. Keyboard arrows, Enter and Escape work in the picker. `/query-options` returns `{ releasedThrough, dataAvailable, totalGames, options: { name, kind: 'card' | 'avatar' }[] }`, scoped to the same game selection and restricted to names seen in at least 20 player-games across 10 matches, including for the public test proxy. Catalog search/custom entry remain usable if recorded suggestions cannot load.

Both `/cards` and `/query-options` return `totalGames`: distinct games after format, dates, game type and server scope restrictions, counted once across both players. The header shows this population count beside the release date. Counts are available below rate thresholds; unavailable data is not shown as zero. Table search and column filters select cards, while combination queries report their own cohort size.

Rules offer explicit positive/negative wording, optional own-turn limits, All/Any/None groups, example queries, and a readable query summary. Card in hand and Card not in hand conditions apply only to cards in the player's deck and use complete post-mulligan hand history; unknown histories satisfy neither condition. Group sizes and nesting obey API limits. The displayed population follows the dashboard's format/date/game-type selection; queries do not filter the card table. Editing rules or population aborts pending queries and clears old results. Query results show win rates with player-game, match and win counts for any nonempty sample, including a single player-game. Empty queries show a no-matches message; unloaded data is identified separately. Queries never include replay links. Card-table rates, card replay lists and recorded-name suggestions retain their minimum sample requirements.
