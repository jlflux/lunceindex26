"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ResolvedBracket, ResolvedGame, ResolvedSlot } from "@/lib/bracket";

/**
 * The bracket itself.
 *
 * Flex columns of cards with an SVG laid behind them for the connector lines,
 * and the whole thing scaled down to whatever width there is. Two parts of
 * that can only be done after layout, and both are why this is a client
 * component:
 *
 *   - **Connectors** are drawn between measured card positions. They are
 *     measured in natural, pre-scale coordinates, because the SVG is inside
 *     the element being scaled and would otherwise have the transform applied
 *     twice.
 *   - **Scale to fit** resets the transform, measures the natural width,
 *     scales down (never up), then sets the wrapper's height by hand — a CSS
 *     transform does not affect layout, so without that last step the page
 *     keeps a full-size hole where a shrunken bracket sits.
 *
 * Both re-run on resize, and on the fonts finishing loading: a card measured
 * before the webfont swaps is a card measured at the wrong height, and the
 * connectors land in the gaps between the boxes.
 */
export default function BracketView({
  bracket,
  onPick,
}: {
  bracket: ResolvedBracket;
  /** Set in the admin, to project a winner. Absent on the public page. */
  onPick?: (gameId: string, side: "top" | "bottom") => void;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<ResolvedGame | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const el = board.current;
    const wrap = inner.current;
    const out = outer.current;
    if (!el || !wrap || !out) return;

    // Natural coordinates: drop the transform before reading anything.
    wrap.style.transform = "none";

    const paths: string[] = [];
    for (const g of el.querySelectorAll<HTMLElement>("[data-game]")) {
      for (const childId of (g.dataset.from ?? "").split(",").filter(Boolean)) {
        const child = el.querySelector<HTMLElement>(`[data-game="${childId}"]`);
        if (!child) continue;
        const x1 = child.offsetLeft + child.offsetWidth;
        const y1 = child.offsetTop + child.offsetHeight / 2;
        const x2 = g.offsetLeft;
        const y2 = g.offsetTop + g.offsetHeight / 2;
        const mid = (x1 + x2) / 2;
        paths.push(`M${x1} ${y1} H${mid} V${y2} H${x2}`);
      }
    }
    setLines(paths);
    setBox({ w: el.scrollWidth, h: el.scrollHeight });

    const natural = wrap.offsetWidth;
    const height = wrap.offsetHeight;
    if (!natural) return;
    const scale = Math.min(1, out.clientWidth / natural);
    wrap.style.transform = `scale(${scale})`;
    out.style.height = `${Math.ceil(height * scale)}px`;
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    return () => ro.disconnect();
  }, [measure, bracket]);

  useEffect(() => {
    // A card measured before the webfont swaps is measured at the wrong
    // height, and every connector lands in a gap.
    document.fonts?.ready.then(measure).catch(() => {});
  }, [measure]);

  return (
    <>
      <div ref={outer} className="relative w-full overflow-hidden">
        <div ref={inner} className="inline-block origin-top-left">
          <div className="mb-2.5 flex" style={{ gap: "var(--bkt-gap)" }}>
            {bracket.roundNames.map((n) => (
              <div
                key={n}
                className="shrink-0 text-center text-[11px] font-bold uppercase tracking-wider"
                style={{ width: "var(--bkt-col)", color: "rgb(var(--text-faint))" }}
              >
                {n}
              </div>
            ))}
          </div>

          <div
            ref={board}
            className="relative flex"
            style={{ gap: "var(--bkt-gap)" }}
          >
            <svg
              className="pointer-events-none absolute left-0 top-0"
              width={box.w}
              height={box.h}
              aria-hidden
            >
              {lines.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  strokeWidth={1.4}
                  stroke="rgb(var(--border-strong))"
                />
              ))}
            </svg>

            {bracket.rounds.map((round, ri) => (
              <div
                key={ri}
                className={`flex shrink-0 flex-col ${
                  ri === 0 ? "justify-start" : "justify-around"
                }`}
                style={{ width: "var(--bkt-col)" }}
              >
                {round.map((g) => (
                  <Game
                    key={g.id}
                    game={g}
                    first={ri === 0}
                    onOpen={() => setOpen(g)}
                    onPick={onPick}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {open && <GameModal game={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Game({
  game,
  first,
  onOpen,
  onPick,
}: {
  game: ResolvedGame;
  first: boolean;
  onOpen: () => void;
  onPick?: (gameId: string, side: "top" | "bottom") => void;
}) {
  // The first round's fixed margins set the vertical rhythm; every later
  // column uses space-around, which lands its centres on the same grid.
  return (
    <div
      className="relative z-[1]"
      style={first ? { margin: "8px 0" } : undefined}
      data-game={game.id}
      data-from={childIds(game)}
    >
      <div
        className="overflow-hidden rounded-lg border transition-colors"
        style={{
          background: "rgb(var(--surface))",
          borderColor: game.locked
            ? "rgb(var(--good) / 0.45)"
            : "rgb(var(--border))",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <Slot slot={game.top} onOpen={onOpen} onPick={onPick && (() => onPick(game.id, "top"))} />
        <Slot
          slot={game.bottom}
          divider
          onOpen={onOpen}
          onPick={onPick && (() => onPick(game.id, "bottom"))}
        />
      </div>
    </div>
  );
}

/** The two games that feed this one, derived from its positional id. */
function childIds(g: ResolvedGame): string {
  const m = /^r(\d+)g(\d+)$/.exec(g.id);
  if (!m) return "";
  const round = Number(m[1]);
  const index = Number(m[2]);
  if (round <= 1) return "";
  return `r${round - 1}g${index * 2},r${round - 1}g${index * 2 + 1}`;
}

function Slot({
  slot,
  divider,
  onOpen,
  onPick,
}: {
  slot: ResolvedSlot;
  divider?: boolean;
  onOpen: () => void;
  onPick?: () => void;
}) {
  return (
    <div
      className="flex min-h-[34px] cursor-pointer items-stretch"
      onClick={onPick && slot.team ? onPick : onOpen}
      style={{
        borderTop: divider ? "1px solid rgb(var(--border))" : undefined,
        background: slot.bye
          ? "repeating-linear-gradient(45deg, transparent, transparent 5px, rgb(var(--surface-2)) 5px, rgb(var(--surface-2)) 6px)"
          : undefined,
        opacity: slot.loser ? 0.62 : 1,
      }}
    >
      <span
        className="grid w-[38px] shrink-0 place-items-center border-r text-[10px] font-extrabold tnum"
        style={{
          borderColor: "rgb(var(--border))",
          background: "rgb(var(--surface-2))",
          color: "rgb(var(--text-faint))",
        }}
      >
        {slot.seed ?? ""}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1">
        {slot.team ? (
          <>
            {/*
              In pick mode the name is not a link.

              It used to be one unconditionally, with `stopPropagation` to keep
              a click off the row's handler — right for a reader, and exactly
              wrong for the editor, where the instruction is "click a team to
              advance it" and the team name is the obvious thing to click.
              Doing that navigated to the team page and advanced nothing.
            */}
            {onPick ? (
              <span
                title={`${slot.team}${slot.record ? ` (${slot.record})` : ""}`}
                className="truncate text-[13px] font-semibold"
                style={{
                  color: slot.winner ? "rgb(var(--brand))" : "rgb(var(--text))",
                  fontStyle: slot.projected ? "italic" : undefined,
                }}
              >
                {slot.team}
              </span>
            ) : (
              <Link
                href={`/team/${slot.slug}`}
                onClick={(e) => e.stopPropagation()}
                // The column is a fixed width and some school names are long,
                // so the full one has to be reachable without opening the game.
                title={`${slot.team}${slot.record ? ` (${slot.record})` : ""}`}
                className="truncate text-[13px] font-semibold hover:underline"
                style={{
                  color: slot.winner ? "rgb(var(--brand))" : "rgb(var(--text))",
                  fontStyle: slot.projected ? "italic" : undefined,
                }}
              >
                {slot.team}
              </Link>
            )}
            {slot.home && (
              <span
                className="shrink-0 rounded px-1 text-[9px] font-extrabold leading-[1.5]"
                style={{
                  background: "rgb(var(--text-faint))",
                  color: "rgb(var(--surface))",
                }}
                title="Home team"
              >
                H
              </span>
            )}
            {slot.projected && (
              <span
                className="shrink-0 rounded px-1 py-px text-[9px] font-extrabold uppercase"
                style={{
                  background: "rgb(var(--brand))",
                  color: "rgb(var(--primary-fg))",
                }}
                title="Projected, not played"
              >
                proj
              </span>
            )}
          </>
        ) : (
          <span
            className="truncate text-[12px] italic"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            {slot.bye ? "Bye" : slot.seed ? "—" : "TBD"}
          </span>
        )}
      </span>

      <span
        className="grid w-[34px] shrink-0 place-items-center border-l text-[13px] font-extrabold tnum"
        style={{
          borderColor: "rgb(var(--border))",
          background: "rgb(var(--surface-2))",
          color: slot.winner ? "rgb(var(--brand))" : "rgb(var(--text-muted))",
        }}
      >
        {slot.score ?? ""}
      </span>
    </div>
  );
}

function GameModal({
  game,
  onClose,
}: {
  game: ResolvedGame;
  onClose: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgb(0 0 0 / 0.55)" }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold tracking-tight">Match-up</h3>
          <button
            className="btn !px-2 !py-1 !text-xs"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 text-[12px]">
          {(
            [
              ["Date", game.date],
              ["Time", game.time],
              ["Location", game.location],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <div
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "rgb(var(--text-faint))" }}
              >
                {k}
              </div>
              <div>{v || "TBD"}</div>
            </div>
          ))}
        </div>

        {game.note && (
          <p
            className="mb-3 text-[12.5px] leading-relaxed"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            {game.note}
          </p>
        )}

        {[game.top, game.bottom].map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border-t py-2 text-[13.5px]"
            style={{ borderColor: "rgb(var(--border))" }}
          >
            <span className="w-12 shrink-0 text-[10px] font-extrabold tnum" style={{ color: "rgb(var(--text-faint))" }}>
              {s.seed ?? ""}
            </span>
            <span
              className="flex-1 font-semibold"
              style={{ color: s.winner ? "rgb(var(--brand))" : undefined }}
            >
              {s.team ?? (s.bye ? "Bye" : "TBD")}
              {s.home && (
                <span style={{ color: "rgb(var(--text-faint))" }}> (H)</span>
              )}
            </span>
            <span className="text-[12px]" style={{ color: "rgb(var(--text-faint))" }}>
              {s.record ?? ""}
            </span>
            <span className="w-8 text-right font-extrabold tnum">
              {s.score ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
