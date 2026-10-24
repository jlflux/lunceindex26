"use client";

import { useState } from "react";
import BracketView from "./BracketView";
import type { ResolvedBracket } from "@/lib/bracket";

/**
 * The embed's one control: as played, or with the projections applied.
 *
 * The checkbox only exists when there is a projected bracket to show, and the
 * page only sends one once projections have been published under Settings —
 * so an unpublished bracketology cannot leak out through somebody else's
 * page, and an embed with nothing to toggle stays as bare as it was.
 *
 * The frame reports its own height on every resize, so switching views
 * resizes the host's iframe with it.
 */
export default function EmbedBracket({
  bracket,
  projectedBracket,
  initialProjected = false,
}: {
  bracket: ResolvedBracket;
  /** Null when projections are unpublished — then there is no toggle. */
  projectedBracket: ResolvedBracket | null;
  initialProjected?: boolean;
}) {
  const [projected, setProjected] = useState(
    initialProjected && Boolean(projectedBracket),
  );
  const shown = projected && projectedBracket ? projectedBracket : bracket;

  return (
    <>
      {projectedBracket && (
        <label className="mb-2 flex cursor-pointer items-center justify-end gap-2 text-[11px]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[rgb(var(--brand))]"
            checked={projected}
            onChange={(e) => setProjected(e.target.checked)}
          />
          <span style={{ color: "rgb(var(--text-muted))" }}>
            Show projected results
          </span>
        </label>
      )}
      {/* Remounted on the switch: the two brackets are different objects and
          the open match-up panel belongs to whichever one drew it. */}
      <BracketView
        key={String(projected)}
        bracket={shown}
        linkTeams={false}
      />
    </>
  );
}
