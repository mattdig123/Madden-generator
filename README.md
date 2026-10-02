# Madden Draft

A shared website for a Madden league's draft, like a small fantasy-football site.

- **Players**: add everyone from one screen with their name and an NFL team (logos included). Nobody has to join.
- **Draft**: generate a randomized position order for every player (for example "QB no later than round 10"), preview and re-roll it, then start the draft.
- **Live board**: anyone with the league link can mark picks, from one screen or many phones, and everyone watching sees them update in real time. Tap a position to mark it picked, or type who was taken; names are optional. The round advances by itself when every player has a pick.
- **History**: finished drafts stay on the site for the whole league.
- **Access**: no accounts. Anyone with the league link can make changes; everyone else can watch.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/?demo works with no setup
npm test           # engine tests and database tests
npm run build      # static site in dist/
```

To run a real league you need a free Supabase project and a static host. See **[docs/SETUP.md](docs/SETUP.md)**.

## How it is built

- `src/core/`: the draft engine (seeded shuffle, rules, 31-slot roster, NFL teams). Pure TypeScript, no React. Positions are derived from a stored seed, so every browser computes the identical grid.
- `supabase/migrations/`: the database. The public can only read; every write goes through checked functions that take the shared league key.
- `src/state/`: loads league data, listens for live changes, and wraps the database functions. A dev-only demo backend runs the same SQL in the browser.
- `src/components/`: the pages (Players, Draft, Live board, History, Setup).
- `src/db/league.test.ts`: tests the real SQL, including permissions, in an in-memory Postgres.
