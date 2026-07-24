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

## Turn on shared sync (both phones see the same data)

1. Create a free project at https://supabase.com.
2. In the Supabase dashboard, open **SQL Editor**, paste [sql/setup.sql](sql/setup.sql),
   replace `CHANGE_ME_FAMILY_PASSPHRASE` with your own long passphrase, and Run.
3. In **Project Settings → Data API**, copy the **Project URL** and the
   **anon / publishable key** (never the `service_role` key) into
   [js/config.js](js/config.js). These two values are safe to publish; the
   passphrase is not — it is never committed to the repo.
4. In the app, open **Settings → Family passphrase** on each phone and enter
   the passphrase from step 2. Settings shows "Shared sync: ✅ Synced".

To revoke access (e.g. leaked passphrase): re-run the
`create or replace function public.family_key_ok()` block in setup.sql with a
new passphrase, then enter the new passphrase in Settings on both phones.

## Deploy free

Any static host works: Cloudflare Pages, Vercel, GitHub Pages, Netlify.
Upload the folder as-is (no build step). Then on each iPhone: open the URL in
Safari → Share → **Add to Home Screen**.

## Notes

- Sync is local-first: entries save instantly on-device and queue if offline.
- Settings (birthdate, engine choice, your name) are per-device — set the
  birthdate on both phones.
- Diaper logging auto-hides after the first month (override in Settings).
