# ALPreps Index

AHSAA high school football power ratings for 2026. Next.js on Vercel, Supabase
for storage.

`PROJECT.md` documents the rating engine itself and the rules that are not
obvious from reading the code. Read it before changing anything in
`src/lib/engine.ts`.

---

## Setup

### 1. Database

Run `supabase/schema.sql` in your Supabase project's SQL editor. It creates the
tables, the row-level security policies (public reads, service-role writes) and
the `updated_at` triggers.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key and
service role key from **Project Settings → API**.

Generate the admin credentials:

```bash
npm run hash-password -- "a long password you'll remember"
```

Paste the two lines it prints into `.env.local`. The password itself is never
stored — only a PBKDF2 hash.

### 3. Load the data

**No terminal? Use the SQL editor.** Open your Supabase project → SQL Editor,
paste the contents of `supabase/seed.sql`, and run it. That is the whole
dataset — 393 teams, 392 preseason ratings, 90 name aliases, the formula
config, and the 139-game Week 0 schedule.

Ratings appear as soon as you open the site. Hit **Recompute & publish** in the
admin once to cache them.

**With a terminal**, this does the same thing and also publishes the snapshot:

```bash
npm install
npm run setup -- --dry-run   # report everything, write nothing
npm run setup                # write it
```

Either route is idempotent and safe to re-run mid-season. Teams upsert by name,
games upsert on their natural key, and **a game that already has scores is
never touched** — nor is a formula config you have already tuned. Both
behaviors are verified against a real Postgres instance, not just asserted.

Regenerate the SQL after changing anything in `data/`:

```bash
npm run seed:sql
```

### 4. Run locally (optional)

```bash
npm run dev
```

Public site at `/`, admin at `/admin`.

### 5. Deploy to Vercel

1. **Import the repo.** vercel.com → Add New → Project → pick this repo.
   Framework detection and build settings need no changes.

2. **Add four environment variables** (Settings → Environment Variables), for
   Production, Preview and Development:

   | Variable | Where to find it |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, `anon` `public` key |
   | `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key — **server-side only, never expose it** |
   | `ADMIN_PASSWORD_HASH` | see step 3 below |
   | `ADMIN_SESSION_SECRET` | see step 3 below |

3. **Generate the admin credentials.** Deploy once with just the Supabase
   variables, then visit **`/admin/setup`** on the deployed site. Enter a
   password and it prints both admin variables to paste into Vercel. The
   hashing happens in the page — the password itself is never transmitted.

   With a terminal, `npm run hash-password -- "your password"` does the same.

4. **Redeploy** so the new variables take effect, then sign in at `/admin`.

`/admin/setup` and `/admin/login` are the only unauthenticated admin routes.
Setup reads no data and grants no access; it is a calculator.

---

## Weekly workflow

1. **Import the week** — Admin → Import → AHSAA sheet. Open the association's
   weekly Google Sheet, select the whole tab and paste it in (or download it as
   CSV and upload that), pick the week, review the parse report, import. The
   older weekly PDF still works under the AHSAA PDF tab. Classification always
   comes from your roster, never the sheet. Games that already have scores are
   never overwritten.
2. **Enter results** — either Admin → Games one at a time, or Admin → Import →
   Weekly scores for a CSV of the whole week.
3. **Publish** — Admin → Dashboard → Recompute & publish.

Nothing you change reaches the public site until you publish, and ratings never
move on their own. A game only counts once **both** scores are present, so the
full season schedule can be loaded in advance without affecting anything.

---

## Admin

| Page | What it does |
|---|---|
| Dashboard | Counts, current formula, publish button with a top-10 preview |
| Games | Add, edit and delete games; filter by week, search, show unplayed only |
| Import | The AHSAA weekly sheet (pasted or as CSV); your own score CSV; the older AHSAA PDF |
| Formula | Sliders for every tunable, with a live top-25 preview showing rank movement before you save |
| Teams | Edit names, classification, region and preseason rating; bulk-import priors |

Renaming a team also rewrites its games, since games reference teams by name.

---

## Scripts

```bash
npm run test:engine       # 24 invariant checks on the rating engine
npm run validate          # reproduce the 2025 ratings from the 2025 export
npm run smoke             # roster → PDF → engine, end to end, no database
npm run parse-schedule    # parse report for a schedule PDF
npm run test:sheet        # the AHSAA weekly Google Sheet, against a real week
npm run typecheck
```

### Previewing without a database

```bash
npm run preview -- --played   # builds scripts/out/preview.json from the CSVs
npm run preview:serve         # serves the real UI against it
```

Useful for design work — renders all 393 teams and the Week 0 schedule with no
Supabase connection. `--played` invents deterministic results so records,
efficiency columns and result labels are populated.

---

## Layout

```
src/
├── lib/
│   ├── engine.ts        # THE RATING ENGINE — Massey solve + adjustments, and RPI
│   ├── types.ts         # domain types, classification order, default config
│   ├── names.ts         # AHSAA spelling → roster name matching
│   ├── schedule-rows.ts # shared row → game logic for both AHSAA readers
│   ├── schedule-sheet.ts# AHSAA weekly Google Sheet (CSV/TSV) parser
│   ├── schedule-pdf.ts  # AHSAA schedule PDF parser (superseded, still used)
│   ├── score-csv.ts     # weekly score CSV parsing and validation
│   ├── team-view.ts     # schedule, projections, result classification
│   ├── data.ts          # loading data, publishing snapshots
│   ├── db.ts            # Supabase clients (public read / service write)
│   └── auth.ts          # PBKDF2 password, HMAC session cookie
├── app/
│   ├── page.tsx         # ratings + RPI board
│   ├── team/[slug]/     # team profile
│   ├── admin/           # admin pages
│   └── api/admin/       # admin API routes
└── middleware.ts        # guards /admin
```

---

## Things that will bite you

These are the failure modes that produce plausible-looking wrong numbers rather
than an error. `PROJECT.md` covers the reasoning.

- **The prior is re-applied on every solver iteration**, not just used as a
  seed. Dropping it after seeding changes every rating.
- **Score presence is authoritative.** The `status` column is informational and
  the engine never reads it.
- **`maxWeekPlayed` counts played games only.** If it counted scheduled games,
  loading a full season would erase the preseason carry-over instantly.
- **Eight classification tiers**, not seven: A, AA, 1A–6A. Any `7A` reference
  is stale 2025 code.
- **Classification comes from the roster, never the AHSAA sheet.** The
  published files contain classification errors.

## Validation status

`npm run validate` reproduces all 387 final 2025 ratings from the 2025 export
to a mean absolute error of 0.0046 — within the rounding of that file. That
confirms the composite step (step 5) and the SOS median.

It does **not** confirm the Massey solve itself (steps 1–3), which needs the
2025 game results to reproduce. `npm run test:engine` covers the invariants
above but is not a substitute for that diff.

Two things came out of the validation and are worth knowing:

- **PROJECT.md's config block is stale.** It lists `sos_w` 0.75 and `wr_w` 3.0.
  The ratings that actually shipped used 0.90 and 6.0. The defaults in
  `src/lib/types.ts` follow the data, not the document.
- **SOS is legitimately negative** for teams on weak schedules — it is a mean
  opponent rating, not a count. The adjustment must apply to every team that
  has played, while the *median* is still taken over teams with `sos > 0`.
