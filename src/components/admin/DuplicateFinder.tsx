"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "./PublishButton";
import { weekLabel } from "@/lib/format";
import type { CoverageReport, TeamGap } from "@/lib/coverage";
import { redundantIds, type DuplicateGroup } from "@/lib/duplicates";
import type { Game } from "@/lib/types";

type Group = DuplicateGroup;

async function readJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const snippet = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(`Server returned ${res.status}: ${snippet.slice(0, 160)}`);
  }
}

/**
 * Everything that can be checked about the stored schedule without a human
 * reading four hundred rows.
 *
 * Two questions, and one fault answers both. A school matched to the wrong
 * name leaves a spare game on whoever it played and a hole in the schedule of
 * whoever it should have been — so the scan reports extra games and missing
 * ones side by side.
 */
export default function DuplicateFinder() {
  const [reversed, setReversed] = useState<Group[]>([]);
  const [repeated, setRepeated] = useState<Group[]>([]);
  const [collisions, setCollisions] = useState<Group[]>([]);
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [showByes, setShowByes] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "good" | "bad" | "warn";
    text: string;
  } | null>(null);

  // Runs on its own when the page opens. A check nobody remembers to press is
  // not a check — the Prattville mismatch sat in the board for three weeks.
  const scan = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/games/duplicates");
      const body = await readJson<{
        error?: string;
        totalGames: number;
        reversed: Group[];
        repeated: Group[];
        collisions: Group[];
        coverage: CoverageReport;
      }>(res);
      if (!res.ok) throw new Error(body.error ?? "Scan failed.");
      setReversed(body.reversed);
      setRepeated(body.repeated);
      setCollisions(body.collisions ?? []);
      setCoverage(body.coverage ?? null);
      setTotal(body.totalGames);
      setScanned(true);
      const missing =
        (body.coverage?.suspect.length ?? 0) + (body.coverage?.absent.length ?? 0);
      setMessage({
        tone:
          body.reversed.length || body.collisions?.length || missing
            ? "warn"
            : "good",
        text:
          `${body.totalGames} games · ${body.reversed.length} with the sides swapped · ` +
          `${body.collisions?.length ?? 0} school(s) with two games in a week · ` +
          `${missing} school(s) missing a week they should have played.`,
      });
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Scan failed.",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  async function remove(ids: number[]) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/games/duplicates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await readJson<{ error?: string; deleted: number }>(res);
      if (!res.ok) throw new Error(body.error ?? "Delete failed.");
      setMessage({
        tone: "good",
        text: `Deleted ${body.deleted} game(s). Publish from the dashboard to update the site.`,
      });
      await scan();
    } catch (e) {
      setMessage({
        tone: "bad",
        text: e instanceof Error ? e.message : "Delete failed.",
      });
      setBusy(false);
    }
  }

  const allRedundant = reversed.flatMap(redundantIds);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wider">
          Schedule check
        </h2>
        <button
          className="btn !py-1.5 !text-xs"
          onClick={() => scan()}
          disabled={busy}
        >
          {busy ? "Scanning…" : scanned ? "Re-scan" : "Scan the schedule"}
        </button>
        {reversed.length > 0 && (
          <button
            className="btn btn-primary !py-1.5 !text-xs"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  `Delete ${allRedundant.length} redundant game(s)? The copy carrying a score is kept, otherwise the earliest entry.`,
                )
              ) {
                remove(allRedundant);
              }
            }}
          >
            Remove {allRedundant.length} redundant
          </button>
        )}
      </div>

      <p className="text-xs" style={{ color: "rgb(var(--text-faint))" }}>
        Re-running an import cannot create duplicates — games are keyed on home,
        away, week and type, so a repeat import updates the same row. What does
        slip through is a school matched to the wrong name: it leaves an extra
        game on its opponent and an empty week on the school it should have
        been, which is what the two halves of this scan look for.
      </p>

      {message && <Banner tone={message.tone}>{message.text}</Banner>}

      {reversed.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">
            Same fixture, sides swapped ({reversed.length})
          </h3>
          <div className="mt-2 space-y-2">
            {reversed.map((g, i) => (
              <GroupRow key={i} group={g} onDelete={remove} busy={busy} />
            ))}
          </div>
        </div>
      )}

      {collisions.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">
            One school, two games in a week ({collisions.length})
          </h3>
          <p
            className="mt-1 text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            The opponents differ, so nothing else catches this. Usually one of
            the two opponents was matched to the wrong school — check which name
            the sheet actually carried before deleting either row.
          </p>
          <div className="mt-2 space-y-2">
            {collisions.map((g, i) => (
              <GroupRow key={i} group={g} onDelete={remove} busy={busy} />
            ))}
          </div>
        </div>
      )}

      {coverage && <Coverage report={coverage} show={showByes} onShow={setShowByes} />}

      {repeated.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold">
            Same pairing in more than one week ({repeated.length})
          </h3>
          <p
            className="mt-1 text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Usually a week mismatch between sources, but two schools genuinely
            can meet twice. Check before removing anything.
          </p>
          <div className="mt-2 space-y-2">
            {repeated.map((g, i) => (
              <GroupRow key={i} group={g} onDelete={remove} busy={busy} />
            ))}
          </div>
        </div>
      )}

      {scanned &&
        !reversed.length &&
        !repeated.length &&
        !collisions.length &&
        !coverage?.suspect.length &&
        !coverage?.absent.length && (
          <Banner tone="good">
            Nothing out of place across {total} games. Every school has a game
            in every week that finished importing.
          </Banner>
        )}
    </section>
  );
}

