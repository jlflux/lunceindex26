# ALPreps Index — AHSAA Football Power Ratings (2026)

Composite power ratings for Alabama high school football. PHP + JSON, no
database. Public brand on all AHSAA surfaces is **ALPreps Index** (the
homepage and college football side use "LunceIndex" — don't mix them).

This document covers the rating engine and the rules that aren't obvious from
reading the code.

---

## Files

```
ahsaa/
├── index.html    # public frontend — reads ratings.json, renders tables + team panel
├── admin.php     # game/team entry, CSV import, formula sliders, publish button
├── api.php       # auth, load/save, THE RATING ENGINE, publish
├── data.json     # teams + games — source of truth, edit via admin
└── ratings.json  # generated output — never hand-edit
```

**Flow:** admin edits `data.json` → Publish runs `computeRatings()` in
`api.php` → writes `ratings.json` → `index.html` fetches and renders it.

Default admin password is `ahsaa2025`, a plaintext constant at the top of
`api.php`. Change it. Serve over HTTPS.

`.gitignore` should exclude `ratings.json` — regenerated on every publish.

---

## Data model

**`data.json`**

```json
{
  "teams":  [ { "name": "Thompson", "classification": "6A", "region": "Region 3",
                "preseason_prior": 36.97, "prior_source": "Thompson" } ],
  "games":  [ { "t1": "Wadley", "s1": null, "t2": "Horseshoe Bend", "s2": null,
                "week": 0, "type": "regular", "status": "scheduled",
                "date": "Aug. 21, 2026" } ],
  "config": { ... }
}
```

- `t1` is home, `t2` is away
- `s1`/`s2` are `null` until the game is played
- `type` is `"regular"` or `"playoff"`; playoff games also carry
  `round` = `r1`–`r5` (`r5` = Championship)
- `status` is informational for the frontend only — **the engine ignores it**

**`ratings.json`** — `{ generated, config, ratings[], games[] }`. Each rating
row: `name, classification, region, wins, losses, rating, massey, sos, o_eff,
d_eff, ppg, papg, prior_blend, rank`. The full `games` array rides along
because the frontend team panel needs schedules.

---

## The engine

`computeRatings($teams, $games, $cfg)` in `api.php`. Iterative Massey solver
plus adjustments. Pure math, no I/O — ports cleanly to any language.

### Step 0 — filter to played games

```php
$s1 !== null && $s2 !== null && $s1 !== '' && $s2 !== ''
```

Everything downstream uses this filtered set. See "Invariants" below.

### Step 1 — seed each team from a blended prior

```
effective_prior = prior_blend × preseason_prior
                + (1 − prior_blend) × class_prior

class_prior = prior_min + (tier − 1)/(CLS_MAX − 1) × (prior_max − prior_min)
```

Teams with no `preseason_prior` fall back to `class_prior` alone.

### Step 2 — Massey iteration (300 passes)

Each pass, for every played game:

```
margin  = clamp(s1 − s2, −cap, +cap) × playoff_multiplier
home  += opponent_rating + margin
away  += opponent_rating − margin
```

Out-of-state opponents have no rating, so they're valued at
`mean_rating × oos_mult`.

Then each team's rating is recomputed as:

```
rating = prior_w × effective_prior + (1 − prior_w) × mean(accumulated)
```

**The prior is re-applied every iteration, not just as a seed.** It's a
permanent regularizer holding teams toward their class baseline, which is what
stops an undefeated 1A team from floating above 6A playoff teams. A port that
seeds once and drops the prior will produce very different numbers.

Teams with zero played games keep `effective_prior` as their rating.

### Step 3 — head-to-head correction

One pass. If a winner still rates below a team it beat:

```
winner += min(h2h_boost, (loser_rating − winner_rating) × h2h_frac) × 0.5
```

### Step 4 — SOS and efficiency

```
sos    = mean(rating of every opponent faced)
o_eff  = own_ppg  − mean(opponents' points allowed per game)
d_eff  = mean(opponents' points scored per game) − own_papg
```

`o_eff` is how much better than expected you scored; `d_eff` how much better
than expected you defended. `median_sos` is the median of all teams with
`sos > 0`.

### Step 5 — composite

```
rating = massey
       + (sos − median_sos) × sos_w
       + (o_eff + d_eff) × eff_w × scale
       + (win_rate − 0.5) × wr_w

scale  = clamp(sos / median_sos, 0, 1)
```

`scale` dampens efficiency credit for teams on weak schedules — you don't get
full credit for outscoring bad opponents. Sort descending, assign ranks.

---

## Config

All tunable live from the admin sidebar; stored in `data.json`.

```json
{
  "prior_min": 0,     "prior_max": 14,   "prior_w": 0.22,
  "sos_w": 0.75,      "eff_w": 0.07,     "wr_w": 3.0,
  "cap": 28,          "iters": 300,      "oos_mult": 1.3,
  "h2h_boost": 2.5,   "h2h_frac": 0.45,
  "playoff_r1": 1.2,  "playoff_r2": 1.4, "playoff_r3": 1.6,
  "playoff_r4": 1.8,  "playoff_r5": 2.0
}
```

| Key | Effect |
|---|---|
| `prior_w` | How hard the class prior pulls. Higher = more classification-driven |
| `sos_w` | Schedule-strength weight. The dominant adjustment |
| `eff_w` | Offensive/defensive efficiency weight. Deliberately small |
| `wr_w` | Win-rate bonus, in rating points across the full 0–1 range |
| `cap` | Margin ceiling — stops blowouts being farmed |
| `oos_mult` | Out-of-state opponents valued at `mean × this` |
| `playoff_r1–r5` | Round multipliers on capped margin; `r5` = Championship |

---

## Invariants — break these and ratings go wrong silently

### 1. Score presence is authoritative

A game counts the moment both scores exist. The `status` field is *not*
consulted. This lets the full season schedule load in advance without
affecting ratings — null-vs-null games would otherwise read as 0-0 ties and
corrupt everything.

The frontend applies the same rule: missing score → renders as UPCOMING, never
as a loss.

### 2. `maxWeekPlayed` counts played games only

```
prior_blend = max(0, 1 − maxWeekPlayed / 4)
```

Week 0 → 100% preseason carry-over. Week 4+ → 0%, fully current-season.

If this counted scheduled games, loading the full season would jump it to
Week 10 and erase the prior instantly. Easy to break in a refactor.
`prior_blend` is emitted into `ratings.json` so you can check it.

### 3. Eight classification tiers, not seven

AHSAA reorganized for 2026: private schools split into Class A and AA, publics
are 1A–6A (old 7A is now 6A).

```
A=1, AA=2, 1A=3, 2A=4, 3A=5, 4A=6, 5A=7, 6A=8     CLS_MAX = 8
```

393 teams: A=28, AA=16, 1A=63, 2A=63, 3A=64, 4A=64, 5A=63, 6A=32.

**Any `7A` reference is stale 2025 code.** It appears in five places that must
stay in sync: `CLS_ORDER` in `api.php`, the two `CLS_N` maps in `index.html`,
the nav filter buttons, and the badge/color CSS. Frontend filter order is
6A→1A, then AA, A.

### 4. Where `preseason_prior` came from

Each team's 2025 final rating, regressed 60% toward their **new** class mean:

```
preseason_prior = new_class_mean + (rating_2025 − new_class_mean) × 0.60
```

The 60% accounts for roster turnover. New programs start at their class mean.
`prior_source` records which 2025 team name it was drawn from — several
differ (`Glenwood School` → `Glenwood`, `Berry Fayette` → `Berry`).

---

## Design rationale — don't "simplify" this back

A pure Massey/SRS rating is **predictive**: it optimizes margin against
schedule and doesn't care whether you won. Tested on FBS 2025, plain SRS put
Notre Dame (missed the playoff) above Alabama (won a playoff game), because
Notre Dame won by bigger margins against a weaker slate. Win quality has to be
its own term, and schedule strength has to dominate raw record.

Classification priors are equally load-bearing. Without them an undefeated 1A
team outranks a playoff-caliber 6A team, which is the failure that motivated
the whole design.

Standing editorial principle across this project: **surface ambiguity, don't
auto-resolve it.** Coin flips, crossover seeds, and bracket placements get
flagged for human judgment. Related: **seed ≠ strength** — projections advance
the higher-rated team regardless of seeding.

---

## Schedule ingestion

AHSAA publishes weekly schedule PDFs (Excel print-to-PDF). Two scripts:

- **`parse_schedule.py`** — `pdftotext -layout`, parses fixed columns, matches
  names to roster, emits `parsed_weekN.json` + `report_weekN.json`
- **`merge_weeks.py`** — merges into `data.json`. Idempotent, and **never
  overwrites a game that already has a score.**

Needs `poppler-utils`. Use `-layout`; flowed extraction is unreliable.

### Name matching

PDF uses long form ("B.B. Comer High School"), roster uses short ("BB Comer").
Order of attempts: alias table → exact normalized → **class+region
disambiguation** → fuzzy (difflib, 0.86 cutoff).

Class+region resolves genuinely ambiguous names: "Southside High School" 5A/R-6
→ Southside-Gadsden; "Lee High School" 5A/R-8 → Lee-Huntsville. Roster
convention puts location suffixes after a hyphen (`Central-Hayneville`,
`Hillcrest-Evergreen`, `Carver-Birmingham`).

**Known weakness:** that step trusts the PDF's classification, and the PDFs
contain class errors — so an error on an ambiguous name could silently pick the
wrong school. `report_weekN.json` flags every low-confidence match. Check it.

### PDF data quality

Week 0 alone contained: six matchups listed twice with a different
classification each time; a standalone conflict (PDF says Lincoln 5A, roster
says 4A); two names absent from the roster (Hope Christian Academy, Vina); a
`4a\`` typo; and rows wrapped across lines by long stadium names.

**Take classification from the roster, never the PDF.**

---

## If porting the engine

Validate against 2025 before trusting it. Run the port over the 2025 season
(2,050 games) and diff team-by-team against the PHP output — ranks should match
exactly, ratings to ~2 decimals. A silent arithmetic difference won't announce
itself; it just produces plausible-looking wrong numbers for months.

Sanity check on 2025 finals: Clay-Chalkville, Thompson, Saraland, and
Central-Phenix City should be at the top.

Things that bite in a port: the prior being re-applied every iteration (not
just seeded); integer-vs-float division in the class-prior formula; and median
SOS excluding zero-SOS teams.

---

## Season timing

Week 0 opens **August 20, 2026**. Regular season runs weeks 0–10, then playoff
rounds r1–r5.
