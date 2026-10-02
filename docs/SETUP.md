# Setting up the league site

The site is a static React app plus a free Supabase project that stores the league and sends live updates.
Setup takes about 15 minutes and you only do it once.

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and click **New project**. Pick any name and region, and save the database password somewhere safe (you will not need it for this app).
2. Wait for the project to finish provisioning.

## 2. Create the tables and functions

In the project, open **SQL Editor**, click **New query**, paste a file, and click **Run**. Do these two, in order, each in its own query:

1. [`supabase/migrations/0001_league.sql`](../supabase/migrations/0001_league.sql)
2. [`supabase/migrations/0002_shared_key.sql`](../supabase/migrations/0002_shared_key.sql)

Each should finish with "Success". (If you set the league up before the shared-key change, you only need to run 0002; it keeps your players, drafts and picks.)

## 3. Create your league

In the same SQL editor, run this with your own values:

```sql
select bootstrap_league('Your League Name', 'a-long-random-league-key');
```

- **League name**: shown at the top of the site.
- **League key** (12+ characters): the secret in your league link. Anyone who has it can add players, change settings, start drafts and enter picks. Make it long and random (you can replace it later from the Setup tab, which generates a strong one for you).

You run this yourself, in the dashboard, because the website is deliberately not allowed to call it.

## 4. Connect the site to the project

In Supabase, open **Project Settings > API** and copy:

- **Project URL**
- **anon public** key (public by design; the database blocks anything it should not allow)

For local use, copy `.env.example` to `.env.local` and fill in both values, then run `npm install` and `npm run dev`.

## 5. Put it online

Any static host works. Netlify, Cloudflare Pages and Vercel all have free plans and work with a private GitHub repo.

1. Create a new site from the GitHub repo.
2. Build command: `npm run build`. Output folder: `dist`.
3. Add two environment variables in the host's settings: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as above).
4. Deploy. Every push to `main` redeploys automatically.

## Draft night

1. Open your **league link**: `https://your-site/?key=your-league-key`. It remembers the key on that device, so you only need the link once. On the Setup tab you can copy the link at any time.
2. On the **Players** tab, add everyone from one screen: type a name, choose their team, press Enter, repeat. Nobody has to join on their own.
3. On the **Setup** tab, set the rules if you want (for example "QB by round 10") and click **Create draft preview**. Look over the positions on the **Draft** tab, and re-roll everyone or one person until you are happy.
4. Click **Start draft**. Positions lock and the **Live board** opens for everyone.
5. Type each pick under the player's position and press Enter. The cursor moves to the next player. When every player has a pick for the round, the board moves to the next round by itself.
6. Anyone with the link can use the board at the same time, for example each person on their own phone. Anyone without the link can watch live by using the plain site address.
7. When every cell is filled the draft completes by itself and is kept in **History**. You can also end one early from the Setup tab.

## Good to know

- **Who can change things:** anyone who has the league link. There is no commissioner and no passwords. Send the link only to people you trust. If it ends up somewhere it should not, use **Setup > Make a new league link**: the old key stops working immediately and you send the new link to your group.
- **Watching needs no link.** The plain site address shows everything live and is read-only.
- **"This is me":** on the Players tab you can mark which player you are on your device, which highlights your column on the board. It is just a bookmark on that device.
- **Free Supabase projects pause after a week with no use.** If the site shows an error after a long gap, open the project in the dashboard and click **Restore**. Visit it a day or two before draft night.
- **Backups.** Past drafts live in the database. In Supabase, **Table Editor** lets you export the `drafts` and `picks` tables as CSV.
- **Live updates not appearing?** The migration adds the tables to Supabase's realtime publication. If it did not take, open **Database > Replication** and make sure `league`, `members`, `drafts` and `picks` are enabled. The site also re-checks every 10 seconds on its own.

## Trying it without Supabase

Run `npm run dev` and open `http://localhost:5173/?demo`. This runs the same database code inside your browser with a practice league (league key `demo-league-key`; open `/?demo&key=demo-league-key` to make changes). It only exists in your browser, so use it to try things out, not to run a real draft. Add `?demo=reset` to wipe it and start over.
