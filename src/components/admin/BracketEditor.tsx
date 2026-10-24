"use client";

import { useEffect, useMemo, useState } from "react";
import BracketView from "@/components/bracket/BracketView";
import {
  applyPinnedOrder,
  assignPlaces,
  defaultSlots,
  regionKey,
  projectByRating,
  resolveBracket,
  type ResolvedBracket,
  type ResolvedGame,
  type SeededTeam,
} from "@/lib/bracket";
import {
  STATUS_KEYS,
  STATUS_LABELS,
  type BracketState,
  type ClassState,
  type Slot,
  type StatusKey,
} from "@/lib/bracket-types";
import { PROSE_COLOURS } from "@/lib/sanitize";
import { CLS_FILTER_ORDER, type Classification, type Game } from "@/lib/types";

export type EditorRegion = {
  region: number;
  /** The order the season computes, ignoring any pin. */
  computed: SeededTeam[];
  /** The order as it will be shown — pinned if there is a pin. */
  shown: SeededTeam[];
};

export type EditorClass = {
  classification: Classification;
  regions: EditorRegion[];
};

type Tab = "seeding" | "bracket" | "projections" | "embed" | "settings";

/**
 * Which row a drop came from.
 *
 * The dragged index is carried on the drag itself and kept in state as well.
 * The state copy is what React re-renders from; the dataTransfer copy is what
 * survives when state has been reset out from under an in-flight drag, and is
 * what makes the drag start at all in Firefox. Whichever is readable wins.
 */
function readIndex(dt: DataTransfer, fallback: number | null): number | null {
  const raw = dt.getData("text/plain");
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) ? n : fallback;
}

/**
 * The bracket editor.
 *
 * Everything here writes into one document and saves it whole. There is no
 * draft: the old site kept edits in the browser and reconciled them against
 * the live site on every load, which is a whole layer of machinery — and a
 * whole class of stale-draft bug — that a server-side store behind a login
 * does not need.
 *
 * The distinction the UI is built around is pinned versus computed. A region
 * follows the season unless somebody has pinned it, and a pinned region is
 * marked *here* while looking exactly like any other region to a reader. That
 * asymmetry is deliberate: a pin is invisible to the public by request, which
 * makes it the kind of thing that can be set in September and quietly still be
 * in force in November unless the editor says so.
 */
