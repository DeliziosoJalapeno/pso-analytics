# Contributing

Thanks for helping.

## How changes get in

1. Fork the repo on GitHub.
2. Make a branch in your fork, commit, and push.
3. Open a pull request against `play-sorcery-online/pso-analytics` `main`. Fill in the template.
4. The PSO team reviews it. Once merged, the change goes live with the next PSO release; there is no separate deploy.

Keep each pull request to one idea. Small ones are reviewed faster.

## What fits here

- **Dashboard changes** in `packages/ui`: clearer tables, new charts over data the API already returns, better phone layouts, explanations, accessibility.
- **Replay tooling** in `packages/replay` and `examples/`.
- **Stat proposals**: a prototype over real replays plus a write-up. See [docs/WRITING_A_STAT.md](docs/WRITING_A_STAT.md). The server half is built in the main PSO repo.
- **Docs** fixes, especially wherever the data surprised you.

## Ground rules for `packages/ui`

- PSO and the dev site both render this package. Keep it free of PSO-only code: no imports from outside the package, no admin features, no secrets. A host adds its own extras through the extension props (see `packages/ui/README.md`).
- Keep the public exports working: `@sorc/analytics-ui`, `/card-table`, `/query-model`. PSO's deck builder imports `card-table`.
- Don't add dependencies without asking first in the pull request; the package ships inside PSO's bundle.
- Check it on a phone-width window (about 390px) as well as desktop.
- Requests only go to the routes in [docs/API.md](docs/API.md), relative to the `endpoint` prop.

## Before you open a pull request

```sh
npm run check
```

That runs the typecheck, the tests and the build, the same as CI. For UI changes, add a screenshot to the pull request.

## Data terms

Follow the terms on [playsorceryonline.com/analytics-developers](https://playsorceryonline.com/analytics-developers).

- Never commit your key or `.env.local`. If a key leaks, delete it on that page and make a new one.
- Don't try to work out who played a game, and don't publish anything about single games or players. Share aggregates.
- Stay within the limits; don't spread work over extra accounts.
