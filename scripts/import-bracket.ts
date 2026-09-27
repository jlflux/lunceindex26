/**
 * Brings the old bracketology site's data across.
 *
 * What it carries over is everything a person wrote: the bracket arrangement,
 * the region write-ups, the projected winners, the news note, the About copy,
 * and each game's date, time, location and note. What it drops is everything
 * the Index already computes — the teams arrays, the typed "4-1" records, the
 * hand-set status where it was never moved off the default.
 *
 * The one rule it will not bend: `slots` is carried verbatim and never
 * regenerated from a template. The live arrangement has been adjusted by hand
 * and differs from what any template produces — 6A is laid out across regions
 * rather than by block, AA overrides the cross-seeding outright — so
 * regenerating would quietly replace a season of work with a default.
 *
 * It verifies rather than assumes. Every slot is resolved against the real
 * roster before anything is written, and a seed that names nobody is reported
 * with the region it came from. Nothing is written at all unless --write is
 * passed.
 *
 *   npx tsx scripts/import-bracket.ts --preview          (no database)
 *   npx tsx scripts/import-bracket.ts                     (dry run, live data)
 *   npx tsx scripts/import-bracket.ts --write             (import for real)
 *
 * Deliberately does not import src/lib/data.ts — that module is marked
 * `server-only`, which throws outside a React server context. Same reason
 * scripts/setup.ts reaches for the client directly.
 */
import { readFileSync } from "fs";
import { config as loadEnv } from "dotenv";
import {
  emptyBracketState,
  type BracketState,
  type ClassState,
  type GameEditorial,
  type RegionState,
  type Slot,
  type StatusKey,
} from "../src/lib/bracket-types";
import { buildTree, placesFor, regionKey, seededRegions } from "../src/lib/bracket";
import { computeBoard } from "../src/lib/board";
import { buildIndex, matchTeam } from "../src/lib/names";
import {
  CLS_FILTER_ORDER,
  type Classification,
  type Game,
  type RatingRow,
  type Team,
} from "../src/lib/types";

loadEnv({ path: ".env.local" });
loadEnv();

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const SOURCE =
  value("from") ?? "/home/user/jlflux/jlflux.github.io/data/data.json";
const WRITE = flag("write");
/**
 * Check the import against the offline preview roster instead of Supabase.
 * Every verification below is about names and seed places, which the preview
 * carries in full — so the whole dry run works with no database, which is the
 * state anyone is in before they have decided to do this at all.
 */
const PREVIEW = value("preview") ?? (flag("preview") ? "scripts/out/preview.json" : null);
/**
 * Keep the old site's hand-seeding wherever it disagrees with the computed
 * standings, as a pinned order.
 *
 * Off by default, and that is the careful way round. Pinning is sticky: a
 * region that carries one stops following the season until somebody notices
 * and clears it. Turning every disagreement into a pin at import time would
 * mean starting with dozens of them, none of them deliberate, which is the
 * opposite of what computing the seeds was for. The dry run always reports
 * how many regions differ, so the size of what is being let go is visible
 * before the decision — and a region can always be re-pinned by hand.
 */
const PIN = flag("pin-differences");

