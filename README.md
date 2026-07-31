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

### 3. Seed

```bash
npm install
npm run seed
```

That loads all 393 teams from `data/AHSAA_Class_List_2026.csv`, plus the alias
table used to match schedule-PDF spellings to roster names.

To seed carry-over ratings at the same time:

```bash
npm run seed -- --priors data/preseason_priors.csv
```

The priors CSV needs a team-name column and a rating column; the exact headers
are flexible. Any team without a prior seeds from its classification baseline
alone. You can also import priors later from **Admin → Teams**.

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
npm run smoke             # roster → PDF → engine, end to end, no database
npm run parse-schedule    # parse report for a schedule PDF
npm run typecheck
```

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

The engine has not yet been validated against the 2025 season — that check
needs the 2025 game data. `npm run test:engine` covers the invariants above but
is not a substitute for a team-by-team diff against the original PHP output.
