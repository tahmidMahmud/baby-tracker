# Baby Tracker

A free PWA for two parents to track a baby's sleep, feeds, and diapers, with
next-nap suggestions from two selectable methodologies (Taking Cara Babies /
Huckleberry-style — see [docs/research.md](docs/research.md) for the verified
numbers and sources).

## Run locally

```bash
python3 -m http.server 8642
```

Then open http://localhost:8642.

## Turn on shared sync (multi-tenant: any number of families)

One deployment + one Supabase project serves many families; each family's
passphrase scopes it to its own data via row-level security.

1. Create a free project at https://supabase.com.
2. In the Supabase dashboard, open **SQL Editor**, paste [sql/setup.sql](sql/setup.sql), Run.
3. In **Project Settings → Data API**, copy the **Project URL** and the
   **anon / publishable key** (never the `service_role` key) into
   [js/config.js](js/config.js). These two values are safe to publish;
   passphrases are not — they're never in the repo (only sha256 hashes are
   stored server-side).
4. In the app, open **Settings** → tap **Create a new family**. The app
   generates a passphrase — share it privately with your partner, who enters
   it once in Settings on their phone. Both phones show "Synced".

Joining an existing family = entering its passphrase in Settings. A lost
passphrase can't be recovered (only hashes are stored) — but data isn't lost:
insert a new hash for your family row in SQL to rotate the key.

## Deploy free

Any static host works: Cloudflare Pages, Vercel, GitHub Pages, Netlify.
Upload the folder as-is (no build step). Then on each iPhone: open the URL in
Safari → Share → **Add to Home Screen**.

## Notes

- Sync is local-first: entries save instantly on-device and queue if offline.
- Settings (birthdate, engine choice, your name) are per-device — set the
  birthdate on both phones.
- Diaper logging auto-hides after the first month (override in Settings).
