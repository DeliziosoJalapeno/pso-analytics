# How it fits together

```text
players' games ─► PSO game rows (one row per player-game, daily)
                         │
                         ▼
              PSO analytics worker (aggregates, caches)
                         │
       ┌─────────────────┴──────────────┐
       ▼                                ▼
 /api/game-analytics                 /api/v1/analytics
 (playsorceryonline.com/             (public API, your key;
  game-analytics)                     apps/dev proxies it)
       └──────── both render packages/ui ────────┘
```

- **`packages/ui`** is the dashboard. It only knows an `endpoint` and the routes in [API.md](API.md). PSO adds its own extras through extension props in its own code, which is why none of that is here.
- **Releases.** When PSO ships, its release script copies this repo's `main` `packages/ui` into the PSO repo and builds it into the site. A merged pull request goes live with the next PSO release.
- **Keys.** Any PSO player signed in with Discord can make API keys on the analytics developers page; PSO stores only a hash of each key.

## This repo

| Path | What |
| --- | --- |
| `packages/ui` | The dashboard (`@sorc/analytics-ui`) |
| `packages/replay` | Replay reader (`@pso-analytics/replay`) |
| `apps/dev` | Local dev site: fixtures, or live data through your key |
| `fixtures/api` | Sample API responses (made-up games run through PSO's real aggregation code) |
| `fixtures/catalog.json` | Card names, types, elements and rarities |
| `fixtures/replays` | A small made-up replay |
| `examples/` | Stat prototypes over replays (the made-up one in `fixtures/replays`) |
