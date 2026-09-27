/**
 * Reading the old bracketology site's export.
 *
 * Shared by the two things that consume it: `scripts/import-bracket.ts`, which
 * writes straight to Supabase, and `scripts/make-bracket-sql.ts`, which emits
 * the same document as pasteable SQL for anyone without a terminal. Two
 * transforms of one file would be two chances to disagree about what "carried
 * over" means, so there is one.
 *
 * What it keeps is everything a person wrote. What it drops is everything the
 * Index computes — the teams arrays, the typed "4-1" records, the status where
 * it was never moved off the default, and the empty result objects the old
 * admin created merely by opening a tab.
 */
import {
  emptyBracketState,
  type BracketState,
  type ClassState,
  type GameEditorial,
  type RegionState,
  type Slot,
  type StatusKey,
} from "../../src/lib/bracket-types";
import { CLS_FILTER_ORDER, type Classification } from "../../src/lib/types";

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
export type OldFile = {
  meta?: { season?: string };
  newsNote?: string;
  aboutHtml?: string;
  aboutBanner?: { enabled?: boolean; text?: string };
  showProjections?: boolean | string;
  classifications?: Record<string, OldClass>;
};

export const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : "";

/** The old admin wrote "True" as a string more than once. */
export const bool = (v: unknown): boolean =>
  v === true || (typeof v === "string" && v.toLowerCase() === "true");

export type ReadReport = {
  state: BracketState;
  /** Region key `"6A:1"` → the hand-made order, for comparing against computed. */
  handOrder: Map<string, string[]>;
  notes: number;
  statuses: number;
  projections: number;
  editorials: number;
  droppedEmpty: number;
  renamed: string[];
  unmatched: Set<string>;
};

/**
 * Turns the old export into a `BracketState`.
 *
 * `resolve` maps a name from the old file onto a roster name, or returns null
 * if it cannot — the caller supplies it because one route has a live roster
 * and the other has the shipped CSV, and neither should have to know about the
 * other's.
 */
export function readOldExport(
  old: OldFile,
  resolve: (raw: string) => string | null,
): ReadReport {
  const state: BracketState = emptyBracketState(str(old.meta?.season) || "2026");
  state.newsNote = str(old.newsNote);
  state.aboutHtml = typeof old.aboutHtml === "string" ? old.aboutHtml : "";
  state.aboutBanner = {
    enabled: bool(old.aboutBanner?.enabled),
    text: str(old.aboutBanner?.text),
  };
  state.showProjections = bool(old.showProjections);

  const handOrder = new Map<string, string[]>();
  const report = {
    notes: 0,
    statuses: 0,
    projections: 0,
    editorials: 0,
    droppedEmpty: 0,
  };

  for (const cls of CLS_FILTER_ORDER) {
    const oc = old.classifications?.[cls];
    if (!oc) continue;

    const slots: Slot[] = (oc.bracket?.slots ?? []).map((s) =>
      s && s.region !== undefined && s.place !== undefined
        ? { region: Number(s.region), place: Number(s.place) }
        : null,
    );

    // The old file materialised an empty {} for every game merely by opening a
    // tab — 104 of 216 of them. They say nothing, so they are not carried.
    const results: Record<string, GameEditorial> = {};
    for (const [id, raw] of Object.entries(oc.bracket?.results ?? {})) {
      const e: GameEditorial = {};
      if (raw.home === "top" || raw.home === "bottom") e.home = raw.home;
      if (str(raw.date)) e.date = str(raw.date);
      if (str(raw.time)) e.time = str(raw.time);
      if (str(raw.location)) e.location = str(raw.location);
      if (str(raw.note)) e.note = str(raw.note);
      if (Object.keys(e).length === 0) {
        report.droppedEmpty++;
        continue;
      }
      results[id] = e;
      report.editorials++;
    }

    const projected: Record<string, "top" | "bottom"> = {};
    for (const [id, side] of Object.entries(oc.bracket?.projected ?? {})) {
      if (side === "top" || side === "bottom") {
        projected[id] = side;
        report.projections++;
      }
    }

    const regions: Record<string, RegionState> = {};
    for (const [rid, or_] of Object.entries(oc.regions ?? {})) {
      const rs: RegionState = { note: str(or_.note) };
      if (rs.note) report.notes++;

      // In the old site the drag order WAS the seeding, so every region
      // carries a hand-made one. The caller decides what to do with it —
      // pinning all fifty would leave nothing following the season, and
      // pinning none would throw away deliberate decisions.
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
        report.statuses++;
      }
      if (Object.keys(status).length) rs.status = status;

      if (rs.note || rs.status) regions[rid] = rs;
    }

    const cs: ClassState = {
      alignment: (oc.bracket?.alignment ?? [])
        .map(Number)
        .filter(Number.isFinite),
      slots,
      results,
      projected,
      regions,
    };
    state.classes[cls as Classification] = cs;
  }

  return {
    state,
    handOrder,
    ...report,
    renamed: [],
    unmatched: new Set<string>(),
  };
}
