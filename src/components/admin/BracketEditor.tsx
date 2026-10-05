"use client";

import { useMemo, useState } from "react";
import BracketView from "@/components/bracket/BracketView";
import {
  applyPinnedOrder,
  assignPlaces,
  defaultSlots,
  regionKey,
  resolveBracket,
  type ResolvedBracket,
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

type Tab = "seeding" | "bracket" | "projections" | "settings";

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
}: {
  initial: BracketState;
  classes: EditorClass[];
  /** Playoff results only — all `resolveBracket` reads from the schedule. */
  playoffGames?: Game[];
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
  const liveBracket = useMemo(() => {
    const seeded = new Map(
      liveRegions.map((r) => [regionKey(cls, r.region), r.shown]),
    );
    return resolveBracket(state, cls, seeded, playoffGames, {
      projected: true,
    });
  }, [liveRegions, state, cls, playoffGames]);

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

        {tab !== "settings" && (
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
          means that exact place is locked, not that they are in the bracket; a{" "}
          <strong style={{ color: "rgb(var(--odds-hi))" }}>locked</strong> chip
          appears once the arithmetic proves it. Everything is Medium until you
          say otherwise, except a team that is mathematically out. The
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
        />
      )}

      {tab === "projections" && block && (
        <Projections
          bracket={liveBracket}
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
        {list.map((t, i) => (
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
            {!t.ineligible && t.place_locked && stored?.status?.[t.name] !== "clinched" && (
              <button
                className="shrink-0 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
                style={{
                  background: "rgb(var(--odds-hi) / 0.18)",
                  color: "rgb(var(--odds-hi))",
                }}
                title="This finishing place is arithmetically settled — nobody left can pass them and they can pass nobody. Click to mark it Clinched."
                onClick={() =>
                  onChange((r) => ({
                    ...r,
                    status: { ...(r.status ?? {}), [t.name]: "clinched" },
                  }))
                }
              >
                locked
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
        ))}
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
}: {
  cls: Classification;
  regions: EditorRegion[];
  slots: Slot[];
  onSlots: (s: Slot[]) => void;
  bracket: ResolvedBracket | null;
  results: ClassState["results"];
  onResults: (r: ClassState["results"]) => void;
}) {
  const [drag, setDrag] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);

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
        <p className="text-xs leading-relaxed" style={{ color: "rgb(var(--text-faint))" }}>
          Drag a slot onto another to swap them — including onto a bye, which
          moves the bye. The bracket holds places, not teams, so a seed keeps
          pointing at whoever holds that place as the season moves. Click a
          match-up below to set its date, time, location and home side.
        </p>
      )}

      {slots.length > 0 && (
      <div className="card table-scroll p-3">
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

      {bracket && (
        <div className="card p-3">
          <div
            className="mb-2 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            Match-ups — {cls}
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
            {bracket.rounds.flat().map((g) => {
              const e = results[g.id] ?? {};
              const filled = Boolean(e.date || e.time || e.location || e.note);
              return (
                <button
                  key={g.id}
                  onClick={() => setOpen(g.id)}
                  className="rounded-md border px-2 py-1.5 text-left"
                  style={{
                    borderColor: filled ? "rgb(var(--brand) / 0.5)" : "rgb(var(--border))",
                  }}
                >
                  <div className="text-[9.5px] font-bold uppercase" style={{ color: "rgb(var(--text-faint))" }}>
                    {bracket.roundNames[g.round - 1]} · {g.id}
                  </div>
                  <div className="truncate text-[12px] font-semibold">
                    {g.top.team ?? (g.top.bye ? "Bye" : "TBD")} v{" "}
                    {g.bottom.team ?? (g.bottom.bye ? "Bye" : "TBD")}
                  </div>
                  {filled && (
                    <div className="truncate text-[11px]" style={{ color: "rgb(var(--text-muted))" }}>
                      {[e.date, e.time, e.location].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <GameEditor
          id={open}
          editorial={results[open] ?? {}}
          labels={(() => {
            const g = bracket?.rounds.flat().find((x) => x.id === open);
            return [
              g?.top.team ?? "Top",
              g?.bottom.team ?? "Bottom",
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
  onClose,
  onSave,
}: {
  id: string;
  editorial: ClassState["results"][string];
  labels: [string, string];
  onClose: () => void;
  onSave: (e: ClassState["results"][string]) => void;
}) {
  const [form, setForm] = useState({
    date: editorial.date ?? "",
    time: editorial.time ?? "",
    location: editorial.location ?? "",
    note: editorial.note ?? "",
    home: editorial.home ?? "",
  });

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
        <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
          Scores are not entered here — a playoff result is a game like any
          other and belongs in Admin → Games, where it also counts toward the
          ratings.
        </p>

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
}: {
  bracket: ResolvedBracket | null;
  picks: Record<string, "top" | "bottom">;
  published: boolean;
  onPick: (id: string, side: "top" | "bottom") => void;
  onClear: () => void;
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
          Click a team to advance it; click it again to undo. A game with a real
          result is locked to that result and cannot be projected away from it.{" "}
          {published ? (
            <strong style={{ color: "rgb(var(--warn))" }}>
              Projections are public.
            </strong>
          ) : (
            <>Projections are private until switched on under Settings.</>
          )}
        </p>
        <button className="btn ml-auto !py-1.5 !text-xs" onClick={onClear}>
          Clear all ({Object.keys(picks).length})
        </button>
      </div>
      <div className="card p-4">
        <BracketView bracket={bracket} onPick={onPick} />
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
