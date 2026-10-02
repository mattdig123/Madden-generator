# Madden Draft Generator

Generates a position-per-round draft order for every player in a Madden league.

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests for generation, rules and share links
npm run build      # static site in dist/ (works on GitHub Pages or any static host)
```

- **Rules**: edit on the Setup tab. The default is "QB no later than round 10".
- **Roster**: edit on the Setup tab (defaults to the 31-slot league roster).
- **Share link**: encodes seed, names, rules and roster, so the recipient sees the identical draft.
- **History and Live board**: saved in this browser's localStorage only. Use Export/Import to back up or move drafts.

Core logic is in `src/core/` (pure TypeScript, no React). State is in `src/state/`, UI in `src/components/`.