/** The old file's shape, as loosely as we need to read it. */
type OldTeam = { name?: string; status?: string };
type OldRegion = { note?: string; teams?: OldTeam[] };
type OldClass = {
  regions?: Record<string, OldRegion>;
  bracket?: {
    alignment?: (string | number)[];
    slots?: ({ region?: string | number; place?: number } | null)[];
    results?: Record<string, Record<string, unknown>>;
    projected?: Record<string, string>;
  };
};
type OldFile = {
  meta?: { season?: string };
  newsNote?: string;
  aboutHtml?: string;
  aboutBanner?: { enabled?: boolean; text?: string };
  showProjections?: boolean | string;
  classifications?: Record<string, OldClass>;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
/** The old admin wrote "True" as a string more than once. */
const bool = (v: unknown): boolean =>
  v === true || (typeof v === "string" && v.toLowerCase() === "true");

async function main() {
  console.log(`\nReading ${SOURCE}`);
  const old = JSON.parse(readFileSync(SOURCE, "utf8")) as OldFile;

  let roster: RatingRow[];
  let games: Game[];
  let teams: Team[];

  if (PREVIEW) {
    console.log(`Loading the roster from ${PREVIEW} (no database)`);
    const p = JSON.parse(readFileSync(PREVIEW, "utf8")) as {
      ratings: RatingRow[];
      games: Game[];
    };
    roster = p.ratings;
    games = p.games;
    teams = roster.map((t) => ({
      name: t.name,
      slug: t.slug,
      classification: t.classification,
      region: t.region,
      preseason_prior: null,
      prior_source: null,
      postseason_ineligible: t.postseason_ineligible,
    }));
  } else {
    console.log("Loading the roster and the season from Supabase…");
    const { serviceClient } = await import("../src/lib/db");
    const db = serviceClient();
    const [tRes, gRes, cRes] = await Promise.all([
      db.from("teams").select("*").order("name"),
      db.from("games").select("*").order("id"),
      db.from("config").select("data").eq("id", 1).maybeSingle(),
    ]);
    for (const r of [tRes, gRes, cRes]) {
      if (r.error) throw new Error(r.error.message);
    }
    teams = (tRes.data ?? []) as Team[];
    games = (gRes.data ?? []) as Game[];
    const cfg = (cRes.data?.data ?? {}) as Parameters<typeof computeBoard>[2];
    roster = computeBoard(teams, games, cfg).ratings;
  }
  console.log(`  ${roster.length} teams, ${games.length} games`);

  const state: BracketState = emptyBracketState(str(old.meta?.season) || "2026");
  state.newsNote = str(old.newsNote);
  state.aboutHtml = typeof old.aboutHtml === "string" ? old.aboutHtml : "";
  state.aboutBanner = {
    enabled: bool(old.aboutBanner?.enabled),
    text: str(old.aboutBanner?.text),
  };
  state.showProjections = bool(old.showProjections);

  // Names that need the alias resolver, reported so the mapping is visible
  // rather than silent.
  const renamed: string[] = [];
  const unmatched = new Set<string>();
  const rosterNames = new Set(roster.map((t) => t.name));
  const index = buildIndex(teams);

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

  const handOrder = new Map<string, string[]>();
  let notes = 0;
  let pins = 0;
  let statuses = 0;
  let projections = 0;
  let editorials = 0;
  let droppedEmpty = 0;

  for (const cls of CLS_FILTER_ORDER) {
    const oc = old.classifications?.[cls];
    if (!oc) continue;

    const slots: Slot[] = (oc.bracket?.slots ?? []).map((s) =>
      s && s.region !== undefined && s.place !== undefined
        ? { region: Number(s.region), place: Number(s.place) }
        : null,
    );

    // The old file materialised an empty {} for every game merely by opening
    // a tab — 104 of 216 of them. They say nothing, so they are not carried.
    const results: Record<string, GameEditorial> = {};
    for (const [id, raw] of Object.entries(oc.bracket?.results ?? {})) {
      const e: GameEditorial = {};
      if (raw.home === "top" || raw.home === "bottom") e.home = raw.home;
      if (str(raw.date)) e.date = str(raw.date);
      if (str(raw.time)) e.time = str(raw.time);
      if (str(raw.location)) e.location = str(raw.location);
      if (str(raw.note)) e.note = str(raw.note);
      if (Object.keys(e).length === 0) {
        droppedEmpty++;
        continue;
      }
      results[id] = e;
      editorials++;
    }

    const projected: Record<string, "top" | "bottom"> = {};
    for (const [id, side] of Object.entries(oc.bracket?.projected ?? {})) {
      if (side === "top" || side === "bottom") {
        projected[id] = side;
        projections++;
      }
    }

    const regions: Record<string, RegionState> = {};
    for (const [rid, or_] of Object.entries(oc.regions ?? {})) {
      const rs: RegionState = { note: str(or_.note) };
      if (rs.note) notes++;

      // In the old site the drag order WAS the seeding, so every region
      // carries a hand-made order. Importing all of them as pins would leave
      // nothing following the math, which is the opposite of the point;
      // importing none would throw away deliberate decisions. So the order is
      // kept only where it disagrees with what the standings compute — which
      // is exactly where a decision was made — and the rest is left to follow
      // the season. `handOrder` is compared against the computed order below,
      // once the roster is loaded.
      const order: string[] = [];
      for (const t of or_.teams ?? []) {
        const name = resolve(str(t.name));
        if (name && !order.includes(name)) order.push(name);
      }
      if (order.length) handOrder.set(`${cls}:${rid}`, order);

      // Status is carried only where it was moved off the default. Everything
      // else now follows the odds, which know what "clinched" means.
      const status: Record<string, StatusKey> = {};
      for (const t of or_.teams ?? []) {
        const raw = str(t.name);
        const key = str(t.status) as StatusKey;
        if (!raw || !key || key === "medium") continue;
        const name = resolve(raw);
        if (!name) continue;
        status[name] = key;
        statuses++;
      }
      if (Object.keys(status).length) rs.status = status;

      if (rs.note || rs.status) regions[rid] = rs;
    }

    const cs: ClassState = {
      alignment: (oc.bracket?.alignment ?? []).map(Number).filter(Number.isFinite),
      slots,
      results,
      projected,
      regions,
    };
    state.classes[cls as Classification] = cs;
  }

  // ---- keep the hand-seeding that disagrees with the math ----------------
  const computed = seededRegions(roster, games, undefined, state);
  const differing: string[] = [];
  for (const [key, order] of handOrder) {
    const [cls, rid] = key.split(":");
    const auto = (computed.get(regionKey(cls as Classification, Number(rid))) ?? [])
      .filter((t) => !t.ineligible)
      .map((t) => t.name);
    const mine = order.filter((n) => auto.includes(n));
    if (mine.length !== auto.length) continue;
    if (mine.join("|") === auto.join("|")) continue; // the math already agrees
    const cs = state.classes[cls as Classification];
    if (!cs) continue;
    differing.push(`${cls} R${rid}`);
    if (!PIN) continue;
    const rs = cs.regions[rid] ?? { note: "" };
    rs.order = mine;
    cs.regions[rid] = rs;
    pins++;
  }

  // ---- verify ------------------------------------------------------------
  console.log("\nChecking every slot resolves to a real team…");
  const seeded = seededRegions(roster, games, undefined, state);
  let problems = 0;

  for (const cls of CLS_FILTER_ORDER) {
    const cs = state.classes[cls];
    if (!cs) continue;
    const tree = buildTree(cs.slots);
    const filled = cs.slots.filter(Boolean).length;
    const byes = cs.slots.length - filled;
    const misses: string[] = [];

    for (const s of cs.slots) {
      if (!s) continue;
      const list = seeded.get(regionKey(cls, s.region)) ?? [];
      if (!list.some((t) => t.place === s.place)) {
        misses.push(`R${s.region}-${s.place}`);
      }
    }

    const field = roster.filter((t) => t.classification === cls);
    const regions = field.length ? Math.max(...field.map((t) => t.region)) : 0;
    let expected = 0;
    for (let r = 1; r <= regions; r++) {
      const list = seeded.get(regionKey(cls, r)) ?? [];
      expected += placesFor(cls, list.filter((t) => !t.ineligible).length);
    }

    const rounds = tree.length;
    const line =
      `  ${cls.padEnd(3)} ${String(cs.slots.length).padStart(2)} slots · ` +
      `${filled} seeds + ${byes} byes · ${rounds} rounds · ` +
      `${Object.keys(cs.regions).length} regions annotated`;
    console.log(line);

    if (filled !== expected) {
      console.log(
        `       ! ${filled} seeds placed but the regions send ${expected}`,
      );
      problems++;
    }
    if (misses.length) {
      console.log(`       ! no team at ${misses.join(", ")}`);
      problems++;
    }
    if (cs.slots.length && (cs.slots.length & (cs.slots.length - 1)) !== 0) {
      console.log(`       ! ${cs.slots.length} slots is not a power of two`);
      problems++;
    }
  }

  console.log(
    `\nCarried: ${notes} region write-ups, ${projections} projections, ` +
      `${editorials} game notes, ${statuses} status overrides.`,
  );
  console.log(
    `Seeding: ${differing.length} of ${handOrder.size} regions are ordered ` +
      `differently by hand than the standings compute.`,
  );
  if (PIN) {
    console.log(
      `         ${pins} pinned, so those keep your order and stop following ` +
        `the season until you clear them.`,
    );
  } else {
    console.log(
      `         Not pinned — every region will follow the season. Pin the ` +
        `ones you mean in the admin, or re-run with --pin-differences to ` +
        `keep all of them.`,
    );
  }
  if (differing.length) console.log(`         ${differing.join(", ")}`);
  console.log(
    `Dropped: ${droppedEmpty} empty result objects, every teams array, ` +
      `every typed record.`,
  );
  console.log(
    `About page: ${state.aboutHtml.length} chars · news note: ${state.newsNote.length} chars ` +
      `· projections ${state.showProjections ? "public" : "private"}.`,
  );

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
    console.log(
      `\n${problems} problem(s) above. Nothing written — fix the roster or ` +
        `the source file and run again.`,
    );
    process.exit(1);
  }

  if (!WRITE) {
    console.log("\nAll checks passed. Re-run with --write to save.\n");
    return;
  }
  if (PREVIEW) {
    console.log(
      "\n--preview is a dry run against offline data; it cannot write. " +
        "Drop it to import for real.\n",
    );
    process.exit(1);
  }

  const { serviceClient } = await import("../src/lib/db");
  const { error } = await serviceClient()
    .from("bracket")
    .upsert({ id: 1, data: state }, { onConflict: "id" });
  if (error) {
    throw new Error(
      `${error.message} — if the table is missing, run supabase/migrations/006_bracket.sql.`,
    );
  }
  console.log("\nWritten to public.bracket.\n");
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exit(1);
});
