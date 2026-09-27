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

Then run everything in `supabase/migrations/` in order. Each one is
schema-qualified, idempotent and safe to re-run, and each reports what it did
rather than succeeding silently. They are not folded into `schema.sql`, so a
database that has only had `schema.sql` run against it is missing forfeits
(004) and postseason bans (005).

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
3. **Check the schedule** — open Admin → Games. The scan at the bottom runs by
   itself and reports schools missing a week everyone else played, and schools
   holding two games in one week. Both are what a name matched to the wrong
   school looks like, and neither is visible by reading the board.
4. **Update the bracket** — Admin → Bracketology. Seeds, records and status
   follow from the season, so most weeks this is only the region write-ups and
   the projections. Saves take effect immediately; they do not wait for a
   publish.
5. **Publish** — Admin → Dashboard → Recompute & publish. This also simulates
   the rest of the season ten thousand times to refresh the playoff odds, so it
   takes a few seconds longer than it used to.

Nothing you change reaches the public site until you publish, and ratings never
move on their own. A game only counts once **both** scores are present, so the
full season schedule can be loaded in advance without affecting anything.

---

## Admin

| Page | What it does |
|---|---|
| Dashboard | Counts, current formula, publish button with a top-10 preview |
| Games | Add, edit and delete games; filter by week, search, show unplayed only. The schedule scan runs on open: swapped sides, a school with two games in one week, and schools missing a week everyone else played |
| Import | The AHSAA weekly sheet (pasted or as CSV); your own score CSV; the older AHSAA PDF |
| Bracketology | The bracket, region write-ups, projections and the explainer. Seeds and records are computed; pin a region to override it |
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
npm run test:coverage     # the missing-week scan, including the bye/noise rules
npm run test:forfeits     # that a vacated win changes the record and not the rating
npm run test:playoffs     # the odds: bracket, probability invariants, clinch/elimination
npm run test:tiebreak     # the AHSAA tie-breaking procedure, (a) through (q)
npm run test:ineligible   # postseason bans: what they void, and what they must not
npm run test:bracket      # bracket resolution, projections, and the explainer sanitiser
npm run import:bracket    # brings the old bracketology site's data across
npm run calibrate:odds    # refits the win-probability curve against the 2025 season
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
│   ├── result.ts        # who won on the field vs who won officially (forfeits)
│   ├── eligibility.ts   # the one region-game test, and postseason bans
│   ├── bracket.ts       # seeding a region, and resolving a stored bracket
│   ├── bracket-types.ts # the hand-authored bracket layer's shape
│   ├── sanitize.ts      # allowlist sanitiser for the one piece of stored HTML
│   ├── playoffs.ts      # bracket structure and the Monte Carlo playoff odds
│   ├── duplicates.ts    # fixtures stored twice; a school with two games in a week
│   ├── coverage.ts      # schools missing a week everyone else played
│   ├── tiebreak.ts      # region ordering, shared by standings and the odds
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
- **The playoff bracket is derived from data, not memory.** `podsFor` in
  `src/lib/playoffs.ts` encodes what the 2025 playoffs actually did: eight-region
  classes pair 1-2, 3-4, 5-6, 7-8 in the first round, four-region classes cross
  1-4 and 2-3. Ordinary bracket seeding then reproduces the AHSAA pairing
  (A1-B4, B2-A3, B1-A4, A2-B3) on its own, which is why it is trusted for the
  field sizes 2025 has no precedent for.
- **The region tiebreak is the AHSAA's own procedure, (a)-(q).** `TIE_RULES`
  in `src/lib/tiebreak.ts`. It is not a sort: the rule settles one place at a
  time and refuses to rank the rest of a tied group until the top of it is
  decided, and each factor *narrows* rather than orders. `pickHighest` is the
  entry point for that reason. (q) is a coin flip, so the Index rating stands
  in. Factors (k)-(p) count roster opponents only, because rule 7's
  eligibility test for out-of-state schools is not something this data can
  answer. Standings and the odds simulation both go through this, so they
  cannot disagree about who holds a playoff place.
- **Qualifiers per region differ by classification** and are told to us rather
  than derived: 6A sends six, AA sends all eight (its bracket is a seeding
  exercise, not a qualification one), everything else sends four. `QUALIFIERS`
  in `src/lib/playoffs.ts` is the only place to change it. 6A's 24-team field
  is not a power of two, so region champions and runners-up take first-round
  byes.
