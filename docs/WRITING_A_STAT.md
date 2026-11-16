# Proposing a new stat

PSO computes every number on its servers from per-player game rows, so a new stat has two halves:

1. **Here:** you prove the stat is worth having and that replays can support it, and you build how it is shown.
2. **In the main PSO repo:** the PSO team adds the server side, such as a new field on the game rows, an aggregation, a route, and any backfill or index.

## 1. Prototype it over the sample replay

```sh
cp examples/played-by-turn.ts examples/my-stat.ts
npx tsx examples/my-stat.ts fixtures/replays
```

The API does not serve replays, so prototype on the made-up replay in `fixtures/replays` (or add your own made-up ones there). `packages/replay` gives you the building blocks: `frames` (each table state in order), `turnSnapshots` (the table at the end of each turn), `playedCards`, `cardsOnBoard` and `realmSquareAt`. Read [REPLAY_FORMAT.md](REPLAY_FORMAT.md) for what is and isn't recorded.

Things to check before proposing:

- **How often can you tell?** Count the replays where your stat is unknown or ambiguous, not just the answer on the rest. Players move cards by hand, forget the turn button and set life by hand.
- **Is it per player-game?** The server works on one row per player per game. Stats that fit that shape (a number or a few flags per player-game) are cheap to add. Stats across games, or that need both players' hidden cards, are harder.
- **Does it need hidden information?** A replay only shows its own player's hand. If the stat needs both hands, it only works when both replays are public.
- **Does it survive small samples?** Say how many games it needs before the number means something.

## 2. Open an issue with the proposal

Use the **Stat proposal** issue template. Include:

- what the stat answers and who it helps (players building decks, people judging the meta…);
- the exact definition, including what counts as unknown;
- your prototype's results over N replays, with the share of unknowns;
- where it would show up in the dashboard, with a sketch or a screenshot if you have one;
- the example script (in the pull request, or pasted).

Don't include individual replays or anything that singles out a game or player.

## 3. Build the UI against fixtures

While the server half is built, add the display in `packages/ui` against a fixture: extend the JSON in `fixtures/api/` with the fields you proposed and show them. Mark new fields optional so the UI still works before PSO serves them. When the PSO route ships, the dev site's live mode shows the real numbers.
