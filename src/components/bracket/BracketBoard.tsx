"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import BracketView from "./BracketView";
import RegionPicture from "./RegionPicture";
import type { ResolvedBracket, SeededTeam } from "@/lib/bracket";
import { CLS_FILTER_ORDER, type Classification } from "@/lib/types";

export type BoardClass = {
  classification: Classification;
  /** As played. */
  bracket: ResolvedBracket | null;
  /**
   * The same bracket with projections applied. Resolved on the server and
   * sent alongside, because the projection rules — a real result locks a
   * game, and nothing shows at all unless projections are published — belong
   * with the resolver rather than being re-derived in the browser.
   */
  bracketProjected: ResolvedBracket | null;
  regions: { region: number; teams: SeededTeam[]; note?: string }[];
};

/**
 * The page's chrome: pick a classification, pick a tab.
 *
 * Both brackets and standings are rendered from the same resolved data, so the
 * seeds under the Brackets tab and the order under Region Standings cannot
 * disagree — they are the same array read twice.
 */
export default function BracketBoard({
  classes,
  showProjections,
}: {
  classes: BoardClass[];
  showProjections: boolean;
}) {
  const available = useMemo(
    () =>
      CLS_FILTER_ORDER.filter((c) =>
        classes.some((x) => x.classification === c),
      ),
    [classes],
  );
  const [cls, setCls] = useState<Classification>(available[0] ?? "6A");
  const [tab, setTab] = useState<"bracket" | "regions">("bracket");
  const [projected, setProjected] = useState(false);

  const block =
    classes.find((c) => c.classification === cls) ?? classes[0];
  if (!block) return null;

  return (
    <div className="space-y-4">
      <div
        className="flex flex-col gap-3 rounded-xl border px-3 py-3 lg:flex-row lg:items-center"
        style={{
          background: "rgb(var(--surface))",
          borderColor: "rgb(var(--border))",
        }}
      >
        <div className="flex items-center gap-1.5">
          {(
            [
              ["bracket", "Bracket"],
              ["regions", "Region standings"],
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

        <div className="table-scroll scroll-thin -mx-1 px-1">
          <div className="flex items-center gap-1.5">
            <span
              className="mr-1 shrink-0 text-[10.5px] font-bold uppercase tracking-wider"
              style={{ color: "rgb(var(--text-faint))" }}
            >
              Class
            </span>
            {available.map((c) => (
              <button
                key={c}
                onClick={() => setCls(c)}
                className={`pill ${cls === c ? "pill-active" : ""}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {showProjections && tab === "bracket" && (
          <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--brand))]"
              checked={projected}
              onChange={(e) => setProjected(e.target.checked)}
            />
            <span style={{ color: "rgb(var(--text-muted))" }}>
              Show projected results
            </span>
          </label>
        )}
      </div>

      {tab === "bracket" ? (
        block.bracket ? (
          <div className="card p-4">
            <BracketView
              key={`${cls}:${projected}`}
              bracket={
                projected && block.bracketProjected
                  ? block.bracketProjected
                  : block.bracket
              }
            />
          </div>
        ) : (
          <div
            className="card px-4 py-14 text-center text-sm"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            No bracket has been laid out for Class {cls} yet.
          </div>
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {block.regions.map((r) => (
              <RegionPicture
                key={r.region}
                region={r.region}
                teams={r.teams}
                note={r.note}
              />
            ))}
          </div>
          <p
            className="text-xs leading-relaxed"
            style={{ color: "rgb(var(--text-faint))" }}
          >
            The status is a confidence call about <em>where</em> a team
            finishes, not how good it is &mdash; a side certain to finish last
            is &ldquo;High&rdquo; for the same reason as one certain to finish
            first, and &ldquo;Clinched&rdquo; means that exact place is locked
            rather than that the team is through. The percentages on the{" "}
            <Link href="/odds" className="underline">
              Playoff Odds
            </Link>{" "}
            board are a separate, purely arithmetic thing.
          </p>
        </>
      )}

      {tab === "bracket" && block.bracket?.unresolved.length ? (
        <p className="text-xs" style={{ color: "rgb(var(--warn))" }}>
          {block.bracket.unresolved.join(", ")} names a place no team holds —
          the region is smaller than the bracket expects.
        </p>
      ) : null}
    </div>
  );
}
