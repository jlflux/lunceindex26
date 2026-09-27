/**
 * Generates supabase/bracket_seed.sql — the whole bracket document as plain
 * SQL, so it can be pasted into the Supabase SQL editor with no local tooling.
 *
 * The same idea as `make-seed-sql.ts`, and for the same reason: the importer
 * next door needs a terminal and a service-role key, which is not the position
 * most people are in. This produces one file to paste.
 *
 * It verifies before it emits. Every slot in the old bracket is resolved
 * against the shipped roster, seed counts are checked against QUALIFIERS, and
 * slot counts have to be powers of two — a bracket that cannot be drawn is not
 * worth pasting into a database.
 *
 * Usage: npm run bracket:sql
 */
import { readFileSync, writeFileSync } from "node:fs";
import { placesFor } from "../src/lib/bracket";
import { QUALIFIERS } from "../src/lib/playoffs";
import { buildIndex, matchTeam } from "../src/lib/names";
import { loadRosterCsv } from "../src/lib/roster-csv";
import { readOldExport, type OldFile } from "./lib/bracket-source";
import { CLS_FILTER_ORDER, type Classification } from "../src/lib/types";

const SOURCE =
  process.argv.find((a, i) => process.argv[i - 1] === "--from") ??
  "/home/user/jlflux/jlflux.github.io/data/data.json";
const OUT = "supabase/bracket_seed.sql";
const ROSTER = "data/AHSAA_Class_List_2026.csv";