/**
 * The other half of the scan: schools with no game in a week that everyone
 * else played.
 *
 * An open week is normally a bye, so the weeks that are only half-loaded are
 * set aside first and a single open week is kept apart from several. Without
 * that this would report most of the state every time it ran.
 */
function Coverage({
  report,
  show,
  onShow,
}: {
  report: CoverageReport;
  show: boolean;
  onShow: (v: boolean) => void;
}) {
  if (!report.weeks.length) return null;

  return (
    <div className="card space-y-3 p-4">
      <div>
        <h3 className="text-sm font-bold">Weeks loaded</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {report.weeks.map((w) => (
            <span
              key={w.week}
              className="rounded-md px-2 py-1 text-[11px] tnum"
              title={
                w.complete
                  ? `${w.games} games, ${w.teams} schools`
                  : `${w.games} games, ${w.teams} schools — too few to judge an absence against, so this week is not used`
              }
              style={{
                background: "rgb(var(--surface-2))",
                color: w.complete
                  ? "rgb(var(--text-muted))"
                  : "rgb(var(--text-faint))",
                border: w.complete
                  ? "1px solid transparent"
                  : "1px dashed rgb(var(--border))",
              }}
            >
              <span className="font-bold">Wk {w.week}</span> · {w.teams}{" "}
              schools
              {!w.complete && " · partial"}
            </span>
          ))}
        </div>
        {report.thin.length > 0 && (
          <p
            className="mt-2 text-xs"
            style={{ color: "rgb(var(--text-muted))" }}
          >
            Week{report.thin.length === 1 ? "" : "s"}{" "}
            {report.thin.join(", ")} hold too few schools to judge anyone
            against and {report.thin.length === 1 ? "is" : "are"} left out of
            the check below. Week 0 is genuinely short every year; any other
            week showing as partial is one to re-import.
          </p>
        )}
      </div>

      {report.completeWeeks < 2 ? (
        <p className="text-xs" style={{ color: "rgb(var(--text-muted))" }}>
          Missing-week checking needs at least two fully loaded weeks to have
          anything to compare against.
        </p>
      ) : (
        <>
          {report.absent.length > 0 && (
            <div>
              <h3 className="text-sm font-bold" style={{ color: "rgb(var(--bad))" }}>
                No games at all ({report.absent.length})
              </h3>
              <p className="mt-1 text-[12px]">{report.absent.join(", ")}</p>
            </div>
          )}

          {report.suspect.length > 0 && (
            <div>
              <h3 className="text-sm font-bold">
                Missing two or more weeks ({report.suspect.length})
              </h3>
              <p
                className="mt-1 text-xs"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                Teams play ten games across eleven weeks, so one open week is a
                bye — two is usually a name that went to the wrong school.
              </p>
              <div className="mt-2 space-y-1">
                {report.suspect.map((g) => (
                  <GapRow key={g.team} gap={g} />
                ))}
              </div>
            </div>
          )}

          {report.byes.length > 0 && (
            <div>
              <button
                className="text-sm font-bold hover:underline"
                onClick={() => onShow(!show)}
              >
                One open week ({report.byes.length}) {show ? "▾" : "▸"}
              </button>
              {show && (
                <>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "rgb(var(--text-muted))" }}
                  >
                    Almost certainly byes. Listed so a genuinely missing game
                    can still be found.
                  </p>
                  <div className="mt-2 space-y-1">
                    {report.byes.map((g) => (
                      <GapRow key={g.team} gap={g} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GapRow({ gap }: { gap: TeamGap }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-3 py-1.5 text-[12px]"
      style={{ background: "rgb(var(--surface-2))" }}
    >
      <span className="font-semibold">{gap.team}</span>
      <span style={{ color: "rgb(var(--text-muted))" }}>
        no game in week{gap.missing.length === 1 ? "" : "s"}{" "}
        {gap.missing.join(", ")}
      </span>
      <span className="ml-auto tnum" style={{ color: "rgb(var(--text-faint))" }}>
        {gap.played} played
      </span>
    </div>
  );
}

function GroupRow({
  group,
  onDelete,
  busy,
}: {
  group: Group;
  onDelete: (ids: number[]) => void;
  busy: boolean;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "rgb(var(--surface-2))" }}
    >
      <div className="text-[12px] font-semibold">{group.label}</div>
      <div className="mt-1.5 space-y-1">
        {group.games.map((g) => (
          <div key={g.id} className="flex items-center gap-2 text-[12px]">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{g.t1}</span>
              <span style={{ color: "rgb(var(--text-faint))" }}> vs </span>
              <span className="font-semibold">{g.t2}</span>
              <span style={{ color: "rgb(var(--text-faint))" }}>
                {" · "}
                {weekLabel(g)}
                {g.s1 !== null && g.s2 !== null
                  ? ` · ${g.s1}–${g.s2}`
                  : " · no score"}
              </span>
            </span>
            <button
              className="btn !px-2 !py-0.5 !text-[11px]"
              style={{ color: "rgb(var(--bad))" }}
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete ${g.t1} vs ${g.t2} (${weekLabel(g)})?`)) {
                  onDelete([g.id as number]);
                }
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
