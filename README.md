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

```bash
npm install
npm run setup -- --dry-run   # report everything, write nothing
npm run setup                # write it
```

One command does the lot, from the files already in `data/`:

- all 393 teams from `AHSAA_Class_List_2026.csv`
- preseason carry-over ratings from `alpreps_preseason_2026.csv`
- the alias table mapping schedule-PDF spellings to roster names
- every `*Week_N*.pdf` schedule in `data/`, week taken from the filename
- the default formula config
- the first published ratings snapshot

It is idempotent. Teams upsert by name, games upsert on their natural key, and
**a game that already has scores is never overwritten**, so re-running
mid-season will not wipe results. An existing formula config is left untouched.

Run the dry run first: it prints classification counts, which teams matched a
preseason rating, the parse report for each schedule PDF, and the resulting top
10 — without touching the database.

### 4. Run

```bash
npm run dev
```

Public site at `/`, admin at `/admin`.

### 5. Deploy

Push to GitHub, import the repo in Vercel, and add the same four environment
variables. No build configuration is needed.

---

## Weekly workflow

1. **Import the schedule** — Admin → Import → Schedule, upload the AHSAA weekly
   PDF, pick the week, review the parse report, import. Classification always
   comes from your roster, never the PDF. Games that already have scores are
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
| Import | Weekly scores from CSV; schedules from the AHSAA PDF |
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
│   ├── names.ts         # PDF spelling → roster name matching
│   ├── schedule-pdf.ts  # AHSAA schedule PDF parser
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
- **Classification comes from the roster, never the PDF.** The published PDFs
  contain classification errors.

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
