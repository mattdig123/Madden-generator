# Madden Draft

A shared website for a Madden league's draft, like a small fantasy-football site.

- **League**: members join from an invite link with their name and an NFL team (logos included).
- **Draft**: the commissioner generates a randomized position order for every player (for example "QB no later than round 10"), previews and re-rolls it, then starts the draft.
- **Live board**: every player enters their own picks and everyone sees them update in real time. The round advances by itself when everyone has picked.
- **History**: finished drafts stay on the site for the whole league.

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
- `supabase/migrations/0001_league.sql`: the database. The public can only read; every write goes through checked functions (a member's private key for their own pick, a passcode for commissioner actions).
- `src/state/`: loads league data, listens for live changes, and wraps the database functions. A dev-only demo backend runs the same SQL in the browser.
- `src/components/`: the pages (League, Draft, Live board, History, Commissioner).
- `src/db/league.test.ts`: tests the real SQL, including permissions, in an in-memory Postgres.