export default function BracketEditor({
  initial,
  classes,
  playoffGames = [],
  playoffWeek = 12,
  ratings = {},
}: {
  initial: BracketState;
  classes: EditorClass[];
  /** Playoff results only — all `resolveBracket` reads from the schedule. */
  playoffGames?: Game[];
  /** Week number the first playoff round sits in; later rounds count on. */
  playoffWeek?: number;
  /** Index rating by team name, for filling projections from the board. */
  ratings?: Record<string, number>;
}) {
  const [state, setState] = useState<BracketState>(initial);
  const [tab, setTab] = useState<Tab>("seeding");
  const [cls, setCls] = useState<Classification>(
    classes[0]?.classification ?? "6A",
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(
    null,
  );
  // Held in state rather than read from the prop, so a result entered on the
  // bracket re-resolves it immediately instead of waiting for a reload.
  const [games, setGames] = useState<Game[]>(playoffGames);

  const block = classes.find((c) => c.classification === cls) ?? classes[0];

  /**
   * The regions as they stand *now*, including edits not yet saved.
   *
   * `block.regions` is resolved by the server component and frozen for the
   * page's life. Rendering it directly was the bug: a drag wrote the new order
   * into state, the region went "pinned", and the list on screen never moved —
   * because it was never reading state in the first place. Worse, each drag
   * recomputed from that same frozen array, so a second drag quietly discarded
   * the first.
   *
   * `applyPinnedOrder` and `assignPlaces` are the same two calls
   * `seededRegions` makes on the server, so the order and the place numbers
   * here are the ones that will be published.
   */
  const liveRegions = useMemo(
    () =>
      (block?.regions ?? []).map((r) => {
        const order = state.classes[cls]?.regions?.[String(r.region)]?.order;
        if (!order?.length) return r;
        return {
          ...r,
          shown: assignPlaces(cls, applyPinnedOrder(r.computed, order)),
        };
      }),
    [block, state, cls],
  );

  /**
   * The bracket as it stands *now*, resolved in the browser.
   *
   * Same fault as `liveRegions` above, one layer out: the bracket used to be
   * resolved by the server component and passed down frozen, so clicking a
   * team wrote the pick into state and the drawn bracket never moved. A pick is recorded and
   * saved either way, which is what made it look as though the click did
   * nothing — the bracket advancing is the only feedback a click has.
   *
   * Projections are always resolved here. Whether *readers* may see them is
   * `showProjections`, which the public page applies; an author cannot build
   * a projection they are not allowed to look at.
   *
   * Seeded off `liveRegions` rather than `block.regions` so a pin or a drag in
   * the Seeding tab moves the bracket too.
   */
  const liveSeeded = useMemo(
    () =>
      new Map(liveRegions.map((r) => [regionKey(cls, r.region), r.shown])),
    [liveRegions, cls],
  );

  /**
   * Two resolutions, because the two tabs are asking different questions.
   *
   * The Bracket tab is where results are entered, and a projected winner
   * drawn there is a team that has not played — indistinguishable at a glance
   * from one that has, in the one place where the difference is the whole
   * point. It gets the bracket as played.
   */
  const liveBracket = useMemo(
    () => resolveBracket(state, cls, liveSeeded, games),
    [liveSeeded, state, cls, games],
  );

  /** The Projections tab, where a projected winner is the thing being made. */
  const projectedBracket = useMemo(
    () => resolveBracket(state, cls, liveSeeded, games, { projected: true }),
    [liveSeeded, state, cls, games],
  );

  const pinnedCount = useMemo(
    () =>
      CLS_FILTER_ORDER.reduce(
        (n, c) =>
          n +
          Object.values(state.classes[c]?.regions ?? {}).filter(
            (r) => r.order?.length,
          ).length,
        0,
      ),
    [state],
  );
  const overrideCount = useMemo(
    () =>
      CLS_FILTER_ORDER.reduce(
        (n, c) =>
          n +
          Object.values(state.classes[c]?.regions ?? {}).reduce(
            (m, r) => m + Object.keys(r.status ?? {}).length,
            0,
          ),
        0,
      ),
    [state],
  );

  /**
   * Writes a playoff result to the games table.
   *
   * Not into the bracket document: a playoff game is a game, it belongs in
   * the same table as every other one, and the rating has to count it. The
   * bracket reads results back out of that table by team names, so the winner
   * advances as soon as this returns.
   *
   * Updates the row when the pair already has one, rather than relying on the
   * upsert key — the key includes the week, and a result corrected after the
   * fact must not be able to land as a second game.
   */
  async function saveScore(g: ResolvedGame, s1: string, s2: string) {
    const t1 = g.top.team;
    const t2 = g.bottom.team;
    if (!t1 || !t2) throw new Error("Both teams have to be known.");

    const key = [t1, t2].sort().join("|");
    const existing = games.find((x) => [x.t1, x.t2].sort().join("|") === key);

    const body = {
      id: existing?.id,
      t1,
      t2,
      s1: s1.trim(),
      s2: s2.trim(),
      type: "playoff" as const,
      // The round a game sits in is the bracket's, counted from the first.
      round: `r${Math.min(g.round, 5)}`,
      // Playoff weeks run on from the regular season so the schedule page
      // keeps them in order. The round decides it, not the calendar.
      week: Math.min(playoffWeek + g.round - 1, 20),
      neutral_site: Boolean(state.classes[cls]?.results?.[g.id]?.location),
    };

    const res = await fetch("/api/admin/games", {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error ?? "Could not save the result.");

    const saved = out.game as Game;
    setGames((list) => {
      const rest = list.filter((x) => x.id !== saved.id);
      // A cleared score comes back with nulls; the row stays, and the bracket
      // reads it as unplayed because a game needs both scores to count.
      return [...rest, saved];
    });
    setMsg({
      tone: "ok",
      text:
        saved.s1 === null
          ? `${t1} v ${t2}: result cleared.`
          : `${t1} ${saved.s1}–${saved.s2} ${t2} saved. Publish to move the ratings.`,
    });
  }

  /** Edits one classification's slice, creating it if this is the first edit. */
  function editClass(c: Classification, fn: (cs: ClassState) => ClassState) {
    setState((s) => {
      const current: ClassState = s.classes[c] ?? {
        alignment: [],
        slots: [],
        results: {},
        projected: {},
        regions: {},
      };
      return { ...s, classes: { ...s.classes, [c]: fn(current) } };
    });
  }

  function editRegion(
    c: Classification,
    region: number,
    fn: (r: { note: string; order?: string[]; status?: Record<string, StatusKey> }) => {
      note: string;
      order?: string[];
      status?: Record<string, StatusKey>;
    },
  ) {
    editClass(c, (cs) => ({
      ...cs,
      regions: {
        ...cs.regions,
        [String(region)]: fn(cs.regions[String(region)] ?? { note: "" }),
      },
    }));
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/bracket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed.");
      setMsg({
        tone: "ok",
        text: `Saved. ${body.pinned?.length ?? 0} region(s) pinned.`,
      });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[24px] font-bold leading-tight">Bracketology</h1>
        {pinnedCount > 0 && (
          <span
            className="rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ background: "rgb(var(--warn-soft))", color: "rgb(var(--warn))" }}
            title="These regions no longer follow the season. Readers cannot tell — only this page can."
          >
            {pinnedCount} region{pinnedCount === 1 ? "" : "s"} pinned
          </span>
        )}
        {overrideCount > 0 && (
          <span
            className="rounded-md px-2 py-1 text-[11px] font-semibold"
            style={{ background: "rgb(var(--surface-3))", color: "rgb(var(--text-muted))" }}
          >
            {overrideCount} status override{overrideCount === 1 ? "" : "s"}
          </span>
        )}
        <button className="btn btn-primary ml-auto" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {msg && (
        <div
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor:
              msg.tone === "ok" ? "rgb(var(--good) / 0.4)" : "rgb(var(--bad) / 0.4)",
            background:
              msg.tone === "ok" ? "rgb(var(--good-soft))" : "rgb(var(--bad-soft))",
            color: msg.tone === "ok" ? "rgb(var(--good))" : "rgb(var(--bad))",
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        className="flex flex-col gap-3 rounded-xl border px-3 py-3 lg:flex-row lg:items-center"
        style={{ background: "rgb(var(--surface))", borderColor: "rgb(var(--border))" }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["seeding", "Seeding & notes"],
              ["bracket", "Bracket"],
              ["projections", "Projections"],
              ["embed", "Embed"],
              ["settings", "Settings"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`pill ${tab === k ? "pill-active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab !== "settings" && tab !== "embed" && (
          <div className="table-scroll scroll-thin -mx-1 px-1 lg:ml-auto">
            <div className="flex items-center gap-1.5">
              {classes.map((c) => (
                <button
                  key={c.classification}
                  onClick={() => setCls(c.classification)}
                  className={`pill ${cls === c.classification ? "pill-active" : ""}`}
                >
                  {c.classification}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tab === "settings" && <Settings state={state} setState={setState} />}

      {tab === "embed" && (
        <Embed cls={cls} published={state.showProjections} />
      )}

      {tab === "seeding" && block && (
        <>
        <p
          className="text-xs leading-relaxed"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          The status is your confidence about{" "}
          <em>where a team finishes</em>, not how good it is &mdash; a side
          certain to finish last is High for the same reason as one certain to
          finish first, and three teams who could land in any order are Medium
          even if all three are going through.{" "}
          <strong style={{ color: "rgb(var(--text-muted))" }}>Clinched</strong>{" "}
          means that exact place is locked, not that they are in the bracket. A
          chip appears once the arithmetic proves a place cannot move:{" "}
          <strong style={{ color: "rgb(var(--odds-hi))" }}>locked</strong> where
          that place is inside the field, and{" "}
          <strong style={{ color: "rgb(var(--text-faint))" }}>locked out</strong>{" "}
          where it is below the line — clicking either applies the one it means,
          Clinched or Out. Everything is Medium until you say otherwise, except
          a team that is mathematically out. The
          percentages on the Playoff Odds board are a separate thing and make no
          claim about any of this.
        </p>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {liveRegions.map((r) => (
            <RegionEditor
              key={r.region}
              cls={cls}
              region={r}
              stored={state.classes[cls]?.regions?.[String(r.region)]}
              onChange={(fn) => editRegion(cls, r.region, fn)}
            />
          ))}
        </div>
        </>
      )}

      {tab === "bracket" && block && (
        <SlotEditor
          cls={cls}
          regions={liveRegions}
          slots={state.classes[cls]?.slots ?? []}
          onSlots={(slots) => editClass(cls, (cs) => ({ ...cs, slots }))}
          bracket={liveBracket}
          results={state.classes[cls]?.results ?? {}}
          onResults={(results) => editClass(cls, (cs) => ({ ...cs, results }))}
          playoffGames={games}
          saveScore={saveScore}
        />
      )}

      {tab === "projections" && block && (
        <Projections
          bracket={projectedBracket}
          picks={state.classes[cls]?.projected ?? {}}
          published={state.showProjections}
          onPick={(id, side) =>
            editClass(cls, (cs) => {
              const next = { ...cs.projected };
              if (next[id] === side) delete next[id];
              else next[id] = side;
              return { ...cs, projected: next };
            })
          }
          onClear={() => editClass(cls, (cs) => ({ ...cs, projected: {} }))}
          onFollowIndex={() =>
            editClass(cls, (cs) => ({
              ...cs,
              projected: projectByRating(
                state,
                cls,
                liveSeeded,
                games,
                (t) => ratings[t] ?? 0,
              ),
            }))
          }
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------- seeding tab */

function RegionEditor({
  cls,
  region,
  stored,
  onChange,
}: {
  cls: Classification;
  region: EditorRegion;
  stored?: { note: string; order?: string[]; status?: Record<string, StatusKey> };
  onChange: (
    fn: (r: { note: string; order?: string[]; status?: Record<string, StatusKey> }) => {
      note: string;
      order?: string[];
      status?: Record<string, StatusKey>;
    },
  ) => void;
}) {
  const pinned = Boolean(stored?.order?.length);
  const list = region.shown;
  const [drag, setDrag] = useState<number | null>(null);

  const computedOrder = region.computed.map((t) => t.name);
  const differs =
    pinned && stored?.order?.join("|") !== computedOrder.slice(0, stored?.order?.length).join("|");

  /**
   * Dragging a team is the act of overriding, so it pins on the first drag
   * rather than asking first.
   *
   * This used to require clicking "Pin order" before a row would move at all,
   * which is not a sequence anyone would guess — the rows simply looked
   * broken. The button is still there to undo it.
   */
  function move(from: number, to: number) {
    const names = list.map((t) => t.name);
    const [x] = names.splice(from, 1);
    names.splice(to, 0, x);
    onChange((r) => ({ ...r, order: names }));
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "rgb(var(--border))", background: "rgb(var(--surface-2))" }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          {cls} · Region {region.region}
        </span>
        {pinned && (
          <span
            className="rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
            style={{ background: "rgb(var(--warn-soft))", color: "rgb(var(--warn))" }}
          >
            pinned
          </span>
        )}
        {pinned ? (
          <button
            className="btn ml-auto !px-2 !py-0.5 !text-[11px]"
            onClick={() => onChange((r) => ({ note: r.note, status: r.status }))}
            title="Drop the pin and let this region follow the season again"
          >
            Follow the season
          </button>
        ) : (
          <span
            className="ml-auto text-[10.5px]"
            style={{ color: "rgb(var(--text-faint))" }}
            title="Drag a team to override the computed order"
          >
            drag to reorder
          </span>
        )}
      </div>

      <ul>
        {list.map((t, i) => {
          /**
           * What the arithmetic proves, and therefore what the chip sets.
           *
           * `place_locked` says the finishing place cannot move. It says
           * nothing about whether that place is a good one: a side nailed to
           * the bottom of its region is exactly as locked as the champion.
           * The chip used to set Clinched either way, which put "Clinched" on
           * teams that are mathematically out — the opposite of the truth, and
           * on the one status where being wrong is loudest.
           *
           * `qualifies` is the place against the number this class takes, so
           * it is the same line the board draws under the region.
           */
          const lockedAs: StatusKey = t.qualifies ? "clinched" : "out";
          const showLock =
            !t.ineligible &&
            t.place_locked &&
            stored?.status?.[t.name] !== lockedAs;

          return (
          <li
            key={t.slug}
            draggable
            // Firefox refuses to start a drag at all unless dataTransfer
            // carries something, so this is not decoration — without it the
            // feature simply does not exist outside Chrome.
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", String(i));
              setDrag(i);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDragEnd={() => setDrag(null)}
            onDrop={(e) => {
              e.preventDefault();
              const from = readIndex(e.dataTransfer, drag);
              if (from !== null && from !== i) move(from, i);
              setDrag(null);
            }}
            className="flex items-center gap-2 border-b px-2.5 py-1.5 last:border-0"
            style={{
              borderColor: "rgb(var(--border))",
              opacity: t.ineligible ? 0.55 : 1,
              cursor: "grab",
            }}
          >
            <span
              className="w-3.5 shrink-0 text-[11px] tnum"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              {t.ineligible ? "—" : t.place}
            </span>
            <span
              className="shrink-0 text-[11px]"
              style={{ color: "rgb(var(--text-faint))" }}
              aria-hidden
            >
              ⠿
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
              {t.name}
            </span>
            <span className="shrink-0 text-[11px] tnum" style={{ color: "rgb(var(--text-faint))" }}>
              {t.ineligible ? "—" : `${t.region_w}-${t.region_l}`}
            </span>
            {showLock && (
              <button
                className="shrink-0 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
                style={
                  lockedAs === "clinched"
                    ? {
                        background: "rgb(var(--odds-hi) / 0.18)",
                        color: "rgb(var(--odds-hi))",
                      }
                    : {
                        // Being locked out is not good news, and a chip in the
                        // same hopeful blue as a clinched seed reads as if it
                        // were.
                        background: "rgb(var(--surface-3))",
                        color: "rgb(var(--text-faint))",
                      }
                }
                title={
                  lockedAs === "clinched"
                    ? `This finishing place is arithmetically settled — nobody left can pass them and they can pass nobody, and the place is inside the ${cls} field. Click to mark it Clinched.`
                    : `This finishing place is arithmetically settled — nobody left can pass them and they can pass nobody — and it is below the ${cls} playoff line. Click to mark it Out.`
                }
                onClick={() =>
                  onChange((r) => ({
                    ...r,
                    status: { ...(r.status ?? {}), [t.name]: lockedAs },
                  }))
                }
              >
                {lockedAs === "clinched" ? "locked" : "locked out"}
              </button>
            )}
            {!t.ineligible &&
              !t.place_locked &&
              t.best_place > 0 &&
              t.best_place !== t.worst_place && (
                <span
                  className="shrink-0 text-[10px] tnum"
                  style={{ color: "rgb(var(--text-faint))" }}
                  title="The range this team can still finish in, from the games left to play"
                >
                  {t.best_place}&ndash;{t.worst_place}
                </span>
              )}
            <select
              className="input !w-auto !px-1.5 !py-0.5 !text-[11px]"
              value={stored?.status?.[t.name] ?? ""}
              onChange={(e) => {
                const v = e.target.value as StatusKey | "";
                onChange((r) => {
                  const status = { ...(r.status ?? {}) };
                  if (v) status[t.name] = v;
                  else delete status[t.name];
                  return { ...r, status: Object.keys(status).length ? status : undefined };
                });
              }}
              title="Leave blank to follow the odds"
            >
              <option value="">{STATUS_LABELS[t.status]} (auto)</option>
              {STATUS_KEYS.map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABELS[k]}
                </option>
              ))}
            </select>
          </li>
          );
        })}
      </ul>

      {pinned && differs && (
        <div
          className="border-t px-3 py-2 text-[11.5px] leading-relaxed"
          style={{ borderColor: "rgb(var(--border))", color: "rgb(var(--text-muted))" }}
        >
          The season would order this region{" "}
          <strong style={{ color: "rgb(var(--text))" }}>
            {computedOrder.slice(0, 4).join(", ")}
            {computedOrder.length > 4 ? "…" : ""}
          </strong>
          .
        </div>
      )}

      <div className="border-t px-3 py-2.5" style={{ borderColor: "rgb(var(--border))" }}>
        <label
          className="mb-1 block text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          Region picture
        </label>
        <textarea
          className="input min-h-[80px] !text-[12.5px]"
          value={stored?.note ?? ""}
          placeholder="What is happening in this region…"
          onChange={(e) => onChange((r) => ({ ...r, note: e.target.value }))}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- bracket tab */

function SlotEditor({
  cls,
  regions,
  slots,
  onSlots,
  bracket,
  results,
  onResults,
  playoffGames,
  saveScore,
}: {
  cls: Classification;
  regions: EditorRegion[];
  slots: Slot[];
  onSlots: (s: Slot[]) => void;
  bracket: ResolvedBracket | null;
  results: ClassState["results"];
  onResults: (r: ClassState["results"]) => void;
  playoffGames: Game[];
  saveScore: (g: ResolvedGame, s1: string, s2: string) => Promise<void>;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [arrange, setArrange] = useState(false);

  /** The stored playoff game for a drawn match-up, if it has been played. */
  const playedFor = (g: ResolvedGame | null | undefined): Game | null => {
    if (!g?.top.team || !g?.bottom.team) return null;
    const key = [g.top.team, g.bottom.team].sort().join("|");
    return (
      playoffGames.find((x) => [x.t1, x.t2].sort().join("|") === key) ?? null
    );
  };

  const nameAt = (s: Slot): string => {
    if (!s) return "Bye";
    const r = regions.find((x) => x.region === s.region);
    return r?.shown.find((t) => t.place === s.place)?.name ?? "—";
  };

  /**
   * A drop swaps the two slots rather than inserting.
   *
   * That is how the old site behaved and it is the right call: a bracket is a
   * fixed set of positions, so moving a seed into one has to displace whatever
   * was there. Inserting would shift every slot below and silently re-pair the
   * entire half.
   */
  function swap(from: number, to: number) {
    const next = [...slots];
    [next[from], next[to]] = [next[to], next[from]];
    onSlots(next);
  }

  return (
    <div className="space-y-4">
      {slots.length === 0 ? (
        <div className="card px-4 py-10 text-center">
          <p className="mb-1 text-sm font-semibold">
            Class {cls} has no bracket yet.
          </p>
          <p
            className="mx-auto mb-4 max-w-[52ch] text-xs leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Start from the shape the association uses for this classification
            &mdash; {regions.length} region{regions.length === 1 ? "" : "s"},
            cross-seeded, with byes where the field is short of a power of two.
            Then drag slots around until it matches what you want.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => onSlots(defaultSlots(cls, regions.length))}
          >
            Start from the standard shape
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-xs leading-relaxed"
            style={{ color: "rgb(var(--text-faint))" }}>
            Click any match-up on the bracket to enter its result, date, time,
            location and home side. A result saves on its own and the winner
            advances straight away.
          </p>
          <button className="btn !py-1.5 !text-xs shrink-0"
            onClick={() => setArrange((v) => !v)}>
            {arrange ? "Hide the seeding grid" : "Rearrange the first round"}
          </button>
        </div>
      )}

      {slots.length > 0 && arrange && (
      <div className="card table-scroll p-3">
        <p className="mb-2 text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
          Drag a slot onto another to swap them — including onto a bye, which
          moves the bye. The bracket holds places, not teams, so a seed keeps
          pointing at whoever holds that place as the season moves.
        </p>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
          {slots.map((s, i) => (
            <div
              key={i}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
                setDrag(i);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDragEnd={() => setDrag(null)}
              onDrop={(e) => {
                e.preventDefault();
                const from = readIndex(e.dataTransfer, drag);
                if (from !== null && from !== i) swap(from, i);
                setDrag(null);
              }}
              className="flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5"
              style={{
                borderColor: drag === i ? "rgb(var(--brand))" : "rgb(var(--border))",
                background: s ? "rgb(var(--surface))" : "rgb(var(--surface-2))",
              }}
              title={`Slot ${i + 1} — first-round game ${Math.floor(i / 2) + 1}`}
            >
              <span
                className="w-10 shrink-0 text-[10px] font-extrabold tnum"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                {s ? `R${s.region}-${s.place}` : "BYE"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                {nameAt(s)}
              </span>
              <span className="shrink-0 text-[10px] tnum" style={{ color: "rgb(var(--text-faint))" }}>
                g{Math.floor(i / 2) + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
      )}

      {/*
        The bracket itself, clickable. It used to be a flat list of every
        match-up in the class beside a grid of slots, which is a fine way to
        see that sixteen games exist and a poor way to find the one being
        played on Friday. The shape is the index: you look where the game is.
      */}
      {bracket && (
        <div className="card p-3">
          <BracketView bracket={bracket} onOpenGame={(g) => setOpen(g.id)} />
        </div>
      )}

      {open && (
        <GameEditor
          id={open}
          editorial={results[open] ?? {}}
          played={playedFor(bracket?.rounds.flat().find((x) => x.id === open))}
          onScore={(() => {
            const g = bracket?.rounds.flat().find((x) => x.id === open);
            // Nothing to record until both sides are known — a bye or a round
            // still being played leaves one of them empty.
            if (!g?.top.team || !g?.bottom.team) return null;
            return (a: string, b: string) => saveScore(g, a, b);
          })()}
          labels={(() => {
            const g = bracket?.rounds.flat().find((x) => x.id === open);
            // "Top"/"Bottom" said nothing to anybody. A side with no team is
            // either a bye or a round that has not been played yet, and which
            // of those it is answers the question the heading raises.
            const side = (x: typeof g extends infer _ ? NonNullable<typeof g>["top"] : never) =>
              x.team ?? (x.bye ? "Bye" : "TBD");
            return [
              g ? side(g.top) : "TBD",
              g ? side(g.bottom) : "TBD",
            ] as [string, string];
          })()}
          onClose={() => setOpen(null)}
          onSave={(e) => {
            const next = { ...results };
            if (Object.keys(e).length) next[open] = e;
            else delete next[open];
            onResults(next);
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}

function GameEditor({
  id,
  editorial,
  labels,
  played,
  onClose,
  onSave,
  onScore,
}: {
  id: string;
  editorial: ClassState["results"][string];
  labels: [string, string];
  /** The stored playoff game for this pair, if one exists yet. */
  played: Game | null;
  onClose: () => void;
  onSave: (e: ClassState["results"][string]) => void;
  /**
   * Writes the score to the games table. Separate from `onSave` because it
   * is a different kind of thing in a different place: the editorial fields
   * live in the bracket document and wait for Save, while a result is a game
   * like any other and counts toward the ratings the moment it lands.
   */
  onScore: ((s1: string, s2: string) => Promise<void>) | null;
}) {
  const [form, setForm] = useState({
    date: editorial.date ?? "",
    time: editorial.time ?? "",
    location: editorial.location ?? "",
    note: editorial.note ?? "",
    home: editorial.home ?? "",
  });
  const [s1, setS1] = useState(played?.s1 == null ? "" : String(played.s1));
  const [s2, setS2] = useState(played?.s2 == null ? "" : String(played.s2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function saveScore() {
    if (!onScore) return;
    setBusy(true);
    setErr(null);
    try {
      await onScore(s1, s2);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the score.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgb(0 0 0 / 0.55)" }}
      onClick={onClose}
    >
      <div className="card w-full max-w-md space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold tracking-tight">
          {labels[0]} v {labels[1]}
        </h3>
        {onScore ? (
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: "rgb(var(--border-strong))" }}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "rgb(var(--text-faint))" }}>
                Result
              </span>
              <span className="text-[11px]" style={{ color: "rgb(var(--text-faint))" }}>
                saves on its own
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {labels[0]}
              </span>
              <input
                className="input !w-16 !py-1 text-center !text-[13px] tnum"
                inputMode="numeric"
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                aria-label={`${labels[0]} score`}
              />
              <span className="text-[11px]" style={{ color: "rgb(var(--text-faint))" }}>v</span>
              <input
                className="input !w-16 !py-1 text-center !text-[13px] tnum"
                inputMode="numeric"
                value={s2}
                onChange={(e) => setS2(e.target.value)}
                aria-label={`${labels[1]} score`}
              />
              <span className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold">
                {labels[1]}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button className="btn btn-primary !py-1.5 !text-xs"
                onClick={saveScore} disabled={busy}>
                {busy ? "Saving…" : saved ? "Saved" : played ? "Update result" : "Save result"}
              </button>
              {(s1 !== "" || s2 !== "") && (
                <button className="btn !py-1.5 !text-xs"
                  disabled={busy}
                  onClick={() => { setS1(""); setS2(""); }}>
                  Clear
                </button>
              )}
              <span className="text-[11px] leading-snug" style={{ color: "rgb(var(--text-faint))" }}>
                Both or neither — a half-entered game counts for nobody.
              </span>
            </div>

            {err && (
              <p className="mt-2 text-[12px] font-semibold" style={{ color: "rgb(var(--bad))" }}>
                {err}
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
              A result goes straight to the games table, so the winner advances
              here at once and the rating counts it at the next publish. The
              fields below are the bracket&rsquo;s own and wait for Save.
            </p>
          </div>
        ) : (
          <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
            Both teams have to be known before a result can be entered — play
            the round above first.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["date", "Date", "e.g. Fri, Nov 13"],
              ["time", "Time", "e.g. 7:00 PM"],
            ] as const
          ).map(([k, label, ph]) => (
            <label key={k} className="block">
              <span className="label">{label}</span>
              <input
                className="input"
                value={form[k]}
                placeholder={ph}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
        </div>

        <label className="block">
          <span className="label">Location</span>
          <input
            className="input"
            value={form.location}
            placeholder="e.g. Saraland Spartan Stadium"
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="label">Home team</span>
          <select
            className="input"
            value={form.home}
            onChange={(e) => setForm({ ...form, home: e.target.value })}
          >
            <option value="">Neither / not set</option>
            <option value="top">{labels[0]}</option>
            <option value="bottom">{labels[1]}</option>
          </select>
        </label>

        <label className="block">
          <span className="label">Note</span>
          <textarea
            className="input min-h-[70px]"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </label>

        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={() => {
              const e: ClassState["results"][string] = {};
              if (form.date.trim()) e.date = form.date.trim();
              if (form.time.trim()) e.time = form.time.trim();
              if (form.location.trim()) e.location = form.location.trim();
              if (form.note.trim()) e.note = form.note.trim();
              if (form.home === "top" || form.home === "bottom") e.home = form.home;
              onSave(e);
            }}
          >
            Apply
          </button>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <span className="ml-auto self-center text-[11px]" style={{ color: "rgb(var(--text-faint))" }}>
            {id}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- projections tab */

function Projections({
  bracket,
  picks,
  published,
  onPick,
  onClear,
  onFollowIndex,
}: {
  bracket: ResolvedBracket | null;
  picks: Record<string, "top" | "bottom">;
  published: boolean;
  onPick: (id: string, side: "top" | "bottom") => void;
  onClear: () => void;
  /** Fills every undecided game from the Index, as a starting point. */
  onFollowIndex: () => void;
}) {
  if (!bracket) {
    return (
      <div className="card px-4 py-14 text-center text-sm" style={{ color: "rgb(var(--text-faint))" }}>
        Lay out a bracket first.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
          Click a team to advance it; click it again to undo.{" "}
          <strong>Follow the Index</strong> fills every undecided game with the
          higher-rated side, which is a starting point rather than an opinion —
          change the ones you disagree with. A game with a real result is locked
          to that result and cannot be projected away from it.{" "}
          {published ? (
            <strong style={{ color: "rgb(var(--warn))" }}>
              Projections are public.
            </strong>
          ) : (
            <>Projections are private until switched on under Settings.</>
          )}
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            className="btn btn-primary !py-1.5 !text-xs"
            title="Pick the higher-rated side in every game that has not been played, round by round. Change whichever ones you disagree with afterwards."
            onClick={onFollowIndex}
          >
            Follow the Index
          </button>
          <button className="btn !py-1.5 !text-xs" onClick={onClear}>
            Clear all ({Object.keys(picks).length})
          </button>
        </div>
      </div>
      <div className="card p-4">
        <BracketView bracket={bracket} onPick={onPick} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- embed tab */

/**
 * The iframe snippets, one per classification.
 *
 * Built here rather than written down anywhere, so the addresses cannot
 * drift from the routes that serve them. The height is a starting point: the
 * embed reports its real height to the parent window, and the snippet's last
 * four lines listen for it, so a bracket that grows a round does not get
 * clipped on somebody else's page.
 */
function Embed({ cls, published }: { cls: Classification; published: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [withScript, setWithScript] = useState(true);
  const [openProjected, setOpenProjected] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  /**
   * Everything after the `?`, built from the options rather than written out,
   * so a second option cannot produce a second `?`.
   */
  const query = () => {
    const q = new URLSearchParams();
    if (theme === "dark") q.set("theme", "dark");
    if (openProjected && published) q.set("projected", "1");
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  const snippet = (c: Classification) => {
    const src = `${origin}/embed/bracket/${encodeURIComponent(c)}${query()}`;
    const iframe =
      `<iframe src="${src}"\n` +
      `        id="alpreps-${c.toLowerCase()}"\n` +
      `        style="width:100%;border:0;height:900px"\n` +
      `        loading="lazy" title="ALPreps ${c} bracket"></iframe>`;
    if (!withScript) return iframe;
    return (
      `${iframe}\n` +
      `<script>\n` +
      `window.addEventListener('message', function (e) {\n` +
      `  if (e.data && e.data.type === 'alpreps:height')\n` +
      `    document.getElementById('alpreps-${c.toLowerCase()}').style.height = e.data.height + 'px';\n` +
      `});\n` +
      `</script>`
    );
  };

  async function copy(c: Classification) {
    try {
      await navigator.clipboard.writeText(snippet(c));
      setCopied(c);
      setTimeout(() => setCopied((x) => (x === c ? null : x)), 1800);
    } catch {
      setCopied("!");
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">
          Put a bracket on another site
        </h2>
        <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
          Paste one of these into a WordPress <strong>Custom HTML</strong>{" "}
          block. Each shows one classification and updates itself whenever you
          publish here — there is nothing to paste again next week. Switching
          Bracketology off under Site takes the embeds down with it.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12.5px]">
            <span style={{ color: "rgb(var(--text-muted))" }}>Theme</span>
            <select
              className="input !w-auto !py-1 !text-xs"
              value={theme}
              onChange={(e) => setTheme(e.target.value as "light" | "dark")}
            >
              <option value="light">Light — for a light page</option>
              <option value="dark">Dark — for a dark page</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--brand))]"
              checked={withScript}
              onChange={(e) => setWithScript(e.target.checked)}
            />
            Include the four lines that size the frame to the bracket
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--brand))]"
              checked={openProjected}
              disabled={!published}
              onChange={(e) => setOpenProjected(e.target.checked)}
            />
            Open on the projected bracket rather than on what has been played
          </label>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
          {published ? (
            <>
              The embed carries its own{" "}
              <strong>Show projected results</strong> switch, so a reader can
              see it either way whichever one it opens on.
            </>
          ) : (
            <span style={{ color: "rgb(var(--warn))" }}>
              Projections are private, so the embed shows only what has been
              played and offers no switch. Publish them under Settings to put
              them on the embed too.
            </span>
          )}
        </p>
        {!withScript && (
          <p className="text-xs" style={{ color: "rgb(var(--warn))" }}>
            Without it the frame stays 900px tall and a taller bracket scrolls
            inside it. Use this if your page builder strips script tags.
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {CLS_FILTER_ORDER.map((c) => (
          <div key={c} className="card flex items-center gap-3 p-3">
            <span className={`chip cls-${c} shrink-0`}>{c}</span>
            <code
              className="min-w-0 flex-1 truncate text-[11px]"
              style={{ color: "rgb(var(--text-muted))" }}
            >
              /embed/bracket/{c}
              {query()}
            </code>
            <a
              href={`/embed/bracket/${encodeURIComponent(c)}${query()}`}
              target="_blank"
              rel="noreferrer"
              className="btn shrink-0 !px-2 !py-1 !text-[11px]"
            >
              Preview
            </a>
            <button
              className={`btn shrink-0 !px-2 !py-1 !text-[11px] ${c === cls ? "btn-primary" : ""}`}
              onClick={() => copy(c)}
            >
              {copied === c ? "Copied" : "Copy"}
            </button>
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "rgb(var(--text-faint))" }}>
          What {cls} looks like
        </div>
        <pre
          className="table-scroll scroll-thin rounded-lg p-3 text-[11px] leading-relaxed"
          style={{ background: "rgb(var(--surface-2))", color: "rgb(var(--text-muted))" }}
        >
{snippet(cls)}
        </pre>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- settings tab */

function Settings({
  state,
  setState,
}: {
  state: BracketState;
  setState: (fn: (s: BracketState) => BracketState) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">Site</h2>

        <label className="block">
          <span className="label">Season</span>
          <input
            className="input"
            value={state.season}
            onChange={(e) => setState((s) => ({ ...s, season: e.target.value }))}
          />
        </label>

        <label className="block">
          <span className="label">Notes &amp; tiebreakers</span>
          <textarea
            className="input min-h-[110px] !text-[13px]"
            value={state.newsNote}
            onChange={(e) => setState((s) => ({ ...s, newsNote: e.target.value }))}
          />
        </label>

        <div
          className="rounded-lg border px-3 py-3"
          style={{
            borderColor: state.showProjections
              ? "rgb(var(--warn) / 0.45)"
              : "rgb(var(--border))",
            background: state.showProjections ? "rgb(var(--warn-soft))" : "transparent",
          }}
        >
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
              checked={state.showProjections}
              onChange={(e) =>
                setState((s) => ({ ...s, showProjections: e.target.checked }))
              }
            />
            <span>
              <span className="block text-[13px] font-semibold">
                Show projections to readers
              </span>
              <span
                className="block text-xs leading-relaxed"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                Off means the toggle does not appear on the public page at all,
                so a projected bracket can be built through the week and
                published when it is ready.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="card space-y-3 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider">About page</h2>

        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--brand))]"
            checked={state.aboutBanner.enabled}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                aboutBanner: { ...s.aboutBanner, enabled: e.target.checked },
              }))
            }
          />
          Show the banner linking to it
        </label>

        <label className="block">
          <span className="label">Banner text</span>
          <input
            className="input"
            value={state.aboutBanner.text}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                aboutBanner: { ...s.aboutBanner, text: e.target.value },
              }))
            }
          />
        </label>

        <label className="block">
          <span className="label">Explainer (HTML)</span>
          <textarea
            className="input min-h-[240px] font-mono !text-[12px]"
            value={state.aboutHtml}
            onChange={(e) => setState((s) => ({ ...s, aboutHtml: e.target.value }))}
          />
        </label>

        {/* Written here because the explainer is authored by hand. Class names
            that live only in a CSS file are class names nobody can use. */}
        <div
          className="rounded-lg border px-3 py-2.5 text-[11.5px] leading-relaxed"
          style={{
            borderColor: "rgb(var(--border))",
            color: "rgb(var(--text-muted))",
          }}
        >
          <span className="font-semibold" style={{ color: "rgb(var(--text))" }}>
            Colouring text.
          </span>{" "}
          Wrap it in a span with one of these, and it will stay readable when a
          reader switches between light and dark:{" "}
          {PROSE_COLOURS.map((c, i) => (
            <span key={c}>
              {i > 0 && ", "}
              <code
                className="rounded px-1 font-mono text-[11px]"
                style={{ background: "rgb(var(--surface-3))" }}
              >
                {c}
              </code>
            </span>
          ))}
          . So{" "}
          <code
            className="rounded px-1 font-mono text-[11px]"
            style={{ background: "rgb(var(--surface-3))" }}
          >
            &lt;span class=&quot;c-brand&quot;&gt;Thompson&lt;/span&gt;
          </code>
          . For an exact shade instead, use{" "}
          <code
            className="rounded px-1 font-mono text-[11px]"
            style={{ background: "rgb(var(--surface-3))" }}
          >
            style=&quot;color:#e01b1b&quot;
          </code>{" "}
          &mdash; that one is the same colour in both themes, so check it
          against the dark background before you publish. Headings, bold,
          italic, lists and links all work as ordinary HTML; anything else is
          stripped when the page renders.
        </div>
      </div>
    </div>
  );
}