- **A two-sided colour scale needs a wrong side.** `src/lib/shade.ts`. Both
  arms of a diverging scale are strongest at their ends, so putting one on a
  column with no line under it — seeds, rounds, the championship — spends
  maximum ink on "no chance", which is true of most of a classification and is
  news about none of it. It shipped that way: 0.1% to win the title drew 0.885
  of the available colour and a real 9.4% contender drew 0.120. Only the
  playoff column and a win-loss record have a genuine midpoint, so only those
  two are `polarity`; everything else is `magnitude` and shades one way. The
  invariant — a bigger number never gets less ink — is checked in
  `npm run test:playoffs`.
- **Rounding can manufacture a certainty.** `(0.996 * 100).toFixed(0)` is
  `"100"`. A probability display that rounds to whole percent will print a flat
  100% for a team that is not in, and it never reaches whatever check guards
  the word. `label()` in `src/components/OddsBoard.tsx` keeps a decimal place in
  the top and bottom bands for that reason, so 100 and 0 can only be printed by
  a team `clinched`, `eliminated` or `settled` arithmetically. The same trap
  applies to any new percentage column.
- **A tie is half a game won.** Standing order is
  `(W + T/2) / (W + L + T)`, not `W / (W + L)` — leaving ties out of the
  denominator lets three ties carry a 2-2 team past a 3-4 one. `standingPct` in
  `src/lib/tiebreak.ts`, called by `orderRegion`. It shipped once as
  `standingKey`, which nothing called: `orderRegion` had its own copy of the
  formula inline, so the fix sat in dead code while the live path went on
  ignoring ties, and the test passed because the case it used gave the same
  answer either way. Any test of this has to *tell the formulas apart* — 2-1-3
  is .667 one way and .583 the other, which puts it either side of a 3-2 team.
  Alabama settles games in overtime, so in practice this guards against a 0-0
  entered by mistake, but standings, region order and the odds all read it.
- **The bracket stores places, not teams.** A slot is `{region: 4, place: 2}`
  and who that is gets resolved at render time from the standings. That late
  binding is the whole design: re-seed a region and every slot follows with
  nothing edited, which is why the hand-made arrangement imported from the old
  site survives a season of results. Never regenerate `slots` from
  `defaultSlots` — the live arrangement differs from every template (6A is laid
  out across regions rather than by block; AA overrides the cross-seeding).
- **Game ids are positional.** `r2g0` is the first game of the second round, so
  anything stored against an id — a kickoff time, a projected winner — lands on
  a different match-up if the bracket changes size. The admin API refuses a
  save that changes a class's slot count for exactly that reason.
- **A pin is invisible to readers and must not be invisible to you.** A region
  with `order` set stops following the season until someone clears it, and by
  request nothing marks it on the public page. So the admin marks it, shows
  what the season would have computed, and counts them in the header. The
  importer deliberately does *not* pin by default: turning every disagreement
  into a pin at import time would start the season with dozens of them, none
  deliberate.
- **A postseason ban voids a region schedule for both sides.** The association
  bars a program from championship play and its region games stop counting for
  anyone: it finishes 0-0 in region, its opponents take an overall result and
  no region one, and the tiebreakers act as though the games never happened.
  The rating reads them exactly as before, because the football was played.
  The region test used to be written three times — twice in `season.ts`, once
  in `playoffs.ts` feeding four separate loops — so it now lives once, in
  `src/lib/eligibility.ts`, and everything asks it. Note `countsForTiebreak` is
  not the negation of `countsForRegion`: a game against a banned team is
  dropped, *not* demoted to a non-region game, because "non-region" is a
  category factors (k) and (l) actively read. A banned team is also removed
  before `orderRegion` runs — left in, its 0-0 record scores .500 and sorts it
  above everyone with a losing record.
- **A forfeit changes the record, never the rating.** `forfeit_by` names which
  side gave a game up; the scores stay as played. Everything record-shaped
  (standings, region order, RPI, Résumé) reads the ruling, and the Index reads
  the field — including the win-rate term, which is part of the rating rather
  than a display column. See `src/lib/result.ts`.

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