/**
 * Single-quote escaping.
 *
 * Load-bearing here rather than incidental: the explainer is six thousand
 * characters of prose full of apostrophes ("team's record", "won't"), and one
 * unescaped quote ends the string literal early and turns the rest of the
 * document into broken SQL.
 */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function main() {
  console.log(`\nReading ${SOURCE}`);
  const old = JSON.parse(readFileSync(SOURCE, "utf8")) as OldFile;

  const teams = loadRosterCsv(ROSTER);
  const index = buildIndex(teams);
  const rosterNames = new Set(teams.map((t) => t.name));
  console.log(`Roster: ${teams.length} teams from ${ROSTER}`);

  const renamed: string[] = [];
  const unmatched = new Set<string>();
  const resolve = (raw: string): string | null => {
    // The old site marked a barred team by typing an asterisk on the name.
    const clean = raw.replace(/\*+$/, "").trim();
    if (!clean) return null;
    if (rosterNames.has(clean)) return clean;
    const hit = matchTeam({ raw: clean }, index);
    if (hit.name && !hit.outOfState && rosterNames.has(hit.name)) {
      renamed.push(`${raw} → ${hit.name}`);
      return hit.name;
    }
    unmatched.add(raw);
    return null;
  };

  const read = readOldExport(old, resolve);
  const { state } = read;

  // ---- verify ------------------------------------------------------------
  console.log("\nChecking every slot names a place a region actually has…");
  let problems = 0;

  for (const cls of CLS_FILTER_ORDER) {
    const cs = state.classes[cls as Classification];
    if (!cs?.slots.length) continue;

    const field = teams.filter((t) => t.classification === cls);
    const regions = field.length ? Math.max(...field.map((t) => t.region)) : 0;
    const sizes = new Map<number, number>();
    for (const t of field) sizes.set(t.region, (sizes.get(t.region) ?? 0) + 1);

    const misses: string[] = [];
    for (const s of cs.slots) {
      if (!s) continue;
      const size = sizes.get(s.region) ?? 0;
      if (s.place < 1 || s.place > size) misses.push(`R${s.region}-${s.place}`);
    }

    let expected = 0;
    for (let r = 1; r <= regions; r++) {
      const size = sizes.get(r) ?? 0;
      if (size) expected += placesFor(cls as Classification, size);
    }

    const filled = cs.slots.filter(Boolean).length;
    console.log(
      `  ${cls.padEnd(3)} ${String(cs.slots.length).padStart(2)} slots · ` +
        `${filled} seeds + ${cs.slots.length - filled} byes · ` +
        `${Object.keys(cs.regions).length} regions annotated`,
    );

    if (misses.length) {
      console.log(`       ! no such place: ${misses.join(", ")}`);
      problems++;
    }
    if (filled !== expected) {
      console.log(
        `       ! ${filled} seeds placed, but the regions send ${expected} ` +
          `(QUALIFIERS.${cls} = ${QUALIFIERS[cls] ?? 4})`,
      );
      problems++;
    }
    if ((cs.slots.length & (cs.slots.length - 1)) !== 0) {
      console.log(`       ! ${cs.slots.length} slots is not a power of two`);
      problems++;
    }
  }

  if (renamed.length) {
    console.log(`\nResolved through the alias table (${renamed.length}):`);
    for (const r of [...new Set(renamed)]) console.log(`  ${r}`);
  }
  if (unmatched.size) {
    console.log(`\nCould not match ${unmatched.size} name(s):`);
    for (const n of unmatched) console.log(`  ${n}`);
    problems++;
  }

  if (problems) {
    console.log(`\n${problems} problem(s). Nothing written.\n`);
    process.exit(1);
  }

  // ---- emit --------------------------------------------------------------
  const json = JSON.stringify(state);
  const classes = CLS_FILTER_ORDER.filter(
    (c) => state.classes[c as Classification]?.slots.length,
  );

  const sql = `-- ALPreps bracketology — the hand-authored layer, as one document.
--
-- Generated by scripts/make-bracket-sql.ts from the old bracketology site's
-- export. Paste this into the Supabase SQL editor; no local tooling needed.
--
-- What is in it: ${classes.length} classifications' brackets, ${read.notes} region
-- write-ups, ${read.projections} projected winners, ${read.editorials} game notes,
-- ${read.statuses} status overrides, the news note, and the explainer.
--
-- What is deliberately NOT in it: records, seed order and status. Those are
-- computed from the games and the ratings on every render, so a copy stored
-- here would be a second answer to a question the site already answers.
--
-- The bracket stores places — {"region": 4, "place": 2} — never team names, so
-- re-seeding a region moves every slot that refers to it without this document
-- changing at all.
--
-- Safe to run more than once: it replaces row 1 outright.

do $$
begin
  if to_regclass('public.bracket') is null then
    raise exception
      'public.bracket was not found in database "%". Run '
      'supabase/migrations/006_bracket.sql first.', current_database();
  end if;
end $$;

insert into public.bracket (id, data)
values (1, ${q(json)}::jsonb)
on conflict (id) do update set data = excluded.data;

-- Say what landed, so a paste that did nothing is distinguishable from one
-- that did.
do $$
declare
  d jsonb;
  n_classes int;
  n_notes int;
begin
  select data into d from public.bracket where id = 1;
  select count(*) into n_classes from jsonb_object_keys(d->'classes');
  select count(*) into n_notes
    from jsonb_each(d->'classes') c,
         jsonb_each(c.value->'regions') r
   where coalesce(r.value->>'note', '') <> '';
  raise notice
    'Bracket loaded into database "%": % classifications, % region write-ups, '
    '% characters of explainer. Projections are %.',
    current_database(), n_classes, n_notes,
    length(coalesce(d->>'aboutHtml', '')),
    case when (d->>'showProjections')::boolean then 'PUBLIC' else 'private' end;
end $$;
`;

  writeFileSync(OUT, sql);
  console.log(
    `\nWrote ${OUT} — ${(sql.length / 1024).toFixed(1)} KB, ` +
      `${classes.length} classifications.`,
  );
  console.log(
    `Carried: ${read.notes} region write-ups, ${read.projections} projections, ` +
      `${read.editorials} game notes, ${read.statuses} status overrides.`,
  );
  console.log(
    `Dropped: ${read.droppedEmpty} empty result objects, every teams array, ` +
      `every typed record.\n`,
  );
}

main();
