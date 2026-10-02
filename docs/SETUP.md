# Setting up the league site

The site is a static React app plus a free Supabase project that stores the league and sends live updates.
Setup takes about 15 minutes and you only do it once.

## 1. Create the Supabase project

1. Sign in at <https://supabase.com> and click **New project**. Pick any name and region, and save the database password somewhere safe (you will not need it for this app).
2. Wait for the project to finish provisioning.

## 2. Create the tables and functions

1. In the project, open **SQL Editor** and click **New query**.
2. Paste the whole contents of [`supabase/migrations/0001_league.sql`](../supabase/migrations/0001_league.sql) and click **Run**. It should finish with "Success".

## 3. Create your league (this makes you the commissioner)

In the same SQL editor, run this with your own values:

```sql
select bootstrap_league('Your League Name', 'a-long-commissioner-passcode', 'invite-code');
```

- **League name**: shown at the top of the site.
- **Commissioner passcode** (8+ characters): unlocks the Commissioner tab. Make it long and unique. It is stored hashed and is never written to the repo.
- **Invite code** (4+ characters): members need this to join. It goes into the invite link the app builds for you.

You run this yourself, in the dashboard, because the website is deliberately not allowed to call it. Nobody who finds the site can claim the commissioner role.

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

1. Open the site, go to **Commissioner**, and enter your passcode.
2. Copy the **invite link** and send it to the league. Each person opens it, types their name and picks their team.
3. When everyone has joined, click **Create draft preview**. Look over the positions on the **Draft** tab. Re-roll everyone, or one person, until you are happy.
4. Click **Start draft**. Positions lock and the **Live board** opens for everyone.
5. Each player types their pick in their own column and presses Enter. Everyone sees it right away. When every player has entered a pick for the round, the board moves to the next round by itself.
6. You can enter or fix anyone's pick, move the round, or turn auto-advance off from the Live board.
7. When every cell is filled the draft completes by itself and is kept in **History**. You can also end one early from the Commissioner tab.

## Good to know

- **Someone switched phones or cleared their browser?** In **Commissioner > Members**, click **Sign-in link** next to their name and send it to them. It signs them in again. The old sign-in on any other device stops working.
- **Anyone can watch, only members can pick.** The site is public to anyone with the link. Joining needs the invite code, entering a pick needs that member's own sign-in, and everything else needs your passcode.
- **No logins or passwords for members.** Sign-in is a private key stored in the person's browser. That is the right level for a friends' league, not for a public product.
- **Free Supabase projects pause after a week with no use.** If the site shows an error after a long gap, open the project in the dashboard and click **Restore**. Visit it a day or two before draft night.
- **Backups.** Past drafts live in the database. In Supabase, **Table Editor** lets you export the `drafts` and `picks` tables as CSV.
- **Live updates not appearing?** The migration adds the tables to Supabase's realtime publication. If it did not take, open **Database > Replication** and make sure `league`, `members`, `drafts` and `picks` are enabled. The site also re-checks every 10 seconds on its own.

## Trying it without Supabase

Run `npm run dev` and open `http://localhost:5173/?demo`. This runs the same database code inside your browser with a practice league (commissioner passcode `demo-passcode`, invite code `DEMO`). It only exists in your browser, so use it to try things out, not to run a real draft. Add `?demo=reset` to wipe it and start over.
